export function buildRecommendations(state, metrics) {
  if (!metrics.hasVideo) {
    return {
      summary: "Carga un vídeo para crear el primer análisis.",
      primaryIssue: "Vídeo pendiente",
      confidenceLabel: "Sin análisis",
      evidence: "El MVP necesita duración y frames para calcular eventos, tempo y exportar una sesión útil.",
      drill: {
        name: "Captura guiada",
        description: "Graba con cámara fija, buena luz y jugador completo visible durante todo el swing."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  if (metrics.eventsMarked && !metrics.eventsOrdered) {
    return {
      summary: "Revisa el orden de las fases marcadas.",
      primaryIssue: "Fases fuera de orden",
      confidenceLabel: "Confianza baja",
      evidence: "Las fases deben avanzar en el tiempo: address, top, impact y finish.",
      drill: {
        name: "Corrección de timeline",
        description: "Mueve el vídeo frame a frame y vuelve a marcar cada fase en orden cronológico."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  if (!metrics.eventsComplete) {
    return {
      summary: "Marca o detecta las cuatro fases principales para desbloquear el reporte.",
      primaryIssue: "Faltan fases clave",
      confidenceLabel: "Confianza baja",
      evidence: "Address, top, impact y finish permiten calcular tempo y timing.",
      drill: {
        name: "Detección guiada",
        description: "Usa detectar fases y corrige manualmente cualquier frame que no coincida."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  const findings = [];
  if (metrics.captureScore < 70) {
    findings.push({
      issue: "La captura limita la lectura",
      source: "Heurística",
      score: metrics.captureScore,
      confidence: 0.72,
      evidence: "La app necesita cuerpo, palo y bola visibles para que las métricas tengan sentido.",
      drill: "Repetir captura",
      description: "Graba a 60 FPS o más, con cámara fija, buena luz y jugador completo en plano.",
      nextMetric: "Capture score"
    });
  }

  if (metrics.tempoRatio && (metrics.tempoRatio < 2.4 || metrics.tempoRatio > 3.8)) {
    findings.push({
      issue: "Tempo poco estable",
      source: "Heurística",
      score: metrics.tempoScore,
      confidence: 0.68,
      evidence: `El tempo marcado es ${metrics.tempoRatio.toFixed(2)}:1 entre backswing y downswing.`,
      drill: "3:1 tempo drill",
      description: "Cuenta 1-2-3 en la subida y 1 en la bajada, manteniendo la misma velocidad de rutina.",
      nextMetric: "Tempo ratio"
    });
  }

  if (metrics.headStability < 62) {
    findings.push({
      issue: state.viewType === "FO" ? "Posible sway lateral" : "Posible inestabilidad de cabeza",
      source: "Heurística",
      score: metrics.headStability,
      confidence: 0.64,
      evidence: "La métrica automática sugiere revisar address contra top antes de confiar en la lectura.",
      drill: "Pivot sobre eje central",
      description: "Haz swings cortos sintiendo que el pecho rota alrededor de un eje estable.",
      nextMetric: "Head stability"
    });
  }

  if (state.viewType === "DTL" && metrics.postureRetention < 66) {
    findings.push({
      issue: "Posible pérdida de postura",
      source: "Heurística",
      score: metrics.postureRetention,
      confidence: 0.66,
      evidence: "Revisar visualmente entre address e impact. La métrica revisable sugiere que podría perderse espacio/postura antes del contacto.",
      drill: "Chair drill",
      description: "Coloca una silla detrás de la cadera y conserva el contacto suave hasta después del impacto.",
      nextMetric: "Posture retention"
    });
  }

  if (state.viewType === "FO" && metrics.postureRetention < 60) {
    findings.push({
      issue: "Posible eje cambiante en impacto",
      source: "Heurística",
      score: metrics.postureRetention,
      confidence: 0.58,
      evidence: "En FO, revisa si cabeza y pecho se desplazan demasiado antes de impacto.",
      drill: "Step-through controlado",
      description: "Haz medio swing dejando que el peso avance sin que el torso se lance hacia la bola.",
      nextMetric: "Impact posture"
    });
  }

  if (state.viewType === "DTL" && metrics.handPath < 62) {
    findings.push({
      issue: "Posible ruta de manos hacia fuera",
      source: "Heurística",
      score: metrics.handPath,
      confidence: 0.61,
      evidence: "La transición top-impact queda como punto a revisar con las líneas del visor.",
      drill: "Pump drill bajo plano",
      description: "Pausa en top, baja manos hacia el bolsillo trasero y golpea medio swing.",
      nextMetric: "Hand path DTL"
    });
  }

  if (metrics.finishBalance < 65) {
    findings.push({
      issue: "Posible finish poco estable",
      source: "Heurística",
      score: metrics.finishBalance,
      confidence: 0.7,
      evidence: "El equilibrio final está por debajo del umbral inicial del MVP.",
      drill: "Hold finish",
      description: "Mantén el finish tres segundos mirando el objetivo después de cada bola.",
      nextMetric: "Finish balance"
    });
  }

  if (metrics.holdFinishSec != null && metrics.holdFinishSec < 0.45) {
    findings.push({
      issue: "Posible finish demasiado corto",
      source: "Heurística",
      score: Math.round(metrics.holdFinishSec * 100),
      confidence: 0.63,
      evidence: `El finish queda marcado solo ${metrics.holdFinishSec.toFixed(2)} s después del impacto.`,
      drill: "Finish freeze",
      description: "Golpea al 70% y congela el finish hasta que la bola aterrice.",
      nextMetric: "Hold finish time"
    });
  }

  const sorted = findings.sort((a, b) => a.score - b.score);
  const primary = sorted[0] || {
    issue: "Swing equilibrado para el MVP",
    score: metrics.overallScore,
    confidence: 0.58,
    source: "Heurística",
    evidence: "Las métricas están en rango razonable. Conviene acumular historial con el mismo encuadre.",
    drill: "Repetición de referencia",
    description: "Guarda este swing como referencia y compara la próxima sesión con la misma vista y palo.",
    nextMetric: "Consistencia"
  };

  return {
    summary: buildSummary(state, metrics, primary),
    primaryIssue: primary.issue,
    confidenceLabel: confidenceLabel(metrics.confidence),
    evidence: primary.evidence,
    evidenceSource: primary.source || "Heurística",
    drill: {
      name: primary.drill,
      description: primary.description
    },
    nextMetric: primary.nextMetric,
    recommendations: sorted.slice(0, 5).map((item) => ({
      ...item,
      confidenceLabel: confidenceLabel(Math.round((item.confidence || 0.5) * 100)),
      source: item.source || "Heurística"
    })),
    explanations: buildExplanations(metrics)
  };
}

function buildSummary(state, metrics, primary) {
  const tempo = metrics.tempoRatio ? `Tempo ${metrics.tempoRatio.toFixed(2)}:1` : "Tempo pendiente";
  const auto = state.videoAnalysis?.summary?.signal != null ? `Movimiento ${state.videoAnalysis.summary.signal}/100 aprox.` : "Movimiento revisable.";
  return `${tempo}. Vista ${state.viewType}. ${auto} Prioridad: ${primary.issue.toLowerCase()}.`;
}

function confidenceLabel(confidence) {
  if (confidence >= 80) return "Confianza alta";
  if (confidence >= 60) return "Confianza media";
  return "Confianza baja";
}

function buildExplanations(metrics) {
  return [
    {
      title: "Tempo",
      body: metrics.tempoRatio
        ? `Mide cuánto tarda la subida frente a la bajada. Un valor cercano a 3:1 suele ser una referencia simple para revisar ritmo, no una ley universal.`
        : "Aparece cuando address, top e impact están marcados."
    },
    {
      title: "Capture score",
      body: "Resume si el vídeo permite confiar en el análisis: luz, estabilidad, resolución, fps y visibilidad. Si baja, conviene repetir captura antes de corregir técnica."
    },
    {
      title: "Métricas revisables",
      body: "Son estimaciones revisables del MVP basadas en movimiento del vídeo y timing. No son todavía landmarks ni IA biomecánica; usa Comprobar para saltar al frame relevante y ajustarlas manualmente."
    }
  ];
}

function defaultExplanations() {
  return [
    {
      title: "Cómo empieza",
      body: "Sube un vídeo, ajusta encuadre y guía, y pulsa Analizar. La orientación se reconoce al cargar; fases, capture score y métricas se calculan cuando tú lo pides."
    },
    {
      title: "Vista de bola",
      body: "La pestaña Bola es independiente: sirve para ver trayectoria y resultado sin mezclarlo con el análisis técnico del swing."
    }
  ];
}
