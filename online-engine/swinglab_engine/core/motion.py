from __future__ import annotations

from dataclasses import dataclass
import cv2
import numpy as np


@dataclass
class MotionSample:
    frame: int
    time: float
    value: float


def smooth(values: np.ndarray, window: int = 7) -> np.ndarray:
    if len(values) < 3:
        return values
    window = max(3, min(window, len(values) if len(values) % 2 == 1 else len(values) - 1))
    if window < 3:
        return values
    kernel = np.ones(window, dtype=np.float32) / window
    padded = np.pad(values, (window // 2, window // 2), mode="edge")
    return np.convolve(padded, kernel, mode="valid")


def build_motion_profile(frames: list[tuple[int, float, np.ndarray]]) -> list[MotionSample]:
    """Build a compact motion profile from sampled frames.

    v1.3 improvement: combines frame difference with a central/body ROI and a wider
    swing ROI. The wider ROI keeps the club/arms from being ignored in DTL videos,
    while the central ROI reduces background noise.
    """
    samples: list[MotionSample] = []
    prev_gray = None
    for frame_idx, time_s, frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        if prev_gray is None:
            value = 0.0
        else:
            diff = cv2.absdiff(gray, prev_gray)
            h, w = diff.shape[:2]
            # Central body/arms area.
            body = diff[int(h * 0.05): int(h * 0.97), int(w * 0.10): int(w * 0.90)]
            # Wider area to catch club/head motion in down-the-line recordings.
            wide = diff[int(h * 0.02): int(h * 0.99), int(w * 0.02): int(w * 0.98)]
            # Use a high percentile component to avoid small camera noise dominating.
            body_mean = float(np.mean(body)) if body.size else 0.0
            wide_p90 = float(np.percentile(wide, 90)) if wide.size else 0.0
            value = 0.70 * body_mean + 0.30 * wide_p90
        samples.append(MotionSample(frame=frame_idx, time=time_s, value=value))
        prev_gray = gray

    values = np.array([s.value for s in samples], dtype=np.float32)
    smoothed = smooth(values, 9)
    for sample, val in zip(samples, smoothed):
        sample.value = float(val)
    return samples


def normalize_profile(samples: list[MotionSample]) -> np.ndarray:
    values = np.array([s.value for s in samples], dtype=np.float32)
    if len(values) == 0:
        return values
    lo = float(np.percentile(values, 8))
    hi = float(np.percentile(values, 97))
    if hi <= lo + 1e-6:
        return np.zeros_like(values)
    return np.clip((values - lo) / (hi - lo), 0, 1)


def _best_energy_window(times: np.ndarray, values: np.ndarray, min_window_s: float, max_window_s: float) -> tuple[int, int]:
    """Return indices for the highest energy compact window."""
    if len(times) == 0:
        return 0, 0
    if len(times) < 4:
        return 0, len(times) - 1
    total_duration = float(times[-1] - times[0])
    target_window = min(max_window_s, max(min_window_s, total_duration * 0.38))
    best_i, best_j, best_score = 0, len(times) - 1, -1.0
    j = 0
    cumsum = np.concatenate([[0.0], np.cumsum(values.astype(float))])
    for i in range(len(times)):
        while j + 1 < len(times) and float(times[j + 1] - times[i]) <= target_window:
            j += 1
        if j <= i:
            continue
        score = float(cumsum[j + 1] - cumsum[i]) / max(1, j - i + 1)
        # Small preference for windows that contain a strong peak, not just long low-level motion.
        score += 0.30 * float(np.max(values[i:j + 1]))
        if score > best_score:
            best_i, best_j, best_score = i, j, score
    return best_i, best_j


def detect_active_window(samples: list[MotionSample], min_window_s: float = 1.15) -> tuple[float, float, dict]:
    """Detect the active swing window.

    v1.3 improvement: for long videos, select the best compact energy window instead
    of blindly using the cluster around the largest peak. This avoids preparation/waggle
    and also avoids finish-only peaks pushing the entire swing too late.
    """
    if not samples:
        return 0.0, 0.0, {"reason": "no_motion_samples"}
    values = normalize_profile(samples)
    values = smooth(values, 7)
    times = np.array([s.time for s in samples], dtype=np.float32)
    duration = float(times[-1] - times[0]) if len(times) > 1 else 0.0
    if duration <= 0:
        return float(times[0]), float(times[0]), {"reason": "zero_duration"}

    # Pick best compact window first. Typical swing in video is ~1.3-3.0 s even if the file is longer.
    i, j = _best_energy_window(times, values, min_window_s=min_window_s, max_window_s=3.1)

    # Expand window to include address and finish context.
    sample_dt = float(np.median(np.diff(times))) if len(times) > 2 else 0.10
    pre_s = 0.55
    post_s = 0.70
    expand_pre = int(round(pre_s / max(sample_dt, 1e-3)))
    expand_post = int(round(post_s / max(sample_dt, 1e-3)))
    start_i = max(0, i - expand_pre)
    end_i = min(len(times) - 1, j + expand_post)

    # If the best window is too short, center around the global peak with sensible swing span.
    if float(times[end_i] - times[start_i]) < min_window_s:
        peak_idx = int(np.argmax(values))
        center = float(times[peak_idx])
        start_t = max(float(times[0]), center - 0.85)
        end_t = min(float(times[-1]), center + 1.00)
    else:
        start_t = float(times[start_i])
        end_t = float(times[end_i])

    return start_t, end_t, {
        "reason": "best_compact_energy_window_v13",
        "peak_time": float(times[int(np.argmax(values))]),
        "peak_value": float(np.max(values)),
        "selected_start": start_t,
        "selected_end": end_t,
        "sample_count": len(samples),
        "duration": duration,
    }
