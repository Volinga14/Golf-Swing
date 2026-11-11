/* Non-destructive source-time selection. The original file is never rewritten. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabSegment=api})(globalThis,()=>{
  'use strict';
  const MIN=.5;
  function normalize(value,duration){
    if(!Number.isFinite(duration)||duration<MIN||!value||!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.start<0||value.end>duration||value.end-value.start<MIN-1e-9)return null;
    return {start:value.start,end:value.end};
  }
  function move(value,edge,time,duration){
    if(!Number.isFinite(time)||!['start','end'].includes(edge))return null;
    const current=normalize(value,duration)||normalize({start:0,end:duration},duration);if(!current)return null;
    return edge==='start'?{start:Math.max(0,Math.min(time,current.end-MIN)),end:current.end}:{start:current.start,end:Math.min(duration,Math.max(time,current.start+MIN))};
  }
  function mount({video,getSession,isBusy,changed}){
    const byId=id=>document.getElementById(id),start=byId('analysisRangeStart'),end=byId('analysisRangeEnd'),enabled=byId('useAnalysisRange'),sliders={start:byId('segmentStartSlider'),end:byId('segmentEndSlider')},preview=byId('previewSegment'),reset=byId('resetSegment'),label=byId('segmentSelectionLabel');
    let previewing=false;
    function stop(){if(previewing)video.pause();previewing=false;preview.textContent='Ver tramo';}
    function selected(){return normalize({start:Number(start.value),end:end.value===''?video.duration:Number(end.value)},video.duration)}
    function sync(){
      const valid=selected(),ready=Number.isFinite(video.duration)&&video.duration>=MIN&&video.readyState>=2&&!isBusy();
      for(const edge of ['start','end']){const slider=sliders[edge];slider.max=Number.isFinite(video.duration)?String(video.duration):'0';slider.value=String(valid?.[edge]??(edge==='end'?video.duration||0:0));slider.disabled=!ready;slider.setAttribute('aria-valuetext',`${Number(slider.value).toFixed(2)} segundos`);}
      preview.disabled=!ready||!valid;reset.disabled=!ready;
      label.textContent=valid?`${valid.start.toFixed(2)}–${valid.end.toFixed(2)} s · ${(valid.end-valid.start).toFixed(2)} s${enabled.checked?' seleccionados':' · vídeo completo'}`:'Selecciona al menos 0,5 s dentro del vídeo.';
    }
    function persist(){stop();const session=getSession();if(session)session.analysisRange=enabled.checked?selected():null;changed();sync();}
    function restore(){stop();const saved=normalize(getSession()?.analysisRange,video.duration);enabled.checked=!!saved;start.value=String(saved?.start??0);end.value=Number.isFinite(video.duration)?String(saved?.end??video.duration):'';sync();}
    for(const edge of ['start','end'])sliders[edge].addEventListener('input',()=>{
      if(isBusy())return;const value=move(selected(),edge,Number(sliders[edge].value),video.duration);if(!value)return;
      start.value=String(value.start);end.value=String(value.end);enabled.checked=true;persist();video.currentTime=value[edge];
    });
    for(const input of [start,end,enabled])input.addEventListener('change',()=>{if(!isBusy())persist()});
    reset.addEventListener('click',()=>{if(isBusy())return;start.value='0';end.value=String(video.duration);enabled.checked=false;persist()});
    preview.addEventListener('click',()=>{if(previewing){stop();return}const value=selected();if(!value||isBusy())return;video.pause();video.currentTime=value.start;previewing=true;preview.textContent='Pausar tramo';video.play().catch(()=>{stop();label.textContent='No se pudo reproducir. Usa los controles del vídeo.'})});
    video.addEventListener('timeupdate',()=>{const value=selected();if(previewing&&value&&video.currentTime>=value.end){stop();video.currentTime=value.end}});
    video.addEventListener('pause',()=>{if(previewing&&video.paused){previewing=false;preview.textContent='Ver tramo'}});
    video.addEventListener('loadedmetadata',restore);for(const event of ['loadeddata','seeked','canplay','durationchange'])video.addEventListener(event,sync);video.addEventListener('emptied',()=>{stop();sync()});
    document.addEventListener('swinglab:session-changed',restore);
    return {sync,restore,persist,stop};
  }
  return {normalize,move,mount};
});
