'use strict';

const $ = (id) => document.getElementById(id);
const ASSUMED_FPS = 30;
const MAX_CAPTURE_WIDTH = 980;

const PHASES = [
  { id: 'address', label: 'Address', reading: 'Setup inicial y referencia de postura' },
  { id: 'takeaway', label: 'Takeaway', reading: 'Inicio del movimiento y anchura' },
  { id: 'midBackswing', label: 'Mid-backswing', reading: 'Carga, secuencia y organización del palo' },
  { id: 'top', label: 'Top', reading: 'Cambio de dirección y control del eje' },
  { id: 'transition', label: 'Transition', reading: 'Inicio de aceleración hacia la bola' },
  { id: 'preImpact', label: 'Pre-impact', reading: 'Entrega previa al strike' },
  { id: 'impact', label: 'Impact', reading: 'Contacto aproximado / máxima energía visual' },
  { id: 'finish', label: 'Finish', reading: 'Balance, rotación y estabilidad final' },
];

const state = {
  videoFile: null,
  videoUrl: '',
  videoName: '',
  options: { view: 'dtl', club: 'Hierro', hand: 'right' },
  metadata: null,
  profile: [],
  detection: null,
  phaseTimes: {},
  captures: {},
  metrics: null,
  scores: null,
  reportReady: false,
  installPrompt: null,
};

const refs = {
  landing: $('landing'), workspace: $('workspace'), reportRoot: $('reportRoot'),
  video: $('video'), workCanvas: $('workCanvas'), videoInput: $('videoInput'), cameraInput: $('cameraInput'),
  pickVideoBtn: $('pickVideoBtn'), cameraBtn: $('cameraBtn'), newVideoBtn: $('newVideoBtn'),
  viewSelect: $('viewSelect'), clubSelect: $('clubSelect'), handSelect: $('handSelect'),
  analyzeBtn: $('analyzeBtn'), regenerateBtn: $('regenerateBtn'), downloadJsonBtn: $('downloadJsonBtn'),
  statusTitle: $('statusTitle'), statusText: $('statusText'), confidencePill: $('confidencePill'), motionBar: $('motionBar'),
  videoName: $('videoName'), videoMeta: $('videoMeta'), phaseList: $('phaseList'),
  tabPhases: $('tabPhases'), tabReport: $('tabReport'), tabNotes: $('tabNotes'),
  phasesPanel: $('phasesPanel'), reportPanel: $('reportPanel'), notesPanel: $('notesPanel'),
  reportMiniSummary: $('reportMiniSummary'), printBtn: $('printBtn'), printBtnTop: $('printBtnTop'), installBtn: $('installBtn'),
  coachNotes: $('coachNotes'), externalData: $('externalData'),
};

function setStatus(title, text) {
  refs.statusTitle.textContent = title;
  refs.statusText.textContent = text;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const s = Math.max(0, seconds);
  const minutes = Math.floor(s / 60);
  const rest = (s % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${rest}`;
}

function frameAt(seconds) {
  return Math.max(0, Math.round((seconds || 0) * ASSUMED_FPS));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function waitForMetadata(video) {
  return new Promise((resolve, reject) => {
    if (Number.isFinite(video.duration) && video.videoWidth) return resolve();
    const onLoaded = () => resolve();
    const onError = () => reject(new Error('No se pudo cargar el vídeo'));
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

function seekTo(time) {
  return new Promise((resolve) => {
    const video = refs.video;
    const safe = clamp(time, 0, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.02) : time);
    if (Math.abs((video.currentTime || 0) - safe) < 0.025) return resolve();
    const done = () => resolve();
    video.addEventListener('seeked', done, { once: true });
    video.currentTime = safe;
  });
}

function getCtx(width, height, willRead = false) {
  const canvas = refs.workCanvas;
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d', willRead ? { willReadFrequently: true } : undefined);
}

async function loadVideo(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('Selecciona un archivo de vídeo válido.');
    return;
  }
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoFile = file;
  state.videoName = file.name || `swing-${new Date().toISOString().slice(0, 10)}.mp4`;
  state.videoUrl = URL.createObjectURL(file);
  state.profile = [];
  state.detection = null;
  state.phaseTimes = {};
  state.captures = {};
  state.metrics = null;
  state.scores = null;
  state.reportReady = false;
  refs.reportRoot.classList.add('hidden');
  refs.reportRoot.innerHTML = '';
  refs.reportMiniSummary.innerHTML = '';
  refs.phaseList.innerHTML = '';
  refs.motionBar.innerHTML = '';
  refs.video.src = state.videoUrl;
  refs.video.load();
  refs.landing.classList.add('hidden');
  refs.workspace.classList.remove('hidden');
  refs.videoName.textContent = state.videoName;
  setStatus('Vídeo cargado', 'Esperando metadatos…');
  refs.confidencePill.textContent = 'Sin análisis';
  refs.confidencePill.className = 'pill muted';
  refs.analyzeBtn.disabled = false;
  refs.regenerateBtn.disabled = true;
  refs.downloadJsonBtn.disabled = true;
  await waitForMetadata(refs.video);
  state.metadata = readVideoMetadata();
  refs.videoMeta.textContent = `${state.metadata.width} × ${state.metadata.height}px · ${state.metadata.durationText}`;
  setStatus('Vídeo listo', 'Pulsa analizar automáticamente. El vídeo no se reproduce entero; se leerán muestras internas.');
}

function readVideoMetadata() {
  const duration = refs.video.duration || 0;
  return {
    width: refs.video.videoWidth || 0,
    height: refs.video.videoHeight || 0,
    duration,
    durationText: `${duration.toFixed(2)} s`,
    fpsAssumption: ASSUMED_FPS,
    fileSizeMb: state.videoFile ? (state.videoFile.size / 1024 / 1024).toFixed(1) : null,
  };
}

function drawMotionBar(profile = state.profile, detection = state.detection) {
  refs.motionBar.innerHTML = '';
  if (!profile.length) return;
  const max = Math.max(...profile.map((p) => p.score), 0.001);
  const impactTime = detection?.times?.impact;
  const start = detection?.window?.start ?? -1;
  const end = detection?.window?.end ?? -1;
  profile.forEach((p) => {
    const bar = document.createElement('i');
    const h = 8 + 34 * clamp(p.score / max, 0, 1);
    bar.style.height = `${h}px`;
    if (p.time >= start && p.time <= end) bar.classList.add('active');
    if (impactTime != null && Math.abs(p.time - impactTime) < (state.metadata.duration / profile.length) * 1.5) bar.classList.add('impact');
    bar.title = `${formatTime(p.time)} · motion ${p.score.toFixed(2)}`;
    refs.motionBar.appendChild(bar);
  });
}

async function sampleMotionProfile() {
  const video = refs.video;
  await waitForMetadata(video);
  const duration = video.duration;
  const sampleCount = clamp(Math.round(duration * 12), 48, 132);
  const w = 96;
  const h = Math.max(96, Math.round(w * (video.videoHeight || 16) / Math.max(1, video.videoWidth || 9)));
  const ctx = getCtx(w, h, true);
  const originalTime = video.currentTime || 0;
  let previous = null;
  const raw = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const time = duration * (i / Math.max(1, sampleCount - 1));
    await seekTo(time);
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const lum = new Float32Array(w * h);
    for (let px = 0, j = 0; px < data.length; px += 4, j += 1) {
      lum[j] = 0.299 * data[px] + 0.587 * data[px + 1] + 0.114 * data[px + 2];
    }

    let diff = 0, upper = 0, lower = 0, xMoment = 0, yMoment = 0, mass = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    if (previous) {
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const idx = y * w + x;
          const d = Math.abs(lum[idx] - previous[idx]);
          diff += d;
          if (y < h * 0.52) upper += d; else lower += d;
          if (d > 13) {
            xMoment += d * (x / w);
            yMoment += d * (y / h);
            mass += d;
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
    }
    const denom = Math.max(1, Math.ceil(w / 3) * Math.ceil(h / 3));
    raw.push({
      time,
      score: diff / denom,
      upper: upper / denom,
      lower: lower / denom,
      cx: mass ? xMoment / mass : 0.5,
      cy: mass ? yMoment / mass : 0.5,
      bbox: mass ? { x: minX / w, y: minY / h, w: (maxX - minX) / w, h: (maxY - minY) / h } : null,
    });
    previous = lum;
    if (i % 8 === 0) {
      setStatus('Analizando vídeo', `Leyendo movimiento ${Math.round((i / sampleCount) * 100)}%…`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await seekTo(originalTime);
  return smoothProfile(raw);
}

function smoothProfile(raw) {
  if (!raw.length) return [];
  return raw.map((p, i) => {
    const slice = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3));
    const avg = (key) => slice.reduce((sum, item) => sum + (item[key] || 0), 0) / slice.length;
    return { ...p, score: avg('score'), upper: avg('upper'), lower: avg('lower'), cx: avg('cx'), cy: avg('cy') };
  });
}

function percentile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function nearestIndex(profile, time) {
  let best = 0, bestDiff = Infinity;
  profile.forEach((p, i) => {
    const d = Math.abs(p.time - time);
    if (d < bestDiff) { best = i; bestDiff = d; }
  });
  return best;
}

function maxInRange(profile, start, end, key = 'score') {
  let best = profile[clamp(start, 0, profile.length - 1)] || profile[0];
  for (let i = clamp(start, 0, profile.length - 1); i <= clamp(end, 0, profile.length - 1); i += 1) {
    if ((profile[i]?.[key] || 0) > (best?.[key] || 0)) best = profile[i];
  }
  return best;
}

function minInRange(profile, start, end, key = 'score') {
  let best = profile[clamp(start, 0, profile.length - 1)] || profile[0];
  for (let i = clamp(start, 0, profile.length - 1); i <= clamp(end, 0, profile.length - 1); i += 1) {
    if ((profile[i]?.[key] || 0) < (best?.[key] || 0)) best = profile[i];
  }
  return best;
}

function fallbackDetection(duration) {
  const start = duration * 0.12;
  const impact = duration * 0.66;
  const top = duration * 0.48;
  const finish = duration * 0.84;
  return phaseTimesFromAnchors(start, top, impact, finish, duration, 0.22, { start, end: finish }, null, 'fallback-percentages');
}

function phaseTimesFromAnchors(start, top, impact, finish, duration, confidence, window, thresholds, method) {
  const safeStart = clamp(start, 0, duration * 0.85);
  const safeImpact = clamp(Math.max(impact, safeStart + 0.20), safeStart + 0.20, duration * 0.95);
  const safeTop = clamp(top, safeStart + 0.12, safeImpact - 0.08);
  const safeFinish = clamp(Math.max(finish, safeImpact + 0.22), safeImpact + 0.22, duration);
  const times = {
    address: safeStart,
    takeaway: safeStart + (safeTop - safeStart) * 0.30,
    midBackswing: safeStart + (safeTop - safeStart) * 0.62,
    top: safeTop,
    transition: safeTop + (safeImpact - safeTop) * 0.24,
    preImpact: safeTop + (safeImpact - safeTop) * 0.78,
    impact: safeImpact,
    finish: safeFinish,
  };
  return { times, confidence, window, thresholds, method };
}

function detectPhasesFromMotion(profile, duration) {
  if (!profile || profile.length < 12 || !duration) return fallbackDetection(duration || 1);
  const scores = profile.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const median = percentile(scores, 0.5);
  const p70 = percentile(scores, 0.70);
  const p84 = percentile(scores, 0.84);
  const p92 = percentile(scores, 0.92);
  const threshold = Math.max(maxScore * 0.18, median * 1.85, p70);
  const active = profile.map((p, i) => ({ ...p, i })).filter((p) => p.i > 1 && p.score >= threshold);
  if (!active.length || maxScore < 0.55) return fallbackDetection(duration);

  let firstIndex = Math.max(0, active[0].i - 1);
  let lastIndex = Math.min(profile.length - 1, active[active.length - 1].i + 2);
  const startTime = clamp(profile[firstIndex].time - Math.min(0.20, duration * 0.025), 0, duration);
  const endTime = clamp(profile[lastIndex].time + Math.min(0.55, duration * 0.05), 0, duration);

  const impactStart = Math.max(firstIndex + 4, nearestIndex(profile, startTime + (endTime - startTime) * 0.45));
  const impactEnd = Math.max(impactStart, Math.min(lastIndex, nearestIndex(profile, startTime + (endTime - startTime) * 0.88)));
  const impactPoint = maxInRange(profile, impactStart, impactEnd, 'score');
  const impactIndex = nearestIndex(profile, impactPoint.time);

  const topStart = Math.max(firstIndex + 2, nearestIndex(profile, startTime + (impactPoint.time - startTime) * 0.22));
  const topEnd = Math.max(topStart, Math.min(impactIndex - 2, nearestIndex(profile, startTime + (impactPoint.time - startTime) * 0.86)));
  let topPoint = minInRange(profile, topStart, topEnd, 'score');
  if (topPoint.time < startTime + 0.18 || topPoint.time > impactPoint.time - 0.08) {
    topPoint = profile[nearestIndex(profile, startTime + (impactPoint.time - startTime) * 0.68)] || topPoint;
  }

  const releaseSearchEnd = Math.min(profile.length - 1, impactIndex + Math.round(profile.length * 0.12));
  const finishCandidate = maxInRange(profile, impactIndex, releaseSearchEnd, 'upper');
  const finishTime = Math.max(endTime, finishCandidate.time + Math.max(0.25, duration * 0.035));

  const contrast = clamp((p92 - median) / Math.max(p92, 0.001), 0, 1);
  const activeSpan = clamp((endTime - startTime) / Math.max(duration, 0.001), 0, 1);
  const order = startTime < topPoint.time && topPoint.time < impactPoint.time && impactPoint.time < finishTime;
  const tempoPlausible = (topPoint.time - startTime) > 0.25 && (impactPoint.time - topPoint.time) > 0.07;
  const confidence = clamp(0.28 + contrast * 0.34 + activeSpan * 0.14 + (order ? 0.12 : 0) + (tempoPlausible ? 0.10 : 0), 0.2, 0.93);

  return phaseTimesFromAnchors(
    startTime,
    topPoint.time,
    impactPoint.time,
    finishTime,
    duration,
    confidence,
    { start: startTime, end: endTime, firstIndex, lastIndex },
    { median, p70, p84, p92, threshold, maxScore },
    'motion-profile-v09'
  );
}

async function captureFrame(time, label) {
  const video = refs.video;
  await seekTo(time);
  const scale = Math.min(1, MAX_CAPTURE_WIDTH / Math.max(1, video.videoWidth));
  const w = Math.round(video.videoWidth * scale);
  const h = Math.round(video.videoHeight * scale);
  const ctx = getCtx(w, h, false);
  ctx.drawImage(video, 0, 0, w, h);
  drawCaptureWatermark(ctx, w, h, label, time);
  return refs.workCanvas.toDataURL('image/jpeg', 0.88);
}

function drawCaptureWatermark(ctx, w, h, label, time) {
  const pad = Math.max(10, Math.round(w * 0.018));
  ctx.save();
  ctx.fillStyle = 'rgba(13,27,42,.82)';
  ctx.roundRect?.(pad, pad, Math.min(w - 2 * pad, 360), 48, 10);
  if (!ctx.roundRect) ctx.fillRect(pad, pad, Math.min(w - 2 * pad, 360), 48);
  else ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `${Math.max(15, Math.round(w * 0.018))}px system-ui, sans-serif`;
  ctx.fillText(label, pad + 14, pad + 21);
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.font = `${Math.max(11, Math.round(w * 0.014))}px system-ui, sans-serif`;
  ctx.fillText(`${formatTime(time)} · F${frameAt(time)}`, pad + 14, pad + 39);
  ctx.restore();
}

async function generateCaptures() {
  const captures = {};
  for (const phase of PHASES) {
    const time = state.phaseTimes[phase.id];
    if (Number.isFinite(time)) {
      setStatus('Generando capturas', `${phase.label} · ${formatTime(time)}`);
      captures[phase.id] = await captureFrame(time, phase.label);
    }
  }
  state.captures = captures;
}

function profileRange(start, end) {
  return state.profile.filter((p) => p.time >= start && p.time <= end);
}

function average(list, key) {
  if (!list.length) return 0;
  return list.reduce((sum, item) => sum + (item[key] || 0), 0) / list.length;
}

function computeMetrics() {
  const t = state.phaseTimes;
  const duration = state.metadata?.duration || 0;
  const backswing = Math.max(0, (t.top || 0) - (t.address || 0));
  const downswing = Math.max(0, (t.impact || 0) - (t.top || 0));
  const followThrough = Math.max(0, (t.finish || 0) - (t.impact || 0));
  const tempoRatio = downswing > 0.001 ? backswing / downswing : null;
  const impactSlice = profileRange((t.impact || 0) - 0.12, (t.impact || 0) + 0.12);
  const finishSlice = profileRange(Math.max(t.impact || 0, (t.finish || 0) - 0.45), t.finish || duration);
  const preImpactSlice = profileRange(t.top || 0, t.impact || 0);
  const backswingSlice = profileRange(t.address || 0, t.top || 0);
  const impactSharpness = average(impactSlice, 'score') / Math.max(0.001, average(state.profile, 'score'));
  const finishStability = 1 - clamp(average(finishSlice, 'score') / Math.max(0.001, average(impactSlice, 'score')), 0, 1);
  const upperRelease = average(profileRange(t.impact || 0, t.finish || duration), 'upper') / Math.max(0.001, average(preImpactSlice, 'upper'));
  const lowerUse = average(preImpactSlice, 'lower') / Math.max(0.001, average(backswingSlice, 'lower'));
  const centerDrift = computeCentroidDrift(profileRange(t.address || 0, t.impact || 0));
  const phaseRows = PHASES.map((phase) => ({
    id: phase.id,
    label: phase.label,
    time: t[phase.id],
    frame: frameAt(t[phase.id]),
    reading: phase.reading,
  }));
  return {
    duration,
    activeDuration: Math.max(0, (t.finish || 0) - (t.address || 0)),
    backswing,
    downswing,
    followThrough,
    tempoRatio,
    impactSharpness,
    finishStability,
    upperRelease,
    lowerUse,
    centerDrift,
    impactFrame: frameAt(t.impact),
    phaseRows,
  };
}

function computeCentroidDrift(list) {
  const valid = list.filter((p) => p.score > 0.1);
  if (valid.length < 2) return 0;
  const xs = valid.map((p) => p.cx);
  const ys = valid.map((p) => p.cy);
  return (Math.max(...xs) - Math.min(...xs)) + 0.7 * (Math.max(...ys) - Math.min(...ys));
}

function scoreFromMetrics(metrics) {
  const tempo = metrics.tempoRatio || 3.0;
  const tempoScore = 10 - Math.min(4.2, Math.abs(tempo - 3.0) * 1.7);
  const stabilityScore = 6.4 + metrics.finishStability * 3.2 - Math.min(1.4, metrics.centerDrift * 2.0);
  const impactScore = 6.2 + clamp(metrics.impactSharpness - 1, 0, 1.8) * 1.2;
  const rotationScore = 6.7 + clamp(metrics.upperRelease - 0.8, 0, 1.2) * 1.5;
  const sequenceScore = (tempoScore * 0.46) + (impactScore * 0.31) + (state.detection.confidence * 10 * 0.23);
  const setupScore = 7.2 + clamp(0.35 - metrics.centerDrift, -0.3, 0.8);
  const backswingScore = 7.0 + clamp(3.5 - Math.abs(tempo - 3.0), -1, 1) * 0.45;
  const deliveryScore = impactScore;
  const balanceScore = stabilityScore;
  const scores = {
    setup: roundScore(setupScore),
    backswing: roundScore(backswingScore),
    sequence: roundScore(sequenceScore),
    delivery: roundScore(deliveryScore),
    rotation: roundScore(rotationScore),
    balance: roundScore(balanceScore),
  };
  scores.overall = roundScore(Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length);
  return scores;
}

function roundScore(value) {
  return Math.round(clamp(value, 1, 9.4) * 10) / 10;
}

function technicalReading() {
  const m = state.metrics;
  const s = state.scores;
  const strengths = [];
  const opportunities = [];
  const limitations = [];

  if (s.setup >= 7.3) strengths.push('Setup estable y postura suficientemente atlética.');
  if (s.balance >= 7.6) strengths.push('Finish y equilibrio final como buen punto de referencia.');
  if (s.delivery >= 7.2) strengths.push('Impacto visualmente claro con buena transferencia de energía.');
  if (strengths.length < 2) strengths.push('Secuencia general legible y apta para análisis comparativo.');

  if (m.tempoRatio && (m.tempoRatio < 2.4 || m.tempoRatio > 3.8)) opportunities.push('Revisar tempo backswing/downswing y confirmar que Top e Impact están ajustados al frame correcto.');
  if (m.centerDrift > 0.38) opportunities.push('Trabajar estabilidad de cabeza/eje para reducir desplazamientos durante la subida y entrega.');
  if (s.rotation < 7.2) opportunities.push('Prolongar la rotación de pecho a través del impacto para que el release no dependa sólo de manos/brazos.');
  if (!opportunities.length) opportunities.push('Mantener anchura al inicio de la subida y seguir rotando pecho durante el impacto.');

  limitations.push('Análisis 2D desde una sola cámara; las métricas son estimadas y no sustituyen a medición 3D.');
  limitations.push('Sin launch monitor no se conoce path, face-to-path, ataque, carry ni dispersión real.');
  if (state.detection.confidence < 0.55) limitations.push('Confianza de detección moderada/baja: conviene revisar fases manualmente.');

  const drills = [];
  if (opportunities.join(' ').toLowerCase().includes('tempo')) drills.push({ title: 'Pump drill desde top', text: 'Bajar a posición de entrega y repetir antes de golpear para ordenar transición y ritmo.' });
  drills.push({ title: 'Takeaway ancho', text: 'Ensayos lentos hasta medio backswing manteniendo manos/palo delante del pecho.' });
  drills.push({ title: 'Step-through drill', text: 'Pasar el pie trail después del impacto para favorecer rotación, flujo y equilibrio.' });
  if (m.centerDrift > 0.36) drills.push({ title: 'Head-line rehearsal', text: 'Ensayar con una línea vertical de cabeza y controlar que el eje no se desplace en exceso.' });

  const mainFinding = `Swing ${s.overall >= 7.4 ? 'sólido y funcional' : 'analizable con áreas claras de mejora'}; prioridad: ${opportunities[0].replace(/\.$/, '').toLowerCase()}.`;
  return { strengths, opportunities, limitations, drills: drills.slice(0, 3), mainFinding };
}

function metricRows() {
  const m = state.metrics;
  const tempo = m.tempoRatio ? `${m.tempoRatio.toFixed(2)} : 1` : 'Pendiente';
  return [
    ['Ventana activa del swing', `${formatTime(state.phaseTimes.address)} – ${formatTime(state.phaseTimes.finish)}`, 'Detectada desde perfil de movimiento'],
    ['Backswing estimado', `${m.backswing.toFixed(2)} s`, m.backswing > 1.25 ? 'Ritmo pausado' : 'Ritmo compacto'],
    ['Downswing estimado', `${m.downswing.toFixed(2)} s`, 'Entrega hacia impacto'],
    ['Tempo estimado', tempo, tempoComment(m.tempoRatio)],
    ['Impact frame', `F${m.impactFrame}`, 'Máxima energía visual aproximada'],
    ['Estabilidad finish', `${Math.round(m.finishStability * 100)}%`, finishComment(m.finishStability)],
    ['Drift visual centro movimiento', `${m.centerDrift.toFixed(2)}`, 'Estimación 2D sin calibración'],
    ['Release / rotación post-impacto', `${m.upperRelease.toFixed(2)}x`, rotationComment(m.upperRelease)],
  ];
}

function tempoComment(ratio) {
  if (!ratio) return 'Pendiente';
  if (ratio < 2.35) return 'Backswing rápido o Top tardío';
  if (ratio > 3.9) return 'Backswing lento o Impact temprano';
  return 'Rango razonable';
}

function finishComment(value) {
  if (value > 0.68) return 'Balance final sólido';
  if (value > 0.48) return 'Aceptable, revisar estabilidad';
  return 'Mejorable; finish activo/inestable';
}

function rotationComment(value) {
  if (value > 1.15) return 'Rotación/release visibles';
  if (value > 0.85) return 'Correcto, puede prolongarse';
  return 'Puede seguir abriendo pecho';
}

function renderPhaseList() {
  refs.phaseList.innerHTML = '';
  if (!state.detection) {
    refs.phaseList.innerHTML = '<p class="tip">Aún no hay fases detectadas.</p>';
    return;
  }
  PHASES.forEach((phase) => {
    const time = state.phaseTimes[phase.id];
    const card = document.createElement('article');
    card.className = 'phase-card';
    card.innerHTML = `
      <img src="${state.captures[phase.id] || ''}" alt="${phase.label}">
      <div>
        <strong>${phase.label}</strong>
        <small>${formatTime(time)} · F${frameAt(time)} · ${phase.reading}</small>
        <div class="phase-actions">
          <button type="button" data-action="goto" data-id="${phase.id}">Ir</button>
          <button type="button" data-action="capture" data-id="${phase.id}">Usar frame actual</button>
          <input class="phase-time-input" data-id="${phase.id}" value="${Number(time).toFixed(2)}" aria-label="Tiempo ${phase.label}">
        </div>
      </div>`;
    refs.phaseList.appendChild(card);
  });
}

async function handlePhaseListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === 'goto') {
    await seekTo(state.phaseTimes[id] || 0);
    refs.video.pause();
  } else if (action === 'capture') {
    state.phaseTimes[id] = refs.video.currentTime || 0;
    const phase = PHASES.find((p) => p.id === id);
    state.captures[id] = await captureFrame(state.phaseTimes[id], phase.label);
    state.metrics = computeMetrics();
    state.scores = scoreFromMetrics(state.metrics);
    renderPhaseList();
    renderReport();
  }
}

async function handlePhaseInputChange(event) {
  const input = event.target.closest('.phase-time-input');
  if (!input) return;
  const id = input.dataset.id;
  const val = Number(input.value);
  if (!Number.isFinite(val)) return;
  state.phaseTimes[id] = clamp(val, 0, state.metadata?.duration || val);
  const phase = PHASES.find((p) => p.id === id);
  state.captures[id] = await captureFrame(state.phaseTimes[id], phase.label);
  state.metrics = computeMetrics();
  state.scores = scoreFromMetrics(state.metrics);
  renderPhaseList();
  renderReport();
}

function renderMiniSummary() {
  if (!state.scores) {
    refs.reportMiniSummary.innerHTML = '<p class="tip">Genera primero el análisis.</p>';
    return;
  }
  const rows = [
    ['Setup', state.scores.setup, 'green'],
    ['Backswing', state.scores.backswing, ''],
    ['Secuencia', state.scores.sequence, ''],
    ['Delivery', state.scores.delivery, ''],
    ['Rotación', state.scores.rotation, 'orange'],
    ['Balance', state.scores.balance, 'green'],
  ];
  refs.reportMiniSummary.innerHTML = `
    <div class="score-big"><b>${state.scores.overall.toFixed(1)}</b><span>/ 10</span></div>
    <p class="tip">Evaluación visual estimada. Confianza de detección ${Math.round((state.detection?.confidence || 0) * 100)}%.</p>
    <div class="score-grid">
      ${rows.map(([label, score, cls]) => `
        <div class="score-row"><span>${label}</span><div class="score-track"><span class="${cls}" style="width:${score * 10}%"></span></div><b>${score.toFixed(1)}</b></div>
      `).join('')}
    </div>`;
}

function renderReport() {
  if (!state.metrics || !state.scores) return;
  const reading = technicalReading();
  const viewLabel = state.options.view === 'dtl' ? 'DTL' : 'Face-On';
  const m = state.metrics;
  const meta = state.metadata || readVideoMetadata();
  const notes = refs.coachNotes.value.trim();
  const external = refs.externalData.value.trim();
  const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: '2-digit' });

  refs.reportRoot.innerHTML = `
    <article class="page">
      <div class="report-topbar"><strong>Informe profesional de swing | Resumen ejecutivo</strong><span>Swing Lab Smart | pág. 1</span></div>
      <h1 class="report-title">Análisis profesional del swing</h1>
      <p class="report-subtitle">Análisis visual 2D desde vista ${viewLabel}. Informe generado con lectura de vídeo completo, detección de movimiento y selección auditada de frames clave.</p>
      <div class="report-grid">
        <div class="card navy-head">
          <h3>Secuencia del swing</h3>
          <div class="sequence-grid">${renderSequenceItems()}</div>
        </div>
        <div class="right-stack">
          <div class="card"><h3>Evaluación global</h3><div class="kpi-score"><b>${state.scores.overall.toFixed(1)}</b> / 10</div><p class="tip">Evaluación visual estimada del swing analizado</p></div>
          <div class="card kpi-grid"><div><div class="label">Palo</div><div class="value">${escapeHtml(state.options.club)}</div></div><div><div class="label">Vista</div><div class="value">${viewLabel}</div></div></div>
          <div class="card"><h3>Datos del vídeo</h3>${renderInfoList([
            ['Resolución', `${meta.width} × ${meta.height} px`], ['Frame rate', `${ASSUMED_FPS}.0 fps estimado`], ['Duración', `${meta.duration.toFixed(2)} s`], ['Address', `F${frameAt(state.phaseTimes.address)} | ${formatTime(state.phaseTimes.address)}`], ['Top', `F${frameAt(state.phaseTimes.top)} | ${formatTime(state.phaseTimes.top)}`], ['Impacto', `F${frameAt(state.phaseTimes.impact)} | ${formatTime(state.phaseTimes.impact)}`], ['Tempo', m.tempoRatio ? `${m.tempoRatio.toFixed(2)} : 1` : '—'], ['Confianza', `${Math.round((state.detection?.confidence || 0) * 100)}%`]
          ])}</div>
        </div>
      </div>
      <div class="three-cards">
        <div class="card accent green"><h3>Fortalezas</h3>${renderList(reading.strengths)}</div>
        <div class="card accent orange"><h3>Oportunidad principal</h3>${renderList(reading.opportunities.slice(0,3))}</div>
        <div class="card accent red"><h3>Limitaciones</h3>${renderList(reading.limitations)}</div>
      </div>
    </article>

    <article class="page">
      <div class="report-topbar"><strong>01 | Secuencia del swing</strong><span>Swing Lab Smart | pág. 2</span></div>
      <h1 class="report-title">Secuencia estándar del swing</h1>
      <p class="report-subtitle">Lectura global del vídeo: ventana de movimiento, picos de velocidad, fases clave y estabilidad final.</p>
      <div class="card navy-head"><h3>Frames clave seleccionados</h3><div class="sequence-grid">${renderSequenceItems()}</div></div>
      <div class="two-col" style="margin-top:18px">
        <div class="card"><table class="table"><thead><tr><th>Fase</th><th>Frame</th><th>Tiempo</th><th>Lectura</th></tr></thead><tbody>${m.phaseRows.map((r) => `<tr><td>${r.label}</td><td>F${r.frame}</td><td>${formatTime(r.time)}</td><td>${r.reading}</td></tr>`).join('')}</tbody></table></div>
        <div class="card accent"><h3>Lectura temporal</h3>${renderList([
          `Swing activo detectado: ${formatTime(state.phaseTimes.address)}–${formatTime(state.phaseTimes.finish)}.`,
          `Backswing: ${m.backswing.toFixed(2)} s.`,
          `Downswing: ${m.downswing.toFixed(2)} s.`,
          `Tempo estimado: ${m.tempoRatio ? m.tempoRatio.toFixed(2) + ':1' : 'pendiente'}.`,
          `Finish estable estimado: ${Math.round(m.finishStability * 100)}%.`,
        ])}</div>
      </div>
    </article>

    <article class="page">
      <div class="report-topbar"><strong>02 | Setup y backswing</strong><span>Swing Lab Smart | pág. 3</span></div>
      <h1 class="report-title">Setup y backswing</h1>
      <p class="report-subtitle">Checkpoints de preparación y carga. Las anotaciones son puntos de revisión visual, no medición biomecánica calibrada.</p>
      <div class="two-col">
        ${renderAnnotatedShot('01 | Address', 'Postura, base y referencia inicial', state.captures.address, ['Columna/cabeza como referencia de control.', 'Posición de bola, manos y shaft.', 'Base estable y presión repartida.'])}
        ${renderAnnotatedShot('02 | Backswing / Top', 'Longitud, eje y organización del palo', state.captures.top, ['Top compacto y controlado.', 'Cabeza contenida respecto al eje.', 'Conservar anchura al inicio del takeaway.'])}
      </div>
    </article>

    <article class="page">
      <div class="report-topbar"><strong>03 | Impacto y finish</strong><span>Swing Lab Smart | pág. 4</span></div>
      <h1 class="report-title">Impacto y finish</h1>
      <p class="report-subtitle">Delivery, presión y equilibrio final. Impacto tomado como contacto aproximado por pico de movimiento y lectura visual.</p>
      <div class="two-col">
        ${renderAnnotatedShot('03 | Impacto', 'Delivery, strike y transferencia', state.captures.impact, ['Cabeza/postura se mantienen como referencia.', 'Transferencia hacia el lado lead.', 'Pecho debe seguir abriendo a través del impacto.'])}
        ${renderAnnotatedShot('04 | Finish', 'Balance y cierre post-impacto', state.captures.finish, ['Release completo sin perder control.', 'Equilibrio sobre el lado lead.', 'Finish confirma coordinación global.'])}
      </div>
    </article>

    <article class="page">
      <div class="report-topbar"><strong>04 | Dashboard numérico</strong><span>Swing Lab Smart | pág. 5</span></div>
      <h1 class="report-title">Dashboard numérico y scoring</h1>
      <p class="report-subtitle">Métricas visuales estimadas desde cámara 2D. Rangos prudentes para comparar futuras sesiones.</p>
      <div class="report-grid">
        <div class="card"><table class="table"><thead><tr><th>Métrica</th><th>Estimación</th><th>Lectura</th></tr></thead><tbody>${metricRows().map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>
        <div>
          <div class="card"><h3>Perfil de score</h3>${renderScoreRows()}</div>
          <div class="card" style="margin-top:18px"><h3>Lectura técnica</h3><p>${escapeHtml(reading.mainFinding)}</p>${notes ? `<p><strong>Nota coach:</strong> ${escapeHtml(notes)}</p>` : ''}${external ? `<p><strong>Datos externos:</strong> ${escapeHtml(external)}</p>` : ''}</div>
        </div>
      </div>
    </article>

    <article class="page">
      <div class="report-topbar"><strong>05 | Resumen técnico y plan de mejora</strong><span>Swing Lab Smart | pág. 6</span></div>
      <h1 class="report-title">Resumen técnico y plan de mejora</h1>
      <p class="report-subtitle">Cierre accionable: pocas prioridades, drills vinculados al diagnóstico y recomendaciones para la siguiente captura.</p>
      <div class="two-col">
        <div>
          <div class="card accent"><h3>Hallazgo principal</h3>${renderList([reading.mainFinding, ...reading.strengths.slice(0,2)])}</div>
          ${reading.opportunities.slice(0,3).map((item, index) => `<div class="card accent ${index === 2 ? 'green' : 'orange'}" style="margin-top:14px"><h3>Prioridad ${index + 1}</h3>${renderList([item])}</div>`).join('')}
        </div>
        <div>
          <div class="card accent green"><h3>Drills sugeridos</h3>${reading.drills.map((d, i) => `<h3>${i + 1}. ${escapeHtml(d.title)}</h3><p>${escapeHtml(d.text)}</p>`).join('')}</div>
          <div class="card accent" style="margin-top:18px"><h3>Siguiente versión / captura</h3>${renderList([
            'Añadir vídeo complementario face-on para medir desplazamiento lateral, presión y sway con mayor fiabilidad.',
            'Mantener misma cámara, altura y distancia para comparar métricas entre sesiones.',
            'Integrar launch monitor si está disponible: path, face-to-path, ataque, carry y dispersión.',
          ])}</div>
          <div class="report-bottom"><strong>Conclusión</strong><span>${escapeHtml(reading.mainFinding)}</span></div>
        </div>
      </div>
      <p class="tip" style="margin-top:16px">Generado el ${date}. Las métricas y scores son estimaciones visuales 2D y deben auditarse con revisión de frames y datos externos cuando estén disponibles.</p>
    </article>`;

  refs.reportRoot.classList.remove('hidden');
  renderMiniSummary();
}

function renderSequenceItems() {
  return PHASES.map((phase) => {
    const time = state.phaseTimes[phase.id];
    return `<div class="sequence-item"><img src="${state.captures[phase.id] || ''}" alt="${phase.label}"><b>${phase.label}</b><span>F${frameAt(time)} | ${formatTime(time)}</span></div>`;
  }).join('');
}

function renderInfoList(items) {
  return `<dl class="info-list">${items.map(([a, b]) => `<dt>${escapeHtml(a)}</dt><dd>${escapeHtml(b)}</dd>`).join('')}</dl>`;
}

function renderList(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderAnnotatedShot(title, subtitle, src, observations) {
  return `<div class="annotated-shot">
    <div class="shot-title">${escapeHtml(title)}<small>${escapeHtml(subtitle)}</small></div>
    <img src="${src || ''}" alt="${escapeHtml(title)}">
    <span class="callout c1">1</span><span class="callout c2">2</span><span class="callout c3">3</span><span class="callout c4">4</span>
    <div class="observation-box"><strong>Observaciones clave</strong>${renderList(observations)}</div>
  </div>`;
}

function renderScoreRows() {
  const rows = [
    ['Setup', state.scores.setup, 'green'], ['Backswing', state.scores.backswing, ''], ['Secuencia', state.scores.sequence, ''],
    ['Delivery', state.scores.delivery, ''], ['Rotación', state.scores.rotation, 'orange'], ['Balance / finish', state.scores.balance, 'green'],
  ];
  return `<div class="score-grid">${rows.map(([label, score, cls]) => `<div class="score-row"><span>${label}</span><div class="score-track"><span class="${cls}" style="width:${score * 10}%"></span></div><b>${score.toFixed(1)}</b></div>`).join('')}</div>`;
}

async function analyzeVideo() {
  if (!state.videoUrl) return;
  refs.analyzeBtn.disabled = true;
  refs.regenerateBtn.disabled = true;
  refs.downloadJsonBtn.disabled = true;
  setStatus('Analizando vídeo', 'Leyendo muestras del vídeo completo…');
  refs.confidencePill.textContent = 'Procesando';
  refs.confidencePill.className = 'pill muted';
  try {
    state.options = {
      view: refs.viewSelect.value,
      club: refs.clubSelect.value,
      hand: refs.handSelect.value,
    };
    state.metadata = readVideoMetadata();
    state.profile = await sampleMotionProfile();
    state.detection = detectPhasesFromMotion(state.profile, state.metadata.duration);
    state.phaseTimes = { ...state.detection.times };
    drawMotionBar();
    await generateCaptures();
    state.metrics = computeMetrics();
    state.scores = scoreFromMetrics(state.metrics);
    state.reportReady = true;
    renderPhaseList();
    renderReport();
    const conf = Math.round(state.detection.confidence * 100);
    refs.confidencePill.textContent = `${conf}% confianza`;
    refs.confidencePill.className = `pill ${conf >= 66 ? 'good' : 'warn'}`;
    setStatus('Análisis listo', `Detectadas ${PHASES.length} fases · impacto en F${state.metrics.impactFrame} · score ${state.scores.overall.toFixed(1)}/10.`);
    refs.regenerateBtn.disabled = false;
    refs.downloadJsonBtn.disabled = false;
    setTab('report');
  } catch (error) {
    console.error(error);
    setStatus('Error de análisis', error.message || 'No se pudo analizar el vídeo.');
    refs.confidencePill.textContent = 'Error';
    refs.confidencePill.className = 'pill warn';
  } finally {
    refs.analyzeBtn.disabled = false;
  }
}

function setTab(name) {
  const map = {
    phases: [refs.tabPhases, refs.phasesPanel],
    report: [refs.tabReport, refs.reportPanel],
    notes: [refs.tabNotes, refs.notesPanel],
  };
  Object.entries(map).forEach(([key, [tab, panel]]) => {
    tab.classList.toggle('active', key === name);
    panel.classList.toggle('active', key === name);
  });
}

function downloadJson() {
  if (!state.reportReady) return;
  const payload = {
    app: 'Swing Lab Smart v0.9',
    generatedAt: new Date().toISOString(),
    videoName: state.videoName,
    options: state.options,
    metadata: state.metadata,
    detection: state.detection,
    phaseTimes: state.phaseTimes,
    metrics: state.metrics,
    scores: state.scores,
    coachNotes: refs.coachNotes.value,
    externalData: refs.externalData.value,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(state.videoName || 'swing').replace(/\.[^.]+$/, '')}-swing-lab-analysis.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function printReport() {
  if (!state.reportReady) {
    alert('Primero genera el análisis.');
    return;
  }
  renderReport();
  window.print();
}

function bind() {
  refs.pickVideoBtn.addEventListener('click', () => refs.videoInput.click());
  refs.cameraBtn.addEventListener('click', () => refs.cameraInput.click());
  refs.newVideoBtn.addEventListener('click', () => refs.videoInput.click());
  refs.videoInput.addEventListener('change', (e) => loadVideo(e.target.files?.[0]));
  refs.cameraInput.addEventListener('change', (e) => loadVideo(e.target.files?.[0]));
  refs.analyzeBtn.addEventListener('click', analyzeVideo);
  refs.regenerateBtn.addEventListener('click', () => { renderReport(); setTab('report'); });
  refs.downloadJsonBtn.addEventListener('click', downloadJson);
  refs.printBtn.addEventListener('click', printReport);
  refs.printBtnTop.addEventListener('click', printReport);
  refs.tabPhases.addEventListener('click', () => setTab('phases'));
  refs.tabReport.addEventListener('click', () => setTab('report'));
  refs.tabNotes.addEventListener('click', () => setTab('notes'));
  refs.phaseList.addEventListener('click', handlePhaseListClick);
  refs.phaseList.addEventListener('change', handlePhaseInputChange);
  refs.coachNotes.addEventListener('input', () => { if (state.reportReady) renderReport(); });
  refs.externalData.addEventListener('input', () => { if (state.reportReady) renderReport(); });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    refs.installBtn.classList.remove('hidden');
  });
  refs.installBtn.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    refs.installBtn.classList.add('hidden');
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.warn));
}

bind();
