/* The app's only automatic marker. All decoding and inference stays on device. */
(()=>{
  'use strict';const V=SwingLabVideo,C=MarkingCore,M=SwingLabMotion,base=new URL('./',document.currentScript.src),prepared=new WeakMap();
  const id='local-mark-v0.4';let modelPromise;
  async function prepare(file,signal){
    if(!file?.size||file.size>150*1024*1024)throw Error('Choose a video smaller than 150 MB.');
    if(prepared.has(file))return prepared.get(file);
    const resource=await V.open(file,signal);
    try{const bytes=await file.arrayBuffer();if(signal?.aborted)throw new DOMException('Cancelled','AbortError');const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join(''),duration=resource.video.duration;
      const result={sha256,duration,timing:V.timing(bytes,duration),width:resource.video.videoWidth,height:resource.video.videoHeight};prepared.set(file,result);return result;
    }finally{resource.close()}
  }
  async function sample(video,count,start,end,size,timing,signal,onProgress,profile){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true}),side=Math.min(video.videoWidth,video.videoHeight),x=(video.videoWidth-side)/2,y=(video.videoHeight-side)/2,frames=[],times=[],motion=[];let previous;
    for(let i=0;i<count;i++){const requested=Math.max(0,Math.min(video.duration-.001,start+(end-start)*i/(count-1))),index=V.frameIndex(timing,requested),timestamp=index==null?requested:timing.times[index],next=index==null?null:timing.times[index+1],offset=index==null?0:next==null?.001:Math.min(.008,(next-timestamp)/2);await V.seek(video,Math.min(video.duration-.001,timestamp+offset),signal);if(profile)ctx.drawImage(video,0,0,video.videoWidth,video.videoHeight,0,0,size,size);else ctx.drawImage(video,x,y,side,side,0,0,size,size);const rgba=ctx.getImageData(0,0,size,size).data;
      if(profile){let sum=0,sum2=0;const gray=new Float32Array(size*size);for(let p=0;p<gray.length;p++){const g=.299*rgba[p*4]+.587*rgba[p*4+1]+.114*rgba[p*4+2];gray[p]=g;sum+=g;sum2+=g*g}motion.push({time:timestamp,...(previous?M.measure(previous,gray,size):{motion:0,localizedMotion:0,cameraMotion:0,backgroundMotion:0}),variance:sum2/gray.length-(sum/gray.length)**2});previous=gray}else frames.push(rgba.buffer);
      times.push(timestamp);onProgress?.(profile?'Finding the swing on this device…':'Reading the swing frames…',Math.round((profile?0:30)+i/count*30));
    }return {frames,times,profile:motion};
  }
  function run(samples,signal,onProgress){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./lab/candidate-worker.js?v=41-20261030',base)),job=crypto.randomUUID();let timer;
    const clean=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',cancel)},cancel=()=>{clean();reject(new DOMException('Cancelled','AbortError'))};signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{clean();reject(Error('The local marker exceeded two minutes.'))},120000);
    worker.onmessage=e=>{if(e.data.id!==job)return;if(e.data.type==='progress'){onProgress?.(`Marking on this device: ${e.data.value}/48 images…`,60+e.data.value/48*40);return}clean();e.data.type==='error'?reject(Error(e.data.message)):resolve(e.data.result)};worker.onerror=()=>{clean();reject(Error('The local marker could not start. Reconnect once to download its resources.'))};if(signal?.aborted)return cancel();worker.postMessage({id:job,type:'analyze',...samples},samples.frames);
  })}
  async function analyze(file,{signal,onProgress,view='DTL',range,impactAnchor}={}){
    const metadata=await prepare(file,signal);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
    if(!modelPromise)modelPromise=fetch(new URL('./lab/models/model.json',base)).then(r=>{if(!r.ok)throw Error('Model metadata unavailable.');return r.json()}).catch(e=>{modelPromise=null;throw e});const model=await modelPromise;
    const common={id,protocol:C.PROTOCOL,checkpointSha256:model.checkpointSha256,modelFiles:model.files,preprocessing:'browser-motion-audio-impact-v4',videoSha256:metadata.sha256,duration:metadata.duration,timing:metadata.timing,view,createdAt:new Date().toISOString()};
    if(String(view).toLowerCase()!=='dtl')return {...common,status:'unsupported-view',phases:{},note:'This marker is currently validated only for down-the-line videos. Manual marking remains available.'};
    const H=SwingLabHybrid,selected=range?M.range(range,metadata.duration):null;
    const manual=impactAnchor!==undefined?H.select(null,null,metadata.duration,impactAnchor):null;
    if(manual&&selected&&(impactAnchor<=selected.start||impactAnchor>=selected.end))throw Error('The impact reference must be inside the selected segment. Adjust the segment or clear it.');
    const resource=await V.open(file,signal),check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError')};
    try{
      const count=Math.min(481,Math.max(48,Math.ceil((selected?selected.end-selected.start:metadata.duration)*8)+1));
      const coarse=await sample(resource.video,count,selected?.start??0,selected?.end??metadata.duration,96,metadata.timing,signal,onProgress,true),guard=C.motionWindow(coarse.profile,metadata.duration);
      if(guard.status==='rejected')return {...common,status:'rejected',phases:{},window:guard,note:guard.reason};
      const initial=selected||M.select(coarse.profile,metadata.duration),bursts=M.candidates(coarse.profile,metadata.duration).bursts;
      const infer=async(window,anchor)=>{
        check();const samples=await sample(resource.video,48,window.start,window.end,144,metadata.timing,signal,onProgress,false);
        const result=await run({frames:samples.frames,times:samples.times,window,anchor},signal,onProgress);check();
        if(!C.PHASES.every(p=>Number.isFinite(result.phases[p.id]))||C.PHASES.some((p,i)=>i&&result.phases[p.id]<=result.phases[C.PHASES[i-1].id]))throw Error('The clip does not contain enough distinct frames for ordered phase proposals.');
        return {...result,sampleTimes:samples.times};
      };
      const finish=(result,evidence,audio,initialPhases)=>({...result,...common,status:'needs-review',impactEvidence:evidence,audioCandidates:audio?.candidates||[],initialPhases:initialPhases||{},
        note:[evidence?.note,'Segment '+result.window.start.toFixed(2)+'-'+result.window.end.toFixed(2)+' s.',...(result.window.warnings||[]),'Review every phase. No video was uploaded.'].filter(Boolean).join(' ')});
      if(manual){
        const window=selected||H.segment({window:initial},bursts,impactAnchor,metadata.duration);
        return finish(await infer(window,impactAnchor),manual);
      }
      if(initial.status==='needs-segment')return {...common,status:'needs-segment',phases:{},window:initial,impactEvidence:{source:'no-model-impact',status:'needs-impact',note:'Mark the visible impact, or select the complete swing segment, then analyze again.'},note:'Mark the visible impact, or select the complete swing segment, then analyze again.'};
      const baseline=await infer(initial);check();let audio;
      onProgress?.('Checking impact audio on this device.',90);
      try{audio=await SwingLabAudio.analyze(file,{signal})}catch(error){check();audio={candidates:[],note:error.message}}check();
      const evidence=H.select(baseline,audio,metadata.duration);
      if(evidence.status==='needs-impact')return finish(baseline,evidence,audio);
      if(selected&&(evidence.anchor<=selected.start||evidence.anchor>=selected.end))return finish(baseline,{...evidence,status:'needs-impact',source:'disagreement',note:'The sound is outside your selected segment. Review or mark the visible impact.'},audio);
      const window=selected||H.segment(baseline,bursts,evidence.anchor,metadata.duration);
      try{return finish(await infer(window,evidence.anchor),evidence,audio,baseline.phases)}
      catch(error){check();return finish(baseline,{...evidence,status:'needs-impact',note:'The automatic impact could not be refined. Review the proposals or mark the visible impact.'},audio)}
    }finally{resource.close()}
  }

  globalThis.SwingLabLocal={id,prepare,analyze};
})();
