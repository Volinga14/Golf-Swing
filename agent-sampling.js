(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabSampling=api})(globalThis,()=>{
'use strict';
function select(phases,duration,timing,density,bounds){
 const entries=['address','takeaway','top','impact','finish'].map(id=>({id,time:phases[id]?.time}));
 if(entries.some((e,i)=>!Number.isFinite(e.time)||e.time<0||e.time>=duration||(i&&e.time<=entries[i-1].time)))throw Error('Marca las cinco fases en orden dentro del vídeo antes de preparar el paquete.');
 const candidates=[],offsets=density==='extended'?[-.12,-.06,0,.06,.12]:[-.06,0,.06];
 for(const e of entries)for(const offset of offsets)candidates.push({time:Math.max(0,Math.min(duration-.001,e.time+offset)),label:offset===0?e.id:e.id+' contexto'});
 const pairs=density==='extended'?[[0,1],[1,2],[2,3],[3,4]]:[[2,3],[3,4]];
 for(const [a,b] of pairs)candidates.push({time:(entries[a].time+entries[b].time)/2,label:'transición'});
 if(density==='refine'){
 if(!timing?.verified||!timing.times?.length)throw Error('El refinamiento necesita tiempos originales verificados. Usa Compacto o Ampliado si el contenedor no los permite.');
 const intervals=[{id:'takeaway',before:.12,after:.10},{id:'top',before:.20,after:.08},{id:'impact',before:.16,after:.10}];
 // Keep overview evidence and phase anchors, then spend the remaining budget on actual source frames.
 candidates.length=0;
 for(const e of entries)candidates.push({time:e.time,label:e.id});
 for(const [a,b] of [[0,1],[3,4]])candidates.push({time:(entries[a].time+entries[b].time)/2,label:'contexto general'});
 const pools=intervals.map(w=>timing.times.map((t,i)=>({time:t,source:i,label:w.id+' secuencia'})).filter(f=>f.time>=phases[w.id].time-w.before&&f.time<=phases[w.id].time+w.after));
 // Interleave evenly across each complete interval: avoid concentrating the budget only near a possibly wrong anchor.
 const ranks=pools.map(pool=>{const sorted=[];const queue=[[0,pool.length-1]];while(queue.length){const [a,b]=queue.shift();if(a>b)continue;const m=Math.floor((a+b)/2);sorted.push(pool[m]);queue.push([a,m-1],[m+1,b]);}return sorted});
 const sourceIndices=new Set(candidates.map(c=>{let i=0;while(i+1<timing.times.length&&timing.times[i+1]<=c.time+1e-6)i++;return i}));
 for(let round=0;sourceIndices.size<30&&ranks.some(p=>round<p.length);round++)for(const pool of ranks){const f=pool[round];if(!f)continue;if(sourceIndices.has(f.source)){candidates.push(f);continue}if(sourceIndices.size>=30)break;sourceIndices.add(f.source);candidates.push(f)}
}
 const unique=new Map();
 for(const c of candidates){let source=null,time=c.time;if(timing?.verified&&timing.times?.length){let lo=0,hi=timing.times.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(timing.times[mid]<=time+1e-6)lo=mid;else hi=mid-1}source=lo;time=timing.times[lo]}
 const key=source==null?time.toFixed(6):String(source);if(!unique.has(key))unique.set(key,{time,source_frame:source,labels:[]});unique.get(key).labels.push(c.label)}
 return [...unique.values()].filter(f=>!bounds||(f.time>=bounds.start&&f.time<=bounds.end)).sort((a,b)=>a.time-b.time).map((f,i)=>({...f,frame_id:'F'+String(i+1).padStart(3,'0')}));
}
function overview(duration,timing,bounds){
 const start=bounds?.start??0,end=bounds?.end??duration;
 if(!Number.isFinite(duration)||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration||end<=start||end-start>12)throw Error('Usa un clip corto de un único swing (hasta 12 segundos) o marca sus fases para enfocar el análisis.');
 const points=new Map();for(let i=0;i<30;i++){let time=Math.max(start,start+(end-start-.001)*i/29),source=null;if(timing?.verified&&timing.times?.length){let lo=0,hi=timing.times.length-1;while(lo<hi){const m=Math.ceil((lo+hi)/2);if(timing.times[m]<=time)lo=m;else hi=m-1}if(timing.times[lo]<start&&lo+1<timing.times.length)lo++;source=lo;time=timing.times[lo];if(time<start||time>end)continue;}const key=source==null?time.toFixed(6):String(source);points.set(key,{time,source_frame:source,labels:['vista general; fases sin confirmar']});}return [...points.values()].sort((a,b)=>a.time-b.time).map((f,i)=>({...f,frame_id:'F'+String(i+1).padStart(3,'0')}));
}
return {select,overview};});
