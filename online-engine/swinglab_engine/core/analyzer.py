from __future__ import annotations

from pathlib import Path
import json
import cv2

from ..config import settings
from ..storage.local import new_session_id, save_upload, session_dir
from .schemas import AnalysisResult, ViewType, ClubType, PhaseMark
from .video_io import read_video_meta, iter_sampled_frames, seek_frame
from .motion import build_motion_profile, normalize_profile
from .pose import PoseExtractor, add_velocity_features
from .phase_detector import DetectionContext, PhaseDetector
from .metrics import compute_metrics, generate_findings
from ..reporting.report_builder import build_html_report
from ..training.calibration import apply_calibration_to_phases, load_latest_model
from ..external.swingnet_runtime import run_swingnet, swingnet_status


class SwingAnalyzer:
    def __init__(self) -> None:
        self.detector = PhaseDetector()

    def _phase_marks_from_swingnet(self, swingnet_result) -> dict[str, PhaseMark]:
        out: dict[str, PhaseMark] = {}
        for phase, event in swingnet_result.phases.items():
            out[phase] = PhaseMark(
                time=float(event.time),
                frame=int(event.frame),
                confidence=float(event.confidence),
                source="golfdb_swingnet_v2",
                reason=f"GolfDB/SwingNet event={event.event}",
            )
        return out

    def _should_apply_calibration(self, phases: dict[str, PhaseMark], model: dict | None) -> tuple[bool, str]:
        """Avoid applying old v1.x bias calibration to SwingNet outputs.

        Bias models generated against the old heuristic detector can make a real
        SwingNet result worse. Only apply a calibration if its metadata says it
        was built for SwingNet, or if the detector source is not SwingNet.
        """
        if not model:
            return False, "no_model"
        source = next(iter(phases.values())).source if phases else "unknown"
        model_type = str(model.get("type") or "")
        if source.startswith("golfdb_swingnet") and "swingnet" not in model_type.lower():
            return False, "skipped_legacy_calibration_for_swingnet"
        return True, "ok"

    def analyze_video(
        self,
        video_path: str | Path,
        *,
        session_id: str | None = None,
        view: ViewType = "unknown",
        club: ClubType = "unknown",
        user_id: str | None = None,
        save_video: bool = True,
    ) -> AnalysisResult:
        settings.ensure_dirs()
        sid = session_id or new_session_id()
        input_path = Path(video_path)
        stored_path = save_upload(input_path, sid, input_path.suffix or ".mp4") if save_video else input_path
        meta = read_video_meta(stored_path)

        # Pass 1: motion over whole video; cheap and robust. This is also used
        # as a clip proposal for SwingNet, because GolfDB/SwingNet expects one
        # cut/cropped swing rather than a long video with preparation time.
        frame_list = list(iter_sampled_frames(stored_path, settings.frame_sample_fps, settings.max_analysis_width))
        motion = build_motion_profile(frame_list)
        motion_quality = float(normalize_profile(motion).mean()) if motion else 0.0

        # Pass 2: pose over sampled frames. This remains useful for report
        # metrics and as fallback if SwingNet is not installed yet.
        pose_samples = []
        pose_debug = {"available": False, "error": None}
        with PoseExtractor(min_visibility=settings.min_pose_visibility) as extractor:
            pose_debug["available"] = extractor.load_error is None
            pose_debug["error"] = extractor.load_error
            if extractor.load_error is None:
                for frame_idx, time_s, frame in iter_sampled_frames(stored_path, settings.pose_sample_fps, settings.max_analysis_width):
                    sample = extractor.process_frame(frame, frame_idx, time_s)
                    if sample is not None:
                        pose_samples.append(sample)
        add_velocity_features(pose_samples)

        # Fallback detector first. It gives a coarse active window and keeps the
        # backend usable even before optional PyTorch/SwingNet dependencies are installed.
        ctx = DetectionContext(meta=meta, motion_samples=motion, pose_samples=pose_samples, view=view, club=club)
        fallback_phases, detect_debug = self.detector.detect(ctx)
        active = detect_debug.get("active_window") or [0.0, meta.duration]
        clip_start = max(0.0, float(active[0]) - settings.swingnet_clip_margin_s)
        clip_end = min(meta.duration, float(active[1]) + settings.swingnet_clip_margin_s)

        # SwingNet/GolfDB specialised detector. If installed and sane, it becomes
        # the primary phase source. Otherwise we keep the fallback detector.
        swingnet_result = run_swingnet(stored_path, clip_start=clip_start, clip_end=clip_end)
        if swingnet_result.used and all(p in swingnet_result.phases for p in ["address", "takeaway", "top", "impact", "finish"]):
            phases = self._phase_marks_from_swingnet(swingnet_result)
            primary_source = "golfdb_swingnet_v2"
            active = [phases["address"].time, phases["finish"].time]
            detect_debug = {
                **detect_debug,
                "primary_source": primary_source,
                "fallback_detector_phases": {k: v.model_dump(mode="json") for k, v in fallback_phases.items()},
                "swingnet": swingnet_result.to_json(),
            }
        else:
            phases = fallback_phases
            primary_source = "pose_motion_fallback_v13"
            detect_debug = {
                **detect_debug,
                "primary_source": primary_source,
                "swingnet": swingnet_result.to_json(),
                "swingnet_status": swingnet_status(),
            }

        latest_model = load_latest_model()
        apply_cal, cal_reason = self._should_apply_calibration(phases, latest_model)
        if apply_cal:
            calibration_debug = apply_calibration_to_phases(
                phases,
                view=view,
                club=club,
                duration=meta.duration,
                model=latest_model,
            )
        else:
            calibration_debug = {"applied": False, "reason": cal_reason, "model_version": (latest_model or {}).get("version")}

        pose_quality = float(sum(s.confidence for s in pose_samples) / len(pose_samples)) if pose_samples else 0.0
        metrics = compute_metrics(phases, (float(active[0]), float(active[1])), pose_quality, motion_quality)
        findings, recs, drills, warnings = generate_findings(metrics, phases, bool(pose_samples))
        if primary_source == "golfdb_swingnet_v2":
            findings.insert(0, "Fases detectadas con motor GolfDB/SwingNet especializado para secuencia de swing.")
        else:
            warnings.append("SwingNet/GolfDB no está activo o no produjo una secuencia válida; se usó fallback pose/motion.")

        captures = self._save_captures(stored_path, sid, phases)
        result = AnalysisResult(
            session_id=sid,
            engine_version=settings.engine_version,
            view=view,
            club=club,
            phases=phases,
            metrics=metrics,
            captures={k: str(v) for k, v in captures.items()},
            findings=findings,
            recommendations=recs,
            drills=drills,
            warnings=warnings,
            debug={
                "user_id": user_id,
                "video_path": str(stored_path),
                "video_meta": meta.__dict__,
                "pose": pose_debug,
                "detection": detect_debug,
                "calibration": calibration_debug,
                "primary_source": primary_source,
            },
        )
        report_path = build_html_report(result)
        result.report_path = str(report_path)
        result.report_url = f"/reports/{sid}.html"

        self._save_features(sid, result, pose_samples)
        return result

    def _save_captures(self, video_path: Path, session_id: str, phases) -> dict[str, Path]:
        cap_dir = session_dir("captures", session_id)
        out: dict[str, Path] = {}
        for phase, mark in phases.items():
            try:
                _, _, frame = seek_frame(video_path, mark.time, max_width=1200)
                dst = cap_dir / f"{phase}.jpg"
                cv2.imwrite(str(dst), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
                out[phase] = dst
            except Exception:
                continue
        return out

    def _save_features(self, session_id: str, result: AnalysisResult, pose_samples) -> None:
        fdir = settings.data_dir / "features"
        fdir.mkdir(parents=True, exist_ok=True)
        payload = {
            "result": result.model_dump(mode="json"),
            "pose_samples": [s.to_json() for s in pose_samples],
        }
        (fdir / f"{session_id}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
