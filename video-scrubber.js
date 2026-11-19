/* Coalesce drag input while the decoder is busy, with exact seeks throughout. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwingLabScrubber = api;
})(globalThis, () => {
  'use strict';
  function create(video, {onTarget=()=>{}, schedule=fn=>requestAnimationFrame(fn), cancel=id=>cancelAnimationFrame(id)}={}) {
    let pending = null, scheduled = null, dragging = false, target = null;
    function flush() {
      scheduled = null;
      if (pending == null || video.seeking || video.readyState < 1) return;
      const next = pending;
      pending = null;
      if (Math.abs(video.currentTime-next) < .001) {
        if (!dragging) target = null;
        return;
      }
      video.currentTime = next;
    }
    function pump() {
      if (scheduled == null && pending != null) scheduled = schedule(flush);
    }
    function seek(time) {
      if (!Number.isFinite(time) || !Number.isFinite(video.duration)) return;
      if (!video.paused) video.pause();
      pending = target = Math.max(0,Math.min(Math.max(0,video.duration-.001),time));
      onTarget(target);
      pump();
    }
    function begin() { dragging = true; video.pause(); }
    function end(time) {
      dragging = false;
      if (Number.isFinite(time)) seek(time);
    }
    function reset() {
      if (scheduled != null) cancel(scheduled);
      scheduled = pending = target = null;
      dragging = false;
    }
    function settled() {
      if (pending != null) pump();
      else if (!dragging) target = null;
    }
    video.addEventListener('seeked',settled);
    video.addEventListener('loadeddata',settled);
    video.addEventListener('emptied',reset);
    return {seek,begin,end,reset,get active(){return dragging||target!=null},get target(){return target}};
  }
  return {create};
});
