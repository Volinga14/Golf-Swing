export function calculateMetrics(state) {
  const captureScore = calculateCaptureScore(state.captureChecks);
  const hasVideo = Number.isFinite(state.totalFrames) && state.totalFrames > 0;
  const eventsMarked = ["address", "top", "impact", "finish"].every((event) => Number.isFinite(state.events[event]));
  const eventsOrdered = areEventsOrdered(state.events);
  const eventsComplete = hasVideo && eventsMarked && eventsOrdered;
  const fps = state.fps || 60;
  const backswingFrames = eventDelta(state, "address", "top");
  const downswingFrames = eventDelta(state, "top", "impact");
  const finishFrames = eventDelta(state, "impact", "finish");
  const tempoRatio = backswingFrames && downswingFrames ? backswingFrames / Math.max(1, downswingFrames) : null;
  const tempoScore = tempoRatio ? scoreTempo(tempoRatio) : 0;
  const topTiming = state.totalFrames && state.events.top != null ? (state.events.top / state.totalFrames) * 100 : null;

  const qualityInputs = state.manualMetrics;
  const overallScore = hasVideo
    ? Math.round(
        weightedAverage([
          [captureScore, 0.18],
          [tempoScore, 0.2],
          [qualityInputs.headStability, 0.16],
          [qualityInputs.postureRetention, 0.18],
          [qualityInputs.handPath, 0.14],
          [qualityInputs.finishBalance, 0.14]
        ])
      )
    : 0;

  return {
    eventsComplete,
    eventsMarked,
    eventsOrdered,
    hasVideo,
    captureScore,
    overallScore,
    tempoRatio,
    tempoScore,
    topTiming,
    backswingSec: backswingFrames ? backswingFrames / fps : null,
    downswingSec: downswingFrames ? downswingFrames / fps : null,
    holdFinishSec: finishFrames ? finishFrames / fps : null,
    headStability: qualityInputs.headStability,
    postureRetention: qualityInputs.postureRetention,
    handPath: qualityInputs.handPath,
    finishBalance: qualityInputs.finishBalance,
    confidence: hasVideo ? Math.round(weightedAverage([[captureScore, 0.55], [eventsComplete ? 88 : 40, 0.45]])) : 0
  };
}

function areEventsOrdered(events) {
  const sequence = ["address", "top", "impact", "finish"].map((event) => events[event]);
  if (!sequence.every(Number.isFinite)) return false;
  return sequence.every((frame, index) => index === 0 || frame > sequence[index - 1]);
}

export function calculateCaptureScore(checks) {
  const values = Object.values(checks || {});
  if (!values.length) return 0;
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function eventDelta(state, start, end) {
  const a = state.events[start];
  const b = state.events[end];
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return b - a;
}

function scoreTempo(ratio) {
  const distance = Math.abs(ratio - 3);
  return Math.round(Math.max(0, 100 - distance * 34));
}

function weightedAverage(pairs) {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return pairs.reduce((sum, [value, weight]) => sum + (Number(value) || 0) * weight, 0) / totalWeight;
}

export function metricRows(metrics) {
  return [
    {
      label: "Tempo",
      value: metrics.tempoRatio ? `${metrics.tempoRatio.toFixed(2)}:1` : "Pendiente",
      score: metrics.tempoScore,
      detail: "Objetivo inicial aproximado: cerca de 3:1."
    },
    {
      label: "Capture score",
      value: `${metrics.captureScore}/100`,
      score: metrics.captureScore,
      detail: "Calidad de encuadre, luz, fps y visibilidad."
    },
    {
      label: "Cabeza",
      value: `${metrics.headStability}/100`,
      score: metrics.headStability,
      detail: "Estabilidad visual durante el backswing."
    },
    {
      label: "Postura",
      value: `${metrics.postureRetention}/100`,
      score: metrics.postureRetention,
      detail: "Espacio y postura conservada hasta impacto."
    },
    {
      label: "Ruta manos",
      value: `${metrics.handPath}/100`,
      score: metrics.handPath,
      detail: "Proxy manual de ruta limpia en transición."
    },
    {
      label: "Finish",
      value: `${metrics.finishBalance}/100`,
      score: metrics.finishBalance,
      detail: "Equilibrio y final completo."
    }
  ];
}
