from __future__ import annotations

from pathlib import Path
import json
import cv2

from ..config import settings
from ..storage.local import new_session_id, save_upload, session_dir
from .schemas import AnalysisResult, ViewType, ClubType
from .video_io import read_video_meta, iter_sampled_frames, seek_frame
from .motion import build_motion_profile, normalize_profile
from .pose import PoseExtractor, add_velocity_features
from .phase_detector import DetectionContext, PhaseDetector
from .metrics import compute_metrics, generate_findings
from ..reporting.report_builder import build_html_report
from ..training.calibration import apply_calibration_to_phases, load_latest_model


class SwingAnalyzer:
    def __init__(self) -> None:
        self.detector = PhaseDetector()

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

        # Pass 1: motion over whole video; cheap and robust.
        frame_list = list(iter_sampled_frames(stored_path, settings.frame_sample_fps, settings.max_analysis_width))
        motion = build_motion_profile(frame_list)
        motion_quality = float(normalize_profile(motion).mean()) if motion else 0.0

        # Pass 2: pose over sampled frames. Server-side Python avoids touching the visible PWA video.
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

        ctx = DetectionContext(meta=meta, motion_samples=motion, pose_samples=pose_samples, view=view, club=club)
        phases, detect_debug = self.detector.detect(ctx)
        calibration_debug = apply_calibration_to_phases(
            phases,
            view=view,
            club=club,
            duration=meta.duration,
            model=load_latest_model(),
        )
        active = detect_debug.get("active_window") or [0.0, meta.duration]
        pose_quality = float(sum(s.confidence for s in pose_samples) / len(pose_samples)) if pose_samples else 0.0
        metrics = compute_metrics(phases, (float(active[0]), float(active[1])), pose_quality, motion_quality)
        findings, recs, drills, warnings = generate_findings(metrics, phases, bool(pose_samples))

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
