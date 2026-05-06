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

export class OverlayCanvas {
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

    if (!ctx || width < 8 || height < 8) return;
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

export function drawBallPath(ctx, width, height, points, label = "", options = {}) {
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
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  if (safeWidth <= 0 || safeHeight <= 0) return;
  const r = Math.max(0, Math.min(radius, safeWidth / 2, safeHeight / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + safeWidth, y, x + safeWidth, y + safeHeight, r);
  ctx.arcTo(x + safeWidth, y + safeHeight, x, y + safeHeight, r);
  ctx.arcTo(x, y + safeHeight, x, y, r);
  ctx.arcTo(x, y, x + safeWidth, y, r);
  ctx.closePath();
}

function angleBetween(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
}
