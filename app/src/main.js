import { VideoPlayer, formatTime } from "./video-player.js";
import { OverlayCanvas, drawBallPath } from "./overlays.js";
import { calculateMetrics, metricRows } from "./metrics.js";
import { buildRecommendations } from "./recommendations.js";
import { downloadCsv, downloadJson, downloadPng } from "./export.js";
import { getSession, listSessions, saveSession } from "./storage.js";
import { analyzeVideo } from "./video-analysis.js";
import { detectBallTrajectory } from "./ball-tracking.js";
import { blendAnalysisWithLearning, correctionExampleCount, demoCorrectionExampleCount, findLearningMatch, isDemoLearningEnabled, saveCorrectionExample, setDemoLearningEnabled, storedCorrectionExampleCount } from "./learning.js";

const APP_VERSION = "0.5.5";
const FLOW_STEPS = ["upload", "frame", "quality", "analyze", "events", "report", "save"];
const PHASE_SEQUENCE = ["address", "top", "impact", "finish"];

const APP_STATES = {
  empty: "Sin vídeo cargado",
  loaded: "Vídeo cargado",
  analyzing: "Analizando",
  complete: "Análisis completado",
  saved: "Sesión guardada",
  error: "Error de análisis",
  history: "Sesión histórica sin vídeo"
};

const EVENT_LABELS = {
  address: "Address",
  top: "Top",
  impact: "Impact",
  finish: "Finish"
};

const METRIC_LABELS = {
  headStability: "Estabilidad cabeza",
  postureRetention: "Postura impacto",
  handPath: "Ruta manos",
  finishBalance: "Equilibrio final"
};

const els = {
  modeButtons: document.querySelectorAll("[data-mode]"),
  homeScreen: document.querySelector("#homeScreen"),
  homeLoadHistoryBtn: document.querySelector("#homeLoadHistoryBtn"),
  homeCompareBtn: document.querySelector("#homeCompareBtn"),
  homeHint: document.querySelector("#homeHint"),
  flowStepEyebrow: document.querySelector("#flowStepEyebrow"),
  flowStepTitle: document.querySelector("#flowStepTitle"),
  flowStepText: document.querySelector("#flowStepText"),
  flowPrimaryAction: document.querySelector("#flowPrimaryAction"),
  flowSecondaryAction: document.querySelector("#flowSecondaryAction"),
  flowBackAction: document.querySelector("#flowBackAction"),
  videoScreenTitle: document.querySelector("#videoScreenTitle"),
  phaseReviewPanel: document.querySelector("#phaseReviewPanel"),
  phaseQuickNav: document.querySelector("#phaseQuickNav"),
  videoOverlayToolbar: document.querySelector("#videoOverlayToolbar"),
  fitControlsOverlay: document.querySelector("#fitControlsOverlay"),
  guideControls: document.querySelectorAll("[data-guide-control]"),
  overlayToggleButtons: document.querySelectorAll("[data-overlay-toggle]"),
  clearMarkButtons: document.querySelectorAll("[data-clear-marks]"),
  phaseProgressLabel: document.querySelector("#phaseProgressLabel"),
  phaseCoachTitle: document.querySelector("#phaseCoachTitle"),
  phaseCoachText: document.querySelector("#phaseCoachText"),
  confirmPhaseBtn: document.querySelector("#confirmPhaseBtn"),
  changePhaseBtn: document.querySelector("#changePhaseBtn"),
  nextPhaseBtn: document.querySelector("#nextPhaseBtn"),
  workflowPanel: document.querySelector("#workflowPanel"),
  appStateBadge: document.querySelector("#appStateBadge"),
  appVersionBadge: document.querySelector("#appVersionBadge"),
  refreshAppBtn: document.querySelector("#refreshAppBtn"),
  resetSessionBtn: document.querySelector("#resetSessionBtn"),
  swingWorkspace: document.querySelector("#swingWorkspace"),
  ballWorkspace: document.querySelector("#ballWorkspace"),
  prepPanel: document.querySelector("#prepPanel"),
  videoInput: document.querySelector("#videoInput"),
  videoFileName: document.querySelector("#videoFileName"),
  video: document.querySelector("#swingVideo"),
  stage: document.querySelector("#stage"),
  historyVideoNotice: document.querySelector("#historyVideoNotice"),
  phaseSnapshotStrip: document.querySelector("#phaseSnapshotStrip"),
  emptyStage: document.querySelector("#emptyStage"),
  canvas: document.querySelector("#overlayCanvas"),
  frameSlider: document.querySelector("#frameSlider"),
  fpsInput: document.querySelector("#fpsInput"),
  frameReadout: document.querySelector("#frameReadout"),
  timeReadout: document.querySelector("#timeReadout"),
  playPauseBtn: document.querySelector("#playPauseBtn"),
  playIcon: document.querySelector("#playIcon"),
  backFrameBtn: document.querySelector("#backFrameBtn"),
  nextFrameBtn: document.querySelector("#nextFrameBtn"),
  playbackRate: document.querySelector("#playbackRate"),
  fullscreenBtn: document.querySelector("#fullscreenBtn"),
  autoAnalyzeBtn: document.querySelector("#autoAnalyzeBtn"),
  orientationBadge: document.querySelector("#orientationBadge"),
  analysisStatus: document.querySelector("#analysisStatus"),
  viewType: document.querySelector("#viewType"),
  club: document.querySelector("#club"),
  ballResult: document.querySelector("#ballResult"),
  captureChecks: document.querySelector("#captureChecks"),
  captureScore: document.querySelector("#captureScore"),
  captureAutoNote: document.querySelector("#captureAutoNote"),
  eventGrid: document.querySelector("#eventGrid"),
  toolButtons: document.querySelectorAll("[data-tool]"),
  clearMarksBtn: document.querySelector("#clearMarksBtn"),
  toggleGuide: document.querySelector("#toggleGuide"),
  toggleEvents: document.querySelector("#toggleEvents"),
  toggleGrid: document.querySelector("#toggleGrid"),
  centerGuideBtn: document.querySelector("#centerGuideBtn"),
  guideInputs: {
    x: document.querySelector("#guideX"),
    y: document.querySelector("#guideY"),
    scale: document.querySelector("#guideScale"),
    width: document.querySelector("#guideWidth"),
    footAngle: document.querySelector("#guideFootAngle"),
    rotation: document.querySelector("#guideRotation")
  },
  manualMetricInputs: {
    headStability: document.querySelector("#headStability"),
    postureRetention: document.querySelector("#postureRetention"),
    handPath: document.querySelector("#handPath"),
    finishBalance: document.querySelector("#finishBalance")
  },
  metricOutputs: {
    headStability: document.querySelector("#headStabilityValue"),
    postureRetention: document.querySelector("#postureRetentionValue"),
    handPath: document.querySelector("#handPathValue"),
    finishBalance: document.querySelector("#finishBalanceValue")
  },
  metricHints: {
    headStability: document.querySelector("#headStabilityHint"),
    postureRetention: document.querySelector("#postureRetentionHint"),
    handPath: document.querySelector("#handPathHint"),
    finishBalance: document.querySelector("#finishBalanceHint")
  },
  saveSessionBtn: document.querySelector("#saveSessionBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  exportPngBtn: document.querySelector("#exportPngBtn"),
  refreshHistoryBtn: document.querySelector("#refreshHistoryBtn"),
  saveCorrectionBtn: document.querySelector("#saveCorrectionBtn"),
  learningCount: document.querySelector("#learningCount"),
  demoLearningToggle: document.querySelector("#demoLearningToggle"),
  historyList: document.querySelector("#historyList"),
  historyItemTemplate: document.querySelector("#historyItemTemplate"),
  overallScore: document.querySelector("#overallScore"),
  scoreArc: document.querySelector("#scoreArc"),
  reportSummary: document.querySelector("#reportSummary"),
  confidenceBadge: document.querySelector("#confidenceBadge"),
  primaryIssue: document.querySelector("#primaryIssue"),
  primaryEvidence: document.querySelector("#primaryEvidence"),
  drillName: document.querySelector("#drillName"),
  drillDescription: document.querySelector("#drillDescription"),
  metricList: document.querySelector("#metricList"),
  recommendationList: document.querySelector("#recommendationList"),
  explanationList: document.querySelector("#explanationList"),
  ballVideo: document.querySelector("#ballVideo"),
  ballStage: document.querySelector("#ballStage"),
  ballCanvas: document.querySelector("#ballCanvas"),
  ballEmptyStage: document.querySelector("#ballEmptyStage"),
  markBallLaunchBtn: document.querySelector("#markBallLaunchBtn"),
  autoBallPathBtn: document.querySelector("#autoBallPathBtn"),
  clearBallPathBtn: document.querySelector("#clearBallPathBtn"),
  ballFullscreenBtn: document.querySelector("#ballFullscreenBtn"),
  ballPathLabel: document.querySelector("#ballPathLabel"),
  ballLaunchLabel: document.querySelector("#ballLaunchLabel"),
  ballPathStatus: document.querySelector("#ballPathStatus"),
  ballPathSummary: document.querySelector("#ballPathSummary")
};

const state = {
  id: null,
  videoName: "",
  createdAt: null,
  videoObjectUrl: "",
  appStatus: "empty",
  flowStep: "upload",
  activePhaseIndex: 0,
  reviewedEvents: {},
  isHistoryOnly: false,
  thumbnail: null,
  frameSnapshots: {},
  orientation: "none",
  videoSize: { width: 0, height: 0 },
  viewType: els.viewType.value,
  club: els.club.value,
  ballResult: els.ballResult.value,
  fps: Number(els.fpsInput.value),
  duration: 0,
  totalFrames: 0,
  currentFrame: 0,
  events: {
    address: null,
    top: null,
    impact: null,
    finish: null
  },
  eventMeta: {},
  captureChecks: {
    frame: false,
    light: false,
    stable: false,
    ball: false,
    club: false,
    fps: false
  },
  manualMetrics: {
    headStability: 72,
    postureRetention: 68,
    handPath: 64,
    finishBalance: 76
  },
  metricEvidence: {},
  guide: {
    x: 0.5,
    y: 0.8,
    scale: 1,
    width: 1,
    footAngle: 0,
    rotation: -8
  },
  overlay: {
    guide: true,
    events: true,
    grid: false
  },
  ballPath: [],
  ballPathAuto: false,
  ballPathMeta: null,
  ballLaunchPoint: null,
  isMarkingBallLaunch: false,
  videoAnalysis: null,
  isAnalyzing: false,
  isDetectingBall: false,
  metrics: {},
  report: {}
};

let analysisToken = 0;
let ballDragIndex = null;
let ballAnimationFrame = 0;

const player = new VideoPlayer({
  video: els.video,
  slider: els.frameSlider,
  fpsInput: els.fpsInput,
  frameReadout: els.frameReadout,
  timeReadout: els.timeReadout,
  onFrame: (frame) => {
    state.currentFrame = frame;
    overlay.render();
  }
});

const overlay = new OverlayCanvas({
  canvas: els.canvas,
  video: els.video,
  getState: () => state
});

let pendingVideoLoadTimer = null;
let finalizedVideoObjectUrl = "";

const ballResizeObserver = new ResizeObserver(() => resizeBallCanvas());
ballResizeObserver.observe(els.ballStage);

setupPreparationPanel();
initVersionUi();
bindEvents();
syncControls();
renderLearningCount();
updateAnalysis();
setAppStatus("empty");
renderHistory();
registerServiceWorker();


function initVersionUi() {
  if (els.appVersionBadge) els.appVersionBadge.textContent = `v${APP_VERSION}`;
  if (els.demoLearningToggle) els.demoLearningToggle.checked = isDemoLearningEnabled();
}

function setAppStatus(status, message) {
  state.appStatus = status;
  const label = message || APP_STATES[status] || APP_STATES.empty;
  if (els.appStateBadge) {
    els.appStateBadge.textContent = label;
    els.appStateBadge.dataset.state = status;
  }
  renderWorkflow();
  renderFlowUi();
  renderPhaseCoach();
  renderHistoryMediaUi();
}

function scheduleVideoLoadGuard(file) {
  if (pendingVideoLoadTimer) window.clearTimeout(pendingVideoLoadTimer);
  pendingVideoLoadTimer = window.setTimeout(() => {
    if (els.video.readyState >= 1 && state.videoObjectUrl) {
      finalizeVideoLoad();
      return;
    }
    if (!state.videoObjectUrl) return;
    const name = file?.name ? ` “${file.name}”` : "";
    els.analysisStatus.textContent = `El vídeo${name} sigue cargando o el navegador no ha podido leer su metadata. Prueba con MP4 H.264 si no aparece.`;
    setAppStatus("loaded", "Vídeo cargando");
  }, 3000);
}

function finalizeVideoLoad() {
  if (!state.videoObjectUrl || state.isHistoryOnly) return;
  if (finalizedVideoObjectUrl === state.videoObjectUrl) return;
  finalizedVideoObjectUrl = state.videoObjectUrl;
  if (pendingVideoLoadTimer) {
    window.clearTimeout(pendingVideoLoadTimer);
    pendingVideoLoadTimer = null;
  }

  player.handleMetadata();
  state.duration = player.duration;
  state.totalFrames = player.totalFrames;
  state.videoSize = { width: els.video.videoWidth || 0, height: els.video.videoHeight || 0 };
  state.orientation = state.videoSize.width >= state.videoSize.height ? "horizontal" : "vertical";
  if (!state.totalFrames && state.duration > 0) {
    state.totalFrames = Math.max(1, Math.floor(state.duration * state.fps));
  }

  els.emptyStage.style.display = "none";
  els.ballEmptyStage.style.display = "none";
  updateOrientationUi();
  autoFitGuide(true);
  clearDetectedEvents();
  updateAnalysis();
  overlay.resize();
  overlay.render();
  setAppStatus("loaded");
  const learningMatch = findLearningMatch(state);
  els.analysisStatus.textContent = learningMatch
    ? `Vídeo listo. Hay una corrección parecida guardada: ${learningMatch.example.label}. Ajusta la guía y pulsa Analizar.`
    : "Vídeo listo. Ajusta encuadre, guía y capture score si hace falta; después pulsa Analizar.";
}

function handleVideoLoadError() {
  if (pendingVideoLoadTimer) {
    window.clearTimeout(pendingVideoLoadTimer);
    pendingVideoLoadTimer = null;
  }
  const failedName = state.videoName;
  state.videoObjectUrl = "";
  state.videoSize = { width: 0, height: 0 };
  state.duration = 0;
  state.totalFrames = 0;
  state.flowStep = "upload";
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();
  els.ballVideo.pause();
  els.ballVideo.removeAttribute("src");
  els.ballVideo.load();
  els.emptyStage.style.display = "grid";
  els.ballEmptyStage.style.display = "grid";
  els.videoFileName.textContent = failedName ? `${failedName} · no compatible` : "MP4, MOV o WebM";
  if (els.homeHint) els.homeHint.textContent = "No se pudo previsualizar el vídeo. Prueba con MP4 H.264/AAC o graba/exporta de nuevo el clip.";
  setAppStatus("error", "Error al cargar vídeo");
  updateAnalysis();
}

function renderWorkflow() {
  if (!els.workflowPanel) return;
  const hasPlayableVideo = Boolean(state.videoObjectUrl && state.metrics?.hasVideo);
  const eventsComplete = Boolean(state.metrics?.eventsComplete);
  const analyzed = Boolean(state.videoAnalysis || eventsComplete || state.appStatus === "complete" || state.appStatus === "saved");
  const saved = Boolean(state.id && state.createdAt) || state.appStatus === "saved";
  const active = workflowActiveStep();
  const activeIndex = FLOW_STEPS.indexOf(active);
  const completed = {
    upload: hasPlayableVideo || state.isHistoryOnly,
    frame: hasPlayableVideo && activeIndex > FLOW_STEPS.indexOf("frame") || analyzed || state.isHistoryOnly,
    quality: hasPlayableVideo && activeIndex > FLOW_STEPS.indexOf("quality") || analyzed || state.isHistoryOnly,
    analyze: analyzed,
    events: eventsComplete && allEventsReviewed(),
    report: activeIndex > FLOW_STEPS.indexOf("report") || saved,
    save: saved
  };
  els.workflowPanel.querySelectorAll("[data-step]").forEach((step) => {
    const key = step.dataset.step;
    step.classList.toggle("is-complete", Boolean(completed[key]));
    step.classList.toggle("is-active", key === active);
  });
}

function workflowActiveStep() {
  if (state.appStatus === "analyzing") return "analyze";
  if (state.appStatus === "saved") return "save";
  if (state.isHistoryOnly) return "save";
  if (!state.videoObjectUrl) return "upload";
  if (!state.videoAnalysis && state.flowStep) return state.flowStep;
  if (state.videoAnalysis && !allEventsReviewed()) return "events";
  if (state.videoAnalysis && allEventsReviewed() && state.flowStep !== "save") return "report";
  return state.flowStep || "frame";
}

function renderHistoryMediaUi() {
  const historyOnly = Boolean(state.isHistoryOnly);
  els.historyVideoNotice?.classList.toggle("is-hidden", !historyOnly);
  els.phaseSnapshotStrip?.classList.toggle("is-hidden", !historyOnly || !Object.keys(state.frameSnapshots || {}).length);
  if (!els.phaseSnapshotStrip) return;
  els.phaseSnapshotStrip.innerHTML = "";
  Object.entries(state.frameSnapshots || {}).forEach(([eventName, snapshot]) => {
    if (!snapshot?.dataUrl) return;
    const card = document.createElement("figure");
    card.innerHTML = `
      <img src="${snapshot.dataUrl}" alt="${EVENT_LABELS[eventName]} guardado" />
      <figcaption>${EVENT_LABELS[eventName]} · frame ${snapshot.frame ?? "-"}</figcaption>
    `;
    els.phaseSnapshotStrip.append(card);
  });
}

function resetSession() {
  if (player.objectUrl) URL.revokeObjectURL(player.objectUrl);
  player.objectUrl = "";
  finalizedVideoObjectUrl = "";
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();
  els.ballVideo.pause();
  els.ballVideo.removeAttribute("src");
  els.ballVideo.load();
  els.videoInput.value = "";
  Object.assign(state, {
    id: null,
    videoName: "",
    createdAt: null,
    videoObjectUrl: "",
    flowStep: "upload",
    activePhaseIndex: 0,
    reviewedEvents: {},
    isHistoryOnly: false,
    thumbnail: null,
    frameSnapshots: {},
    orientation: "none",
    videoSize: { width: 0, height: 0 },
    duration: 0,
    totalFrames: 0,
    currentFrame: 0,
    events: { address: null, top: null, impact: null, finish: null },
    eventMeta: {},
    captureChecks: { frame: false, light: false, stable: false, ball: false, club: false, fps: false },
    ballPath: [],
    ballPathAuto: false,
    ballPathMeta: null,
    ballLaunchPoint: null,
    isMarkingBallLaunch: false,
    videoAnalysis: null,
    isAnalyzing: false,
    isDetectingBall: false,
    guide: { x: 0.5, y: 0.8, scale: 1, width: 1, footAngle: 0, rotation: -8 }
  });
  els.videoFileName.textContent = "MP4, MOV o WebM";
  const emptyPreview = els.emptyStage.querySelector("img");
  if (emptyPreview) emptyPreview.src = "./assets/swing-guide.svg";
  els.orientationBadge.textContent = "Sin vídeo";
  els.emptyStage.style.display = "grid";
  els.ballEmptyStage.style.display = "grid";
  syncCaptureInputs();
  clearDetectedEvents();
  overlay.clear();
  updateAnalysis();
  setAppStatus("empty");
  els.analysisStatus.textContent = "Carga un vídeo, ajusta encuadre y pulsa Analizar.";
}

function setupPreparationPanel() {
  if (!els.prepPanel) return;
  const guidePanel = els.guideInputs.x?.closest(".panel");
  if (guidePanel && !guidePanel.querySelector(".guide-help")) {
    const details = document.createElement("details");
    details.className = "guide-help";
    details.innerHTML = `
      <summary>Cómo colocar la guía</summary>
      <div>
        <img src="./assets/guide-example.svg" alt="" />
        <p>Coloca la línea baja sobre pies o alfombra. En DTL, rota la diagonal hasta que siga el plano aproximado del palo. En face-on, usa las verticales para ver desplazamiento del cuerpo.</p>
      </div>
    `;
    guidePanel.append(details);
  }
}

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.resetSessionBtn?.addEventListener("click", () => resetSession());
  els.homeLoadHistoryBtn?.addEventListener("click", () => { els.homeScreen?.classList.add("is-collapsed"); document.querySelector("#historyPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  els.homeCompareBtn?.addEventListener("click", () => {
    if (els.homeHint) els.homeHint.textContent = "Comparativa: selecciona o guarda dos análisis. La vista avanzada se activará en la siguiente iteración; por ahora puedes cargar sesiones del historial.";
    els.homeScreen?.classList.add("is-collapsed");
    document.querySelector("#historyPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  els.flowPrimaryAction?.addEventListener("click", () => handleFlowPrimaryAction());
  els.flowSecondaryAction?.addEventListener("click", () => handleFlowSecondaryAction());
  els.flowBackAction?.addEventListener("click", () => moveFlowBack());
  els.confirmPhaseBtn?.addEventListener("click", () => confirmPhaseAtCurrentFrame(true));
  els.nextPhaseBtn?.addEventListener("click", () => acceptCurrentPhaseProposal(true));
  els.changePhaseBtn?.addEventListener("click", () => changeCurrentPhaseToCurrentFrame());
  els.refreshAppBtn?.addEventListener("click", () => {
    if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  });
  els.demoLearningToggle?.addEventListener("change", () => {
    setDemoLearningEnabled(els.demoLearningToggle.checked);
    renderLearningCount();
    const mode = els.demoLearningToggle.checked ? "activado" : "desactivado";
    els.analysisStatus.textContent = `Modo demo de aprendizaje ${mode}. Las correcciones reales siguen guardadas aparte.`;
  });

  els.videoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.videoName = file.name;
    state.id = null;
    state.createdAt = null;
    state.flowStep = "frame";
    state.activePhaseIndex = 0;
    state.reviewedEvents = {};
    state.isHistoryOnly = false;
    state.thumbnail = null;
    state.frameSnapshots = {};
    state.videoAnalysis = null;
    finalizedVideoObjectUrl = "";
    state.ballPath = [];
    state.ballPathAuto = false;
    state.ballPathMeta = null;
    state.ballLaunchPoint = null;
    state.isMarkingBallLaunch = false;
    state.events = { address: null, top: null, impact: null, finish: null };
    state.eventMeta = {};
    state.captureChecks = { frame: false, light: false, stable: false, ball: false, club: false, fps: false };
    syncCaptureInputs();
    els.videoFileName.textContent = file.name;
    const emptyPreview = els.emptyStage.querySelector("img");
    if (emptyPreview) emptyPreview.src = "./assets/swing-guide.svg";
    els.emptyStage.style.display = "none";
    els.ballEmptyStage.style.display = "none";
    els.analysisStatus.textContent = "Vídeo cargando. El visor se abre ya; si tarda, espera a que el navegador lea la metadata.";
    els.ballPathStatus.textContent = "La trayectoria aparece después de detectar la bola.";
    renderBallLaunch();

    const objectUrl = player.load(file);
    state.videoObjectUrl = objectUrl;
    els.ballVideo.src = objectUrl;
    els.ballVideo.load();
    setAppStatus("loaded", "Vídeo cargando");
    updateAnalysis();
    scheduleVideoLoadGuard(file);
  });

  els.video.addEventListener("loadedmetadata", () => finalizeVideoLoad());
  els.video.addEventListener("loadeddata", () => finalizeVideoLoad());
  els.video.addEventListener("canplay", () => finalizeVideoLoad());
  els.video.addEventListener("error", () => handleVideoLoadError());

  els.video.addEventListener("play", () => {
    els.playIcon.innerHTML = '<path d="M8 5h3v14H8zM13 5h3v14h-3z" />';
  });

  els.video.addEventListener("pause", () => {
    els.playIcon.innerHTML = '<path d="M8 5v14l11-7Z" />';
  });

  els.playPauseBtn.addEventListener("click", () => player.togglePlayback());
  els.backFrameBtn.addEventListener("click", () => player.step(-1));
  els.nextFrameBtn.addEventListener("click", () => player.step(1));
  els.playbackRate.addEventListener("change", () => player.setPlaybackRate(els.playbackRate.value));
  els.fullscreenBtn.addEventListener("click", () => requestFullscreen(els.stage));
  els.autoAnalyzeBtn.addEventListener("click", () => runAutoAnalysis());

  els.viewType.addEventListener("change", () => {
    state.viewType = els.viewType.value;
    updateAnalysis();
    overlay.render();
  });
  els.club.addEventListener("change", () => {
    state.club = els.club.value;
    updateAnalysis();
  });
  els.ballResult.addEventListener("change", () => {
    state.ballResult = els.ballResult.value;
    updateAnalysis();
    if (state.ballPathAuto && state.ballPathMeta?.source === "fallback") suggestBallPath();
  });
  els.fpsInput.addEventListener("change", () => {
    state.fps = Number(els.fpsInput.value) || 60;
    player.handleMetadata();
    updateAnalysis();
  });

  els.captureChecks.addEventListener("change", () => {
    [...els.captureChecks.querySelectorAll("input")].forEach((input) => {
      state.captureChecks[input.value] = input.checked;
    });
    els.captureAutoNote.textContent = "Editado manualmente.";
    updateAnalysis();
  });

  Object.entries(els.manualMetricInputs).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      state.manualMetrics[key] = Number(input.value);
      state.metricEvidence[key] = `${METRIC_LABELS[key]} ajustada manualmente.`;
      updateAnalysis();
    });
  });

  document.querySelectorAll("[data-metric-frame]").forEach((button) => {
    button.addEventListener("click", () => {
      const frame = state.events[button.dataset.metricFrame];
      if (Number.isFinite(frame)) player.seekFrame(frame);
    });
  });

  document.querySelectorAll("[data-phase-select]").forEach((button) => {
    button.addEventListener("click", () => selectPhase(button.dataset.phaseSelect));
  });

  els.eventGrid.addEventListener("click", (event) => {
    const jumpButton = event.target.closest("[data-event-jump]");
    const acceptButton = event.target.closest("[data-phase-accept]");
    const confirmButton = event.target.closest("[data-phase-confirm-current]");
    if (jumpButton) selectPhase(jumpButton.dataset.eventJump);
    if (acceptButton) {
      selectPhase(acceptButton.dataset.phaseAccept, { seek: false });
      acceptCurrentPhaseProposal(true);
    }
    if (confirmButton) {
      selectPhase(confirmButton.dataset.phaseConfirmCurrent, { seek: false });
      confirmPhaseAtCurrentFrame(true);
    }
  });

  els.toolButtons.forEach((button) => {
    button.addEventListener("click", () => setOverlayTool(button.dataset.tool));
  });

  els.clearMarksBtn.addEventListener("click", () => overlay.clear());
  els.clearMarkButtons.forEach((button) => button.addEventListener("click", () => overlay.clear()));
  els.overlayToggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.overlayToggle;
      if (!(key in state.overlay)) return;
      state.overlay[key] = !state.overlay[key];
      syncOverlayButtons();
      overlay.render();
    });
  });
  els.toggleGuide.addEventListener("change", () => {
    state.overlay.guide = els.toggleGuide.checked;
    syncOverlayButtons();
    overlay.render();
  });
  els.toggleEvents.addEventListener("change", () => {
    state.overlay.events = els.toggleEvents.checked;
    syncOverlayButtons();
    overlay.render();
  });
  els.toggleGrid.addEventListener("change", () => {
    state.overlay.grid = els.toggleGrid.checked;
    syncOverlayButtons();
    overlay.render();
  });

  els.guideControls.forEach((input) => {
    input.addEventListener("input", () => {
      updateGuideFromControl(input.dataset.guideControl, input.value);
      syncGuideInputs(input);
      overlay.render();
    });
  });
  els.centerGuideBtn.addEventListener("click", () => {
    state.guide = defaultGuide();
    syncGuideInputs();
    overlay.render();
  });

  els.saveSessionBtn.addEventListener("click", async () => {
    els.saveSessionBtn.disabled = true;
    els.analysisStatus.textContent = "Guardando sesión y frames principales...";
    try {
      const session = await buildSession({ includeFrameSnapshots: true });
      await saveSession(session);
      state.id = session.id;
      state.createdAt = session.createdAt;
      state.thumbnail = session.thumbnail || state.thumbnail;
      state.frameSnapshots = session.frameSnapshots || state.frameSnapshots;
      await renderHistory();
      setAppStatus("saved");
      els.analysisStatus.textContent = "Sesión guardada con miniatura y frames principales.";
    } catch (error) {
      setAppStatus("error");
      els.analysisStatus.textContent = error.message || "No se pudo guardar la sesión.";
    } finally {
      renderActionStates();
    }
  });

  els.exportJsonBtn.addEventListener("click", async () => downloadJson("swing-analysis.json", await buildSession()));
  els.exportCsvBtn.addEventListener("click", () => downloadCsv("swing-metrics.csv", state.metrics));
  els.exportPngBtn.addEventListener("click", () => downloadPng("swing-frame.png", els.video, overlay));
  els.refreshHistoryBtn.addEventListener("click", () => renderHistory());
  els.saveCorrectionBtn.addEventListener("click", () => {
    try {
      const example = saveCorrectionExample(state);
      renderLearningCount();
      els.analysisStatus.textContent = `Corrección guardada para aprendizaje local: ${example.label}.`;
    } catch (error) {
      els.analysisStatus.textContent = error.message || "No se pudo guardar la corrección.";
    }
    renderActionStates();
  });

  els.markBallLaunchBtn.addEventListener("click", () => {
    state.isMarkingBallLaunch = true;
    els.markBallLaunchBtn.classList.add("is-active");
    els.ballPathStatus.textContent = "Toca la bola en el vídeo justo donde sale. Esto mejora mucho la trayectoria.";
  });
  els.autoBallPathBtn.addEventListener("click", () => detectBallPath());
  els.clearBallPathBtn.addEventListener("click", () => {
    state.ballPath = [];
    state.ballPathAuto = false;
    state.ballPathMeta = null;
    els.ballPathStatus.textContent = "Trayectoria limpia. Puedes detectar de nuevo o marcar puntos manuales.";
    renderBall();
  });
  els.ballFullscreenBtn.addEventListener("click", () => requestFullscreen(els.ballStage));
  els.ballVideo.addEventListener("timeupdate", () => renderBall());
  els.ballVideo.addEventListener("seeked", () => renderBall());
  els.ballVideo.addEventListener("play", () => startBallAnimation());
  els.ballVideo.addEventListener("pause", () => stopBallAnimation());
  els.ballStage.addEventListener("pointerdown", (event) => {
    if (!state.videoObjectUrl) return;
    const rect = els.ballStage.getBoundingClientRect();
    if (event.target === els.ballVideo && event.clientY - rect.top > rect.height - 48) return;
    const point = pointerToVideoPoint(event);
    if (!point) return;
    if (state.isMarkingBallLaunch) {
      state.ballLaunchPoint = point;
      state.isMarkingBallLaunch = false;
      els.markBallLaunchBtn.classList.remove("is-active");
      els.ballPathStatus.textContent = "Salida marcada. Ahora pulsa Detectar bola para calcular el recorrido desde ahí.";
      state.ballPath = [];
      state.ballPathMeta = null;
      renderBallLaunch();
      renderBall();
      return;
    }
    const existing = nearestBallPoint(point, rect);
    state.ballPathAuto = false;
    if (existing != null) {
      ballDragIndex = existing;
      els.ballStage.setPointerCapture?.(event.pointerId);
    } else {
      state.ballPath.push({ ...point, time: nextManualBallTime() });
      state.ballPath.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      if (state.ballPath.length > 7) state.ballPath.shift();
    }
    renderBall();
  });
  els.ballStage.addEventListener("pointermove", (event) => {
    if (ballDragIndex == null) return;
    const point = pointerToVideoPoint(event);
    if (!point) return;
    state.ballPath[ballDragIndex] = { ...state.ballPath[ballDragIndex], x: point.x, y: point.y };
    renderBall();
  });
  window.addEventListener("pointerup", () => {
    ballDragIndex = null;
  });

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "ArrowLeft") player.step(-1);
    if (event.key === "ArrowRight") player.step(1);
    if (event.key === " ") {
      event.preventDefault();
      player.togglePlayback();
    }
    if (event.key.toLowerCase() === "f") requestFullscreen(els.stage);
  });
}

function setOverlayTool(tool) {
  overlay.setTool(tool);
  els.toolButtons.forEach((item) => item.classList.toggle("is-active", item.dataset.tool === tool));
}

function syncOverlayButtons() {
  els.overlayToggleButtons.forEach((button) => {
    const key = button.dataset.overlayToggle;
    button.classList.toggle("is-active", Boolean(state.overlay[key]));
  });
  if (els.toggleGuide) els.toggleGuide.checked = Boolean(state.overlay.guide);
  if (els.toggleEvents) els.toggleEvents.checked = Boolean(state.overlay.events);
  if (els.toggleGrid) els.toggleGrid.checked = Boolean(state.overlay.grid);
}

function selectPhase(eventName, options = {}) {
  const index = PHASE_SEQUENCE.indexOf(eventName);
  if (index < 0) return;
  state.activePhaseIndex = index;
  state.flowStep = "events";
  const frame = state.events[eventName];
  if (options.seek !== false && Number.isFinite(frame) && state.videoObjectUrl) player.seekFrame(frame);
  renderEvents();
  renderPhaseCoach();
  renderActionStates();
}

async function runAutoAnalysis() {
  if (!state.videoObjectUrl || !state.duration) return;
  const token = (analysisToken += 1);
  state.isAnalyzing = true;
  els.autoAnalyzeBtn.disabled = true;
  setAppStatus("analyzing");
  els.analysisStatus.textContent = "Analizando movimiento del vídeo...";
  try {
    let analysis = await analyzeVideo(els.video, {
      fps: state.fps,
      onProgress: (progress) => {
        if (token === analysisToken) els.analysisStatus.textContent = `Analizando movimiento... ${progress}%`;
      }
    });
    if (token !== analysisToken) return;
    analysis = blendAnalysisWithLearning(analysis, state);
    state.videoAnalysis = analysis;
    state.events = analysis.events;
    state.eventMeta = analysis.eventMeta;
    state.captureChecks = analysis.captureChecks;
    if (analysis.autoMetrics) {
      Object.entries(analysis.autoMetrics).forEach(([key, value]) => {
        if (key !== "evidence" && key in state.manualMetrics) state.manualMetrics[key] = value;
      });
      state.metricEvidence = analysis.autoMetrics.evidence || {};
    }
    syncCaptureInputs();
    syncMetricControls();
    updateAnalysis();
    renderBall();
    state.flowStep = "events";
    state.activePhaseIndex = 0;
    state.reviewedEvents = {};
    focusCurrentPhase();
    const learning = analysis.summary.learningMatch ? ` Base local: ${analysis.summary.learningMatch}.` : "";
    setAppStatus("complete");
    els.analysisStatus.textContent = `Análisis completado. Señal de movimiento heurística: ${analysis.summary.signal}/100 aprox.${learning}`;
    const firstFrame = state.events.address;
    if (Number.isFinite(firstFrame)) player.seekFrame(firstFrame);
  } catch (error) {
    setAppStatus("error");
    els.analysisStatus.textContent = "No se pudo analizar automáticamente. Puedes marcar las fases manualmente.";
  } finally {
    state.isAnalyzing = false;
    els.autoAnalyzeBtn.disabled = false;
    renderActionStates();
  }
}

function suggestEvents() {
  if (!state.totalFrames) return;
  state.events = {
    address: Math.round(state.totalFrames * 0.08),
    top: Math.round(state.totalFrames * 0.48),
    impact: Math.round(state.totalFrames * 0.68),
    finish: Math.round(state.totalFrames * 0.9)
  };
  state.eventMeta = Object.fromEntries(
    Object.keys(state.events).map((event) => [
      event,
      { source: "estimado", confidence: 42, note: "Estimación inicial por duración" }
    ])
  );
  renderEvents();
}

function clearDetectedEvents() {
  state.events = { address: null, top: null, impact: null, finish: null };
  state.eventMeta = {};
  state.reviewedEvents = {};
  renderEvents();
}

function markEvent(eventName) {
  if (!state.videoObjectUrl || !state.metrics.hasVideo) return;
  state.events[eventName] = state.currentFrame;
  state.eventMeta[eventName] = { source: "manual", confidence: 95, note: "Marcado por el usuario" };
  state.reviewedEvents[eventName] = false;
  renderEvents();
  updateAnalysis();
  overlay.render();
}

function jumpToEvent(eventName) {
  const frame = state.events[eventName];
  const index = PHASE_SEQUENCE.indexOf(eventName);
  if (index >= 0) state.activePhaseIndex = index;
  if (Number.isFinite(frame)) player.seekFrame(frame);
  renderPhaseCoach();
}

function renderEvents() {
  els.eventGrid.querySelectorAll("[data-event-card]").forEach((card) => {
    const eventName = card.dataset.eventCard;
    const frame = state.events[eventName];
    const strong = card.querySelector("strong");
    const small = card.querySelector("small");
    const meta = state.eventMeta[eventName];
    const isActive = PHASE_SEQUENCE[state.activePhaseIndex] === eventName;
    card.classList.toggle("is-set", Number.isFinite(frame));
    card.classList.toggle("is-reviewed", Boolean(state.reviewedEvents[eventName]));
    card.classList.toggle("is-active", isActive);
    card.querySelector(".phase-local-actions")?.classList.toggle("is-visible", isActive);
    const sourceLabel = {
      manual: "Manual",
      aprendizaje: "Base local",
      demo: "Demo",
      auto: "Auto",
      estimado: "Estimado"
    }[meta?.source] || "Auto";
    strong.textContent = Number.isFinite(frame) ? `${frame} · ${formatTime(frame / state.fps)}` : "Sin detectar";
    small.textContent = Number.isFinite(frame)
      ? `${sourceLabel} · ${meta?.confidence ?? 0}%${state.reviewedEvents[eventName] ? " · OK" : ""}`
      : phaseDescription(eventName);
  });
  els.phaseQuickNav?.querySelectorAll("[data-phase-select]").forEach((button) => {
    const eventName = button.dataset.phaseSelect;
    const frame = state.events[eventName];
    button.classList.toggle("is-active", PHASE_SEQUENCE[state.activePhaseIndex] === eventName);
    button.classList.toggle("is-reviewed", Boolean(state.reviewedEvents[eventName]));
    button.classList.toggle("is-set", Number.isFinite(frame));
    const strong = button.querySelector("strong");
    if (strong) strong.textContent = Number.isFinite(frame) ? String(frame) : "—";
  });
}

function updateAnalysis() {
  state.fps = Number(els.fpsInput.value) || 60;
  state.metrics = calculateMetrics(state);
  state.report = buildRecommendations(state, state.metrics);
  renderEvents();
  renderReport();
  renderActionStates();
  renderWorkflow();
  renderFlowUi();
  renderPhaseCoach();
  syncMetricControls();
  overlay.render();
}

function renderReport() {
  const { metrics, report } = state;
  els.captureScore.textContent = String(metrics.captureScore || 0);
  els.overallScore.textContent = String(metrics.overallScore || 0);
  const circumference = 302;
  els.scoreArc.style.strokeDashoffset = String(circumference - ((metrics.overallScore || 0) / 100) * circumference);
  els.reportSummary.textContent = report.summary;
  els.confidenceBadge.textContent = `${report.confidenceLabel} · ${report.evidenceSource || "Heurística"}`;
  els.primaryIssue.textContent = report.primaryIssue;
  els.primaryEvidence.textContent = report.evidence;
  els.drillName.textContent = report.drill?.name || "-";
  els.drillDescription.textContent = report.drill?.description || "";

  els.metricList.innerHTML = "";
  metricRows(metrics).forEach((metric) => {
    const row = document.createElement("details");
    row.className = "metric-row";
    row.innerHTML = `
      <summary><strong>${metric.label}</strong><span>${metric.value}</span></summary>
      <div class="meter"><i style="width:${Math.max(0, Math.min(100, metric.score))}%"></i></div>
      <p>${metric.detail}</p>
    `;
    els.metricList.append(row);
  });

  renderCards(
    els.recommendationList,
    report.recommendations,
    metrics.hasVideo ? "No hay alertas fuertes. Guarda este swing como referencia." : "Aparecerán después de cargar y analizar un vídeo."
  );
  renderCards(els.explanationList, report.explanations, "");
}

function renderCards(container, items = [], emptyText) {
  container.innerHTML = "";
  if (!items.length && emptyText) {
    const p = document.createElement("p");
    p.className = "panel-note";
    p.textContent = emptyText;
    container.append(p);
    return;
  }
  items.forEach((item, index) => {
    const article = document.createElement("details");
    article.className = item.issue ? "recommendation-item" : "explanation-item";
    if (item.issue && index === 0) article.open = true;
    const title = item.issue || item.title;
    const body = item.description || item.body || item.evidence;
    const sourceBadge = item.source ? `<em>${item.source}</em>` : "";
    const confidenceBadge = item.confidenceLabel ? `<em>${item.confidenceLabel.replace("Confianza ", "")}</em>` : "";
    const evidence = item.evidence ? `<p><strong>Revisar:</strong> ${item.evidence}</p>` : "";
    const drill = item.drill ? `<p><strong>Drill:</strong> ${item.drill}</p>` : "";
    article.innerHTML = `
      <summary><strong>${title}</strong><span>${item.nextMetric || ""}</span></summary>
      <div class="card-badges">${confidenceBadge}${sourceBadge}<em>Revisable</em></div>
      <p>${body}</p>
      ${evidence}
      ${drill}
    `;
    container.append(article);
  });
}

function renderActionStates() {
  const hasSessionData = Boolean(state.metrics.hasVideo || state.isHistoryOnly);
  const hasPlayableVideo = Boolean(state.videoObjectUrl && state.metrics.hasVideo && !state.isHistoryOnly);
  els.saveSessionBtn.disabled = !hasSessionData || state.isAnalyzing;
  els.exportJsonBtn.disabled = !hasSessionData;
  els.exportCsvBtn.disabled = !hasSessionData;
  els.exportPngBtn.disabled = !hasPlayableVideo;
  els.autoAnalyzeBtn.disabled = !hasPlayableVideo || state.isAnalyzing;
  els.autoBallPathBtn.disabled = !hasPlayableVideo || state.isDetectingBall;
  els.markBallLaunchBtn.disabled = !hasPlayableVideo;
  els.ballFullscreenBtn.disabled = !hasPlayableVideo;
  els.playPauseBtn.disabled = !hasPlayableVideo;
  els.backFrameBtn.disabled = !hasPlayableVideo;
  els.nextFrameBtn.disabled = !hasPlayableVideo;
  els.fullscreenBtn.disabled = !hasPlayableVideo;
  els.frameSlider.disabled = !hasPlayableVideo;
  els.playbackRate.disabled = !hasPlayableVideo;
  els.saveCorrectionBtn.disabled = !state.metrics.eventsComplete;
  document.querySelectorAll("[data-phase-confirm-current]").forEach((button) => {
    button.disabled = !hasPlayableVideo;
  });
  document.querySelectorAll("[data-phase-accept]").forEach((button) => {
    const frame = state.events[button.dataset.phaseAccept];
    button.disabled = !hasPlayableVideo || !Number.isFinite(frame);
  });
  document.querySelectorAll("[data-metric-frame]").forEach((button) => {
    const frame = state.events[button.dataset.metricFrame];
    button.disabled = !hasPlayableVideo || !Number.isFinite(frame);
  });
  document.querySelectorAll("[data-event-jump]").forEach((button) => {
    const frame = state.events[button.dataset.eventJump];
    button.disabled = !hasPlayableVideo || !Number.isFinite(frame);
  });
  const currentEvent = PHASE_SEQUENCE[state.activePhaseIndex];
  if (els.confirmPhaseBtn) els.confirmPhaseBtn.disabled = !hasPlayableVideo;
  if (els.nextPhaseBtn) els.nextPhaseBtn.disabled = !hasPlayableVideo || !Number.isFinite(state.events[currentEvent]);
  if (els.changePhaseBtn) els.changePhaseBtn.disabled = !hasPlayableVideo;
  syncOverlayButtons();
}


function renderLearningCount() {
  if (!els.learningCount) return;
  const total = correctionExampleCount();
  const real = storedCorrectionExampleCount();
  const demo = isDemoLearningEnabled() ? demoCorrectionExampleCount() : 0;
  els.learningCount.textContent = `${real} reales${demo ? ` + ${demo} demo` : ""}`;
  els.learningCount.title = `${total} ejemplos activos en este navegador`;
}

function syncControls() {
  syncCaptureInputs();
  syncMetricControls();
  syncGuideInputs();
  syncOverlayButtons();
}

function syncCaptureInputs() {
  Object.entries(state.captureChecks).forEach(([key, value]) => {
    const input = els.captureChecks.querySelector(`[value="${key}"]`);
    if (input) input.checked = Boolean(value);
  });
  if (state.videoAnalysis) {
    els.captureAutoNote.textContent = `Auto sugerido por vídeo · brillo ${state.videoAnalysis.summary.brightness ?? "-"} · contraste ${state.videoAnalysis.summary.contrast ?? "-"}.`;
  } else if (state.isHistoryOnly) {
    els.captureAutoNote.textContent = "Cargado desde historial; vídeo original no almacenado.";
  } else {
    els.captureAutoNote.textContent = "Automático al analizar; editable.";
  }
}

function syncMetricControls() {
  Object.entries(state.manualMetrics).forEach(([key, value]) => {
    const rounded = Math.round(value);
    if (els.manualMetricInputs[key]) els.manualMetricInputs[key].value = rounded;
    if (els.metricOutputs[key]) els.metricOutputs[key].textContent = rounded;
    if (els.metricHints[key]) els.metricHints[key].textContent = state.metricEvidence[key] || `${METRIC_LABELS[key]} revisable manualmente.`;
  });
}

function syncGuideInputs(sourceInput = null) {
  els.guideControls.forEach((input) => {
    if (input === sourceInput) return;
    const key = input.dataset.guideControl;
    if (key === "x") input.value = Math.round(state.guide.x * 100);
    if (key === "y") input.value = Math.round(state.guide.y * 100);
    if (key === "scale") input.value = Math.round(state.guide.scale * 100);
    if (key === "width") input.value = Math.round((state.guide.width || 1) * 100);
    if (key === "footAngle") input.value = Math.round(state.guide.footAngle || 0);
    if (key === "rotation") input.value = Math.round(state.guide.rotation || 0);
  });
}

function updateGuideFromControl(key, rawValue) {
  const value = Number(rawValue);
  if (key === "x") state.guide.x = value / 100;
  if (key === "y") state.guide.y = value / 100;
  if (key === "scale") state.guide.scale = value / 100;
  if (key === "width") state.guide.width = value / 100;
  if (key === "footAngle") state.guide.footAngle = value;
  if (key === "rotation") state.guide.rotation = value;
}

function defaultGuide() {
  const isPortrait = state.orientation === "vertical";
  return {
    x: 0.5,
    y: isPortrait ? 0.84 : 0.8,
    scale: isPortrait ? 0.96 : 1,
    width: isPortrait ? 0.94 : 1,
    footAngle: 0,
    rotation: state.viewType === "DTL" ? -8 : 0
  };
}

function updateOrientationUi() {
  const { width, height } = state.videoSize;
  const label = state.orientation === "vertical" ? "Vertical" : "Horizontal";
  els.orientationBadge.textContent = `${label} · ${width}x${height}`;
  els.stage.classList.toggle("is-portrait", state.orientation === "vertical");
  if (state.orientation === "vertical") {
    state.guide.y = 0.83;
    syncGuideInputs();
  }
  if (els.videoScreenTitle) els.videoScreenTitle.textContent = state.videoName || "Vídeo cargado";
}

function setMode(mode) {
  els.modeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.mode === mode));
  els.swingWorkspace.classList.toggle("is-hidden", mode !== "swing");
  els.ballWorkspace.classList.toggle("is-hidden", mode !== "ball");
  if (mode === "ball") {
    if (Number.isFinite(state.events.impact)) {
      els.ballVideo.currentTime = state.events.impact / state.fps;
    }
    resizeBallCanvas();
    renderBall();
  }
}


function renderFlowUi() {
  const step = workflowActiveStep();
  const labels = {
    upload: ["Paso 1", "Sube el vídeo", "Empieza con un clip claro del swing. Después la app intentará encajarlo automáticamente.", "Subir vídeo", "Cargar anterior"],
    frame: ["Paso 2", "Encaja el swing", "He aplicado un encaje automático inicial. Ajusta la guía sobre el propio vídeo si cuerpo, bola o plano no quedan bien.", "Encaje correcto", "Recentrar guía"],
    quality: ["Paso 3", "Revisa la calidad", "Marca si el jugador, bola y palo se ven bien. Esto condiciona la confianza de las recomendaciones.", "Calidad revisada", "Ver checks"],
    analyze: ["Paso 4", "Analiza el vídeo", "La app buscará movimiento y sugerirá address, top, impact y finish. Luego podrás confirmar o cambiar cada fase.", "Analizar ahora", "Dibujar primero"],
    events: ["Paso 5", "Confirma las fases", "Toca cualquier fase para ir directo. En cada fase activa puedes aceptar la propuesta o confirmar el frame actual en un solo gesto.", "Confirmar frame actual", "Ver fases"],
    report: ["Paso 6", "Revisa vídeo o métricas", "Puedes quedarte dibujando sobre el swing o bajar al panel de métricas y recomendaciones.", "Ver métricas", "Seguir dibujando"],
    save: ["Paso 7", "Guarda o exporta", "Guarda la sesión con miniatura y cuatro frames clave, o exporta JSON, CSV y PNG.", "Guardar sesión", "Exportar JSON"]
  };
  const [eyebrow, title, text, primary, secondary] = labels[step] || labels.upload;
  if (els.flowStepEyebrow) els.flowStepEyebrow.textContent = eyebrow;
  if (els.flowStepTitle) els.flowStepTitle.textContent = title;
  if (els.flowStepText) els.flowStepText.textContent = text;
  if (els.flowPrimaryAction) els.flowPrimaryAction.textContent = primary;
  if (els.flowSecondaryAction) els.flowSecondaryAction.textContent = secondary;
  els.homeScreen?.classList.toggle("is-collapsed", Boolean(state.videoObjectUrl || state.isHistoryOnly));
  els.swingWorkspace?.classList.toggle("has-video", Boolean(state.videoObjectUrl));
  document.body.dataset.flowStep = step;
}

function handleFlowPrimaryAction() {
  const step = workflowActiveStep();
  if (step === "upload") return els.videoInput?.click();
  if (step === "frame") {
    autoFitGuide();
    state.flowStep = "quality";
    els.analysisStatus.textContent = "Encaje confirmado. Revisa ahora la calidad de captura.";
    updateAnalysis();
    return;
  }
  if (step === "quality") {
    state.flowStep = "analyze";
    els.analysisStatus.textContent = "Calidad revisada. Ya puedes analizar el vídeo.";
    updateAnalysis();
    return;
  }
  if (step === "analyze") return runAutoAnalysis();
  if (step === "events") return confirmPhaseAtCurrentFrame(true);
  if (step === "report") return document.querySelector(".report-rail")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (step === "save") return els.saveSessionBtn?.click();
}

function handleFlowSecondaryAction() {
  const step = workflowActiveStep();
  if (step === "upload") return document.querySelector("#historyPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (step === "frame") {
    autoFitGuide(true);
    return;
  }
  if (step === "quality") return els.captureChecks?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (step === "analyze") {
    setOverlayTool("line");
    els.analysisStatus.textContent = "Herramienta línea activada. Dibuja sobre el vídeo y analiza después.";
    return;
  }
  if (step === "events") return els.eventGrid?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (step === "report") return els.stage?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (step === "save") return els.exportJsonBtn?.click();
}

function moveFlowBack() {
  const step = workflowActiveStep();
  const index = FLOW_STEPS.indexOf(step);
  if (index <= 0) return;
  state.flowStep = FLOW_STEPS[index - 1];
  if (state.flowStep === "events" && state.videoAnalysis) focusCurrentPhase();
  updateAnalysis();
}

function autoFitGuide(force = false) {
  if (!state.videoObjectUrl && !force) return;
  const isPortrait = state.orientation === "vertical";
  state.guide = defaultGuide();
  syncGuideInputs();
  overlay.render();
  els.analysisStatus.textContent = "Encaje automático aplicado. Ajusta los sliders si la guía no coincide con cuerpo, bola o plano.";
}

function currentPhaseName() {
  return PHASE_SEQUENCE[state.activePhaseIndex] || "address";
}

function focusCurrentPhase() {
  const eventName = currentPhaseName();
  const frame = state.events[eventName];
  if (Number.isFinite(frame) && state.videoObjectUrl) player.seekFrame(frame);
  renderPhaseCoach();
}

function renderPhaseCoach() {
  if (!els.phaseReviewPanel) return;
  const shouldShow = Boolean(state.videoObjectUrl && (state.videoAnalysis || workflowActiveStep() === "events"));
  els.phaseReviewPanel.classList.toggle("is-dimmed", !shouldShow);
  const eventName = currentPhaseName();
  const label = EVENT_LABELS[eventName] || eventName;
  const reviewed = Object.values(state.reviewedEvents || {}).filter(Boolean).length;
  if (els.phaseProgressLabel) els.phaseProgressLabel.textContent = `Fase ${state.activePhaseIndex + 1}/4 · ${reviewed} confirmadas`;
  if (els.phaseCoachTitle) els.phaseCoachTitle.textContent = `Revisar ${label}`;
  const frame = state.events[eventName];
  if (els.phaseCoachText) {
    els.phaseCoachText.textContent = Number.isFinite(frame)
      ? `Propuesta: frame ${frame}. Los controles aparecen solo en la tarjeta activa. Si has buscado otro punto, pulsa “Confirmar frame actual” y queda marcado/confirmado a la vez.`
      : `Sin propuesta para ${label}. Busca el punto correcto en el vídeo y usa “Confirmar frame actual” en la tarjeta activa.`;
  }
}

function acceptCurrentPhaseProposal(advance = true) {
  const eventName = currentPhaseName();
  if (!Number.isFinite(state.events[eventName])) return;
  state.reviewedEvents[eventName] = true;
  if (!state.eventMeta[eventName]) state.eventMeta[eventName] = {};
  state.eventMeta[eventName].reviewed = true;
  state.eventMeta[eventName].accepted = true;
  els.analysisStatus.textContent = `${EVENT_LABELS[eventName]} confirmado con la propuesta de la app.`;
  advanceAfterPhase(advance);
}

function confirmPhaseAtCurrentFrame(advance = true) {
  const eventName = currentPhaseName();
  if (!state.videoObjectUrl || !state.metrics.hasVideo) return;
  state.events[eventName] = state.currentFrame;
  state.eventMeta[eventName] = { source: "manual", confidence: 96, note: "Frame confirmado por el usuario", reviewed: true, accepted: false };
  state.reviewedEvents[eventName] = true;
  els.analysisStatus.textContent = `${EVENT_LABELS[eventName]} marcado y confirmado en el frame ${state.currentFrame}.`;
  advanceAfterPhase(advance);
}

function advanceAfterPhase(advance) {
  if (advance) {
    const next = PHASE_SEQUENCE.findIndex((name, index) => index > state.activePhaseIndex && !state.reviewedEvents[name]);
    if (next >= 0) {
      state.activePhaseIndex = next;
      updateAnalysis();
      focusCurrentPhase();
      return;
    }
    state.flowStep = "report";
    els.analysisStatus.textContent = "Fases confirmadas. Puedes revisar métricas o seguir dibujando sobre el vídeo.";
  }
  updateAnalysis();
}

function changeCurrentPhaseToCurrentFrame() {
  const eventName = currentPhaseName();
  markEvent(eventName);
  els.analysisStatus.textContent = `${EVENT_LABELS[eventName]} preparado en el frame actual. Pulsa confirmar para dejarlo revisado.`;
  renderPhaseCoach();
}

function allEventsReviewed() {
  return PHASE_SEQUENCE.every((name) => Number.isFinite(state.events[name]) && state.reviewedEvents[name]);
}

async function detectBallPath() {
  if (!state.videoObjectUrl || state.isDetectingBall) return;
  state.isDetectingBall = true;
  els.autoBallPathBtn.disabled = true;
  els.ballPathStatus.textContent = "Detectando bola en el vídeo...";
  try {
    const sourceVideo = els.ballVideo.readyState >= 1 ? els.ballVideo : els.video;
    const result = await detectBallTrajectory(sourceVideo, {
      fps: state.fps,
      impactFrame: state.events.impact,
      duration: state.duration,
      result: state.ballResult,
      launchPoint: launchPointFromGuide(),
      onProgress: (progress) => {
        els.ballPathStatus.textContent = `Detectando bola... ${progress}%`;
      }
    });
    state.ballPath = result.points;
    state.ballPathAuto = true;
    state.ballPathMeta = {
      source: result.source,
      confidence: result.confidence,
      detections: result.detections?.length || 0
    };
    els.ballPathStatus.textContent = result.summary;
    if (Number.isFinite(state.events.impact)) {
      els.ballVideo.currentTime = Math.max(0, state.events.impact / state.fps - 0.1);
    }
  } catch (error) {
    suggestBallPath();
    els.ballPathStatus.textContent = "No se pudo detectar con claridad; dejé una trayectoria editable.";
  } finally {
    state.isDetectingBall = false;
    renderActionStates();
    renderBall();
  }
}

function suggestBallPath() {
  if (!state.videoObjectUrl) return;
  const curve = ballCurveForResult(state.ballResult);
  const launch = launchPointFromGuide();
  const impactTime = Number.isFinite(state.events.impact) ? state.events.impact / state.fps : state.duration * 0.55;
  state.ballPath = [
    { x: launch.x, y: launch.y, time: impactTime },
    { x: launch.x + 0.1 + curve.start, y: launch.y - 0.16, time: impactTime + 0.22 },
    { x: launch.x + 0.22 + curve.mid, y: launch.y - 0.34, time: impactTime + 0.55 },
    { x: launch.x + 0.38 + curve.end, y: launch.y - 0.46, time: impactTime + 0.9 }
  ].map((point) => ({ ...point, x: clamp(point.x, 0.04, 0.96), y: clamp(point.y, 0.04, 0.92) }));
  state.ballPathAuto = true;
  state.ballPathMeta = { source: "fallback", confidence: 38, detections: 0 };
  els.ballPathStatus.textContent = "Trayectoria sugerida por resultado. Arrastra puntos si la bola real va por otro sitio.";
  renderBall();
}

function renderBall() {
  resizeBallCanvas();
  const label = state.ballPathAuto ? state.ballPathMeta?.source === "vision" ? "Detectado" : "Sugerido" : state.ballPath.length ? "Manual" : "Sin camino";
  els.ballPathLabel.textContent = label;
  renderBallLaunch();
  els.ballPathSummary.textContent = state.ballPath.length
    ? `${state.ballPath.length} puntos. ${state.ballPathMeta?.detections ?? 0} detecciones reales. Resultado: ${ballResultLabel(state.ballResult)}.`
    : state.ballLaunchPoint
      ? "Salida marcada. Pulsa Detectar bola para crear la trayectoria."
      : "Marca la salida o usa Detectar bola con la guía actual.";
  const visiblePath = state.ballPath.length ? state.ballPath : state.ballLaunchPoint ? [{ ...state.ballLaunchPoint }] : [];
  drawBallPath(els.ballCanvas.getContext("2d"), els.ballCanvas.width, els.ballCanvas.height, visiblePath, state.ballPath.length ? ballResultLabel(state.ballResult) : "Salida", {
    currentTime: els.ballVideo.currentTime,
    videoWidth: state.videoSize.width,
    videoHeight: state.videoSize.height,
    editable: true
  });
}

function renderBallLaunch() {
  if (!els.ballLaunchLabel) return;
  if (state.ballLaunchPoint) {
    els.ballLaunchLabel.textContent = `Salida marcada · x ${Math.round(state.ballLaunchPoint.x * 100)} / y ${Math.round(state.ballLaunchPoint.y * 100)}.`;
    return;
  }
  const guideLaunch = launchPointFromGuide();
  els.ballLaunchLabel.textContent = `Salida no marcada. Se usará la guía · x ${Math.round(guideLaunch.x * 100)} / y ${Math.round(guideLaunch.y * 100)}.`;
}

function resizeBallCanvas() {
  const rect = els.ballStage.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  els.ballCanvas.width = Math.max(1, Math.round(rect.width * scale));
  els.ballCanvas.height = Math.max(1, Math.round(rect.height * scale));
}

function launchPointFromGuide() {
  if (state.ballLaunchPoint) return state.ballLaunchPoint;
  return {
    x: clamp(state.guide.x + (state.viewType === "FO" ? 0.04 : 0.08), 0.08, 0.92),
    y: clamp(state.guide.y - 0.04, 0.12, 0.9)
  };
}

function pointerToVideoPoint(event) {
  const rect = getBallVideoRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x < -0.04 || x > 1.04 || y < -0.04 || y > 1.04) return null;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

function nearestBallPoint(point, stageRect) {
  if (!state.ballPath.length) return null;
  const videoRect = getBallVideoRect();
  const threshold = Math.max(24, stageRect.width * 0.035);
  let best = null;
  let bestDistance = Infinity;
  state.ballPath.forEach((candidate, index) => {
    const dx = videoRect.left + candidate.x * videoRect.width - (videoRect.left + point.x * videoRect.width);
    const dy = videoRect.top + candidate.y * videoRect.height - (videoRect.top + point.y * videoRect.height);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return bestDistance <= threshold ? best : null;
}

function getBallVideoRect() {
  const stageRect = els.ballStage.getBoundingClientRect();
  const width = state.videoSize.width || els.ballVideo.videoWidth || 16;
  const height = state.videoSize.height || els.ballVideo.videoHeight || 9;
  const videoRatio = width / height;
  const stageRatio = stageRect.width / stageRect.height;
  if (videoRatio > stageRatio) {
    const drawHeight = stageRect.width / videoRatio;
    return {
      left: stageRect.left,
      top: stageRect.top + (stageRect.height - drawHeight) / 2,
      width: stageRect.width,
      height: drawHeight
    };
  }
  const drawWidth = stageRect.height * videoRatio;
  return {
    left: stageRect.left + (stageRect.width - drawWidth) / 2,
    top: stageRect.top,
    width: drawWidth,
    height: stageRect.height
  };
}

function nextManualBallTime() {
  if (Number.isFinite(els.ballVideo.currentTime) && els.ballVideo.currentTime > 0) return Number(els.ballVideo.currentTime.toFixed(3));
  const last = state.ballPath[state.ballPath.length - 1];
  if (last?.time != null) return Number((last.time + 0.22).toFixed(3));
  return Number(((Number.isFinite(state.events.impact) ? state.events.impact / state.fps : state.duration * 0.55) || 0).toFixed(3));
}

function startBallAnimation() {
  stopBallAnimation();
  const tick = () => {
    renderBall();
    if (!els.ballVideo.paused && !els.ballVideo.ended) {
      ballAnimationFrame = requestAnimationFrame(tick);
    }
  };
  ballAnimationFrame = requestAnimationFrame(tick);
}

function stopBallAnimation() {
  if (ballAnimationFrame) cancelAnimationFrame(ballAnimationFrame);
  ballAnimationFrame = 0;
  renderBall();
}

async function buildSession(options = {}) {
  const now = state.createdAt || new Date().toISOString();
  let frameSnapshots = state.frameSnapshots || {};
  let thumbnail = state.thumbnail || null;
  if (options.includeFrameSnapshots && state.videoObjectUrl) {
    const captured = await captureFrameSnapshots();
    frameSnapshots = captured.frameSnapshots;
    thumbnail = captured.thumbnail;
    state.frameSnapshots = frameSnapshots;
    state.thumbnail = thumbnail;
  }

  return {
    id: state.id || `swing_${Date.now()}`,
    appVersion: APP_VERSION,
    createdAt: now,
    mediaStatus: {
      hasStoredVideo: false,
      hasFrameSnapshots: Object.keys(frameSnapshots || {}).length > 0,
      note: "El MVP v0.5.5 guarda datos, miniatura y frames principales; por privacidad y peso no guarda el vídeo completo."
    },
    thumbnail,
    frameSnapshots,
    video: {
      fileName: state.videoName,
      durationSec: Number((state.duration || 0).toFixed(3)),
      fps: state.fps,
      totalFrames: state.totalFrames,
      orientation: state.orientation,
      width: state.videoSize.width,
      height: state.videoSize.height
    },
    club: state.club,
    viewType: state.viewType,
    ballResult: state.ballResult,
    captureChecks: state.captureChecks,
    events: Object.fromEntries(
      Object.entries(state.events).map(([key, frame]) => [
        key,
        {
          frame,
          timestamp: Number.isFinite(frame) ? Number((frame / state.fps).toFixed(3)) : null,
          confidence: state.eventMeta[key]?.confidence ?? 0,
          source: state.eventMeta[key]?.source ?? "unknown"
        }
      ])
    ),
    guide: state.guide,
    manualMetrics: state.manualMetrics,
    metricEvidence: state.metricEvidence,
    metrics: state.metrics,
    recommendations: state.report.recommendations,
    explanations: state.report.explanations,
    primaryIssue: state.report.primaryIssue,
    drill: state.report.drill,
    ballLaunchPoint: state.ballLaunchPoint,
    ballPath: state.ballPath,
    ballPathMeta: state.ballPathMeta,
    overlayDrawings: overlay.serialize(),
    analysisSummary: state.videoAnalysis?.summary || null
  };
}

async function captureFrameSnapshots() {
  const frameSnapshots = {};
  if (!state.videoObjectUrl || !els.video.videoWidth || !els.video.videoHeight) {
    return { frameSnapshots, thumbnail: null };
  }

  const wasPaused = els.video.paused;
  const originalTime = els.video.currentTime;
  els.video.pause();

  const maxWidth = 560;
  const ratio = els.video.videoWidth / Math.max(1, els.video.videoHeight);
  const width = Math.min(maxWidth, els.video.videoWidth);
  const height = Math.round(width / ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  for (const eventName of Object.keys(EVENT_LABELS)) {
    const frame = state.events[eventName];
    if (!Number.isFinite(frame)) continue;
    await seekVideoForSnapshot(frame / state.fps);
    ctx.drawImage(els.video, 0, 0, width, height);
    ctx.fillStyle = "rgba(15, 23, 22, 0.72)";
    ctx.fillRect(0, height - 34, width, 34);
    ctx.fillStyle = "#fffaf0";
    ctx.font = "700 18px system-ui, sans-serif";
    ctx.fillText(`${EVENT_LABELS[eventName]} · frame ${frame}`, 14, height - 11);
    frameSnapshots[eventName] = {
      label: EVENT_LABELS[eventName],
      frame,
      timestamp: Number((frame / state.fps).toFixed(3)),
      dataUrl: canvas.toDataURL("image/jpeg", 0.78)
    };
  }

  await seekVideoForSnapshot(originalTime);
  if (!wasPaused) els.video.play().catch(() => {});
  player.syncFromVideo();
  overlay.render();

  const thumbnail = frameSnapshots.impact?.dataUrl || frameSnapshots.address?.dataUrl || Object.values(frameSnapshots)[0]?.dataUrl || null;
  return { frameSnapshots, thumbnail };
}

function seekVideoForSnapshot(time) {
  return new Promise((resolve) => {
    const safeTime = clamp(time || 0, 0, Math.max(0, state.duration - 0.02));
    const done = () => {
      els.video.removeEventListener("seeked", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(done, 500);
    els.video.addEventListener("seeked", done, { once: true });
    els.video.currentTime = safeTime;
  });
}

async function renderHistory() {
  const sessions = await listSessions();
  els.historyList.innerHTML = "";
  if (!sessions.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Todavía no hay sesiones guardadas.";
    els.historyList.append(empty);
    return;
  }

  sessions.slice(0, 6).forEach((session) => {
    const item = els.historyItemTemplate.content.firstElementChild.cloneNode(true);
    const thumb = item.querySelector("img");
    const savedFrames = Object.keys(session.frameSnapshots || {}).length;
    if (session.thumbnail && thumb) {
      thumb.src = session.thumbnail;
      thumb.hidden = false;
    }
    item.querySelector("strong").textContent = `${session.club} · ${session.viewType} · ${session.metrics?.overallScore ?? 0}`;
    item.querySelector("span").textContent = new Date(session.createdAt).toLocaleString();
    item.querySelector("small").textContent = savedFrames
      ? `${savedFrames} frames guardados · recargar vídeo para revisar movimiento`
      : "Datos guardados · sin vídeo almacenado";
    item.querySelector("button").addEventListener("click", () => loadSession(session.id));
    els.historyList.append(item);
  });
}

async function loadSession(id) {
  const session = await getSession(id);
  if (!session) return;
  state.id = session.id;
  state.createdAt = session.createdAt;
  state.flowStep = "save";
  state.activePhaseIndex = 0;
  state.reviewedEvents = {};
  state.isHistoryOnly = true;
  state.videoObjectUrl = "";
  state.thumbnail = session.thumbnail || null;
  state.frameSnapshots = session.frameSnapshots || {};
  els.video.pause();
  els.video.removeAttribute("src");
  els.video.load();
  els.ballVideo.pause();
  els.ballVideo.removeAttribute("src");
  els.ballVideo.load();
  player.objectUrl = "";
  finalizedVideoObjectUrl = "";
  state.videoName = session.video?.fileName || "";
  state.duration = session.video?.durationSec || 0;
  state.totalFrames = session.video?.totalFrames || 0;
  state.orientation = session.video?.orientation || "none";
  state.videoSize = { width: session.video?.width || 0, height: session.video?.height || 0 };
  state.fps = session.video?.fps || 60;
  state.viewType = session.viewType;
  state.club = session.club;
  state.ballResult = session.ballResult;
  state.captureChecks = session.captureChecks || state.captureChecks;
  state.manualMetrics = session.manualMetrics || state.manualMetrics;
  state.metricEvidence = session.metricEvidence || {};
  state.guide = session.guide || state.guide;
  state.ballLaunchPoint = session.ballLaunchPoint || null;
  state.ballPath = session.ballPath || [];
  state.ballPathMeta = session.ballPathMeta || null;
  state.ballPathAuto = Boolean(session.ballPathMeta);
  state.events = Object.fromEntries(Object.entries(session.events || {}).map(([key, value]) => [key, value.frame]));
  state.eventMeta = Object.fromEntries(Object.entries(session.events || {}).map(([key, value]) => [key, { confidence: value.confidence, source: value.source }]));
  els.fpsInput.value = state.fps;
  els.videoFileName.textContent = state.videoName || "Vídeo original no almacenado";
  els.emptyStage.style.display = "grid";
  els.ballEmptyStage.style.display = "grid";
  if (state.thumbnail) {
    const preview = els.emptyStage.querySelector("img");
    if (preview) preview.src = state.thumbnail;
  }
  updateOrientationUi();
  els.viewType.value = state.viewType;
  els.club.value = state.club;
  els.ballResult.value = state.ballResult;
  syncControls();
  overlay.load(session.overlayDrawings || []);
  updateAnalysis();
  renderBall();
  setAppStatus("history");
  els.analysisStatus.textContent = "Sesión histórica cargada. Los datos están disponibles; recarga el vídeo original para analizar o exportar PNG.";
}

function requestFullscreen(element) {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    element.requestFullscreen?.();
  }
}

function phaseDescription(eventName) {
  return {
    address: "Setup inicial",
    top: "Punto alto",
    impact: "Contacto",
    finish: "Final"
  }[eventName];
}

function ballCurveForResult(result) {
  return {
    draw: { start: -0.04, mid: -0.02, end: 0.05 },
    fade: { start: 0.04, mid: 0.02, end: -0.05 },
    slice: { start: 0.05, mid: 0.08, end: 0.18 },
    hook: { start: -0.05, mid: -0.08, end: -0.18 },
    push: { start: 0.06, mid: 0.08, end: 0.1 },
    pull: { start: -0.06, mid: -0.08, end: -0.1 },
    straight: { start: 0, mid: 0, end: 0 }
  }[result] || { start: 0.02, mid: 0.03, end: 0.04 };
}

function ballResultLabel(result) {
  return {
    unknown: "Sin resultado",
    straight: "Recta",
    draw: "Draw",
    fade: "Fade",
    push: "Push",
    pull: "Pull",
    slice: "Slice",
    hook: "Hook",
    fat: "Pesada",
    thin: "Filada",
    top: "Topada"
  }[result] || "Resultado";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("./service-worker.js").then((registration) => {
    const notifyUpdate = () => els.refreshAppBtn?.classList.remove("is-hidden");
    if (registration.waiting) notifyUpdate();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) notifyUpdate();
      });
    });
  }).catch(() => {});
}
