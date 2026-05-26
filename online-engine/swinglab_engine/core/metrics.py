from __future__ import annotations

from .schemas import PhaseMark, SwingMetrics


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def compute_metrics(phases: dict[str, PhaseMark], active_window: tuple[float, float] | None, pose_quality: float | None, motion_quality: float | None) -> SwingMetrics:
    address = phases.get("address")
    top = phases.get("top")
    impact = phases.get("impact")
    finish = phases.get("finish")

    backswing = top.time - address.time if address and top else None
    downswing = impact.time - top.time if top and impact else None
    follow = finish.time - impact.time if finish and impact else None
    duration = finish.time - address.time if finish and address else None
    tempo = backswing / downswing if backswing and downswing and downswing > 0 else None

    phase_conf = sum(p.confidence for p in phases.values()) / max(1, len(phases))
    tempo_score = 70
    if tempo is not None:
        # Common full-swing tempo is often roughly around 3:1; allow broader personal range.
        tempo_score = int(clamp(100 - abs(tempo - 3.0) * 22, 35, 100))
    sequence_score = 70
    if backswing and downswing:
        if backswing <= 0 or downswing <= 0:
            sequence_score = 25
        elif downswing < 0.12:
            sequence_score = 45
        elif downswing > 0.65:
            sequence_score = 55
        else:
            sequence_score = 78
    finish_score = 70 if follow is None else int(clamp(55 + min(follow, 1.2) * 35, 45, 95))
    phase_score = int(clamp(phase_conf * 100, 20, 100))
    pose_score = int(clamp((pose_quality or 0) * 100, 0, 100))
    global_score = int(round(0.35 * phase_score + 0.25 * tempo_score + 0.2 * sequence_score + 0.1 * finish_score + 0.1 * max(pose_score, 45)))

    return SwingMetrics(
        duration=duration,
        active_window_start=active_window[0] if active_window else None,
        active_window_end=active_window[1] if active_window else None,
        backswing=backswing,
        downswing=downswing,
        follow_through=follow,
        tempo=tempo,
        pose_quality=pose_quality,
        motion_quality=motion_quality,
        phase_quality=phase_conf,
        global_score=global_score,
    )


def generate_findings(metrics: SwingMetrics, phases: dict[str, PhaseMark], pose_used: bool) -> tuple[list[str], list[str], list[str], list[str]]:
    findings: list[str] = []
    recommendations: list[str] = []
    drills: list[str] = []
    warnings: list[str] = []

    if metrics.global_score is not None:
        if metrics.global_score >= 78:
            findings.append(f"Análisis consistente: score global {metrics.global_score}/100.")
        elif metrics.global_score >= 60:
            findings.append(f"Análisis útil pero revisable: score global {metrics.global_score}/100.")
        else:
            findings.append(f"Análisis con baja confianza: score global {metrics.global_score}/100. Revisa fases manualmente.")

    if metrics.tempo is not None:
        findings.append(f"Tempo estimado: {metrics.tempo:.2f}:1 (backswing {metrics.backswing:.2f}s / downswing {metrics.downswing:.2f}s).")
        if metrics.tempo < 2.2:
            recommendations.append("El tempo aparece rápido en la transición. Revisa si el Top está bien marcado y si el inicio del downswing es precipitado.")
            drills.append("Pausa controlada en Top: 3 repeticiones lentas manteniendo equilibrio antes de bajar.")
        elif metrics.tempo > 4.2:
            recommendations.append("El downswing aparece muy corto frente al backswing. Revisa Impact y evita que el sistema lo haya colocado tarde.")
            drills.append("Drill 3:1 con metrónomo: subida en tres tiempos y bajada en un tiempo.")
        else:
            recommendations.append("El tempo cae en un rango razonable; prioriza revisar calidad de Top e Impact antes de sacar conclusiones técnicas.")
    else:
        warnings.append("No se pudo calcular tempo; faltan fases clave o están mal ordenadas.")

    low_conf = [name for name, mark in phases.items() if mark.confidence < 0.45]
    if low_conf:
        warnings.append("Fases con baja confianza: " + ", ".join(low_conf) + ".")
        recommendations.append("Corrige primero las fases de baja confianza; esas correcciones serán las que más ayuden a mejorar el motor.")

    if not pose_used:
        warnings.append("Pose corporal no disponible o insuficiente; resultado basado en movimiento y patrón temporal.")
        recommendations.append("Para mejorar el análisis, usa vídeo con cuerpo completo visible, buena luz y cámara fija.")
    else:
        findings.append("Pose corporal utilizada para refinar fases y métricas de cuerpo/manos.")

    if metrics.follow_through is not None and metrics.follow_through < 0.30:
        recommendations.append("Finish muy cercano al impacto; revisa si el vídeo termina pronto o si el finish está mal marcado.")
    elif metrics.follow_through is not None:
        findings.append(f"Follow-through visible: {metrics.follow_through:.2f}s desde Impact a Finish.")

    drills.extend([
        "Revisión fase a fase: confirma Address, Top e Impact antes de guardar el análisis.",
        "Captura Impact: compara manos, cadera y cabeza con Address para priorizar el siguiente ajuste.",
    ])
    return findings, recommendations, drills, warnings
