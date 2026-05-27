from __future__ import annotations

from dataclasses import dataclass
import math
import numpy as np

from .motion import MotionSample, detect_active_window, normalize_profile, smooth
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


def _fill_nan(values: np.ndarray) -> np.ndarray:
    if len(values) == 0:
        return values
    if np.isnan(values).all():
        return np.zeros_like(values)
    return np.nan_to_num(values, nan=float(np.nanmedian(values)))


def _norm(values: np.ndarray) -> np.ndarray:
    if len(values) == 0:
        return values
    values = _fill_nan(values).astype(np.float32)
    lo = float(np.percentile(values, 5))
    hi = float(np.percentile(values, 95))
    if hi <= lo + 1e-6:
        return np.zeros_like(values)
    return np.clip((values - lo) / (hi - lo), 0, 1)


def _gaussian_score(x: np.ndarray, center: float, width: float) -> np.ndarray:
    width = max(width, 1e-4)
    return np.exp(-0.5 * ((x - center) / width) ** 2).astype(np.float32)


def _interp_motion(ctx: DetectionContext, times: np.ndarray) -> np.ndarray:
    if not ctx.motion_samples or len(times) == 0:
        return np.zeros_like(times, dtype=np.float32)
    mt = np.array([s.time for s in ctx.motion_samples], dtype=np.float32)
    mv = normalize_profile(ctx.motion_samples).astype(np.float32)
    if len(mt) < 2:
        return np.zeros_like(times, dtype=np.float32)
    return np.interp(times, mt, mv, left=mv[0], right=mv[-1]).astype(np.float32)


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


def _choose_earliest_crossing(times: np.ndarray, values: np.ndarray, start: float, end: float, threshold: float, fallback: float) -> tuple[float, float]:
    mask = np.where((times >= start) & (times <= end))[0]
    if len(mask) == 0:
        return fallback, 0.25
    for idx in mask:
        # Require at least one neighbour or a clearly high point to avoid single-frame noise.
        next_ok = idx + 1 < len(values) and values[idx + 1] >= threshold * 0.85
        prev_ok = idx > 0 and values[idx - 1] >= threshold * 0.75
        if values[idx] >= threshold and (next_ok or prev_ok or values[idx] >= threshold * 1.25):
            return float(times[idx]), float(np.clip(values[idx], 0, 1))
    return fallback, 0.25


def _enforce_order(phases: dict[str, PhaseMark], duration: float, *, min_gaps: dict[str, float] | None = None) -> None:
    min_gaps = min_gaps or {}
    last = 0.0
    previous_phase = None
    for phase in PHASES:
        if phase not in phases:
            continue
        t = max(0.0, min(duration, float(phases[phase].time)))
        if previous_phase:
            gap = min_gaps.get(f"{previous_phase}->{phase}", max(0.025, min(0.08, duration * 0.018)))
        else:
            gap = 0.0
        if t <= last + gap:
            t = min(duration, last + gap)
            phases[phase].confidence *= 0.84
            phases[phase].reason = ((phases[phase].reason or "") + " order_corrected_v13").strip()
        phases[phase].time = t
        phases[phase].frame = None
        last = t
        previous_phase = phase


def _fallback_time(active_start: float, active_end: float, phase: str) -> float:
    return active_start + (active_end - active_start) * REFERENCE_RATIOS[phase]


class PhaseDetector:
    """DTL-focused phase detector v1.3.

    This detector first tries to infer Top and Impact from pose features, then derives
    Address/Takeaway/Finish around them. That is more robust for long videos because
    it does not assume the full file duration equals the swing duration.
    """

    def detect(self, ctx: DetectionContext) -> tuple[dict[str, PhaseMark], dict]:
        active_start, active_end, motion_debug = detect_active_window(ctx.motion_samples)
        duration = ctx.meta.duration or max((s.time for s in ctx.motion_samples), default=active_end)
        if duration and (active_end - active_start) < 0.85:
            active_start = max(0.0, active_start - 0.45)
            active_end = min(duration, active_end + 0.75)

        if len(ctx.pose_samples) >= 10:
            phases, pose_debug = self._detect_with_pose_v13(ctx, active_start, active_end)
            source = "pose+motion-dtl-v13"
        else:
            phases, pose_debug = self._detect_without_pose(ctx, active_start, active_end)
            source = "motion+temporal-v13"

        # Keep realistic golf gaps. Impact should not be almost at finish or far after Top.
        _enforce_order(
            phases,
            duration,
            min_gaps={
                "address->takeaway": 0.08,
                "takeaway->top": 0.18,
                "top->impact": 0.12,
                "impact->finish": 0.20,
            },
        )
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
            "duration": duration,
        }
        return phases, debug

    def _detect_without_pose(self, ctx: DetectionContext, active_start: float, active_end: float) -> tuple[dict[str, PhaseMark], dict]:
        phases = {
            phase: PhaseMark(
                time=_fallback_time(active_start, active_end, phase),
                confidence=0.30 if phase in ["top", "impact"] else 0.38,
                source="motion+temporal-v13",
                reason="fallback_temporal_prior_v13",
            )
            for phase in PHASES
        }
        if ctx.motion_samples:
            motion_values = smooth(normalize_profile(ctx.motion_samples), 7)
            times = np.array([s.time for s in ctx.motion_samples], dtype=np.float32)
            peak_time = float(times[int(np.argmax(motion_values))]) if len(times) else _fallback_time(active_start, active_end, "impact")
            span = max(active_end - active_start, 1.0)
            # Use peak as impact hint, but keep it earlier in the active window than before.
            imp_start = active_start + span * 0.50
            imp_end = active_start + span * 0.72
            impact = max(imp_start, min(imp_end, peak_time))
            phases["impact"].time = impact
            phases["impact"].confidence = 0.42
            phases["impact"].reason = "motion_peak_compact_window_v13"
            phases["top"].time = max(active_start + span * 0.30, impact - max(0.22, span * 0.18))
            phases["finish"].time = min(active_end, impact + max(0.35, span * 0.20))
        return phases, {"reason": "insufficient_pose", "active_window": [active_start, active_end]}

    def _detect_with_pose_v13(self, ctx: DetectionContext, active_start: float, active_end: float) -> tuple[dict[str, PhaseMark], dict]:
        # Keep broad context around motion window, but don't let the whole video dominate.
        duration = ctx.meta.duration or max((s.time for s in ctx.pose_samples), default=active_end)
        context_start = max(0.0, active_start - 0.80)
        context_end = min(duration, active_end + 0.90)
        samples = [s for s in ctx.pose_samples if context_start <= s.time <= context_end]
        if len(samples) < 10:
            samples = sorted(ctx.pose_samples, key=lambda s: s.time)
        else:
            samples = sorted(samples, key=lambda s: s.time)

        times = np.array([s.time for s in samples], dtype=np.float32)
        if len(times) < 10:
            return self._detect_without_pose(ctx, active_start, active_end)

        hand_y = _fill_nan(_array_feature(samples, "hand_y"))
        hand_height = _fill_nan(_array_feature(samples, "hand_height_norm"))
        hand_speed_raw = _fill_nan(_array_feature(samples, "hand_speed"))
        center_speed_raw = _fill_nan(_array_feature(samples, "center_speed"))
        shoulder_turn = _fill_nan(_array_feature(samples, "shoulder_turn_proxy"))
        confidence = np.array([s.confidence for s in samples], dtype=np.float32)
        motion = _interp_motion(ctx, times)

        n_hand_height = smooth(_norm(hand_height), 5)
        n_hand_speed = smooth(_norm(hand_speed_raw), 5)
        n_center_speed = smooth(_norm(center_speed_raw), 5)
        n_center_still = 1.0 - n_center_speed
        n_turn = smooth(_norm(shoulder_turn), 5)
        n_pose_conf = np.clip(confidence, 0, 1)
        n_motion = smooth(motion, 5)

        dt = float(np.median(np.diff(times))) if len(times) > 2 else 0.05
        hand_height_delta = smooth(np.abs(np.gradient(n_hand_height, max(dt, 1e-3))), 5)
        hand_height_delta = _norm(hand_height_delta)
        energy = smooth(0.52 * n_hand_speed + 0.28 * n_motion + 0.12 * hand_height_delta + 0.08 * n_center_speed, 5)

        # --- TOP: high hands + high turn + evidence of fast downswing after it.
        future_speed = np.zeros_like(n_hand_speed)
        future_motion = np.zeros_like(n_motion)
        lookahead_s = 0.70
        for i, t in enumerate(times):
            j = np.where((times >= t + 0.10) & (times <= t + lookahead_s))[0]
            if len(j):
                future_speed[i] = float(np.max(n_hand_speed[j]))
                future_motion[i] = float(np.max(n_motion[j]))
        low_speed = 1.0 - n_hand_speed
        # Avoid selecting the very start/end of the context as top.
        center_prior = _gaussian_score((times - context_start) / max(context_end - context_start, 1e-6), 0.48, 0.25)
        top_score = (
            0.40 * n_hand_height
            + 0.18 * n_turn
            + 0.14 * low_speed
            + 0.18 * future_speed
            + 0.06 * future_motion
            + 0.04 * center_prior
        ) * (0.65 + 0.35 * n_pose_conf)
        top_search_start = max(context_start, active_start - 0.30)
        top_search_end = min(context_end, active_end + 0.20)
        top_t, top_conf = _choose_time_in_window(
            times,
            top_score,
            top_search_start,
            top_search_end,
            _fallback_time(active_start, active_end, "top"),
        )

        # --- ADDRESS: last stable/low-motion zone before movement builds towards Top.
        pre_start = max(context_start, top_t - 2.25)
        pre_end = max(context_start, top_t - 0.18)
        pre_mask = np.where((times >= pre_start) & (times <= pre_end))[0]
        if len(pre_mask) >= 3:
            pre_energy = energy[pre_mask]
            threshold = max(0.20, float(np.percentile(pre_energy, 58)))
            # First clear movement toward backswing.
            movement_t, _ = _choose_earliest_crossing(times, energy, pre_start, pre_end, threshold, top_t - 0.95)
            stable_mask = np.where((times >= pre_start) & (times <= max(pre_start, movement_t - 0.05)))[0]
            if len(stable_mask):
                address_scores = (0.48 * (1.0 - energy) + 0.25 * n_center_still + 0.17 * (1.0 - n_hand_speed) + 0.10 * n_pose_conf)
                # Select latest good stable pose before motion, not the first frame of a long setup.
                latest_weight = _norm(times - float(times[stable_mask[0]]))
                address_scores = address_scores + 0.10 * latest_weight
                a_idx = stable_mask[int(np.argmax(address_scores[stable_mask]))]
                address_t = float(times[a_idx])
                address_conf = float(np.clip(address_scores[a_idx], 0.35, 0.95))
            else:
                address_t = max(context_start, top_t - 1.05)
                address_conf = 0.38
        else:
            address_t = max(context_start, top_t - 1.05)
            address_conf = 0.35

        # --- TAKEAWAY: first sustained movement after Address, before Top.
        take_start = min(top_t - 0.18, address_t + 0.08)
        take_end = max(take_start + 0.10, top_t - 0.20)
        take_energy_threshold = max(0.22, float(np.percentile(energy[(times >= address_t) & (times <= top_t)], 48)) if np.any((times >= address_t) & (times <= top_t)) else 0.30)
        takeaway_fallback = address_t + max(0.18, 0.24 * max(top_t - address_t, 0.8))
        take_t, take_conf = _choose_earliest_crossing(times, energy, take_start, take_end, take_energy_threshold, takeaway_fallback)
        # Keep takeaway in a realistic portion of backswing.
        take_t = max(address_t + 0.08, min(top_t - 0.15, take_t))

        # --- IMPACT: earliest strong downswing event after Top near address hand height.
        address_sample = _nearest_pose(samples, address_t)
        if address_sample:
            address_hand_y = address_sample.features.get("hand_y", float(np.nanmedian(hand_y)))
            return_to_address = 1.0 - _norm(np.abs(hand_y - address_hand_y))
        else:
            return_to_address = 1.0 - np.abs(n_hand_height - float(np.nanmedian(n_hand_height)))
        backswing_s = max(top_t - address_t, 0.55)
        expected_down = float(np.clip(0.30 * backswing_s, 0.20, 0.55))
        imp_start = top_t + 0.12
        imp_end = min(context_end, top_t + max(0.42, min(0.82, expected_down * 1.75)))
        down_prior = _gaussian_score(times - top_t, expected_down, max(0.10, expected_down * 0.34))
        impact_score = (
            0.38 * n_hand_speed
            + 0.25 * return_to_address
            + 0.18 * n_motion
            + 0.14 * down_prior
            + 0.05 * n_pose_conf
        )
        impact_t, impact_conf = _choose_time_in_window(times, impact_score, imp_start, imp_end, top_t + expected_down)
        # If the chosen point is still late, prefer the earliest high score in the downswing window.
        imp_mask = np.where((times >= imp_start) & (times <= imp_end))[0]
        if len(imp_mask):
            local = impact_score[imp_mask]
            cutoff = max(0.62 * float(np.max(local)), float(np.percentile(local, 72)))
            early_candidates = [idx for idx in imp_mask if impact_score[idx] >= cutoff and return_to_address[idx] >= float(np.percentile(return_to_address[imp_mask], 45))]
            if early_candidates:
                idx = early_candidates[0]
                impact_t = float(times[idx])
                impact_conf = max(impact_conf, float(np.clip(impact_score[idx], 0, 1)))

        # --- FINISH: first stable follow-through zone after impact, not simply the end of video.
        follow_start = impact_t + 0.22
        follow_end = min(context_end, impact_t + max(0.65, min(1.65, 0.70 * backswing_s + 0.35)))
        finish_energy = 0.58 * (1.0 - energy) + 0.22 * n_center_still + 0.10 * n_turn + 0.10 * n_pose_conf
        finish_fallback = min(follow_end, impact_t + max(0.42, min(0.95, 0.45 * backswing_s)))
        # Select first stable-ish point after main post-impact motion, but allow later balanced finish.
        f_mask = np.where((times >= follow_start) & (times <= follow_end))[0]
        if len(f_mask):
            local_energy = energy[f_mask]
            stable_threshold = min(0.45, max(0.18, float(np.percentile(local_energy, 35))))
            candidate = None
            for idx in f_mask:
                if energy[idx] <= stable_threshold and n_center_speed[idx] <= 0.65:
                    candidate = idx
                    break
            if candidate is None:
                candidate = f_mask[int(np.argmax(finish_energy[f_mask]))]
            finish_t = float(times[candidate])
            finish_conf = float(np.clip(finish_energy[candidate], 0.35, 0.96))
        else:
            finish_t = finish_fallback
            finish_conf = 0.35

        phases: dict[str, PhaseMark] = {
            "address": PhaseMark(time=address_t, confidence=address_conf, source="pose", reason="dtl_v13_stable_pre_swing"),
            "takeaway": PhaseMark(time=take_t, confidence=max(0.35, take_conf), source="pose", reason="dtl_v13_first_sustained_movement"),
            "top": PhaseMark(time=top_t, confidence=max(0.42, top_conf), source="pose", reason="dtl_v13_top_high_hands_future_speed"),
            "impact": PhaseMark(time=impact_t, confidence=max(0.40, impact_conf), source="pose", reason="dtl_v13_earliest_downswing_speed_return"),
            "finish": PhaseMark(time=finish_t, confidence=max(0.35, finish_conf), source="pose", reason="dtl_v13_first_stable_followthrough"),
        }

        pose_quality = float(np.mean(n_pose_conf)) if len(n_pose_conf) else 0.0
        debug = {
            "reason": "dtl_pose_first_detector_v13",
            "pose_quality": pose_quality,
            "context_window": [context_start, context_end],
            "top_search_window": [top_search_start, top_search_end],
            "impact_search_window": [imp_start, imp_end],
            "finish_search_window": [follow_start, follow_end],
            "estimated_backswing_s": backswing_s,
            "expected_downswing_s": expected_down,
            "feature_ranges": {
                "hand_height": [float(np.nanmin(hand_height)), float(np.nanmax(hand_height))],
                "hand_speed": [float(np.nanmin(hand_speed_raw)), float(np.nanmax(hand_speed_raw))],
                "shoulder_turn": [float(np.nanmin(shoulder_turn)), float(np.nanmax(shoulder_turn))],
                "energy": [float(np.nanmin(energy)), float(np.nanmax(energy))],
            },
        }
        return phases, debug
