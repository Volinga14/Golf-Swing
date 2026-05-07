'use strict';

const $ = (id) => document.getElementById(id);
const DB_NAME = 'swing-lab-db';
const DB_VERSION = 2;
const STORE = 'sessions';
const ASSUMED_FPS = 30;

const phases = [
  { id: 'address', label: 'Address', short: 'Addr', pct: 0.05, hint: 'Setup inicial: pies, bola, manos y postura.' },
  { id: 'takeaway', label: 'Takeaway', short: 'Take', pct: 0.18, hint: 'Primer movimiento del palo y conexión de brazos.' },
  { id: 'top', label: 'Top', short: 'Top', pct: 0.38, hint: 'Parte alta: rotación, estabilidad y posición de manos.' },
  { id: 'impact', label: 'Impact', short: 'Imp', pct: 0.62, hint: 'Impacto: manos, cadera, cabeza y línea del palo.' },
  { id: 'finish', label: 'Finish', short: 'Fin', pct: 0.9, hint: 'Equilibrio final y rotación completa.' },
];

const defaultChecks = [
  { id: 'vertical', label: 'Vertical', ok: null },
  { id: 'body', label: 'Cuerpo completo', ok: null },
  { id: 'light', label: 'Buena luz', ok: null },
  { id: 'stable', label: 'Cámara estable', ok: null },
  { id: 'angle', label: 'Ángulo correcto', ok: null },
  { id: 'ball', label: 'Bola visible', ok: null },
];

const state = {
  videoUrl: null,
  videoBlob: null,
  videoName: '',
  mode: 'capture',
  currentPhaseId: 'address',
  phaseTimes: {},
  checks: clone(defaultChecks),
  showGuides: true,
  guideMode: 'dtl',
  fitContain: false,
  speed: 1,
  controlsVisible: true,
  isSeekingWithSlider: false,
  installPrompt: null,
  appState: 'empty',
};

const refs = {
  app: $('app'),
  emptyState: $('emptyState'),
  video: $('video'),
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
  fitBtn: $('fitBtn'),
  speedBtn: $('speedBtn'),
  activePhaseName: $('activePhaseName'),
  markStatus: $('markStatus'),
  timeReadout: $('timeReadout'),
  tabCapture: $('tabCapture'),
  tabPhases: $('tabPhases'),
  tabAnalysis: $('tabAnalysis'),
  tabHistory: $('tabHistory'),
  capturePanel: $('capturePanel'),
  phasesPanel: $('phasesPanel'),
  analysisPanel: $('analysisPanel'),
  historyPanel: $('historyPanel'),
  qualityScore: $('qualityScore'),
  checklist: $('checklist'),
  goPhasesBtn: $('goPhasesBtn'),
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
  saveSessionBtn: $('saveSessionBtn'),
  clearHistoryBtn: $('clearHistoryBtn'),
  historyList: $('historyList'),
  thumbCanvas: $('thumbCanvas'),
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
    analyzing: 'Analizando',
    completed: 'Análisis completado',
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

function qualityScore() {
  const ok = state.checks.filter((item) => item.ok === true).length;
  return Math.round((ok / state.checks.length) * 100);
}

function setMode(mode) {
  state.mode = mode;
  if (mode === 'phases') setAppState('marking');
  render();
  if (mode === 'history') loadHistory();
}

function revokeVideoUrl() {
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
}

function applyVideoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) {
    alert('Selecciona un archivo de vídeo válido.');
    return;
  }

  revokeVideoUrl();
  state.videoBlob = file;
  state.videoUrl = URL.createObjectURL(file);
  state.videoName = file.name || `swing-${new Date().toISOString().slice(0, 10)}.mp4`;
  state.mode = 'capture';
  state.phaseTimes = {};
  state.checks = clone(defaultChecks);
  state.currentPhaseId = 'address';
  state.controlsVisible = true;
  refs.video.src = state.videoUrl;
  refs.video.load();
  setAppState('loaded');
  render();
}

function toggleControls() {
  if (!state.videoUrl) return;
  state.controlsVisible = !state.controlsVisible;
  refs.app.classList.toggle('controls-hidden', !state.controlsVisible);
}

function renderShell() {
  const hasVideo = Boolean(state.videoUrl);
  refs.emptyState.classList.toggle('hidden', hasVideo);
  refs.video.classList.toggle('hidden', !hasVideo);
  refs.tapLayer.classList.toggle('hidden', !hasVideo);
  refs.scrimTop.classList.toggle('hidden', !hasVideo);
  refs.scrimBottom.classList.toggle('hidden', !hasVideo);
  refs.topHud.classList.toggle('hidden', !hasVideo);
  refs.rightRail.classList.toggle('hidden', !hasVideo);
  refs.bottomDock.classList.toggle('hidden', !hasVideo);
  refs.phaseHud.classList.toggle('hidden', !hasVideo || state.mode !== 'phases');
  refs.guideOverlay.classList.toggle('hidden', !hasVideo || !state.showGuides);
  refs.cleanHint.classList.toggle('hidden', state.controlsVisible);
  refs.video.classList.toggle('fit-contain', state.fitContain);
  refs.app.classList.toggle('controls-hidden', hasVideo && !state.controlsVisible);
}

function renderRails() {
  refs.toggleGuidesBtn.querySelector('b').textContent = state.showGuides ? 'ON' : 'OFF';
  refs.switchModeBtn.querySelector('b').textContent = state.guideMode === 'dtl' ? 'DTL' : 'FO';
  refs.fitBtn.querySelector('b').textContent = state.fitContain ? 'Fit' : 'Fill';
  refs.speedBtn.querySelector('b').textContent = `${state.speed}x`;
  refs.dtlGuides.classList.toggle('hidden', state.guideMode !== 'dtl');
  refs.foGuides.classList.toggle('hidden', state.guideMode !== 'fo');
}

function renderTabs() {
  const tabs = {
    capture: refs.tabCapture,
    phases: refs.tabPhases,
    analysis: refs.tabAnalysis,
    history: refs.tabHistory,
  };
  const panels = {
    capture: refs.capturePanel,
    phases: refs.phasesPanel,
    analysis: refs.analysisPanel,
    history: refs.historyPanel,
  };
  Object.entries(tabs).forEach(([mode, el]) => el.classList.toggle('active', state.mode === mode));
  Object.entries(panels).forEach(([mode, el]) => el.classList.toggle('hidden', state.mode !== mode));
}

function renderChecklist() {
  refs.checklist.innerHTML = '';
  state.checks.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `check-item ${item.ok === true ? 'good' : item.ok === false ? 'bad' : ''}`;
    const icon = item.ok === true ? '✓' : item.ok === false ? '!' : '·';
    button.innerHTML = `<span class="check-icon">${icon}</span><span>${item.label}</span>`;
    button.addEventListener('click', () => toggleCheck(item.id));
    refs.checklist.appendChild(button);
  });
  refs.qualityScore.textContent = `Quality ${qualityScore()}%`;
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

function renderPhaseHud() {
  const phase = currentPhase();
  const markedTime = state.phaseTimes[phase.id];
  refs.activePhaseName.textContent = phase.label;
  refs.markStatus.textContent = markedTime == null ? 'Sin marcar' : `Marcado ${formatTime(markedTime)}`;
  refs.markStatus.classList.toggle('done', markedTime != null);
  refs.timeReadout.textContent = `${formatTime(refs.video.currentTime || 0)} · frame ${frameNumber()}`;
  refs.markPhaseBtn.textContent = markedTime == null ? `Marcar ${phase.label}` : `Actualizar ${phase.label}`;
  refs.markPhaseBtn.classList.toggle('marked', markedTime != null);
}

function renderPhaseSummary() {
  refs.phaseSummary.innerHTML = '';
  phases.forEach((phase) => {
    const cell = document.createElement('div');
    cell.className = 'summary-cell';
    const time = state.phaseTimes[phase.id];
    cell.innerHTML = `<b>${phase.short}</b><span>${time == null ? '—' : formatTime(time)}</span>`;
    refs.phaseSummary.appendChild(cell);
  });
}

function renderTimeline() {
  const duration = refs.video.duration || 0;
  const current = refs.video.currentTime || 0;
  if (!state.isSeekingWithSlider) {
    refs.timeline.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
  }
}

function render() {
  renderShell();
  renderRails();
  renderTabs();
  renderChecklist();
  renderPhaseChips();
  renderPhaseHud();
  renderPhaseSummary();
  renderTimeline();
}

function toggleCheck(id) {
  state.checks = state.checks.map((item) => {
    if (item.id !== id) return item;
    if (item.ok === null) return { ...item, ok: true };
    if (item.ok === true) return { ...item, ok: false };
    return { ...item, ok: null };
  });
  renderChecklist();
}

function jumpToPhase(id) {
  const phase = phases.find((item) => item.id === id) || phases[0];
  state.currentPhaseId = phase.id;
  if (state.videoUrl && Number.isFinite(refs.video.duration)) {
    refs.video.pause();
    const target = state.phaseTimes[phase.id] ?? refs.video.duration * phase.pct;
    refs.video.currentTime = Math.min(Math.max(target, 0), refs.video.duration || target);
  }
  setMode('phases');
}

async function togglePlay() {
  if (!state.videoUrl) return;
  try {
    if (refs.video.paused) {
      refs.video.playbackRate = state.speed;
      await refs.video.play();
      refs.playBtn.textContent = 'Pause';
    } else {
      refs.video.pause();
      refs.playBtn.textContent = 'Play';
    }
  } catch (error) {
    console.warn(error);
    alert('El navegador ha bloqueado la reproducción. Pulsa de nuevo Play.');
  }
}

function stepFrame(direction) {
  if (!state.videoUrl) return;
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  const duration = refs.video.duration || Number.POSITIVE_INFINITY;
  const next = Math.min(Math.max(0, (refs.video.currentTime || 0) + direction / ASSUMED_FPS), duration);
  refs.video.currentTime = next;
  renderPhaseHud();
  renderTimeline();
}

function cycleSpeed() {
  const values = [1, 0.5, 0.25];
  const index = values.indexOf(state.speed);
  state.speed = values[(index + 1) % values.length];
  refs.video.playbackRate = state.speed;
  renderRails();
}

function markCurrentPhase() {
  if (!state.videoUrl) return;
  const phase = currentPhase();
  state.phaseTimes[phase.id] = refs.video.currentTime || 0;
  renderPhaseChips();
  renderPhaseHud();
  renderPhaseSummary();
}

function updateTimelineFromInput() {
  if (!state.videoUrl || !Number.isFinite(refs.video.duration) || refs.video.duration <= 0) return;
  const pct = Number(refs.timeline.value) / 1000;
  refs.video.pause();
  refs.playBtn.textContent = 'Play';
  refs.video.currentTime = refs.video.duration * pct;
  renderPhaseHud();
}

function buildRecommendations() {
  const recs = [];
  const marked = Object.keys(state.phaseTimes).length;
  const missingChecks = state.checks.filter((item) => item.ok !== true).map((item) => item.label.toLowerCase());

  if (marked < phases.length) {
    recs.push(`Faltan ${phases.length - marked} fases por marcar. Para esta versión, lo más importante es tener Address, Top e Impact bien marcados.`);
  } else {
    recs.push('Todas las fases principales están marcadas. Ya se puede comparar el swing fase por fase.');
  }

  if (missingChecks.length) {
    recs.push(`Antes de sacar conclusiones fuertes, revisa la captura: ${missingChecks.slice(0, 3).join(', ')}${missingChecks.length > 3 ? '…' : '.'}`);
  } else {
    recs.push('La calidad de captura es buena para un análisis inicial.');
  }

  if (state.guideMode === 'dtl') {
    recs.push('En DTL, usa las líneas inclinadas como referencia visual del plano del palo y observa si el downswing vuelve por una zona consistente hacia impacto.');
  } else {
    recs.push('En Face-On, revisa desplazamiento lateral, estabilidad de cabeza y posición de manos respecto a la bola en impacto.');
  }

  recs.push('Siguiente mejora recomendada: añadir ajuste fino de guías y comparación lado a lado entre dos sesiones.');
  return recs;
}

function analyze() {
  if (!state.videoUrl) return;
  setMode('analysis');
  setAppState('analyzing');
  refs.analysisStatus.textContent = 'Analizando calidad, guías y fases marcadas…';
  refs.recommendations.innerHTML = '';
  setTimeout(() => {
    const marked = Object.keys(state.phaseTimes).length;
    refs.analysisStatus.textContent = `Resultado inicial: Quality ${qualityScore()}% · ${marked}/${phases.length} fases marcadas.`;
    refs.recommendations.innerHTML = buildRecommendations().map((rec) => `<div class="rec">${rec}</div>`).join('');
    setAppState('completed');
  }, 450);
}

function captureThumbnailAt(time = null) {
  return new Promise((resolve) => {
    const video = refs.video;
    if (!state.videoUrl || !video.videoWidth || !video.videoHeight) return resolve(null);
    const original = video.currentTime || 0;
    const target = time == null ? original : Math.min(Math.max(time, 0), video.duration || original);
    const canvas = refs.thumbCanvas;
    const width = 220;
    const height = Math.round(width * (video.videoHeight / video.videoWidth));
    canvas.width = width;
    canvas.height = height;

    const draw = () => {
      try {
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);
        const data = canvas.toDataURL('image/jpeg', 0.72);
        if (time != null && Math.abs(video.currentTime - original) > 0.03) video.currentTime = original;
        resolve(data);
      } catch (error) {
        console.warn(error);
        resolve(null);
      }
    };

    if (time == null || Math.abs(video.currentTime - target) < 0.03) return draw();
    video.addEventListener('seeked', draw, { once: true });
    video.currentTime = target;
  });
}

async function saveSession() {
  if (!state.videoBlob) {
    alert('No hay vídeo cargado para guardar.');
    return;
  }
  try {
    const thumbTime = state.phaseTimes.address ?? Object.values(state.phaseTimes)[0] ?? 0;
    const thumbnail = await captureThumbnailAt(thumbTime);
    await dbPut({
      id: uid(),
      createdAt: new Date().toISOString(),
      videoName: state.videoName,
      videoType: state.videoBlob.type,
      videoBlob: state.videoBlob,
      duration: refs.video.duration || null,
      guideMode: state.guideMode,
      checks: state.checks,
      qualityScore: qualityScore(),
      phaseTimes: state.phaseTimes,
      thumbnail,
    });
    setAppState('saved');
    await loadHistory();
    setMode('history');
  } catch (error) {
    console.error(error);
    setAppState('error');
    alert('No se pudo guardar la sesión. Puede faltar espacio o estar bloqueado el almacenamiento privado del navegador.');
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
    item.innerHTML = `
      <img class="history-thumb" src="${session.thumbnail || 'icons/icon-192.png'}" alt="Miniatura" />
      <div>
        <div class="history-title">${session.videoName || 'Swing guardado'}</div>
        <div class="history-meta">${date} · Quality ${session.qualityScore ?? 0}% · ${Object.keys(session.phaseTimes || {}).length}/${phases.length} fases</div>
      </div>`;
    item.addEventListener('click', () => restoreSession(session));
    refs.historyList.appendChild(item);
  });
}

function restoreSession(session) {
  if (!session.videoBlob) {
    alert('Esta sesión no tiene vídeo guardado.');
    return;
  }
  revokeVideoUrl();
  state.videoBlob = session.videoBlob;
  state.videoUrl = URL.createObjectURL(session.videoBlob);
  state.videoName = session.videoName || 'Swing guardado';
  state.phaseTimes = session.phaseTimes || {};
  state.checks = session.checks || clone(defaultChecks);
  state.guideMode = session.guideMode || 'dtl';
  state.currentPhaseId = 'address';
  state.mode = 'capture';
  state.controlsVisible = true;
  refs.video.src = state.videoUrl;
  refs.video.load();
  setAppState('loaded');
  render();
}

async function clearHistory() {
  if (!confirm('¿Borrar todas las sesiones guardadas en este dispositivo?')) return;
  await dbClear();
  await loadHistory();
}

function bindEvents() {
  refs.pickVideoBtn.addEventListener('click', () => refs.videoInput.click());
  refs.openCameraBtn.addEventListener('click', () => refs.cameraInput.click());
  refs.uploadBtn.addEventListener('click', () => refs.videoInput.click());
  refs.videoInput.addEventListener('change', (event) => applyVideoFile(event.target.files?.[0]));
  refs.cameraInput.addEventListener('change', (event) => applyVideoFile(event.target.files?.[0]));

  refs.tapLayer.addEventListener('click', toggleControls);
  refs.playBtn.addEventListener('click', togglePlay);
  refs.video.addEventListener('click', toggleControls);
  refs.video.addEventListener('timeupdate', () => { renderPhaseHud(); renderTimeline(); });
  refs.video.addEventListener('seeked', () => { renderPhaseHud(); renderTimeline(); });
  refs.video.addEventListener('play', () => { refs.playBtn.textContent = 'Pause'; });
  refs.video.addEventListener('pause', () => { refs.playBtn.textContent = 'Play'; });
  refs.video.addEventListener('loadedmetadata', () => {
    refs.video.playbackRate = state.speed;
    const isVertical = refs.video.videoHeight >= refs.video.videoWidth;
    state.checks = state.checks.map((check) => check.id === 'vertical' ? { ...check, ok: isVertical } : check);
    render();
  });

  refs.toggleGuidesBtn.addEventListener('click', () => { state.showGuides = !state.showGuides; render(); });
  refs.switchModeBtn.addEventListener('click', () => { state.guideMode = state.guideMode === 'dtl' ? 'fo' : 'dtl'; render(); });
  refs.fitBtn.addEventListener('click', () => { state.fitContain = !state.fitContain; render(); });
  refs.speedBtn.addEventListener('click', cycleSpeed);

  refs.tabCapture.addEventListener('click', () => setMode('capture'));
  refs.tabPhases.addEventListener('click', () => setMode('phases'));
  refs.tabAnalysis.addEventListener('click', () => setMode('analysis'));
  refs.tabHistory.addEventListener('click', () => setMode('history'));
  refs.goPhasesBtn.addEventListener('click', () => setMode('phases'));

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
