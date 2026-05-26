from __future__ import annotations

from pathlib import Path
import tempfile
import json
from typing import Any

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError

from ..config import settings
from ..core.analyzer import SwingAnalyzer
from ..core.schemas import AnalysisResult, TrainingCorrection
from ..db.sqlite import save_session, save_correction, training_stats

app = FastAPI(title="Swing Lab Hybrid Engine", version="0.1.2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = SwingAnalyzer()


def _parse_metadata(metadata: str | None) -> dict[str, Any]:
    if not metadata:
        return {}
    try:
        data = json.loads(metadata)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _phase_times_from_record(record: dict[str, Any]) -> dict[str, float]:
    final = record.get("finalPhaseTimes") or record.get("corrected_phases") or record.get("correctedPhases") or {}
    out: dict[str, float] = {}
    for phase in ["address", "takeaway", "top", "impact", "finish"]:
        value = final.get(phase) if isinstance(final, dict) else None
        if isinstance(value, dict):
            value = value.get("time") or value.get("seconds") or value.get("t")
        try:
            if value is not None:
                out[phase] = float(value)
        except Exception:
            pass
    return out


def _training_from_record(record: dict[str, Any]) -> TrainingCorrection:
    session_id = (
        record.get("backendSessionId")
        or record.get("session_id")
        or record.get("sessionId")
        or (record.get("onlineResultSummary") or {}).get("sessionId")
        or (record.get("onlineResultSummary") or {}).get("session_id")
        or (record.get("metrics") or {}).get("backendSessionId")
    )
    payload = {
        "session_id": session_id,
        "user_id": record.get("userId") or record.get("user_id") or "pwa-user",
        "corrected_phases": _phase_times_from_record(record),
        "quality": record.get("quality") or "good",
        "notes": record.get("notes") or record.get("notesForTraining") or "Corrección enviada desde PWA Swing Lab.",
        "view": record.get("view") or record.get("guideMode") or "unknown",
        "club": record.get("club") or "unknown",
        "include_in_training": record.get("include_in_training", True),
    }
    return TrainingCorrection(**payload)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "engine_version": settings.engine_version,
        "api_version": "0.1.2",
        "data_dir": str(settings.data_dir),
        "origins": settings.origins,
        "message": "Swing Lab backend running. Connect PWA Motor to this URL.",
    }


@app.get("/api/model/latest")
def latest_model() -> dict:
    model_file = settings.data_dir / "models" / "latest-model.json"
    if model_file.exists():
        return json.loads(model_file.read_text(encoding="utf-8"))
    return {
        "version": settings.engine_version,
        "type": "server-pose-rules",
        "description": "Backend pose + motion detector; app should call /api/analyze for best results.",
    }


@app.post("/api/analyze", response_model=AnalysisResult)
async def analyze(
    file: UploadFile | None = File(None),
    video: UploadFile | None = File(None),
    metadata: str | None = Form(None),
    view: str = Form("unknown"),
    club: str = Form("unknown"),
    user_id: str | None = Form(None),
    save_video: bool = Form(True),
) -> AnalysisResult:
    upload = file or video
    meta = _parse_metadata(metadata)
    view = (view or meta.get("view") or meta.get("guideMode") or "unknown").replace("-", "_")
    if view == "face-on":
        view = "face_on"
    club = club or meta.get("club") or "unknown"
    user_id = user_id or meta.get("userId") or meta.get("user_id")

    if not upload or not upload.filename:
        raise HTTPException(status_code=400, detail="Missing video file. Use form field 'file' or 'video'.")

    suffix = Path(upload.filename).suffix or ".mp4"
    max_bytes = settings.max_upload_mb * 1024 * 1024
    data = await upload.read()
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File too large. Max {settings.max_upload_mb} MB")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        result = analyzer.analyze_video(tmp_path, view=view, club=club, user_id=user_id, save_video=save_video)
        save_session(result)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


@app.post("/api/training/submit")
async def submit_training(request: Request) -> dict:
    """Accept both direct JSON TrainingCorrection and PWA training records.

    Supported clients:
    - JSON: {session_id, corrected_phases, ...}
    - JSON training record: {backendSessionId, finalPhaseTimes, ...}
    - multipart form: record=<json> [video=<optional ignored here>]
    """
    content_type = request.headers.get("content-type", "")
    try:
        if "multipart/form-data" in content_type:
            form = await request.form()
            raw_record = form.get("record") or form.get("correction")
            if raw_record is None:
                raise HTTPException(status_code=400, detail="Missing multipart field 'record'.")
            data = json.loads(str(raw_record))
        else:
            data = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {exc}") from exc

    try:
        if "corrected_phases" in data and "session_id" in data:
            correction = TrainingCorrection(**data)
        else:
            correction = _training_from_record(data)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json())) from exc

    try:
        record = save_correction(correction)
        return {"status": "saved", "session_id": correction.session_id, "record": record, "stats": training_stats()}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/training/stats")
def stats() -> dict:
    return training_stats()


@app.get("/reports/{session_id}.html")
def report(session_id: str) -> FileResponse:
    path = settings.data_dir / "reports" / f"{session_id}.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="text/html")


@app.get("/captures/{session_id}/{phase}.jpg")
def capture(session_id: str, phase: str) -> FileResponse:
    path = settings.data_dir / "captures" / session_id / f"{phase}.jpg"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Capture not found")
    return FileResponse(path, media_type="image/jpeg")
