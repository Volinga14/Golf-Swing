/* Swing Lab AI bundled runtime for file://, GitHub Pages and PWA usage. Generated for v0.5.5 upload robust. */
(function () {
  const SwingLabModules = {};
  if (typeof window !== "undefined") window.SwingLabModules = SwingLabModules;
  if (typeof window !== "undefined" && typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class { constructor(callback) { this.callback = callback; } observe() {} unobserve() {} disconnect() {} };
  }


  // ---- video-player.js ----
  (function (exports) {
exports.VideoPlayer = class VideoPlayer {
  constructor({ video, slider, fpsInput, frameReadout, timeReadout, onFrame }) {
    this.video = video;
    this.slider = slider;
    this.fpsInput = fpsInput;
    this.frameReadout = frameReadout;
    this.timeReadout = timeReadout;
    this.onFrame = onFrame;
    this.duration = 0;
    this.totalFrames = 0;
    this.currentFrame = 0;
    this.objectUrl = "";
    this._raf = null;

    this.video.addEventListener("loadedmetadata", () => this.handleMetadata());
    this.video.addEventListener("timeupdate", () => this.syncFromVideo());
    this.video.addEventListener("play", () => this.tick());
    this.video.addEventListener("pause", () => this.stopTick());
    this.slider.addEventListener("input", () => this.seekFrame(Number(this.slider.value)));
    this.fpsInput.addEventListener("change", () => this.handleMetadata());
  }

  load(file) {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.video.src = this.objectUrl;
    this.video.load();
    return this.objectUrl;
  }

  get fps() {
    const parsed = Number(this.fpsInput.value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
  }

  handleMetadata() {
    this.duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;
    this.totalFrames = Math.max(0, Math.floor(this.duration * this.fps));
    this.slider.max = String(this.totalFrames);
    this.seekFrame(0);
  }

  seekFrame(frame) {
    const safeFrame = Math.min(Math.max(0, Math.round(frame)), this.totalFrames);
    this.currentFrame = safeFrame;
    if (this.duration > 0) {
      this.video.currentTime = Math.min(this.duration, safeFrame / this.fps);
    }
    this.renderReadout();
    this.onFrame?.(this.currentFrame);
  }

  step(direction) {
    this.video.pause();
    this.seekFrame(this.currentFrame + direction);
  }

  togglePlayback() {
    if (!this.video.src) return;
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
  }

  setPlaybackRate(rate) {
    const safeRate = Number.isFinite(Number(rate)) ? Number(rate) : 1;
    this.video.playbackRate = Math.min(2, Math.max(0.1, safeRate));
  }

  syncFromVideo() {
    if (!this.video.src) return;
    this.currentFrame = Math.min(this.totalFrames, Math.round(this.video.currentTime * this.fps));
    this.slider.value = String(this.currentFrame);
    this.renderReadout();
    this.onFrame?.(this.currentFrame);
  }

  tick() {
    this.syncFromVideo();
    this._raf = requestAnimationFrame(() => this.tick());
  }

  stopTick() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  renderReadout() {
    this.slider.value = String(this.currentFrame);
    this.frameReadout.textContent = `Frame ${this.currentFrame}`;
    this.timeReadout.textContent = formatTime(this.currentFrame / this.fps);
  }
}

exports.formatTime = function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

  })(SwingLabModules);


  // ---- overlays.js ----
  (function (exports) {
const EVENT_COLORS = {
  address: "#e9d8a6",
  top: "#79addc",
  impact: "#e26d5c",
  finish: "#83c5be"
};

const EVENT_LABELS = {
  address: "ADDRESS",
  top: "TOP",
  impact: "IMPACT",
  finish: "FINISH"
};

exports.OverlayCanvas = class OverlayCanvas {
  constructor({ canvas, video, getState }) {
    this.canvas = canvas;
    this.video = video;
    this.getState = getState;
    this.tool = "select";
    this.pendingPoints = [];
    this.drawings = [];
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.canvas.addEventListener("pointerdown", (event) => this.handlePointer(event));
    this.resize();
  }

  setTool(tool) {
    this.tool = tool;
    this.pendingPoints = [];
  }

  clear() {
    this.drawings = [];
    this.render();
  }

  serialize() {
    return this.drawings.slice();
  }

  load(drawings = []) {
    this.drawings = drawings.slice();
    this.render();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * scale));
    this.canvas.height = Math.max(1, Math.round(rect.height * scale));
    this.render();
  }

  handlePointer(event) {
    if (this.tool === "select") return;
    const rect = this.canvas.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height
    };
    this.pendingPoints.push(point);
    const needed = this.tool === "angle" ? 3 : 2;
    if (this.pendingPoints.length === needed) {
      this.drawings.push({
        type: this.tool,
        points: this.pendingPoints.slice(),
        color: this.tool === "angle" ? "#d7b56d" : "#f7f2dc"
      });
      this.pendingPoints = [];
    }
    this.render();
  }

  render(targetContext = null, targetSize = null, drawVideo = false) {
    const ctx = targetContext || this.canvas.getContext("2d");
    const width = targetSize?.width || this.canvas.width;
    const height = targetSize?.height || this.canvas.height;
    const state = this.getState();

    ctx.clearRect(0, 0, width, height);
    if (drawVideo && this.video.readyState >= 2) {
      drawContainedVideo(ctx, this.video, width, height);
    }
    if (state.overlay.grid) drawGrid(ctx, width, height);
    if (state.overlay.guide) drawGuides(ctx, width, height, state);
    if (state.overlay.events) drawEvents(ctx, width, height, state);
    this.drawings.forEach((drawing) => drawDrawing(ctx, width, height, drawing));
    this.pendingPoints.forEach((point) => drawPoint(ctx, width, height, point));
  }
}

function drawContainedVideo(ctx, video, width, height) {
  const videoRatio = video.videoWidth / video.videoHeight || 16 / 9;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let x = 0;
  let y = 0;

  if (videoRatio > canvasRatio) {
    drawHeight = width / videoRatio;
    y = (height - drawHeight) / 2;
  } else {
    drawWidth = height * videoRatio;
    x = (width - drawWidth) / 2;
  }
  ctx.fillStyle = "#0f1716";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(video, x, y, drawWidth, drawHeight);
}

function drawGrid(ctx, width, height) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 250, 240, 0.16)";
  ctx.lineWidth = 1;
  for (let x = width / 4; x < width; x += width / 4) {
    line(ctx, x, 0, x, height);
  }
  for (let y = height / 4; y < height; y += height / 4) {
    line(ctx, 0, y, width, y);
  }
  ctx.restore();
}

function drawGuides(ctx, width, height, state) {
  const guide = state.guide || { x: 0.5, y: 0.8, scale: 1, width: 1, footAngle: 0, rotation: -8 };
  const cx = width * guide.x;
  const groundY = height * guide.y;
  const scale = guide.scale || 1;
  const hipWidthScale = guide.width || 1;
  const footAngle = Number.isFinite(guide.footAngle) ? guide.footAngle : 0;
  const clubAngle = Number.isFinite(guide.rotation) ? guide.rotation : 0;

  const stance = width * 0.18 * scale;
  const footLineLength = width * 0.46 * scale;
  const headToHipHeight = height * 0.39 * scale;
  const hipY = groundY - height * 0.23 * scale;
  const headY = Math.max(8, hipY - headToHipHeight);
  const bodyWidth = width * 0.17 * scale * hipWidthScale;
  const bodyX = cx - bodyWidth / 2;
  const bodyRadius = Math.max(10, width * 0.012);
  const shoulderY = headY + headToHipHeight * 0.28;
  const hipLineY = hipY;
  const ballX = cx + stance * 0.78;
  const ballY = groundY - height * 0.025 * scale;

  ctx.save();
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.font = `${Math.max(11, width * 0.012)}px Inter, sans-serif`;
  ctx.textBaseline = "middle";

  // Main body box: user should align top with head and lower edge with hips/seat.
  ctx.strokeStyle = "rgba(255, 250, 240, 0.86)";
  ctx.fillStyle = "rgba(255, 250, 240, 0.055)";
  roundRect(ctx, bodyX, headY, bodyWidth, hipY - headY, bodyRadius);
  ctx.fill();
  ctx.stroke();

  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(255, 250, 240, 0.46)";
  line(ctx, bodyX - bodyWidth * 0.25, headY, bodyX + bodyWidth * 1.25, headY);
  line(ctx, bodyX - bodyWidth * 0.25, hipLineY, bodyX + bodyWidth * 1.25, hipLineY);
  line(ctx, cx, headY, cx, groundY);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255, 250, 240, 0.9)";
  labelPill(ctx, "cabeza", bodyX + bodyWidth + 8, headY, width);
  labelPill(ctx, "caderas / culo", bodyX + bodyWidth + 8, hipLineY, width);

  // Feet direction: a simple rotatable baseline for stance/target alignment.
  ctx.strokeStyle = "rgba(215, 181, 109, 0.92)";
  ctx.fillStyle = "rgba(215, 181, 109, 0.95)";
  rotatedLine(ctx, cx, groundY, footLineLength, (footAngle * Math.PI) / 180);
  labelPill(ctx, `pies ${Math.round(footAngle)}°`, Math.max(8, cx - footLineLength * 0.5), groundY - 18, width);

  // Ball marker.
  ctx.beginPath();
  ctx.arc(ballX, ballY, Math.max(4, width * 0.0045), 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
  ctx.fill();

  // Club/shaft angle guide. In DTL it represents swing plane; in FO it works as approximate shaft lean.
  ctx.strokeStyle = state.viewType === "DTL" ? "rgba(121, 173, 220, 0.88)" : "rgba(131, 197, 190, 0.88)";
  ctx.setLineDash([10, 8]);
  const clubBaseAngle = state.viewType === "FO" ? -78 : -62;
  const clubLength = Math.max(width, height) * 0.56 * scale;
  const clubOriginX = ballX - stance * 0.05;
  const clubOriginY = ballY;
  rotatedLine(ctx, clubOriginX, clubOriginY, clubLength, ((clubBaseAngle + clubAngle) * Math.PI) / 180);
  ctx.setLineDash([]);
  labelPill(ctx, `palo ${Math.round(clubAngle)}°`, Math.min(width - 130, clubOriginX + 10), Math.max(18, clubOriginY - height * 0.24 * scale), width);

  // Light reference lines for shoulders/hips in face-on.
  if (state.viewType === "FO") {
    ctx.strokeStyle = "rgba(131, 197, 190, 0.42)";
    line(ctx, bodyX - bodyWidth * 0.35, shoulderY, bodyX + bodyWidth * 1.35, shoulderY);
    line(ctx, bodyX - bodyWidth * 0.35, hipY, bodyX + bodyWidth * 1.35, hipY);
  }

  ctx.restore();
}

function labelPill(ctx, text, x, y, width) {
  const paddingX = 7;
  const paddingY = 4;
  const metrics = ctx.measureText(text);
  const fontSize = Number((ctx.font.match(/(\d+(?:\.\d+)?)px/) || [0, 12])[1]);
  const pillWidth = metrics.width + paddingX * 2;
  const pillHeight = fontSize + paddingY * 2;
  const safeX = Math.max(6, Math.min(width - pillWidth - 6, x));
  const safeY = Math.max(pillHeight / 2 + 4, y);
  ctx.save();
  ctx.fillStyle = "rgba(6, 20, 18, 0.74)";
  roundRect(ctx, safeX, safeY - pillHeight / 2, pillWidth, pillHeight, pillHeight / 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
  ctx.fillText(text, safeX + paddingX, safeY + 0.5);
  ctx.restore();
}

function drawEvents(ctx, width, height, state) {
  if (!state.totalFrames) return;
  ctx.save();
  ctx.font = `${Math.max(12, width * 0.014)}px Inter, sans-serif`;
  ctx.textBaseline = "middle";
  Object.entries(state.events).forEach(([event, frame]) => {
    if (frame == null) return;
    const x = (frame / state.totalFrames) * width;
    ctx.strokeStyle = EVENT_COLORS[event] || "#fff";
    ctx.fillStyle = EVENT_COLORS[event] || "#fff";
    ctx.lineWidth = 2;
    line(ctx, x, height * 0.04, x, height * 0.96);
    ctx.fillText(EVENT_LABELS[event] || event.toUpperCase(), Math.min(width - 86, x + 8), height * 0.08);
  });
  ctx.restore();
}

function drawDrawing(ctx, width, height, drawing) {
  ctx.save();
  ctx.strokeStyle = drawing.color;
  ctx.fillStyle = drawing.color;
  ctx.lineWidth = 3;
  if (drawing.type === "line") {
    const [a, b] = drawing.points;
    line(ctx, a.x * width, a.y * height, b.x * width, b.y * height);
  }
  if (drawing.type === "angle") {
    const [a, b, c] = drawing.points;
    line(ctx, a.x * width, a.y * height, b.x * width, b.y * height);
    line(ctx, b.x * width, b.y * height, c.x * width, c.y * height);
    const angle = angleBetween(a, b, c);
    ctx.font = `${Math.max(12, width * 0.016)}px Inter, sans-serif`;
    ctx.fillText(`${Math.round(angle)}°`, b.x * width + 10, b.y * height - 10);
  }
  drawing.points.forEach((point) => drawPoint(ctx, width, height, point));
  ctx.restore();
}

exports.drawBallPath = function drawBallPath(ctx, width, height, points, label = "", options = {}) {
  ctx.clearRect(0, 0, width, height);
  if (!points?.length) return;
  const videoRect = containedRect(width, height, options.videoWidth, options.videoHeight);
  const visiblePoints = pathUntilTime(points, options.currentTime);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (visiblePoints.length) {
    ctx.shadowColor = "rgba(215, 181, 109, 0.65)";
    ctx.shadowBlur = Math.max(9, width * 0.012);
    ctx.lineWidth = Math.max(7, width * 0.008);
    ctx.strokeStyle = "rgba(215, 181, 109, 0.28)";
    drawCurve(ctx, videoRect, visiblePoints);
    ctx.stroke();

    ctx.shadowBlur = Math.max(4, width * 0.006);
    ctx.lineWidth = Math.max(3, width * 0.004);
    ctx.strokeStyle = "rgba(255, 245, 199, 0.96)";
    drawCurve(ctx, videoRect, visiblePoints);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 250, 240, 0.96)";
    const active = visiblePoints[visiblePoints.length - 1];
    drawBallGlow(ctx, mapBallPoint(active, videoRect), width);
  }

  points.forEach((point, index) => {
    const mapped = mapBallPoint(point, videoRect);
    ctx.beginPath();
    ctx.arc(mapped.x, mapped.y, index === points.length - 1 ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = index === 0 ? "rgba(131, 197, 190, 0.96)" : "rgba(255, 250, 240, 0.78)";
    ctx.fill();
    if (options.editable) {
      ctx.strokeStyle = "rgba(15, 23, 22, 0.78)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  });

  if (label) {
    const lastMapped = mapBallPoint(points[points.length - 1], videoRect);
    ctx.fillStyle = "rgba(255, 250, 240, 0.92)";
    ctx.font = `${Math.max(12, width * 0.013)}px Inter, sans-serif`;
    ctx.fillText(label, Math.min(width - 104, lastMapped.x + 12), Math.max(16, lastMapped.y - 12));
  }
  ctx.restore();
}

function drawCurve(ctx, rect, points) {
  ctx.beginPath();
  const first = points[0];
  const firstMapped = mapBallPoint(first, rect);
  ctx.moveTo(firstMapped.x, firstMapped.y);
  if (points.length === 2) {
    const b = mapBallPoint(points[1], rect);
    ctx.lineTo(b.x, b.y);
  } else {
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const prev = points[i - 1];
      const prevMapped = mapBallPoint(prev, rect);
      const pointMapped = mapBallPoint(point, rect);
      const midX = (prevMapped.x + pointMapped.x) / 2;
      const midY = (prevMapped.y + pointMapped.y) / 2;
      ctx.quadraticCurveTo(prevMapped.x, prevMapped.y, midX, midY);
    }
    const last = points[points.length - 1];
    const lastMapped = mapBallPoint(last, rect);
    ctx.lineTo(lastMapped.x, lastMapped.y);
  }
}

function pathUntilTime(points, currentTime) {
  if (!Number.isFinite(currentTime)) return points;
  const firstTime = points.find((point) => Number.isFinite(point.time))?.time;
  if (!Number.isFinite(firstTime)) return points;
  if (currentTime < firstTime) return [];

  const visible = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!Number.isFinite(point.time) || point.time <= currentTime) {
      visible.push(point);
      continue;
    }
    const prev = visible[visible.length - 1];
    if (prev && Number.isFinite(prev.time)) {
      const ratio = Math.max(0, Math.min(1, (currentTime - prev.time) / Math.max(0.001, point.time - prev.time)));
      visible.push({
        x: prev.x + (point.x - prev.x) * ratio,
        y: prev.y + (point.y - prev.y) * ratio,
        time: currentTime
      });
    }
    break;
  }
  return visible;
}

function drawBallGlow(ctx, point, width) {
  const radius = Math.max(7, width * 0.008);
  const gradient = ctx.createRadialGradient(point.x, point.y, 1, point.x, point.y, radius * 2.6);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.32, "rgba(255, 245, 199, 0.92)");
  gradient.addColorStop(1, "rgba(215, 181, 109, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffdf4";
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius * 0.58, 0, Math.PI * 2);
  ctx.fill();
}

function mapBallPoint(point, rect) {
  return {
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height
  };
}

function containedRect(width, height, videoWidth, videoHeight) {
  if (!videoWidth || !videoHeight) return { x: 0, y: 0, width, height };
  const videoRatio = videoWidth / videoHeight;
  const canvasRatio = width / height;
  if (videoRatio > canvasRatio) {
    const drawHeight = width / videoRatio;
    return { x: 0, y: (height - drawHeight) / 2, width, height: drawHeight };
  }
  const drawWidth = height * videoRatio;
  return { x: (width - drawWidth) / 2, y: 0, width: drawWidth, height };
}

function drawPoint(ctx, width, height, point) {
  ctx.beginPath();
  ctx.arc(point.x * width, point.y * height, 5, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function rotatedLine(ctx, centerX, centerY, length, angle) {
  const dx = Math.cos(angle) * length * 0.5;
  const dy = Math.sin(angle) * length * 0.5;
  line(ctx, centerX - dx, centerY - dy, centerX + dx, centerY + dy);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
}

  })(SwingLabModules);


  // ---- metrics.js ----
  (function (exports) {
exports.calculateMetrics = function calculateMetrics(state) {
  const captureScore = calculateCaptureScore(state.captureChecks);
  const hasVideo = Number.isFinite(state.totalFrames) && state.totalFrames > 0;
  const eventsMarked = ["address", "top", "impact", "finish"].every((event) => Number.isFinite(state.events[event]));
  const eventsOrdered = areEventsOrdered(state.events);
  const eventsComplete = hasVideo && eventsMarked && eventsOrdered;
  const fps = state.fps || 60;
  const backswingFrames = eventDelta(state, "address", "top");
  const downswingFrames = eventDelta(state, "top", "impact");
  const finishFrames = eventDelta(state, "impact", "finish");
  const tempoRatio = backswingFrames && downswingFrames ? backswingFrames / Math.max(1, downswingFrames) : null;
  const tempoScore = tempoRatio ? scoreTempo(tempoRatio) : 0;
  const topTiming = state.totalFrames && state.events.top != null ? (state.events.top / state.totalFrames) * 100 : null;

  const qualityInputs = state.manualMetrics;
  const overallScore = hasVideo
    ? Math.round(
        weightedAverage([
          [captureScore, 0.18],
          [tempoScore, 0.2],
          [qualityInputs.headStability, 0.16],
          [qualityInputs.postureRetention, 0.18],
          [qualityInputs.handPath, 0.14],
          [qualityInputs.finishBalance, 0.14]
        ])
      )
    : 0;

  return {
    eventsComplete,
    eventsMarked,
    eventsOrdered,
    hasVideo,
    captureScore,
    overallScore,
    tempoRatio,
    tempoScore,
    topTiming,
    backswingSec: backswingFrames ? backswingFrames / fps : null,
    downswingSec: downswingFrames ? downswingFrames / fps : null,
    holdFinishSec: finishFrames ? finishFrames / fps : null,
    headStability: qualityInputs.headStability,
    postureRetention: qualityInputs.postureRetention,
    handPath: qualityInputs.handPath,
    finishBalance: qualityInputs.finishBalance,
    confidence: hasVideo ? Math.round(weightedAverage([[captureScore, 0.55], [eventsComplete ? 88 : 40, 0.45]])) : 0
  };
}

function areEventsOrdered(events) {
  const sequence = ["address", "top", "impact", "finish"].map((event) => events[event]);
  if (!sequence.every(Number.isFinite)) return false;
  return sequence.every((frame, index) => index === 0 || frame > sequence[index - 1]);
}

exports.calculateCaptureScore = function calculateCaptureScore(checks) {
  const values = Object.values(checks || {});
  if (!values.length) return 0;
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

function eventDelta(state, start, end) {
  const a = state.events[start];
  const b = state.events[end];
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return b - a;
}

function scoreTempo(ratio) {
  const distance = Math.abs(ratio - 3);
  return Math.round(Math.max(0, 100 - distance * 34));
}

function weightedAverage(pairs) {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  return pairs.reduce((sum, [value, weight]) => sum + (Number(value) || 0) * weight, 0) / totalWeight;
}

exports.metricRows = function metricRows(metrics) {
  return [
    {
      label: "Tempo",
      value: metrics.tempoRatio ? `${metrics.tempoRatio.toFixed(2)}:1` : "Pendiente",
      score: metrics.tempoScore,
      detail: "Objetivo inicial aproximado: cerca de 3:1."
    },
    {
      label: "Capture score",
      value: `${metrics.captureScore}/100`,
      score: metrics.captureScore,
      detail: "Calidad de encuadre, luz, fps y visibilidad."
    },
    {
      label: "Cabeza",
      value: `${metrics.headStability}/100`,
      score: metrics.headStability,
      detail: "Estabilidad visual durante el backswing."
    },
    {
      label: "Postura",
      value: `${metrics.postureRetention}/100`,
      score: metrics.postureRetention,
      detail: "Espacio y postura conservada hasta impacto."
    },
    {
      label: "Ruta manos",
      value: `${metrics.handPath}/100`,
      score: metrics.handPath,
      detail: "Proxy manual de ruta limpia en transición."
    },
    {
      label: "Finish",
      value: `${metrics.finishBalance}/100`,
      score: metrics.finishBalance,
      detail: "Equilibrio y final completo."
    }
  ];
}

  })(SwingLabModules);


  // ---- recommendations.js ----
  (function (exports) {
exports.buildRecommendations = function buildRecommendations(state, metrics) {
  if (!metrics.hasVideo) {
    return {
      summary: "Carga un vídeo para crear el primer análisis.",
      primaryIssue: "Vídeo pendiente",
      confidenceLabel: "Sin análisis",
      evidence: "El MVP necesita duración y frames para calcular eventos, tempo y exportar una sesión útil.",
      drill: {
        name: "Captura guiada",
        description: "Graba con cámara fija, buena luz y jugador completo visible durante todo el swing."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  if (metrics.eventsMarked && !metrics.eventsOrdered) {
    return {
      summary: "Revisa el orden de las fases marcadas.",
      primaryIssue: "Fases fuera de orden",
      confidenceLabel: "Confianza baja",
      evidence: "Las fases deben avanzar en el tiempo: address, top, impact y finish.",
      drill: {
        name: "Corrección de timeline",
        description: "Mueve el vídeo frame a frame y vuelve a marcar cada fase en orden cronológico."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  if (!metrics.eventsComplete) {
    return {
      summary: "Marca o detecta las cuatro fases principales para desbloquear el reporte.",
      primaryIssue: "Faltan fases clave",
      confidenceLabel: "Confianza baja",
      evidence: "Address, top, impact y finish permiten calcular tempo y timing.",
      drill: {
        name: "Detección guiada",
        description: "Usa detectar fases y corrige manualmente cualquier frame que no coincida."
      },
      recommendations: [],
      explanations: defaultExplanations()
    };
  }

  const findings = [];
  if (metrics.captureScore < 70) {
    findings.push({
      issue: "La captura limita la lectura",
      source: "Heurística",
      score: metrics.captureScore,
      confidence: 0.72,
      evidence: "La app necesita cuerpo, palo y bola visibles para que las métricas tengan sentido.",
      drill: "Repetir captura",
      description: "Graba a 60 FPS o más, con cámara fija, buena luz y jugador completo en plano.",
      nextMetric: "Capture score"
    });
  }

  if (metrics.tempoRatio && (metrics.tempoRatio < 2.4 || metrics.tempoRatio > 3.8)) {
    findings.push({
      issue: "Tempo poco estable",
      source: "Heurística",
      score: metrics.tempoScore,
      confidence: 0.68,
      evidence: `El tempo marcado es ${metrics.tempoRatio.toFixed(2)}:1 entre backswing y downswing.`,
      drill: "3:1 tempo drill",
      description: "Cuenta 1-2-3 en la subida y 1 en la bajada, manteniendo la misma velocidad de rutina.",
      nextMetric: "Tempo ratio"
    });
  }

  if (metrics.headStability < 62) {
    findings.push({
      issue: state.viewType === "FO" ? "Posible sway lateral" : "Posible inestabilidad de cabeza",
      source: "Heurística",
      score: metrics.headStability,
      confidence: 0.64,
      evidence: "La métrica automática sugiere revisar address contra top antes de confiar en la lectura.",
      drill: "Pivot sobre eje central",
      description: "Haz swings cortos sintiendo que el pecho rota alrededor de un eje estable.",
      nextMetric: "Head stability"
    });
  }

  if (state.viewType === "DTL" && metrics.postureRetention < 66) {
    findings.push({
      issue: "Posible pérdida de postura",
      source: "Heurística",
      score: metrics.postureRetention,
      confidence: 0.66,
      evidence: "Revisar visualmente entre address e impact. La métrica revisable sugiere que podría perderse espacio/postura antes del contacto.",
      drill: "Chair drill",
      description: "Coloca una silla detrás de la cadera y conserva el contacto suave hasta después del impacto.",
      nextMetric: "Posture retention"
    });
  }

  if (state.viewType === "FO" && metrics.postureRetention < 60) {
    findings.push({
      issue: "Posible eje cambiante en impacto",
      source: "Heurística",
      score: metrics.postureRetention,
      confidence: 0.58,
      evidence: "En FO, revisa si cabeza y pecho se desplazan demasiado antes de impacto.",
      drill: "Step-through controlado",
      description: "Haz medio swing dejando que el peso avance sin que el torso se lance hacia la bola.",
      nextMetric: "Impact posture"
    });
  }

  if (state.viewType === "DTL" && metrics.handPath < 62) {
    findings.push({
      issue: "Posible ruta de manos hacia fuera",
      source: "Heurística",
      score: metrics.handPath,
      confidence: 0.61,
      evidence: "La transición top-impact queda como punto a revisar con las líneas del visor.",
      drill: "Pump drill bajo plano",
      description: "Pausa en top, baja manos hacia el bolsillo trasero y golpea medio swing.",
      nextMetric: "Hand path DTL"
    });
  }

  if (metrics.finishBalance < 65) {
    findings.push({
      issue: "Posible finish poco estable",
      source: "Heurística",
      score: metrics.finishBalance,
      confidence: 0.7,
      evidence: "El equilibrio final está por debajo del umbral inicial del MVP.",
      drill: "Hold finish",
      description: "Mantén el finish tres segundos mirando el objetivo después de cada bola.",
      nextMetric: "Finish balance"
    });
  }

  if (metrics.holdFinishSec != null && metrics.holdFinishSec < 0.45) {
    findings.push({
      issue: "Posible finish demasiado corto",
      source: "Heurística",
      score: Math.round(metrics.holdFinishSec * 100),
      confidence: 0.63,
      evidence: `El finish queda marcado solo ${metrics.holdFinishSec.toFixed(2)} s después del impacto.`,
      drill: "Finish freeze",
      description: "Golpea al 70% y congela el finish hasta que la bola aterrice.",
      nextMetric: "Hold finish time"
    });
  }

  const sorted = findings.sort((a, b) => a.score - b.score);
  const primary = sorted[0] || {
    issue: "Swing equilibrado para el MVP",
    score: metrics.overallScore,
    confidence: 0.58,
    source: "Heurística",
    evidence: "Las métricas están en rango razonable. Conviene acumular historial con el mismo encuadre.",
    drill: "Repetición de referencia",
    description: "Guarda este swing como referencia y compara la próxima sesión con la misma vista y palo.",
    nextMetric: "Consistencia"
  };

  return {
    summary: buildSummary(state, metrics, primary),
    primaryIssue: primary.issue,
    confidenceLabel: confidenceLabel(metrics.confidence),
    evidence: primary.evidence,
    evidenceSource: primary.source || "Heurística",
    drill: {
      name: primary.drill,
      description: primary.description
    },
    nextMetric: primary.nextMetric,
    recommendations: sorted.slice(0, 5).map((item) => ({
      ...item,
      confidenceLabel: confidenceLabel(Math.round((item.confidence || 0.5) * 100)),
      source: item.source || "Heurística"
    })),
    explanations: buildExplanations(metrics)
  };
}

function buildSummary(state, metrics, primary) {
  const tempo = metrics.tempoRatio ? `Tempo ${metrics.tempoRatio.toFixed(2)}:1` : "Tempo pendiente";
  const auto = state.videoAnalysis?.summary?.signal != null ? `Movimiento ${state.videoAnalysis.summary.signal}/100 aprox.` : "Movimiento revisable.";
  return `${tempo}. Vista ${state.viewType}. ${auto} Prioridad: ${primary.issue.toLowerCase()}.`;
}

function confidenceLabel(confidence) {
  if (confidence >= 80) return "Confianza alta";
  if (confidence >= 60) return "Confianza media";
  return "Confianza baja";
}

function buildExplanations(metrics) {
  return [
    {
      title: "Tempo",
      body: metrics.tempoRatio
        ? `Mide cuánto tarda la subida frente a la bajada. Un valor cercano a 3:1 suele ser una referencia simple para revisar ritmo, no una ley universal.`
        : "Aparece cuando address, top e impact están marcados."
    },
    {
      title: "Capture score",
      body: "Resume si el vídeo permite confiar en el análisis: luz, estabilidad, resolución, fps y visibilidad. Si baja, conviene repetir captura antes de corregir técnica."
    },
    {
      title: "Métricas revisables",
      body: "Son estimaciones revisables del MVP basadas en movimiento del vídeo y timing. No son todavía landmarks ni IA biomecánica; usa Comprobar para saltar al frame relevante y ajustarlas manualmente."
    }
  ];
}

function defaultExplanations() {
  return [
    {
      title: "Cómo empieza",
      body: "Sube un vídeo, ajusta encuadre y guía, y pulsa Analizar. La orientación se reconoce al cargar; fases, capture score y métricas se calculan cuando tú lo pides."
    },
    {
      title: "Vista de bola",
      body: "La pestaña Bola es independiente: sirve para ver trayectoria y resultado sin mezclarlo con el análisis técnico del swing."
    }
  ];
}

  })(SwingLabModules);


  // ---- export.js ----
  (function (exports) {
exports.downloadJson = function downloadJson(filename, data) {
  downloadBlob(filename, JSON.stringify(data, null, 2), "application/json");
}

exports.downloadCsv = function downloadCsv(filename, metrics) {
  const rows = Object.entries(metrics).map(([key, value]) => [key, value == null ? "" : value]);
  const csv = [["metric", "value"], ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}

exports.downloadPng = function downloadPng(filename, video, overlayCanvas) {
  const canvas = document.createElement("canvas");
  const width = overlayCanvas.canvas.width || 1280;
  const height = overlayCanvas.canvas.height || 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  overlayCanvas.render(ctx, { width, height }, true);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(filename, blob, "image/png");
  }, "image/png");
}

function downloadBlob(filename, body, type) {
  const blob = body instanceof Blob ? body : new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

  })(SwingLabModules);


  // ---- storage.js ----
  (function (exports) {
const DB_NAME = "swing-lab-ai";
const DB_VERSION = 2;
const STORE = "sessions";

exports.saveSession = async function saveSession(session) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(session));
}

exports.listSessions = async function listSessions() {
  const db = await openDb();
  const records = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  return records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

exports.getSession = async function getSession(id) {
  const db = await openDb();
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

  })(SwingLabModules);


  // ---- video-analysis.js ----
  (function (exports) {
const EVENT_ORDER = ["address", "top", "impact", "finish"];

exports.analyzeVideo = async function analyzeVideo(video, { fps = 60, onProgress } = {}) {
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

exports.buildAnalysis = function buildAnalysis({ samples, fps, duration, width, height }) {
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

  })(SwingLabModules);


  // ---- ball-tracking.js ----
  (function (exports) {
exports.detectBallTrajectory = async function detectBallTrajectory(video, options = {}) {
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

exports.buildTrajectoryFromDetections = function buildTrajectoryFromDetections(detections = [], options = {}) {
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

  })(SwingLabModules);


  // ---- learning.js ----
  (function (exports) {
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

exports.listCorrectionExamples = function listCorrectionExamples() {
  return [...(isDemoLearningEnabled() ? DEMO_EXAMPLES : []), ...readStoredExamples()];
}

exports.correctionExampleCount = function correctionExampleCount() {
  return listCorrectionExamples().length;
}

exports.storedCorrectionExampleCount = function storedCorrectionExampleCount() {
  return readStoredExamples().length;
}

exports.demoCorrectionExampleCount = function demoCorrectionExampleCount() {
  return DEMO_EXAMPLES.length;
}

exports.isDemoLearningEnabled = function isDemoLearningEnabled() {
  if (!canUseLocalStorage()) return memoryDemoMode;
  return localStorage.getItem(DEMO_MODE_KEY) === "1";
}

exports.setDemoLearningEnabled = function setDemoLearningEnabled(enabled) {
  if (!canUseLocalStorage()) {
    memoryDemoMode = Boolean(enabled);
    return memoryDemoMode;
  }
  localStorage.setItem(DEMO_MODE_KEY, enabled ? "1" : "0");
  return enabled;
}

exports.findLearningMatch = function findLearningMatch(state) {
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

exports.blendAnalysisWithLearning = function blendAnalysisWithLearning(analysis, state) {
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

exports.saveCorrectionExample = function saveCorrectionExample(state) {
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

  })(SwingLabModules);


  // ---- main.js ----
  const {
    VideoPlayer, formatTime, OverlayCanvas, drawBallPath, calculateMetrics, metricRows, buildRecommendations,
    downloadCsv, downloadJson, downloadPng, getSession, listSessions, saveSession, analyzeVideo, detectBallTrajectory,
    blendAnalysisWithLearning, correctionExampleCount, demoCorrectionExampleCount, findLearningMatch, isDemoLearningEnabled,
    saveCorrectionExample, setDemoLearningEnabled, storedCorrectionExampleCount
  } = SwingLabModules;

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
  const failedName = state.videoName || els.videoFileName?.textContent || "Vídeo seleccionado";

  // Important: do not return to the home screen here. Some phones/cameras export MOV/HEVC
  // or other codecs that the browser cannot preview. In that case the user must still see
  // that the file was selected, together with a clear conversion message.
  state.flowStep = "frame";
  state.isHistoryOnly = false;
  state.videoSize = { width: 0, height: 0 };
  state.duration = 0;
  state.totalFrames = 0;
  state.currentFrame = 0;
  state.videoAnalysis = null;
  state.events = { address: null, top: null, impact: null, finish: null };
  state.eventMeta = {};
  state.reviewedEvents = {};

  if (els.homeScreen) els.homeScreen.classList.add("is-collapsed");
  if (els.swingWorkspace) {
    els.swingWorkspace.classList.add("has-video");
    els.swingWorkspace.classList.remove("is-hidden");
  }
  if (els.videoFileName) els.videoFileName.textContent = `${failedName} · formato no compatible`;
  if (els.videoScreenTitle) els.videoScreenTitle.textContent = failedName;
  if (els.orientationBadge) els.orientationBadge.textContent = "Codec no compatible";
  if (els.analysisStatus) {
    els.analysisStatus.textContent = "El archivo se ha seleccionado, pero este navegador no puede previsualizarlo. Convierte/exporta el swing a MP4 H.264/AAC y vuelve a cargarlo.";
  }
  if (els.emptyStage) {
    els.emptyStage.style.display = "grid";
    els.emptyStage.innerHTML = `
      <div>
        <p class="eyebrow">Vídeo seleccionado</p>
        <h2>Formato no previsualizable</h2>
        <p>La app ha recibido el archivo, pero el navegador no puede reproducir este codec. Prueba con MP4 H.264/AAC.</p>
      </div>
    `;
  }
  if (els.ballEmptyStage) els.ballEmptyStage.style.display = "grid";
  setAppStatus("error", "Formato no compatible");
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


function showVideoWorkspaceImmediately(file, objectUrl) {
  state.videoName = file?.name || state.videoName || "Vídeo de swing";
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
  if (typeof syncCaptureInputs === "function") syncCaptureInputs();
  if (els.videoFileName) els.videoFileName.textContent = state.videoName;
  const emptyPreview = els.emptyStage?.querySelector("img");
  if (emptyPreview) emptyPreview.src = "./assets/swing-guide.svg";
  if (els.emptyStage) els.emptyStage.style.display = "none";
  if (els.ballEmptyStage) els.ballEmptyStage.style.display = "none";
  if (els.homeScreen) els.homeScreen.classList.add("is-collapsed");
  if (els.swingWorkspace) els.swingWorkspace.classList.add("has-video");
  if (els.videoScreenTitle) els.videoScreenTitle.textContent = state.videoName;
  if (els.orientationBadge) els.orientationBadge.textContent = "Vídeo cargado";
  if (els.analysisStatus) els.analysisStatus.textContent = "Vídeo seleccionado. Abriendo visor y leyendo metadata...";
  if (els.ballPathStatus) els.ballPathStatus.textContent = "La trayectoria aparece después de detectar la bola.";
  if (typeof renderBallLaunch === "function") renderBallLaunch();
  state.videoObjectUrl = objectUrl;
  setAppStatus("loaded", "Vídeo cargado");
  updateAnalysis();
}

function loadSelectedVideoFile(file, existingObjectUrl = "") {
  if (!file) return;
  if (pendingVideoLoadTimer) {
    window.clearTimeout(pendingVideoLoadTimer);
    pendingVideoLoadTimer = null;
  }
  if (player.objectUrl && player.objectUrl !== existingObjectUrl) URL.revokeObjectURL(player.objectUrl);
  const objectUrl = existingObjectUrl || player.load(file);
  if (existingObjectUrl) {
    player.objectUrl = existingObjectUrl;
    els.video.src = existingObjectUrl;
    els.video.load();
  }
  showVideoWorkspaceImmediately(file, objectUrl);
  if (els.ballVideo) {
    els.ballVideo.src = objectUrl;
    els.ballVideo.load();
  }
  scheduleVideoLoadGuard(file);
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

  els.videoInput?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    loadSelectedVideoFile(file);
  });

  window.addEventListener("swinglab:fallback-video-selected", (event) => {
    const file = event.detail?.file;
    const objectUrl = event.detail?.objectUrl;
    if (!file || !objectUrl) return;
    if (state.videoObjectUrl === objectUrl) return;
    loadSelectedVideoFile(file, objectUrl);
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



})();
