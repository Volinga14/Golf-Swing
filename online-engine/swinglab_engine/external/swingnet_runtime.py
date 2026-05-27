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
        "setup_hint": "Run: python scripts/setup_swingnet.py --download-weights, then python -m pip install -r requirements-ml.txt",
        "license_note": "GolfDB/SwingNet repository is CC BY-NC 4.0; review before commercial use.",
    }


def _load_event_detector_class(repo: Path):
    """Build a CPU/GPU safe EventDetector compatible with GolfDB SwingNet weights.

    The original GolfDB model.py allocates CUDA tensors in init_hidden, which is
    inconvenient for CPU-only Windows testing. This local class keeps the module
    names compatible (cnn/rnn/lin/drop) but allocates hidden states on the actual
    input tensor device.
    """
    if not (repo / "MobileNetV2.py").exists():
        raise FileNotFoundError(f"GolfDB repo not found or incomplete: {repo}")
    if str(repo) not in sys.path:
        sys.path.insert(0, str(repo))

    import torch
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


def _sanity_check(phases: dict[str, SwingNetEvent], duration: float) -> dict[str, Any]:
    required = ["address", "takeaway", "top", "impact", "finish"]
    if any(k not in phases for k in required):
        return {"valid": False, "reason": "missing_required_phase"}
    times = [phases[k].time for k in required]
    if any(t < 0 or t > max(duration, 0.1) + 0.25 for t in times):
        return {"valid": False, "reason": "event_outside_video", "times": times}
    if any(times[i] >= times[i + 1] for i in range(len(times) - 1)):
        return {"valid": False, "reason": "events_not_ordered", "times": times}
    backswing = phases["top"].time - phases["address"].time
    downswing = phases["impact"].time - phases["top"].time
    follow = phases["finish"].time - phases["impact"].time
    span = phases["finish"].time - phases["address"].time
    valid = True
    reasons = []
    if not (0.35 <= backswing <= 2.30):
        valid = False
        reasons.append("backswing_out_of_range")
    if not (0.12 <= downswing <= 0.90):
        valid = False
        reasons.append("downswing_out_of_range")
    if not (0.12 <= follow <= 2.20):
        valid = False
        reasons.append("followthrough_out_of_range")
    if not (0.70 <= span <= min(5.50, max(duration + 0.1, 0.8))):
        valid = False
        reasons.append("span_out_of_range")
    return {
        "valid": valid,
        "reason": ",".join(reasons) if reasons else "ok",
        "backswing": backswing,
        "downswing": downswing,
        "follow_through": follow,
        "span": span,
        "times": dict(zip(required, times, strict=False)),
    }


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

    The wrapper deliberately returns a structured unavailable result instead of
    raising, so /api/analyze keeps working as a fallback while the ML model is
    being installed and tested.
    """
    video_path = Path(video_path)
    meta = read_video_meta(video_path)
    clip_start = max(0.0, float(clip_start or 0.0))
    clip_end = float(clip_end if clip_end is not None else meta.duration)
    clip_end = max(clip_start + 0.2, min(meta.duration, clip_end))

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

        tensor, original_indices, fps = _read_clip_tensor(
            video_path,
            clip_start,
            clip_end,
            max_frames=max_frames or settings.swingnet_max_frames,
            input_size=input_size,
        )
        seq_length = int(seq_length or settings.swingnet_seq_length)
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
        event_indices = np.argmax(probs[:, :8], axis=0)  # exclude class 8/no-event

        events: dict[str, SwingNetEvent] = {}
        confidences = []
        for event_num, local_idx in enumerate(event_indices):
            local_idx = int(local_idx)
            event = GOLFDB_EVENT_NAMES[event_num]
            original_frame = int(original_indices[min(local_idx, len(original_indices) - 1)])
            conf = float(probs[local_idx, event_num])
            confidences.append(conf)
            events[event] = SwingNetEvent(event=event, frame=original_frame, time=original_frame / fps, confidence=conf)

        phases: dict[str, SwingNetEvent] = {}
        for event, phase in EVENT_TO_PHASE.items():
            if event in events:
                e = events[event]
                phases[phase] = SwingNetEvent(event=phase, frame=e.frame, time=e.time, confidence=e.confidence)
        sanity = _sanity_check(phases, meta.duration)
        conf_mean = float(np.mean(confidences)) if confidences else 0.0
        conf_min = float(np.min(confidences)) if confidences else 0.0
        if conf_mean < settings.swingnet_min_mean_confidence:
            sanity = {**sanity, "valid": False, "reason": f"low_confidence:{conf_mean:.3f}"}

        return SwingNetResult(
            available=True,
            used=bool(sanity.get("valid")),
            reason=None if sanity.get("valid") else sanity.get("reason", "sanity_failed"),
            model_version="golfdb-swingnet_1800",
            clip_start=clip_start,
            clip_end=clip_end,
            fps=fps,
            frame_count_processed=len(original_indices),
            events=events,
            phases=phases,
            confidence_mean=conf_mean,
            confidence_min=conf_min,
            sanity=sanity,
        )
    except Exception as exc:
        return _missing(f"SwingNet inference failed: {type(exc).__name__}: {exc}", clip_start=clip_start, clip_end=clip_end)
