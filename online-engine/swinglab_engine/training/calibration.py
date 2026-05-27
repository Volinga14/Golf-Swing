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


def _mad(values: list[float]) -> float:
    if not values:
        return 0.0
    med = float(median(values))
    return float(median([abs(v - med) for v in values]))


def _robust_values(values: list[float], *, min_keep: int = 4) -> tuple[list[float], int]:
    """Remove extreme outliers, but keep small datasets mostly intact."""
    if len(values) < min_keep:
        return values[:], 0
    med = float(median(values))
    mad = _mad(values)
    if mad < 1e-6:
        mad = max(0.10, float(median([abs(v) for v in values])) * 0.30)
    limit = max(0.35, 3.2 * mad)
    kept = [v for v in values if abs(v - med) <= limit]
    if len(kept) < max(3, len(values) // 2):
        return values[:], 0
    return kept, len(values) - len(kept)


def _robust_bias(values: list[float]) -> tuple[float | None, dict[str, Any]]:
    if not values:
        return None, {"count": 0}
    kept, removed = _robust_values(values)
    med = float(median(kept))
    mean = float(sum(kept) / len(kept))
    # Blend median and mean. Median gives stability; mean gives faster learning when all errors point one way.
    bias = 0.62 * med + 0.38 * mean
    # Shrink for small samples, but less conservatively than v1.2 so the engine improves faster.
    count = len(kept)
    if count < 4:
        shrink = 0.55
    elif count < 8:
        shrink = 0.78
    elif count < 14:
        shrink = 0.92
    else:
        shrink = 1.0
    bias *= shrink
    return bias, {
        "count": len(values),
        "kept_count": count,
        "outliers_removed": removed,
        "median_error_s": med,
        "trimmed_mean_error_s": mean,
        "shrink_factor": shrink,
    }


def _phase_cap(phase: str) -> float:
    # Faster than v1.2: Impact/Finish can be very late if the wrong video window is selected.
    return {
        "address": 0.75,
        "takeaway": 1.25,
        "top": 1.55,
        "impact": 1.85,
        "finish": 1.85,
    }.get(phase, 1.25)


def _phase_order(phases: dict[str, PhaseMark], duration: float | None = None) -> None:
    if not phases:
        return
    max_t = float(duration) if duration else max((m.time for m in phases.values()), default=0.0) + 0.5
    gaps = {
        "address->takeaway": 0.08,
        "takeaway->top": 0.18,
        "top->impact": 0.12,
        "impact->finish": 0.20,
    }
    previous = 0.0
    previous_phase = None
    for phase in PHASES:
        if phase not in phases:
            continue
        mark = phases[phase]
        mark.time = _clamp(float(mark.time), 0.0, max_t)
        gap = gaps.get(f"{previous_phase}->{phase}", 0.025) if previous_phase else 0.0
        if mark.time <= previous + gap:
            mark.time = _clamp(previous + gap, 0.0, max_t)
            mark.confidence = max(0.0, mark.confidence * 0.90)
            mark.reason = ((mark.reason or "") + " calibrated_order_guard_v13").strip()
        previous = mark.time
        previous_phase = phase


@dataclass
class CorrectionExample:
    session_id: str
    view: str
    club: str
    quality: str
    auto_phases: dict[str, float]
    corrected_phases: dict[str, float]
    errors: dict[str, float]
    duration: float | None = None
    active_window: tuple[float, float] | None = None


def _extract_duration_and_active(result_payload: dict[str, Any]) -> tuple[float | None, tuple[float, float] | None]:
    duration = None
    active = None
    try:
        duration = _safe_float(((result_payload.get("debug") or {}).get("video_meta") or {}).get("duration"))
    except Exception:
        duration = None
    try:
        raw = ((result_payload.get("debug") or {}).get("detection") or {}).get("active_window")
        if isinstance(raw, list) and len(raw) >= 2:
            a, b = _safe_float(raw[0]), _safe_float(raw[1])
            if a is not None and b is not None and b > a:
                active = (a, b)
    except Exception:
        active = None
    return duration, active


def load_training_examples(include_doubtful: bool = True, latest_per_session: bool = True) -> list[CorrectionExample]:
    """Load validated training corrections.

    Error convention: corrected_time - auto_time.
    Negative error means the engine detected the phase too late.
    Positive error means it detected too early.
    v1.3 uses the latest correction per session by default so repeated testing does not skew the model.
    """
    init_db()
    qualities = {"good"}
    if include_doubtful:
        qualities.add("doubtful")

    with connect() as conn:
        if latest_per_session:
            rows = conn.execute(
                """
                SELECT c.session_id, c.quality, c.corrected_json, c.error_json, s.result_json, s.view, s.club, c.id
                FROM corrections c
                JOIN sessions s ON s.session_id = c.session_id
                JOIN (
                    SELECT session_id, MAX(id) AS max_id
                    FROM corrections
                    WHERE include_in_training = 1
                    GROUP BY session_id
                ) latest ON latest.max_id = c.id
                WHERE c.include_in_training = 1
                ORDER BY c.created_at ASC, c.id ASC
                """
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT c.session_id, c.quality, c.corrected_json, c.error_json, s.result_json, s.view, s.club, c.id
                FROM corrections c
                JOIN sessions s ON s.session_id = c.session_id
                WHERE c.include_in_training = 1
                ORDER BY c.created_at ASC, c.id ASC
                """
            ).fetchall()

    examples: list[CorrectionExample] = []
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
        clean_corrected: dict[str, float] = {}
        for phase in PHASES:
            c = _safe_float(corrected.get(phase)) if isinstance(corrected, dict) else None
            a = auto.get(phase)
            e = _safe_float(errors_payload.get(phase)) if isinstance(errors_payload, dict) else None
            if e is None and c is not None and a is not None:
                e = c - a
            if c is not None:
                clean_corrected[phase] = c
            if c is not None and a is not None and e is not None:
                # Ignore clearly impossible typo corrections for now.
                if abs(e) <= 10.0:
                    errors[phase] = e

        if not errors:
            continue
        duration, active = _extract_duration_and_active(result_payload)
        examples.append(
            CorrectionExample(
                session_id=row["session_id"],
                view=(row["view"] or corrected_payload.get("view") or "unknown").replace("-", "_"),
                club=(row["club"] or corrected_payload.get("club") or "unknown"),
                quality=quality,
                auto_phases=auto,
                corrected_phases=clean_corrected,
                errors=errors,
                duration=duration,
                active_window=active,
            )
        )
    return examples


def _duration_stats(examples: list[CorrectionExample]) -> dict[str, Any]:
    backswing, takeaway_ratio, downswing, downswing_ratio, followthrough, span = [], [], [], [], [], []
    for ex in examples:
        p = ex.corrected_phases
        try:
            a, tw, top, imp, fin = p["address"], p["takeaway"], p["top"], p["impact"], p["finish"]
        except KeyError:
            continue
        if not (a < tw < top < imp < fin):
            continue
        b = top - a
        d = imp - top
        f = fin - imp
        s = fin - a
        if 0.25 <= b <= 3.0:
            backswing.append(b)
        if b > 0.25 and 0.05 <= tw - a <= b:
            takeaway_ratio.append((tw - a) / b)
        if 0.12 <= d <= 1.2:
            downswing.append(d)
        if b > 0.25 and 0.10 <= d / b <= 0.85:
            downswing_ratio.append(d / b)
        if 0.18 <= f <= 2.2:
            followthrough.append(f)
        if 0.7 <= s <= 4.5:
            span.append(s)

    def med(values: list[float]) -> float | None:
        return float(median(values)) if values else None

    return {
        "count": len(examples),
        "backswing_s_median": med(backswing),
        "takeaway_of_backswing_ratio_median": med(takeaway_ratio),
        "downswing_s_median": med(downswing),
        "downswing_to_backswing_ratio_median": med(downswing_ratio),
        "followthrough_s_median": med(followthrough),
        "swing_span_s_median": med(span),
        "samples": {
            "backswing": len(backswing),
            "takeaway_ratio": len(takeaway_ratio),
            "downswing": len(downswing),
            "downswing_ratio": len(downswing_ratio),
            "followthrough": len(followthrough),
            "span": len(span),
        },
    }


def summarize_examples(examples: list[CorrectionExample]) -> dict[str, Any]:
    by_phase: dict[str, list[float]] = {phase: [] for phase in PHASES}
    by_group: dict[str, dict[str, list[float]]] = {}
    raw_outliers: dict[str, int] = {phase: 0 for phase in PHASES}
    for ex in examples:
        group = f"{ex.view}:{ex.club}"
        by_group.setdefault(group, {phase: [] for phase in PHASES})
        for phase, err in ex.errors.items():
            by_phase.setdefault(phase, []).append(err)
            by_group[group].setdefault(phase, []).append(err)

    def phase_summary(values: list[float]) -> dict[str, Any]:
        kept, removed = _robust_values(values)
        abs_vals = [abs(v) for v in values]
        kept_abs = [abs(v) for v in kept]
        signed = _mean(values)
        robust_signed = _mean(kept)
        if not values:
            tendency = "no_data"
        elif robust_signed is not None and robust_signed < -0.05:
            tendency = "engine_late"
        elif robust_signed is not None and robust_signed > 0.05:
            tendency = "engine_early"
        else:
            tendency = "balanced"
        bias, binfo = _robust_bias(values)
        return {
            "count": len(values),
            "used_count": len(kept),
            "outliers_removed": removed,
            "mean_signed_error_s": signed,
            "robust_mean_signed_error_s": robust_signed,
            "mean_abs_error_s": _mean(abs_vals),
            "robust_mean_abs_error_s": _mean(kept_abs),
            "median_abs_error_s": float(median(abs_vals)) if abs_vals else None,
            "max_abs_error_s": max(abs_vals) if abs_vals else None,
            "recommended_bias_s": bias,
            "bias_info": binfo,
            "tendency": tendency,
        }

    phase_stats = {phase: phase_summary(values) for phase, values in by_phase.items() if values}
    for phase, stats in phase_stats.items():
        raw_outliers[phase] = int(stats.get("outliers_removed") or 0)
    group_stats = {
        group: {phase: phase_summary(values) for phase, values in phases.items() if values}
        for group, phases in by_group.items()
    }
    worst_phase = None
    worst_value = -1.0
    for phase, stats in phase_stats.items():
        mae = stats.get("robust_mean_abs_error_s") or stats.get("mean_abs_error_s")
        if mae is not None and mae > worst_value:
            worst_phase = phase
            worst_value = float(mae)
    return {
        "training_corrections": len(examples),
        "phase_stats": phase_stats,
        "group_stats": group_stats,
        "duration_template": _duration_stats(examples),
        "outliers_by_phase": raw_outliers,
        "worst_phase": worst_phase,
        "worst_phase_mean_abs_error_s": worst_value if worst_phase else None,
    }


def build_calibration_model(min_group_samples: int = 3, include_doubtful: bool = True) -> dict[str, Any]:
    examples = load_training_examples(include_doubtful=include_doubtful, latest_per_session=True)
    summary = summarize_examples(examples)
    global_bias: dict[str, dict[str, Any]] = {}
    for phase, stats in summary.get("phase_stats", {}).items():
        bias = stats.get("recommended_bias_s")
        if bias is not None:
            cap = _phase_cap(phase)
            global_bias[phase] = {
                "bias_s": _clamp(float(bias), -cap, cap),
                "count": stats.get("count", 0),
                "used_count": stats.get("used_count", 0),
                "mean_abs_error_s": stats.get("mean_abs_error_s"),
                "robust_mean_abs_error_s": stats.get("robust_mean_abs_error_s"),
                "outliers_removed": stats.get("outliers_removed", 0),
            }

    group_biases: dict[str, dict[str, Any]] = {}
    for group, phases in summary.get("group_stats", {}).items():
        out: dict[str, Any] = {}
        for phase, stats in phases.items():
            count = int(stats.get("used_count") or stats.get("count") or 0)
            bias = stats.get("recommended_bias_s")
            if count >= min_group_samples and bias is not None:
                cap = _phase_cap(phase)
                out[phase] = {
                    "bias_s": _clamp(float(bias), -cap, cap),
                    "count": stats.get("count", 0),
                    "used_count": count,
                    "mean_abs_error_s": stats.get("mean_abs_error_s"),
                    "robust_mean_abs_error_s": stats.get("robust_mean_abs_error_s"),
                    "outliers_removed": stats.get("outliers_removed", 0),
                }
        if out:
            group_biases[group] = out

    # Temporal templates are not hard labels. They regularize gaps after bias correction.
    global_template = summary.get("duration_template") or {}
    group_templates: dict[str, Any] = {}
    groups: dict[str, list[CorrectionExample]] = {}
    for ex in examples:
        groups.setdefault(f"{ex.view}:{ex.club}", []).append(ex)
    for group, exs in groups.items():
        if len(exs) >= min_group_samples:
            group_templates[group] = _duration_stats(exs)

    model = {
        "version": f"dtl-calibrated-v13-{_utc_stamp()}",
        "type": "phase_bias_and_template_calibration",
        "base_engine_version": settings.engine_version,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "description": "Robust DTL calibration generated from corrected Swing Lab sessions. Applies phase bias and temporal gap regularisation after pose/motion detection.",
        "training_corrections": len(examples),
        "min_group_samples": min_group_samples,
        "phase_bias_seconds": {"global": global_bias, "groups": group_biases},
        "temporal_templates": {"global": global_template, "groups": group_templates},
        "training_summary": summary,
        "application_order": ["exact view:club group", "global phase bias", "temporal gap regularisation", "raw detector output"],
        "notes": [
            "Negative bias means the previous engine was usually late and the calibrated model moves the phase earlier.",
            "v1.3 uses robust statistics and latest correction per session to learn faster without letting obvious outliers dominate.",
            "The temporal template regularises Top→Impact and Impact→Finish gaps for DTL swings.",
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
    if not model or model.get("type") not in {"phase_bias_calibration", "phase_bias_and_template_calibration"}:
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


def _select_template(model: dict[str, Any], view: str, club: str) -> tuple[dict[str, Any] | None, str | None]:
    if not model or model.get("type") != "phase_bias_and_template_calibration":
        return None, None
    temps = model.get("temporal_templates") or {}
    groups = temps.get("groups") or {}
    key = f"{(view or 'unknown').replace('-', '_')}:{club or 'unknown'}"
    if key in groups:
        return groups[key], f"group:{key}"
    return temps.get("global"), "global"


def _blend_if_far(current: float, target: float, *, tolerance: float, weight: float) -> float:
    if abs(current - target) <= tolerance:
        return current
    return (1.0 - weight) * current + weight * target


def _apply_temporal_template(phases: dict[str, PhaseMark], template: dict[str, Any], duration: float | None) -> dict[str, Any]:
    if not template or not all(k in phases for k in PHASES):
        return {"applied": False, "reason": "missing_template_or_phases"}
    adjustments: dict[str, Any] = {}
    address = phases["address"].time
    top = phases["top"].time
    impact = phases["impact"].time
    finish = phases["finish"].time
    backswing = max(top - address, 0.25)

    take_ratio = _safe_float(template.get("takeaway_of_backswing_ratio_median"))
    down_ratio = _safe_float(template.get("downswing_to_backswing_ratio_median"))
    down_abs = _safe_float(template.get("downswing_s_median"))
    follow_abs = _safe_float(template.get("followthrough_s_median"))

    if take_ratio is not None and "takeaway" in phases:
        target = address + _clamp(take_ratio, 0.12, 0.55) * backswing
        before = phases["takeaway"].time
        phases["takeaway"].time = _blend_if_far(before, target, tolerance=0.16, weight=0.35)
        if abs(phases["takeaway"].time - before) > 1e-5:
            adjustments["takeaway"] = {"before": before, "after": phases["takeaway"].time, "target": target}

    if down_ratio is not None or down_abs is not None:
        candidates = []
        if down_ratio is not None:
            candidates.append(_clamp(down_ratio, 0.12, 0.70) * backswing)
        if down_abs is not None:
            candidates.append(_clamp(down_abs, 0.14, 0.90))
        expected_down = float(median(candidates)) if candidates else None
        if expected_down is not None:
            target = top + expected_down
            before = phases["impact"].time
            phases["impact"].time = _blend_if_far(before, target, tolerance=0.18, weight=0.48)
            if abs(phases["impact"].time - before) > 1e-5:
                adjustments["impact"] = {"before": before, "after": phases["impact"].time, "target": target}

    if follow_abs is not None:
        impact = phases["impact"].time
        target = impact + _clamp(follow_abs, 0.22, 1.60)
        before = phases["finish"].time
        phases["finish"].time = _blend_if_far(before, target, tolerance=0.22, weight=0.38)
        if abs(phases["finish"].time - before) > 1e-5:
            adjustments["finish"] = {"before": before, "after": phases["finish"].time, "target": target}

    if adjustments:
        _phase_order(phases, duration)
    return {"applied": bool(adjustments), "adjustments": adjustments}


def apply_calibration_to_phases(
    phases: dict[str, PhaseMark],
    *,
    view: str,
    club: str,
    duration: float | None = None,
    model: dict[str, Any] | None = None,
) -> dict[str, Any]:
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
        mark.confidence = min(0.98, max(0.0, mark.confidence + 0.05))
        mark.source = f"{mark.source}+calibrated" if "calibrated" not in mark.source else mark.source
        mark.reason = ((mark.reason or "") + f" calibration:{source}:{bias:+.3f}s").strip()
        adjustments[phase] = {"before": before, "after": mark.time, "bias_s": bias, "source": source}
    if adjustments:
        _phase_order(phases, duration)

    template, template_source = _select_template(model, view, club)
    template_debug = _apply_temporal_template(phases, template or {}, duration) if template else {"applied": False, "reason": "no_template"}
    if template_debug.get("applied"):
        for phase in template_debug.get("adjustments", {}):
            if phase in phases:
                phases[phase].source = f"{phases[phase].source}+template"
                phases[phase].reason = ((phases[phase].reason or "") + f" template:{template_source}").strip()

    return {
        "applied": bool(adjustments) or bool(template_debug.get("applied")),
        "model_version": model.get("version"),
        "model_type": model.get("type"),
        "bias_adjustments": adjustments,
        "template": {"source": template_source, **template_debug},
        "training_corrections": model.get("training_corrections"),
    }


def estimate_model_error(model: dict[str, Any] | None = None) -> dict[str, Any]:
    examples = load_training_examples(include_doubtful=True, latest_per_session=True)
    model = model if model is not None else load_latest_model()
    before: dict[str, list[float]] = {phase: [] for phase in PHASES}
    after: dict[str, list[float]] = {phase: [] for phase in PHASES}
    outlier_counts: dict[str, int] = {phase: 0 for phase in PHASES}

    # Evaluate bias part exactly. Temporal-template effect is approximated by applying it to PhaseMark copies.
    for ex in examples:
        raw_marks = {p: PhaseMark(time=t, confidence=0.5) for p, t in ex.auto_phases.items()}
        if model:
            apply_calibration_to_phases(raw_marks, view=ex.view, club=ex.club, duration=ex.duration, model=model)
        for phase in PHASES:
            if phase not in ex.auto_phases or phase not in ex.corrected_phases:
                continue
            raw_err = ex.corrected_phases[phase] - ex.auto_phases[phase]
            before[phase].append(abs(raw_err))
            calibrated_auto = raw_marks.get(phase).time if phase in raw_marks else ex.auto_phases[phase]
            after_err = ex.corrected_phases[phase] - calibrated_auto
            after[phase].append(abs(after_err))

    def summarize(vals: list[float]) -> dict[str, Any]:
        kept, removed = _robust_values(vals)
        return {
            "count": len(vals),
            "used_count": len(kept),
            "outliers_removed": removed,
            "mean_abs_error_s": _mean(vals),
            "robust_mean_abs_error_s": _mean(kept),
            "median_abs_error_s": float(median(vals)) if vals else None,
            "max_abs_error_s": max(vals) if vals else None,
        }

    phases = {}
    for phase in PHASES:
        b = summarize(before.get(phase, []))
        a = summarize(after.get(phase, []))
        improvement = None
        base = b.get("mean_abs_error_s")
        new = a.get("mean_abs_error_s")
        if base is not None and new is not None:
            improvement = base - new
        phases[phase] = {"before": b, "after": a, "improvement_s": improvement}
        outlier_counts[phase] = int(b.get("outliers_removed") or 0)
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
        "outliers_by_phase": outlier_counts,
    }
