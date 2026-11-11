/* Experimental evidence selection and anchored decoding. No confidence claim. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabHybrid=api})(globalThis,()=>{
 'use strict';
 const finite=Number.isFinite;
 function select(model,audio,duration,manual){
  if(!finite(duration)||duration<=0)throw Error('Invalid duration.');
  if(manual!==undefined){
   if(!finite(manual)||manual<=0||manual>=duration)throw Error('Select an impact inside the clip.');
   return {anchor:manual,source:'user-impact',status:'needs-review',note:'Impact supplied by you. Other phases remain model proposals.'};
  }
  const impact=model?.phases?.impact;
  if(!finite(impact))return {status:'needs-impact',source:'no-model-impact',note:'No usable model impact. Select the visible impact frame.'};
  const cues=(audio?.candidates||[]).filter(p=>finite(p.time)&&p.time>0&&p.time<duration);
  if(!cues.length)return {status:'needs-impact',source:'model-only',modelImpact:impact,note:'No usable audio. Review the model or select the visible impact frame.'};
  const cue=cues.reduce((best,p)=>Math.abs(p.time-impact)<Math.abs(best.time-impact)?p:best),distance=Math.abs(cue.time-impact);
  if(distance>.25)return {status:'needs-impact',source:'disagreement',modelImpact:impact,audioImpact:cue.time,distance,note:'Audio and model disagree. Select the visible impact frame.'};
  return {anchor:cue.time,source:'audio-model-agreement',status:'needs-review',distance,
   note:'Audio and model agree within 250 ms. This is not calibrated confidence; inspect the phases.'};
 }
 function window(anchor,duration){
  if(!finite(anchor)||!finite(duration)||anchor<=0||anchor>=duration)throw Error('Invalid impact anchor.');
  return {start:Math.max(0,anchor-2.4),end:Math.min(duration,anchor+1.4),status:'needs-review',method:'experimental-impact-window',warnings:['Fixed impact window may truncate a slow-motion or long swing.']};
 }
 function segment(model,bursts,anchor,duration){
  const fallback=window(anchor,duration),original=model?.window;
  const valid=w=>w&&finite(w.start)&&finite(w.end)&&w.start>=0&&w.end<=duration&&w.start<anchor&&anchor<w.end;
  const candidates=[...(original?.alternatives||[]),...(bursts||[])].filter(valid);
  const chosen=valid(original)?original:candidates.sort((a,b)=>Math.abs((a.start+a.end)/2-anchor)-Math.abs((b.start+b.end)/2-anchor))[0];
  return chosen?{...fallback,start:Math.max(0,Math.min(chosen.start,anchor-.6)),end:Math.min(duration,Math.max(chosen.end,anchor+.5)),method:'experimental-motion-impact-window',warnings:['Motion boundaries and phase proposals require review.']}:fallback;
 }
 function decode(logits,times,anchor){
  const n=times.length;
  if(n<8||logits.length!==n*8||!Array.from(logits).every(finite)||!times.every(finite)||times.some((t,i)=>i&&t<times[i-1]))throw Error('Invalid temporal output.');
  if(!finite(anchor)||anchor<=times[0]||anchor>=times[n-1])throw Error('Impact must be inside the sampled interval.');
  let fixed=5;for(let i=6;i<n-2;i++)if(Math.abs(times[i]-anchor)<Math.abs(times[fixed]-anchor))fixed=i;
  const scores=new Float64Array(n*8);
  for(let e=0;e<8;e++){
   let max=-Infinity;for(let t=0;t<n;t++)max=Math.max(max,logits[t*8+e]);
   let sum=0;for(let t=0;t<n;t++)sum+=Math.exp(logits[t*8+e]-max);
   for(let t=0;t<n;t++)scores[t*8+e]=logits[t*8+e]-max-Math.log(sum);
  }
  // Apply the hard constraint after normalization; a low softmax floor cannot
  // silently turn a forbidden event back into an allowed candidate.
  for(let t=0;t<n;t++)scores[t*8+5]=t===fixed?0:-Infinity;
  const dp=Array.from({length:8},()=>new Float64Array(n).fill(-Infinity)),back=Array.from({length:8},()=>new Int32Array(n).fill(-1));
  for(let t=0;t<n;t++)dp[0][t]=scores[t*8];
  for(let e=1;e<8;e++){let best=-Infinity,index=-1;for(let t=0;t<n;t++){
   if(t>0&&dp[e-1][t-1]>best){best=dp[e-1][t-1];index=t-1}
   dp[e][t]=best+scores[t*8+e];back[e][t]=index;
  }}
  let end=0;for(let t=1;t<n;t++)if(dp[7][t]>dp[7][end])end=t;
  if(!finite(dp[7][end]))throw Error('No ordered anchored sequence.');
  const indices=[end];for(let e=7;e>0;e--){end=back[e][end];if(end<0)throw Error('Incomplete anchored sequence.');indices.push(end)}indices.reverse();
  const out=Object.fromEntries(['address','takeaway','top','impact','finish'].map((p,i)=>[p,times[indices[[0,1,3,5,7][i]]]]));
  out.impact=anchor;const values=Object.values(out);
  if(values.some((t,i)=>i&&t<=values[i-1]))throw Error('Anchor conflicts with ordered phases. Select a wider segment.');
  return out;
 }
 return {select,window,segment,decode};
});
