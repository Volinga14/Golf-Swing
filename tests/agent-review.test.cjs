const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),A=require('../agent-review.js'),S=require('../agent-sampling.js');
const sha='a'.repeat(64),sha2='b'.repeat(64),image='data:image/jpeg;base64,AAAA';
function context(){return {request_id:'request-one',video_sha256:sha,created_at:'2026-10-30T00:00:00Z',fingerprint:'marks-one',context:{duration_s:5},frames:Array.from({length:5},(_,i)=>({frame_id:'F00'+(i+1),time_s:i+.1,image,width:432,height:768,source_frame:i,labels:[]}))}}
function review(){return {summary:'Review',capture_quality:{view:'DTL',can_review:true,limitations:['Only one view']},phase_review:A.IDS.map((phase,i)=>({phase,status:'supported',frame_id:'F00'+(i+1),time_s:i+.1,evidence:'Visible',confidence:'medium'})),observations:[{topic:'Posture',frame_ids:['F001'],observation:'Visible',hypothesis:null}],priorities:[{title:'Example evidence-backed priority',frame_ids:['F002'],reason:'Evidence',drill:'Practice',check:'Check'}],additional_frames:[]}}
const envelope=r=>({schema:'swinglab-agent-result/1',request_id:'request-one',video_sha256:sha,review:r});
test('agent response binds exact video, request and evidence times',()=>{const c=context();assert.equal(A.parseReview(envelope(review()),c).identity_bound,true);for(const raw of [{...envelope(review()),video_sha256:sha2},{...envelope(review()),request_id:'other'}])assert.throws(()=>A.parseReview(raw,c));const wrong=review();wrong.phase_review[2].time_s+=.1;assert.throws(()=>A.parseReview(envelope(wrong),c));});
test('unsupported image references and invented phases cannot enter reports',()=>{const c=context();for(const mutate of [r=>r.observations[0].frame_ids=['F099'],r=>r.phase_review.pop(),r=>r.phase_review[0].phase='unknown',r=>r.priorities[0].frame_ids=[]]){const r=review();mutate(r);assert.throws(()=>A.parseReview(envelope(r),c))}});
test('no supported coaching priority is a valid useful result',()=>{const r=review();r.priorities=[];assert.equal(A.parseReview(envelope(r),context()).priorities.length,0)});
test('out-of-video extra-frame requests are rejected',()=>{const r=review();r.additional_frames=[{from_s:4,to_s:7,reason:'outside'}];assert.throws(()=>A.parseReview(envelope(r),context()))});
test('local-trial results preserve reported usage without treating it as a price',()=>{const r=A.parseReview({schema:'swinglab-trial-results/1',result:{context:{video_sha256:sha,request_id:'request-one'},parsed:review(),record:{model:'test-model',usage:{input_tokens:10,output_tokens:20,total_tokens:30},duration_s:2}}},context());assert.equal(r.usage.total_tokens,30);assert.equal(r.usage.duration_s,2);assert.equal(r.identity_bound,true);assert.equal(r.usage.price,undefined)});
test('bare JSON stays explicitly unbound for user confirmation',()=>assert.equal(A.parseReview(review(),context()).identity_bound,false));
test('session normalization preserves report and image evidence after JSON round trip',()=>{const c=context(),r=A.parseReview(envelope(review()),c);const s={id:'test',videoSha256:sha,analysisMode:'agent',agentContext:c,agentReview:r};const scope={URL,console,SwingLabAgent:A};scope.globalThis=scope;vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'session-store.js'),'utf8'),scope);const normalized=scope.SwingLabStorage.normalize(JSON.parse(JSON.stringify(s)));assert.equal(normalized.agentReview.summary,'Review');assert.equal(normalized.agentContext.frames[0].image,image);assert.equal(normalized.analysisMode,'agent');assert.equal(normalized.agentReview.usage.total_tokens,null)});
test('invalid evidence images cannot be retained by storage',()=>{const c=context();c.frames[0].image='https://tracker.invalid/image';assert.equal(A.normalizeContext(c),null)});
test('changed phase or impact marks invalidate an old package fingerprint',()=>{const s={videoSha256:sha,phases:{Address:1,Takeaway:2,Top:3,Impact:3.3,Finish:4},view:'DTL'};const f=A.fingerprint(s);s.phases.Impact=3.4;assert.notEqual(A.fingerprint(s),f);s.phases.Impact=3.3;s.impactReference={time:3.3};assert.notEqual(A.fingerprint(s),f)});
test('source-frame refinement respects its budget at high frame rates',()=>{const p={address:{time:.2},takeaway:{time:1},top:{time:2},impact:{time:2.3},finish:{time:4}},t={verified:true,times:Array.from({length:600},(_,i)=>i/120)};const frames=S.select(p,5,t,'refine');assert.equal(frames.length,30);assert.equal(new Set(frames.map(f=>f.source_frame)).size,30);for(const name of A.IDS)assert.ok(frames.some(f=>f.labels.includes(name)))});

test('a stored package from another video is not restored into this session',()=>assert.equal(A.normalizeState({videoSha256:sha2,agentContext:context(),agentReview:review()}).agentContext,null));

test('unmarked short swing can use honest overview frames without invented phase labels',()=>{const timing={verified:true,times:Array.from({length:137},(_,i)=>i/30)},f=S.overview(137/30,timing);assert.equal(f.length,30);assert.equal(f[0].source_frame,0);assert.equal(f.at(-1).source_frame,136);assert.equal(new Set(f.map(v=>v.source_frame)).size,30);assert(f.every(v=>v.labels.every(l=>!A.IDS.includes(l))));assert.throws(()=>S.overview(20,timing));});

test('a changed trim invalidates an existing agent image package',()=>{
 const s={videoSha256:sha,view:'DTL',phases:{Impact:2}};
 assert.notEqual(A.fingerprint(s),A.fingerprint({...s,analysisRange:{start:1,end:3}}));
 assert.notEqual(A.fingerprint({...s,analysisRange:{start:1,end:3}}),A.fingerprint({...s,analysisRange:{start:1,end:4}}));
});
test('overview samples only the chosen swing inside a longer original recording',()=>{
 const points=S.overview(60,{verified:true,times:Array.from({length:601},(_,i)=>i/10)},{start:10.03,end:14.97});
 assert.equal(points.length,30);assert(points.every(p=>p.time>=10.03&&p.time<=14.97));assert.equal(points[0].source_frame,101);
 assert.throws(()=>S.overview(60,null,{start:10,end:30}));
});
