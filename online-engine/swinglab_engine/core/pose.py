from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any
import math
import numpy as np

try:
    import mediapipe as mp  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    mp = None


@dataclass
class Landmark:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 0.0


@dataclass
class PoseSample:
    frame: int
    time: float
    landmarks: dict[str, Landmark]
    confidence: float
    features: dict[str, float]

    def to_json(self) -> dict[str, Any]:
        return {
            "frame": self.frame,
            "time": self.time,
            "confidence": self.confidence,
            "landmarks": {k: asdict(v) for k, v in self.landmarks.items()},
            "features": self.features,
        }


LANDMARK_INDEX = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
}


def _dist(a: Landmark, b: Landmark) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def _mid(a: Landmark, b: Landmark) -> tuple[float, float]:
    return ((a.x + b.x) / 2.0, (a.y + b.y) / 2.0)


def _angle(a: Landmark, b: Landmark) -> float:
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x))


def extract_features(landmarks: dict[str, Landmark]) -> dict[str, float]:
    required = ["left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_wrist", "right_wrist", "nose"]
    if any(name not in landmarks for name in required):
        return {}

    ls, rs = landmarks["left_shoulder"], landmarks["right_shoulder"]
    lh, rh = landmarks["left_hip"], landmarks["right_hip"]
    lw, rw = landmarks["left_wrist"], landmarks["right_wrist"]
    nose = landmarks["nose"]

    shoulder_mid = _mid(ls, rs)
    hip_mid = _mid(lh, rh)
    hand_mid = _mid(lw, rw)
    shoulder_width = max(_dist(ls, rs), 1e-4)
    body_height_proxy = max(abs(hip_mid[1] - shoulder_mid[1]), shoulder_width, 1e-4)

    return {
        "shoulder_width": shoulder_width,
        "shoulder_angle": _angle(ls, rs),
        "hip_angle": _angle(lh, rh),
        "shoulder_turn_proxy": abs(_angle(ls, rs)),
        "hip_turn_proxy": abs(_angle(lh, rh)),
        "head_x": nose.x,
        "head_y": nose.y,
        "center_x": (shoulder_mid[0] + hip_mid[0]) / 2.0,
        "center_y": (shoulder_mid[1] + hip_mid[1]) / 2.0,
        "hand_x": hand_mid[0],
        "hand_y": hand_mid[1],
        "hand_height_norm": (shoulder_mid[1] - hand_mid[1]) / body_height_proxy,
        "hand_distance_from_center": math.hypot(hand_mid[0] - shoulder_mid[0], hand_mid[1] - shoulder_mid[1]) / body_height_proxy,
        "lead_wrist_y": min(lw.y, rw.y),
        "trail_wrist_y": max(lw.y, rw.y),
    }


def add_velocity_features(samples: list[PoseSample]) -> None:
    prev = None
    for sample in samples:
        if prev is None:
            sample.features["hand_speed"] = 0.0
            sample.features["center_speed"] = 0.0
            sample.features["head_speed"] = 0.0
        else:
            dt = max(sample.time - prev.time, 1e-4)
            for key, xkey, ykey in [
                ("hand_speed", "hand_x", "hand_y"),
                ("center_speed", "center_x", "center_y"),
                ("head_speed", "head_x", "head_y"),
            ]:
                dx = sample.features.get(xkey, 0) - prev.features.get(xkey, 0)
                dy = sample.features.get(ykey, 0) - prev.features.get(ykey, 0)
                sample.features[key] = math.hypot(dx, dy) / dt
        prev = sample


def pose_available() -> bool:
    return mp is not None


class PoseExtractor:
    def __init__(self, min_visibility: float = 0.35):
        self.min_visibility = min_visibility
        self._pose = None
        self._load_error: str | None = None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def __enter__(self) -> "PoseExtractor":
        if mp is None:
            self._load_error = "mediapipe_not_installed"
            return self
        try:
            self._pose = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                enable_segmentation=False,
                min_detection_confidence=0.35,
                min_tracking_confidence=0.35,
            )
        except Exception as exc:  # pragma: no cover
            self._load_error = f"mediapipe_pose_init_failed: {exc}"
            self._pose = None
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._pose is not None:
            self._pose.close()

    def process_frame(self, frame_bgr: np.ndarray, frame_idx: int, time_s: float) -> PoseSample | None:
        if self._pose is None:
            return None
        import cv2

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        result = self._pose.process(rgb)
        if not result.pose_landmarks:
            return None
        raw = result.pose_landmarks.landmark
        landmarks: dict[str, Landmark] = {}
        visibilities = []
        for name, idx in LANDMARK_INDEX.items():
            lm = raw[idx]
            landmarks[name] = Landmark(float(lm.x), float(lm.y), float(lm.z), float(lm.visibility))
            visibilities.append(float(lm.visibility))
        confidence = float(np.mean(visibilities)) if visibilities else 0.0
        if confidence < self.min_visibility:
            # Keep the sample if key points are usable; low quality matters for confidence but should not kill the whole engine.
            key_vis = [landmarks[k].visibility for k in ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist", "left_hip", "right_hip"]]
            if float(np.mean(key_vis)) < self.min_visibility * 0.75:
                return None
        features = extract_features(landmarks)
        if not features:
            return None
        return PoseSample(frame=frame_idx, time=time_s, landmarks=landmarks, confidence=confidence, features=features)
