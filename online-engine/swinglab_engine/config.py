from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SWINGLAB_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    allowed_origins: str = "*"
    save_original_video: bool = True
    max_upload_mb: int = 250
    engine_version: str = "backend-hybrid-v0.1.2"
    frame_sample_fps: float = 30.0
    pose_sample_fps: float = 20.0
    max_analysis_width: int = 720
    min_pose_visibility: float = 0.35

    @property
    def origins(self) -> list[str]:
        raw = (self.allowed_origins or "*").strip()
        if raw == "*":
            return ["*"]
        return [item.strip() for item in raw.split(",") if item.strip()]

    def ensure_dirs(self) -> None:
        for sub in ["videos", "captures", "reports", "features", "training", "models", "db", "tmp"]:
            (self.data_dir / sub).mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
