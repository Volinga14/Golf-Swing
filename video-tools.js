/* Source presentation timestamps, never an assumed camera frame rate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabVideo=api})(globalThis,()=>{
  'use strict';
  const finite=Number.isFinite;
  function timing(buffer,duration){
    const unknown={source:'seconds',verified:false,cfrVerified:false,fps:null,times:[]};
    try{
      const v=new DataView(buffer),text=(p,n)=>Array.from({length:n},(_,i)=>String.fromCharCode(v.getUint8(p+i))).join('');
      const u64=p=>{const n=Number(v.getBigUint64(p));if(!Number.isSafeInteger(n))throw Error();return n};
      function boxes(start,end){const out=[];while(start+8<=end){let size=v.getUint32(start),head=8;if(size===1){size=u64(start+8);head=16}if(size===0)size=end-start;if(size<head||start+size>end)throw Error();out.push({type:text(start+4,4),p:start+head,end:start+size});start+=size}if(start!==end)throw Error();return out}
      const children=b=>boxes(b.p,b.end),one=(list,type)=>list.find(b=>b.type===type);
      const moov=one(boxes(0,v.byteLength),'moov');if(!moov)return unknown;
      const tracks=children(moov),mvhd=one(tracks,'mvhd');if(!mvhd||v.getUint8(mvhd.p)>1)return unknown;
      const movieScale=v.getUint32(mvhd.p+(v.getUint8(mvhd.p)===1?20:12));
      const track=tracks.filter(b=>b.type==='trak').find(b=>{const m=one(children(b),'mdia'),h=m&&one(children(m),'hdlr');return h&&text(h.p+8,4)==='vide'});if(!track)return unknown;
      const trackBoxes=children(track),mdia=one(trackBoxes,'mdia'),mdiaBoxes=children(mdia),mdhd=one(mdiaBoxes,'mdhd');
      if(v.getUint8(mdhd.p)>1)return unknown;const scale=v.getUint32(mdhd.p+(v.getUint8(mdhd.p)===1?20:12));if(!scale||!movieScale)return unknown;
      const minf=one(mdiaBoxes,'minf'),stbl=one(children(minf),'stbl'),tables=children(stbl),stts=one(tables,'stts'),ctts=one(tables,'ctts'),stsz=one(tables,'stsz');if(!stts||!stsz)return unknown;
      if(v.getUint8(stts.p)!==0||v.getUint8(stsz.p)!==0||(ctts&&v.getUint8(ctts.p)>1))return unknown;const count=v.getUint32(stsz.p+8);if(!count||count>20000)return unknown;
      function table(box){if(box.p+8>box.end)throw Error();const entries=v.getUint32(box.p+4);if(entries>count||box.p+8+entries*8>box.end)throw Error();return Array.from({length:entries},(_,i)=>{const p=box.p+8+i*8;return [v.getUint32(p),box===ctts&&v.getUint8(box.p)===1?v.getInt32(p+4):v.getUint32(p+4)]})}
      const pts=[],deltas=[];let dts=0;
      for(const [n,delta]of table(stts)){if(!n||!delta||pts.length+n>count)throw Error();for(let i=0;i<n;i++){pts.push(dts);deltas.push(delta);dts+=delta}}
      if(pts.length!==count)return unknown;
      if(ctts){let i=0;for(const [n,offset]of table(ctts)){if(!n||i+n>count)throw Error();for(let j=0;j<n;j++)pts[i++]+=offset}if(i!==count)return unknown}
      let mediaStart=0,delay=0,segmentEnd=Infinity;
      const edts=one(trackBoxes,'edts'),elst=edts&&one(children(edts),'elst');
      if(elst){const version=v.getUint8(elst.p),n=v.getUint32(elst.p+4),stride=version===1?20:12;if(version>1||n<1||n>2||elst.p+8+n*stride>elst.end)return unknown;let positive=0;
        for(let i=0;i<n;i++){const p=elst.p+8+i*stride,span=(version===1?u64(p):v.getUint32(p))/movieScale,media=version===1?Number(v.getBigInt64(p+8)):v.getInt32(p+4),rate=p+(version===1?16:8);if(v.getInt16(rate)!==1||v.getInt16(rate+2)!==0)return unknown;
          if(media===-1&&i===0)delay+=span;else if(media>=0&&++positive===1){mediaStart=media;segmentEnd=delay+span}else return unknown}
        if(positive!==1)return unknown;
      }
      const times=pts.map(t=>(t-mediaStart)/scale+delay).sort((a,b)=>a-b).filter(t=>t>=-1e-7&&t<segmentEnd-1e-7).map(t=>Math.max(0,t));
      if(times.length<2||!finite(duration)||times[0]>.15||times.at(-1)>duration+1e-5||times.some((t,i)=>i&&t<=times[i-1]))return unknown;
      const gaps=times.slice(1).map((t,i)=>t-times[i]),step=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      const presentationEnd=Math.min(segmentEnd,Math.max(...pts.map((t,i)=>(t+deltas[i]-mediaStart)/scale+delay)));
      if(duration-presentationEnd>Math.max(.1,step*3))return unknown;
      const cfr=gaps.every(g=>Math.abs(g-step)<1e-6)&&times[0]<step*1.01;
      return {source:'mp4-presentation-timestamps',verified:true,cfrVerified:cfr,fps:cfr?1/step:null,times};
    }catch{return unknown}
  }
  function normalizeTiming(value,duration){
    const times=value?.times;if(value?.verified!==true||!Array.isArray(times)||times.length<2||times.length>20000||times.some((t,i)=>!finite(t)||t<0||t>duration+.001||(i&&t<=times[i-1])))return {source:'seconds',verified:false,cfrVerified:false,fps:null,times:[]};
    const step=(times.at(-1)-times[0])/(times.length-1),cfr=times.slice(1).every((t,i)=>Math.abs(t-times[i]-step)<1e-6)&&times[0]<step*1.01;
    return {source:'mp4-presentation-timestamps',verified:true,cfrVerified:cfr,fps:cfr?1/step:null,times:[...times]};
  }
  function frameIndex(timing,time){if(!timing?.verified||!timing.times?.length||!finite(time))return null;const times=timing.times;let lo=0,hi=times.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);/* HTML media clocks commonly round source timestamps to microseconds. */if(times[mid]<=time+1e-6)lo=mid;else hi=mid-1}return lo}
  function step(timing,time,direction,duration){const i=frameIndex(timing,time);return i==null?Math.max(0,Math.min(duration-.001,time+direction*.02)):timing.times[Math.max(0,Math.min(timing.times.length-1,i+direction))]}
  function window(timing,time,duration){
    if(!finite(time))return [];const index=frameIndex(timing,time);
    if(index!=null)return timing.times.map((t,i)=>({frameIndex:i,time:t})).slice(Math.max(0,index-6),index+7);
    return Array.from({length:13},(_,i)=>({frameIndex:null,time:Math.max(0,Math.min(duration-.001,time+(i-6)/30))})).filter((x,i,a)=>!i||x.time!==a[i-1].time);
  }
  const abort=()=>new DOMException('Cancelled','AbortError');
  function seek(video,time,signal){if(signal?.aborted)return Promise.reject(abort());if(video.readyState>=2&&!video.seeking&&Math.abs(video.currentTime-time)<.00001)return Promise.resolve();return new Promise((resolve,reject)=>{let timer;const clean=()=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',fail);signal?.removeEventListener('abort',cancel)},done=()=>{clean();resolve()},fail=()=>{clean();reject(Error('The video could not be decoded.'))},cancel=()=>{clean();reject(abort())};video.addEventListener('seeked',done,{once:true});video.addEventListener('error',fail,{once:true});signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{clean();reject(Error('Video seek timed out.'))},7000);video.currentTime=time})}
  async function open(file,signal){
    if(signal?.aborted)throw abort();const video=document.createElement('video'),url=URL.createObjectURL(file);video.preload='auto';video.muted=true;video.playsInline=true;
    const close=()=>{video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url)};
    try{await new Promise((resolve,reject)=>{const clean=()=>{clearTimeout(timer);video.onloadeddata=null;video.onerror=null;signal?.removeEventListener('abort',cancel)},done=()=>{clean();resolve()},cancel=()=>{clean();reject(abort())},timer=setTimeout(()=>{clean();reject(Error('The video is not ready.'))},12000);video.onloadeddata=done;video.onerror=()=>{clean();reject(Error('Unsupported video.'))};signal?.addEventListener('abort',cancel,{once:true});video.src=url});
      if(!finite(video.duration)){await seek(video,1e9,signal);await seek(video,0,signal)}
      if(!finite(video.duration)||video.duration<=0||video.duration>60)throw Error('Choose a video of up to 60 seconds with a readable duration.');return {video,close};
    }catch(e){close();throw e}
  }
  async function thumbnail(file,{time,signal}={}){
    const resource=await open(file,signal);
    try{
      const video=resource.video,canvas=document.createElement('canvas'),scale=Math.min(1,480/Math.max(video.videoWidth,video.videoHeight));
      if(!video.videoWidth||!video.videoHeight)throw Error('Video dimensions unavailable.');
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const candidates=[Number.isFinite(time)?time:video.duration*.5,video.duration*.3,video.duration*.7];
      for(const t of candidates){
        await seek(video,Math.max(.001,Math.min(video.duration-.001,t)),signal);if(signal?.aborted)throw abort();
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let sum=0,sum2=0,count=0;
        for(let i=0;i<pixels.length;i+=64){const light=(pixels[i]+pixels[i+1]+pixels[i+2])/3;sum+=light;sum2+=light*light;count++}
        if(count&&sum/count<8&&sum2/count-(sum/count)**2<3)continue;
        return canvas.toDataURL('image/jpeg',.8);
      }
      return null;
    }finally{resource.close()}
  }
  return {timing,normalizeTiming,frameIndex,step,window,seek,open,thumbnail};
});
