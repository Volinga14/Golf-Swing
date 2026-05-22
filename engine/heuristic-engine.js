(function () {
  'use strict';

  const ENGINE_VERSION = 'v0.9.8 Client Report / HeuristicEngine 3.4';
  const PHASES = ['address', 'takeaway', 'top', 'impact', 'finish'];
  const REFERENCE = {
    tempoIdealLow: 2.4,
    tempoIdealHigh: 3.2,
    downSwingIdealLow: 0.18,
    downSwingIdealHigh: 0.36,
    activeRatios: { address: 0.00, takeaway: 0.16, top: 0.52, impact: 0.72, finish: 1.00 },
    reportTargets: {
      setup: ['postura estable', 'cuerpo completo visible', 'bola y manos dentro de cuadro'],
      sequence: ['backswing controlado', 'transición diferenciada', 'impacto localizado con frame preciso'],
      finish: ['equilibrio final', 'rotación completa', 'hold visible después del impacto']
    }
  };

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function fmt(seconds) { return Number.isFinite(seconds) ? `${seconds.toFixed(2)} s` : 'n/a'; }
  function median(values) { return percentile(values, 0.5); }
  function percentile(values, q) {
    const arr = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!arr.length) return 0;
    const pos = (arr.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return arr[lo];
    return arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
  }
  function scoreRange(value, lowOuter, lowGood, highGood, highOuter) {
    if (!Number.isFinite(value)) return 0.5;
    if (value >= lowGood && value <= highGood) return 1;
    if (value < lowGood) return clamp((value - lowOuter) / Math.max(lowGood - lowOuter, 0.001), 0, 1);
    return clamp((highOuter - value) / Math.max(highOuter - highGood, 0.001), 0, 1);
  }
  function labelScore(score) {
    if (score >= 86) return 'fuerte';
    if (score >= 72) return 'correcto';
    if (score >= 55) return 'revisar';
    return 'crítico';
  }

  function timeAtRatio(duration, ratio) { return clamp(duration * ratio, 0, duration || 0); }
  function fallbackTimes(duration) {
    const d = Math.max(Number(duration) || 1.2, 0.5);
    return {
      address: timeAtRatio(d, 0.05),
      takeaway: timeAtRatio(d, 0.20),
      top: timeAtRatio(d, 0.45),
      impact: timeAtRatio(d, 0.63),
      finish: timeAtRatio(d, 0.86)
    };
  }

  function getTimeAtIndex(profile, index) {
    if (!profile.length) return 0;
    return profile[clamp(Math.round(index), 0, profile.length - 1)].time;
  }
  function indexAtTime(profile, time) {
    if (!profile.length) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < profile.length; i += 1) {
      const dist = Math.abs(profile[i].time - time);
      if (dist < bestDist) { best = i; bestDist = dist; }
    }
    return best;
  }

  function smoothProfile(profile, radius) {
    return profile.map((point, i) => {
      let score = 0, upper = 0, middle = 0, lower = 0, centroidX = 0, centroidY = 0, count = 0;
      for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j += 1) {
        score += profile[j].score;
        upper += profile[j].upper;
        middle += profile[j].middle;
        lower += profile[j].lower;
        centroidX += profile[j].centroidX;
        centroidY += profile[j].centroidY;
        count += 1;
      }
      return Object.assign({}, point, {
        rawScore: point.score,
        score: score / count,
        upper: upper / count,
        middle: middle / count,
        lower: lower / count,
        centroidX: centroidX / count,
        centroidY: centroidY / count,
        bodyWeighted: (score / count) * 0.52 + (middle / count) * 0.27 + (upper / count) * 0.16 + (lower / count) * 0.05
      });
    });
  }

  function diffFeatures(prev, curr, width, height) {
    let total = 0, upper = 0, middle = 0, lower = 0, cx = 0, cy = 0, weight = 0;
    const step = 4;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const l1 = prev[idx] * 0.299 + prev[idx + 1] * 0.587 + prev[idx + 2] * 0.114;
        const l2 = curr[idx] * 0.299 + curr[idx + 1] * 0.587 + curr[idx + 2] * 0.114;
        const d = Math.abs(l2 - l1) / 255;
        if (d < 0.012) continue;
        total += d;
        weight += d;
        cx += (x / Math.max(1, width - 1)) * d;
        cy += (y / Math.max(1, height - 1)) * d;
        const yn = y / height;
        if (yn < 0.36) upper += d;
        else if (yn < 0.72) middle += d;
        else lower += d;
      }
    }
    const norm = Math.max(1, (width / step) * (height / step));
    return {
      score: total / norm * 100,
      upper: upper / norm * 100,
      middle: middle / norm * 100,
      lower: lower / norm * 100,
      centroidX: weight ? cx / weight : 0.5,
      centroidY: weight ? cy / weight : 0.5
    };
  }

  async function seek(video, time) {
    return new Promise((resolve) => {
      const duration = Number.isFinite(video.duration) ? video.duration : time;
      const safe = clamp(time, 0, duration);
      if (Math.abs((video.currentTime || 0) - safe) < 0.025) return resolve();
      const done = () => resolve();
      video.addEventListener('seeked', done, { once: true });
      video.currentTime = safe;
    });
  }

  async function sampleMotionProfile(video, options) {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || !video.videoWidth || !video.videoHeight) return [];
    const maxSamples = options?.maxSamples || 120;
    const width = 72;
    const height = Math.max(96, Math.round(width * (video.videoHeight / video.videoWidth)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const count = clamp(Math.round(duration * 24), 42, maxSamples);
    const original = video.currentTime || 0;
    const wasPaused = video.paused;
    video.pause();

    let prev = null;
    const profile = [];
    for (let i = 0; i < count; i += 1) {
      const time = duration * (i / Math.max(1, count - 1));
      await seek(video, time);
      ctx.drawImage(video, 0, 0, width, height);
      const img = ctx.getImageData(0, 0, width, height).data;
      if (prev) profile.push(Object.assign({ time, index: i }, diffFeatures(prev, img, width, height)));
      prev = new Uint8ClampedArray(img);
    }
    await seek(video, original);
    if (!wasPaused) video.play().catch(() => {});
    return smoothProfile(profile, 2);
  }

  function chooseSegment(profile, thresholds, duration) {
    const active = thresholds.active;
    const strong = thresholds.strong;
    const minSpan = Math.max(5, Math.round(profile.length * 0.06));
    const maxSpanTime = Math.min(5.6, Math.max(1.05, duration * 0.72));
    const groups = [];
    let start = null;
    for (let i = 0; i < profile.length; i += 1) {
      const p = profile[i];
      const isActive = p.score >= active || p.bodyWeighted >= strong * 0.78;
      if (isActive && start == null) start = i;
      if ((!isActive || i === profile.length - 1) && start != null) {
        const end = isActive && i === profile.length - 1 ? i : i - 1;
        if (end - start + 1 >= minSpan) groups.push({ start, end });
        start = null;
      }
    }
    if (!groups.length) {
      const peak = profile.reduce((best, p, i) => p.bodyWeighted > profile[best].bodyWeighted ? i : best, 0);
      const span = Math.max(minSpan * 2, Math.round(profile.length * 0.22));
      return { start: Math.max(0, peak - span), end: Math.min(profile.length - 1, peak + span), quality: 0.32 };
    }
    let best = groups[0];
    let bestScore = -Infinity;
    groups.forEach((g) => {
      let energy = 0, peaks = 0, spanStrong = 0;
      for (let i = g.start; i <= g.end; i += 1) {
        energy += profile[i].bodyWeighted;
        if (profile[i].score >= strong) peaks += 1;
        if (profile[i].bodyWeighted >= strong * 0.75) spanStrong += 1;
      }
      const spanTime = profile[g.end].time - profile[g.start].time;
      const durationScore = scoreRange(spanTime, 0.45, 0.9, maxSpanTime, maxSpanTime + 2.0);
      const score = energy * 0.52 + peaks * 0.32 + spanStrong * 0.20 + durationScore * 10;
      if (score > bestScore) { bestScore = score; best = g; }
    });
    const pad = Math.round(Math.max(2, (best.end - best.start) * 0.18));
    best = { start: Math.max(0, best.start - pad), end: Math.min(profile.length - 1, best.end + pad) };
    const span = Math.max(1, best.end - best.start);
    return { start: best.start, end: best.end, quality: clamp(span / Math.max(profile.length * 0.20, 1), 0.35, 0.92) };
  }

  function localMax(profile, start, end, key) {
    let best = start;
    for (let i = start; i <= end; i += 1) if ((profile[i]?.[key] || 0) > (profile[best]?.[key] || 0)) best = i;
    return { index: best, point: profile[best] };
  }
  function localMin(profile, start, end, key) {
    let best = start;
    for (let i = start; i <= end; i += 1) if ((profile[i]?.[key] || 0) < (profile[best]?.[key] || 0)) best = i;
    return { index: best, point: profile[best] };
  }

  function enforceOrder(times, duration) {
    const minGap = Math.max(0.035, Math.min(0.085, duration / 90));
    const out = Object.assign({}, times);
    out.address = clamp(out.address, 0, duration);
    out.takeaway = clamp(Math.max(out.takeaway, out.address + minGap), 0, duration);
    out.top = clamp(Math.max(out.top, out.takeaway + minGap), 0, duration);
    out.impact = clamp(Math.max(out.impact, out.top + minGap), 0, duration);
    out.finish = clamp(Math.max(out.finish, out.impact + minGap), 0, duration);
    return out;
  }

  function deriveTimes(profile, duration) {
    if (!profile.length) return { times: fallbackTimes(duration), confidence: 0.18, phaseConfidence: {}, extendedTimes: {}, diagnostics: { reason: 'no-profile' } };
    const scores = profile.map(p => p.score);
    const med = median(scores);
    const p75 = percentile(scores, 0.75);
    const p88 = percentile(scores, 0.88);
    const p94 = percentile(scores, 0.94);
    const max = Math.max(...scores);
    const contrast = clamp((p94 - med) / Math.max(p94, 0.001), 0, 1);
    const thresholds = {
      median: med,
      p75,
      p88,
      p94,
      active: Math.max(p75, med * 1.45, max * 0.13),
      strong: Math.max(p88, med * 2.05, max * 0.30)
    };
    if (max < 0.18 || contrast < 0.08) return { times: fallbackTimes(duration), confidence: 0.22, phaseConfidence: {}, extendedTimes: {}, diagnostics: { max, med, contrast, reason: 'low-motion' } };

    const segment = chooseSegment(profile, thresholds, duration);
    const segStart = profile[segment.start].time;
    const segEnd = profile[segment.end].time;
    const segDur = Math.max(0.3, segEnd - segStart);

    // Impact: strong body-weighted movement in the late-mid segment. Bias avoids selecting early takeaway spikes.
    const impactStart = Math.max(segment.start + 2, indexAtTime(profile, segStart + segDur * 0.47));
    const impactEnd = Math.max(impactStart + 1, Math.min(segment.end, indexAtTime(profile, segStart + segDur * 0.90)));
    const impact = localMax(profile, impactStart, impactEnd, 'bodyWeighted');

    // Address: quietest period before the first active sequence, but close enough to active start.
    const addressSearchStart = Math.max(0, segment.start - Math.round((segment.end - segment.start) * 0.35));
    const addressSearchEnd = Math.max(addressSearchStart, Math.min(segment.start + 2, impact.index - 8));
    const address = localMin(profile, addressSearchStart, addressSearchEnd, 'score');

    // Top: look for the transition valley / low movement before impact with priors around 50-60% of active window.
    const topPriorTime = lerp(segStart, profile[impact.index].time, 0.68);
    const topStart = Math.max(indexAtTime(profile, address.point.time + 0.16), segment.start + 2);
    const topEnd = Math.max(topStart, Math.min(impact.index - 2, indexAtTime(profile, profile[impact.index].time - 0.08)));
    let bestTopIndex = topStart;
    let bestTopScore = -Infinity;
    for (let i = topStart; i <= topEnd; i += 1) {
      const p = profile[i];
      const before = localMax(profile, Math.max(topStart, i - 4), i, 'bodyWeighted').point;
      const after = localMax(profile, i, Math.min(topEnd + 6, profile.length - 1), 'bodyWeighted').point;
      const valley = 1 - clamp(p.bodyWeighted / Math.max(p88, 0.001), 0, 1);
      const hasMotionAround = clamp(((before.bodyWeighted || 0) + (after.bodyWeighted || 0)) / Math.max(p94 * 2, 0.001), 0, 1.2);
      const prior = 1 - clamp(Math.abs(p.time - topPriorTime) / Math.max(segDur * 0.40, 0.2), 0, 1);
      const score = valley * 0.43 + hasMotionAround * 0.29 + prior * 0.28;
      if (score > bestTopScore) { bestTopScore = score; bestTopIndex = i; }
    }
    const top = profile[bestTopIndex];

    const backDur = Math.max(0.16, top.time - address.point.time);
    const takeTarget = address.point.time + backDur * 0.31;
    const takeStart = indexAtTime(profile, address.point.time + Math.min(0.08, backDur * 0.18));
    const takeEnd = Math.max(takeStart, indexAtTime(profile, Math.min(top.time - 0.04, address.point.time + backDur * 0.55)));
    const takeCross = profile.slice(takeStart, takeEnd + 1).find(p => p.score > Math.max(med * 1.20, thresholds.active * 0.55));
    const take = takeCross || profile[indexAtTime(profile, takeTarget)];

    const finishStart = indexAtTime(profile, profile[impact.index].time + 0.18);
    let finishPoint = profile[Math.min(profile.length - 1, finishStart)];
    for (let i = finishStart; i < profile.length - 2; i += 1) {
      const quiet3 = profile.slice(i, i + 3).every(p => p.score < Math.max(p75, med * 1.65));
      if (quiet3) { finishPoint = profile[i]; break; }
    }
    if (!finishPoint || finishPoint.time <= profile[impact.index].time) finishPoint = profile[indexAtTime(profile, Math.min(duration, profile[impact.index].time + Math.max(0.45, segDur * 0.22)))];

    const raw = {
      address: address.point.time,
      takeaway: take.time,
      top: top.time,
      impact: profile[impact.index].time,
      finish: finishPoint.time
    };
    const ref = {
      address: segStart,
      takeaway: lerp(segStart, segEnd, REFERENCE.activeRatios.takeaway),
      top: lerp(segStart, segEnd, REFERENCE.activeRatios.top),
      impact: raw.impact,
      finish: segEnd
    };
    const rawDown = raw.impact - raw.top;
    const rawBack = raw.top - raw.address;
    const rawTempo = rawBack / Math.max(rawDown, 0.001);
    const plausibility = scoreRange(rawTempo, 1.25, REFERENCE.tempoIdealLow, REFERENCE.tempoIdealHigh, 5.8) * 0.55 + scoreRange(rawDown, 0.05, REFERENCE.downSwingIdealLow, REFERENCE.downSwingIdealHigh, 0.85) * 0.45;
    const refWeight = clamp(0.16 + (1 - plausibility) * 0.34 + (1 - contrast) * 0.16, 0.16, 0.58);
    const blended = {};
    PHASES.forEach(id => { blended[id] = raw[id] * (1 - refWeight) + ref[id] * refWeight; });
    const times = enforceOrder(blended, duration);

    const down = times.impact - times.top;
    const back = times.top - times.address;
    const tempo = back / Math.max(down, 0.001);
    const finishHold = times.finish - times.impact;
    const segmentQuality = segment.quality || 0.4;
    const impactProminence = clamp((profile[impact.index].bodyWeighted || profile[impact.index].score) / Math.max(p94, 0.001), 0, 1.25);
    const topQuality = clamp(bestTopScore, 0.1, 0.95);
    const tempoQuality = scoreRange(tempo, 1.25, REFERENCE.tempoIdealLow, REFERENCE.tempoIdealHigh, 5.8);
    const downQuality = scoreRange(down, 0.05, REFERENCE.downSwingIdealLow, REFERENCE.downSwingIdealHigh, 0.85);
    const finishQuality = scoreRange(finishHold, 0.10, 0.40, 2.30, 3.40);

    const phaseConfidence = {
      address: clamp(0.28 + contrast * 0.20 + segmentQuality * 0.30 + (address.point.score <= p75 ? 0.12 : 0), 0.20, 0.95),
      takeaway: clamp(0.32 + contrast * 0.26 + segmentQuality * 0.18 + scoreRange(times.takeaway - times.address, 0.02, 0.10, 0.55, 1.20) * 0.16, 0.22, 0.94),
      top: clamp(0.24 + topQuality * 0.44 + tempoQuality * 0.18 + contrast * 0.12, 0.20, 0.94),
      impact: clamp(0.28 + impactProminence * 0.35 + contrast * 0.20 + downQuality * 0.13, 0.24, 0.96),
      finish: clamp(0.24 + finishQuality * 0.35 + segmentQuality * 0.18 + contrast * 0.12, 0.20, 0.92)
    };
    const avgConf = PHASES.reduce((sum, id) => sum + phaseConfidence[id], 0) / PHASES.length;
    const confidence = clamp(avgConf * 0.62 + contrast * 0.18 + segmentQuality * 0.13 + plausibility * 0.07, 0.20, 0.95);

    const extendedTimes = {
      activeStart: segStart,
      activeEnd: segEnd,
      midBackswing: times.takeaway + (times.top - times.takeaway) * 0.55,
      transition: times.top + Math.max(0.025, Math.min(0.08, down * 0.22)),
      preImpact: times.impact - Math.max(0.025, Math.min(0.08, down * 0.27))
    };
    const diagnostics = { engine: ENGINE_VERSION, thresholds, contrast, segment, segStart, segEnd, raw, ref, refWeight, rawTempo, plausibility, impactIndex: impact.index, topIndex: bestTopIndex };
    return { times, confidence, phaseConfidence, extendedTimes, diagnostics };
  }

  function computeMetrics(result, duration, fps) {
    const t = result.times || {};
    const has = id => Number.isFinite(t[id]);
    const back = has('address') && has('top') ? t.top - t.address : null;
    const down = has('top') && has('impact') ? t.impact - t.top : null;
    const total = has('address') && has('finish') ? t.finish - t.address : null;
    const follow = has('impact') && has('finish') ? t.finish - t.impact : null;
    const tempo = back && down ? back / Math.max(down, 0.001) : null;
    const activeWindow = Number.isFinite(result.extendedTimes?.activeStart) && Number.isFinite(result.extendedTimes?.activeEnd)
      ? result.extendedTimes.activeEnd - result.extendedTimes.activeStart : null;
    const phaseQuality = PHASES.reduce((sum, id) => sum + (result.phaseConfidence?.[id] || result.confidence || 0.3), 0) / PHASES.length;
    const tempoScore = tempo ? scoreRange(tempo, 1.25, REFERENCE.tempoIdealLow, REFERENCE.tempoIdealHigh, 5.8) : 0.48;
    const downScore = down ? scoreRange(down, 0.05, REFERENCE.downSwingIdealLow, REFERENCE.downSwingIdealHigh, 0.85) : 0.5;
    const finishScore = follow ? scoreRange(follow, 0.10, 0.40, 2.30, 3.40) : 0.5;
    const sequenceScore = clamp((tempoScore * 0.52) + (downScore * 0.28) + (phaseQuality * 0.20), 0, 1);
    const detectionScore = result.confidence || 0.3;
    const scores = {
      overall: Math.round((detectionScore * 0.24 + phaseQuality * 0.24 + tempoScore * 0.20 + sequenceScore * 0.20 + finishScore * 0.12) * 100),
      detection: Math.round(detectionScore * 100),
      phaseQuality: Math.round(phaseQuality * 100),
      tempo: Math.round(tempoScore * 100),
      sequence: Math.round(sequenceScore * 100),
      finish: Math.round(finishScore * 100),
      downswing: Math.round(downScore * 100)
    };
    const warnings = [];
    if (result.confidence < 0.55) warnings.push('La detección automática es dudosa: revisa manualmente Top e Impact antes de guardar.');
    if ((result.phaseConfidence?.top || 0) < 0.58) warnings.push('Top con confianza baja: ajusta el frame donde cambia claramente la dirección del backswing.');
    if ((result.phaseConfidence?.impact || 0) < 0.58) warnings.push('Impact con confianza baja: usa +1f/−1f hasta localizar el contacto o el frame más cercano.');
    if (tempo && (tempo < 1.7 || tempo > 5.0)) warnings.push('Tempo fuera de rango: puede indicar fase mal marcada o swing con preparación larga.');
    if (down && (down < 0.10 || down > 0.65)) warnings.push('Downswing atípico: revisa Top→Impact.');
    if (follow && follow < 0.20) warnings.push('Finish demasiado cerca de Impact: probablemente falta avanzar al equilibrio final real.');

    const frames = {};
    PHASES.forEach(id => { if (has(id)) frames[id] = Math.round(t[id] * fps); });
    const phaseTable = PHASES.map((id, i) => ({
      id,
      time: t[id],
      frame: frames[id],
      confidence: result.phaseConfidence?.[id] || null,
      nextInterval: i < PHASES.length - 1 && has(PHASES[i + 1]) && has(id) ? t[PHASES[i + 1]] - t[id] : null
    }));
    const technicalFindings = [
      `Ventana activa estimada: ${fmt(activeWindow)}. Se descarta la preparación larga del vídeo y se concentra el análisis en el movimiento real.`,
      `Secuencia temporal: backswing ${fmt(back)}, downswing ${fmt(down)}, follow-through ${fmt(follow)}.`,
      `Tempo estimado: ${tempo ? tempo.toFixed(2) + ':1' : 'pendiente'} frente a referencia ${REFERENCE.tempoIdealLow}:1–${REFERENCE.tempoIdealHigh}:1.`,
      `Impact: frame ${frames.impact ?? 'n/a'} con confianza ${Math.round((result.phaseConfidence?.impact || result.confidence || 0) * 100)}%.`,
      `Top: frame ${frames.top ?? 'n/a'} con confianza ${Math.round((result.phaseConfidence?.top || result.confidence || 0) * 100)}%.`
    ];
    const tips = [];
    if (tempo && tempo < REFERENCE.tempoIdealLow) tips.push('Trabajo recomendado: backswing más paciente con pausa breve en Top; prueba 3 swings lentos + 1 swing normal.');
    if (tempo && tempo > REFERENCE.tempoIdealHigh) tips.push('Trabajo recomendado: transición más fluida; evita quedarte bloqueado arriba y empieza la bajada desde el suelo/cadera.');
    if (down && down < REFERENCE.downSwingIdealLow) tips.push('Ejercicio: “pump drill” desde Top hasta pre-impact para reconocer la secuencia antes de acelerar.');
    if (down && down > REFERENCE.downSwingIdealHigh) tips.push('Ejercicio: swings con metrónomo 3:1 para coordinar backswing y downswing.');
    if (follow && follow < 0.40) tips.push('Ejercicio: mantener finish 2 segundos, peso estable en pie delantero y pecho mirando al objetivo.');
    if (!tips.length) tips.push('Mantén este swing como referencia y compara futuras sesiones fase a fase, especialmente Top e Impact.');
    tips.push('Revisión manual prioritaria: confirma Impact y Top, porque son los frames que más afectan al análisis posterior.');
    const drills = [
      { name: 'Top checkpoint', detail: 'Pausa 1 segundo en Top, comprueba manos/shaft y baja suave hasta pre-impact.' },
      { name: 'Impact freeze', detail: 'Haz medio swing y congela el impacto: manos delante, cabeza estable, cadera rotada.' },
      { name: 'Finish hold', detail: 'Mantén el finish 2 segundos para mejorar balance y terminar la rotación.' }
    ];
    return { method: ENGINE_VERSION, confidence: result.confidence, phaseConfidence: result.phaseConfidence, extendedTimes: result.extendedTimes, diagnostics: result.diagnostics, frames, backswing: back, downswing: down, followThrough: follow, total, activeWindow, tempoRatio: tempo, scores, scoreLabels: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, labelScore(v)])), warnings, consistencyWarnings: warnings, phaseTable, technicalFindings, tips, drills, reference: { tempoBand: `${REFERENCE.tempoIdealLow}:1–${REFERENCE.tempoIdealHigh}:1`, downSwingBand: `${REFERENCE.downSwingIdealLow.toFixed(2)}–${REFERENCE.downSwingIdealHigh.toFixed(2)} s`, reportTargets: REFERENCE.reportTargets }, impactFrame: frames.impact, topFrame: frames.top };
  }

  async function analyze(input) {
    const video = input.video;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const fps = input.fps || 30;
    const profile = await sampleMotionProfile(video, { maxSamples: input.maxSamples || 120 });
    const phaseResult = deriveTimes(profile, duration);
    const metrics = computeMetrics(phaseResult, duration, fps);
    return { engineVersion: ENGINE_VERSION, provider: 'heuristic', profileSummary: { samples: profile.length }, phases: phaseResult.times, phaseConfidence: phaseResult.phaseConfidence, extendedTimes: phaseResult.extendedTimes, confidence: phaseResult.confidence, metrics, diagnostics: phaseResult.diagnostics };
  }

  window.SwingLabHeuristicEngine = {
    version: ENGINE_VERSION,
    providers: ['heuristic'],
    analyze,
    computeMetrics,
    fallbackTimes,
    reference: REFERENCE
  };
})();
