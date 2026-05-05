const STORAGE_KEY = "swingLabAi.correctionExamples.v1";

const SEED_EXAMPLES = [
  {
    id: "whatsapp-2026-05-05-manual",
    label: "Swing WhatsApp corregido manualmente",
    fileNameIncludes: "WhatsApp Video 2026-05-05 at 9.43.22 AM.mp4",
    fps: 60,
    events: {
      address: { frame: 80, time: 1.33 },
      top: { frame: 138, time: 2.3 },
      impact: { frame: 155, time: 2.58 },
      finish: { frame: 188, time: 3.13 }
    }
  }
];

const EVENT_ORDER = ["address", "top", "impact", "finish"];

export function listCorrectionExamples() {
  return [...SEED_EXAMPLES, ...readStoredExamples()];
}

export function correctionExampleCount() {
  return listCorrectionExamples().length;
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

  if (!best || bestScore < 0.42) return null;
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
      source: "aprendizaje",
      confidence: Math.round(82 + Math.min(13, match.score * 13)),
      note: `Sugerido desde ${match.example.label}`
    };
  });

  return {
    ...analysis,
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
    events
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
  if (example.orientation && example.orientation === state.orientation) score += 0.1;
  if (example.viewType && example.viewType === state.viewType) score += 0.08;
  if (example.club && example.club === state.club) score += 0.04;
  if (example.duration && state.duration) {
    const delta = Math.abs(example.duration - state.duration);
    score += Math.max(0, 0.18 - delta / Math.max(1, state.duration) * 0.3);
  }
  if (example.totalFrames && state.totalFrames) {
    const delta = Math.abs(example.totalFrames - state.totalFrames);
    score += Math.max(0, 0.12 - delta / Math.max(1, state.totalFrames) * 0.2);
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
  if (!canUseLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeStoredExamples(examples) {
  if (!canUseLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
}

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}
