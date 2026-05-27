from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any
import math
import sys

import cv2
import numpy as np

from ..config import settings
from ..core.video_io import read_video_meta

GOLFDB_EVENT_NAMES: dict[int, str] = {
    0: "address",
    1: "toe_up",
    2: "mid_backswing",
    3: "top",
    4: "mid_downswing",
    5: "impact",
    6: "mid_follow_through",
    7: "finish",
}

EVENT_TO_PHASE = {
    "address": "address",
    "toe_up": "takeaway",
    "top": "top",
    "impact": "impact",
    "finish": "finish",
}

# Typical event locations inside a well-clipped GolfDB-style swing video.
# These are soft priors only; the decoder still follows model probabilities.
EVENT_POSITION_PRIORS = np.array([0.06, 0.22, 0.36, 0.48, 0.60, 0.69, 0.80, 0.93], dtype=np.float32)

# Approximate technical duration preferences for DTL amateur mobile video.
DTL_DURATION_PRIORS = {
    "backswing": 1.00,
    "downswing": 0.32,
    "follow": 0.75,
    "span": 2.05,
}


@dataclass
class SwingNetEvent:
    event: str
    frame: int
    time: float
    confidence: float

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SwingNetResult:
    available: bool
    used: bool
    reason: str | None
    model_version: str | None
    clip_start: float
    clip_end: float
    fps: float
    frame_count_processed: int
    events: dict[str, SwingNetEvent]
    phases: dict[str, SwingNetEvent]
    confidence_mean: float
    confidence_min: float
    sanity: dict[str, Any]

    def to_json(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "used": self.used,
            "reason": self.reason,
            "model_version": self.model_version,
            "clip_start": self.clip_start,
            "clip_end": self.clip_end,
            "fps": self.fps,
            "frame_count_processed": self.frame_count_processed,
            "events": {k: v.to_json() for k, v in self.events.items()},
            "phases": {k: v.to_json() for k, v in self.phases.items()},
            "confidence_mean": self.confidence_mean,
            "confidence_min": self.confidence_min,
            "sanity": self.sanity,
        }


_MODEL_CACHE: dict[str, Any] = {}


def _missing(reason: str, *, clip_start: float = 0.0, clip_end: float = 0.0) -> SwingNetResult:
    return SwingNetResult(
        available=False,
        used=False,
        reason=reason,
        model_version=None,
        clip_start=clip_start,
        clip_end=clip_end,
        fps=0.0,
        frame_count_processed=0,
        events={},
        phases={},
        confidence_mean=0.0,
        confidence_min=0.0,
        sanity={"valid": False, "reason": reason},
    )


def swingnet_status() -> dict[str, Any]:
    """Return a lightweight SwingNet/GolfDB status report."""
    repo = Path(settings.swingnet_repo_dir)
    weights = Path(settings.swingnet_weights_path)
    try:
        import torch  # noqa: F401
        torch_ok = True
        torch_error = None
    except Exception as exc:  # pragma: no cover - depends on local install
        torch_ok = False
        torch_error = str(exc)
    return {
        "enabled": bool(settings.use_swingnet),
        "repo_dir": str(repo),
        "repo_present": (repo / "MobileNetV2.py").exists(),
        "weights_path": str(weights),
        "weights_present": weights.exists(),
        "torch_available": torch_ok,
        "torch_error": torch_error,
        "runtime_version": "v2.2-full-pipeline",
        "decode_mode": "ordered_dp_with_golf_priors",
        "preprocessing": "multi_window_plus_motion_crop_plus_center_crop",
        "setup_hint": "Run: python scripts/setup_swingnet.py --download-weights, then python -m pip install -r requirements-ml.txt",
        "license_note": "GolfDB/SwingNet repository is CC BY-NC 4.0; review before commercial use.",
    }


def _load_event_detector_class(repo: Path):
    """Build a CPU/GPU safe EventDetector compatible with GolfDB SwingNet weights."""
    if not (repo / "MobileNetV2.py").exists():
        raise FileNotFoundError(f"GolfDB repo not found or incomplete: {repo}")
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))

    import torch.nn as nn
    from MobileNetV2 import MobileNetV2  # type: ignore

    class EventDetectorCPU(nn.Module):
        def __init__(self, width_mult: float = 1.0, lstm_layers: int = 1, lstm_hidden: int = 256,
                     bidirectional: bool = True, dropout: bool = False):
            super().__init__()
            self.width_mult = width_mult
            self.lstm_layers = lstm_layers
            self.lstm_hidden = lstm_hidden
            self.bidirectional = bidirectional
            self.dropout = dropout
            net = MobileNetV2(width_mult=width_mult)
            self.cnn = nn.Sequential(*list(net.children())[0][:19])
            cnn_features = int(1280 * width_mult if width_mult > 1.0 else 1280)
            self.rnn = nn.LSTM(
                cnn_features,
                lstm_hidden,
                lstm_layers,
                batch_first=True,
                bidirectional=bidirectional,
            )
            self.lin = nn.Linear((2 if bidirectional else 1) * lstm_hidden, 9)
            if dropout:
                self.drop = nn.Dropout(0.5)

        def forward(self, x, lengths=None):  # noqa: ANN001 - torch signature
            batch_size, timesteps, c, h, w = x.size()
            c_in = x.view(batch_size * timesteps, c, h, w)
            c_out = self.cnn(c_in)
            c_out = c_out.mean(3).mean(2)
            if self.dropout:
                c_out = self.drop(c_out)
            r_in = c_out.view(batch_size, timesteps, -1)
            directions = 2 if self.bidirectional else 1
            h0 = x.new_zeros(directions * self.lstm_layers, batch_size, self.lstm_hidden)
            c0 = x.new_zeros(directions * self.lstm_layers, batch_size, self.lstm_hidden)
            r_out, _ = self.rnn(r_in, (h0, c0))
            out = self.lin(r_out)
            return out.view(batch_size * timesteps, 9)

    return EventDetectorCPU


def _get_swingnet_model():
    import torch

    repo = Path(settings.swingnet_repo_dir)
    weights = Path(settings.swingnet_weights_path)
    device_name = "cuda" if torch.cuda.is_available() and settings.swingnet_allow_cuda else "cpu"
    cache_key = f"{weights.resolve()}::{device_name}"
    if cache_key in _MODEL_CACHE:
        return _MODEL_CACHE[cache_key]

    EventDetectorCPU = _load_event_detector_class(repo)
    device = torch.device(device_name)
    model = EventDetectorCPU(width_mult=1.0, lstm_layers=1, lstm_hidden=256, bidirectional=True, dropout=False)
    save_dict = torch.load(str(weights), map_location=device)
    state_dict = save_dict.get("model_state_dict", save_dict)
    model.load_state_dict(state_dict, strict=True)
    model.to(device)
    model.eval()
    _MODEL_CACHE[cache_key] = (model, device)
    return model, device


def _clamp_rect(rect: tuple[int, int, int, int], width: int, height: int) -> tuple[int, int, int, int] | None:
    x, y, w, h = rect
    x = max(0, min(width - 1, int(x)))
    y = max(0, min(height - 1, int(y)))
    w = max(1, min(width - x, int(w)))
    h = max(1, min(height - y, int(h)))
    if w < 20 or h < 20:
        return None
    return (x, y, w, h)


def _expand_rect(rect: tuple[int, int, int, int], width: int, height: int, factor_x: float = 1.55, factor_y: float = 1.35) -> tuple[int, int, int, int]:
    x, y, w, h = rect
    cx = x + w / 2
    cy = y + h / 2
    nw = min(width, max(w * factor_x, h * 0.72))
    nh = min(height, max(h * factor_y, nw * 0.95))
    nx = int(round(cx - nw / 2))
    ny = int(round(cy - nh / 2))
    return _clamp_rect((nx, ny, int(round(nw)), int(round(nh))), width, height) or (0, 0, width, height)


def _motion_scores(video_path: Path, *, sample_fps: float = 12.0, max_width: int = 360) -> tuple[list[float], list[float]]:
    meta = read_video_meta(video_path)
    fps = meta.fps or 30.0
    step = max(1, int(round(fps / max(1.0, sample_fps))))
    cap = cv2.VideoCapture(str(video_path))
    prev = None
    scores: list[float] = []
    times: list[float] = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            if frame.shape[1] > max_width:
                scale = max_width / frame.shape[1]
                frame = cv2.resize(frame, (max_width, int(frame.shape[0] * scale)), interpolation=cv2.INTER_AREA)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (7, 7), 0)
            if prev is None:
                scores.append(0.0)
            else:
                diff = cv2.absdiff(gray, prev)
                scores.append(float(np.mean(diff)))
            prev = gray
            times.append(idx / fps)
        idx += 1
    cap.release()
    return times, scores


def _smooth(values: list[float], radius: int = 2) -> np.ndarray:
    if not values:
        return np.array([], dtype=np.float32)
    arr = np.asarray(values, dtype=np.float32)
    if len(arr) < 3:
        return arr
    radius = max(1, int(radius))
    kernel = np.ones(radius * 2 + 1, dtype=np.float32) / float(radius * 2 + 1)
    return np.convolve(arr, kernel, mode="same")


def _motion_window_candidates(video_path: Path, duration: float) -> list[tuple[str, float, float]]:
    """Find likely swing windows in long mobile videos.

    GolfDB/SwingNet expects a single swing clip. This pre-pass finds high-motion
    regions and proposes several candidate clips around the downswing/impact.
    """
    times, scores = _motion_scores(video_path)
    if len(times) < 5:
        return []
    sm = _smooth(scores, radius=2)
    if float(np.max(sm)) <= 1e-6:
        return []

    # Main active block around strongest motion.
    peak_idx = int(np.argmax(sm))
    med = float(np.median(sm))
    p75 = float(np.percentile(sm, 75))
    threshold = max(med + (p75 - med) * 0.35, float(np.max(sm)) * 0.18)
    active = sm >= threshold
    left = peak_idx
    while left > 0 and active[left - 1]:
        left -= 1
    right = peak_idx
    while right < len(active) - 1 and active[right + 1]:
        right += 1

    peak_t = times[peak_idx]
    active_start = times[left]
    active_end = times[right]

    out: list[tuple[str, float, float]] = []
    # Typical DTL clips around impact/downswing. Different lengths cover slow
    # setup vs compact trimmed mobile videos.
    out.append(("motion_active_main", max(0.0, active_start - 0.95), min(duration, active_end + 1.10)))
    for length, before in [(2.4, 1.55), (3.2, 2.05), (4.2, 2.65), (5.4, 3.25)]:
        start = max(0.0, peak_t - before)
        end = min(duration, start + length)
        if end - start < length * 0.80:
            start = max(0.0, end - length)
        out.append((f"motion_peak_{length:.1f}s", start, end))

    # Secondary peaks can be useful when there is a waggle or practice movement.
    ranked = list(np.argsort(sm)[::-1])[: min(8, len(sm))]
    selected: list[int] = []
    for idx in ranked:
        if all(abs(times[idx] - times[j]) > 0.75 for j in selected):
            selected.append(int(idx))
    for n, idx in enumerate(selected[:3], start=1):
        pt = times[idx]
        start = max(0.0, pt - 2.05)
        end = min(duration, pt + 1.25)
        out.append((f"motion_secondary_{n}", start, end))
    return out


def _dedupe_candidates(candidates: list[tuple[str, float, float]], duration: float, max_count: int) -> list[tuple[str, float, float]]:
    clean: list[tuple[str, float, float]] = []
    seen: list[tuple[float, float]] = []
    for label, start, end in candidates:
        start = max(0.0, min(duration, float(start)))
        end = max(start + 0.45, min(duration, float(end)))
        if end - start < 0.55:
            continue
        if any(abs(start - s) < 0.18 and abs(end - e) < 0.18 for s, e in seen):
            continue
        clean.append((label, start, end))
        seen.append((start, end))
        if len(clean) >= max_count:
            break
    return clean


def _estimate_motion_crop_rect(video_path: Path, start_s: float, end_s: float) -> tuple[int, int, int, int] | None:
    """Estimate a fixed crop around the player/club using motion energy.

    This is not a human detector, but for static golf videos it usually captures
    the golfer and club arc. It is deliberately conservative and expanded.
    """
    meta = read_video_meta(video_path)
    fps = meta.fps or 30.0
    cap = cv2.VideoCapture(str(video_path))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    if width <= 0 or height <= 0:
        cap.release()
        return None

    start_frame = max(0, int(start_s * fps))
    end_frame = min(int(meta.frame_count or int(end_s * fps)), int(end_s * fps))
    if end_frame <= start_frame + 3:
        cap.release()
        return None
    sample_count = 20
    frame_indices = np.linspace(start_frame, end_frame - 1, num=min(sample_count, max(4, end_frame - start_frame)), dtype=int)

    max_w = 640
    scale = min(1.0, max_w / float(width))
    small_w = int(round(width * scale))
    small_h = int(round(height * scale))
    acc = np.zeros((small_h, small_w), dtype=np.float32)
    prev = None
    frames_read = 0
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if not ok:
            continue
        small = cv2.resize(frame, (small_w, small_h), interpolation=cv2.INTER_AREA) if scale < 1 else frame
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (7, 7), 0)
        if prev is not None:
            diff = cv2.absdiff(gray, prev).astype(np.float32)
            acc += diff
        prev = gray
        frames_read += 1
    cap.release()
    if frames_read < 4 or float(acc.max()) <= 1e-6:
        return None

    thresh = max(float(np.percentile(acc, 88)), float(acc.max()) * 0.22)
    mask = (acc >= thresh).astype(np.uint8) * 255
    kernel = np.ones((9, 9), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.dilate(mask, kernel, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Union of meaningful contours, not just the largest, because the club can
    # be separated from the body.
    boxes = []
    min_area = small_w * small_h * 0.002
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if w * h >= min_area:
            boxes.append((x, y, w, h))
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[0] + b[2] for b in boxes)
    y1 = max(b[1] + b[3] for b in boxes)
    # Map back to original resolution.
    rect = (int(x0 / scale), int(y0 / scale), int((x1 - x0) / scale), int((y1 - y0) / scale))
    return _expand_rect(rect, width, height, factor_x=1.75, factor_y=1.50)


def _center_crop_rect(width: int, height: int, mode: str) -> tuple[int, int, int, int]:
    if mode == "center_wide":
        w = int(width * 0.84)
        h = int(height * 0.96)
    elif mode == "center_square":
        side = min(width, height)
        w = h = int(side * 0.96)
    else:
        w = int(width * 0.72)
        h = int(height * 0.98)
    x = int((width - w) / 2)
    y = int((height - h) / 2)
    return _clamp_rect((x, y, w, h), width, height) or (0, 0, width, height)


def _crop_variants(video_path: Path, start_s: float, end_s: float) -> list[tuple[str, tuple[int, int, int, int] | None]]:
    cap = cv2.VideoCapture(str(video_path))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    variants: list[tuple[str, tuple[int, int, int, int] | None]] = [("full_letterbox", None)]
    if width > 0 and height > 0:
        motion_rect = _estimate_motion_crop_rect(video_path, start_s, end_s)
        if motion_rect:
            variants.append(("motion_crop", motion_rect))
        variants.append(("center_wide", _center_crop_rect(width, height, "center_wide")))
        # Square crop is useful if the golfer is far away in horizontal video.
        if abs(width - height) > width * 0.18:
            variants.append(("center_square", _center_crop_rect(width, height, "center_square")))
    # Deduplicate crop rectangles.
    out: list[tuple[str, tuple[int, int, int, int] | None]] = []
    seen: set[str] = set()
    for label, rect in variants:
        key = "full" if rect is None else ":".join(map(str, rect))
        if key not in seen:
            out.append((label, rect))
            seen.add(key)
    return out[: max(1, int(settings.swingnet_max_crop_variants))]


def _preprocess_frame(img_bgr: np.ndarray, input_size: int = 160, crop_rect: tuple[int, int, int, int] | None = None) -> np.ndarray:
    if crop_rect is not None:
        rect = _clamp_rect(crop_rect, img_bgr.shape[1], img_bgr.shape[0])
        if rect is not None:
            x, y, w, h = rect
            img_bgr = img_bgr[y:y + h, x:x + w]

    frame_size = [img_bgr.shape[0], img_bgr.shape[1]]
    ratio = input_size / float(max(frame_size))
    new_size = (max(1, int(frame_size[1] * ratio)), max(1, int(frame_size[0] * ratio)))
    resized = cv2.resize(img_bgr, new_size, interpolation=cv2.INTER_AREA)
    delta_w = input_size - new_size[0]
    delta_h = input_size - new_size[1]
    top, bottom = delta_h // 2, delta_h - (delta_h // 2)
    left, right = delta_w // 2, delta_w - (delta_w // 2)
    b_img = cv2.copyMakeBorder(
        resized,
        top,
        bottom,
        left,
        right,
        cv2.BORDER_CONSTANT,
        value=[0.406 * 255, 0.456 * 255, 0.485 * 255],
    )
    rgb = cv2.cvtColor(b_img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    rgb = (rgb - mean) / std
    return np.transpose(rgb, (2, 0, 1)).astype(np.float32)


def _read_clip_tensor(video_path: Path, start_s: float, end_s: float, *, max_frames: int, input_size: int, crop_rect: tuple[int, int, int, int] | None = None):
    import torch

    meta = read_video_meta(video_path)
    fps = meta.fps or 30.0
    start_frame = max(0, int(start_s * fps))
    end_frame = min(meta.frame_count, int(end_s * fps)) if meta.frame_count else int(end_s * fps)
    if end_frame <= start_frame + 8:
        start_frame = 0
        end_frame = meta.frame_count
    total = max(0, end_frame - start_frame)
    if total <= 8:
        raise ValueError("Clip too short for SwingNet inference.")

    # Keep the sequence dense enough for event order, but cap CPU latency.
    step = max(1, int(math.ceil(total / max(16, max_frames))))
    frames: list[np.ndarray] = []
    original_indices: list[int] = []
    cap = cv2.VideoCapture(str(video_path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    idx = start_frame
    while idx < end_frame:
        ok, frame = cap.read()
        if not ok:
            break
        if (idx - start_frame) % step == 0:
            frames.append(_preprocess_frame(frame, input_size=input_size, crop_rect=crop_rect))
            original_indices.append(idx)
        idx += 1
    cap.release()
    if len(frames) <= 8:
        raise ValueError("Not enough readable frames for SwingNet inference.")
    arr = np.stack(frames, axis=0)
    tensor = torch.from_numpy(arr).unsqueeze(0)  # [1,T,3,H,W]
    return tensor, original_indices, fps


def _raw_argmax_decode(probs: np.ndarray) -> list[int]:
    return [int(v) for v in np.argmax(probs[:, :8], axis=0)]


def _ordered_decode(probs: np.ndarray, *, use_priors: bool = True) -> list[int]:
    """Decode 8 GolfDB events with monotonic time ordering and golf priors."""
    t_count = int(probs.shape[0])
    e_count = 8
    if t_count < e_count:
        return list(range(t_count)) + [t_count - 1] * (e_count - t_count)

    min_gap = max(1, int(round(t_count * 0.010)))
    logp = np.log(np.clip(probs[:, :e_count], 1e-9, 1.0))

    if use_priors:
        xs = np.linspace(0.0, 1.0, t_count, dtype=np.float32)
        for event_idx in range(e_count):
            center = float(EVENT_POSITION_PRIORS[event_idx])
            sigma = 0.18 if event_idx in (0, 7) else 0.13
            penalty = ((xs - center) ** 2) / (2 * sigma * sigma)
            # Soft prior; strong enough to avoid nonsense, weak enough not to
            # override a clear model peak.
            logp[:, event_idx] -= penalty.astype(np.float64) * float(settings.swingnet_temporal_prior_weight)

    dp = np.full((e_count, t_count), -1e18, dtype=np.float64)
    back = np.full((e_count, t_count), -1, dtype=np.int32)
    latest_first = max(0, t_count - (e_count - 1) * min_gap - 1)
    dp[0, : latest_first + 1] = logp[: latest_first + 1, 0]

    for event_idx in range(1, e_count):
        best_val = -1e18
        best_idx = -1
        earliest = event_idx * min_gap
        latest = t_count - (e_count - event_idx - 1) * min_gap
        for t in range(t_count):
            candidate_prev = t - min_gap
            if candidate_prev >= 0 and dp[event_idx - 1, candidate_prev] > best_val:
                best_val = float(dp[event_idx - 1, candidate_prev])
                best_idx = candidate_prev
            if earliest <= t < latest and best_idx >= 0:
                dp[event_idx, t] = best_val + float(logp[t, event_idx])
                back[event_idx, t] = best_idx

    last_idx = int(np.argmax(dp[e_count - 1]))
    if dp[e_count - 1, last_idx] < -1e17:
        return sorted(_raw_argmax_decode(probs))

    indices = [last_idx]
    for event_idx in range(e_count - 1, 0, -1):
        prev = int(back[event_idx, indices[-1]])
        if prev < 0:
            break
        indices.append(prev)
    indices.reverse()
    if len(indices) != e_count:
        return sorted(_raw_argmax_decode(probs))
    return [int(i) for i in indices]


def _events_from_indices(indices: list[int], probs: np.ndarray, original_indices: list[int], fps: float) -> dict[str, SwingNetEvent]:
    events: dict[str, SwingNetEvent] = {}
    for event_num, local_idx in enumerate(indices):
        local_idx = int(max(0, min(local_idx, len(original_indices) - 1)))
        event = GOLFDB_EVENT_NAMES[event_num]
        original_frame = int(original_indices[local_idx])
        conf = float(probs[local_idx, event_num])
        events[event] = SwingNetEvent(event=event, frame=original_frame, time=original_frame / fps, confidence=conf)
    return events


def _phases_from_events(events: dict[str, SwingNetEvent]) -> dict[str, SwingNetEvent]:
    phases: dict[str, SwingNetEvent] = {}
    for event, phase in EVENT_TO_PHASE.items():
        if event in events:
            e = events[event]
            phases[phase] = SwingNetEvent(event=phase, frame=e.frame, time=e.time, confidence=e.confidence)
    return phases


def _sanity_check(events: dict[str, SwingNetEvent], phases: dict[str, SwingNetEvent], duration: float) -> dict[str, Any]:
    required = ["address", "takeaway", "top", "impact", "finish"]
    if any(k not in phases for k in required):
        return {"valid": False, "reason": "missing_required_phase"}
    times = [phases[k].time for k in required]
    if any(t < 0 or t > max(duration, 0.1) + 0.35 for t in times):
        return {"valid": False, "reason": "event_outside_video", "times": dict(zip(required, times, strict=False))}
    if any(times[i] >= times[i + 1] for i in range(len(times) - 1)):
        return {"valid": False, "reason": "events_not_ordered", "times": dict(zip(required, times, strict=False))}

    backswing = phases["top"].time - phases["address"].time
    downswing = phases["impact"].time - phases["top"].time
    follow = phases["finish"].time - phases["impact"].time
    span = phases["finish"].time - phases["address"].time

    reasons = []
    # Wide but golf-specific. Do not reject valid slow amateur clips, but block
    # obviously wrong full-video spans.
    if not (0.22 <= backswing <= 3.60):
        reasons.append("backswing_out_of_range")
    if not (0.055 <= downswing <= 1.20):
        reasons.append("downswing_out_of_range")
    if not (0.06 <= follow <= 3.80):
        reasons.append("followthrough_out_of_range")
    if not (0.48 <= span <= min(max(duration + 0.35, 0.75), 8.50)):
        reasons.append("span_out_of_range")

    # Full 8-event sanity. This is diagnostic, not usually hard-fail.
    all_event_names = [GOLFDB_EVENT_NAMES[i] for i in range(8)]
    all_times = [events[k].time for k in all_event_names if k in events]
    full_ordered = len(all_times) == 8 and all(all_times[i] < all_times[i + 1] for i in range(7))

    return {
        "valid": not reasons,
        "reason": ",".join(reasons) if reasons else "ok",
        "backswing": backswing,
        "downswing": downswing,
        "follow_through": follow,
        "span": span,
        "full_8_event_ordered": full_ordered,
        "times": dict(zip(required, times, strict=False)),
        "event_times": {k: v.time for k, v in events.items()},
    }


def _score_candidate(sanity: dict[str, Any], confidence_mean: float, confidence_min: float, clip_start: float, clip_end: float, crop_mode: str) -> float:
    score = float(confidence_mean) * 1.15 + float(confidence_min) * 0.35
    if not sanity.get("valid"):
        score -= 1.20
    backswing = float(sanity.get("backswing") or 0.0)
    downswing = float(sanity.get("downswing") or 0.0)
    follow = float(sanity.get("follow_through") or 0.0)
    span = float(sanity.get("span") or 0.0)

    score -= abs(backswing - DTL_DURATION_PRIORS["backswing"]) * 0.10
    score -= abs(downswing - DTL_DURATION_PRIORS["downswing"]) * 0.55
    score -= abs(follow - DTL_DURATION_PRIORS["follow"]) * 0.08
    score -= abs(span - DTL_DURATION_PRIORS["span"]) * 0.04
    # Very short or very long extracted span usually means the clip/window is wrong.
    score -= max(0.0, 0.85 - span) * 0.55
    score -= max(0.0, span - 4.25) * 0.10
    # Prefer useful crops slightly, but keep full frame competitive because
    # SwingNet was trained with centered preprocessed clips.
    if crop_mode == "motion_crop":
        score += 0.06
    elif crop_mode == "center_wide":
        score += 0.025
    # Penalize huge windows with a lot of non-swing context.
    score -= max(0.0, (clip_end - clip_start) - 6.0) * 0.025
    return float(score)


def _make_result_from_probs(
    probs: np.ndarray,
    original_indices: list[int],
    fps: float,
    duration: float,
    clip_start: float,
    clip_end: float,
    *,
    decode_mode: str,
    candidate_label: str,
    crop_mode: str,
    crop_rect: tuple[int, int, int, int] | None,
) -> SwingNetResult:
    raw_indices = _raw_argmax_decode(probs)
    if decode_mode == "ordered_prior":
        indices = _ordered_decode(probs, use_priors=True)
    elif decode_mode == "ordered":
        indices = _ordered_decode(probs, use_priors=False)
    else:
        indices = raw_indices
    events = _events_from_indices(indices, probs, original_indices, fps)
    phases = _phases_from_events(events)
    sanity = _sanity_check(events, phases, duration)
    confidences = [float(probs[idx, event_num]) for event_num, idx in enumerate(indices) if 0 <= idx < probs.shape[0]]
    raw_events = _events_from_indices(raw_indices, probs, original_indices, fps)
    confidence_mean = float(np.mean(confidences)) if confidences else 0.0
    confidence_min = float(np.min(confidences)) if confidences else 0.0
    sanity = {
        **sanity,
        "decode_mode": decode_mode,
        "ordered_indices": indices,
        "raw_argmax_indices": raw_indices,
        "raw_argmax_events": {k: v.to_json() for k, v in raw_events.items()},
        "candidate": candidate_label,
        "crop_mode": crop_mode,
        "crop_rect": crop_rect,
    }
    return SwingNetResult(
        available=True,
        used=bool(sanity.get("valid")),
        reason=None if sanity.get("valid") else sanity.get("reason", "sanity_failed"),
        model_version="golfdb-swingnet_1800-v2.2-full-pipeline",
        clip_start=clip_start,
        clip_end=clip_end,
        fps=fps,
        frame_count_processed=len(original_indices),
        events=events,
        phases=phases,
        confidence_mean=confidence_mean,
        confidence_min=confidence_min,
        sanity=sanity,
    )


def _run_model_on_tensor(model, device, tensor, seq_length: int):
    import torch
    import torch.nn.functional as F

    probs_all = []
    with torch.no_grad():
        batch = 0
        while batch * seq_length < tensor.shape[1]:
            start = batch * seq_length
            end = min((batch + 1) * seq_length, tensor.shape[1])
            image_batch = tensor[:, start:end].to(device)
            logits = model(image_batch)
            probs_all.append(F.softmax(logits, dim=1).detach().cpu().numpy())
            batch += 1
    return np.concatenate(probs_all, axis=0)


def run_swingnet(
    video_path: str | Path,
    *,
    clip_start: float = 0.0,
    clip_end: float | None = None,
    seq_length: int | None = None,
    max_frames: int | None = None,
    input_size: int = 160,
) -> SwingNetResult:
    """Run GolfDB/SwingNet with full v2.2 preprocessing pipeline.

    v2.2 uses:
    - motion-based window proposals for long mobile videos;
    - multiple crop variants, including motion crop;
    - ordered event decoding with soft GolfDB temporal priors;
    - candidate scoring using DTL-specific golf timing constraints.
    """
    video_path = Path(video_path)
    meta = read_video_meta(video_path)
    duration = float(meta.duration or 0.0)
    clip_start = max(0.0, float(clip_start or 0.0))
    clip_end = float(clip_end if clip_end is not None else duration)
    clip_end = max(clip_start + 0.2, min(duration, clip_end))

    if not settings.use_swingnet:
        return _missing("SwingNet disabled by settings.use_swingnet", clip_start=clip_start, clip_end=clip_end)

    status = swingnet_status()
    if not status["torch_available"]:
        return _missing(f"PyTorch not available: {status['torch_error']}", clip_start=clip_start, clip_end=clip_end)
    if not status["repo_present"]:
        return _missing("GolfDB repo not installed. Run scripts/setup_swingnet.py.", clip_start=clip_start, clip_end=clip_end)
    if not status["weights_present"]:
        return _missing("SwingNet weights not found. Run scripts/setup_swingnet.py --download-weights.", clip_start=clip_start, clip_end=clip_end)

    try:
        model, device = _get_swingnet_model()

        base_candidates: list[tuple[str, float, float]] = [("fallback_active_window", clip_start, clip_end)]
        if duration > 0:
            wide_start = max(0.0, clip_start - settings.swingnet_wide_margin_s)
            wide_end = min(duration, clip_end + settings.swingnet_wide_margin_s)
            base_candidates.append(("wide_active_window", wide_start, wide_end))
            # Full video only if not too long; for long clips the motion windows
            # are better and much faster.
            if duration <= settings.swingnet_full_video_max_s:
                base_candidates.append(("full_video", 0.0, duration))
            base_candidates.extend(_motion_window_candidates(video_path, duration))

        candidates = _dedupe_candidates(base_candidates, duration, max_count=int(settings.swingnet_max_window_candidates))
        if not candidates:
            candidates = [("fallback_active_window", clip_start, clip_end)]

        seq_length = int(seq_length or settings.swingnet_seq_length)
        max_frames = int(max_frames or settings.swingnet_max_frames)
        results: list[tuple[float, str, SwingNetResult]] = []
        candidate_debug: list[dict[str, Any]] = []

        for label, c_start, c_end in candidates:
            crop_variants = _crop_variants(video_path, c_start, c_end)
            for crop_mode, crop_rect in crop_variants:
                try:
                    tensor, original_indices, fps = _read_clip_tensor(
                        video_path,
                        c_start,
                        c_end,
                        max_frames=max_frames,
                        input_size=input_size,
                        crop_rect=crop_rect,
                    )
                    probs = _run_model_on_tensor(model, device, tensor, seq_length=seq_length)
                    # Try both priored and non-priored decoders. Priors are best
                    # for long/noisy clips; non-prior can rescue unusual tempos.
                    candidate_results = [
                        _make_result_from_probs(probs, original_indices, fps, duration, c_start, c_end,
                                                decode_mode="ordered_prior", candidate_label=label,
                                                crop_mode=crop_mode, crop_rect=crop_rect),
                        _make_result_from_probs(probs, original_indices, fps, duration, c_start, c_end,
                                                decode_mode="ordered", candidate_label=label,
                                                crop_mode=crop_mode, crop_rect=crop_rect),
                    ]
                    for result in candidate_results:
                        score = _score_candidate(result.sanity, result.confidence_mean, result.confidence_min, c_start, c_end, crop_mode)
                        result.sanity = {**result.sanity, "candidate_score": score}
                        results.append((score, f"{label}:{crop_mode}:{result.sanity.get('decode_mode')}", result))
                    best_local = max(candidate_results, key=lambda r: float(r.sanity.get("candidate_score", -999)))
                    candidate_debug.append({
                        "candidate": label,
                        "clip_start": c_start,
                        "clip_end": c_end,
                        "crop_mode": crop_mode,
                        "crop_rect": crop_rect,
                        "best_score": best_local.sanity.get("candidate_score"),
                        "used": best_local.used,
                        "reason": best_local.reason,
                        "confidence_mean": best_local.confidence_mean,
                        "confidence_min": best_local.confidence_min,
                        "sanity": best_local.sanity,
                    })
                except Exception as cand_exc:
                    candidate_debug.append({
                        "candidate": label,
                        "clip_start": c_start,
                        "clip_end": c_end,
                        "crop_mode": crop_mode,
                        "crop_rect": crop_rect,
                        "error": f"{type(cand_exc).__name__}: {cand_exc}",
                    })

        if not results:
            return _missing("SwingNet inference produced no candidate results", clip_start=clip_start, clip_end=clip_end)

        valid_results = [r for r in results if r[2].used]
        chosen = max(valid_results or results, key=lambda item: item[0])[2]
        chosen.sanity = {
            **chosen.sanity,
            "all_candidates": candidate_debug,
            "candidate_count": len(candidate_debug),
            "valid_candidate_count": len(valid_results),
        }
        if not chosen.used:
            chosen.reason = f"all_candidates_invalid: {chosen.reason}"
        return chosen
    except Exception as exc:
        return _missing(f"SwingNet inference failed: {type(exc).__name__}: {exc}", clip_start=clip_start, clip_end=clip_end)
