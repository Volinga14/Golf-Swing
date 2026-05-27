from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SWINGLAB_", env_file=".env", extra="ignore")

    data_dir: Path = Path("./data")
    external_dir: Path = Path("./external")
    allowed_origins: str = "*"
    save_original_video: bool = True
    max_upload_mb: int = 250
    engine_version: str = "backend-hybrid-v0.2.2-swingnet-full-pipeline"

    # Local fallback detector settings
    frame_sample_fps: float = 30.0
    pose_sample_fps: float = 28.0
    max_analysis_width: int = 860
    min_pose_visibility: float = 0.30

    # Optional GolfDB/SwingNet integration.
    use_swingnet: bool = True
    swingnet_repo_dir: Path = Path("./external/golfdb")
    swingnet_weights_path: Path = Path("./external/golfdb/models/swingnet_1800.pth.tar")
    swingnet_seq_length: int = 64
    swingnet_max_frames: int = 240
    swingnet_clip_margin_s: float = 0.65
    swingnet_wide_margin_s: float = 1.25
    swingnet_full_video_max_s: float = 8.5
    swingnet_max_window_candidates: int = 8
    swingnet_max_crop_variants: int = 4
    swingnet_temporal_prior_weight: float = 0.42
    swingnet_min_mean_confidence: float = 0.020
    swingnet_allow_cuda: bool = True

    @property
    def origins(self) -> list[str]:
        raw = (self.allowed_origins or "*").strip()
        if raw == "*":
            return ["*"]
        return [item.strip() for item in raw.split(",") if item.strip()]

    def ensure_dirs(self) -> None:
        for sub in ["videos", "captures", "reports", "features", "training", "models", "db", "tmp", "dataset"]:
            (self.data_dir / sub).mkdir(parents=True, exist_ok=True)
        self.external_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()
