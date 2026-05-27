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
    """Return a lightweight status report without importing torch unless needed."""
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
        "decode_mode": "ordered_dynamic_programming_v2.1",
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


def _preprocess_frame(img_bgr: np.ndarray, input_size: int = 160) -> np.ndarray:
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


def _read_clip_tensor(video_path: Path, start_s: float, end_s: float, *, max_frames: int, input_size: int):
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

    # SwingNet was trained on dense frame sequences. Keep as many frames as
    # practical, but cap to avoid huge CPU latency on long mobile videos.
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
            frames.append(_preprocess_frame(frame, input_size=input_size))
            original_indices.append(idx)
        idx += 1
    cap.release()
    if len(frames) <= 8:
        raise ValueError("Not enough readable frames for SwingNet inference.")
    arr = np.stack(frames, axis=0)
    tensor = torch.from_numpy(arr).unsqueeze(0)  # [1,T,3,H,W]
    return tensor, original_indices, fps


def _raw_argmax_decode(probs: np.ndarray) -> list[int]:
    """Original GolfDB-style per-event argmax. Useful for debugging only."""
    return [int(v) for v in np.argmax(probs[:, :8], axis=0)]


def _ordered_decode(probs: np.ndarray) -> list[int]:
    """Decode 8 GolfDB events with monotonic time ordering.

    The first v2.0 wrapper used independent argmax per event. With mobile clips,
    that often produces unordered events, so the backend rejected SwingNet and
    fell back. This dynamic-programming decoder chooses the best ordered event
    sequence, which is much closer to the actual golf problem.
    """
    t_count = int(probs.shape[0])
    e_count = 8
    if t_count < e_count:
        return list(range(t_count)) + [t_count - 1] * (e_count - t_count)

    # At least one sampled frame between events. For long clips, require a small
    # gap to avoid multiple events collapsing onto the same local maximum.
    min_gap = max(1, int(round(t_count * 0.006)))
    logp = np.log(np.clip(probs[:, :e_count], 1e-9, 1.0))

    dp = np.full((e_count, t_count), -1e18, dtype=np.float64)
    back = np.full((e_count, t_count), -1, dtype=np.int32)

    # Keep room for later events.
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
        # Fallback to sorted raw argmax if DP failed for an unusual short clip.
        raw = sorted(_raw_argmax_decode(probs))
        return raw

    indices = [last_idx]
    for event_idx in range(e_count - 1, 0, -1):
        prev = int(back[event_idx, indices[-1]])
        if prev < 0:
            break
        indices.append(prev)
    indices.reverse()
    if len(indices) != e_count:
        raw = sorted(_raw_argmax_decode(probs))
        return raw
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


def _sanity_check(phases: dict[str, SwingNetEvent], duration: float) -> dict[str, Any]:
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
    # v2.1 deliberately uses broader ranges than v2.0. GolfDB/SwingNet should
    # not be rejected merely because mobile videos include longer address or
    # finish sections. The ordered decoder already enforces the golf sequence.
    if not (0.25 <= backswing <= 3.80):
        reasons.append("backswing_out_of_range")
    if not (0.06 <= downswing <= 1.35):
        reasons.append("downswing_out_of_range")
    if not (0.08 <= follow <= 3.80):
        reasons.append("followthrough_out_of_range")
    if not (0.55 <= span <= min(max(duration + 0.35, 0.8), 9.50)):
        reasons.append("span_out_of_range")

    return {
        "valid": not reasons,
        "reason": ",".join(reasons) if reasons else "ok",
        "backswing": backswing,
        "downswing": downswing,
        "follow_through": follow,
        "span": span,
        "times": dict(zip(required, times, strict=False)),
    }


def _score_candidate(sanity: dict[str, Any], confidence_mean: float, clip_start: float, clip_end: float) -> float:
    score = float(confidence_mean)
    if not sanity.get("valid"):
        score -= 1.0
    backswing = float(sanity.get("backswing") or 0.0)
    downswing = float(sanity.get("downswing") or 0.0)
    follow = float(sanity.get("follow_through") or 0.0)
    span = float(sanity.get("span") or 0.0)

    # Golf-specific soft preferences, not hard gates.
    score -= abs(backswing - 1.0) * 0.08
    score -= abs(downswing - 0.32) * 0.25
    score -= abs(follow - 0.75) * 0.06
    score -= max(0.0, span - 4.5) * 0.05
    score -= max(0.0, 0.7 - span) * 0.20
    # Prefer the fallback-proposed active clip slightly over full-video only if
    # its sequence is otherwise comparable.
    score -= max(0.0, (clip_end - clip_start) - 8.0) * 0.015
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
) -> SwingNetResult:
    raw_indices = _raw_argmax_decode(probs)
    if decode_mode == "ordered":
        indices = _ordered_decode(probs)
    else:
        indices = raw_indices
    events = _events_from_indices(indices, probs, original_indices, fps)
    phases = _phases_from_events(events)
    sanity = _sanity_check(phases, duration)
    confidences = [float(probs[idx, event_num]) for event_num, idx in enumerate(indices) if 0 <= idx < probs.shape[0]]
    raw_events = _events_from_indices(raw_indices, probs, original_indices, fps)
    sanity = {
        **sanity,
        "decode_mode": decode_mode,
        "ordered_indices": indices,
        "raw_argmax_indices": raw_indices,
        "raw_argmax_events": {k: v.to_json() for k, v in raw_events.items()},
    }
    return SwingNetResult(
        available=True,
        used=bool(sanity.get("valid")),
        reason=None if sanity.get("valid") else sanity.get("reason", "sanity_failed"),
        model_version="golfdb-swingnet_1800-v2.1-ordered",
        clip_start=clip_start,
        clip_end=clip_end,
        fps=fps,
        frame_count_processed=len(original_indices),
        events=events,
        phases=phases,
        confidence_mean=float(np.mean(confidences)) if confidences else 0.0,
        confidence_min=float(np.min(confidences)) if confidences else 0.0,
        sanity=sanity,
    )


def run_swingnet(
    video_path: str | Path,
    *,
    clip_start: float = 0.0,
    clip_end: float | None = None,
    seq_length: int | None = None,
    max_frames: int | None = None,
    input_size: int = 160,
) -> SwingNetResult:
    """Run GolfDB/SwingNet inference if the external model is installed.

    v2.1 changes the decoder. Instead of independent per-event argmax, it uses
    ordered dynamic programming and tries both the fallback active window and a
    full-video candidate. This prevents most unnecessary fallbacks when SwingNet
    is installed but raw event peaks are not perfectly ordered.
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
        import torch
        import torch.nn.functional as F

        repo = Path(settings.swingnet_repo_dir)
        weights = Path(settings.swingnet_weights_path)
        EventDetectorCPU = _load_event_detector_class(repo)
        device = torch.device("cuda" if torch.cuda.is_available() and settings.swingnet_allow_cuda else "cpu")
        model = EventDetectorCPU(width_mult=1.0, lstm_layers=1, lstm_hidden=256, bidirectional=True, dropout=False)
        save_dict = torch.load(str(weights), map_location=device)
        state_dict = save_dict.get("model_state_dict", save_dict)
        model.load_state_dict(state_dict, strict=True)
        model.to(device)
        model.eval()

        candidates: list[tuple[str, float, float]] = [("fallback_active_window", clip_start, clip_end)]
        # SwingNet baseline often expects the whole input to be one swing. If the
        # fallback window is wrong, full-video inference can still rescue short
        # mobile clips. For very long videos, still cap by max_frames.
        if duration > 0 and (abs(clip_start) > 0.05 or abs(clip_end - duration) > 0.05):
            candidates.append(("full_video", 0.0, duration))
        # Add a wider active window because the fallback detector often cuts too
        # late. This is useful for DTL mobile videos with practice movement.
        if duration > 0:
            wide_start = max(0.0, clip_start - 1.2)
            wide_end = min(duration, clip_end + 1.2)
            if wide_end - wide_start > 0.7 and (wide_start, wide_end) not in [(c[1], c[2]) for c in candidates]:
                candidates.append(("wide_active_window", wide_start, wide_end))

        seq_length = int(seq_length or settings.swingnet_seq_length)
        results: list[tuple[float, str, SwingNetResult]] = []
        candidate_debug = []
        for label, c_start, c_end in candidates:
            try:
                tensor, original_indices, fps = _read_clip_tensor(
                    video_path,
                    c_start,
                    c_end,
                    max_frames=max_frames or settings.swingnet_max_frames,
                    input_size=input_size,
                )
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
                probs = np.concatenate(probs_all, axis=0)
                ordered = _make_result_from_probs(probs, original_indices, fps, duration, c_start, c_end, decode_mode="ordered")
                raw = _make_result_from_probs(probs, original_indices, fps, duration, c_start, c_end, decode_mode="raw_argmax")
                score = _score_candidate(ordered.sanity, ordered.confidence_mean, c_start, c_end)
                ordered.sanity = {
                    **ordered.sanity,
                    "candidate": label,
                    "candidate_score": score,
                    "raw_argmax_valid": bool(raw.sanity.get("valid")),
                    "raw_argmax_reason": raw.sanity.get("reason"),
                }
                results.append((score, label, ordered))
                candidate_debug.append({
                    "candidate": label,
                    "clip_start": c_start,
                    "clip_end": c_end,
                    "score": score,
                    "used": ordered.used,
                    "reason": ordered.reason,
                    "confidence_mean": ordered.confidence_mean,
                    "sanity": ordered.sanity,
                })
            except Exception as cand_exc:
                candidate_debug.append({
                    "candidate": label,
                    "clip_start": c_start,
                    "clip_end": c_end,
                    "error": f"{type(cand_exc).__name__}: {cand_exc}",
                })

        if not results:
            return _missing("SwingNet inference produced no candidate results", clip_start=clip_start, clip_end=clip_end)

        # Prefer valid candidates; if none are valid return the best invalid with
        # detailed reasons so we can debug the clip/crop problem.
        valid_results = [r for r in results if r[2].used]
        chosen = max(valid_results or results, key=lambda item: item[0])[2]
        chosen.sanity = {**chosen.sanity, "all_candidates": candidate_debug}
        if not chosen.used:
            chosen.reason = f"all_candidates_invalid: {chosen.reason}"
        return chosen
    except Exception as exc:
        return _missing(f"SwingNet inference failed: {type(exc).__name__}: {exc}", clip_start=clip_start, clip_end=clip_end)
