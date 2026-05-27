from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from statistics import median
from typing import Any

from ..config import settings
from ..core.phases import PHASES
from ..core.schemas import PhaseMark
from ..db.sqlite import connect, init_db


def _utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        out = float(value)
        if math.isnan(out) or math.isinf(out):
            return None
        return out
    except Exception:
        return None


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _phase_order(phases: dict[str, PhaseMark], duration: float | None = None) -> None:
    """Keep calibrated phase times sensible after applying a bias model."""
    if not phases:
        return
    max_t = float(duration) if duration else max((m.time for m in phases.values()), default=0.0) + 0.5
    min_gap = max(0.025, min(0.08, max_t * 0.018))
    previous = 0.0
    for phase in PHASES:
        if phase not in phases:
            continue
        mark = phases[phase]
        mark.time = _clamp(float(mark.time), 0.0, max_t)
        if mark.time <= previous:
            mark.time = _clamp(previous + min_gap, 0.0, max_t)
            mark.confidence = max(0.0, mark.confidence * 0.90)
            mark.reason = ((mark.reason or "") + " calibrated_order_guard").strip()
        previous = mark.time


@dataclass
class CorrectionExample:
    session_id: str
    view: str
    club: str
    quality: str
    auto_phases: dict[str, float]
    corrected_phases: dict[str, float]
    errors: dict[str, float]


def load_training_examples(include_doubtful: bool = True) -> list[CorrectionExample]:
    """Load validated training corrections from SQLite.

    Error convention: corrected_time - auto_time.
    Negative error means the engine detected the phase too late.
    Positive error means the engine detected it too early.
    """
    init_db()
    qualities = {"good"}
    if include_doubtful:
        qualities.add("doubtful")
    examples: list[CorrectionExample] = []
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT c.session_id, c.quality, c.corrected_json, c.error_json, s.result_json, s.view, s.club
            FROM corrections c
            JOIN sessions s ON s.session_id = c.session_id
            WHERE c.include_in_training = 1
            ORDER BY c.created_at ASC, c.id ASC
            """
        ).fetchall()
    for row in rows:
        quality = (row["quality"] or "good").lower()
        if quality not in qualities:
            continue
        try:
            corrected_payload = json.loads(row["corrected_json"] or "{}")
            result_payload = json.loads(row["result_json"] or "{}")
            errors_payload = json.loads(row["error_json"] or "{}")
        except Exception:
            continue

        corrected = corrected_payload.get("corrected_phases") or {}
        auto: dict[str, float] = {}
        result_phases = result_payload.get("phases") or {}
        for phase in PHASES:
            mark = result_phases.get(phase) or {}
            value = _safe_float(mark.get("time")) if isinstance(mark, dict) else None
            if value is not None:
                auto[phase] = value

        errors: dict[str, float] = {}
        for phase in PHASES:
            c = _safe_float(corrected.get(phase)) if isinstance(corrected, dict) else None
            a = auto.get(phase)
            e = _safe_float(errors_payload.get(phase)) if isinstance(errors_payload, dict) else None
            if e is None and c is not None and a is not None:
                e = c - a
            if c is not None and a is not None and e is not None:
                errors[phase] = e

        if not errors:
            continue
        examples.append(
            CorrectionExample(
                session_id=row["session_id"],
                view=(row["view"] or corrected_payload.get("view") or "unknown").replace("-", "_"),
                club=(row["club"] or corrected_payload.get("club") or "unknown"),
                quality=quality,
                auto_phases=auto,
                corrected_phases={k: float(v) for k, v in (corrected or {}).items() if _safe_float(v) is not None},
                errors=errors,
            )
        )
    return examples


def summarize_examples(examples: list[CorrectionExample]) -> dict[str, Any]:
    by_phase: dict[str, list[float]] = {phase: [] for phase in PHASES}
    by_group: dict[str, dict[str, list[float]]] = {}
    for ex in examples:
        group = f"{ex.view}:{ex.club}"
        by_group.setdefault(group, {phase: [] for phase in PHASES})
        for phase, err in ex.errors.items():
            by_phase.setdefault(phase, []).append(err)
            by_group[group].setdefault(phase, []).append(err)

    def phase_summary(values: list[float]) -> dict[str, Any]:
        abs_vals = [abs(v) for v in values]
        signed = _mean(values)
        if not values:
            tendency = "no_data"
        elif signed is not None and signed < -0.05:
            tendency = "engine_late"
        elif signed is not None and signed > 0.05:
            tendency = "engine_early"
        else:
            tendency = "balanced"
        return {
            "count": len(values),
            "mean_signed_error_s": signed,
            "mean_abs_error_s": _mean(abs_vals),
            "median_abs_error_s": float(median(abs_vals)) if abs_vals else None,
            "max_abs_error_s": max(abs_vals) if abs_vals else None,
            "recommended_bias_s": signed,
            "tendency": tendency,
        }

    phase_stats = {phase: phase_summary(values) for phase, values in by_phase.items() if values}
    group_stats = {
        group: {phase: phase_summary(values) for phase, values in phases.items() if values}
        for group, phases in by_group.items()
    }
    worst_phase = None
    worst_value = -1.0
    for phase, stats in phase_stats.items():
        mae = stats.get("mean_abs_error_s")
        if mae is not None and mae > worst_value:
            worst_phase = phase
            worst_value = float(mae)
    return {
        "training_corrections": len(examples),
        "phase_stats": phase_stats,
        "group_stats": group_stats,
        "worst_phase": worst_phase,
        "worst_phase_mean_abs_error_s": worst_value if worst_phase else None,
    }


def build_calibration_model(min_group_samples: int = 3, include_doubtful: bool = True) -> dict[str, Any]:
    examples = load_training_examples(include_doubtful=include_doubtful)
    summary = summarize_examples(examples)
    global_bias: dict[str, dict[str, Any]] = {}
    for phase, stats in summary.get("phase_stats", {}).items():
        bias = stats.get("recommended_bias_s")
        if bias is not None:
            # Avoid wild jumps from a small dataset; corrections remain conservative.
            global_bias[phase] = {
                "bias_s": _clamp(float(bias), -0.75, 0.75),
                "count": stats.get("count", 0),
                "mean_abs_error_s": stats.get("mean_abs_error_s"),
            }

    group_biases: dict[str, dict[str, Any]] = {}
    for group, phases in summary.get("group_stats", {}).items():
        out: dict[str, Any] = {}
        for phase, stats in phases.items():
            count = int(stats.get("count") or 0)
            bias = stats.get("recommended_bias_s")
            if count >= min_group_samples and bias is not None:
                out[phase] = {
                    "bias_s": _clamp(float(bias), -0.75, 0.75),
                    "count": count,
                    "mean_abs_error_s": stats.get("mean_abs_error_s"),
                }
        if out:
            group_biases[group] = out

    model = {
        "version": f"calibrated-phase-bias-{_utc_stamp()}",
        "type": "phase_bias_calibration",
        "base_engine_version": settings.engine_version,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "description": "Calibration model generated from corrected Swing Lab sessions. Applies signed phase-time bias after pose/motion detection.",
        "training_corrections": len(examples),
        "min_group_samples": min_group_samples,
        "phase_bias_seconds": {
            "global": global_bias,
            "groups": group_biases,
        },
        "training_summary": summary,
        "application_order": ["exact view:club group", "global phase bias", "raw detector output"],
        "notes": [
            "Negative bias means the previous engine was usually late and the calibrated model moves the phase earlier.",
            "This is a conservative calibration layer, not a neural network yet.",
            "Keep correcting phases. The model becomes more useful as the dataset grows.",
        ],
    }
    return model


def model_path() -> Path:
    settings.ensure_dirs()
    return settings.data_dir / "models" / "latest-model.json"


def save_latest_model(model: dict[str, Any]) -> Path:
    path = model_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_latest_model() -> dict[str, Any] | None:
    path = model_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def recalibrate_and_save(min_group_samples: int = 3, include_doubtful: bool = True) -> dict[str, Any]:
    model = build_calibration_model(min_group_samples=min_group_samples, include_doubtful=include_doubtful)
    path = save_latest_model(model)
    return {"status": "saved", "path": str(path), "model": model}


def _select_bias(model: dict[str, Any], phase: str, view: str, club: str) -> tuple[float | None, str | None]:
    if not model or model.get("type") != "phase_bias_calibration":
        return None, None
    biases = model.get("phase_bias_seconds") or {}
    groups = biases.get("groups") or {}
    global_bias = biases.get("global") or {}
    key = f"{(view or 'unknown').replace('-', '_')}:{club or 'unknown'}"
    if key in groups and phase in groups[key]:
        return _safe_float(groups[key][phase].get("bias_s")), f"group:{key}"
    if phase in global_bias:
        return _safe_float(global_bias[phase].get("bias_s")), "global"
    return None, None


def apply_calibration_to_phases(
    phases: dict[str, PhaseMark],
    *,
    view: str,
    club: str,
    duration: float | None = None,
    model: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply active calibration model in-place and return debug information."""
    model = model if model is not None else load_latest_model()
    if not model:
        return {"applied": False, "reason": "no_latest_model"}
    adjustments: dict[str, Any] = {}
    for phase in PHASES:
        if phase not in phases:
            continue
        bias, source = _select_bias(model, phase, view, club)
        if bias is None or abs(bias) < 1e-6:
            continue
        mark = phases[phase]
        before = float(mark.time)
        mark.time = before + float(bias)
        mark.confidence = min(0.98, max(0.0, mark.confidence + 0.04))
        mark.source = f"{mark.source}+calibrated" if "calibrated" not in mark.source else mark.source
        mark.reason = ((mark.reason or "") + f" calibration:{source}:{bias:+.3f}s").strip()
        adjustments[phase] = {"before": before, "after": mark.time, "bias_s": bias, "source": source}
    if adjustments:
        _phase_order(phases, duration)
    return {
        "applied": bool(adjustments),
        "model_version": model.get("version"),
        "adjustments": adjustments,
        "training_corrections": model.get("training_corrections"),
    }


def estimate_model_error(model: dict[str, Any] | None = None) -> dict[str, Any]:
    """Estimate pre/post calibration error on the current training set.

    This is a training-set estimate, not a true holdout benchmark. It is useful now
    because the dataset is small and we mainly need to know the direction of improvement.
    """
    examples = load_training_examples(include_doubtful=True)
    model = model if model is not None else load_latest_model()
    before: dict[str, list[float]] = {phase: [] for phase in PHASES}
    after: dict[str, list[float]] = {phase: [] for phase in PHASES}
    for ex in examples:
        for phase in PHASES:
            if phase not in ex.auto_phases or phase not in ex.corrected_phases:
                continue
            raw_err = ex.corrected_phases[phase] - ex.auto_phases[phase]
            before[phase].append(abs(raw_err))
            calibrated_auto = ex.auto_phases[phase]
            if model:
                bias, _ = _select_bias(model, phase, ex.view, ex.club)
                if bias is not None:
                    calibrated_auto += float(bias)
            after_err = ex.corrected_phases[phase] - calibrated_auto
            after[phase].append(abs(after_err))

    def summarize(vals: list[float]) -> dict[str, Any]:
        return {
            "count": len(vals),
            "mean_abs_error_s": _mean(vals),
            "median_abs_error_s": float(median(vals)) if vals else None,
            "max_abs_error_s": max(vals) if vals else None,
        }

    phases = {}
    for phase in PHASES:
        b = summarize(before.get(phase, []))
        a = summarize(after.get(phase, []))
        improvement = None
        if b["mean_abs_error_s"] is not None and a["mean_abs_error_s"] is not None:
            improvement = b["mean_abs_error_s"] - a["mean_abs_error_s"]
        phases[phase] = {"before": b, "after": a, "improvement_s": improvement}
    total_before = [v for vals in before.values() for v in vals]
    total_after = [v for vals in after.values() for v in vals]
    return {
        "model_version": model.get("version") if model else None,
        "training_corrections": len(examples),
        "warning": "training_set_estimate_not_holdout_benchmark",
        "overall": {
            "before_mean_abs_error_s": _mean(total_before),
            "after_mean_abs_error_s": _mean(total_after),
            "improvement_s": (_mean(total_before) - _mean(total_after)) if total_before and total_after else None,
        },
        "phases": phases,
    }
