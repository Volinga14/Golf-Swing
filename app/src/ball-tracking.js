export async function detectBallTrajectory(video, options = {}) {
  const duration = Number.isFinite(video.duration) ? video.duration : options.duration || 0;
  if (!duration || !video.videoWidth || !video.videoHeight) {
    return fallbackResult(options, "Sin vídeo suficiente para detectar la bola.");
  }

  const fps = options.fps || 60;
  const impactTime = Number.isFinite(options.impactFrame) ? options.impactFrame / fps : duration * 0.55;
  const startTime = Math.max(0, impactTime - 0.08);
  const endTime = Math.min(duration, Math.max(startTime + 0.55, impactTime + 2.2));
  const sampleCount = Math.min(64, Math.max(22, Math.round((endTime - startTime) * 26)));
  const canvas = document.createElement("canvas");
  const ratio = video.videoWidth / video.videoHeight;
  canvas.width = ratio >= 1 ? 300 : 170;
  canvas.height = Math.round(canvas.width / ratio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const originalTime = video.currentTime || 0;
  const wasPaused = video.paused;
  video.pause();

  const detections = [];
  let previousGray = null;
  let lastPoint = options.launchPoint || null;

  for (let index = 0; index < sampleCount; index += 1) {
    const time = startTime + ((endTime - startTime) * index) / Math.max(1, sampleCount - 1);
    await seekVideo(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = detectBallCandidate(frame.data, previousGray, canvas.width, canvas.height, lastPoint, options.launchPoint);
    previousGray = result.gray;
    if (result.point) {
      const point = { ...result.point, time };
      detections.push(point);
      lastPoint = point;
    }
    options.onProgress?.(Math.round(((index + 1) / sampleCount) * 100));
  }

  await seekVideo(video, Math.min(originalTime, duration));
  if (!wasPaused) video.play().catch(() => {});

  return buildTrajectoryFromDetections(detections, {
    ...options,
    impactTime,
    duration,
    source: "vision"
  });
}

export function buildTrajectoryFromDetections(detections = [], options = {}) {
  const launchPoint = options.launchPoint || { x: 0.52, y: 0.72 };
  const impactTime = options.impactTime || 0;
  const clean = cleanDetections(detections, launchPoint);

  if (clean.length < 2) {
    const fallback = fallbackTrajectory({ ...options, launchPoint, impactTime });
    return {
      points: fallback,
      detections: clean,
      confidence: 38,
      source: "fallback",
      summary: "No se encontró la bola con claridad; se creó una trayectoria editable desde el impacto."
    };
  }

  const points = [
    { ...launchPoint, time: impactTime },
    ...clean.map((point) => ({
      x: point.x,
      y: point.y,
      time: point.time,
      confidence: Math.round(point.score || 55)
    }))
  ];

  while (points.length < 5) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2] || launchPoint;
    points.push({
      x: clamp(last.x + (last.x - prev.x) * 0.72, 0.04, 0.96),
      y: clamp(last.y + (last.y - prev.y) * 0.65, 0.04, 0.92),
      time: last.time + 0.22,
      confidence: 44
    });
  }

  return {
    points: smoothPoints(points.slice(0, 7)),
    detections: clean,
    confidence: Math.round(Math.min(91, 48 + clean.length * 7)),
    source: "vision",
    summary: `${clean.length} puntos de bola detectados. Ajusta arrastrando si la línea se separa del vuelo real.`
  };
}

function detectBallCandidate(data, previousGray, width, height, lastPoint, launchPoint) {
  const gray = new Uint8ClampedArray(width * height);
  const mask = new Uint8Array(width * height);

  for (let pixel = 0, offset = 0; offset < data.length; pixel += 1, offset += 4) {
    const lum = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
    gray[pixel] = lum;
    if (!previousGray) continue;
    const diff = Math.abs(lum - previousGray[pixel]);
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nx = x / width;
    const ny = y / height;
    const nearLaunch = launchPoint ? Math.hypot(nx - launchPoint.x, ny - launchPoint.y) < 0.34 : true;
    const likelyFlightSide = !launchPoint || nx > launchPoint.x - 0.18;
    const inFlightZone = ny > 0.04 && ny < 0.92 && nx > 0.04 && nx < 0.98 && (nearLaunch || likelyFlightSide);
    if (inFlightZone && ((lum > 132 && diff > 14) || diff > 34)) {
      mask[pixel] = 1;
    }
  }

  if (!previousGray) return { gray, point: null };

  const visited = new Uint8Array(width * height);
  let best = null;

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel] || visited[pixel]) continue;
    const blob = traceBlob(pixel, mask, visited, gray, previousGray, width, height);
    if (!isBallSized(blob, width, height)) continue;
    const point = scoreBlob(blob, width, height, lastPoint, launchPoint);
    if (!best || point.score > best.score) best = point;
  }

  return { gray, point: best };
}

function traceBlob(start, mask, visited, gray, previousGray, width, height) {
  const stack = [start];
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  let sumLum = 0;
  let sumDiff = 0;
  let minX = width;
  let maxX = 0;
  let minY = height;
  let maxY = 0;

  visited[start] = 1;
  while (stack.length) {
    const pixel = stack.pop();
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    area += 1;
    sumX += x;
    sumY += y;
    sumLum += gray[pixel];
    sumDiff += Math.abs(gray[pixel] - previousGray[pixel]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
    neighbors.forEach((next) => {
      if (next < 0 || next >= mask.length || visited[next] || !mask[next]) return;
      const nx = next % width;
      if (Math.abs(nx - x) > 1) return;
      visited[next] = 1;
      stack.push(next);
    });
  }

  return { area, sumX, sumY, sumLum, sumDiff, minX, maxX, minY, maxY };
}

function isBallSized(blob, width, height) {
  const boxW = blob.maxX - blob.minX + 1;
  const boxH = blob.maxY - blob.minY + 1;
  const maxBox = Math.max(width, height) * 0.09;
  return blob.area >= 1 && blob.area <= 90 && boxW <= maxBox && boxH <= maxBox && boxW / Math.max(1, boxH) < 4.2 && boxH / Math.max(1, boxW) < 4.2;
}

function scoreBlob(blob, width, height, lastPoint, launchPoint) {
  const x = blob.sumX / blob.area / width;
  const y = blob.sumY / blob.area / height;
  const avgLum = blob.sumLum / blob.area;
  const avgDiff = blob.sumDiff / blob.area;
  const sizePenalty = Math.max(0, blob.area - 18) * 0.55;
  const trendBonus = lastPoint ? Math.max(0, 28 - Math.hypot(x - lastPoint.x, y - lastPoint.y) * 140) : 0;
  const launchBonus = launchPoint ? Math.max(0, 34 - Math.hypot(x - launchPoint.x, y - launchPoint.y) * 95) : 0;
  const launchDirectionBonus = launchPoint ? Math.max(-14, (x - launchPoint.x) * 22 + (launchPoint.y - y) * 18) : 0;
  const upwardBonus = lastPoint ? Math.max(-10, (lastPoint.y - y) * 42) : 0;
  return {
    x,
    y,
    score: avgDiff * 1.35 + avgLum * 0.14 + trendBonus + launchBonus + launchDirectionBonus + upwardBonus - sizePenalty
  };
}

function cleanDetections(detections, launchPoint) {
  const sorted = detections
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);

  const clean = [];
  sorted.forEach((point) => {
    const last = clean[clean.length - 1];
    const distanceFromLaunch = Math.hypot(point.x - launchPoint.x, point.y - launchPoint.y);
    if (!last && distanceFromLaunch > 0.5) return;
    if (last && Math.hypot(point.x - last.x, point.y - last.y) > 0.28) return;
    if (point.score < 28) return;
    clean.push(point);
  });
  return clean;
}

function fallbackResult(options, summary) {
  return {
    points: fallbackTrajectory(options),
    detections: [],
    confidence: 28,
    source: "fallback",
    summary
  };
}

function fallbackTrajectory(options = {}) {
  const launch = options.launchPoint || { x: 0.52, y: 0.72 };
  const time = options.impactTime || 0;
  const curve = curveForResult(options.result);
  return [
    { x: launch.x, y: launch.y, time },
    { x: clamp(launch.x + 0.1 + curve.start, 0.04, 0.96), y: clamp(launch.y - 0.16, 0.04, 0.92), time: time + 0.22 },
    { x: clamp(launch.x + 0.22 + curve.mid, 0.04, 0.96), y: clamp(launch.y - 0.34, 0.04, 0.92), time: time + 0.55 },
    { x: clamp(launch.x + 0.38 + curve.end, 0.04, 0.96), y: clamp(launch.y - 0.46, 0.04, 0.92), time: time + 0.9 }
  ];
}

function smoothPoints(points) {
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const prev = points[index - 1];
    const next = points[index + 1];
    return {
      ...point,
      x: point.x * 0.6 + prev.x * 0.2 + next.x * 0.2,
      y: point.y * 0.6 + prev.y * 0.2 + next.y * 0.2
    };
  });
}

function curveForResult(result) {
  return {
    draw: { start: -0.03, mid: -0.02, end: 0.06 },
    fade: { start: 0.03, mid: 0.02, end: -0.06 },
    slice: { start: 0.04, mid: 0.09, end: 0.18 },
    hook: { start: -0.04, mid: -0.09, end: -0.18 },
    push: { start: 0.06, mid: 0.08, end: 0.1 },
    pull: { start: -0.06, mid: -0.08, end: -0.1 },
    straight: { start: 0, mid: 0, end: 0 }
  }[result] || { start: 0.01, mid: 0.03, end: 0.06 };
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = Math.min(Math.max(0, time), video.duration || time);
    window.setTimeout(done, 800);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
