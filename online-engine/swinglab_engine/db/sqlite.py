from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from ..config import settings
from ..core.schemas import AnalysisResult, TrainingCorrection


def db_path() -> Path:
    settings.ensure_dirs()
    return settings.data_dir / "db" / "swinglab.sqlite3"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              session_id TEXT PRIMARY KEY,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              engine_version TEXT,
              user_id TEXT,
              view TEXT,
              club TEXT,
              video_path TEXT,
              report_path TEXT,
              result_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS corrections (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              user_id TEXT,
              quality TEXT,
              notes TEXT,
              corrected_json TEXT NOT NULL,
              error_json TEXT NOT NULL,
              include_in_training INTEGER DEFAULT 1,
              FOREIGN KEY(session_id) REFERENCES sessions(session_id)
            );
            CREATE TABLE IF NOT EXISTS model_versions (
              version TEXT PRIMARY KEY,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              active INTEGER DEFAULT 0,
              metrics_json TEXT,
              model_json TEXT NOT NULL
            );
            """
        )


def save_session(result: AnalysisResult) -> None:
    init_db()
    with connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO sessions(session_id, engine_version, user_id, view, club, video_path, report_path, result_json)
            VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                result.session_id,
                result.engine_version,
                result.debug.get("user_id"),
                result.view,
                result.club,
                result.debug.get("video_path"),
                result.report_path,
                json.dumps(result.model_dump(mode="json"), ensure_ascii=False),
            ),
        )


def get_session(session_id: str) -> dict[str, Any] | None:
    init_db()
    with connect() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE session_id=?", (session_id,)).fetchone()
        return dict(row) if row else None


def save_correction(correction: TrainingCorrection) -> dict[str, Any]:
    init_db()
    session = get_session(correction.session_id)
    if not session:
        raise ValueError(f"Unknown session_id: {correction.session_id}")
    result = json.loads(session["result_json"])
    auto = {k: v.get("time") for k, v in result.get("phases", {}).items()}
    errors = {}
    for phase, corrected in correction.corrected_phases.items():
        if phase in auto and auto[phase] is not None:
            errors[phase] = float(corrected) - float(auto[phase])
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO corrections(session_id,user_id,quality,notes,corrected_json,error_json,include_in_training)
            VALUES(?,?,?,?,?,?,?)
            """,
            (
                correction.session_id,
                correction.user_id,
                correction.quality,
                correction.notes,
                json.dumps(correction.model_dump(mode="json"), ensure_ascii=False),
                json.dumps(errors, ensure_ascii=False),
                1 if correction.include_in_training else 0,
            ),
        )
    record = {
        "session_id": correction.session_id,
        "engine_version": session["engine_version"],
        "auto_phases": auto,
        "corrected_phases": correction.corrected_phases,
        "phase_errors": errors,
        "quality": correction.quality,
        "view": correction.view,
        "club": correction.club,
    }
    out = settings.data_dir / "training" / f"{correction.session_id}.training.json"
    out.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return record


def training_stats() -> dict[str, Any]:
    init_db()
    with connect() as conn:
        sessions = conn.execute("SELECT COUNT(*) c FROM sessions").fetchone()["c"]
        corrections = conn.execute("SELECT COUNT(*) c FROM corrections WHERE include_in_training=1").fetchone()["c"]
        rows = conn.execute("SELECT error_json FROM corrections WHERE include_in_training=1").fetchall()
    by_phase: dict[str, list[float]] = {}
    for row in rows:
        errors = json.loads(row["error_json"] or "{}")
        for phase, value in errors.items():
            by_phase.setdefault(phase, []).append(abs(float(value)))
    phase_stats = {
        phase: {
            "count": len(values),
            "mean_abs_error_s": sum(values) / len(values) if values else None,
            "max_abs_error_s": max(values) if values else None,
        }
        for phase, values in by_phase.items()
    }
    return {"sessions": sessions, "training_corrections": corrections, "phase_stats": phase_stats}


init_db()
