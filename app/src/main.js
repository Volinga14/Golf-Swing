import { VideoPlayer, formatTime } from "./video-player.js";
import { OverlayCanvas, drawBallPath } from "./overlays.js";
import { calculateMetrics, metricRows } from "./metrics.js";
import { buildRecommendations } from "./recommendations.js";
import { downloadCsv, downloadJson, downloadPng } from "./export.js";
import { getSession, listSessions, saveSession } from "./storage.js";
import { analyzeVideo } from "./video-analysis.js";
import { detectBallTrajectory } from "./ball-tracking.js";
import { blendAnalysisWithLearning, correctionExampleCount, findLearningMatch, saveCorrectionExample } from "./learning.js";

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
  swingWorkspace: document.querySelector("#swingWorkspace"),
  ballWorkspace: document.querySelector("#ballWorkspace"),
  prepPanel: document.querySelector("#prepPanel"),
  videoInput: document.querySelector("#videoInput"),
  videoFileName: document.querySelector("#videoFileName"),
  video: document.querySelector("#swingVideo"),
  stage: document.querySelector("#stage"),
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
    scale: document.querySelector("#guideScale")
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
  autoBallPathBtn: document.querySelector("#autoBallPathBtn"),
  clearBallPathBtn: document.querySelector("#clearBallPathBtn"),
  ballFullscreenBtn: document.querySelector("#ballFullscreenBtn"),
  ballPathLabel: document.querySelector("#ballPathLabel"),
  ballPathStatus: document.querySelector("#ballPathStatus"),
  ballPathSummary: document.querySelector("#ballPathSummary")
};

const state = {
  id: null,
  videoName: "",
  createdAt: null,
  videoObjectUrl: "",
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
    scale: 1
  },
  overlay: {
    guide: true,
    events: true,
    grid: false
  },
  ballPath: [],
  ballPathAuto: false,
  ballPathMeta: null,
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

const ballResizeObserver = new ResizeObserver(() => resizeBallCanvas());
ballResizeObserver.observe(els.ballStage);

setupPreparationPanel();
bindEvents();
syncControls();
renderLearningCount();
updateAnalysis();
renderHistory();
registerServiceWorker();

function setupPreparationPanel() {
  if (!els.prepPanel) return;
  const uploadPanel = els.videoInput?.closest(".panel");
  const sessionPanel = els.orientationBadge?.closest(".panel");
  const capturePanel = els.captureChecks?.closest(".panel");
  const guidePanel = els.guideInputs.x?.closest(".panel");
  [
    [uploadPanel, "prep-upload"],
    [sessionPanel, "prep-session"],
    [capturePanel, "prep-capture"],
    [guidePanel, "prep-guide"]
  ].forEach(([panel, className]) => {
    if (!panel) return;
    panel.classList.add(className);
    els.prepPanel.append(panel);
  });

  if (guidePanel && !guidePanel.querySelector(".guide-help")) {
    const details = document.createElement("details");
    details.className = "guide-help";
    details.innerHTML = `
      <summary>Cómo colocar la guía</summary>
      <div>
        <img src="./assets/swing-guide.svg" alt="" />
        <p>Coloca la línea baja sobre los pies o la alfombra. En DTL, la diagonal sigue el plano aproximado del palo. En face-on, las líneas verticales ayudan a ver desplazamiento del cuerpo.</p>
      </div>
    `;
    guidePanel.append(details);
  }
}

function bindEvents() {
  els.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.videoInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.videoName = file.name;
    state.id = null;
    state.createdAt = null;
    state.videoAnalysis = null;
    state.ballPath = [];
    state.ballPathAuto = false;
    state.ballPathMeta = null;
    state.events = { address: null, top: null, impact: null, finish: null };
    state.eventMeta = {};
    state.captureChecks = { frame: false, light: false, stable: false, ball: false, club: false, fps: false };
    syncCaptureInputs();
    els.videoFileName.textContent = file.name;
    els.emptyStage.style.display = "none";
    els.ballEmptyStage.style.display = "none";
    els.analysisStatus.textContent = "Vídeo cargando. Ajusta la guía antes de analizar.";
    els.ballPathStatus.textContent = "La trayectoria aparece después de detectar la bola.";
    player.load(file);
  });

  els.video.addEventListener("loadedmetadata", async () => {
    state.duration = player.duration;
    state.totalFrames = player.totalFrames;
    state.videoObjectUrl = player.objectUrl;
    state.videoSize = { width: els.video.videoWidth, height: els.video.videoHeight };
    state.orientation = els.video.videoWidth >= els.video.videoHeight ? "horizontal" : "vertical";
    els.ballVideo.src = state.videoObjectUrl;
    els.ballVideo.load();
    updateOrientationUi();
    clearDetectedEvents();
    updateAnalysis();
    overlay.render();
    const learningMatch = findLearningMatch(state);
    els.analysisStatus.textContent = learningMatch
      ? `Vídeo listo. Hay una corrección parecida guardada: ${learningMatch.example.label}. Ajusta la guía y pulsa Analizar.`
      : "Vídeo listo. Ajusta encuadre, guía y capture score si hace falta; después pulsa Analizar.";
  });

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

  els.eventGrid.addEventListener("click", (event) => {
    const jumpButton = event.target.closest("[data-event-jump]");
    const markButton = event.target.closest("[data-event-mark]");
    if (jumpButton) jumpToEvent(jumpButton.dataset.eventJump);
    if (markButton) markEvent(markButton.dataset.eventMark);
  });

  els.toolButtons.forEach((button) => {
    button.addEventListener("click", () => {
      els.toolButtons.forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      overlay.setTool(button.dataset.tool);
    });
  });

  els.clearMarksBtn.addEventListener("click", () => overlay.clear());
  els.toggleGuide.addEventListener("change", () => {
    state.overlay.guide = els.toggleGuide.checked;
    overlay.render();
  });
  els.toggleEvents.addEventListener("change", () => {
    state.overlay.events = els.toggleEvents.checked;
    overlay.render();
  });
  els.toggleGrid.addEventListener("change", () => {
    state.overlay.grid = els.toggleGrid.checked;
    overlay.render();
  });

  Object.entries(els.guideInputs).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      if (key === "x") state.guide.x = Number(input.value) / 100;
      if (key === "y") state.guide.y = Number(input.value) / 100;
      if (key === "scale") state.guide.scale = Number(input.value) / 100;
      overlay.render();
    });
  });
  els.centerGuideBtn.addEventListener("click", () => {
    state.guide = { x: 0.5, y: state.orientation === "vertical" ? 0.83 : 0.8, scale: 1 };
    syncGuideInputs();
    overlay.render();
  });

  els.saveSessionBtn.addEventListener("click", async () => {
    const session = buildSession();
    await saveSession(session);
    state.id = session.id;
    await renderHistory();
  });

  els.exportJsonBtn.addEventListener("click", () => downloadJson("swing-analysis.json", buildSession()));
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

async function runAutoAnalysis() {
  if (!state.videoObjectUrl || !state.duration) return;
  const token = (analysisToken += 1);
  state.isAnalyzing = true;
  els.autoAnalyzeBtn.disabled = true;
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
    const learning = analysis.summary.learningMatch ? ` Base local: ${analysis.summary.learningMatch}.` : "";
    els.analysisStatus.textContent = `Análisis completado. Señal de movimiento: ${analysis.summary.signal}/100 aprox.${learning}`;
    const firstFrame = state.events.address;
    if (Number.isFinite(firstFrame)) player.seekFrame(firstFrame);
  } catch (error) {
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
  renderEvents();
}

function markEvent(eventName) {
  if (!state.metrics.hasVideo) return;
  state.events[eventName] = state.currentFrame;
  state.eventMeta[eventName] = { source: "manual", confidence: 95, note: "Marcado por el usuario" };
  renderEvents();
  updateAnalysis();
  overlay.render();
}

function jumpToEvent(eventName) {
  const frame = state.events[eventName];
  if (Number.isFinite(frame)) player.seekFrame(frame);
}

function renderEvents() {
  els.eventGrid.querySelectorAll("[data-event-card]").forEach((card) => {
    const eventName = card.dataset.eventCard;
    const frame = state.events[eventName];
    const strong = card.querySelector("strong");
    const small = card.querySelector("small");
    const meta = state.eventMeta[eventName];
    card.classList.toggle("is-set", Number.isFinite(frame));
    const sourceLabel = {
      manual: "Manual",
      aprendizaje: "Base local",
      auto: "Auto",
      estimado: "Estimado"
    }[meta?.source] || "Auto";
    strong.textContent = Number.isFinite(frame) ? `${frame} · ${formatTime(frame / state.fps)}` : "Sin detectar";
    small.textContent = Number.isFinite(frame)
      ? `${sourceLabel} · ${meta?.confidence ?? 0}%`
      : phaseDescription(eventName);
  });
}

function updateAnalysis() {
  state.fps = Number(els.fpsInput.value) || 60;
  state.metrics = calculateMetrics(state);
  state.report = buildRecommendations(state, state.metrics);
  renderEvents();
  renderReport();
  renderActionStates();
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
  els.confidenceBadge.textContent = report.confidenceLabel;
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
  items.forEach((item) => {
    const article = document.createElement("details");
    article.className = item.issue ? "recommendation-item" : "explanation-item";
    const title = item.issue || item.title;
    const body = item.description || item.body || item.evidence;
    const evidence = item.evidence ? `<p><strong>Revisar:</strong> ${item.evidence}</p>` : "";
    const drill = item.drill ? `<p><strong>Drill:</strong> ${item.drill}</p>` : "";
    article.innerHTML = `
      <summary><strong>${title}</strong><span>${item.nextMetric || ""}</span></summary>
      <p>${body}</p>
      ${evidence}
      ${drill}
    `;
    container.append(article);
  });
}

function renderActionStates() {
  const canExport = state.metrics.hasVideo;
  els.saveSessionBtn.disabled = !canExport;
  els.exportJsonBtn.disabled = !canExport;
  els.exportCsvBtn.disabled = !canExport;
  els.exportPngBtn.disabled = !canExport;
  els.autoAnalyzeBtn.disabled = !canExport || state.isAnalyzing;
  els.autoBallPathBtn.disabled = !canExport || state.isDetectingBall;
  els.saveCorrectionBtn.disabled = !state.metrics.eventsComplete;
  document.querySelectorAll("[data-event-mark]").forEach((button) => {
    button.disabled = !canExport;
  });
  document.querySelectorAll("[data-event-jump]").forEach((button) => {
    const frame = state.events[button.dataset.eventJump];
    button.disabled = !Number.isFinite(frame);
  });
}

function renderLearningCount() {
  if (!els.learningCount) return;
  const count = correctionExampleCount();
  els.learningCount.textContent = `${count} ${count === 1 ? "ejemplo" : "ejemplos"}`;
}

function syncControls() {
  syncCaptureInputs();
  syncMetricControls();
  syncGuideInputs();
}

function syncCaptureInputs() {
  Object.entries(state.captureChecks).forEach(([key, value]) => {
    const input = els.captureChecks.querySelector(`[value="${key}"]`);
    if (input) input.checked = Boolean(value);
  });
  if (state.videoAnalysis) {
    els.captureAutoNote.textContent = `Auto sugerido por vídeo · brillo ${state.videoAnalysis.summary.brightness ?? "-"} · contraste ${state.videoAnalysis.summary.contrast ?? "-"}.`;
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

function syncGuideInputs() {
  els.guideInputs.x.value = Math.round(state.guide.x * 100);
  els.guideInputs.y.value = Math.round(state.guide.y * 100);
  els.guideInputs.scale.value = Math.round(state.guide.scale * 100);
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
  els.ballPathSummary.textContent = state.ballPath.length
    ? `${state.ballPath.length} puntos. ${state.ballPathMeta?.detections ?? 0} detecciones reales. Resultado: ${ballResultLabel(state.ballResult)}.`
    : "Sube un vídeo y usa Detectar bola o marca puntos manuales.";
  drawBallPath(els.ballCanvas.getContext("2d"), els.ballCanvas.width, els.ballCanvas.height, state.ballPath, ballResultLabel(state.ballResult), {
    currentTime: els.ballVideo.currentTime,
    videoWidth: state.videoSize.width,
    videoHeight: state.videoSize.height,
    editable: true
  });
}

function resizeBallCanvas() {
  const rect = els.ballStage.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  els.ballCanvas.width = Math.max(1, Math.round(rect.width * scale));
  els.ballCanvas.height = Math.max(1, Math.round(rect.height * scale));
}

function launchPointFromGuide() {
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

function buildSession() {
  const now = state.createdAt || new Date().toISOString();
  return {
    id: state.id || `swing_${Date.now()}`,
    createdAt: now,
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
    ballPath: state.ballPath,
    ballPathMeta: state.ballPathMeta,
    overlayDrawings: overlay.serialize(),
    analysisSummary: state.videoAnalysis?.summary || null
  };
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
    item.querySelector("strong").textContent = `${session.club} · ${session.viewType} · ${session.metrics?.overallScore ?? 0}`;
    item.querySelector("span").textContent = new Date(session.createdAt).toLocaleString();
    item.querySelector("button").addEventListener("click", () => loadSession(session.id));
    els.historyList.append(item);
  });
}

async function loadSession(id) {
  const session = await getSession(id);
  if (!session) return;
  state.id = session.id;
  state.createdAt = session.createdAt;
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
  state.ballPath = session.ballPath || [];
  state.ballPathMeta = session.ballPathMeta || null;
  state.ballPathAuto = Boolean(session.ballPathMeta);
  state.events = Object.fromEntries(Object.entries(session.events || {}).map(([key, value]) => [key, value.frame]));
  state.eventMeta = Object.fromEntries(Object.entries(session.events || {}).map(([key, value]) => [key, { confidence: value.confidence, source: value.source }]));
  els.fpsInput.value = state.fps;
  els.viewType.value = state.viewType;
  els.club.value = state.club;
  els.ballResult.value = state.ballResult;
  syncControls();
  overlay.load(session.overlayDrawings || []);
  updateAnalysis();
  renderBall();
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
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}
