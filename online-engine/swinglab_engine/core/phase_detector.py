from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np

from .motion import MotionSample, detect_active_window, normalize_profile
from .phases import PHASES, REFERENCE_RATIOS, REFERENCE_WINDOWS
from .pose import PoseSample
from .schemas import PhaseMark
from .video_io import VideoMeta


@dataclass
class DetectionContext:
    meta: VideoMeta
    motion_samples: list[MotionSample]
    pose_samples: list[PoseSample]
    view: str = "unknown"
    club: str = "unknown"


def _nearest_pose(samples: list[PoseSample], time_s: float) -> PoseSample | None:
    if not samples:
        return None
    return min(samples, key=lambda s: abs(s.time - time_s))


def _array_feature(samples: list[PoseSample], key: str) -> np.ndarray:
    return np.array([s.features.get(key, np.nan) for s in samples], dtype=np.float32)


def _norm(values: np.ndarray) -> np.ndarray:
    if len(values) == 0:
        return values
    values = np.nan_to_num(values, nan=float(np.nanmedian(values)) if not np.isnan(values).all() else 0.0)
    lo = float(np.percentile(values, 5))
    hi = float(np.percentile(values, 95))
    if hi <= lo + 1e-6:
        return np.zeros_like(values)
    return np.clip((values - lo) / (hi - lo), 0, 1)


def _choose_time_in_window(times: np.ndarray, scores: np.ndarray, start: float, end: float, fallback: float) -> tuple[float, float]:
    mask = (times >= start) & (times <= end)
    if not np.any(mask):
        return fallback, 0.25
    local_scores = scores[mask]
    local_times = times[mask]
    if len(local_scores) == 0:
        return fallback, 0.25
    idx = int(np.argmax(local_scores))
    conf = float(np.clip(local_scores[idx], 0, 1))
    return float(local_times[idx]), conf


def _enforce_order(phases: dict[str, PhaseMark], duration: float) -> None:
    min_gap = max(0.03, min(0.09, duration * 0.025))
    last = 0.0
    for phase in PHASES:
        if phase not in phases:
            continue
        t = max(0.0, min(duration, phases[phase].time))
        if t <= last:
            t = min(duration, last + min_gap)
            phases[phase].confidence *= 0.82
            phases[phase].reason = (phases[phase].reason or "") + " order_corrected"
        phases[phase].time = t
        phases[phase].frame = None
        last = t


def _fallback_time(active_start: float, active_end: float, phase: str) -> float:
    ratio = REFERENCE_RATIOS[phase]
    return active_start + (active_end - active_start) * ratio


class PhaseDetector:
    """Detect swing phases from pose + motion.

    This is not a black-box neural network. It is a transparent baseline that uses:
    - active motion window,
    - hand height/speed from pose,
    - body stability,
    - temporal swing priors,
    - consistency corrections.

    Its purpose is to produce good default labels and, more importantly, to create structured data
    to train a stronger model later.
    """

    def detect(self, ctx: DetectionContext) -> tuple[dict[str, PhaseMark], dict]:
        active_start, active_end, motion_debug = detect_active_window(ctx.motion_samples)
        if ctx.meta.duration and (active_end - active_start) < 0.75:
            active_start = max(0.0, ctx.meta.duration * 0.05)
            active_end = min(ctx.meta.duration, max(ctx.meta.duration * 0.95, active_start + 1.2))

        if len(ctx.pose_samples) >= 8:
            phases, pose_debug = self._detect_with_pose(ctx, active_start, active_end)
            source = "pose+motion"
        else:
            phases, pose_debug = self._detect_without_pose(ctx, active_start, active_end)
            source = "motion+temporal"

        duration = ctx.meta.duration or max((s.time for s in ctx.motion_samples), default=active_end)
        _enforce_order(phases, duration)
        for phase, mark in phases.items():
            if ctx.meta.fps:
                mark.frame = int(round(mark.time * ctx.meta.fps))
            mark.source = source if mark.source == "unknown" else mark.source

        debug = {
            "source": source,
            "active_window": [active_start, active_end],
            "motion": motion_debug,
            "pose": pose_debug,
            "pose_sample_count": len(ctx.pose_samples),
            "motion_sample_count": len(ctx.motion_samples),
        }
        return phases, debug

    def _detect_without_pose(self, ctx: DetectionContext, active_start: float, active_end: float) -> tuple[dict[str, PhaseMark], dict]:
        phases = {
            phase: PhaseMark(
                time=_fallback_time(active_start, active_end, phase),
                confidence=0.30 if phase in ["top", "impact"] else 0.38,
                source="motion+temporal",
                reason="fallback_temporal_prior",
            )
            for phase in PHASES
        }
        if ctx.motion_samples:
            motion_values = normalize_profile(ctx.motion_samples)
            times = np.array([s.time for s in ctx.motion_samples], dtype=np.float32)
            peak_time = float(times[int(np.argmax(motion_values))]) if len(times) else _fallback_time(active_start, active_end, "impact")
            # Use motion peak as impact hint, constrained to impact window.
            lo, hi = REFERENCE_WINDOWS["impact"]
            imp_start = active_start + (active_end - active_start) * lo
            imp_end = active_start + (active_end - active_start) * hi
            impact = max(imp_start, min(imp_end, peak_time))
            phases["impact"].time = impact
            phases["impact"].confidence = 0.42
            phases["impact"].reason = "motion_peak_constrained"
        return phases, {"reason": "insufficient_pose"}

    def _detect_with_pose(self, ctx: DetectionContext, active_start: float, active_end: float) -> tuple[dict[str, PhaseMark], dict]:
        samples = [s for s in ctx.pose_samples if active_start <= s.time <= active_end]
        if len(samples) < 8:
            samples = ctx.pose_samples
        times = np.array([s.time for s in samples], dtype=np.float32)
        hand_y = _array_feature(samples, "hand_y")
        hand_height = _array_feature(samples, "hand_height_norm")
        hand_speed = _array_feature(samples, "hand_speed")
        center_speed = _array_feature(samples, "center_speed")
        shoulder_turn = _array_feature(samples, "shoulder_turn_proxy")
        confidence = np.array([s.confidence for s in samples], dtype=np.float32)

        n_hand_height = _norm(hand_height)
        n_hand_speed = _norm(hand_speed)
        n_center_still = 1.0 - _norm(center_speed)
        n_turn = _norm(shoulder_turn)
        n_pose_conf = np.clip(confidence, 0, 1)

        span = max(active_end - active_start, 0.6)
        def w(phase: str) -> tuple[float, float, float]:
            lo, hi = REFERENCE_WINDOWS[phase]
            return active_start + span * lo, active_start + span * hi, _fallback_time(active_start, active_end, phase)

        phases: dict[str, PhaseMark] = {}

        # Address: stable body, low hand speed, early in active window, good pose confidence.
        s, e, fb = w("address")
        early_ratio = 1 - np.clip((times - s) / max(e - s, 1e-6), 0, 1)
        address_score = 0.38 * (1 - n_hand_speed) + 0.28 * n_center_still + 0.20 * early_ratio + 0.14 * n_pose_conf
        t, c = _choose_time_in_window(times, address_score, s, e, fb)
        phases["address"] = PhaseMark(time=t, confidence=max(0.35, c), source="pose", reason="stable_early_pose")

        # Takeaway: first clear increase in hand motion/displacement after Address, before top.
        s, e, fb = w("takeaway")
        # Prefer rising hand height and moderate speed, but not the max speed.
        take_score = 0.35 * n_hand_speed + 0.25 * n_hand_height + 0.20 * n_turn + 0.20 * n_pose_conf
        t, c = _choose_time_in_window(times, take_score, s, e, fb)
        phases["takeaway"] = PhaseMark(time=t, confidence=max(0.35, c), source="pose", reason="early_hand_motion")

        # Top: hands high, speed locally reduced after backswing, turn relatively high.
        s, e, fb = w("top")
        low_speed = 1.0 - n_hand_speed
        top_score = 0.50 * n_hand_height + 0.20 * low_speed + 0.20 * n_turn + 0.10 * n_pose_conf
        t, c = _choose_time_in_window(times, top_score, s, e, fb)
        phases["top"] = PhaseMark(time=t, confidence=max(0.42, c), source="pose", reason="max_hand_height_turn")

        # Impact: after top; combine hand speed peak + hand height return closer to address zone + timing prior.
        s, e, fb = w("impact")
        address_sample = _nearest_pose(samples, phases["address"].time)
        if address_sample:
            address_hand_y = address_sample.features.get("hand_y", float(np.nanmedian(hand_y)))
            return_to_address = 1.0 - _norm(np.abs(hand_y - address_hand_y))
        else:
            return_to_address = 1.0 - np.abs(n_hand_height - float(np.nanmedian(n_hand_height)))
        impact_score = 0.50 * n_hand_speed + 0.26 * return_to_address + 0.14 * n_turn + 0.10 * n_pose_conf
        t, c = _choose_time_in_window(times, impact_score, max(s, phases["top"].time + 0.05), e, fb)
        phases["impact"] = PhaseMark(time=t, confidence=max(0.38, c), source="pose", reason="post_top_speed_return")

        # Finish: late stable posture after impact with lower movement, high confidence.
        s, e, fb = w("finish")
        finish_score = 0.38 * (1 - n_hand_speed) + 0.24 * n_center_still + 0.18 * n_turn + 0.20 * n_pose_conf
        t, c = _choose_time_in_window(times, finish_score, max(s, phases["impact"].time + 0.10), e, fb)
        phases["finish"] = PhaseMark(time=t, confidence=max(0.35, c), source="pose", reason="late_stable_pose")

        pose_quality = float(np.mean(n_pose_conf)) if len(n_pose_conf) else 0.0
        debug = {
            "reason": "pose_feature_detector",
            "pose_quality": pose_quality,
            "feature_ranges": {
                "hand_height": [float(np.nanmin(hand_height)), float(np.nanmax(hand_height))],
                "hand_speed": [float(np.nanmin(hand_speed)), float(np.nanmax(hand_speed))],
                "shoulder_turn": [float(np.nanmin(shoulder_turn)), float(np.nanmax(shoulder_turn))],
            },
        }
        return phases, debug
