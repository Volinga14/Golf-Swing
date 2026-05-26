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
    samples: list[MotionSample] = []
    prev = None
    for frame_idx, time_s, frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        if prev is None:
            value = 0.0
        else:
            diff = cv2.absdiff(gray, prev)
            # Focus mostly on central body region, avoid moving background edges.
            h, w = diff.shape[:2]
            x0, x1 = int(w * 0.12), int(w * 0.88)
            y0, y1 = int(h * 0.05), int(h * 0.96)
            roi = diff[y0:y1, x0:x1]
            value = float(np.mean(roi))
        samples.append(MotionSample(frame=frame_idx, time=time_s, value=value))
        prev = gray
    values = np.array([s.value for s in samples], dtype=np.float32)
    smoothed = smooth(values, 9)
    for sample, val in zip(samples, smoothed):
        sample.value = float(val)
    return samples


def normalize_profile(samples: list[MotionSample]) -> np.ndarray:
    values = np.array([s.value for s in samples], dtype=np.float32)
    if len(values) == 0:
        return values
    lo = float(np.percentile(values, 10))
    hi = float(np.percentile(values, 98))
    if hi <= lo + 1e-6:
        return np.zeros_like(values)
    return np.clip((values - lo) / (hi - lo), 0, 1)


def detect_active_window(samples: list[MotionSample], min_window_s: float = 1.0) -> tuple[float, float, dict]:
    if not samples:
        return 0.0, 0.0, {"reason": "no_motion_samples"}
    values = normalize_profile(samples)
    times = np.array([s.time for s in samples], dtype=np.float32)
    duration = float(times[-1] - times[0]) if len(times) > 1 else 0.0
    if duration <= 0:
        return float(times[0]), float(times[0]), {"reason": "zero_duration"}

    threshold = max(0.18, float(np.percentile(values, 68)))
    active = np.where(values >= threshold)[0]
    if len(active) == 0:
        # Use broad window if very static; caller can fall back to ratios.
        return max(0, float(times[0])), float(times[-1]), {"reason": "no_active_region", "threshold": threshold}

    # Select the densest/highest energy cluster around the strongest motion peak.
    peak_idx = int(np.argmax(values))
    around = np.where(np.abs(np.arange(len(values)) - peak_idx) <= max(6, int(len(values) * 0.25)))[0]
    candidate = np.intersect1d(active, around)
    if len(candidate) < 3:
        candidate = active

    start_i = int(candidate[0])
    end_i = int(candidate[-1])

    # Expand to include backswing/follow-through.
    expand = max(4, int(len(values) * 0.08))
    start_i = max(0, start_i - expand)
    end_i = min(len(values) - 1, end_i + expand * 2)

    start_t = float(times[start_i])
    end_t = float(times[end_i])
    if end_t - start_t < min_window_s:
        center = float(times[peak_idx])
        start_t = max(float(times[0]), center - min_window_s * 0.55)
        end_t = min(float(times[-1]), center + min_window_s * 0.65)

    return start_t, end_t, {
        "reason": "motion_cluster",
        "threshold": threshold,
        "peak_time": float(times[peak_idx]),
        "peak_value": float(values[peak_idx]),
        "sample_count": len(samples),
    }
