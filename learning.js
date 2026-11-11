/* Auditable local corrections. Collecting feedback never trains or uploads a model. */
(function(root,factory){const api=factory(root.SwingLabVideo||(typeof require==='function'?require('./video-tools.js'):null),root.SwingLabReferences||(typeof require==='function'?require('./references.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabLearning=api})(globalThis,(V,R)=>{
  'use strict';const PROTOCOL='swing-phases/1.0',PHASES=['Address','Takeaway','Top','Impact','Finish'],finite=Number.isFinite,clone=x=>JSON.parse(JSON.stringify(x)),safeId=x=>typeof x==='string'&&/^[-\w]{1,100}$/.test(x),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),stamp=x=>typeof x==='string'&&finite(Date.parse(x)),validTime=(t,d)=>finite(t)&&t>=0&&t<=d;
  function marks(value,duration){return Object.fromEntries(PHASES.filter(p=>validTime(value?.[p],duration)).map(p=>[p,value[p]]))}
  function analysisWindow(raw,duration){
    if(!raw||!validTime(raw.start,duration)||!validTime(raw.end,duration)||raw.end<=raw.start)return null;
    return {start:raw.start,end:raw.end,method:String(raw.method||'').slice(0,100),alternatives:Array.isArray(raw.alternatives)?raw.alternatives.filter(w=>validTime(w?.start,duration)&&validTime(w?.end,duration)&&w.end>w.start).slice(0,30).map(w=>({start:w.start,end:w.end})):[],warnings:Array.isArray(raw.warnings)?raw.warnings.slice(0,10).map(s=>String(s).slice(0,500)):[]};
  }
  function canReplaceProposal(session,previousRun,phase){
    if(phase==='Impact'&&Number.isFinite(session.impactReference?.time))return false;
    if(session.referenceReview||reviewMatches(session)||negativeMatches(session))return false;
    if(session.phases?.[phase]==null)return true;
    return !!previousRun&&session.phases[phase]===previousRun.phases?.[phase]&&!(session.corrections||[]).some(c=>c.phase===phase&&!c.supersededBy&&c.analysisId===previousRun.runId);
  }
  function impactEvidence(raw,duration){
    if(!raw||!['user-impact','audio-model-agreement','model-only','disagreement','no-model-impact'].includes(raw.source)||!['needs-review','needs-impact'].includes(raw.status))return null;
    const result={source:raw.source,status:raw.status,note:String(raw.note||'').slice(0,1000)};
    for(const key of ['anchor','modelImpact','audioImpact'])if(validTime(raw[key],duration))result[key]=raw[key];
    if(finite(raw.distance)&&raw.distance>=0)result.distance=raw.distance;
    return result;
  }
  function impactReference(raw,duration,videoSha256){
    if(!raw||raw.source!=='user-impact'||!finite(duration)||!validTime(raw.time,duration)||raw.time<=0||raw.time>=duration||!stamp(raw.updatedAt))return null;
    if(raw.videoSha256!=null&&(!hash(raw.videoSha256)||raw.videoSha256!==videoSha256))return null;
    return {time:raw.time,source:'user-impact',updatedAt:raw.updatedAt,videoSha256:hash(raw.videoSha256)?raw.videoSha256:null};
  }
  function analysis(raw,duration){
    if(!raw||!safeId(raw.runId)||!hash(raw.videoSha256)||raw.protocol!==PROTOCOL||!stamp(raw.createdAt)||!['needs-review','needs-segment','rejected','unsupported-view'].includes(raw.status))return null;
    return {runId:raw.runId,modelId:String(raw.modelId||'').slice(0,100),protocol:PROTOCOL,checkpointSha256:hash(raw.checkpointSha256)?raw.checkpointSha256:null,modelFiles:Object.fromEntries(['encoder','temporal'].map(key=>[key,{sha256:hash(raw.modelFiles?.[key]?.sha256)?raw.modelFiles[key].sha256:null}])),videoSha256:raw.videoSha256,createdAt:raw.createdAt,status:raw.status,view:raw.view==='FO'?'FO':'DTL',phases:marks(raw.phases,duration),sampleTimes:Array.isArray(raw.sampleTimes)?raw.sampleTimes.filter(t=>validTime(t,duration)).slice(0,200):[],window:analysisWindow(raw.window,duration),preprocessing:String(raw.preprocessing||'').slice(0,100),sampling:{frames:48,imageSize:144},impactEvidence:impactEvidence(raw.impactEvidence,duration),initialPhases:marks(raw.initialPhases,duration),audioCandidates:Array.isArray(raw.audioCandidates)?raw.audioCandidates.filter(c=>validTime(c?.time,duration)).slice(0,3).map(c=>({time:c.time,source:'audio-transient',status:'needs-review'})):[],note:String(raw.note||'').slice(0,2000)};
  }
  function correction(raw,duration){
    if(!raw||!safeId(raw.id)||!PHASES.includes(raw.phase)||!stamp(raw.createdAt)||![raw.previousTime,raw.proposedTime,raw.correctedTime].every(t=>t==null||validTime(t,duration)))return null;
    const context=raw.context&&typeof raw.context==='object'?raw.context:{};
    return {id:raw.id,phase:raw.phase,analysisId:safeId(raw.analysisId)?raw.analysisId:null,modelId:String(raw.modelId||'').slice(0,100),protocol:PROTOCOL,createdAt:raw.createdAt,reviewer:String(raw.reviewer||'').slice(0,100),previousTime:raw.previousTime??null,proposedTime:raw.proposedTime??null,correctedTime:raw.correctedTime??null,deltaSeconds:finite(raw.proposedTime)&&finite(raw.correctedTime)?raw.correctedTime-raw.proposedTime:null,supersededBy:safeId(raw.supersededBy)?raw.supersededBy:null,context:{status:['pending','captured','unavailable','superseded'].includes(context.status)?context.status:'pending',precision:context.precision==='source-frame-windows'?'source-frame-windows':'seconds-window',radiusFrames:context.precision==='source-frame-windows'?6:null,radiusSeconds:context.precision==='source-frame-windows'?null:.2,proposedFrame:Number.isInteger(context.proposedFrame)&&context.proposedFrame>=0?context.proposedFrame:null,correctedFrame:Number.isInteger(context.correctedFrame)&&context.correctedFrame>=0?context.correctedFrame:null,deltaFrames:Number.isInteger(context.deltaFrames)?context.deltaFrames:null,imageKeys:Array.isArray(context.imageKeys)?context.imageKeys.filter(safeId).slice(0,26):[],note:String(context.note||'').slice(0,1000)}};
  }
  function reviewMatches(session){const r=session.review;if(r?.status!=='reviewed'||r.protocol!==PROTOCOL||!hash(session.videoSha256)||r.videoSha256!==session.videoSha256||!stamp(r.confirmedAt)||!r.reviewer?.trim())return false;let previous=-1;return PHASES.every(p=>{const t=session.phases?.[p];if(!validTime(t,session.duration)||t<=previous||r.phases?.[p]!==t)return false;previous=t;return true})}
  function negativeMatches(session){const r=session.review;return !!(r?.status==='negative'&&r.protocol===PROTOCOL&&hash(session.videoSha256)&&r.videoSha256===session.videoSha256&&stamp(r.confirmedAt)&&r.reviewer?.trim()&&Object.keys(session.phases||{}).length===0)}
  function validSegment(value,duration){return duration&&value&&finite(value.start)&&finite(value.end)&&value.start>=0&&value.end<=duration&&value.end-value.start>=.5?{start:value.start,end:value.end}:null}
  function normalize(value){
    const duration=finite(value.duration)&&value.duration>0&&value.duration<=600?value.duration:null;
    const result={duration,videoSha256:hash(value.videoSha256)?value.videoSha256:null,view:value.view==='FO'?'FO':'DTL',timing:V.normalizeTiming(value.timing,duration||0),feedbackEnabled:value.feedbackEnabled!==false,analyses:duration&&Array.isArray(value.analyses)?value.analyses.map(r=>analysis(r,duration)).filter(Boolean):[],corrections:duration&&Array.isArray(value.corrections)?value.corrections.map(r=>correction(r,duration)).filter(Boolean):[],review:{status:'draft'}};
    result.analysisRange=duration&&globalThis.SwingLabSegment?SwingLabSegment.normalize(value.analysisRange,duration):validSegment(value.analysisRange,duration);
    result.impactReference=impactReference(value.impactReference,duration,result.videoSha256);
    if(reviewMatches({...value,...result,review:value.review}))result.review={status:'reviewed',protocol:PROTOCOL,videoSha256:result.videoSha256,confirmedAt:value.review.confirmedAt,reviewer:value.review.reviewer.slice(0,100),phases:marks(value.review.phases,duration)};
    if(negativeMatches({...value,...result,review:value.review}))result.review={status:'negative',protocol:PROTOCOL,videoSha256:result.videoSha256,confirmedAt:value.review.confirmedAt,reviewer:value.review.reviewer.slice(0,100),phases:{}};
    if(R){result.referenceReview=R.snapshot(value.referenceReview,result.videoSha256);result.referenceHistory=Array.isArray(value.referenceHistory)?value.referenceHistory.map(r=>R.snapshot(r,result.videoSha256)).filter(Boolean):[]}
    return result;
  }
  function record(session,phase,previousTime,correctedTime,reviewer){
    session.review={status:'draft'};if(session.feedbackEnabled===false||previousTime===correctedTime)return;
    const run=session.analyses?.at(-1),event={id:crypto.randomUUID(),phase,analysisId:run?.runId||null,modelId:run?.modelId||'',protocol:PROTOCOL,createdAt:new Date().toISOString(),reviewer:reviewer||'',previousTime:previousTime??null,proposedTime:run?.phases?.[phase]??null,correctedTime:correctedTime??null,context:{status:'pending'}};
    session.corrections=session.corrections||[];for(const old of session.corrections)if(old.phase===phase&&old.analysisId===event.analysisId&&!old.supersededBy){old.supersededBy=event.id;if(old.context?.status==='pending')old.context.status='superseded'}session.corrections.push(event);
  }
  async function collect(file,session,onProgress){
    const pending=(session.corrections||[]).filter(e=>!e.supersededBy&&e.context?.status==='pending');if(!pending.length||session.feedbackEnabled===false)return [];
    const media=[],controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let resource;
    try{
      const info=await SwingLabLocal.prepare(file,controller.signal);Object.assign(session,{duration:info.duration,videoSha256:info.sha256,timing:info.timing});resource=await V.open(file,controller.signal);
      const video=resource.video,scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));const ctx=canvas.getContext('2d');
      for(const event of pending){
        const requests=new Map();for(const [role,center]of [['proposed',event.proposedTime??event.previousTime],['corrected',event.correctedTime]])for(const point of V.window(info.timing,center,info.duration)){const key=point.frameIndex==null?'t'+Math.round(point.time*1e6):'f'+point.frameIndex;if(!requests.has(key))requests.set(key,{...point,roles:[]});requests.get(key).roles.push(role)}
        const proposedFrame=V.frameIndex(info.timing,event.proposedTime),correctedFrame=V.frameIndex(info.timing,event.correctedTime);
        event.context={status:'pending',precision:info.timing.verified?'source-frame-windows':'seconds-window',radiusFrames:info.timing.verified?6:null,radiusSeconds:info.timing.verified?null:.2,proposedFrame,correctedFrame,deltaFrames:proposedFrame!=null&&correctedFrame!=null?correctedFrame-proposedFrame:null,imageKeys:[],note:'JPEG images are review previews. Use source video timestamps for training extraction.'};
        for(const [key,point]of requests){
          onProgress?.('Saving correction context on this device…');let observedTime=null,callback;
          if(video.requestVideoFrameCallback)callback=video.requestVideoFrameCallback((_,metadata)=>{observedTime=metadata.mediaTime});
          try{const next=point.frameIndex==null?null:info.timing.times[point.frameIndex+1],offset=next==null?.001:Math.min(.008,(next-point.time)/2);await V.seek(video,Math.max(0,Math.min(info.duration-.001,point.time+offset)),controller.signal);await new Promise(resolve=>setTimeout(resolve,0));ctx.drawImage(video,0,0,canvas.width,canvas.height);
            const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Frame encoding failed.')),'image/jpeg',.72)),imageKey=event.id+'-'+key;
            media.push({key:imageKey,eventId:event.id,time:point.time,frameIndex:point.frameIndex,observedTime,decodedFrameVerified:observedTime!=null&&point.frameIndex!=null&&V.frameIndex(info.timing,observedTime)===point.frameIndex,roles:point.roles,width:canvas.width,height:canvas.height,blob});event.context.imageKeys.push(imageKey);
          }finally{if(callback!=null)video.cancelVideoFrameCallback(callback)}
        }event.context.status='captured';
      }
    }catch(error){for(const event of pending)if(event.context.status==='pending'){event.context.status='unavailable';event.context.note=error.name==='AbortError'?'Context capture exceeded 30 seconds. The original video remains available in the saved session.':String(error.message)}}
    finally{clearTimeout(timer);resource?.close()}return media;
  }
  const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
  async function zip(entries){
    if(entries.length>65535)throw Error('Too many files for one export.');const parts=[],directory=[];let offset=0;
    for(const entry of entries){if(!/^[\w./-]+$/.test(entry.name)||entry.name.includes('..')||entry.name.startsWith('/'))throw Error('Invalid archive path.');const name=new TextEncoder().encode(entry.name),blob=entry.data instanceof Blob?entry.data:new Blob([entry.data]);if(blob.size>0xffffffff)throw Error('This export is too large.');let crc=0xffffffff;const reader=blob.stream().getReader();try{while(true){const {value,done}=await reader.read();if(done)break;for(const b of value)crc=crcTable[(crc^b)&255]^(crc>>>8)}}finally{reader.releaseLock()}crc=(crc^0xffffffff)>>>0;
      const local=new Uint8Array(30+name.length),a=new DataView(local.buffer);a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(6,0x800,true);a.setUint16(12,33,true);a.setUint32(14,crc,true);a.setUint32(18,blob.size,true);a.setUint32(22,blob.size,true);a.setUint16(26,name.length,true);local.set(name,30);parts.push(local,blob);
      const central=new Uint8Array(46+name.length),b=new DataView(central.buffer);b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);b.setUint16(8,0x800,true);b.setUint16(14,33,true);b.setUint32(16,crc,true);b.setUint32(20,blob.size,true);b.setUint32(24,blob.size,true);b.setUint16(28,name.length,true);b.setUint32(42,offset,true);central.set(name,46);directory.push(central);offset+=local.length+blob.size;
    }
    const directorySize=directory.reduce((n,p)=>n+p.length,0);if(offset+directorySize>0xffffffff)throw Error('This export is too large.');const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,directorySize,true);v.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
  }
  async function exportPack(sessions,store,includeVideo){
    const entries=[],records=[];
    for(const session of sessions){const prefix='sessions/'+session.id+'/',images=await store.feedback(session.id),record={id:session.id,phases:session.phases,...normalize(session),trainingEligible:reviewMatches(session)&&!session.referenceReview,validityLabel:negativeMatches(session)?'no-swing':reviewMatches(session)?'swing':'unconfirmed',contextImages:[]};
      for(const image of images){const path=prefix+'contexts/'+image.key+'.jpg';record.contextImages.push({...image,blob:undefined,path});entries.push({name:path,data:image.blob})}
      if(includeVideo){const video=await store.video(session.id);if(video){const ext=video.type.includes('webm')?'webm':video.type.includes('quicktime')?'mov':'mp4';record.videoPath=prefix+'original.'+ext;entries.push({name:record.videoPath,data:video})}}
      records.push(record);
    }
    const manifest={schema:1,kind:'swinglab-learning-pack',protocol:PROTOCOL,createdAt:new Date().toISOString(),policy:'No automatic training or upload. Only explicitly confirmed phase sets are eligible; split by source recording/player before any future training.',includesOriginalVideos:!!includeVideo,records};entries.unshift({name:'manifest.json',data:JSON.stringify(manifest,null,2)});return zip(entries);
  }
  return {PROTOCOL,PHASES,normalize,record,collect,reviewMatches,negativeMatches,canReplaceProposal,exportPack,zip};
});
