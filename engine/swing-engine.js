(function () {
  'use strict';

  const ENGINE_VERSION = 'v0.9 Pose Foundation / SwingEngine 4.0';
  const PHASES = ['address', 'takeaway', 'top', 'impact', 'finish'];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function mergeConfidence(base, pose) {
    const out = {};
    for (const id of PHASES) {
      const b = base?.[id];
      const p = pose?.[id];
      if (Number.isFinite(b) && Number.isFinite(p)) out[id] = clamp(p * 0.72 + b * 0.28, 0, 0.98);
      else out[id] = Number.isFinite(p) ? p : (Number.isFinite(b) ? b : 0.35);
    }
    return out;
  }
  function scoreLabel(score) {
    if (score >= 86) return 'fuerte';
    if (score >= 72) return 'correcto';
    if (score >= 55) return 'revisar';
    return 'crítico';
  }

  function addPoseInterpretation(metrics, poseSummary, provider) {
    if (!metrics) return metrics;
    metrics.provider = provider || metrics.provider || 'heuristic';
    metrics.engineVersion = ENGINE_VERSION;
    metrics.poseSummary = poseSummary || metrics.poseSummary || { status: 'unavailable' };
    metrics.poseStatus = poseSummary?.status || 'unavailable';

    if (poseSummary?.status === 'available') {
      const vis = Math.round((poseSummary.medianVisibility || 0) * 100);
      const poseWeight = Math.round((poseSummary.poseWeight || 0) * 100);
      metrics.technicalFindings = metrics.technicalFindings || [];
      metrics.tips = metrics.tips || [];
      metrics.drills = metrics.drills || [];
      metrics.technicalFindings.unshift(`Pose Foundation: ${poseSummary.samples} muestras corporales procesadas · visibilidad mediana ${vis}% · peso de pose ${poseWeight}% en la corrección de fases.`);

      const headDrift = poseSummary.impact?.headDrift;
      if (Number.isFinite(headDrift)) {
        const headRead = headDrift < 0.45 ? 'estable' : headDrift < 0.85 ? 'moderado' : 'alto';
        metrics.technicalFindings.push(`Estabilidad de cabeza en Impact: drift relativo ${headDrift.toFixed(2)} (${headRead}).`);
        if (headDrift >= 0.85) metrics.tips.push('Prioridad técnica: revisa desplazamiento de cabeza/cuerpo entre Address e Impact. Usa una línea vertical de cabeza y compara Address vs Impact.');
      }
      const topHeight = poseSummary.top?.handHeightRel;
      if (Number.isFinite(topHeight)) {
        metrics.technicalFindings.push(`Top: altura relativa de manos ${topHeight.toFixed(2)} y proxy de giro de hombros ${(poseSummary.top?.shoulderTurnProxy || 0).toFixed(2)} rad.`);
      }
      const finishStability = poseSummary.finish?.stability;
      if (Number.isFinite(finishStability)) {
        const stabilityPct = Math.round(finishStability * 100);
        metrics.technicalFindings.push(`Finish: estabilidad corporal estimada ${stabilityPct}%.`);
        if (finishStability < 0.42) metrics.tips.push('Ejercicio: finish hold. Mantén el final 2 segundos y comprueba que el peso no vuelve hacia atrás.');
      }
      const hipShift = poseSummary.impact?.hipShift;
      if (Number.isFinite(hipShift)) {
        metrics.technicalFindings.push(`Impact: desplazamiento lateral de cadera relativo ${hipShift.toFixed(2)}. Úsalo como indicador inicial de transferencia, no como medida absoluta.`);
      }
      metrics.drills.push({ name: 'Head box', detail: 'Dibuja una caja pequeña alrededor de la cabeza en Address y revisa si sigue dentro o cerca en Top e Impact.' });
      metrics.drills.push({ name: 'Pose checkpoints', detail: 'Revisa Address, Top e Impact con líneas de hombros/cadera; confirma que las fases detectadas por pose son las correctas.' });

      const poseScore = Math.round(clamp((poseSummary.medianVisibility || 0) * 0.45 + (poseSummary.poseWeight || 0) * 0.35 + (finishStability || 0.5) * 0.20, 0, 1) * 100);
      metrics.scores = Object.assign({}, metrics.scores, { pose: poseScore });
      metrics.scoreLabels = Object.assign({}, metrics.scoreLabels, { pose: scoreLabel(poseScore) });
    } else {
      metrics.technicalFindings = metrics.technicalFindings || [];
      metrics.tips = metrics.tips || [];
      metrics.technicalFindings.unshift('Pose Foundation: pose corporal no disponible en este análisis. Se ha usado fallback heurístico de movimiento; revisa manualmente Top e Impact.');
      metrics.tips.push('Para activar Pose Foundation, usa conexión a internet la primera vez y un vídeo donde se vea el cuerpo completo. Si falla, la app sigue funcionando con el motor heurístico.');
    }
    return metrics;
  }

  async function analyze(input) {
    if (!window.SwingLabHeuristicEngine?.analyze) throw new Error('Heuristic engine unavailable');
    const fps = input.fps || 30;
    const duration = Number.isFinite(input.video?.duration) ? input.video.duration : 0;
    const heuristic = await window.SwingLabHeuristicEngine.analyze(input);
    let pose = null;
    let poseError = null;

    // Pose Foundation is optional: if MediaPipe cannot load or landmarks are weak,
    // the app falls back to the heuristic result without breaking the UX.
    if (window.SwingLabPoseEngine?.analyze && input.usePose !== false) {
      try {
        pose = await window.SwingLabPoseEngine.analyze(Object.assign({}, input, { baseResult: heuristic, maxPoseSamples: input.maxPoseSamples || 58 }));
      } catch (error) {
        poseError = error;
        console.warn('Pose Foundation fallback:', error);
      }
    }

    if (!pose) {
      const metrics = addPoseInterpretation(heuristic.metrics, { status: 'unavailable', error: poseError ? String(poseError.message || poseError) : 'pose-not-run' }, 'heuristic-fallback');
      return Object.assign({}, heuristic, {
        engineVersion: ENGINE_VERSION,
        provider: 'heuristic-fallback',
        poseStatus: 'unavailable',
        poseError: poseError ? String(poseError.message || poseError) : null,
        metrics
      });
    }

    const phaseConfidence = mergeConfidence(heuristic.phaseConfidence, pose.phaseConfidence);
    const confidence = clamp((heuristic.confidence || 0.35) * 0.34 + (pose.confidence || 0.35) * 0.66, 0.22, 0.97);
    const mergedPhaseResult = {
      times: pose.phases,
      confidence,
      phaseConfidence,
      extendedTimes: pose.extendedTimes || heuristic.extendedTimes || {},
      diagnostics: Object.assign({}, heuristic.diagnostics || {}, { poseDiagnostics: pose.diagnostics || {}, heuristicDiagnostics: heuristic.diagnostics || {} })
    };
    let metrics = window.SwingLabHeuristicEngine.computeMetrics(mergedPhaseResult, duration, fps);
    metrics = addPoseInterpretation(metrics, pose.poseSummary, 'pose-mediapipe+heuristic');

    return {
      engineVersion: ENGINE_VERSION,
      provider: 'pose-mediapipe+heuristic',
      profileSummary: {
        samples: heuristic.profileSummary?.samples || 0,
        poseSamples: pose.profileSummary?.samples || 0,
        type: 'motion+pose'
      },
      phases: pose.phases,
      phaseConfidence,
      extendedTimes: pose.extendedTimes || heuristic.extendedTimes,
      confidence,
      metrics,
      diagnostics: mergedPhaseResult.diagnostics,
      poseSummary: pose.poseSummary,
      poseStatus: 'available',
      baseResult: {
        phases: heuristic.phases,
        confidence: heuristic.confidence,
        phaseConfidence: heuristic.phaseConfidence
      }
    };
  }

  function computeMetrics(result, duration, fps) {
    if (!window.SwingLabHeuristicEngine?.computeMetrics) return {};
    const normalized = {
      times: result.times || result.phases || {},
      confidence: result.confidence || 0.45,
      phaseConfidence: result.phaseConfidence || {},
      extendedTimes: result.extendedTimes || {},
      diagnostics: result.diagnostics || {}
    };
    const metrics = window.SwingLabHeuristicEngine.computeMetrics(normalized, duration, fps || 30);
    return addPoseInterpretation(metrics, result.poseSummary || null, result.provider || 'manual-review');
  }

  function fallbackTimes(duration) {
    return window.SwingLabHeuristicEngine?.fallbackTimes?.(duration) || { address: 0, takeaway: duration * 0.2, top: duration * 0.45, impact: duration * 0.65, finish: duration * 0.88 };
  }

  window.SwingLabEngine = {
    version: ENGINE_VERSION,
    providers: ['pose-mediapipe+heuristic', 'heuristic-fallback'],
    analyze,
    computeMetrics,
    fallbackTimes,
    reference: window.SwingLabHeuristicEngine?.reference || {},
    poseConfig: window.SwingLabPoseEngine?.config || null
  };
})();
