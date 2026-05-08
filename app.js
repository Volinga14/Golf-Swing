'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'swing-lab-db';
const DB_VERSION = 5;
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
  pointerDown: false,
};

const refs = {
  app: $('app'),
  emptyState: $('emptyState'),
  video: $('video'),
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
  guideOverlay: $('guideOverlay'),
  dtlGuides: $('dtlGuides'),
  foGuides: $('foGuides'),
  stateText: $('stateText'),
  uploadBtn: $('uploadBtn'),
  pickVideoBtn: $('pickVideoBtn'),
  openCameraBtn: $('openCameraBtn'),
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
  state.lines = [];
  state.previewLine = null;
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
  refs.analysisStatus.textContent = 'Marca las fases y genera las capturas.';
  refs.recommendations.innerHTML = '';
  refs.capturesGrid.innerHTML = '';
  refs.video.src = state.videoUrl;
  refs.video.load();
  setAppState('loaded');
  render();
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'phases') setAppState('marking');
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
  const hasSession = hasVideo || state.captureOnly;
  refs.emptyState.classList.toggle('hidden', hasSession);
  refs.video.classList.toggle('hidden', !hasVideo);
  refs.tapLayer.classList.toggle('hidden', !hasVideo || state.drawingMode);
  refs.scrimTop.classList.toggle('hidden', !hasVideo);
  refs.scrimBottom.classList.toggle('hidden', !hasVideo);
  refs.topHud.classList.toggle('hidden', !hasSession);
  refs.rightRail.classList.toggle('hidden', !hasVideo);
  refs.bottomDock.classList.toggle('hidden', !hasSession);
  refs.phaseHud.classList.toggle('hidden', !hasVideo || state.mode === 'history');
  refs.guideOverlay.classList.toggle('hidden', !hasVideo || !state.showGuides);
  refs.cleanHint.classList.add('hidden');
  refs.app.classList.toggle('controls-hidden', hasVideo && !state.controlsVisible);
  refs.app.classList.toggle('capture-only', state.captureOnly);
  refs.playerStrip.classList.toggle('hidden', state.mode === 'history' || state.captureOnly);
  refs.drawingCanvas.classList.toggle('hidden', !hasVideo);
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
}

function renderTimeline() {
  if (!state.videoUrl || state.isSeekingWithSlider || !Number.isFinite(refs.video.duration) || refs.video.duration <= 0) return;
  refs.timeline.value = String(Math.round((refs.video.currentTime / refs.video.duration) * 1000));
}

function renderCapturesGrid() {
  refs.capturesGrid.innerHTML = '';
  const available = phases.filter((phase) => state.phaseCaptures[phase.id]);
  if (!available.length) return;
  available.forEach((phase) => {
    const time = state.phaseTimes[phase.id];
    const card = document.createElement('div');
    card.className = 'capture-card';
    card.innerHTML = `
      <img src="${state.phaseCaptures[phase.id]}" alt="${phase.label}" />
      <b>${phase.label}</b>
      <span>${time != null ? `${formatTime(time)} · frame ${frameNumber(time)}` : 'Sin tiempo'}</span>`;
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
  drawAllLines();
}


function jumpToPhase(phaseId) {
  state.currentPhaseId = phaseId;
  const time = state.phaseTimes[phaseId];
  if (time != null) {
    refs.video.currentTime = time;
  } else if (Number.isFinite(refs.video.duration) && refs.video.duration > 0) {
    const phase = phases.find((item) => item.id === phaseId) || phases[0];
    refs.video.currentTime = refs.video.duration * phase.pct;
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
  const recs = [];

  if (marked < phases.length) {
    recs.push(`Has marcado ${marked}/${phases.length} fases. Para que el análisis sea útil, intenta completar sobre todo Address, Top, Impact y Finish.`);
  } else {
    recs.push('Todas las fases están marcadas. Ya tienes una base limpia para revisar el swing fase a fase.');
  }

  if (missing.length) {
    recs.push(`Fases pendientes: ${missing.join(', ')}.`);
  }

  recs.push('Usa el modo dibujo para trazar líneas simples sobre postura, plano del palo o eje corporal. Puedes ocultarlas, deshacer una a una o borrarlas todas.');

  if (state.guideMode === 'dtl') {
    recs.push('En DTL, fíjate en si la subida y la bajada se mueven por una zona parecida respecto a las guías inclinadas.');
  } else {
    recs.push('En Face-On, revisa estabilidad de cabeza, transferencia de peso y posición de manos en impacto.');
  }

  if (Object.keys(state.phaseCaptures).length) {
    recs.push('Las capturas de fases ya están guardadas dentro de la sesión, lo que facilita revisar y recuperar el análisis después.');
  }

  return recs;
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
  refs.analysisStatus.textContent = 'Generando capturas de las fases marcadas…';
  refs.recommendations.innerHTML = '';
  refs.capturesGrid.innerHTML = '';

  try {
    state.phaseCaptures = await generatePhaseCaptures();
    const capturesCount = Object.keys(state.phaseCaptures).length;
    refs.analysisStatus.textContent = `Listo: ${capturesCount} capturas generadas · ${markedCount()}/${phases.length} fases marcadas.`;
    renderRecommendations();
    renderCapturesGrid();
    setAppState('completed');
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
      duration: refs.video.duration || null,
      guideMode: state.guideMode,
      phaseTimes: clone(state.phaseTimes),
      phaseCaptures: clone(state.phaseCaptures),
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
  state.lines = session.lines || [];
  state.guideMode = session.guideMode || 'dtl';
  state.mode = Object.keys(state.phaseCaptures).length ? 'analysis' : 'phases';
  state.controlsVisible = true;

  if (Object.keys(state.phaseCaptures).length) {
    refs.analysisStatus.textContent = `Sesión restaurada: ${Object.keys(state.phaseCaptures).length} capturas disponibles.`;
    renderRecommendations();
  } else {
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
  ctx.lineWidth = 2.5;
  if (dashed) ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(line.x1 * cssWidth, line.y1 * cssHeight);
  ctx.lineTo(line.x2 * cssWidth, line.y2 * cssHeight);
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
  if (state.previewLine) {
    drawLine(ctx, state.previewLine, width, height, dpr, true);
  }
}

function toggleDrawingMode() {
  state.drawingMode = !state.drawingMode;
  if (state.drawingMode) state.controlsVisible = true;
  state.previewLine = null;
  state.pointerDown = false;
  render();
}

function handleCanvasPointerDown(event) {
  if (!state.drawingMode) return;
  event.preventDefault();
  event.stopPropagation();
  const point = toNormalized(event.clientX, event.clientY);
  state.pointerDown = true;
  state.previewLine = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  refs.drawingCanvas.setPointerCapture?.(event.pointerId);
  drawAllLines();
}

function handleCanvasPointerMove(event) {
  if (!state.drawingMode || !state.pointerDown || !state.previewLine) return;
  event.preventDefault();
  const point = toNormalized(event.clientX, event.clientY);
  state.previewLine.x2 = point.x;
  state.previewLine.y2 = point.y;
  drawAllLines();
}

function handleCanvasPointerUp(event) {
  if (!state.drawingMode || !state.pointerDown || !state.previewLine) return;
  event.preventDefault();
  event.stopPropagation();
  const line = state.previewLine;
  state.pointerDown = false;
  state.previewLine = null;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length > 0.01) state.lines.push(line);
  drawAllLines();
  renderRails();
}

function bindEvents() {
  refs.pickVideoBtn.addEventListener('click', () => refs.videoInput.click());
  refs.openCameraBtn.addEventListener('click', () => refs.cameraInput.click());
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
  refs.clearHistoryBtn.addEventListener('click', clearHistory);

  refs.drawingCanvas.addEventListener('pointerdown', handleCanvasPointerDown);
  refs.drawingCanvas.addEventListener('pointermove', handleCanvasPointerMove);
  refs.drawingCanvas.addEventListener('pointerup', handleCanvasPointerUp);
  refs.drawingCanvas.addEventListener('pointercancel', handleCanvasPointerUp);
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
