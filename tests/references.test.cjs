const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../references.js'),L=require('../learning.js');
const sha='a'.repeat(64),date='2026-01-01T00:00:00Z';
function entry(){return {id:'review-fixture',title:'Reviewed example',sha256:sha,duration:10,view:'dtl',sourceGroup:'one-recording',reference:{status:'reviewed',reviewer:'Assisted visual reviewer',updatedAt:date,version:1,phases:Object.fromEntries(['address','takeaway','top','impact','finish'].map((p,i)=>[p,{time:i+1,range:[i+.95,i+1.05],reason:'Visible transition within adjacent frames'}]))}}}
const payload=records=>({schema:1,protocol:L.PROTOCOL,records});
test('reference import requires a complete protocol, identity, provenance and valid uncertainty',()=>{
 const valid=entry();assert.equal(R.pack(payload([valid]))[0].reference.phases.impact.range[0],3.95);
 for(const change of [r=>r.sha256='bad',r=>r.reference.updatedAt='',r=>r.reference.reviewer='',r=>r.reference.phases.impact.range=[4.1,4.2],r=>r.reference.phases.top={time:null,reason:''}]){const r=entry();change(r);assert.throws(()=>R.pack(payload([r])))}
});
test('newer references retain history, stale imports cannot replace them and conflicts reject atomically',()=>{
 const first=R.merge([],R.pack(payload([entry()]))),next=entry();next.reference.updatedAt='2026-01-02T00:00:00Z';next.reference.phases.impact.time=4.01;
 const merged=R.merge(first,[next]);assert.equal(first[0].reference.phases.impact.time,4);assert.equal(merged[0].revisions.length,1);assert.equal(merged[0].revisions[0].reference.phases.impact.time,4);assert.equal(R.merge(merged,[entry()])[0].reference.phases.impact.time,4.01);
 const conflict=structuredClone(next);conflict.reference.phases.impact.time=4.02;assert.throws(()=>R.merge(merged,[conflict]));assert.equal(merged[0].reference.phases.impact.time,4.01);
});
test('applying references checks the original bytes and preserves previous manual marks and model runs',()=>{
 const s={duration:10,videoSha256:'b'.repeat(64),phases:{Impact:6},analyses:[],corrections:[{id:'existing'}],review:{status:'draft'}};assert.throws(()=>R.apply(s,entry()));assert.equal(s.phases.Impact,6);
 s.videoSha256=sha;R.apply(s,entry(),date);assert.equal(s.phases.Impact,4);assert.equal(s.referenceReview.previousPhases.Impact,6);assert.equal(s.corrections[0].id,'existing');assert.equal(L.reviewMatches(s),true);assert.equal(L.canReplaceProposal(s,null,'Impact'),false);
 const normalized=L.normalize(s);assert.deepEqual(normalized.referenceReview.reference.phases.impact.range,[3.95,4.05]);assert.equal(normalized.referenceReview.reference.reviewer,'Assisted visual reviewer');R.apply(s,entry(),date);assert.equal(s.referenceHistory.length,1);
});
test('unresolved and negative references cannot become fabricated five-phase labels',()=>{
 const r=entry(),s={videoSha256:sha,duration:10,phases:{},review:{status:'draft'}};r.reference.phases.impact={time:null,reason:'Ball hidden'};R.apply(s,r,date);assert.equal(s.phases.Impact,undefined);assert.equal(L.reviewMatches(s),false);
 r.reference.status='negative';r.reference.phases={};R.apply(s,r,date);assert.deepEqual(s.phases,{});assert.equal(L.negativeMatches(s),true);
});
test('assisted interval references remain in exports but never become point-label training targets',async()=>{
 const s={id:'example',duration:10,videoSha256:sha,phases:{},review:{status:'draft'}};R.apply(s,entry(),date);const zip=await L.exportPack([s],{feedback:async()=>[]},false),bytes=Buffer.from(await zip.arrayBuffer()),size=bytes.readUInt32LE(18),nameLength=bytes.readUInt16LE(26),manifest=JSON.parse(bytes.subarray(30+nameLength,30+nameLength+size));assert.equal(manifest.records[0].trainingEligible,false);assert.deepEqual(manifest.records[0].referenceReview.reference.phases.impact.range,[3.95,4.05]);
});
