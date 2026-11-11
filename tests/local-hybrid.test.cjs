const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const H=require('../lab/hybrid-core.js'),C=require('../lab/core.js'),L=require('../learning.js');
function environment({audio=()=>({candidates:[{time:3.01}]}),reject=false,failRefinement=false}={}){
 const jobs=[],events=[],file={size:100,arrayBuffer:async()=>new ArrayBuffer(8)};
 let audioCalls=0;
 const ctx={
  drawImage(){},getImageData(x,y,size){const rgba=new Uint8ClampedArray(size*size*4);for(let i=0;i<rgba.length;i++)rgba[i]=i%11*20;return {data:rgba}}
 };
 const resource={video:{duration:6,videoWidth:640,videoHeight:640},close(){events.push('closed')}};
 const context={URL,WeakMap,Float32Array,Float64Array,Uint8ClampedArray,Uint8Array,ArrayBuffer,DOMException,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,
  document:{currentScript:{src:'http://localhost/local-engine.js'},createElement:()=>({getContext:()=>ctx})},
  fetch:async()=>({ok:true,json:async()=>({checkpointSha256:'a'.repeat(64),files:{}})}),
  SwingLabVideo:{open:async()=>resource,timing:()=>({verified:false}),frameIndex:()=>null,seek:async(v,t,signal)=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');v.currentTime=t}},
  MarkingCore:{...C,motionWindow:()=>reject?{status:'rejected',reason:'blank'}:{status:'needs-review'}},
  SwingLabHybrid:H,SwingLabMotion:{measure:()=>({motion:10,localizedMotion:10}),select:()=>({start:1,end:4,status:'needs-review',warnings:[]}),candidates:()=>({bursts:[{start:2,end:5}]}),range:(r)=>({...r,status:'needs-review',warnings:[],method:'manual-segment'})},
  SwingLabAudio:{analyze:async(...args)=>{audioCalls++;return audio(...args)}}
 };
 context.Worker=class{
  terminate(){events.push('terminated')}
  postMessage(job){jobs.push(job);queueMicrotask(()=>{
   if(failRefinement&&jobs.length===2)return this.onmessage({data:{id:job.id,type:'error',message:'refinement failed'}});
   const phases=Number.isFinite(job.anchor)?H.decode(new Float32Array(48*8),job.times,job.anchor):Object.fromEntries(['address','takeaway','top','impact','finish'].map((p,i)=>[p,job.times[[5,12,22,31,42][i]]]));
   this.onmessage({data:{id:job.id,type:'result',result:{phases,window:job.window}}});
  })}
 };
 context.globalThis=context;vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../local-engine.js'),'utf8'),context);
 return {api:context.SwingLabLocal,file,jobs,events,get audioCalls(){return audioCalls}};
}
test('manual impact anchors a single inference, chooses its motion segment and skips audio',async()=>{
 const e=environment(),r=await e.api.analyze(e.file,{impactAnchor:4.5});
 assert.equal(r.phases.impact,4.5);assert.equal(r.window.start,2);assert.equal(r.impactEvidence.source,'user-impact');
 assert.ok(r.phases.top<4.5&&r.phases.finish>4.5);assert.equal(e.jobs.length,1);assert.equal(e.audioCalls,0);
 assert.ok(e.events.includes('closed'));
});
test('automatic hybrid retains baseline evidence and refines from matching audio',async()=>{
 const e=environment(),r=await e.api.analyze(e.file);
 assert.equal(r.impactEvidence.source,'audio-model-agreement');assert.equal(r.phases.impact,3.01);
 assert.ok(Number.isFinite(r.initialPhases.impact));assert.equal(e.jobs.length,2);assert.equal(e.audioCalls,1);
});
test('missing audio, disagreement and failed refinement keep proposals and ask for impact',async()=>{
 for(const options of [{audio:()=>({candidates:[]})},{audio:()=>({candidates:[{time:5.8}]})},{failRefinement:true}]){
  const e=environment(options),r=await e.api.analyze(e.file);
  assert.equal(r.status,'needs-review');assert.equal(r.impactEvidence.status,'needs-impact');
  assert.ok(Number.isFinite(r.phases.impact));
 }
});
test('invalid range and static guard never run a manually forced inference',async()=>{
 const e=environment();await assert.rejects(e.api.analyze(e.file,{impactAnchor:4,range:{start:1,end:3}}),/inside/);
 assert.equal(e.jobs.length,0);
 const blank=environment({reject:true}),r=await blank.api.analyze(blank.file,{impactAnchor:3});
 assert.equal(r.status,'rejected');assert.equal(blank.jobs.length,0);
});
test('cancellation during audio prevents a second inference and closes media',async()=>{
 const c=new AbortController(),e=environment({audio:()=>{c.abort();return {candidates:[{time:3}]}}});
 await assert.rejects(e.api.analyze(e.file,{signal:c.signal}),{name:'AbortError'});
 assert.equal(e.jobs.length,1);assert.ok(e.events.includes('closed'));
});
test('saved references and model/audio provenance survive normalization and export boundaries',()=>{
 const hash='a'.repeat(64),stamp='2026-10-28T10:00:00.000Z',raw={duration:6,videoSha256:hash,
 impactReference:{time:3,source:'user-impact',updatedAt:stamp,videoSha256:hash},
 analyses:[{runId:'one',modelId:'local-mark-v0.4',protocol:L.PROTOCOL,videoSha256:hash,createdAt:stamp,status:'needs-review',phases:{Impact:3},
  impactEvidence:{anchor:3,source:'user-impact',status:'needs-review'},initialPhases:{Impact:2.8},audioCandidates:[{time:3}]}]};
 const saved=L.normalize(raw);assert.equal(saved.impactReference.time,3);assert.equal(saved.analyses[0].impactEvidence.source,'user-impact');
 assert.equal(saved.analyses[0].initialPhases.Impact,2.8);assert.equal(saved.analyses[0].audioCandidates[0].time,3);
 assert.equal(L.normalize({...raw,videoSha256:'b'.repeat(64)}).impactReference,null);
 for(const time of [-1,0,6,NaN])assert.equal(L.normalize({...raw,impactReference:{...raw.impactReference,time}}).impactReference,null);
 assert.equal(saved.review.status,'draft');
});

test('a marked user impact cannot be replaced even when it matches an automatic proposal',()=>{
 const s={duration:6,phases:{Impact:3},impactReference:{time:3},analyses:[],corrections:[],review:{status:'draft'}};
 assert.equal(L.canReplaceProposal(s,{phases:{Impact:3}},'Impact'),false);
});
