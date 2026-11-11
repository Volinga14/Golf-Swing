(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MarkingCore=api})(globalThis,()=>{
  'use strict';
  const PROTOCOL='swing-phases/1.0';
  const PHASES=[
    {id:'address',label:'Address',event:'address',definition:'Último fotograma de la preparación estable antes del inicio continuo del backswing. Ignorar ajustes y waggles anteriores.'},
    {id:'takeaway',label:'Takeaway · palo horizontal',event:'toe_up',definition:'Primer fotograma del backswing en que la varilla del palo alcanza aproximadamente la horizontal. Corresponde a Toe-up de GLAB; no es el primer movimiento.'},
    {id:'top',label:'Top',event:'top',definition:'Fotograma de transición en el que el palo termina su recorrido de subida y comienza el downswing. Si hay una pausa, usar el último fotograma antes de la bajada.'},
    {id:'impact',label:'Impact',event:'impact',definition:'Primer fotograma que muestra contacto palo-bola o salida de la bola. Si no es visible, marcar un intervalo de incertidumbre o dejar la fase sin resolver; no inventar contacto.'},
    {id:'finish',label:'Finish',event:'finish',definition:'Primer fotograma de la posición final sostenida al concluir el follow-through. No elegir automáticamente el final del vídeo. Si el clip termina antes, dejar sin resolver.'}
  ];
  const EVENTS=['address','toe_up','mid_backswing','top','mid_downswing','impact','mid_follow_through','finish'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const percentile=(values,q)=>{const v=[...values].sort((a,b)=>a-b),i=(v.length-1)*q,l=Math.floor(i);return v[l]+(v[Math.ceil(i)]-v[l])*(i-l)};
  function validateReference(reference,duration){
    const errors=[];let previous=-1;
    if(!reference||!['draft','reviewed','negative'].includes(reference.status))errors.push('Estado de referencia inválido.');
    if(reference?.status==='negative'){if(PHASES.some(p=>reference.phases?.[p.id]?.time!=null))errors.push('Un vídeo sin swing no debe tener fases.');return errors}
    for(const phase of PHASES){
      const mark=reference?.phases?.[phase.id],time=mark?.time;
      if(time==null){if(reference?.status==='reviewed'&&!mark?.reason?.trim())errors.push(`${phase.label}: indica por qué no es visible.`);continue}
      if(!finite(time)||time<0||!finite(duration)||time>duration){errors.push(`${phase.label}: tiempo fuera del vídeo.`);continue}
      if(time<=previous)errors.push(`${phase.label}: el orden temporal debe ser creciente.`);previous=time;
      if(mark.range!=null){const r=mark.range;if(!Array.isArray(r)||r.length!==2||!r.every(finite)||r[0]<0||r[1]>duration||r[0]>time||r[1]<time)errors.push(`${phase.label}: intervalo de incertidumbre inválido.`)}
    }
    if(reference?.status==='reviewed'&&!reference.reviewer?.trim())errors.push('Indica quién revisó la referencia.');
    return errors;
  }
  function decode(logits,times){
    const count=times.length;if(count<8||logits.length!==count*8||!times.every(finite))throw Error('Salida temporal inválida.');
    const logp=new Float64Array(count*8);
    for(let e=0;e<8;e++){let max=-Infinity;for(let t=0;t<count;t++)max=Math.max(max,logits[t*8+e]);let sum=0;for(let t=0;t<count;t++)sum+=Math.exp(logits[t*8+e]-max);for(let t=0;t<count;t++)logp[t*8+e]=Math.max(-27.6310211159,logits[t*8+e]-max-Math.log(sum))}
    const dp=Array.from({length:8},()=>new Float64Array(count).fill(-Infinity)),back=Array.from({length:8},()=>new Int32Array(count).fill(-1));
    for(let t=0;t<count;t++)dp[0][t]=logp[t*8];
    for(let e=1;e<8;e++){let best=-Infinity,index=-1;for(let t=0;t<count;t++){if(t>0&&dp[e-1][t-1]>best){best=dp[e-1][t-1];index=t-1}dp[e][t]=best+logp[t*8+e];back[e][t]=index}}
    let end=0;for(let t=1;t<count;t++)if(dp[7][t]>dp[7][end])end=t;
    if(!Number.isFinite(dp[7][end]))throw Error('No hay una secuencia ordenada.');
    const indices=[end];for(let e=7;e>0;e--){end=back[e][end];if(end<0)throw Error('Secuencia incompleta.');indices.push(end)}indices.reverse();
    return Object.fromEntries(PHASES.map(p=>[p.id,times[indices[EVENTS.indexOf(p.event)]]]));
  }
  function motionWindow(profile,duration){
    if(!Array.isArray(profile)||profile.length<8||!finite(duration)||duration<=0)throw Error('Vídeo sin muestras válidas.');
    const diffs=profile.slice(1).map(p=>p.motion),variance=profile.reduce((sum,p)=>sum+p.variance,0)/profile.length;
    const mean=diffs.reduce((a,b)=>a+b,0)/diffs.length;
    // This is a negative-control guard, not a trained "swing present" classifier.
    if(variance<4||mean<.15)return {status:'rejected',reason:'Sin información visual o movimiento suficiente.',meanMotion:mean,variance};
    if(duration<=3)return {status:'needs-review',start:0,end:duration,meanMotion:mean,variance};
    const smooth=diffs.map((_,i)=>{let total=0;for(let j=i-2;j<=i+2;j++)if(j>=0&&j<diffs.length)total+=diffs[j];return total/5});
    const avg=smooth.reduce((a,b)=>a+b,0)/smooth.length,std=Math.sqrt(smooth.reduce((a,b)=>a+(b-avg)**2,0)/smooth.length),threshold=Math.max(percentile(smooth,.65),avg+.25*std);
    const active=smooth.map((v,i)=>v>=threshold?i:-1).filter(i=>i>=0);if(!active.length)return {status:'needs-review',start:0,end:duration,meanMotion:mean,variance};
    const clusters=[];let first=active[0],previous=first;for(const index of active.slice(1)){if(index>previous+2){clusters.push([first,previous]);first=index}previous=index}clusters.push([first,previous]);
    const best=clusters.reduce((a,b)=>b[1]-b[0]>a[1]-a[0]?b:a);let start=profile[Math.max(0,best[0]-6)].time,end=profile[Math.min(profile.length-1,best[1]+8)].time;
    const minSpan=Math.min(duration,2.2),mid=(start+end)/2;if(end-start<minSpan){start=Math.max(0,mid-minSpan/2);end=Math.min(duration,mid+minSpan/2)}
    return {status:'needs-review',start,end,meanMotion:mean,variance};
  }
  function compare(reference,prediction){
    return PHASES.map(p=>{const mark=reference?.phases?.[p.id],expected=mark?.time,actual=prediction?.phases?.[p.id];if(!finite(expected)||!finite(actual))return {id:p.id,missing:true};const lower=mark.range?.[0]??expected,upper=mark.range?.[1]??expected;return {id:p.id,reference:expected,predicted:actual,delta:actual-expected,absolute:Math.abs(actual-expected),distanceToRange:Math.max(0,lower-actual,actual-upper)}});
  }
  function summarize(records,key){
    const errors=[],perPhase=Object.fromEntries(PHASES.map(p=>[p.id,[]]));let eligible=0,missing=0,negatives=0,falsePositives=0,reviewed=0,completed=0;
    for(const record of records){const ref=record.reference,pred=record.results?.[key];if(!ref||ref.status==='draft')continue;reviewed++;if(!pred)continue;completed++;
      if(ref.status==='negative'){negatives++;if(PHASES.some(p=>finite(pred.phases?.[p.id])))falsePositives++;continue}
      for(const row of compare(ref,pred)){if(!finite(ref.phases?.[row.id]?.time))continue;eligible++;if(row.missing){missing++;continue}errors.push(row.absolute);perPhase[row.id].push(row.absolute)}
    }
    const fpsEligible=records.filter(r=>r.reference?.status==='reviewed'&&r.timing?.cfrVerified&&finite(r.timing.fps)&&r.results?.[key]);
    const frameErrors=fpsEligible.flatMap(r=>compare(r.reference,r.results[key]).filter(x=>!x.missing).map(x=>x.absolute*r.timing.fps));
    return {reviewed,completed,eligible,matched:errors.length,missing,coverage:eligible?(eligible-missing)/eligible:null,mae:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null,median:errors.length?percentile(errors,.5):null,p95:errors.length?percentile(errors,.95):null,perPhase:Object.fromEntries(Object.entries(perPhase).map(([p,v])=>[p,v.length?v.reduce((a,b)=>a+b,0)/v.length:null])),negatives,falsePositives,frameSamples:frameErrors.length,frameHits:Object.fromEntries([1,3,5].map(t=>[t,frameErrors.length?frameErrors.filter(e=>e<=t).length/frameErrors.length:null]))};
  }
  function normalizeImport(payload){
    if(payload?.schema!==1||payload.protocol!==PROTOCOL||!Array.isArray(payload.records)||payload.records.length>1000)throw Error('Archivo de referencias incompatible.');
    const seen=new Set();return payload.records.map(record=>{
      if(!record||!/^[-\w]{1,120}$/.test(record.id)||seen.has(record.id)||!Number.isFinite(record.duration)||record.duration<=0||record.duration>600)throw Error('Identificador o duración inválidos.');seen.add(record.id);
      if(!/^[a-f0-9]{64}$/.test(record.sha256||''))throw Error('Falta la huella del vídeo.');
      const errors=validateReference(record.reference,record.duration);if(errors.length)throw Error(`${record.id}: ${errors.join(' ')}`);
      if(record.results)for(const pred of Object.values(record.results)){if(!pred||!['needs-review','needs-segment','rejected','error'].includes(pred.status))throw Error('Estado de motor inválido.');if(pred.phases)for(const [key,value]of Object.entries(pred.phases))if(!PHASES.some(p=>p.id===key)||!finite(value)||value<0||value>record.duration)throw Error('Predicción fuera del vídeo.');}
      return clone(record);
    });
  }
  return {PROTOCOL,PHASES,EVENTS,clone,validateReference,decode,motionWindow,compare,summarize,normalizeImport};
});
