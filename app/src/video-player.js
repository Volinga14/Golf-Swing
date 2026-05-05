export class VideoPlayer {
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

export function formatTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}
