'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'swing-lab-db';
const DB_VERSION = 6;
const STORE = 'sessions';
const ASSUMED_FPS = 30;

const phases = [
  { id: 'address', label: 'Address', short: 'Addr', pct: 0.05, hint: 'Setup inicial: pies, bola, manos y postura.' },
  { id: 'takeaway', label: 'Takeaway', short: 'Take', pct: 0.18, hint: 'Primer movimiento del palo y conexión de brazos.' },
  { id: 'top', label: 'Top', short: 'Top', pct: 0.38, hint: 'Parte alta: rotación, estabilidad y posición de manos.' },
  { id: 'impact', label: 'Impact', short: 'Imp', pct: 0.62, hint: 'Impacto: manos, cadera, cabeza y línea del palo.' },
  { id: 'finish', label: 'Finish', short: 'Fin', pct: 0.90, hint: 'Equilibrio final y rotación completa.' },
];

const state = {
  videoUrl: null,
  videoBlob: null,
  videoName: '',
  captureOnly: false,
  mode: 'phases',
  currentPhaseId: 'address',
  phaseTimes: {},
  phaseCaptures: {},
  analysisMetrics: null,
  autoDetection: { status: 'idle', confidence: 0, method: '', samples: 0, motionPeakTime: null },
  viewingCapture: false,
  activeCaptureIndex: 0,
  captureSwipeStart: null,
  showGuides: true,
  guideMode: 'dtl',
  speed: 1,
  controlsVisible: true,
  isSeekingWithSlider: false,
  installPrompt: null,
  appState: 'empty',
  drawingMode: false,
  showDrawings: true,
  lines: [],
  previewLine: null,
  pendingLineStart: null,
  pointerStart: null,
  pointerMoved: false,
  pointerDown: false,
};

const refs = {
  app: $('app'),
  emptyState: $('emptyState'),
  video: $('video'),
  captureViewer: $('captureViewer'),
  captureBadge: $('captureBadge'),
  drawingCanvas: $('drawingCanvas'),
  captureCanvas: $('captureCanvas'),
  tapLayer: $('tapLayer'),
  scrimTop: $('scrimTop'),
  scrimBottom: $('scrimBottom'),
  topHud: $('topHud'),
  rightRail: $('rightRail'),
  phaseHud: $('phaseHud'),
  bottomDock: $('bottomDock'),
  cleanHint: $('cleanHint'),
  drawingHint: $('drawingHint'),
  guideOverlay: $('guideOverlay'),
  dtlGuides: $('dtlGuides'),
  foGuides: $('foGuides'),
  stateText: $('stateText'),
  uploadBtn: $('uploadBtn'),
  pickVideoBtn: $('pickVideoBtn'),
  openCameraBtn: $('openCameraBtn'),
  openHistoryStartBtn: $('openHistoryStartBtn'),
  videoInput: $('videoInput'),
  cameraInput: $('cameraInput'),
  installBtn: $('installBtn'),
  installBtnEmpty: $('installBtnEmpty'),
  toggleGuidesBtn: $('toggleGuidesBtn'),
  switchModeBtn: $('switchModeBtn'),
  drawModeBtn: $('drawModeBtn'),
  toggleDrawingsBtn: $('toggleDrawingsBtn'),
  undoLineBtn: $('undoLineBtn'),
  clearLinesBtn: $('clearLinesBtn'),
  activePhaseName: $('activePhaseName'),
  markStatus: $('markStatus'),
  timeReadout: $('timeReadout'),
  playerStrip: $('playerStrip'),
  playerReadout: $('playerReadout'),
  playerPhaseReadout: $('playerPhaseReadout'),
  speedBtn: $('speedBtn'),
  tabPhases: $('tabPhases'),
  tabAnalysis: $('tabAnalysis'),
  tabHistory: $('tabHistory'),
  phasesPanel: $('phasesPanel'),
  analysisPanel: $('analysisPanel'),
  historyPanel: $('historyPanel'),
  phaseChips: $('phaseChips'),
  timeline: $('timeline'),
  backFrameBtn: $('backFrameBtn'),
  forwardFrameBtn: $('forwardFrameBtn'),
  playBtn: $('playBtn'),
  markPhaseBtn: $('markPhaseBtn'),
  phaseSummary: $('phaseSummary'),
  analyzeBtn: $('analyzeBtn'),
  analysisStatus: $('analysisStatus'),
  recommendations: $('recommendations'),
  capturesGrid: $('capturesGrid'),
  saveSessionBtn: $('saveSessionBtn'),
  saveSessionTopBtn: $('saveSessionTopBtn'),
  clearHistoryBtn: $('clearHistoryBtn'),
  historyList: $('historyList'),
};

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(session) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbAll() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.warn(error);
    return [];
  }
}

async function dbClear() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function setAppState(next) {
  state.appState = next;
  const map = {
    empty: 'Sin vídeo',
    loaded: 'Vídeo cargado',
    detecting: 'Detectando fases',
    detected: 'Fases detectadas',
    marking: 'Marcando fases',
    analyzing: 'Generando capturas',
    completed: 'Análisis listo',
    saved: 'Sesión guardada',
    error: 'Error',
  };
  refs.stateText.textContent = map[next] || next;
}

function currentPhase() {
  return phases.find((phase) => phase.id === state.currentPhaseId) || phases[0];
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00.00';
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(2).padStart(5, '0');
  return `${mins}:${secs}`;
}

function frameNumber(time = refs.video.currentTime || 0) {
  return Math.max(0, Math.round(time * ASSUMED_FPS));
}

function markedCount() {
  return Object.keys(state.phaseTimes).length;
}

function revokeVideoUrl() {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
}

function resetSessionState() {
  state.captureOnly = false;
  state.mode = 'phases';
  state.currentPhaseId = 'address';
  state.phaseTimes = {};
  state.phaseCaptures = {};
  state.analysisMetrics = null;
  state.autoDetection = { status: 'idle', confidence: 0, method: '', samples: 0, motionPeakTime: null };
  state.viewingCapture = false;
  state.activeCaptureIndex = 0;
  state.captureSwipeStart = null;
  state.lines = [];
  state.previewLine = null;
  state.pendingLineStart = null;
  state.pointerStart = null;
  state.pointerMoved = false;
  state.drawingMode = false;
  state.showDrawings = true;
  state.controlsVisible = true;
}

function applyVideoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    alert('Selecciona un archivo de vídeo válido.');
    return;
  }
  revokeVideoUrl();
  resetSessionState();
  state.videoBlob = file;
  state.videoUrl = URL.createObjectURL(file);
  state.videoName = file.name || `swing-${new Date().toISOString().slice(0, 10)}.mp4`;
  refs.analysisStatus.textContent = 'Detectando fases automáticamente… podrás corregirlas manualmente.';
  refs.recommendations.innerHTML = '';
  refs.capturesGrid.innerHTML = '';
  refs.video.src = state.videoUrl;
  refs.video.load();
  state.autoDetection = { status: 'queued', confidence: 0, method: 'motion-profile', samples: 0, motionPeakTime: null };
  setAppState('loaded');
  render();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'phases') {
    if (state.videoUrl) state.viewingCapture = false;
    setAppState(markedCount() ? 'detected' : 'marking');
  }
  if (mode === 'analysis') {
    state.drawingMode = false;
    state.pendingLineStart = null;
    state.previewLine = null;
  }
  render();
  if (mode === 'history') loadHistory();
}

function toggleControls() {
  if (!state.videoUrl || state.drawingMode) return;
  state.controlsVisible = !state.controlsVisible;
  refs.app.classList.toggle('controls-hidden', !state.controlsVisible);
}

function renderShell() {
  const hasVideo = Boolean(state.videoUrl);
  const hasCaptures = captureList().length > 0;
  const showingCapture = state.viewingCapture || (state.captureOnly && hasCaptures);
  const hasSession = hasVideo || state.captureOnly || hasCaptures;

  refs.emptyState.classList.toggle('hidden', hasSession);
  refs.video.classList.toggle('hidden', !hasVideo || showingCapture);
  refs.captureViewer.classList.toggle('hidden', !showingCapture);
  refs.captureBadge.classList.toggle('hidden', !showingCapture);
  refs.tapLayer.classList.toggle('hidden', !hasVideo || showingCapture || state.drawingMode);
  refs.scrimTop.classList.toggle('hidden', !hasVideo || showingCapture);
  refs.scrimBottom.classList.toggle('hidden', !hasVideo || showingCapture);
  refs.topHud.classList.toggle('hidden', !hasSession || state.drawingMode);
  refs.rightRail.classList.toggle('hidden', !hasVideo);
  refs.bottomDock.classList.toggle('hidden', !hasSession || state.drawingMode);
  refs.phaseHud.classList.toggle('hidden', !hasVideo || showingCapture || state.mode === 'history' || state.drawingMode);
  refs.guideOverlay.classList.toggle('hidden', !hasVideo || showingCapture || !state.showGuides);
  refs.cleanHint.classList.add('hidden');
  refs.drawingHint.classList.toggle('hidden', !hasVideo || !state.drawingMode);
  refs.app.classList.toggle('controls-hidden', hasVideo && !state.controlsVisible && !state.drawingMode);
  refs.app.classList.toggle('capture-only', state.captureOnly || (showingCapture && !hasVideo));
  refs.app.classList.toggle('capture-viewing', showingCapture);
  refs.app.classList.toggle('drawing-mode', hasVideo && state.drawingMode);
  refs.bottomDock.classList.toggle('phases-mode', state.mode === 'phases');
  refs.bottomDock.classList.toggle('analysis-mode', state.mode === 'analysis');
  refs.bottomDock.classList.toggle('history-mode', state.mode === 'history');
  refs.playerStrip.classList.toggle('hidden', state.mode !== 'phases' || state.captureOnly || showingCapture);
  refs.drawingCanvas.classList.toggle('hidden', !hasVideo || showingCapture);
}

function renderRails() {
  refs.toggleGuidesBtn.querySelector('b').textContent = state.showGuides ? 'ON' : 'OFF';
  refs.switchModeBtn.querySelector('b').textContent = state.guideMode === 'dtl' ? 'DTL' : 'FO';
  refs.drawModeBtn.querySelector('b').textContent = state.drawingMode ? 'ON' : 'OFF';
  refs.toggleDrawingsBtn.querySelector('b').textContent = state.showDrawings ? 'ON' : 'OFF';
  refs.undoLineBtn.querySelector('b').textContent = String(state.lines.length);
  refs.dtlGuides.classList.toggle('hidden', state.guideMode !== 'dtl');
  refs.foGuides.classList.toggle('hidden', state.guideMode !== 'fo');

  refs.drawModeBtn.classList.toggle('active', state.drawingMode);
  refs.toggleDrawingsBtn.classList.toggle('active', state.showDrawings);
  refs.undoLineBtn.disabled = state.lines.length === 0;
  refs.clearLinesBtn.disabled = state.lines.length === 0;
  refs.drawingCanvas.classList.toggle('drawing-enabled', state.drawingMode);
}

function renderTabs() {
  const tabs = {
    phases: refs.tabPhases,
    analysis: refs.tabAnalysis,
    history: refs.tabHistory,
  };
  const panels = {
    phases: refs.phasesPanel,
    analysis: refs.analysisPanel,
    history: refs.historyPanel,
  };
  Object.entries(tabs).forEach(([mode, el]) => el.classList.toggle('active', state.mode === mode));
  Object.entries(panels).forEach(([mode, el]) => el.classList.toggle('hidden', state.mode !== mode));
}

function renderPhaseChips() {
  refs.phaseChips.innerHTML = '';
  phases.forEach((phase) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `phase-chip ${phase.id === state.currentPhaseId ? 'active' : ''} ${state.phaseTimes[phase.id] != null ? 'marked' : ''}`;
    button.innerHTML = `<span class="dot"></span>${phase.label}`;
    button.addEventListener('click', () => jumpToPhase(phase.id));
    refs.phaseChips.appendChild(button);
  });
}

function renderPhaseSummary() {
  refs.phaseSummary.innerHTML = '';
  phases.forEach((phase) => {
    const cell = document.createElement('div');
    cell.className = 'summary-cell';
    cell.innerHTML = `<b>${phase.short}</b><span>${state.phaseTimes[phase.id] != null ? formatTime(state.phaseTimes[phase.id]) : '--'}</span>`;
    refs.phaseSummary.appendChild(cell);
  });
}

function renderReadouts() {
  const phase = currentPhase();
  const time = refs.video.currentTime || 0;
  const currentMarked = state.phaseTimes[phase.id] != null;
  refs.activePhaseName.textContent = phase.label;
  refs.markStatus.textContent = currentMarked ? 'Marcada' : 'Sin marcar';
  refs.markStatus.classList.toggle('done', currentMarked);
  refs.timeReadout.textContent = `${formatTime(time)} · frame ${frameNumber(time)}`;
  refs.playerReadout.textContent = `${formatTime(time)} · frame ${frameNumber(time)}`;
  refs.playerPhaseReadout.textContent = `Fase: ${phase.label}`;
  refs.markPhaseBtn.textContent = currentMarked ? 'Actualizar' : 'Marcar';
  refs.markPhaseBtn.classList.toggle('marked', currentMarked);
  const canSave = Boolean(Object.keys(state.phaseCaptures).length || (state.videoUrl && markedCount()));
  refs.saveSessionBtn.disabled = !canSave;
  refs.saveSessionTopBtn.disabled = !canSave;
}

function renderTimeline() {
  if (!state.videoUrl || state.isSeekingWithSlider || !Number.isFinite(refs.video.duration) || refs.video.duration <= 0) return;
  refs.timeline.value = String(Math.round((refs.video.currentTime / refs.video.duration) * 1000));
}

function renderCapturesGrid() {
  refs.capturesGrid.innerHTML = '';
  const available = captureList();
  if (!available.length) return;
  available.forEach(({ phase, src }, index) => {
    const time = state.phaseTimes[phase.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `capture-card ${index === state.activeCaptureIndex && (state.viewingCapture || state.captureOnly) ? 'active' : ''}`;
    card.innerHTML = `
      <img src="${src}" alt="${phase.label}" />
      <b>${phase.label}</b>
      <span>${time != null ? `${formatTime(time)} · frame ${frameNumber(time)}` : 'Captura guardada'}</span>`;
    card.addEventListener('click', () => openCaptureViewer(phase.id));
    refs.capturesGrid.appendChild(card);
  });
}

function renderRecommendations() {
  const recs = buildRecommendations();
  refs.recommendations.innerHTML = recs.map((rec) => `<div class="rec">${rec}</div>`).join('');
}

function render() {
  renderShell();
  renderRails();
  renderTabs();
  renderPhaseChips();
  renderPhaseSummary();
  renderReadouts();
  renderTimeline();
  renderCapturesGrid();
  renderCaptureViewer();
  drawAllLines();
}


function jumpToPhase(phaseId) {
  state.currentPhaseId = phaseId;
  if (state.videoUrl) state.viewingCapture = false;
  const time = state.phaseTimes[phaseId];
  if (state.videoUrl && time != null) {
    refs.video.currentTime = time;
  } else if (state.videoUrl && Number.isFinite(refs.video.duration) && refs.video.duration > 0) {
    const phase = phases.find((item) => item.id === phaseId) || phases[0];
    refs.video.currentTime = refs.video.duration * phase.pct;
  } else if (!state.videoUrl && state.phaseCaptures[phaseId]) {
    openCaptureViewer(phaseId);
    return;
  }
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  render();
}

function togglePlay() {
  if (!state.videoUrl) return;
  if (refs.video.paused) {
    refs.video.play().catch(console.warn);
  } else {
    refs.video.pause();
  }
}

function cycleSpeed() {
  state.speed = state.speed === 1 ? 0.5 : state.speed === 0.5 ? 0.25 : 1;
  refs.video.playbackRate = state.speed;
  refs.speedBtn.textContent = `${state.speed}x`;
}

function stepFrame(direction) {
  if (!state.videoUrl) return;
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  const step = 1 / ASSUMED_FPS;
  const duration = Number.isFinite(refs.video.duration) ? refs.video.duration : Number.MAX_SAFE_INTEGER;
  const next = Math.min(Math.max((refs.video.currentTime || 0) + (direction * step), 0), duration);
  refs.video.currentTime = next;
}

function markCurrentPhase() {
  if (!state.videoUrl) return;
  const phase = currentPhase();
  const currentIndex = phases.findIndex((item) => item.id === phase.id);
  state.phaseTimes[phase.id] = refs.video.currentTime || 0;
  render();

  const nextPhase = phases[currentIndex + 1];
  if (nextPhase) {
    setTimeout(() => jumpToPhase(nextPhase.id), 90);
  }
}

function updateTimelineFromInput() {
  if (!state.videoUrl || !Number.isFinite(refs.video.duration) || refs.video.duration <= 0) return;
  const pct = Number(refs.timeline.value) / 1000;
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  refs.video.currentTime = refs.video.duration * pct;
  renderReadouts();
}

function buildRecommendations() {
  const marked = markedCount();
  const missing = phases.filter((phase) => state.phaseTimes[phase.id] == null).map((phase) => phase.label);
  const metrics = state.analysisMetrics || computeAnalysisMetrics();
  state.analysisMetrics = metrics;
  const recs = [];

  if (state.autoDetection.status === 'done') {
    recs.push(`Detección automática aplicada con confianza aproximada ${Math.round((state.autoDetection.confidence || 0) * 100)}%. Revisa y corrige manualmente cualquier fase antes de guardar.`);
  } else if (state.autoDetection.status === 'failed') {
    recs.push('No se pudo detectar automáticamente con suficiente fiabilidad. Usa el marcado manual de fases.');
  }

  if (marked < phases.length) {
    recs.push(`Fases marcadas: ${marked}/${phases.length}. Pendientes: ${missing.join(', ') || 'ninguna'}.`);
  } else {
    recs.push('Todas las fases principales están marcadas. El análisis de tempo y capturas ya es consistente.');
  }

  if (metrics?.tempoRatio) {
    recs.push(`Tempo estimado backswing/downswing: <b>${metrics.tempoRatio.toFixed(2)}:1</b>. Backswing: ${metrics.backswing.toFixed(2)} s · Downswing: ${metrics.downswing.toFixed(2)} s · Total analizado: ${metrics.total.toFixed(2)} s.`);
  }

  if (metrics?.transitionPause != null) {
    recs.push(`Transición Top → Impact: ${metrics.downswing.toFixed(2)} s. Si esta fase parece demasiado corta/larga, revisa que Top e Impact estén bien colocados.`);
  }

  if (metrics?.impactFrame != null) {
    recs.push(`Impact estimado en frame ${metrics.impactFrame}. La app usa ${ASSUMED_FPS} fps como referencia práctica para navegar frame a frame.`);
  }

  if (state.guideMode === 'dtl') {
    recs.push('Vista DTL: usa las líneas para comparar plano de subida/bajada, eje corporal y desplazamiento lateral de cabeza/cadera.');
  } else {
    recs.push('Vista Face-On: revisa estabilidad de cabeza, transferencia de peso, manos en impacto y finish equilibrado.');
  }

  if (Object.keys(state.phaseCaptures).length) {
    recs.push('Toca cualquier captura para verla grande sobre la pantalla y desliza a derecha/izquierda entre fases.');
  }

  return recs;
}


function captureList() {
  return phases
    .map((phase) => ({ phase, src: state.phaseCaptures[phase.id] }))
    .filter((item) => Boolean(item.src));
}

function openCaptureViewer(phaseId) {
  const list = captureList();
  if (!list.length) return;
  const index = Math.max(0, list.findIndex((item) => item.phase.id === phaseId));
  state.activeCaptureIndex = index >= 0 ? index : 0;
  state.viewingCapture = true;
  if (list[state.activeCaptureIndex]) state.currentPhaseId = list[state.activeCaptureIndex].phase.id;
  if (state.videoUrl) {
    refs.video.pause();
    refs.playBtn.textContent = 'Play';
  }
  render();
}

function closeCaptureViewerToVideo() {
  if (!state.videoUrl) return;
  state.viewingCapture = false;
  render();
}

function moveCapture(delta) {
  const list = captureList();
  if (!list.length) return;
  const next = Math.min(Math.max(state.activeCaptureIndex + delta, 0), list.length - 1);
  state.activeCaptureIndex = next;
  state.currentPhaseId = list[next].phase.id;
  state.viewingCapture = true;
  renderCaptureViewer();
  renderCapturesGrid();
}

function renderCaptureViewer() {
  const list = captureList();
  if (!list.length) {
    refs.captureViewer.classList.add('hidden');
    refs.captureBadge.classList.add('hidden');
    return;
  }
  if (state.activeCaptureIndex >= list.length) state.activeCaptureIndex = list.length - 1;
  if (state.activeCaptureIndex < 0) state.activeCaptureIndex = 0;
  const item = list[state.activeCaptureIndex];
  const showing = state.viewingCapture || state.captureOnly;
  refs.captureViewer.classList.toggle('hidden', !showing);
  refs.captureBadge.classList.toggle('hidden', !showing);
  if (!showing || !item) return;
  refs.captureViewer.src = item.src;
  const time = state.phaseTimes[item.phase.id];
  refs.captureBadge.textContent = `${item.phase.label} · ${state.activeCaptureIndex + 1}/${list.length}${time != null ? ` · ${formatTime(time)}` : ''}`;
}

function computeAnalysisMetrics() {
  const t = state.phaseTimes;
  const has = (id) => Number.isFinite(t[id]);
  const metrics = {
    marked: markedCount(),
    assumedFps: ASSUMED_FPS,
    duration: Number.isFinite(refs.video.duration) ? refs.video.duration : null,
    confidence: state.autoDetection.confidence || 0,
  };

  if (has('top') && has('impact')) {
    metrics.downswing = Math.max(0, t.impact - t.top);
  }
  if (has('address') && has('top')) {
    metrics.backswing = Math.max(0, t.top - t.address);
  } else if (has('takeaway') && has('top')) {
    metrics.backswing = Math.max(0, t.top - t.takeaway);
  }
  if (has('address') && has('finish')) {
    metrics.total = Math.max(0, t.finish - t.address);
  }
  if (metrics.backswing && metrics.downswing) {
    metrics.tempoRatio = metrics.backswing / Math.max(metrics.downswing, 0.001);
  }
  if (has('top') && has('impact')) {
    metrics.transitionPause = Math.max(0, t.impact - t.top);
  }
  if (has('impact')) metrics.impactFrame = frameNumber(t.impact);

  metrics.intervals = [];
  for (let i = 0; i < phases.length - 1; i += 1) {
    const a = phases[i];
    const b = phases[i + 1];
    if (has(a.id) && has(b.id)) {
      metrics.intervals.push({ from: a.label, to: b.label, seconds: Math.max(0, t[b.id] - t[a.id]) });
    }
  }
  return metrics;
}

function fallbackPhaseTimes(duration) {
  const safe = Number.isFinite(duration) && duration > 0 ? duration : 2;
  return Object.fromEntries(phases.map((phase) => [phase.id, Math.max(0, Math.min(safe, safe * phase.pct))]));
}

function enforceIncreasing(times, duration) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 2;
  const minGap = Math.max(0.035, safeDuration * 0.025);
  let last = 0;
  const output = {};
  phases.forEach((phase, index) => {
    let value = Number.isFinite(times[phase.id]) ? times[phase.id] : safeDuration * phase.pct;
    if (index === 0) value = Math.max(0, Math.min(value, safeDuration - minGap * (phases.length - 1)));
    else value = Math.max(value, last + minGap);
    value = Math.min(value, safeDuration - minGap * (phases.length - 1 - index));
    output[phase.id] = Math.max(0, Math.min(safeDuration, value));
    last = output[phase.id];
  });
  return output;
}

async function sampleMotionProfile() {
  const video = refs.video;
  const duration = video.duration;
  if (!state.videoUrl || !Number.isFinite(duration) || duration <= 0.25) return null;
  const originalTime = video.currentTime || 0;
  const samples = Math.min(36, Math.max(20, Math.round(duration * 9)));
  const canvas = refs.captureCanvas;
  const w = 72;
  const h = 128;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let previous = null;
  const profile = [];

  for (let i = 0; i < samples; i += 1) {
    const t = duration * (i / (samples - 1));
    await seekVideoTo(t);
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let diff = 0;
    let count = 0;
    if (previous) {
      for (let px = 0; px < data.length; px += 16) {
        const lum = (data[px] + data[px + 1] + data[px + 2]) / 3;
        diff += Math.abs(lum - previous[count]);
        previous[count] = lum;
        count += 1;
      }
      profile.push({ time: t, score: diff / Math.max(1, count) });
    } else {
      previous = [];
      for (let px = 0; px < data.length; px += 16) {
        previous.push((data[px] + data[px + 1] + data[px + 2]) / 3);
      }
      profile.push({ time: t, score: 0 });
    }
  }

  await seekVideoTo(originalTime);
  return profile;
}

function detectTimesFromMotion(profile, duration) {
  if (!profile || profile.length < 8) return { times: fallbackPhaseTimes(duration), confidence: 0.25, peakTime: null };
  const maxScore = Math.max(...profile.map((p) => p.score));
  const avgScore = profile.reduce((sum, p) => sum + p.score, 0) / profile.length;
  const threshold = Math.max(avgScore * 1.15, maxScore * 0.22);
  const active = profile.map((p, i) => ({ ...p, i })).filter((p, i) => i > 1 && p.score >= threshold);

  if (!active.length || maxScore < 1) {
    return { times: fallbackPhaseTimes(duration), confidence: 0.2, peakTime: null };
  }

  const firstActive = active[0].i;
  const lastActive = active[active.length - 1].i;
  const impactCandidates = profile
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.time >= duration * 0.35 && p.time <= duration * 0.78);
  const impact = (impactCandidates.length ? impactCandidates : profile).reduce((best, p) => p.score > best.score ? p : best, { score: -1, time: duration * 0.62, i: Math.round(profile.length * 0.62) });

  const topWindow = profile
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.i > firstActive + 1 && p.i < impact.i && p.time >= duration * 0.22 && p.time <= duration * 0.58);
  const top = topWindow.length
    ? topWindow.reduce((best, p) => p.score < best.score ? p : best)
    : { time: duration * 0.38, i: Math.round(profile.length * 0.38), score: avgScore };

  const times = enforceIncreasing({
    address: profile[Math.max(0, firstActive - 2)]?.time ?? duration * 0.05,
    takeaway: profile[Math.max(0, firstActive)]?.time ?? duration * 0.18,
    top: top.time,
    impact: impact.time,
    finish: profile[Math.min(profile.length - 1, lastActive + 2)]?.time ?? duration * 0.9,
  }, duration);

  const spread = Math.min(1, maxScore / Math.max(avgScore * 3, 1));
  const orderOk = times.address < times.takeaway && times.takeaway < times.top && times.top < times.impact && times.impact < times.finish;
  const confidence = Math.max(0.35, Math.min(0.88, 0.42 + spread * 0.32 + (orderOk ? 0.14 : 0)));
  return { times, confidence, peakTime: impact.time };
}

async function autoDetectPhases() {
  if (!state.videoUrl || state.autoDetection.status === 'running' || state.autoDetection.status === 'done') return;
  setAppState('detecting');
  state.autoDetection.status = 'running';
  refs.analysisStatus.textContent = 'Detectando fases automáticamente mediante perfil de movimiento…';
  render();
  try {
    const duration = refs.video.duration;
    const profile = await sampleMotionProfile();
    const result = detectTimesFromMotion(profile, duration);
    state.phaseTimes = result.times;
    state.autoDetection = {
      status: 'done',
      confidence: result.confidence,
      method: 'motion-profile-local',
      samples: profile?.length || 0,
      motionPeakTime: result.peakTime,
    };
    state.analysisMetrics = computeAnalysisMetrics();
    state.currentPhaseId = 'address';
    await seekVideoTo(state.phaseTimes.address || 0);
    setAppState('detected');
    refs.analysisStatus.textContent = `Fases detectadas automáticamente (${Math.round(result.confidence * 100)}% confianza). Corrige manualmente si hace falta y genera el análisis.`;
    render();
  } catch (error) {
    console.warn('Auto detection failed', error);
    state.phaseTimes = fallbackPhaseTimes(refs.video.duration);
    state.autoDetection = { status: 'failed', confidence: 0.2, method: 'fallback-percentages', samples: 0, motionPeakTime: null };
    state.analysisMetrics = computeAnalysisMetrics();
    setAppState('marking');
    refs.analysisStatus.textContent = 'No se pudo detectar con fiabilidad. Se han colocado fases estimadas por porcentaje para que puedas corregirlas.';
    render();
  }
}

function seekVideoTo(time) {
  return new Promise((resolve) => {
    const safeTime = Math.max(0, Math.min(time, Number.isFinite(refs.video.duration) ? refs.video.duration : time));
    if (Math.abs((refs.video.currentTime || 0) - safeTime) < 0.03) return resolve();
    const onSeeked = () => resolve();
    refs.video.addEventListener('seeked', onSeeked, { once: true });
    refs.video.currentTime = safeTime;
  });
}

async function captureFrameAt(time) {
  const video = refs.video;
  if (!state.videoUrl || !video.videoWidth || !video.videoHeight) return null;
  const canvas = refs.captureCanvas;
  const maxWidth = Math.min(video.videoWidth, 1440);
  const scale = maxWidth / video.videoWidth;
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  await seekVideoTo(time);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function generatePhaseCaptures() {
  if (!state.videoUrl) return {};
  const originalTime = refs.video.currentTime || 0;
  refs.video.pause();
  refs.playBtn.textContent = 'Play';

  const results = {};
  for (const phase of phases) {
    const time = state.phaseTimes[phase.id];
    if (time == null) continue;
    const image = await captureFrameAt(time);
    if (image) results[phase.id] = image;
  }

  await seekVideoTo(originalTime);
  renderReadouts();
  renderTimeline();
  return results;
}

async function analyze() {
  if (!state.videoUrl) return;
  setMode('analysis');
  setAppState('analyzing');
  refs.analysisStatus.textContent = 'Generando capturas y métricas del swing…';
  refs.recommendations.innerHTML = '';
  refs.capturesGrid.innerHTML = '';

  try {
    state.phaseCaptures = await generatePhaseCaptures();
    state.analysisMetrics = computeAnalysisMetrics();
    const capturesCount = Object.keys(state.phaseCaptures).length;
    refs.analysisStatus.textContent = `Listo: ${capturesCount} capturas · ${markedCount()}/${phases.length} fases · tempo ${state.analysisMetrics?.tempoRatio ? state.analysisMetrics.tempoRatio.toFixed(2) + ':1' : 'pendiente'}.`;
    renderRecommendations();
    renderCapturesGrid();
    setAppState('completed');
    render();
  } catch (error) {
    console.error(error);
    refs.analysisStatus.textContent = 'No se pudieron generar las capturas.';
    setAppState('error');
  }
}

async function saveSession() {
  try {
    if (!Object.keys(state.phaseCaptures).length && state.videoUrl && markedCount()) {
      state.phaseCaptures = await generatePhaseCaptures();
    }
    if (!Object.keys(state.phaseCaptures).length) {
      alert('Primero genera las capturas de las fases en la pestaña Análisis.');
      return;
    }
    const previewCapture = state.phaseCaptures.address || Object.values(state.phaseCaptures)[0] || null;
    await dbPut({
      id: uid(),
      createdAt: new Date().toISOString(),
      videoName: state.videoName,
      duration: Number.isFinite(refs.video.duration) ? refs.video.duration : null,
      guideMode: state.guideMode,
      phaseTimes: clone(state.phaseTimes),
      phaseCaptures: clone(state.phaseCaptures),
      analysisMetrics: clone(state.analysisMetrics || computeAnalysisMetrics()),
      autoDetection: clone(state.autoDetection),
      lines: clone(state.lines),
      thumbnail: previewCapture,
    });
    setAppState('saved');
    await loadHistory();
    setMode('history');
  } catch (error) {
    console.error(error);
    setAppState('error');
    alert('No se pudo guardar la sesión. Puede faltar espacio o estar bloqueado el almacenamiento del navegador.');
  }
}

async function loadHistory() {
  const sessions = (await dbAll()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  refs.historyList.innerHTML = '';
  if (!sessions.length) {
    refs.historyList.innerHTML = '<div class="status-box">Aún no hay sesiones guardadas.</div>';
    return;
  }
  sessions.forEach((session) => {
    const item = document.createElement('button');
    item.className = 'history-item';
    item.type = 'button';
    const date = new Date(session.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    const capturesCount = Object.keys(session.phaseCaptures || {}).length;
    item.innerHTML = `
      <img class="history-thumb" src="${session.thumbnail || 'icons/icon-192.png'}" alt="Miniatura" />
      <div>
        <div class="history-title">${session.videoName || 'Swing guardado'}</div>
        <div class="history-meta">${date} · ${capturesCount} capturas · ${Object.keys(session.phaseTimes || {}).length}/${phases.length} fases</div>
      </div>`;
    item.addEventListener('click', () => restoreSession(session));
    refs.historyList.appendChild(item);
  });
}

function restoreSession(session) {
  revokeVideoUrl();
  resetSessionState();
  state.videoBlob = session.videoBlob || null;
  state.videoName = session.videoName || 'Swing guardado';
  state.phaseTimes = session.phaseTimes || {};
  state.phaseCaptures = session.phaseCaptures || {};
  state.analysisMetrics = session.analysisMetrics || null;
  state.autoDetection = session.autoDetection || { status: 'idle', confidence: 0, method: '', samples: 0, motionPeakTime: null };
  state.lines = session.lines || [];
  state.guideMode = session.guideMode || 'dtl';
  state.mode = Object.keys(state.phaseCaptures).length ? 'analysis' : 'phases';
  state.controlsVisible = true;
  state.activeCaptureIndex = 0;

  if (Object.keys(state.phaseCaptures).length) {
    state.viewingCapture = true;
    refs.analysisStatus.textContent = `Sesión restaurada: ${Object.keys(state.phaseCaptures).length} capturas disponibles. Desliza para revisar fases.`;
    renderRecommendations();
  } else {
    state.viewingCapture = false;
    refs.analysisStatus.textContent = 'Marca las fases y genera las capturas.';
    refs.recommendations.innerHTML = '';
  }

  if (session.videoBlob) {
    state.captureOnly = false;
    state.videoUrl = URL.createObjectURL(session.videoBlob);
    refs.video.src = state.videoUrl;
    refs.video.load();
    setAppState('loaded');
  } else {
    state.captureOnly = true;
    state.videoUrl = null;
    state.videoBlob = null;
    refs.video.removeAttribute('src');
    refs.video.load();
    setAppState('saved');
  }
  render();
}

async function clearHistory() {
  if (!confirm('¿Borrar todas las sesiones guardadas en este dispositivo?')) return;
  await dbClear();
  await loadHistory();
}

function openHistoryFromStart() {
  revokeVideoUrl();
  resetSessionState();
  state.captureOnly = true;
  state.videoUrl = null;
  state.videoBlob = null;
  state.videoName = '';
  state.mode = 'history';
  state.viewingCapture = false;
  state.controlsVisible = true;
  refs.video.removeAttribute('src');
  refs.video.load();
  setAppState('saved');
  render();
  loadHistory();
}

function resizeDrawingCanvas() {
  const canvas = refs.drawingCanvas;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  drawAllLines();
}

function getCanvasCssSize() {
  const rect = refs.drawingCanvas.getBoundingClientRect();
  return { width: rect.width || 1, height: rect.height || 1 };
}

function toNormalized(clientX, clientY) {
  const rect = refs.drawingCanvas.getBoundingClientRect();
  return {
    x: Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1),
    y: Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1),
  };
}


function drawLine(ctx, line, cssWidth, cssHeight, dpr, dashed = false) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.8;
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 5;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(line.x1 * cssWidth, line.y1 * cssHeight);
  ctx.lineTo(line.x2 * cssWidth, line.y2 * cssHeight);
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx, point, cssWidth, cssHeight, dpr) {
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(0,0,0,.72)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(point.x * cssWidth, point.y * cssHeight, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAllLines() {
  const canvas = refs.drawingCanvas;
  if (!canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = getCanvasCssSize();

  if (state.showDrawings) {
    state.lines.forEach((line) => drawLine(ctx, line, width, height, dpr, false));
  }
  if (state.pendingLineStart) {
    drawPoint(ctx, state.pendingLineStart, width, height, dpr);
  }
  if (state.previewLine) {
    drawLine(ctx, state.previewLine, width, height, dpr, true);
  }
}

function toggleDrawingMode() {
  if (!state.videoUrl) return;
  state.drawingMode = !state.drawingMode;
  if (state.drawingMode) {
    state.controlsVisible = true;
    state.mode = 'phases';
    state.viewingCapture = false;
    refs.video.pause();
    refs.playBtn.textContent = 'Play';
  }
  state.previewLine = null;
  state.pendingLineStart = null;
  state.pointerStart = null;
  state.pointerMoved = false;
  state.pointerDown = false;
  render();
}

function distance(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lineLength(line) {
  if (!line) return 0;
  return distance({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
}

function createLineFromPending(point) {
  if (!state.pendingLineStart) return false;
  const line = {
    x1: state.pendingLineStart.x,
    y1: state.pendingLineStart.y,
    x2: point.x,
    y2: point.y,
  };
  state.pendingLineStart = null;
  state.previewLine = null;
  if (lineLength(line) > 0.012) {
    state.lines.push(line);
    return true;
  }
  return false;
}

function handleCanvasPointerDown(event) {
  if (!state.drawingMode) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  state.pointerDown = true;
  state.pointerStart = point;
  state.pointerMoved = false;
  state.previewLine = state.pendingLineStart
    ? { x1: state.pendingLineStart.x, y1: state.pendingLineStart.y, x2: point.x, y2: point.y }
    : { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  refs.drawingCanvas.setPointerCapture?.(event.pointerId);
  drawAllLines();
}

function handleCanvasPointerMove(event) {
  if (!state.drawingMode || !state.pointerDown || !state.previewLine) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  if (distance(state.pointerStart, point) > 0.006) state.pointerMoved = true;
  state.previewLine.x2 = point.x;
  state.previewLine.y2 = point.y;
  drawAllLines();
}

function handleCanvasPointerUp(event) {
  if (!state.drawingMode || !state.pointerDown) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  const wasMoved = state.pointerMoved;
  const draggedLine = state.previewLine;
  state.pointerDown = false;
  state.pointerStart = null;
  state.pointerMoved = false;

  if (wasMoved && draggedLine && lineLength(draggedLine) > 0.012) {
    state.lines.push(draggedLine);
    state.pendingLineStart = null;
    state.previewLine = null;
  } else if (!state.pendingLineStart) {
    state.pendingLineStart = point;
    state.previewLine = null;
  } else {
    createLineFromPending(point);
  }

  refs.drawingCanvas.releasePointerCapture?.(event.pointerId);
  drawAllLines();
  renderRails();
}

function cancelCanvasPointer(event) {
  if (!state.drawingMode) return;
  state.pointerDown = false;
  state.pointerStart = null;
  state.pointerMoved = false;
  state.previewLine = null;
  try { refs.drawingCanvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
  drawAllLines();
  renderRails();
}

function bindEvents() {
  refs.pickVideoBtn.addEventListener('click', () => refs.videoInput.click());
  refs.openCameraBtn.addEventListener('click', () => refs.cameraInput.click());
  refs.openHistoryStartBtn.addEventListener('click', openHistoryFromStart);
  refs.uploadBtn.addEventListener('click', () => refs.videoInput.click());
  refs.videoInput.addEventListener('change', (event) => applyVideoFile(event.target.files?.[0]));
  refs.cameraInput.addEventListener('change', (event) => applyVideoFile(event.target.files?.[0]));

  refs.tapLayer.addEventListener('click', toggleControls);
  refs.video.addEventListener('click', toggleControls);
  refs.playBtn.addEventListener('click', togglePlay);
  refs.video.addEventListener('timeupdate', () => { renderReadouts(); renderTimeline(); });
  refs.video.addEventListener('seeked', () => { renderReadouts(); renderTimeline(); });
  refs.video.addEventListener('play', () => { refs.playBtn.textContent = 'Pause'; });
  refs.video.addEventListener('pause', () => { refs.playBtn.textContent = 'Play'; });
  refs.video.addEventListener('loadedmetadata', () => {
    refs.video.playbackRate = state.speed;
    resizeDrawingCanvas();
    if (state.phaseTimes[currentPhase().id] == null && Number.isFinite(refs.video.duration) && refs.video.duration > 0) {
      refs.video.currentTime = refs.video.duration * currentPhase().pct;
    }
    render();
    if (state.autoDetection.status === 'queued') {
      window.setTimeout(() => autoDetectPhases(), 220);
    }
  });

  refs.toggleGuidesBtn.addEventListener('click', () => { state.showGuides = !state.showGuides; render(); });
  refs.switchModeBtn.addEventListener('click', () => { state.guideMode = state.guideMode === 'dtl' ? 'fo' : 'dtl'; render(); });
  refs.drawModeBtn.addEventListener('click', toggleDrawingMode);
  refs.toggleDrawingsBtn.addEventListener('click', () => { state.showDrawings = !state.showDrawings; drawAllLines(); renderRails(); });
  refs.undoLineBtn.addEventListener('click', () => { state.lines.pop(); drawAllLines(); renderRails(); });
  refs.clearLinesBtn.addEventListener('click', () => { state.lines = []; drawAllLines(); renderRails(); });

  refs.tabPhases.addEventListener('click', () => setMode('phases'));
  refs.tabAnalysis.addEventListener('click', () => setMode('analysis'));
  refs.tabHistory.addEventListener('click', () => setMode('history'));
  refs.speedBtn.addEventListener('click', cycleSpeed);

  refs.timeline.addEventListener('input', () => {
    state.isSeekingWithSlider = true;
    updateTimelineFromInput();
  });
  refs.timeline.addEventListener('change', () => {
    state.isSeekingWithSlider = false;
    renderTimeline();
  });
  refs.backFrameBtn.addEventListener('click', () => stepFrame(-1));
  refs.forwardFrameBtn.addEventListener('click', () => stepFrame(1));
  refs.markPhaseBtn.addEventListener('click', markCurrentPhase);
  refs.analyzeBtn.addEventListener('click', analyze);
  refs.saveSessionBtn.addEventListener('click', saveSession);
  refs.saveSessionTopBtn.addEventListener('click', saveSession);
  refs.clearHistoryBtn.addEventListener('click', clearHistory);

  refs.drawingCanvas.addEventListener('pointerdown', handleCanvasPointerDown);
  refs.drawingCanvas.addEventListener('pointermove', handleCanvasPointerMove);
  refs.drawingCanvas.addEventListener('pointerup', handleCanvasPointerUp);
  refs.drawingCanvas.addEventListener('pointercancel', cancelCanvasPointer);
  refs.drawingCanvas.addEventListener('lostpointercapture', cancelCanvasPointer);
  refs.captureViewer.addEventListener('pointerdown', (event) => {
    state.captureSwipeStart = { x: event.clientX, y: event.clientY };
  });
  refs.captureViewer.addEventListener('pointerup', (event) => {
    if (!state.captureSwipeStart) return;
    const dx = event.clientX - state.captureSwipeStart.x;
    const dy = event.clientY - state.captureSwipeStart.y;
    state.captureSwipeStart = null;
    if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) {
      moveCapture(dx < 0 ? 1 : -1);
    }
  });
  refs.captureViewer.addEventListener('dblclick', closeCaptureViewerToVideo);
  window.addEventListener('resize', resizeDrawingCanvas);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    refs.installBtn.classList.remove('hidden');
    refs.installBtnEmpty.classList.remove('hidden');
  });

  const install = async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    refs.installBtn.classList.add('hidden');
    refs.installBtnEmpty.classList.add('hidden');
  };
  refs.installBtn.addEventListener('click', install);
  refs.installBtnEmpty.addEventListener('click', install);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('Service worker no registrado:', error);
  }
}

function init() {
  bindEvents();
  render();
  loadHistory();
  registerServiceWorker();
}

init();
