'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'swing-lab-db';
const DB_VERSION = 10;
const STORE = 'sessions';
const ASSUMED_FPS = 30;

// Reference model calibrated from the standard Swing Lab report structure.
// These are not hard rules: they are used as soft priors to stabilise phase detection.
const SWING_REFERENCE = {
  tempoIdealLow: 2.4,
  tempoIdealHigh: 3.1,
  downSwingMin: 0.12,
  downSwingIdealLow: 0.20,
  downSwingIdealHigh: 0.34,
  downSwingMax: 0.62,
  finishHoldIdeal: 0.45,
  activeRatios: { address: 0.00, takeaway: 0.13, top: 0.50, impact: 0.70, finish: 1.00 },
};

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
  autoDetection: { status: 'idle', confidence: 0, method: '', samples: 0, motionPeakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: {} },
  viewingCapture: false,
  activeCaptureIndex: 0,
  captureSwipeStart: null,
  showGuides: false,
  guideMode: 'dtl',
  speed: 1,
  controlsVisible: true,
  initialVideoClean: false,
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
  sheetExpanded: false,
  sheetDragStartY: null,
  historySelectionMode: false,
  selectedSessionIds: new Set(),
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
  sheetHandle: $('sheetHandle'),
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
  historySelectBtn: $('historySelectBtn'),
  deleteSelectedHistoryBtn: $('deleteSelectedHistoryBtn'),
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


async function dbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDeleteMany(ids) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
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
  state.autoDetection = { status: 'idle', confidence: 0, method: '', samples: 0, motionPeakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: {} };
  state.viewingCapture = false;
  state.activeCaptureIndex = 0;
  state.sheetExpanded = false;
  state.historySelectionMode = false;
  state.selectedSessionIds.clear();
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
  state.initialVideoClean = false;
  state.sheetExpanded = false;
  state.sheetDragStartY = null;
}



function applyVideoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    alert('Selecciona un archivo de vídeo válido.');
    return;
  }
  revokeVideoUrl();
  resetSessionState();
  state.controlsVisible = false;
  state.initialVideoClean = true;
  state.showGuides = false;
  refs.cleanHint.textContent = 'Toca el vídeo para abrir fases';
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  state.videoBlob = file;
  state.videoUrl = URL.createObjectURL(file);
  state.videoName = file.name || `swing-${new Date().toISOString().slice(0, 10)}.mp4`;
  refs.analysisStatus.textContent = 'Detectando fases automáticamente con modelo temporal + referencia Swing Lab… podrás corregirlas manualmente.';
  refs.recommendations.innerHTML = '';
  refs.capturesGrid.innerHTML = '';
  refs.video.src = state.videoUrl;
  refs.video.load();
  state.autoDetection = { status: 'queued', confidence: 0, method: 'Smart Phases v0.8.4', samples: 0, motionPeakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: {} };
  setAppState('loaded');
  render();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'phases') {
    state.sheetExpanded = false;
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
  if (state.initialVideoClean) {
    state.initialVideoClean = false;
    state.controlsVisible = true;
    refs.cleanHint.textContent = 'Toca el vídeo para mostrar controles';
    render();
    return;
  }
  state.controlsVisible = !state.controlsVisible;
  refs.cleanHint.textContent = 'Toca el vídeo para mostrar controles';
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
  refs.app.classList.toggle('initial-clean', hasVideo && state.initialVideoClean && !state.drawingMode && !showingCapture);
  refs.app.classList.toggle('controls-hidden', hasSession && !state.controlsVisible && !state.drawingMode && !state.initialVideoClean);
  refs.app.classList.toggle('capture-only', state.captureOnly || (showingCapture && !hasVideo));
  refs.app.classList.toggle('capture-viewing', showingCapture);
  refs.app.classList.toggle('drawing-mode', hasSession && state.drawingMode);
  refs.bottomDock.classList.toggle('phases-mode', state.mode === 'phases');
  refs.bottomDock.classList.toggle('analysis-mode', state.mode === 'analysis');
  refs.bottomDock.classList.toggle('history-mode', state.mode === 'history');
  refs.bottomDock.classList.toggle('sheet-expanded', state.sheetExpanded && (state.mode === 'analysis' || state.mode === 'history'));
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
  const conf = state.autoDetection?.phaseConfidence || {};
  phases.forEach((phase) => {
    const cell = document.createElement('div');
    cell.className = 'summary-cell';
    const timeText = state.phaseTimes[phase.id] != null ? formatTime(state.phaseTimes[phase.id]) : '--';
    const confText = Number.isFinite(conf[phase.id]) ? `<em>${Math.round(conf[phase.id] * 100)}%</em>` : '';
    cell.innerHTML = `<b>${phase.short}</b><span>${timeText}</span>${confText}`;
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
  if (refs.historySelectBtn) refs.historySelectBtn.textContent = state.historySelectionMode ? 'Cancelar' : 'Seleccionar';
  if (refs.deleteSelectedHistoryBtn) {
    const count = state.selectedSessionIds?.size || 0;
    refs.deleteSelectedHistoryBtn.textContent = count ? `Borrar ${count}` : 'Borrar selección';
    refs.deleteSelectedHistoryBtn.disabled = !count;
  }
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


function fmtSec(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} s` : '--';
}

function buildRecommendations() {
  const marked = markedCount();
  const missing = phases.filter((phase) => state.phaseTimes[phase.id] == null).map((phase) => phase.label);
  const metrics = state.analysisMetrics || computeAnalysisMetrics();
  state.analysisMetrics = metrics;
  const recs = [];
  const confidence = Math.round((state.autoDetection.confidence || 0) * 100);
  const diagnostics = metrics.diagnostics || {};
  const scores = metrics.scores || {};
  const ext = metrics.extendedTimes || {};

  if (state.autoDetection.status === 'done') {
    recs.push(`<b>Detección inteligente:</b> ${metrics.method || 'Smart Phases'} · ${confidence}% de confianza · ${state.autoDetection.samples || 0} muestras. Combina movimiento real del vídeo con un patrón temporal de referencia del informe Swing Lab para estabilizar Address, Top, Impact y Finish.`);
  } else if (state.autoDetection.status === 'failed') {
    recs.push('<b>Motor inteligente:</b> baja confianza. Se han colocado fases estimadas por porcentaje; conviene revisar todos los frames manualmente.');
  } else if (state.captureOnly) {
    recs.push('<b>Sesión recuperada:</b> estás viendo capturas guardadas. Puedes activar dibujo y añadir líneas sobre las imágenes aunque no esté cargado el vídeo original.');
  }

  if (scores.overall != null) {
    recs.push(`<div class="metric-grid">
      <div class="metric-card"><b>${scores.overall}</b><span>Score global</span></div>
      <div class="metric-card"><b>${scores.phaseQuality}</b><span>Fases</span></div>
      <div class="metric-card"><b>${scores.tempo}</b><span>Tempo</span></div>
      <div class="metric-card"><b>${scores.finish}</b><span>Finish</span></div>
    </div>`);
    recs.push(`<b>Lectura técnica:</b> ${metrics.scoreLabels?.overall || 'pendiente'}. Setup/fases ${metrics.scoreLabels?.phaseQuality || 'pendiente'}, tempo ${metrics.scoreLabels?.tempo || 'pendiente'}, secuencia ${metrics.scoreLabels?.sequence || 'pendiente'}. Este bloque replica la lógica de dashboard del informe: score global + lectura accionable, no solo tiempos.`);
  }

  if (marked < phases.length) {
    recs.push(`<b>Fases:</b> ${marked}/${phases.length} marcadas. Pendientes: ${missing.join(', ') || 'ninguna'}. El análisis mejora mucho cuando Address, Top, Impact y Finish están bien ajustadas.`);
  } else {
    recs.push('<b>Fases completas:</b> ya hay una estructura mínima para medir tempo, secuencia y capturas. Revisa manualmente Top e Impact, porque son los dos frames críticos del análisis.');
  }

  if (metrics?.tempoRatio) {
    const tempo = metrics.tempoRatio;
    let tempoComment = 'tempo razonable para un swing completo.';
    if (tempo < 2.0) tempoComment = 'backswing demasiado corto respecto al downswing o Top marcado tarde; revisa Top con frame-by-frame.';
    else if (tempo > 4.3) tempoComment = 'backswing muy largo respecto al downswing o Impact marcado tarde; revisa Impact y Finish.';
    recs.push(`<b>Tempo avanzado:</b> ${tempo.toFixed(2)}:1 · referencia ${metrics.reference?.tempoBand || '2.4:1–3.1:1'} · backswing ${fmtSec(metrics.backswing)} · downswing ${fmtSec(metrics.downswing)} · follow-through ${fmtSec(metrics.followThrough)}. ${tempoComment}`);
  }

  if (metrics?.activeWindow) {
    recs.push(`<b>Ventana activa:</b> ${fmtSec(metrics.activeWindow)} detectados entre ${formatTime(ext.activeStart)} y ${formatTime(ext.activeEnd)}. Esto evita que vídeos largos contaminen el análisis con preparación o pausas antes del swing.`);
  }

  if (Number.isFinite(ext.midBackswing) || Number.isFinite(ext.transition) || Number.isFinite(ext.preImpact)) {
    const parts = [];
    if (Number.isFinite(ext.midBackswing)) parts.push(`mid-backswing F${frameNumber(ext.midBackswing)}`);
    if (Number.isFinite(ext.transition)) parts.push(`transition F${frameNumber(ext.transition)}`);
    if (Number.isFinite(ext.preImpact)) parts.push(`pre-impact F${frameNumber(ext.preImpact)}`);
    recs.push(`<b>Microfases internas:</b> ${parts.join(' · ')}. No añaden botones nuevos, pero ayudan a interpretar secuencia y aceleración entre Top e Impact.`);
  }

  if (metrics?.phaseConfidence) {
    const parts = phases.map((phase) => `${phase.short} ${Math.round((metrics.phaseConfidence[phase.id] ?? metrics.confidence) * 100)}%`).join(' · ');
    recs.push(`<b>Confianza por fase:</b> ${parts}. Prioriza corregir cualquier fase por debajo de 60%, especialmente Top e Impact.`);
  }

  if (metrics?.phasePercentages?.length) {
    const parts = metrics.phasePercentages.map((p) => `${p.label} ${p.percent}%`).join(' · ');
    recs.push(`<b>Distribución temporal:</b> ${parts}. Si un tramo sale extremadamente corto o largo, normalmente indica una fase desplazada.`);
  }

  if (metrics?.impactFrame != null) {
    const impactConf = Math.round(((metrics.phaseConfidence || {}).impact ?? metrics.confidence ?? 0) * 100);
    recs.push(`<b>Impact:</b> frame estimado F${metrics.impactFrame} · confianza ${impactConf}%. Es el frame principal para analizar manos, eje cabeza/cadera, shaft lean y orientación del cuerpo.`);
  }

  if (diagnostics.motionContrast != null) {
    const contrastPct = Math.round(diagnostics.motionContrast * 100);
    const read = contrastPct < 25 ? 'bajo: revisa manualmente porque el fondo/luz dificulta separar el movimiento.' : contrastPct < 55 ? 'medio: detección útil pero Top/Impact deben auditarse.' : 'alto: el vídeo ofrece buena señal de movimiento para detectar fases.';
    recs.push(`<b>Calidad de señal:</b> contraste de movimiento ${contrastPct}% · ${read}`);
  }

  if (metrics.downswing) {
    const downRead = metrics.downswing < SWING_REFERENCE.downSwingIdealLow ? 'demasiado rápida o Top tardío' : metrics.downswing > SWING_REFERENCE.downSwingIdealHigh ? 'lenta o Impact tardío' : 'dentro de rango de referencia';
    recs.push(`<b>Delivery / Impact:</b> downswing ${fmtSec(metrics.downswing)} (${downRead}). Este tramo se usa para priorizar la revisión frame a frame del impacto.`);
  }

  if (metrics?.consistencyWarnings?.length) {
    recs.push(`<b>Revisión obligatoria:</b> ${metrics.consistencyWarnings.join(' ')}`);
  }

  if (state.guideMode === 'dtl') {
    recs.push('<b>Lectura DTL recomendada:</b> usa 2–3 líneas: plano del palo, línea de pies/target y eje corporal. En Top revisa anchura; en Impact revisa si el palo vuelve por una zona coherente y si el cuerpo sigue rotando.');
  } else {
    recs.push('<b>Lectura Face-On recomendada:</b> usa línea vertical de cabeza, línea de cadera y posición de manos. En Impact revisa presión/transferencia y manos delante de la bola.');
  }

  if (Object.keys(state.phaseCaptures).length) {
    recs.push('<b>Capturas:</b> toca una imagen para verla grande, desliza entre fases y activa Dibujo para añadir o mover líneas directamente sobre la captura. Guarda solo cuando Top e Impact estén validados.');
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


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreFromRange(value, min, idealLow, idealHigh, max) {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= idealLow && value <= idealHigh) return 1;
  if (value < idealLow) return clamp((value - min) / Math.max(idealLow - min, 0.001), 0, 1);
  return clamp((max - value) / Math.max(max - idealHigh, 0.001), 0, 1);
}


function lerp(a, b, weight) {
  if (!Number.isFinite(a)) return b;
  if (!Number.isFinite(b)) return a;
  return a * (1 - weight) + b * weight;
}

function referencePhaseTimesFromImpact({ duration, segmentStart, segmentEnd, impactTime, detectedTopTime, topQuality = 0.45, segmentQuality = 0.45 }) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 2;
  const downFromDetected = Number.isFinite(detectedTopTime) ? Math.max(0.08, impactTime - detectedTopTime) : null;
  const segmentSpan = Math.max(0.45, segmentEnd - segmentStart);
  const referenceDown = clamp(downFromDetected || segmentSpan * 0.20, SWING_REFERENCE.downSwingMin, SWING_REFERENCE.downSwingMax);
  const preferredDown = clamp(lerp(referenceDown, (SWING_REFERENCE.downSwingIdealLow + SWING_REFERENCE.downSwingIdealHigh) / 2, topQuality < 0.45 ? 0.45 : 0.18), 0.12, 0.55);
  const referenceTempo = 2.65;
  const backDur = clamp(preferredDown * referenceTempo, 0.34, Math.max(0.45, safeDuration * 0.55));
  const top = clamp(impactTime - preferredDown, 0, safeDuration);
  const address = clamp(top - backDur, 0, Math.max(0, top - 0.08));
  const takeaway = clamp(address + (top - address) * 0.24, address + 0.035, top - 0.035);
  const finish = clamp(impactTime + clamp(preferredDown * 1.45, 0.28, 1.35), impactTime + 0.16, safeDuration);
  return { address, takeaway, top, impact: impactTime, finish };
}

function blendDetectedWithReference(detected, reference, confidenceWeight) {
  const w = clamp(confidenceWeight, 0, 1);
  return {
    address: lerp(detected.address, reference.address, w),
    takeaway: lerp(detected.takeaway, reference.takeaway, w * 0.85),
    top: lerp(detected.top, reference.top, w),
    impact: detected.impact,
    finish: lerp(detected.finish, reference.finish, w * 0.72),
  };
}

function scoreLabel(value) {
  if (!Number.isFinite(value)) return 'pendiente';
  if (value >= 82) return 'fuerte';
  if (value >= 68) return 'correcto';
  if (value >= 52) return 'revisar';
  return 'crítico';
}

function computeAnalysisMetrics() {
  const t = state.phaseTimes;
  const has = (id) => Number.isFinite(t[id]);
  const safeDuration = Number.isFinite(refs.video.duration) ? refs.video.duration : null;
  const extended = state.autoDetection?.extendedTimes || {};
  const diagnostics = state.autoDetection?.diagnostics || {};
  const phaseConfidence = state.autoDetection?.phaseConfidence || {};
  const metrics = {
    marked: markedCount(),
    assumedFps: ASSUMED_FPS,
    duration: safeDuration,
    confidence: state.autoDetection.confidence || 0,
    method: state.autoDetection.method || 'manual',
    phaseConfidence: clone(phaseConfidence),
    extendedTimes: clone(extended),
    diagnostics: clone(diagnostics),
    consistencyWarnings: [],
  };

  if (has('top') && has('impact')) metrics.downswing = Math.max(0, t.impact - t.top);
  if (has('address') && has('top')) metrics.backswing = Math.max(0, t.top - t.address);
  else if (has('takeaway') && has('top')) metrics.backswing = Math.max(0, t.top - t.takeaway);
  if (has('address') && has('finish')) metrics.total = Math.max(0, t.finish - t.address);
  if (has('impact') && has('finish')) metrics.followThrough = Math.max(0, t.finish - t.impact);
  if (has('address') && has('takeaway')) metrics.takeawayLoad = Math.max(0, t.takeaway - t.address);
  if (has('takeaway') && has('top')) metrics.lateBackswing = Math.max(0, t.top - t.takeaway);
  if (has('top') && has('impact')) metrics.transitionToStrike = Math.max(0, t.impact - t.top);
  if (metrics.backswing && metrics.downswing) {
    metrics.tempoRatio = metrics.backswing / Math.max(metrics.downswing, 0.001);
    metrics.tempoDeviation = Math.min(1, Math.abs(metrics.tempoRatio - 2.65) / 2.65);
  }
  if (metrics.total && metrics.downswing) metrics.accelerationIndex = metrics.downswing / Math.max(metrics.total, 0.001);
  if (has('impact')) metrics.impactFrame = frameNumber(t.impact);
  if (has('top')) metrics.topFrame = frameNumber(t.top);

  if (Number.isFinite(extended.midBackswing)) metrics.midBackswingFrame = frameNumber(extended.midBackswing);
  if (Number.isFinite(extended.transition)) metrics.transitionFrame = frameNumber(extended.transition);
  if (Number.isFinite(extended.preImpact)) metrics.preImpactFrame = frameNumber(extended.preImpact);

  if (Number.isFinite(extended.activeStart) && Number.isFinite(extended.activeEnd)) {
    metrics.activeWindow = Math.max(0, extended.activeEnd - extended.activeStart);
    metrics.preAddressIdle = has('address') ? Math.max(0, t.address - extended.activeStart) : null;
  }

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

  metrics.reference = {
    tempoBand: `${SWING_REFERENCE.tempoIdealLow}:1–${SWING_REFERENCE.tempoIdealHigh}:1`,
    expectedDownswing: `${SWING_REFERENCE.downSwingIdealLow.toFixed(2)}–${SWING_REFERENCE.downSwingIdealHigh.toFixed(2)} s`,
    source: 'patrón Swing Lab report',
  };

  const tempoScore = metrics.tempoRatio ? scoreFromRange(metrics.tempoRatio, 1.4, SWING_REFERENCE.tempoIdealLow, SWING_REFERENCE.tempoIdealHigh, 5.4) : 0.55;
  const downScore = metrics.downswing ? scoreFromRange(metrics.downswing, 0.06, SWING_REFERENCE.downSwingIdealLow, SWING_REFERENCE.downSwingIdealHigh, 0.75) : 0.5;
  const totalScore = metrics.total ? scoreFromRange(metrics.total, 0.55, 0.9, 2.8, 4.5) : 0.5;
  const finishScore = metrics.followThrough ? scoreFromRange(metrics.followThrough, 0.10, 0.45, 2.2, 3.2) : 0.5;
  const detectionScore = metrics.confidence || 0.4;
  const phaseScore = phases.reduce((sum, phase) => sum + (phaseConfidence[phase.id] ?? detectionScore), 0) / phases.length;

  metrics.scores = {
    detection: Math.round(detectionScore * 100),
    phaseQuality: Math.round(phaseScore * 100),
    tempo: Math.round(tempoScore * 100),
    sequence: Math.round(((tempoScore * 0.5) + (downScore * 0.25) + (totalScore * 0.25)) * 100),
    finish: Math.round(finishScore * 100),
  };
  metrics.scores.overall = Math.round(
    (metrics.scores.detection * 0.30) +
    (metrics.scores.phaseQuality * 0.25) +
    (metrics.scores.tempo * 0.20) +
    (metrics.scores.sequence * 0.15) +
    (metrics.scores.finish * 0.10)
  );
  metrics.scoreLabels = Object.fromEntries(Object.entries(metrics.scores).map(([key, value]) => [key, scoreLabel(value)]));

  if (metrics.downswing != null && metrics.downswing < 0.08) {
    metrics.consistencyWarnings.push('Top→Impact parece demasiado corto; comprueba ambos frames con +1f/−1f.');
  }
  if (metrics.backswing != null && metrics.backswing < 0.20) {
    metrics.consistencyWarnings.push('Backswing parece demasiado corto; revisa Address/Top.');
  }
  if (metrics.followThrough != null && metrics.followThrough < 0.18) {
    metrics.consistencyWarnings.push('Finish está muy cerca de Impact; probablemente el finish real está más tarde.');
  }
  if (metrics.tempoRatio && metrics.tempoRatio < 1.7) {
    metrics.consistencyWarnings.push('Tempo excesivamente bajo: Top puede estar marcado tarde o Impact demasiado pronto.');
  }
  if (metrics.tempoRatio && metrics.tempoRatio > 5.0) {
    metrics.consistencyWarnings.push('Tempo excesivamente alto: Address/Top pueden estar demasiado separados o Impact tarde.');
  }
  if (metrics.downswing && (metrics.downswing < SWING_REFERENCE.downSwingIdealLow || metrics.downswing > SWING_REFERENCE.downSwingIdealHigh)) {
    metrics.consistencyWarnings.push(`Downswing fuera del rango de referencia (${SWING_REFERENCE.downSwingIdealLow.toFixed(2)}–${SWING_REFERENCE.downSwingIdealHigh.toFixed(2)} s): revisa Top e Impact.`);
  }
  if (diagnostics?.motionContrast != null && diagnostics.motionContrast < 0.18) {
    metrics.consistencyWarnings.push('Contraste de movimiento bajo: vídeo con poca diferencia entre swing y fondo; revisa fases manualmente.');
  }
  if ((phaseConfidence.impact ?? 1) < 0.55) {
    metrics.consistencyWarnings.push('Impact detectado con baja confianza; esta fase debe revisarse manualmente.');
  }
  return metrics;
}

function fallbackPhaseTimes(duration) {
  const safe = Number.isFinite(duration) && duration > 0 ? duration : 2;
  return Object.fromEntries(phases.map((phase) => [phase.id, Math.max(0, Math.min(safe, safe * phase.pct))]));
}

function enforceIncreasing(times, duration) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 2;
  const minGap = Math.max(0.035, Math.min(0.18, safeDuration * 0.018));
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
  const samples = Math.min(168, Math.max(54, Math.round(duration * 20)));
  const canvas = refs.captureCanvas;
  const w = 128;
  const h = 192;
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
    let mid = 0;
    let lower = 0;
    let center = 0;
    let edge = 0;
    let xMoment = 0;
    let yMoment = 0;
    let motionMass = 0;
    let count = 0;
    let brightness = 0;
    let contrastAcc = 0;

    if (previous) {
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const px = ((y * w) + x) * 4;
          const lum = (data[px] * 0.299) + (data[px + 1] * 0.587) + (data[px + 2] * 0.114);
          const d = Math.abs(lum - previous[count]);
          previous[count] = lum;
          diff += d;
          brightness += lum;
          contrastAcc += Math.abs(lum - 128);
          if (y < h * 0.43) upper += d;
          else if (y < h * 0.72) mid += d;
          else lower += d;
          if (x > w * 0.18 && x < w * 0.82 && y > h * 0.10 && y < h * 0.92) center += d;
          else edge += d;
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
        mid: mid / Math.max(1, count),
        lower: lower / Math.max(1, count),
        center: center / Math.max(1, count),
        edge: edge / Math.max(1, count),
        cx: motionMass ? xMoment / motionMass : 0.5,
        cy: motionMass ? yMoment / motionMass : 0.5,
        brightness: brightness / Math.max(1, count),
        contrast: contrastAcc / Math.max(1, count),
      });
    } else {
      previous = [];
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const px = ((y * w) + x) * 4;
          previous.push((data[px] * 0.299) + (data[px + 1] * 0.587) + (data[px + 2] * 0.114));
        }
      }
      raw.push({ time: t, score: 0, upper: 0, mid: 0, lower: 0, center: 0, edge: 0, cx: 0.5, cy: 0.5, brightness: 0, contrast: 0 });
    }
  }

  await seekVideoTo(originalTime);
  return enrichMotionProfile(smoothMotionProfile(raw));
}

function smoothMotionProfile(raw) {
  if (!raw || raw.length < 3) return raw || [];
  return raw.map((p, i) => {
    const items = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3));
    const avg = (key) => items.reduce((sum, item) => sum + (item[key] || 0), 0) / items.length;
    return {
      ...p,
      score: avg('score'),
      upper: avg('upper'),
      mid: avg('mid'),
      lower: avg('lower'),
      center: avg('center'),
      edge: avg('edge'),
      cx: avg('cx'),
      cy: avg('cy'),
      brightness: avg('brightness'),
      contrast: avg('contrast'),
    };
  });
}

function enrichMotionProfile(profile) {
  if (!profile || !profile.length) return profile || [];
  const scores = profile.map((p) => p.score);
  const base = percentile(scores, 0.28);
  const p95 = percentile(scores, 0.95);
  const range = Math.max(p95 - base, 0.001);
  return profile.map((p, i) => {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(profile.length - 1, i + 1)];
    const dt = Math.max(0.001, next.time - prev.time);
    const dx = (next.cx || 0.5) - (prev.cx || 0.5);
    const dy = (next.cy || 0.5) - (prev.cy || 0.5);
    const centroidSpeed = Math.sqrt((dx * dx) + (dy * dy)) / dt;
    const accel = i ? p.score - profile[i - 1].score : 0;
    const normalized = clamp((p.score - base) / range, 0, 1.6);
    const bodyWeighted = (p.center || 0) * 1.08 + (p.upper || 0) * 0.62 + (p.mid || 0) * 0.42 + (p.lower || 0) * 0.18 - (p.edge || 0) * 0.12;
    return { ...p, normalized, accel, centroidSpeed, bodyWeighted: Math.max(0, bodyWeighted) };
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

function localMinimum(profile, startIndex, endIndex, fallbackIndex, key = 'score') {
  const start = Math.max(0, Math.min(profile.length - 1, startIndex));
  const end = Math.max(0, Math.min(profile.length - 1, endIndex));
  if (start > end) return profile[Math.max(0, Math.min(profile.length - 1, fallbackIndex))] || profile[0];
  let best = profile[Math.max(start, Math.min(end, fallbackIndex))] || profile[0];
  for (let i = start; i <= end; i += 1) {
    if ((profile[i][key] ?? profile[i].score) < (best[key] ?? best.score)) best = profile[i];
  }
  return best;
}

function localMaximum(profile, startIndex, endIndex, fallbackIndex, key = 'score') {
  const start = Math.max(0, Math.min(profile.length - 1, startIndex));
  const end = Math.max(0, Math.min(profile.length - 1, endIndex));
  if (start > end) return profile[Math.max(0, Math.min(profile.length - 1, fallbackIndex))] || profile[profile.length - 1];
  let best = profile[Math.max(start, Math.min(end, fallbackIndex))] || profile[profile.length - 1];
  for (let i = start; i <= end; i += 1) {
    if ((profile[i][key] ?? profile[i].score) > (best[key] ?? best.score)) best = profile[i];
  }
  return best;
}

function mergeActiveSegments(segments, profile, maxGapSeconds) {
  if (!segments.length) return [];
  const merged = [clone(segments[0])];
  for (let i = 1; i < segments.length; i += 1) {
    const last = merged[merged.length - 1];
    const gap = profile[segments[i].start].time - profile[last.end].time;
    if (gap <= maxGapSeconds) {
      last.end = segments[i].end;
      last.area += segments[i].area;
      last.max = Math.max(last.max, segments[i].max);
    } else {
      merged.push(clone(segments[i]));
    }
  }
  return merged;
}

function findActiveSegments(profile, threshold) {
  const segments = [];
  let current = null;
  profile.forEach((p, index) => {
    const active = p.score >= threshold || p.bodyWeighted >= threshold * 0.85 || p.normalized >= 0.32;
    if (active) {
      if (!current) current = { start: index, end: index, area: 0, max: 0 };
      current.end = index;
      current.area += Math.max(p.score, p.bodyWeighted || 0);
      current.max = Math.max(current.max, p.score, p.bodyWeighted || 0);
    } else if (current) {
      segments.push(current);
      current = null;
    }
  });
  if (current) segments.push(current);
  return segments;
}

function chooseSwingSegment(profile, duration, thresholds) {
  const sampleGap = profile.length > 1 ? profile[1].time - profile[0].time : duration / 50;
  let segments = findActiveSegments(profile, thresholds.activeThreshold);
  segments = mergeActiveSegments(segments, profile, Math.max(0.22, sampleGap * 3.5));
  segments = segments.filter((seg) => {
    const dur = profile[seg.end].time - profile[seg.start].time;
    return dur >= 0.16 && dur <= Math.min(Math.max(4.5, duration * 0.70), duration);
  });

  if (!segments.length) {
    const peak = localMaximum(profile, 0, profile.length - 1, Math.round(profile.length * 0.55));
    const peakIndex = indexAtTime(profile, peak.time);
    return { start: Math.max(0, peakIndex - 12), end: Math.min(profile.length - 1, peakIndex + 18), max: peak.score, area: peak.score, quality: 0.22 };
  }

  let best = null;
  let bestScore = -Infinity;
  segments.forEach((seg) => {
    const dur = profile[seg.end].time - profile[seg.start].time;
    const upperAvg = profile.slice(seg.start, seg.end + 1).reduce((sum, p) => sum + (p.upper || 0), 0) / Math.max(1, seg.end - seg.start + 1);
    const centerAvg = profile.slice(seg.start, seg.end + 1).reduce((sum, p) => sum + (p.center || 0), 0) / Math.max(1, seg.end - seg.start + 1);
    const plausibility = scoreFromRange(dur, 0.18, 0.65, 3.2, Math.max(4.2, duration));
    const compactness = seg.area / Math.max(dur, 0.08);
    const score = (seg.max * 2.4) + (compactness * 0.10) + (upperAvg * 0.65) + (centerAvg * 0.35) + (plausibility * thresholds.p92 * 1.4);
    if (score > bestScore) {
      bestScore = score;
      best = { ...seg, quality: clamp((score / Math.max(thresholds.p92 * 5.0, 0.001)), 0.18, 0.95) };
    }
  });

  const expandBefore = Math.max(2, Math.round(0.34 / Math.max(sampleGap, 0.001)));
  const expandAfter = Math.max(4, Math.round(0.95 / Math.max(sampleGap, 0.001)));
  best.start = Math.max(0, best.start - expandBefore);
  best.end = Math.min(profile.length - 1, best.end + expandAfter);
  return best;
}

function bestTopCandidate(profile, startIndex, endIndex, impactIndex, thresholds) {
  const fallback = Math.max(startIndex, Math.min(endIndex, impactIndex - 6));
  let best = profile[fallback] || profile[startIndex] || profile[0];
  let bestScore = -Infinity;
  for (let i = startIndex; i <= endIndex; i += 1) {
    const p = profile[i];
    const after = localMaximum(profile, i + 1, Math.min(impactIndex, i + 7), i + 1, 'bodyWeighted');
    const before = localMaximum(profile, Math.max(startIndex, i - 7), i, i, 'bodyWeighted');
    const downDur = profile[impactIndex].time - p.time;
    const plausibleDown = scoreFromRange(downDur, 0.07, 0.16, 0.46, 0.78);
    const quiet = 1 - clamp((p.score - thresholds.median) / Math.max(thresholds.p92 - thresholds.median, 0.001), 0, 1);
    const burstAfter = clamp((after.bodyWeighted || after.score) / Math.max(thresholds.p92, 0.001), 0, 1.4);
    const notTooEarly = scoreFromRange(i - startIndex, 0, Math.max(1, (impactIndex - startIndex) * 0.36), Math.max(2, (impactIndex - startIndex) * 0.78), Math.max(3, impactIndex - startIndex));
    const score = (quiet * 0.34) + (burstAfter * 0.30) + (plausibleDown * 0.24) + (notTooEarly * 0.12) - Math.max(0, (before.bodyWeighted || before.score) - (after.bodyWeighted || after.score)) * 0.03;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return { point: best, quality: clamp(bestScore, 0.15, 0.96) };
}

function firstStableAfter(profile, startIndex, endIndex, threshold, minCount = 3) {
  for (let i = startIndex; i <= endIndex; i += 1) {
    let ok = true;
    for (let j = 0; j < minCount; j += 1) {
      const p = profile[Math.min(profile.length - 1, i + j)];
      if (!p || p.score > threshold) { ok = false; break; }
    }
    if (ok) return profile[i];
  }
  return null;
}

function detectTimesFromMotion(profile, duration) {
  if (!profile || profile.length < 10) {
    return { times: fallbackPhaseTimes(duration), confidence: 0.22, peakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: {} };
  }
  const scores = profile.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const median = percentile(scores, 0.5);
  const p65 = percentile(scores, 0.65);
  const p78 = percentile(scores, 0.78);
  const p88 = percentile(scores, 0.88);
  const p92 = percentile(scores, 0.92);
  const p96 = percentile(scores, 0.96);
  const noiseFloor = Math.max(median, 0.001);
  const activeThreshold = Math.max(p65, noiseFloor * 1.42, maxScore * 0.14);
  const strongThreshold = Math.max(p88, noiseFloor * 2.05, maxScore * 0.28);
  const thresholds = { median, p65, p78, p88, p92, p96, activeThreshold, strongThreshold };

  if (maxScore < 0.45 || p92 <= noiseFloor * 1.12) {
    return { times: fallbackPhaseTimes(duration), confidence: 0.2, peakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: { maxScore, median, motionContrast: 0 } };
  }

  const segment = chooseSwingSegment(profile, duration, thresholds);
  const segSpan = Math.max(1, segment.end - segment.start);
  const segStartTime = profile[segment.start].time;
  const segEndTime = profile[segment.end].time;

  const impactStart = Math.max(segment.start + Math.round(segSpan * 0.34), indexAtTime(profile, segStartTime + 0.28));
  const impactEnd = Math.min(segment.end, Math.max(impactStart + 1, segment.start + Math.round(segSpan * 0.86)));
  let impact = localMaximum(profile, impactStart, impactEnd, Math.round((impactStart + impactEnd) / 2), 'bodyWeighted');
  const impactIndex = indexAtTime(profile, impact.time);

  const preWindowStart = Math.max(0, segment.start - Math.round(segSpan * 0.20));
  const preWindowEnd = Math.max(preWindowStart, Math.min(segment.start + Math.round(segSpan * 0.10), impactIndex - 4));
  const quietBefore = localMinimum(profile, preWindowStart, preWindowEnd, segment.start, 'score');
  const addressTime = Math.max(0, Math.min(quietBefore.time, impact.time - 0.32));

  const topStart = Math.max(indexAtTime(profile, addressTime + 0.14), segment.start + 2, indexAtTime(profile, impact.time - 1.15));
  const topEnd = Math.max(topStart, Math.min(impactIndex - 2, indexAtTime(profile, impact.time - 0.08)));
  const topCandidate = bestTopCandidate(profile, topStart, topEnd, impactIndex, thresholds);
  let top = topCandidate.point;
  if (!top || top.time >= impact.time - 0.05) {
    top = profile[indexAtTime(profile, Math.max(addressTime + 0.2, impact.time - 0.28))];
  }

  const backDuration = Math.max(0.12, top.time - addressTime);
  const takeawayTarget = addressTime + backDuration * 0.28;
  const takeawayStart = indexAtTime(profile, addressTime + Math.min(0.035, backDuration * 0.12));
  const takeawayEnd = Math.max(takeawayStart, indexAtTime(profile, Math.min(top.time - 0.035, addressTime + backDuration * 0.52)));
  const thresholdCross = profile.slice(takeawayStart, takeawayEnd + 1).find((p) => p.score >= Math.max(median * 1.18, activeThreshold * 0.54));
  const takeCandidate = thresholdCross || localMaximum(profile, takeawayStart, takeawayEnd, indexAtTime(profile, takeawayTarget), 'bodyWeighted');

  const stableStart = indexAtTime(profile, impact.time + Math.min(0.22, Math.max(0.08, (profile[1]?.time || 0.05) * 4)));
  const stable = firstStableAfter(profile, stableStart, profile.length - 1, Math.max(p78, median * 1.65), 3);
  const rawFinishTime = stable?.time ?? Math.max(segEndTime, impact.time + Math.max(0.35, duration * 0.06));

  const detectedTimes = {
    address: addressTime,
    takeaway: Math.min(top.time - 0.035, Math.max(addressTime + 0.035, takeCandidate.time)),
    top: top.time,
    impact: impact.time,
    finish: Math.min(duration, Math.max(rawFinishTime, impact.time + 0.18)),
  };
  const referenceTimes = referencePhaseTimesFromImpact({
    duration,
    segmentStart: segStartTime,
    segmentEnd: segEndTime,
    impactTime: impact.time,
    detectedTopTime: top.time,
    topQuality: topCandidate.quality,
    segmentQuality: segment.quality || 0.3,
  });
  const rawBack = detectedTimes.top - detectedTimes.address;
  const rawDown = detectedTimes.impact - detectedTimes.top;
  const rawTempo = rawBack / Math.max(rawDown, 0.001);
  const implausible = !Number.isFinite(rawTempo) || rawTempo < 1.6 || rawTempo > 5.2 || rawDown < 0.07 || rawDown > 0.72;
  const referenceWeight = clamp((implausible ? 0.48 : 0.20) + (1 - topCandidate.quality) * 0.22 + (1 - (segment.quality || 0.3)) * 0.10, 0.18, 0.62);
  const blendedTimes = blendDetectedWithReference(detectedTimes, referenceTimes, referenceWeight);
  const times = enforceIncreasing(blendedTimes, duration);

  // Derived internal checkpoints for richer analysis without adding more UI steps.
  const extendedTimes = {
    activeStart: segStartTime,
    activeEnd: segEndTime,
    midBackswing: times.takeaway + (times.top - times.takeaway) * 0.52,
    transition: times.top + Math.min(0.09, Math.max(0.025, (times.impact - times.top) * 0.22)),
    preImpact: times.impact - Math.min(0.075, Math.max(0.025, (times.impact - times.top) * 0.28)),
  };

  const motionContrast = Math.min(1, (p92 - median) / Math.max(p92, 0.001));
  const impactProminence = clamp((impact.bodyWeighted || impact.score) / Math.max(p92, 0.001), 0, 1.25);
  const orderOk = times.address < times.takeaway && times.takeaway < times.top && times.top < times.impact && times.impact < times.finish;
  const downDur = times.impact - times.top;
  const backDur = times.top - times.address;
  const finishDur = times.finish - times.impact;
  const plausibleTempo = downDur > 0.07 && downDur < 0.70 && backDur > 0.18 && backDur < Math.max(3.5, duration * 0.75);
  const finishQuality = scoreFromRange(finishDur, 0.08, 0.35, 2.3, 3.4);
  const topQuality = topCandidate.quality;
  const segmentQuality = segment.quality || 0.3;

  const phaseConfidence = {
    address: clamp((1 - quietBefore.normalized * 0.45) * 0.55 + segmentQuality * 0.35 + (orderOk ? 0.10 : 0), 0.25, 0.95),
    takeaway: clamp(0.40 + motionContrast * 0.25 + segmentQuality * 0.20 + (times.takeaway > times.address ? 0.10 : 0), 0.25, 0.92),
    top: clamp(0.25 + topQuality * 0.55 + plausibleTempo * 0.12 + motionContrast * 0.08, 0.22, 0.94),
    impact: clamp(0.24 + impactProminence * 0.42 + motionContrast * 0.20 + (downDur > 0.07 ? 0.10 : 0), 0.24, 0.96),
    finish: clamp(0.32 + finishQuality * 0.35 + segmentQuality * 0.16 + (finishDur > 0.18 ? 0.10 : 0), 0.22, 0.92),
  };

  const avgPhaseConfidence = Object.values(phaseConfidence).reduce((sum, value) => sum + value, 0) / phases.length;
  const confidence = clamp(
    0.18 + (motionContrast * 0.25) + (segmentQuality * 0.20) + (avgPhaseConfidence * 0.25) + (orderOk ? 0.07 : 0) + (plausibleTempo ? 0.05 : 0),
    0.20,
    0.94
  );

  const diagnostics = {
    engine: 'Smart Phases v0.8.4',
    maxScore,
    median,
    p92,
    activeThreshold,
    strongThreshold,
    motionContrast,
    segmentStart: segStartTime,
    segmentEnd: segEndTime,
    segmentDuration: segEndTime - segStartTime,
    impactProminence,
    topQuality,
    segmentQuality,
    referenceWeight,
    referenceTimes,
    rawTempo,
  };

  return { times, confidence, peakTime: impact.time, thresholds, phaseConfidence, extendedTimes, diagnostics };
}

async function autoDetectPhases() {
  if (!state.videoUrl || state.autoDetection.status === 'running' || state.autoDetection.status === 'done') return;
  setAppState('detecting');
  state.autoDetection.status = 'running';
  refs.analysisStatus.textContent = 'Smart Phases: localizando ventana activa, top e impacto con referencia temporal…';
  render();
  try {
    const duration = refs.video.duration;
    const profile = await sampleMotionProfile();
    const result = detectTimesFromMotion(profile, duration);
    state.phaseTimes = result.times;
    state.autoDetection = {
      status: 'done',
      confidence: result.confidence,
      method: 'Smart Phases v0.8.4 · motion model + Swing Lab reference',
      samples: profile?.length || 0,
      motionPeakTime: result.peakTime,
      phaseConfidence: result.phaseConfidence || {},
      extendedTimes: result.extendedTimes || {},
      diagnostics: result.diagnostics || {},
    };
    state.analysisMetrics = computeAnalysisMetrics();
    state.currentPhaseId = 'address';
    await seekVideoTo(state.phaseTimes.address || 0);
    setAppState('detected');
    refs.analysisStatus.textContent = `Fases detectadas con Smart Phases (${Math.round(result.confidence * 100)}% confianza). Revisa especialmente Top e Impact.`;
    render();
  } catch (error) {
    console.warn('Auto detection failed', error);
    state.phaseTimes = fallbackPhaseTimes(refs.video.duration);
    state.autoDetection = { status: 'failed', confidence: 0.2, method: 'fallback-percentages', samples: 0, motionPeakTime: null, phaseConfidence: {}, extendedTimes: {}, diagnostics: {} };
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


function toggleHistorySelectionMode() {
  state.historySelectionMode = !state.historySelectionMode;
  state.selectedSessionIds.clear();
  renderReadouts();
  loadHistory();
}

function toggleSessionSelection(id) {
  if (state.selectedSessionIds.has(id)) state.selectedSessionIds.delete(id);
  else state.selectedSessionIds.add(id);
  renderReadouts();
  loadHistory();
}

async function deleteSelectedSessions() {
  const ids = Array.from(state.selectedSessionIds || []);
  if (!ids.length) return;
  if (!confirm(`¿Borrar ${ids.length} sesión(es) seleccionada(s)?`)) return;
  await dbDeleteMany(ids);
  state.selectedSessionIds.clear();
  state.historySelectionMode = false;
  await loadHistory();
  renderReadouts();
}

async function loadHistory() {
  const sessions = (await dbAll()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  refs.historyList.innerHTML = '';
  renderReadouts();
  if (!sessions.length) {
    refs.historyList.innerHTML = '<div class="status-box">Aún no hay sesiones guardadas.</div>';
    return;
  }
  sessions.forEach((session) => {
    const row = document.createElement('div');
    row.className = `history-row ${state.historySelectionMode ? 'selecting' : ''} ${state.selectedSessionIds.has(session.id) ? 'selected' : ''}`;

    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'history-check';
    checkbox.textContent = state.selectedSessionIds.has(session.id) ? '✓' : '';
    checkbox.title = 'Seleccionar para borrar';
    checkbox.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSessionSelection(session.id);
    });

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
    item.addEventListener('click', () => {
      if (state.historySelectionMode) toggleSessionSelection(session.id);
      else restoreSession(session);
    });

    row.appendChild(checkbox);
    row.appendChild(item);
    refs.historyList.appendChild(row);
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
  state.sheetExpanded = false;
  state.historySelectionMode = false;
  state.selectedSessionIds.clear();

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
  state.selectedSessionIds.clear();
  state.historySelectionMode = false;
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


function distance(a, b) {
  if (!a || !b) return Infinity;
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function lineLength(line) {
  if (!line) return 0;
  return distance({ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
}

function createLineFromPending(point) {
  if (!state.pendingLineStart || !point) return false;
  let line = {
    x1: state.pendingLineStart.x,
    y1: state.pendingLineStart.y,
    x2: point.x,
    y2: point.y,
  };
  line = snapLineIfNeeded(line);
  if (lineLength(line) <= 0.012) {
    state.previewLine = null;
    return false;
  }
  state.lines.push(line);
  state.selectedLineIndex = state.lines.length - 1;
  state.pendingLineStart = null;
  state.previewLine = null;
  state.pointerDown = false;
  state.pointerStart = null;
  state.pointerMoved = false;
  state.lockAxisMode = false;
  if (state.longPressTimer) clearTimeout(state.longPressTimer);
  state.longPressTimer = null;
  refs.drawingHint.textContent = 'Línea creada';
  window.setTimeout(() => {
    if (state.drawingMode) refs.drawingHint.textContent = 'Dibujo: toca 2 puntos, arrastra, o mueve una línea existente';
  }, 900);
  drawAllLines();
  renderRails();
  return true;
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

  // Mobile two-tap mode: if a first point already exists, the next tap must
  // immediately confirm the line. Do not wait for pointerup, because some
  // mobile browsers lose/cancel the pointer capture before pointerup fires.
  if (state.pendingLineStart && !state.pointerDown) {
    const created = createLineFromPending(point);
    if (!created) {
      state.pendingLineStart = point;
      state.previewLine = null;
      state.selectedLineIndex = -1;
      drawAllLines();
      renderRails();
    }
    return;
  }

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
  if (!state.drawingMode || !state.pointerDown) return;
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
    refs.video.pause();
    refs.playBtn.textContent = 'Play';
    refs.video.playbackRate = state.speed;
    resizeDrawingCanvas();
    if (state.initialVideoClean) {
      refs.video.currentTime = 0;
    } else if (state.phaseTimes[currentPhase().id] == null && Number.isFinite(refs.video.duration) && refs.video.duration > 0) {
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
  refs.historySelectBtn.addEventListener('click', toggleHistorySelectionMode);
  refs.deleteSelectedHistoryBtn.addEventListener('click', deleteSelectedSessions);
  refs.clearHistoryBtn.addEventListener('click', clearHistory);

  refs.sheetHandle.addEventListener('pointerdown', (event) => {
    if (state.mode !== 'analysis' && state.mode !== 'history') return;
    state.sheetDragStartY = event.clientY;
    refs.sheetHandle.setPointerCapture?.(event.pointerId);
  });
  refs.sheetHandle.addEventListener('pointerup', (event) => {
    if (state.mode !== 'analysis' && state.mode !== 'history') return;
    const startY = state.sheetDragStartY;
    state.sheetDragStartY = null;
    const dy = Number.isFinite(startY) ? event.clientY - startY : 0;
    if (Math.abs(dy) < 12) state.sheetExpanded = !state.sheetExpanded;
    else if (dy < -28) state.sheetExpanded = true;
    else if (dy > 28) state.sheetExpanded = false;
    render();
  });

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
