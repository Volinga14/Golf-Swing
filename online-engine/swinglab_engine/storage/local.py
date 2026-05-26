from __future__ import annotations

from pathlib import Path
from uuid import uuid4
import shutil

from ..config import settings


def new_session_id() -> str:
    return uuid4().hex[:12]


def session_dir(kind: str, session_id: str) -> Path:
    path = settings.data_dir / kind / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_upload(src_path: str | Path, session_id: str, suffix: str = ".mp4") -> Path:
    dst_dir = settings.data_dir / "videos"
    dst_dir.mkdir(parents=True, exist_ok=True)
    dst = dst_dir / f"{session_id}{suffix}"
    shutil.copyfile(src_path, dst)
    return dst
