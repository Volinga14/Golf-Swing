const EVENT_ORDER = ["address", "top", "impact", "finish"];

export async function analyzeVideo(video, { fps = 60, onProgress } = {}) {
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration || !video.videoWidth || !video.videoHeight) {
    return emptyAnalysis();
  }

  const sampleCount = Math.min(96, Math.max(32, Math.round(duration * 18)));
  const canvas = document.createElement("canvas");
  const ratio = video.videoWidth / video.videoHeight;
  canvas.width = ratio >= 1 ? 72 : 42;
  canvas.height = ratio >= 1 ? 42 : 72;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const originalTime = video.currentTime || 0;
  const wasPaused = video.paused;
  video.pause();

  const samples = [];
  let previous = null;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = (duration * index) / Math.max(1, sampleCount - 1);
    await seekVideo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stats = frameStats(frame.data, previous);
    previous = stats.gray;
    samples.push({ index, time, ...stats });
    onProgress?.(Math.round(((index + 1) / sampleCount) * 100));
  }

  await seekVideo(video, Math.min(originalTime, duration));
  if (!wasPaused) video.play().catch(() => {});

  return buildAnalysis({
    samples,
    fps,
    duration,
    width: video.videoWidth,
    height: video.videoHeight
  });
}

export function buildAnalysis({ samples, fps, duration, width, height }) {
  const motion = samples.map((sample) => sample.motion);
  const smoothed = smooth(motion, 2);
  const brightness = average(samples.map((sample) => sample.brightness));
  const contrast = average(samples.map((sample) => sample.contrast));
  const firstMotion = average(smoothed.slice(0, Math.max(3, Math.round(samples.length * 0.12))));
  const peakMotion = Math.max(...smoothed);
  const baseline = median(smoothed.slice(0, Math.max(4, Math.round(samples.length * 0.18))));
  const signal = Math.max(0, peakMotion - baseline);
  const events = estimateEvents(samples, smoothed, fps, duration, signal, baseline);
  const captureChecks = estimateCaptureChecks({ fps, width, height, brightness, contrast, signal, firstMotion, peakMotion });
  const captureScore = Math.round((Object.values(captureChecks).filter(Boolean).length / Object.values(captureChecks).length) * 100);
  const autoMetrics = estimateMetrics({ samples, smoothed, events, fps, captureScore, signal, firstMotion, peakMotion });

  return {
    events: events.frames,
    eventMeta: events.meta,
    captureChecks,
    autoMetrics,
    summary: {
      brightness: Math.round(brightness),
      contrast: Math.round(contrast),
      signal: Math.round(signal),
      peakMotion: Math.round(peakMotion),
      baseline: Math.round(baseline),
      sampleCount: samples.length
    }
  };
}

function estimateEvents(samples, smoothed, fps, duration, signal, baseline) {
  const threshold = baseline + Math.max(2, signal * 0.24);
  const active = smoothed
    .map((value, index) => ({ value, index }))
    .filter((item, index) => index > 1 && item.value > threshold)
    .map((item) => item.index);

  const firstActive = active[0] ?? Math.round(samples.length * 0.12);
  const lastActive = active[active.length - 1] ?? Math.round(samples.length * 0.86);
  const impactSearchStart = clampIndex(Math.max(firstActive + 5, Math.round(samples.length * 0.35)), samples.length);
  const impactSearchEnd = clampIndex(Math.max(impactSearchStart + 1, Math.min(samples.length - 1, lastActive + 4)), samples.length);
  const impactIndex = indexOfMax(smoothed, impactSearchStart, impactSearchEnd);
  const topStart = clampIndex(firstActive + 3, samples.length);
  const topEnd = clampIndex(Math.max(topStart + 1, impactIndex - 3), samples.length);
  let topIndex = indexOfMin(smoothed, topStart, topEnd);
  if (topIndex <= firstActive || topIndex >= impactIndex) {
    topIndex = Math.round(firstActive + (impactIndex - firstActive) * 0.52);
  }
  const addressIndex = clampIndex(firstActive - 3, samples.length);
  const finishIndex = findFinishIndex(smoothed, impactIndex, threshold, lastActive);

  const frameEntries = {
    address: sampleToFrame(samples[addressIndex], fps, duration),
    top: sampleToFrame(samples[topIndex], fps, duration),
    impact: sampleToFrame(samples[impactIndex], fps, duration),
    finish: sampleToFrame(samples[finishIndex], fps, duration)
  };
  enforceOrder(frameEntries, Math.round(duration * fps));

  const confidence = Math.round(Math.min(94, Math.max(38, 42 + signal * 2.6)));
  return {
    frames: frameEntries,
    meta: Object.fromEntries(
      EVENT_ORDER.map((event) => [
        event,
        {
          source: "auto",
          confidence,
          note: confidence >= 72 ? "Detección automática sólida" : "Detección automática revisable"
        }
      ])
    )
  };
}

function estimateCaptureChecks({ fps, width, height, brightness, contrast, signal, firstMotion, peakMotion }) {
  const resolution = Math.max(width, height);
  return {
    frame: resolution >= 720,
    light: brightness > 42 && brightness < 225 && contrast > 18,
    stable: firstMotion < Math.max(5, peakMotion * 0.55),
    ball: resolution >= 720 && brightness > 45,
    club: signal > 4.5,
    fps: fps >= 60
  };
}

function estimateMetrics({ samples, smoothed, events, fps, captureScore, signal, firstMotion, peakMotion }) {
  const totalFrames = Math.max(...Object.values(events.frames));
  const addressFrame = events.frames.address;
  const topFrame = events.frames.top;
  const impactFrame = events.frames.impact;
  const finishFrame = events.frames.finish;
  const tempoRatio = topFrame > addressFrame && impactFrame > topFrame ? (topFrame - addressFrame) / (impactFrame - topFrame) : 3;
  const postFinishMotion = average(smoothed.slice(Math.round(samples.length * 0.78)));
  const signalScore = normalize(signal, 3, 24);

  return {
    headStability: clampScore(92 - firstMotion * 4.2 + captureScore * 0.05),
    postureRetention: clampScore(48 + captureScore * 0.22 + signalScore * 0.18 - Math.abs(tempoRatio - 3) * 7),
    handPath: clampScore(50 + signalScore * 0.27 + Math.min(14, peakMotion * 0.28)),
    finishBalance: clampScore(62 + ((finishFrame - impactFrame) / Math.max(1, fps)) * 5 - postFinishMotion * 2.8),
    evidence: {
      headStability: `Auto: compara address (${addressFrame}) con top (${topFrame}).`,
      postureRetention: `Auto: revisa impacto en frame ${impactFrame}.`,
      handPath: `Auto: transición top-impact (${topFrame}-${impactFrame}).`,
      finishBalance: `Auto: finish detectado en frame ${finishFrame}.`
    }
  };
}

function emptyAnalysis() {
  return {
    events: { address: null, top: null, impact: null, finish: null },
    eventMeta: {},
    captureChecks: { frame: false, light: false, stable: false, ball: false, club: false, fps: false },
    autoMetrics: null,
    summary: {}
  };
}

function frameStats(data, previousGray) {
  const gray = new Uint8ClampedArray(data.length / 4);
  let brightness = 0;
  let motion = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const value = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    gray[p] = value;
    brightness += value;
    if (previousGray) motion += Math.abs(value - previousGray[p]);
  }
  brightness /= gray.length;
  const variance = gray.reduce((sum, value) => sum + (value - brightness) ** 2, 0) / gray.length;
  return {
    gray,
    brightness,
    contrast: Math.sqrt(variance),
    motion: previousGray ? motion / gray.length : 0
  };
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
    window.setTimeout(done, 900);
  });
}

function smooth(values, radius) {
  return values.map((_, index) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(values.length, index + radius + 1);
    return average(values.slice(start, end));
  });
}

function sampleToFrame(sample, fps, duration) {
  return Math.round(Math.min(duration, sample?.time ?? 0) * fps);
}

function enforceOrder(events, maxFrame) {
  let previous = -1;
  EVENT_ORDER.forEach((event) => {
    const frame = Number.isFinite(events[event]) ? events[event] : previous + 1;
    events[event] = Math.min(maxFrame, Math.max(previous + 1, frame));
    previous = events[event];
  });
}

function findFinishIndex(smoothed, impactIndex, threshold, lastActive) {
  for (let i = impactIndex + 4; i < smoothed.length - 2; i += 1) {
    if (smoothed[i] < threshold * 0.72 && smoothed[i + 1] < threshold * 0.72) return i + 1;
  }
  return clampIndex(Math.max(lastActive + 3, Math.round(smoothed.length * 0.9)), smoothed.length);
}

function indexOfMax(values, start, end) {
  let best = start;
  for (let i = start; i <= end; i += 1) {
    if (values[i] > values[best]) best = i;
  }
  return best;
}

function indexOfMin(values, start, end) {
  let best = start;
  for (let i = start; i <= end; i += 1) {
    if (values[i] < values[best]) best = i;
  }
  return best;
}

function clampIndex(index, length) {
  return Math.min(length - 1, Math.max(0, Math.round(index)));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function normalize(value, low, high) {
  return Math.max(0, Math.min(100, ((value - low) / Math.max(1, high - low)) * 100));
}

function clampScore(value) {
  return Math.round(Math.max(0, Math.min(100, value)));
}
