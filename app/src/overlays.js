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
  const guide = state.guide || { x: 0.5, y: 0.8, scale: 1 };
  const cx = width * guide.x;
  const groundY = height * guide.y;
  const scale = guide.scale;
  const stance = width * 0.18 * scale;
  const bodyHeight = height * 0.52 * scale;
  const bodyWidth = width * 0.18 * scale;

  ctx.save();
  ctx.lineWidth = Math.max(2, width * 0.003);
  ctx.strokeStyle = "rgba(215, 181, 109, 0.82)";
  line(ctx, Math.max(0, cx - stance * 1.6), groundY, Math.min(width, cx + stance * 1.6), groundY);

  ctx.setLineDash([10, 10]);
  ctx.strokeStyle = "rgba(247, 242, 220, 0.45)";
  line(ctx, cx - stance, groundY - bodyHeight * 0.04, cx + stance, groundY - bodyHeight * 0.04);
  line(ctx, cx, groundY, cx, Math.max(0, groundY - bodyHeight));

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 250, 240, 0.72)";
  roundRect(ctx, cx - bodyWidth / 2, groundY - bodyHeight, bodyWidth, bodyHeight, 18);
  ctx.stroke();

  ctx.strokeStyle = state.viewType === "DTL" ? "rgba(121, 173, 220, 0.78)" : "rgba(131, 197, 190, 0.78)";
  ctx.setLineDash([8, 9]);
  if (state.viewType === "FO") {
    line(ctx, cx - stance, groundY, cx - stance, groundY - bodyHeight * 0.75);
    line(ctx, cx + stance, groundY, cx + stance, groundY - bodyHeight * 0.75);
  } else {
    line(ctx, cx - stance * 0.8, groundY, cx + stance * 1.3, groundY - bodyHeight * 0.72);
  }

  ctx.fillStyle = "rgba(255, 250, 240, 0.86)";
  ctx.font = `${Math.max(11, width * 0.012)}px Inter, sans-serif`;
  ctx.fillText("Alinea pies y bola", Math.max(8, cx - stance * 1.6), Math.max(18, groundY - bodyHeight - 10));
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

export function drawBallPath(ctx, width, height, points, label = "") {
  ctx.clearRect(0, 0, width, height);
  if (!points?.length) return;
  ctx.save();
  ctx.lineWidth = Math.max(3, width * 0.004);
  ctx.strokeStyle = "rgba(215, 181, 109, 0.95)";
  ctx.fillStyle = "rgba(255, 250, 240, 0.96)";
  ctx.beginPath();
  const first = points[0];
  ctx.moveTo(first.x * width, first.y * height);
  if (points.length === 2) {
    const [a, b] = points;
    ctx.lineTo(b.x * width, b.y * height);
  } else {
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const prev = points[i - 1];
      const midX = ((prev.x + point.x) / 2) * width;
      const midY = ((prev.y + point.y) / 2) * height;
      ctx.quadraticCurveTo(prev.x * width, prev.y * height, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x * width, last.y * height);
  }
  ctx.stroke();
  points.forEach((point, index) => {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, index === points.length - 1 ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();
  });
  if (label) {
    ctx.font = `${Math.max(13, width * 0.014)}px Inter, sans-serif`;
    ctx.fillText(label, points[points.length - 1].x * width + 12, points[points.length - 1].y * height - 12);
  }
  ctx.restore();
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
