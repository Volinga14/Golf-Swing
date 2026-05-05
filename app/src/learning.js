const STORAGE_KEY = "swingLabAi.correctionExamples.v1";
const DEMO_MODE_KEY = "swingLabAi.demoLearningMode.v1";

const DEMO_EXAMPLES = [
  {
    id: "demo-vertical-dtl-manual",
    label: "Demo DTL vertical corregido",
    fileNameIncludes: "",
    fps: 60,
    duration: 3.5,
    totalFrames: 210,
    width: 478,
    height: 850,
    orientation: "vertical",
    viewType: "DTL",
    captureChecks: { frame: true, light: false, stable: true, ball: true, club: true, fps: true },
    metrics: {
      headStability: 78,
      postureRetention: 62,
      handPath: 66,
      finishBalance: 78,
      evidence: {
        headStability: "Demo local: cabeza razonablemente estable entre address y top.",
        postureRetention: "Demo local: revisar impacto; posible pérdida de postura antes del contacto.",
        handPath: "Demo local: transición jugable, revisar plano con línea DTL.",
        finishBalance: "Demo local: finish equilibrado y sostenido."
      }
    },
    events: {
      address: { frame: 80, time: 1.33, ratio: 0.38095 },
      top: { frame: 138, time: 2.3, ratio: 0.65714 },
      impact: { frame: 155, time: 2.58, ratio: 0.7381 },
      finish: { frame: 188, time: 3.13, ratio: 0.89524 }
    }
  }
];

const EVENT_ORDER = ["address", "top", "impact", "finish"];
let memoryDemoMode = false;
let memoryExamples = [];

export function listCorrectionExamples() {
  return [...(isDemoLearningEnabled() ? DEMO_EXAMPLES : []), ...readStoredExamples()];
}

export function correctionExampleCount() {
  return listCorrectionExamples().length;
}

export function storedCorrectionExampleCount() {
  return readStoredExamples().length;
}

export function demoCorrectionExampleCount() {
  return DEMO_EXAMPLES.length;
}

export function isDemoLearningEnabled() {
  if (!canUseLocalStorage()) return memoryDemoMode;
  return localStorage.getItem(DEMO_MODE_KEY) === "1";
}

export function setDemoLearningEnabled(enabled) {
  if (!canUseLocalStorage()) {
    memoryDemoMode = Boolean(enabled);
    return memoryDemoMode;
  }
  localStorage.setItem(DEMO_MODE_KEY, enabled ? "1" : "0");
  return enabled;
}

export function findLearningMatch(state) {
  const examples = listCorrectionExamples();
  let best = null;
  let bestScore = 0;

  examples.forEach((example) => {
    const score = scoreExample(example, state);
    if (score > bestScore) {
      best = example;
      bestScore = score;
    }
  });

  if (!best || bestScore < 0.34) return null;
  return {
    example: best,
    score: bestScore,
    events: scaleEvents(best, state)
  };
}

export function blendAnalysisWithLearning(analysis, state) {
  const match = findLearningMatch(state);
  if (!match) return analysis;

  const events = { ...analysis.events };
  const eventMeta = { ...analysis.eventMeta };
  EVENT_ORDER.forEach((event) => {
    const learnedFrame = match.events[event];
    if (!Number.isFinite(learnedFrame)) return;
    events[event] = learnedFrame;
    eventMeta[event] = {
      source: match.example.id?.startsWith("demo-") ? "demo" : "aprendizaje",
      confidence: Math.round(78 + Math.min(17, match.score * 17)),
      note: `Sugerido desde ${match.example.label}`
    };
  });

  return {
    ...analysis,
    captureChecks: match.example.captureChecks || analysis.captureChecks,
    autoMetrics: match.example.metrics || analysis.autoMetrics,
    events,
    eventMeta,
    summary: {
      ...analysis.summary,
      learningMatch: match.example.label,
      learningScore: Math.round(match.score * 100)
    }
  };
}

export function saveCorrectionExample(state) {
  const events = Object.fromEntries(
    EVENT_ORDER.map((event) => [
      event,
      {
        frame: state.events[event],
        time: Number.isFinite(state.events[event]) ? Number((state.events[event] / state.fps).toFixed(3)) : null,
        ratio: state.totalFrames ? Number((state.events[event] / state.totalFrames).toFixed(5)) : null
      }
    ])
  );

  if (!EVENT_ORDER.every((event) => Number.isFinite(events[event].frame))) {
    throw new Error("Marca address, top, impact y finish antes de guardar.");
  }

  const example = {
    id: `local_${Date.now()}`,
    label: state.videoName || "Corrección local",
    fileNameIncludes: state.videoName || "",
    orientation: state.orientation,
    viewType: state.viewType,
    club: state.club,
    fps: state.fps,
    duration: state.duration,
    totalFrames: state.totalFrames,
    events,
    captureChecks: state.captureChecks,
    metrics: {
      ...state.manualMetrics,
      evidence: state.metricEvidence || {}
    }
  };

  const stored = readStoredExamples().filter((item) => item.fileNameIncludes !== example.fileNameIncludes);
  stored.unshift(example);
  writeStoredExamples(stored.slice(0, 24));
  return example;
}

function scoreExample(example, state) {
  let score = 0;
  const name = (state.videoName || "").toLowerCase();
  const exampleName = (example.fileNameIncludes || "").toLowerCase();
  if (exampleName && name.includes(exampleName)) score += 0.72;
  if (example.orientation && example.orientation === state.orientation) score += 0.12;
  if (example.viewType && example.viewType === state.viewType) score += 0.08;
  if (example.club && example.club === state.club) score += 0.04;
  if (example.duration && state.duration) {
    const delta = Math.abs(example.duration - state.duration);
    score += Math.max(0, 0.34 - (delta / Math.max(1, state.duration)) * 0.55);
  }
  if (example.totalFrames && state.totalFrames) {
    const delta = Math.abs(example.totalFrames - state.totalFrames);
    score += Math.max(0, 0.18 - (delta / Math.max(1, state.totalFrames)) * 0.32);
  }
  if (example.width && example.height && state.videoSize?.width && state.videoSize?.height) {
    const exampleRatio = Math.max(example.width, example.height) / Math.min(example.width, example.height);
    const stateRatio = Math.max(state.videoSize.width, state.videoSize.height) / Math.min(state.videoSize.width, state.videoSize.height);
    score += Math.max(0, 0.1 - Math.abs(exampleRatio - stateRatio) * 0.18);
  }
  return Math.min(1, score);
}

function scaleEvents(example, state) {
  return Object.fromEntries(
    EVENT_ORDER.map((event) => {
      const value = example.events?.[event];
      if (!value) return [event, null];
      if (Number.isFinite(value.ratio) && state.totalFrames) {
        return [event, Math.round(value.ratio * state.totalFrames)];
      }
      if (Number.isFinite(value.time) && state.fps) {
        return [event, Math.round(value.time * state.fps)];
      }
      return [event, value.frame];
    })
  );
}

function readStoredExamples() {
  if (!canUseLocalStorage()) return memoryExamples;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStoredExamples(examples) {
  if (!canUseLocalStorage()) {
    memoryExamples = examples;
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
}

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}
