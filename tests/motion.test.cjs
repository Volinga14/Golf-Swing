const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../lab/motion.js'),L=require('../learning.js');
test('background translation contributes less residual motion than a moving foreground',()=>{
 const a=Float32Array.from({length:96*96},(_,i)=>((i%96)*13+Math.floor(i/96)*17)%173),pan=new Float32Array(a.length),body=new Float32Array(a);
 for(let y=0;y<96;y++)for(let x=0;x<96;x++)pan[y*96+x]=a[y*96+Math.max(0,x-2)];
 for(let y=30;y<65;y++)for(let x=30;x<55;x++)body[y*96+x]=255-a[y*96+x];
 const p=M.measure(a,pan),b=M.measure(a,body);assert.ok(p.cameraMotion>=1.5);assert.ok(p.localizedMotion<b.localizedMotion/5);assert.throws(()=>M.measure(a,body,80));
});
test('a stronger movement after the recovery does not replace the first isolated action',()=>{
 const profile=Array.from({length:129},(_,i)=>({time:i/8,localizedMotion:1,cameraMotion:0}));
 for(let i=40;i<=56;i++)profile[i].localizedMotion=1+20*Math.sin((i-40)/16*Math.PI);
 for(let i=80;i<=112;i++)profile[i].localizedMotion=1+35*Math.sin((i-80)/32*Math.PI);
 const w=M.select(profile,16);assert.ok(w.start<5&&w.end<8);assert.equal(w.alternatives.length,1);assert.ok(w.warnings.length);assert.equal(w.method,'background-compensated-onset-v1');
});
test('ambiguous motion in a long clip requires a segment instead of forcing five phases',()=>{const w=M.select(Array.from({length:80},(_,i)=>({time:i/8,localizedMotion:3,cameraMotion:0})),10);assert.equal(w.status,'needs-segment');assert.equal(w.method,'full-clip-fallback');assert.ok(w.warnings.length);assert.equal(w.start,0);assert.equal(w.end,10)});
test('manual segments retain source times and reject reversed or out-of-bounds ranges',()=>{assert.deepEqual([M.range({start:4,end:7},10).start,M.range({start:4,end:7},10).end],[4,7]);for(const range of [{start:8,end:2},{start:0,end:11},{start:NaN,end:3},{start:1,end:1.1}])assert.throws(()=>M.range(range,10))});
test('reruns update untouched automatic proposals but preserve manual changes and confirmations',()=>{
 const run={runId:'run-1',phases:{Address:1,Takeaway:2,Top:3,Impact:4,Finish:5}},session={phases:{...run.phases},corrections:[],review:{status:'draft'}};
 assert.equal(L.canReplaceProposal(session,run,'Impact'),true);session.phases.Impact=4.1;assert.equal(L.canReplaceProposal(session,run,'Impact'),false);
 session.phases.Impact=4;session.corrections=[{phase:'Impact',analysisId:'run-1'}];assert.equal(L.canReplaceProposal(session,run,'Impact'),false);
 session.videoSha256='a'.repeat(64);session.duration=6;session.review={status:'reviewed',videoSha256:session.videoSha256,protocol:L.PROTOCOL,reviewer:'Tester',confirmedAt:new Date().toISOString(),phases:{...session.phases}};assert.equal(L.canReplaceProposal(session,run,'Top'),false);
 session.phases={};session.review.status='negative';session.review.phases={};assert.equal(L.canReplaceProposal(session,run,'Top'),false);
});
test('run provenance preserves the chosen segment without accepting arbitrary metadata',()=>{const normalized=L.normalize({duration:10,analyses:[{runId:'r1',videoSha256:'a'.repeat(64),protocol:L.PROTOCOL,status:'needs-review',createdAt:new Date().toISOString(),window:{start:3,end:7,method:'manual-segment',alternatives:[{start:-1,end:2},{start:8,end:9}],warnings:['Several movements'],secret:'excluded'}}]});assert.deepEqual(normalized.analyses[0].window,{start:3,end:7,method:'manual-segment',alternatives:[{start:8,end:9}],warnings:['Several movements']})});
