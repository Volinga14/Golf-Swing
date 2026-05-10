'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'swing-lab-db';
const DB_VERSION = 7;
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
  showGuides: false,
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
  selectedLineIndex: -1,
  dragLineIndex: -1,
  dragStartPoint: null,
  dragOriginalLine: null,
  longPressTimer: null,
  lockAxisMode: false,
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
  state.selectedLineIndex = -1;
  state.dragLineIndex = -1;
  state.dragStartPoint = null;
  state.dragOriginalLine = null;
  state.lockAxisMode = false;
  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
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
  refs.rightRail.classList.toggle('hidden', !(hasVideo || hasCaptures));
  refs.bottomDock.classList.toggle('hidden', !hasSession || state.drawingMode);
  refs.phaseHud.classList.toggle('hidden', !hasVideo || showingCapture || state.mode === 'history' || state.drawingMode);
  refs.guideOverlay.classList.toggle('hidden', !hasVideo || showingCapture || !state.showGuides);
  refs.cleanHint.classList.add('hidden');
  refs.drawingHint.classList.toggle('hidden', !hasSession || !state.drawingMode);
  refs.app.classList.toggle('controls-hidden', hasSession && !state.controlsVisible && !state.drawingMode);
  refs.app.classList.toggle('capture-only', state.captureOnly || (showingCapture && !hasVideo));
  refs.app.classList.toggle('capture-viewing', showingCapture);
  refs.app.classList.toggle('drawing-mode', hasSession && state.drawingMode);
  refs.bottomDock.classList.toggle('phases-mode', state.mode === 'phases');
  refs.bottomDock.classList.toggle('analysis-mode', state.mode === 'analysis');
  refs.bottomDock.classList.toggle('history-mode', state.mode === 'history');
  refs.playerStrip.classList.toggle('hidden', state.mode !== 'phases' || state.captureOnly || showingCapture);
  refs.drawingCanvas.classList.toggle('hidden', !hasSession);
}

function renderRails() {
  refs.toggleGuidesBtn.querySelector('b').textContent = state.showGuides ? 'ON' : 'OFF';
  refs.switchModeBtn.querySelector('b').textContent = state.guideMode === 'dtl' ? 'DTL' : 'FO';
  refs.drawModeBtn.querySelector('b').textContent = state.drawingMode ? 'ON' : 'OFF';
  refs.toggleDrawingsBtn.querySelector('b').textContent = state.showDrawings ? 'ON' : 'OFF';
  refs.undoLineBtn.querySelector('b').textContent = state.selectedLineIndex >= 0 ? 'Sel' : String(state.lines.length);
  refs.dtlGuides.classList.toggle('hidden', state.guideMode !== 'dtl');
  refs.foGuides.classList.toggle('hidden', state.guideMode !== 'fo');

  refs.drawModeBtn.classList.toggle('active', state.drawingMode);
  refs.toggleDrawingsBtn.classList.toggle('active', state.showDrawings);
  refs.undoLineBtn.disabled = state.lines.length === 0;
  refs.clearLinesBtn.disabled = state.lines.length === 0;
  refs.toggleDrawingsBtn.disabled = state.lines.length === 0;
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

  const confidence = Math.round((state.autoDetection.confidence || 0) * 100);
  if (state.autoDetection.status === 'done') {
    recs.push(`<b>Detección automática:</b> ${confidence}% de confianza. Úsala como pre-marcado: si Top o Impact no caen exactamente en el frame correcto, corrígelos antes de guardar.`);
  } else if (state.autoDetection.status === 'failed') {
    recs.push('<b>Detección automática:</b> baja confianza. Se han colocado fases estimadas y conviene revisarlas manualmente.');
  } else if (state.captureOnly) {
    recs.push('<b>Sesión recuperada:</b> estás viendo capturas guardadas. Puedes activar dibujo y añadir líneas sobre las imágenes aunque no esté cargado el vídeo original.');
  }

  if (marked < phases.length) {
    recs.push(`<b>Fases:</b> ${marked}/${phases.length} marcadas. Pendientes: ${missing.join(', ') || 'ninguna'}. El análisis mejora mucho cuando Address, Top, Impact y Finish están bien ajustadas.`);
  } else {
    recs.push('<b>Fases completas:</b> las cinco posiciones principales están disponibles para revisar tempo, capturas y consistencia del swing.');
  }

  if (metrics?.tempoRatio) {
    const tempo = metrics.tempoRatio;
    const tempoComment = tempo < 2.2
      ? 'tempo muy rápido de backswing respecto al downswing; revisa si Top está marcado demasiado tarde o Impact demasiado pronto.'
      : tempo > 4.2
        ? 'tempo lento de backswing respecto al downswing; revisa si Address está demasiado pronto o Top demasiado tarde.'
        : 'tempo dentro de un rango razonable para un swing completo.';
    recs.push(`<b>Tempo:</b> ${tempo.toFixed(2)}:1 · backswing ${metrics.backswing.toFixed(2)} s · downswing ${metrics.downswing.toFixed(2)} s. ${tempoComment}`);
  }

  if (metrics?.phasePercentages?.length) {
    const parts = metrics.phasePercentages.map((p) => `${p.label} ${p.percent}%`).join(' · ');
    recs.push(`<b>Distribución temporal:</b> ${parts}. Útil para detectar si alguna fase ha quedado desplazada por error de marcado.`);
  }

  if (metrics?.impactFrame != null) {
    recs.push(`<b>Impact:</b> frame estimado ${metrics.impactFrame}. Revisa esta fase frame a frame; es la captura más importante para manos, eje de cabeza/cadera y posición del palo.`);
  }

  if (metrics?.consistencyWarnings?.length) {
    recs.push(`<b>Revisión recomendada:</b> ${metrics.consistencyWarnings.join(' ')}`);
  }

  if (state.guideMode === 'dtl') {
    recs.push('<b>DTL:</b> prioriza líneas de plano del palo, línea de pies/target y eje corporal. No hace falta llenar la pantalla: 2–3 líneas suelen ser suficientes.');
  } else {
    recs.push('<b>Face-On:</b> prioriza línea vertical de cabeza, línea de cadera y posición de manos en impacto.');
  }

  if (Object.keys(state.phaseCaptures).length) {
    recs.push('<b>Capturas:</b> toca una imagen para verla grande, desliza entre fases y activa Dibujo para añadir o mover líneas directamente sobre la captura.');
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
  state.controlsVisible = false;
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
  state.controlsVisible = true;
  render();
}

function moveCapture(delta) {
  const list = captureList();
  if (!list.length) return;
  const next = Math.min(Math.max(state.activeCaptureIndex + delta, 0), list.length - 1);
  state.activeCaptureIndex = next;
  state.currentPhaseId = list[next].phase.id;
  state.viewingCapture = true;
  state.controlsVisible = false;
  render();
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
  const safeDuration = Number.isFinite(refs.video.duration) ? refs.video.duration : null;
  const metrics = {
    marked: markedCount(),
    assumedFps: ASSUMED_FPS,
    duration: safeDuration,
    confidence: state.autoDetection.confidence || 0,
    consistencyWarnings: [],
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
  if (has('impact')) metrics.impactFrame = frameNumber(t.impact);

  metrics.intervals = [];
  for (let i = 0; i < phases.length - 1; i += 1) {
    const a = phases[i];
    const b = phases[i + 1];
    if (has(a.id) && has(b.id)) {
      metrics.intervals.push({ from: a.label, to: b.label, seconds: Math.max(0, t[b.id] - t[a.id]) });
    }
  }

  if (metrics.total && metrics.intervals.length) {
    metrics.phasePercentages = metrics.intervals.map((item) => ({
      label: `${item.from}→${item.to}`,
      percent: Math.round((item.seconds / Math.max(metrics.total, 0.001)) * 100),
    }));
  }

  if (metrics.downswing != null && metrics.downswing < 0.08) {
    metrics.consistencyWarnings.push('Top→Impact parece demasiado corto; comprueba ambos frames.');
  }
  if (metrics.backswing != null && metrics.backswing < 0.20) {
    metrics.consistencyWarnings.push('Backswing parece demasiado corto; revisa Address/Top.');
  }
  if (has('finish') && has('impact') && (t.finish - t.impact) < 0.12) {
    metrics.consistencyWarnings.push('Finish está muy cerca de Impact; quizá el finish real está más tarde.');
  }
  if (metrics.tempoRatio && (metrics.tempoRatio < 1.5 || metrics.tempoRatio > 5.5)) {
    metrics.consistencyWarnings.push('El tempo sale fuera de rango habitual; probablemente alguna fase necesita ajuste manual.');
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
  const samples = Math.min(84, Math.max(36, Math.round(duration * 14)));
  const canvas = refs.captureCanvas;
  const w = 96;
  const h = 160;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let previous = null;
  const raw = [];

  for (let i = 0; i < samples; i += 1) {
    const t = duration * (i / (samples - 1));
    await seekVideoTo(t);
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let diff = 0;
    let upper = 0;
    let lower = 0;
    let xMoment = 0;
    let yMoment = 0;
    let motionMass = 0;
    let count = 0;

    if (previous) {
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const px = ((y * w) + x) * 4;
          const lum = (data[px] + data[px + 1] + data[px + 2]) / 3;
          const d = Math.abs(lum - previous[count]);
          previous[count] = lum;
          diff += d;
          if (y < h * 0.52) upper += d; else lower += d;
          xMoment += d * (x / w);
          yMoment += d * (y / h);
          motionMass += d;
          count += 1;
        }
      }
      raw.push({
        time: t,
        score: diff / Math.max(1, count),
        upper: upper / Math.max(1, count),
        lower: lower / Math.max(1, count),
        cx: motionMass ? xMoment / motionMass : 0.5,
        cy: motionMass ? yMoment / motionMass : 0.5,
      });
    } else {
      previous = [];
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const px = ((y * w) + x) * 4;
          previous.push((data[px] + data[px + 1] + data[px + 2]) / 3);
        }
      }
      raw.push({ time: t, score: 0, upper: 0, lower: 0, cx: 0.5, cy: 0.5 });
    }
  }

  await seekVideoTo(originalTime);
  return smoothMotionProfile(raw);
}

function smoothMotionProfile(raw) {
  if (!raw || raw.length < 3) return raw || [];
  return raw.map((p, i) => {
    const items = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3));
    const avg = (key) => items.reduce((sum, item) => sum + item[key], 0) / items.length;
    return { ...p, score: avg('score'), upper: avg('upper'), lower: avg('lower'), cx: avg('cx'), cy: avg('cy') };
  });
}

function percentile(values, q) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] != null ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function indexAtTime(profile, time) {
  let best = 0;
  let bestDiff = Infinity;
  profile.forEach((p, index) => {
    const d = Math.abs(p.time - time);
    if (d < bestDiff) { best = index; bestDiff = d; }
  });
  return best;
}

function localMinimum(profile, startIndex, endIndex, fallbackIndex) {
  const start = Math.max(0, Math.min(profile.length - 1, startIndex));
  const end = Math.max(0, Math.min(profile.length - 1, endIndex));
  if (start > end) return profile[Math.max(0, Math.min(profile.length - 1, fallbackIndex))] || profile[0];
  let best = profile[Math.max(start, Math.min(end, fallbackIndex))] || profile[0];
  for (let i = start; i <= end; i += 1) {
    if (profile[i].score < best.score) best = profile[i];
  }
  return best;
}

function localMaximum(profile, startIndex, endIndex, fallbackIndex) {
  const start = Math.max(0, Math.min(profile.length - 1, startIndex));
  const end = Math.max(0, Math.min(profile.length - 1, endIndex));
  if (start > end) return profile[Math.max(0, Math.min(profile.length - 1, fallbackIndex))] || profile[profile.length - 1];
  let best = profile[Math.max(start, Math.min(end, fallbackIndex))] || profile[profile.length - 1];
  for (let i = start; i <= end; i += 1) {
    if (profile[i].score > best.score) best = profile[i];
  }
  return best;
}

function detectTimesFromMotion(profile, duration) {
  if (!profile || profile.length < 10) return { times: fallbackPhaseTimes(duration), confidence: 0.22, peakTime: null };
  const scores = profile.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const median = percentile(scores, 0.5);
  const p70 = percentile(scores, 0.70);
  const p85 = percentile(scores, 0.85);
  const p92 = percentile(scores, 0.92);
  const noiseFloor = Math.max(median, 0.001);
  const activeThreshold = Math.max(p70, noiseFloor * 1.65, maxScore * 0.18);
  const strongThreshold = Math.max(p85, noiseFloor * 2.15, maxScore * 0.30);
  const indexed = profile.map((p, i) => ({ ...p, i }));
  const active = indexed.filter((p) => p.i > 1 && p.score >= activeThreshold);

  if (!active.length || maxScore < 0.65) {
    return { times: fallbackPhaseTimes(duration), confidence: 0.2, peakTime: null };
  }

  const firstActive = active[0].i;
  const lastActive = active[active.length - 1].i;
  const startTime = Math.max(0, profile[Math.max(0, firstActive - 2)]?.time ?? duration * 0.05);

  const impactSearchStart = Math.max(indexAtTime(profile, duration * 0.38), firstActive + 3);
  const impactSearchEnd = Math.min(indexAtTime(profile, duration * 0.86), profile.length - 1);
  const impact = localMaximum(profile, impactSearchStart, impactSearchEnd, indexAtTime(profile, duration * 0.62));
  const impactIndex = indexAtTime(profile, impact.time);

  const topSearchStart = Math.max(firstActive + 2, indexAtTime(profile, duration * 0.18));
  const topSearchEnd = Math.max(topSearchStart, Math.min(impactIndex - 2, indexAtTime(profile, duration * 0.60)));
  let top = localMinimum(profile, topSearchStart, topSearchEnd, indexAtTime(profile, duration * 0.38));

  // If the quietest point is too close to the start, use the last low-motion point before the downswing burst.
  if (top.time < startTime + duration * 0.12 && topSearchEnd > topSearchStart + 2) {
    const quietBeforeImpact = indexed
      .filter((p) => p.i >= topSearchStart && p.i <= topSearchEnd && p.score <= Math.max(p70, strongThreshold * 0.78))
      .pop();
    if (quietBeforeImpact) top = quietBeforeImpact;
  }

  const topTime = top.time;
  const takeawayWindowEnd = Math.max(indexAtTime(profile, topTime), firstActive + 1);
  const takeaway = localMaximum(profile, firstActive, takeawayWindowEnd, Math.round((firstActive + takeawayWindowEnd) / 2));
  const finishBase = profile[Math.min(profile.length - 1, lastActive + 2)]?.time ?? duration * 0.90;
  const finishTime = Math.min(duration, Math.max(finishBase, impact.time + Math.max(0.18, duration * 0.10)));

  const times = enforceIncreasing({
    address: Math.max(0, startTime - Math.min(0.10, duration * 0.025)),
    takeaway: Math.min(topTime - 0.035, Math.max(startTime + 0.05, takeaway.time)),
    top: topTime,
    impact: impact.time,
    finish: finishTime,
  }, duration);

  const motionContrast = Math.min(1, (p92 - median) / Math.max(p92, 0.001));
  const activeSpan = Math.min(1, Math.max(0, (profile[lastActive].time - profile[firstActive].time) / Math.max(duration, 0.001)));
  const orderOk = times.address < times.takeaway && times.takeaway < times.top && times.top < times.impact && times.impact < times.finish;
  const plausibleTempo = (times.impact - times.top) > 0.06 && (times.top - times.address) > 0.15;
  const confidence = Math.max(0.28, Math.min(0.92, 0.34 + motionContrast * 0.30 + activeSpan * 0.16 + (orderOk ? 0.12 : 0) + (plausibleTempo ? 0.10 : 0)));
  return { times, confidence, peakTime: impact.time, thresholds: { median, p70, p85, p92, activeThreshold, strongThreshold } };
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
    state.controlsVisible = false;
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
    state.lines.forEach((line, index) => drawLine(ctx, line, width, height, dpr, index === state.selectedLineIndex));
  }
  if (state.pendingLineStart) {
    drawPoint(ctx, state.pendingLineStart, width, height, dpr);
  }
  if (state.previewLine) {
    drawLine(ctx, state.previewLine, width, height, dpr, true);
  }
}

function toggleDrawingMode() {
  const hasCaptures = captureList().length > 0;
  if (!state.videoUrl && !hasCaptures) return;
  state.drawingMode = !state.drawingMode;
  if (state.drawingMode) {
    state.controlsVisible = true;
    if (state.videoUrl && !state.viewingCapture) {
      state.mode = 'phases';
      refs.video.pause();
      refs.playBtn.textContent = 'Play';
    } else if (hasCaptures) {
      state.viewingCapture = true;
      state.mode = state.mode === 'history' ? 'history' : 'analysis';
    }
  }
  state.previewLine = null;
  state.pendingLineStart = null;
  state.pointerStart = null;
  state.pointerMoved = false;
  state.pointerDown = false;
  state.dragLineIndex = -1;
  state.dragStartPoint = null;
  state.dragOriginalLine = null;
  state.lockAxisMode = false;
  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
  render();
}

function pointToSegmentDistance(point, line) {
  const ax = line.x1;
  const ay = line.y1;
  const bx = line.x2;
  const by = line.y2;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (!len2) return distance(point, { x: ax, y: ay });
  const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / len2));
  return distance(point, { x: ax + t * dx, y: ay + t * dy });
}

function findLineNearPoint(point) {
  if (!state.lines.length || !state.showDrawings) return -1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  state.lines.forEach((line, index) => {
    const d = pointToSegmentDistance(point, line);
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });
  return bestDistance <= 0.035 ? bestIndex : -1;
}

function snapLineIfNeeded(line) {
  if (!state.lockAxisMode) return line;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { ...line, y2: line.y1, lock: 'horizontal' };
  }
  return { ...line, x2: line.x1, lock: 'vertical' };
}

function startLongPressAxisLock() {
  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = window.setTimeout(() => {
    if (!state.pointerDown || state.dragLineIndex >= 0) return;
    state.lockAxisMode = true;
    if (state.previewLine) state.previewLine = snapLineIfNeeded(state.previewLine);
    refs.drawingHint.textContent = 'Bloqueo ON: línea horizontal/vertical';
    window.setTimeout(() => {
      if (state.drawingMode) refs.drawingHint.textContent = 'Dibujo: toca 2 puntos, arrastra, o mueve una línea existente';
    }, 1200);
    drawAllLines();
  }, 520);
}

function handleCanvasPointerDown(event) {
  if (!state.drawingMode) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  state.pointerDown = true;
  state.pointerStart = point;
  state.pointerMoved = false;
  state.lockAxisMode = false;

  const lineIndex = findLineNearPoint(point);
  if (lineIndex >= 0) {
    state.selectedLineIndex = lineIndex;
    state.dragLineIndex = lineIndex;
    state.dragStartPoint = point;
    state.dragOriginalLine = { ...state.lines[lineIndex] };
    state.previewLine = null;
    state.pendingLineStart = null;
  } else {
    state.dragLineIndex = -1;
    state.dragStartPoint = null;
    state.dragOriginalLine = null;
    state.previewLine = state.pendingLineStart
      ? { x1: state.pendingLineStart.x, y1: state.pendingLineStart.y, x2: point.x, y2: point.y }
      : { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    startLongPressAxisLock();
  }
  refs.drawingCanvas.setPointerCapture?.(event.pointerId);
  drawAllLines();
}

function handleCanvasPointerMove(event) {
  if (!state.drawingMode || !state.pointerDown) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  if (distance(state.pointerStart, point) > 0.006) state.pointerMoved = true;

  if (state.dragLineIndex >= 0 && state.dragOriginalLine && state.dragStartPoint) {
    const dx = point.x - state.dragStartPoint.x;
    const dy = point.y - state.dragStartPoint.y;
    state.lines[state.dragLineIndex] = {
      ...state.dragOriginalLine,
      x1: Math.min(Math.max(state.dragOriginalLine.x1 + dx, 0), 1),
      y1: Math.min(Math.max(state.dragOriginalLine.y1 + dy, 0), 1),
      x2: Math.min(Math.max(state.dragOriginalLine.x2 + dx, 0), 1),
      y2: Math.min(Math.max(state.dragOriginalLine.y2 + dy, 0), 1),
    };
  } else if (state.previewLine) {
    state.previewLine.x2 = point.x;
    state.previewLine.y2 = point.y;
    state.previewLine = snapLineIfNeeded(state.previewLine);
  }
  drawAllLines();
}

function handleCanvasPointerUp(event) {
  if (!state.drawingMode || !state.pointerDown) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  const wasMoved = state.pointerMoved;
  let draggedLine = state.previewLine ? snapLineIfNeeded(state.previewLine) : null;
  const wasMovingLine = state.dragLineIndex >= 0;

  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
  state.pointerDown = false;
  state.pointerStart = null;
  state.pointerMoved = false;

  if (wasMovingLine) {
    state.selectedLineIndex = state.dragLineIndex;
    state.dragLineIndex = -1;
    state.dragStartPoint = null;
    state.dragOriginalLine = null;
    state.previewLine = null;
  } else if (wasMoved && draggedLine && lineLength(draggedLine) > 0.012) {
    state.lines.push(draggedLine);
    state.selectedLineIndex = state.lines.length - 1;
    state.pendingLineStart = null;
    state.previewLine = null;
  } else if (!state.pendingLineStart) {
    state.pendingLineStart = point;
    state.previewLine = null;
    state.selectedLineIndex = -1;
  } else {
    const before = state.lines.length;
    createLineFromPending(point);
    if (state.lines.length > before) state.selectedLineIndex = state.lines.length - 1;
  }

  state.lockAxisMode = false;
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
  state.dragLineIndex = -1;
  state.dragStartPoint = null;
  state.dragOriginalLine = null;
  state.lockAxisMode = false;
  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
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
  refs.undoLineBtn.addEventListener('click', () => { if (state.selectedLineIndex >= 0) { state.lines.splice(state.selectedLineIndex, 1); state.selectedLineIndex = -1; } else { state.lines.pop(); } drawAllLines(); renderRails(); });
  refs.clearLinesBtn.addEventListener('click', () => { state.lines = []; state.selectedLineIndex = -1; state.pendingLineStart = null; state.previewLine = null; drawAllLines(); renderRails(); });

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
    if (!state.captureSwipeStart || state.drawingMode) return;
    const dx = event.clientX - state.captureSwipeStart.x;
    const dy = event.clientY - state.captureSwipeStart.y;
    state.captureSwipeStart = null;
    if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy)) {
      moveCapture(dx < 0 ? 1 : -1);
    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      state.controlsVisible = !state.controlsVisible;
      render();
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
