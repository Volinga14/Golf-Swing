from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterator
import cv2
import numpy as np


@dataclass
class VideoMeta:
    path: Path
    fps: float
    frame_count: int
    duration: float
    width: int
    height: int


def read_video_meta(path: str | Path) -> VideoMeta:
    p = Path(path)
    cap = cv2.VideoCapture(str(p))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {p}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    duration = frame_count / fps if fps > 0 and frame_count > 0 else 0.0
    return VideoMeta(path=p, fps=fps, frame_count=frame_count, duration=duration, width=width, height=height)


def resize_keep_aspect(frame: np.ndarray, max_width: int) -> np.ndarray:
    h, w = frame.shape[:2]
    if max_width <= 0 or w <= max_width:
        return frame
    scale = max_width / float(w)
    return cv2.resize(frame, (max_width, int(h * scale)), interpolation=cv2.INTER_AREA)


def iter_sampled_frames(
    path: str | Path,
    target_fps: float = 30.0,
    max_width: int = 720,
    start_time: float | None = None,
    end_time: float | None = None,
) -> Iterator[tuple[int, float, np.ndarray]]:
    meta = read_video_meta(path)
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {path}")

    native_fps = meta.fps or 30.0
    step = max(1, int(round(native_fps / max(target_fps, 1.0))))
    start_frame = int(max(0.0, start_time or 0.0) * native_fps)
    end_frame = int(min(meta.duration, end_time if end_time is not None else meta.duration) * native_fps) if meta.duration else meta.frame_count

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
    idx = start_frame
    while idx < end_frame:
        ok, frame = cap.read()
        if not ok:
            break
        if (idx - start_frame) % step == 0:
            frame = resize_keep_aspect(frame, max_width)
            yield idx, idx / native_fps, frame
        idx += 1
    cap.release()


def seek_frame(path: str | Path, time_s: float, max_width: int = 1440) -> tuple[int, float, np.ndarray]:
    meta = read_video_meta(path)
    frame_idx = int(max(0, min(time_s, meta.duration)) * meta.fps)
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise ValueError(f"Could not read frame at {time_s:.3f}s")
    return frame_idx, frame_idx / meta.fps, resize_keep_aspect(frame, max_width)
