/* Keep only the newest requested frame. Never restart a decoder mid-seek. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabScrubber=api})(globalThis,()=>{
 'use strict';
 function create(video,{onTarget=()=>{},schedule=fn=>requestAnimationFrame(fn),cancel=id=>cancelAnimationFrame(id)}={}){
  let target=null,frame=null,exact=false,dragging=false;
  const clamp=t=>Math.max(0,Math.min(Math.max(0,(video.duration||0)-.001),t));
  function flush(){frame=null;if(target==null||video.seeking||video.readyState<1)return;const next=target,precise=exact;target=null;exact=false;
   if(Math.abs(video.currentTime-next)<.001)return;
   if(!precise&&typeof video.fastSeek==='function')video.fastSeek(next);else video.currentTime=next;
  }
  function pump(){if(frame==null)frame=schedule(flush)}
  function seek(time,final=false){if(!Number.isFinite(time)||!Number.isFinite(video.duration))return;video.pause();target=clamp(time);exact=exact||final;onTarget(target);pump()}
  function begin(){dragging=true;video.pause()}
  function end(time){dragging=false;if(Number.isFinite(time))seek(time,true);else if(target!=null){exact=true;pump()}}
  function reset(){if(frame!=null)cancel(frame);frame=null;target=null;exact=false;dragging=false}
  const settled=()=>{if(target!=null)pump()};
  video.addEventListener('seeked',settled);video.addEventListener('loadeddata',settled);video.addEventListener('emptied',reset);
  return {seek,begin,end,reset,get active(){return dragging||target!=null},get target(){return target},destroy(){reset();video.removeEventListener('seeked',settled);video.removeEventListener('loadeddata',settled);video.removeEventListener('emptied',reset)}};
 }
 return {create};
});
