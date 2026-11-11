/* Local motion evidence. Translation is estimated from the background so a pan
   does not outweigh a golfer. These rules do not classify swing presence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabMotion=api})(globalThis,()=>{
  'use strict';
  const quantile=(v,q)=>{const a=[...v].sort((a,b)=>a-b);return a[Math.floor((a.length-1)*q)]};
  function measure(previous,current,size=96){
    if(size!==96||previous.length!==size*size||current.length!==size*size)throw Error('Invalid motion image.');
    // Canvas downscaling can alias grass/foliage in handheld recordings. A small
    // low-pass filter stabilizes matching instead of treating texture as action.
    const blur=input=>{const out=new Float32Array(input.length);for(let y=0;y<size;y++)for(let x=0;x<size;x++){let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=input[Math.max(0,Math.min(size-1,y+dy))*size+Math.max(0,Math.min(size-1,x+dx))]*(dy===0?2:1)*(dx===0?2:1);out[y*size+x]=sum/16}return out};
    previous=blur(previous);current=blur(current);
    const at=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;return (current[iy*size+ix]*(1-fx)+current[iy*size+ix+1]*fx)*(1-fy)+(current[(iy+1)*size+ix]*(1-fx)+current[(iy+1)*size+ix+1]*fx)*fy};
    function cost(dx,dy){let total=0;for(let y=8;y<size-8;y+=3)for(let x=8;x<size-8;x+=3)total+=Math.min(12,Math.abs(previous[y*size+x]-at(x+dx,y+dy)));return total}
    let dx=0,dy=0,best=Infinity;
    for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const c=cost(x,y);if(c<best){best=c;dx=x;dy=y}}
    const bx=dx,by=dy;for(let y=by-.5;y<=by+.5;y+=.5)for(let x=bx-.5;x<=bx+.5;x+=.5){const c=cost(x,y);if(c<best){best=c;dx=x;dy=y}}
    const cells=new Float64Array(64);let total=0;
    for(let y=8;y<size-8;y++)for(let x=8;x<size-8;x++){const d=Math.abs(previous[y*size+x]-at(x+dx,y+dy));cells[Math.floor((y-8)/10)*8+Math.floor((x-8)/10)]+=d/100;total+=d}
    const sorted=Array.from(cells).sort((a,b)=>a-b),background=quantile(sorted,.5),localized=Math.max(0,sorted.slice(-8).reduce((a,b)=>a+b,0)/8-background);
    return {motion:total/((size-16)**2),localizedMotion:localized,cameraMotion:Math.hypot(dx,dy),backgroundMotion:background};
  }
  function candidates(profile,duration){
    if(profile.length<8||!Number.isFinite(duration)||duration<=0)throw Error('Invalid motion profile.');
    const step=(profile.at(-1).time-profile[0].time)/(profile.length-1),values=profile.map(p=>p.localizedMotion/(1+Math.max(0,p.cameraMotion-1))),smooth=values.map((v,i)=>(v*2+(values[i-1]??v)+(values[i+1]??v))/4),floor=quantile(smooth,.2),high=Math.max(floor+4,floor*2.5),low=Math.max(floor+1.5,floor*1.5);
    const bursts=[];let i=1;
    while(i<smooth.length){if(smooth[i]<high){i++;continue}let a=i,b=i;
      while(a>0&&smooth[a-1]>low)a--;
      let quiet=0;while(b+1<smooth.length){b++;quiet=smooth[b]<low?quiet+1:0;if(quiet*step>=.25)break}
      const before=smooth.slice(Math.max(0,a-Math.ceil(.75/step)),a),setup=before.length?quantile(before,.5):floor;
      // Stop at the first substantial burst and its recovery. Walking afterwards
      // may be longer and stronger, but is not evidence for moving the onset.
      let peakIndex=-1;for(let j=a;j<=b;j++)if(smooth[j]>=high&&smooth[j]>=(smooth[j-1]??0)&&smooth[j]>(smooth[j+1]??0)){peakIndex=j;break}
      if(peakIndex>=0){let recovery=peakIndex,peak=smooth[peakIndex];while(recovery<b&&(profile[recovery].time-profile[peakIndex].time<.25||smooth[recovery]>Math.max(low,peak*.7))){peak=Math.max(peak,smooth[recovery]);recovery++}
        const prominence=peak/Math.max(2,setup),span=(recovery-a)*step;
        if(prominence>=2&&span>=.2){const start=Math.max(0,profile[a].time-.5),end=Math.min(duration,profile[recovery].time+.5);bursts.push({start,end,onset:profile[a].time,peak,prominence,span})}
      }
      i=b+1;
    }
    return {bursts,baseline:floor,high,low,values:smooth};
  }
  function select(profile,duration){
    const evidence=candidates(profile,duration),bursts=evidence.bursts;
    if(!bursts.length)return {status:duration>4?'needs-segment':'needs-review',start:0,end:duration,method:'full-clip-fallback',alternatives:[],warnings:['No isolated motion burst was found. Select the swing segment before relying on phase proposals.']};
    // Chronological selection avoids replacing an earlier complete action with
    // stronger walking/panning later. More than one action remains ambiguous.
    return {status:'needs-review',...bursts[0],method:'background-compensated-onset-v1',alternatives:bursts.slice(1),warnings:bursts.length>1?['Several movements were found. The first isolated burst was used; select the intended swing segment if necessary.']:[]};
  }
  function range(value,duration){
    if(!value||!Number.isFinite(value.start)||!Number.isFinite(value.end)||value.start<0||value.end>duration||value.end-value.start<.5)throw Error('Select a segment of at least 0.5 seconds inside the video.');
    return {status:'needs-review',start:value.start,end:value.end,method:'manual-segment',alternatives:[],warnings:[]};
  }
  return {measure,candidates,select,range};
});
