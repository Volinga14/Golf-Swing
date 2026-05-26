from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

ViewType = Literal["dtl", "face_on", "unknown"]
ClubType = Literal["driver", "iron", "wedge", "putter", "unknown"]


class PhaseMark(BaseModel):
    time: float
    frame: int | None = None
    confidence: float = 0.0
    source: str = "unknown"
    reason: str | None = None


class SwingMetrics(BaseModel):
    duration: float | None = None
    active_window_start: float | None = None
    active_window_end: float | None = None
    backswing: float | None = None
    downswing: float | None = None
    follow_through: float | None = None
    tempo: float | None = None
    pose_quality: float | None = None
    motion_quality: float | None = None
    phase_quality: float | None = None
    global_score: int | None = None


class AnalysisResult(BaseModel):
    session_id: str
    engine_version: str
    view: ViewType = "unknown"
    club: ClubType = "unknown"
    phases: dict[str, PhaseMark]
    metrics: SwingMetrics
    captures: dict[str, str] = Field(default_factory=dict)
    report_url: str | None = None
    report_path: str | None = None
    findings: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    drills: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    debug: dict[str, Any] = Field(default_factory=dict)


class TrainingCorrection(BaseModel):
    session_id: str
    user_id: str | None = None
    corrected_phases: dict[str, float]
    quality: Literal["good", "doubtful", "bad"] = "good"
    notes: str | None = None
    view: ViewType = "unknown"
    club: ClubType = "unknown"
    include_in_training: bool = True
