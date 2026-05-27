from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import csv

from ..config import settings

GOLFDB_EVENT_ORDER = [
    "address",
    "toe_up",
    "mid_backswing",
    "top",
    "mid_downswing",
    "impact",
    "mid_follow_through",
    "finish",
]

SWINGLAB_TO_GOLFDB = {
    "address": "address",
    "takeaway": "toe_up",
    "top": "top",
    "impact": "impact",
    "finish": "finish",
}


def _load_json(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _extract_corrected(record: dict[str, Any]) -> dict[str, float]:
    for key in ["corrected_phases", "correctedPhases", "finalPhaseTimes"]:
        raw = record.get(key)
        if isinstance(raw, dict):
            out = {}
            for phase, value in raw.items():
                if isinstance(value, dict):
                    value = value.get("time") or value.get("seconds") or value.get("t")
                try:
                    out[phase] = float(value)
                except Exception:
                    pass
            if out:
                return out
    return {}


def _session_feature(session_id: str) -> dict[str, Any] | None:
    f = settings.data_dir / "features" / f"{session_id}.json"
    return _load_json(f) if f.exists() else None


def _video_path_for_session(session_id: str) -> str | None:
    feature = _session_feature(session_id)
    try:
        return feature["result"]["debug"]["video_path"]
    except Exception:
        return None


def build_golfdb_style_dataset() -> dict[str, Any]:
    """Export Swing Lab corrections to a GolfDB-compatible label format.

    Swing Lab currently collects 5 events. GolfDB/SwingNet uses 8 events. The
    exporter maps our 5 labels into the 8-event schema and leaves unknown events
    as null so future advanced annotation can fill them.
    """
    out_dir = settings.data_dir / "dataset" / "golfdb_style"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    training_dir = settings.data_dir / "training"
    for path in sorted(training_dir.glob("*.json")):
        rec = _load_json(path)
        if not rec:
            continue
        session_id = str(rec.get("session_id") or path.stem.replace(".training", ""))
        corrected = _extract_corrected(rec)
        if not corrected:
            continue
        events = {event: None for event in GOLFDB_EVENT_ORDER}
        for sl_phase, gd_event in SWINGLAB_TO_GOLFDB.items():
            if sl_phase in corrected:
                events[gd_event] = float(corrected[sl_phase])
        rows.append({
            "session_id": session_id,
            "video_path": _video_path_for_session(session_id),
            "view": rec.get("view") or "dtl",
            "club": rec.get("club") or "unknown",
            "quality": rec.get("quality") or "good",
            "events_seconds": events,
            "source": "swinglab_corrections",
        })

    labels_path = out_dir / "labels.jsonl"
    with labels_path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    csv_path = out_dir / "labels.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["session_id", "video_path", "view", "club", "quality", *GOLFDB_EVENT_ORDER])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "session_id": row["session_id"],
                "video_path": row["video_path"],
                "view": row["view"],
                "club": row["club"],
                "quality": row["quality"],
                **row["events_seconds"],
            })
    return {
        "status": "ok",
        "count": len(rows),
        "labels_jsonl": str(labels_path),
        "labels_csv": str(csv_path),
        "event_order": GOLFDB_EVENT_ORDER,
        "note": "Unknown GolfDB events are null until advanced 8-event annotation is added.",
    }
