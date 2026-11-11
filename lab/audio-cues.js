/* Experimental local audio evidence. A transient is not proof of a golf strike. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabAudio=api})(globalThis,()=>{
  'use strict';
  function candidates(samples,rate=16000){
    if(!(samples instanceof Float32Array)||!Number.isFinite(rate)||rate<8000)throw Error('Invalid audio samples.');
    const block=Math.round(rate*.01),count=Math.floor(samples.length/block),energy=new Float64Array(count),scores=new Float64Array(count);let previous=samples[0]||0;
    for(let i=0;i<count;i++){let sum=0;for(let j=0;j<block;j++){const value=samples[i*block+j],d=value-previous;sum+=d*d;previous=value}energy[i]=Math.sqrt(sum/block)}
    if(count<31||Math.max(...energy)<1e-5)return [];
    for(let i=30;i<count;i++){let sum=0;for(let j=Math.max(0,i-30);j<i;j++)sum+=energy[j];const past=sum/Math.min(i,30);scores[i]=Math.max(0,energy[i]-past)*Math.min(10,energy[i]/Math.max(past,1e-5))}
    const order=Array.from(scores,(_,i)=>i).sort((a,b)=>scores[b]-scores[a]),out=[];
    for(const i of order){if(scores[i]<=1e-7)break;const time=(i+.5)*block/rate;if(out.every(p=>Math.abs(p.time-time)>.25))out.push({time,strength:scores[i],source:'audio-transient',status:'needs-review'});if(out.length===3)break}
    return out;
  }
  async function analyze(file,{signal}={}){
    const check=()=>{if(signal?.aborted)throw new DOMException("Cancelled","AbortError")};check();
    if(!file?.size||file.size>150*1024*1024)throw Error('Choose a video smaller than 150 MB.');
    const Context=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!Context)throw Error('Audio decoding is unavailable in this browser.');
    const context=new Context(1,1,16000),bytes=await file.arrayBuffer();check();const buffer=await context.decodeAudioData(bytes);check();
    if(buffer.duration>60)throw Error('Choose a clip of up to 60 seconds.');
    const mono=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const channel=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/buffer.numberOfChannels}
    return {candidates:candidates(mono,buffer.sampleRate),sampleRate:buffer.sampleRate,duration:buffer.duration,note:'Audio cues require visual confirmation. Claps, voices and other golfers can trigger them.'};
  }
  return {candidates,analyze};
});
