/* Reviewed references stay on the device and are bound to the original video bytes. */
(function(root,factory){const api=factory(root.MarkingCore||(typeof require==='function'?require('./lab/core.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabReferences=api})(globalThis,C=>{
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x)),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  function record(raw){
    if(!raw||!/^[-\w]{1,120}$/.test(raw.id||'')||!hash(raw.sha256)||!Number.isFinite(raw.duration)||raw.duration<=0||raw.duration>600)throw Error('Invalid reference identity or duration.');
    const r=raw.reference;
    if(!['reviewed','negative'].includes(r?.status)||!r.reviewer?.trim()||!Number.isFinite(Date.parse(r.updatedAt))||C.validateReference(r,raw.duration).length)throw Error('References need a reviewer, a review date and valid phase ranges.');
    const phases=Object.fromEntries(C.PHASES.map(p=>{const m=r.phases?.[p.id];return [p.id,{time:m?.time??null,range:m?.range?copy(m.range):null,reason:String(m?.reason||'').slice(0,2000),...(Number.isInteger(m?.frameIndex)&&m.frameIndex>=0?{frameIndex:m.frameIndex}:{}),...(Number.isInteger(m?.decodedFrameIndex)&&m.decodedFrameIndex>=0?{decodedFrameIndex:m.decodedFrameIndex}:{}),timingSource:String(m?.timingSource||'').slice(0,100)}]}));
    return {id:raw.id,sha256:raw.sha256,title:String(raw.title||'Reviewed swing').slice(0,200),duration:raw.duration,view:raw.view==='fo'?'fo':'dtl',sourceGroup:String(raw.sourceGroup||raw.id).slice(0,120),reference:{status:r.status,reviewer:r.reviewer.slice(0,100),updatedAt:r.updatedAt,version:Number.isInteger(r.version)&&r.version>0?r.version:1,method:String(r.method||'visual-review').slice(0,100),phases}};
  }
  function pack(payload){
    if(payload?.schema!==1||payload.protocol!==C.PROTOCOL||!Array.isArray(payload.records)||!payload.records.length||payload.records.length>1000)throw Error('Incompatible reference file.');
    return payload.records.map(record);
  }
  function merge(existing,incoming){
    const map=new Map(existing.map(entry=>[entry.sha256,copy(entry)]));
    for(const raw of incoming){const next=record(raw),old=map.get(next.sha256);if(!old){map.set(next.sha256,{...next,revisions:[]});continue}
      if(JSON.stringify(old.reference)===JSON.stringify(next.reference))continue;
      const delta=Date.parse(next.reference.updatedAt)-Date.parse(old.reference.updatedAt);
      if(delta<0)continue;if(delta===0)throw Error('Conflicting reference versions have the same review date. Resolve them before importing.');
      map.set(next.sha256,{...next,revisions:[...(old.revisions||[]),{...record(old)}]});
    }return [...map.values()];
  }
  function matches(entry,sha,duration){return !!entry&&entry.sha256===sha&&Number.isFinite(duration)&&Math.abs(entry.duration-duration)<=.1}
  function apply(session,entry,now=new Date().toISOString()){
    const r=record(entry);if(!matches(r,session.videoSha256,session.duration))throw Error('The reference belongs to a different original video.');
    if(session.referenceReview){session.referenceHistory=session.referenceHistory||[];session.referenceHistory.push(copy(session.referenceReview))}
    session.referenceReview={...r,appliedAt:now,previousPhases:copy(session.phases||{}),previousReview:copy(session.review||{status:'draft'})};
    session.phases=Object.fromEntries(C.PHASES.filter(p=>Number.isFinite(r.reference.phases[p.id].time)).map(p=>[p.id[0].toUpperCase()+p.id.slice(1),r.reference.phases[p.id].time]));
    session.captures={};session.view=r.view==='fo'?'FO':'DTL';
    const complete=Object.keys(session.phases).length===5;
    session.review={status:r.reference.status==='negative'?'negative':complete?'reviewed':'draft',protocol:C.PROTOCOL,videoSha256:r.sha256,confirmedAt:r.reference.updatedAt,reviewer:r.reference.reviewer,phases:copy(session.phases)};
  }
  function snapshot(raw,sha){
    try{const r=record(raw);if(r.sha256!==sha||!Number.isFinite(Date.parse(raw.appliedAt)))return null;return {...r,appliedAt:raw.appliedAt,previousPhases:copy(raw.previousPhases||{}),previousReview:copy(raw.previousReview||{status:'draft'})}}catch{return null}
  }
  return {record,pack,merge,matches,apply,snapshot};
});
