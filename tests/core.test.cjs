const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const storage=fs.readFileSync(path.join(root,'session-store.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const session=(id,notes='')=>({id,title:id,date:'2026-01-01',fileName:id+'.webm',phases:{Impact:1},captures:{Impact:'data:image/jpeg;base64,T0xE'},notes,drawings:[]});
const file=name=>({name:name+'.webm',size:100,type:'video/webm'});

async function environment(history=[]){
  const nodes=new Map(),events={};
  function element(){
    const listeners={};
    return {value:'',textContent:'',innerHTML:'',hidden:true,src:'',duration:10,currentTime:0,paused:true,readyState:2,seeking:false,
      videoWidth:640,videoHeight:480,dataset:{},style:{setProperty(){}},classList:{toggle(){},add(){},remove(){},contains(){return false}},
      get currentTime(){return this._time||0},set currentTime(t){this._time=t;queueMicrotask(()=>{for(const f of listeners.seeked||[])f({type:'seeked'})})},
      addEventListener(n,f){(listeners[n]||=[]).push(f)},removeEventListener(){},
      querySelector(){return null},querySelectorAll(){return []},closest(){return null},pause(){this.paused=true},play(){return Promise.resolve()},
      removeAttribute(n){this[n]=''},setAttribute(n,v){this[n]=v},replaceChildren(){},append(){},focus(){},load(){},click(){},getContext(){return {drawImage(){}}},
      dispatchEvent(event){for(const f of listeners[event.type]||[])f(event)},toDataURL(){return 'data:image/jpeg;base64,TkVX'}};
  }
  const document={documentElement:element(),body:element(),
    getElementById(id){if(id==='fullscreenCanvas')return null;if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},
    querySelector(){return null},querySelectorAll(){return []},addEventListener(n,f){(events[n]||=[]).push(f)},
    dispatchEvent(e){for(const f of events[e.type]||[])f(e)},createElement:element};
  const records=new Map(history.map(s=>[s.id,copy(s)])),videos=new Map();
  const saved=new Map();
  const context={document,location:{search:'',protocol:'file:'},navigator:{userAgent:'test'},console,
    localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
    URLSearchParams,URL,crypto:{randomUUID:()=>String(Math.random()).replace('.','-')},
    setTimeout,clearTimeout,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,queueMicrotask,addEventListener(){},matchMedia:()=>({matches:false}),AbortController,DOMException,
    FormData:class{append(){}},confirm:()=>true,prompt:()=>null,CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts?.detail}},innerHeight:800};
  context.URL=class extends URL{static createObjectURL(f){return 'blob:'+f.name}static revokeObjectURL(){}};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'video-tools.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'lab/core.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'lab/motion.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'references.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'video-scrubber.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'segment-picker.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'learning.js'),'utf8'),context);
  context.SwingLabLearning.collect=async()=>[];
  const metadata={sha256:'a'.repeat(64),duration:10,timing:{source:'seconds',verified:false,times:[]}};
  context.SwingLabLocal={prepare:async()=>metadata,analyze:async()=>localResult({impact:2})};
  vm.runInContext(fs.readFileSync(path.join(root,'agent-review.js'),'utf8'),context);
  vm.runInContext(storage,context);
  const fakeStore={init:async()=>({history:copy(history)}),save:async(s,f)=>{records.set(s.id,copy(s));if(f)videos.set(s.id,f)},
    video:async id=>videos.get(id)||null,remove:async id=>{records.delete(id);videos.delete(id)},clear:async()=>{records.clear();videos.clear()}};
  context.SwingLabStorage.createStore=()=>fakeStore;
  const hook='\nglobalThis.testing={state,ready,saveSession,openSession,loadVideoFile,setPhase,analyzeWithEngine,handle,renderCompare,deleteSession,clearHistory,renameSession,capturePhases};\n';
  const end=app.indexOf('})();');vm.runInContext(app.slice(0,end)+hook+app.slice(end),context);
  await context.testing.ready;
  return {c:context,a:context.testing,nodes,records,videos,fakeStore};
}

test('opening history hydrates notes and removes the previous video',async()=>{
  const {a,nodes}=await environment([session('B','Notes B')]);await a.loadVideoFile(file('A'));
  nodes.get('sessionNotes').value='Notes A';await a.openSession('B');
  assert.equal(a.state.current.id,'B');assert.equal(nodes.get('swingVideo').src,'');assert.equal(a.state.videoFile,null);
  assert.equal(nodes.get('sessionNotes').value,'Notes B');
  await a.saveSession();assert.equal(a.state.history[0].notes,'Notes B');
});
test('notes can be deleted and saved history stays independent of draft edits',async()=>{
  const {a,nodes,records}=await environment([session('A','Old')]);await a.openSession('A');
  nodes.get('sessionNotes').value='';await a.saveSession();assert.equal(records.get('A').notes,'');
  a.state.current.phases.Impact=7;assert.equal(a.state.history[0].phases.Impact,1);assert.equal(records.get('A').phases.Impact,1);
});
test('failed saves preserve history and keep the current video available for retry',async()=>{
  const {a,fakeStore,nodes}=await environment([session('A','Saved')]);await a.loadVideoFile(file('B'));
  fakeStore.save=async()=>{throw new Error('QuotaExceededError')};await a.saveSession();
  assert.equal(a.state.history.length,1);assert.equal(a.state.history[0].id,'A');assert.equal(a.state.videoFile.name,'B.webm');
  assert.equal(nodes.get('modalTitle').textContent,'Changes were not saved.');assert.equal(a.state.storageBusy,false);
});
test('videos are stored with metadata and restored when reopening a session',async()=>{
  const {a,videos}=await environment();await a.loadVideoFile(file('A'));const id=a.state.current.id;await a.saveSession();
  assert.equal(videos.get(id).name,'A.webm');await a.loadVideoFile(file('B'));await a.openSession(id);
  assert.equal(a.state.videoFile.name,'A.webm');
});
test('editing and clearing phase marks invalidate their captures',async()=>{
  const {a}=await environment();await a.loadVideoFile(file('A'));a.state.current.phases={Impact:1};a.state.current.captures={Impact:'old'};
  a.setPhase('Impact',2);assert.equal(a.state.current.captures.Impact,undefined);
  a.state.current.captures.Top='old';a.handle('clear-phases');assert.equal(Object.keys(a.state.current.captures).length,0);
});
function localResult(phases){return {id:'local-test',protocol:'swing-phases/1.0',checkpointSha256:'b'.repeat(64),videoSha256:'a'.repeat(64),duration:10,timing:{source:'seconds',verified:false,times:[]},createdAt:new Date().toISOString(),status:'needs-review',phases}}

test('late local responses cannot modify another session',async()=>{
  const {a,c}=await environment();await a.loadVideoFile(file('A'));a.state.engineOnline=true;a.state.engineUrl='https://engine.invalid';
  let finish,options;c.SwingLabLocal.analyze=(u,o)=>{options=o;return new Promise(r=>finish=r)};
  const work=a.analyzeWithEngine(a.state.videoFile);await new Promise(r=>setImmediate(r));await a.loadVideoFile(file('B'));
  assert.equal(options.signal.aborted,false);finish(localResult({impact:3}));await work;
  assert.equal(a.state.current.title,'B');assert.equal(a.state.current.phases.Impact,undefined);assert.equal(a.state.engineBusy,false);const original=a.state.history.find(s=>s.title==='A');assert.equal(original.phases.Impact,3);assert.equal(original.analyses.length,1);
});
test('manual phase changes take precedence over an in-flight analysis',async()=>{
  const {a,c}=await environment();await a.loadVideoFile(file('A'));a.state.engineOnline=true;
  let finish;c.SwingLabLocal.analyze=()=>new Promise(r=>finish=r);const work=a.analyzeWithEngine(a.state.videoFile);
  await new Promise(r=>setImmediate(r));a.setPhase('Impact',4);finish(localResult({impact:2,top:1}));await work;
  assert.equal(a.state.current.phases.Impact,4);assert.equal(a.state.current.phases.Top,undefined);
  assert.equal(a.state.current.analyses[0].phases.Impact,2);
});

test('a rejected video without segment bounds leaves review controls usable and clears stale automatic marks',async()=>{
  const {a,c,nodes}=await environment();await a.loadVideoFile(file('A'));a.state.engineOnline=true;
  await a.analyzeWithEngine(a.state.videoFile);assert.equal(a.state.current.phases.Impact,2);
  c.SwingLabLocal.analyze=async()=>({...localResult({}),status:'rejected',window:{status:'rejected',reason:'No movement'},note:'No movement'});
  await a.analyzeWithEngine(a.state.videoFile);assert.equal(a.state.engineBusy,false);assert.equal(a.state.current.phases.Impact,undefined);assert.equal(nodes.get('confirmNoSwing').disabled,false);assert.equal(a.state.current.analyses.length,2);
});
test('the engine deadline aborts the request and leaves manual review usable',async()=>{
  const {a,c,nodes}=await environment();await a.loadVideoFile(file('A'));a.state.engineOnline=true;
  c.setTimeout=(fn,ms)=>setTimeout(fn,ms===240000?1:ms);
  c.SwingLabLocal.analyze=(u,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError'))));
  await a.analyzeWithEngine(a.state.videoFile);assert.equal(a.state.engineBusy,false);assert.match(nodes.get('analysisProgressText').textContent,/tiempo agotado/);a.setPhase('Impact',3);assert.equal(a.state.current.phases.Impact,3);
});
test('discarding an unsaved session requires confirmation',async()=>{
  const {a,c}=await environment([session('saved')]);await a.loadVideoFile(file('draft'));c.confirm=()=>false;
  await a.openSession('saved');assert.equal(a.state.current.title,'draft');
  await a.loadVideoFile(file('other'));assert.equal(a.state.current.title,'draft');
});
test('local marking never uses stored remote service URLs or uploads the video',async()=>{
  const {a,c}=await environment();await a.loadVideoFile(file('A'));a.state.engineOnline=true;
  a.state.engineUrl='https://unused.invalid';c.fetch=()=>{throw Error('No upload is allowed')};
  await a.analyzeWithEngine(a.state.videoFile);assert.equal(a.state.current.phases.Impact,2);assert.equal(a.state.current.analyses[0].modelId,'local-test');
});
test('all saved sessions are available for comparison',async()=>{
  const {a}=await environment(Array.from({length:35},(_,i)=>session(String(i))));a.state.compareSelected=['30','31'];a.renderCompare();assert.equal(a.state.compareSelected.length,2);
});
test('failed delete and clear operations preserve the saved history',async()=>{
  const {a,fakeStore,records}=await environment([session('A')]);fakeStore.remove=async()=>{throw new Error('blocked')};fakeStore.clear=fakeStore.remove;
  await a.deleteSession('A');await a.clearHistory();assert.equal(a.state.history.length,1);assert.equal(records.size,1);
});
test('renaming changes only the title and persists it',async()=>{
  const {a,records}=await environment([session('A','Saved notes')]);await a.renameSession('A','Renamed');assert.equal(records.get('A').title,'Renamed');assert.equal(records.get('A').notes,'Saved notes');
});
test('schema normalization rejects invalid history and unsafe image references',()=>{
  const c={};vm.createContext(c);vm.runInContext(storage,c);const normalize=c.SwingLabStorage.normalize;
  for(const input of [null,{},[],{id:'<unsafe>'}])assert.equal(normalize(input),null);
  const normalized=normalize({...session('A'),phases:{Impact:NaN,Top:-1,Finish:2},thumb:'https://untrusted.invalid/pixel',captures:{Finish:'bad'}});
  assert.deepEqual(Object.keys(normalized.phases),['Finish']);assert.equal(normalized.thumb,'');assert.equal(Object.keys(normalized.captures).length,0);
});
test('angle measurement uses pixel geometry and accepts a zero endpoint',()=>{
  const source=app.match(/  function angleVal\(s\)\{[\s\S]*?\n  \}/)[0];
  const angle=vm.runInNewContext(source+';angleVal',{canvas:{width:400,height:800}});
  const shape={x1:.1,y1:.5,x2:.5,y2:.5,x3:.9,y3:.7};
  assert.ok(Math.abs(angle(shape)-135)<1e-9);
  assert.ok(Math.abs(angle({x1:.5,y1:.5,x2:0,y2:.5,x3:0,y3:0})-90)<1e-9);
});

function serviceWorker(){
  const handlers={},deleted=[],writes=[],cache=new Map();let fetchImpl=async()=>new Response('ok');
  const scope='https://test.invalid/GLAB/';const context={URL,location:{origin:'https://test.invalid'},
    self:{registration:{scope},addEventListener:(n,f)=>handlers[n]=f,clients:{claim:async()=>{}},skipWaiting:async()=>{}},
    caches:{keys:async()=>['other-app','swing-lab-pwa:/GLAB/:old','swing-lab-pwa:/another/:old'],delete:async k=>deleted.push(k),
      open:async()=>({match:async k=>cache.get(k),put:async(k,v)=>{writes.push(k);cache.set(k,v)},addAll:async()=>{}})},fetch:(...args)=>fetchImpl(...args)};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
  async function request(path,mode='navigate'){
    let response;const tasks=[];handlers.fetch({request:{method:'GET',url:scope+path,mode,headers:new Headers()},respondWith:p=>response=p,waitUntil:p=>tasks.push(p)});
    const result=await response;await Promise.all(tasks);return result;
  }
  return {handlers,deleted,writes,cache,request,context,setFetch:f=>fetchImpl=f};
}
test('service worker deletes only caches owned by this installation',async()=>{
  const {handlers,deleted}=serviceWorker();let work;handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,['swing-lab-pwa:/GLAB/:old']);
});
test('dashboard is cached by its own route and remains available offline',async()=>{
  const sw=serviceWorker();await sw.request('dashboard.html');assert.deepEqual(sw.writes,['https://test.invalid/GLAB/dashboard.html']);
  sw.setFetch(async()=>{throw new Error('offline')});assert.equal((await sw.request('dashboard.html')).status,200);
});
test('service worker does not intercept APIs or cache HTTP errors',async()=>{
  const sw=serviceWorker();assert.equal(await sw.request('analyze','cors'),undefined);sw.setFetch(async()=>new Response('error',{status:500}));
  assert.equal((await sw.request('index.html')).status,500);assert.equal(sw.writes.length,0);
});
test('both HTML pages request exactly the scripts and styles that are precached',()=>{
  const sw=serviceWorker();const shell=vm.runInContext('Array.from(SHELL_URLS)',sw.context);
  for(const name of ['index.html','dashboard.html']){
    const html=fs.readFileSync(path.join(root,name),'utf8');const urls=[...html.matchAll(/<script src="([^\"]+)"|<link rel="stylesheet" href="([^\"]+)"/g)].map(m=>m[1]||m[2]);
    assert.equal(urls.length,24);for(const url of urls){assert.ok(shell.includes('https://test.invalid/GLAB/'+url));assert.ok(fs.existsSync(path.join(root,url.split('?')[0])))}
  }
});

test('impact reference is one action, reaches the engine, survives save and does not leak into a new video',async()=>{
 const {a,c,nodes,records}=await environment();await a.loadVideoFile(file('A'));
 nodes.get('swingVideo').currentTime=3.21;a.handle('mark-impact-reference');
 assert.equal(a.state.current.impactReference.time,3.21);assert.equal(a.state.current.phases.Impact,3.21);
 let options;c.SwingLabLocal.analyze=async(f,o)=>{options=o;return {...localResult({address:1,takeaway:2,top:3,impact:3.21,finish:4}),impactEvidence:{anchor:3.21,source:'user-impact',status:'needs-review'}}};
 await a.analyzeWithEngine(a.state.videoFile);assert.equal(options.impactAnchor,3.21);
 assert.equal(a.state.current.phases.Impact,3.21);assert.equal(a.state.current.analyses[0].impactEvidence.source,'user-impact');assert.match(nodes.get('phaseAudit').innerHTML,/your reference/);
 await a.saveSession();const id=a.state.current.id;assert.equal(records.get(id).impactReference.time,3.21);
 await a.loadVideoFile(file('B'));assert.equal(a.state.current.impactReference,undefined);
 await a.openSession(id);assert.equal(a.state.current.impactReference.time,3.21);
 a.handle('clear-impact-reference');assert.equal(a.state.current.impactReference,null);assert.equal(a.state.current.phases.Impact,3.21);
});
test('clearing all phases also removes the analysis impact reference',async()=>{
 const {a,nodes}=await environment();await a.loadVideoFile(file('A'));nodes.get('swingVideo').currentTime=2;
 a.handle('mark-impact-reference');a.handle('clear-phases');assert.equal(a.state.current.impactReference,null);
 assert.equal(a.state.current.phases.Impact,undefined);
});

test('analysis starts with an on-video trim, then offers optional impact without running early',async()=>{
 const {a,c}=await environment();await a.loadVideoFile(file('guided'));
 assert.equal(c.SwingLabReview.snapshot().step,'manual');let opened=0,calls=0,received;c.SwingLabAgent.openModes=()=>{opened++};
 c.SwingLabLocal.analyze=async(f,o)=>{calls++;received=o;return localResult({address:.5,takeaway:1,top:2,impact:2.5,finish:4})};
 await c.SwingLabReview.command('engine');assert.equal(opened,0);assert.equal(c.SwingLabReview.snapshot().step,'trim');assert.equal(c.SwingLabReview.snapshot().engineGuide,true);
 await c.SwingLabReview.command('analyze');assert.equal(calls,0);
 c.SwingLabReview.setRange({start:.25,end:5});await c.SwingLabReview.command('confirm-trim');assert.equal(c.SwingLabReview.snapshot().step,'analyze');assert.equal(calls,0);assert.equal(a.state.current.impactReference,undefined);
 await c.SwingLabReview.command('analyze');assert.equal(calls,1);assert.deepEqual(copy(received.range),{start:.25,end:5});assert.equal(received.impactAnchor,undefined);assert.equal(c.SwingLabReview.snapshot().step,'review');
 assert.equal(c.SwingLabReview.snapshot().phases.Impact,2.5);
});
test('fullscreen impact and correction commands use their visible frame rather than the stale inline player',async()=>{
 const {a,c,nodes}=await environment();await a.loadVideoFile(file('guided'));
 nodes.get('swingVideo').currentTime=.2;
 await c.SwingLabReview.command('mark',3.45);
 assert.equal(a.state.current.impactReference.time,3.45);assert.equal(c.SwingLabReview.snapshot().step,'analyze');
 await c.SwingLabReview.command('phase',2.1,'Top');assert.equal(a.state.current.phases.Top,2.1);
 await c.SwingLabReview.command('edit-impact');assert.equal(c.SwingLabReview.snapshot().step,'impact');
 a.state.engineBusy=true;await c.SwingLabReview.command('skip');assert.equal(a.state.current.impactReference.time,3.45);
 a.state.engineBusy=false;
});

test('manual fullscreen review works without invoking the motor and keeps marks when opening its guide',async()=>{
 const {a,c}=await environment();await a.loadVideoFile(file('manual'));
 let calls=0;c.SwingLabLocal.analyze=async()=>{calls++;throw Error('not requested')};
 await c.SwingLabReview.command('phase',1.7,'Top');
 assert.equal(a.state.current.phases.Top,1.7);assert.equal(calls,0);
 assert.equal(c.SwingLabReview.snapshot().step,'manual');assert.equal(c.SwingLabReview.snapshot().engineGuide,false);
 c.SwingLabAgent.openModes=()=>{};await c.SwingLabReview.command('engine');assert.equal(c.SwingLabReview.snapshot().engineGuide,true);assert.equal(c.SwingLabReview.snapshot().step,'trim');
 await c.SwingLabReview.command('manual');assert.equal(c.SwingLabReview.snapshot().engineGuide,false);
 assert.equal(a.state.current.phases.Top,1.7);assert.equal(calls,0);
});

test('report saves phase captures and capture annotations survive reopening without the source video',async()=>{
 const {a,c,records,videos}=await environment();await a.loadVideoFile(file('capture'));
 await c.SwingLabReview.command('phase',2,'Impact');await c.SwingLabReview.command('report');const id=a.state.current.id;
 assert.match(records.get(id).captures.Impact,/^data:image/);
 const line={id:1,type:'line',color:'#99f032',width:5,x1:.1,y1:.2,x2:.4,y2:.5};
 c.SwingLabReview.saveCapture('Impact',[line]);await a.saveSession();assert.equal(records.get(id).captureDrawings.Impact.length,1);
 videos.delete(id);await a.loadVideoFile(file('other'));await a.openSession(id);
 assert.equal(a.state.videoFile,null);assert.equal(c.SwingLabReview.capture('Impact').drawings.length,1);
 assert.equal(a.state.current.drawings.length,0);
});

test('agent result persists against its source while a different video remains open',async()=>{
 const {a,c,nodes,records}=await environment();await a.loadVideoFile(file('agent-A'));await new Promise(r=>setImmediate(r));
 const context={request_id:'packet-a',video_sha256:'a'.repeat(64),fingerprint:'original',context:{duration_s:10},frames:[{frame_id:'F001',time_s:1,image:'data:image/jpeg;base64,AAAA'}]};
 a.state.current.agentContext=context;nodes.get('sessionNotes').value='Notas originales';const original=copy(a.state.current),originalFile=a.state.videoFile;
 await c.SwingLabAgentBridge.checkpoint(original,originalFile);await a.loadVideoFile(file('agent-B'));
 const review=c.SwingLabAgent.parseReview({schema:'swinglab-agent-result/1',request_id:context.request_id,video_sha256:context.video_sha256,review:{summary:'Resultado de A',capture_quality:{can_review:false},phase_review:c.SwingLabAgent.IDS.map(phase=>({phase,status:'uncertain',frame_id:null,time_s:null,evidence:'No evaluable'}))}},context);
 await c.SwingLabAgentBridge.completeReview(original,originalFile,review);
 assert.equal(a.state.current.title,'agent-B');assert.equal(a.state.current.agentReview,undefined);assert.equal(records.get(original.id).agentReview.summary,'Resultado de A');assert.equal(records.get(original.id).notes,'Notas originales');
 await assert.rejects(()=>c.SwingLabAgentBridge.completeReview(original,originalFile,{...review,request_id:'another-packet'}),/no corresponde/);
});
test('annotations and notes created while ChatGPT responds survive report attachment',async()=>{
 const {a,c,nodes,records}=await environment();await a.loadVideoFile(file('annotated'));await new Promise(r=>setImmediate(r));
 const context={request_id:'packet',video_sha256:'a'.repeat(64),fingerprint:'original',context:{duration_s:10},frames:[{frame_id:'F001',time_s:1,image:'data:image/jpeg;base64,AAAA'}]};a.state.current.agentContext=context;
 const original=copy(a.state.current),originalFile=a.state.videoFile;await c.SwingLabAgentBridge.checkpoint(original,originalFile);
 nodes.get('sessionNotes').value='Referencia añadida mientras esperaba';const line={type:'line',color:'#99ff00',width:4,x1:.2,y1:.3,x2:.8,y2:.4};c.SwingLabEditor={getDrawings:()=>[line]};
 const review=c.SwingLabAgent.parseReview({schema:'swinglab-agent-result/1',request_id:context.request_id,video_sha256:context.video_sha256,review:{summary:'Hecho',capture_quality:{can_review:false},phase_review:c.SwingLabAgent.IDS.map(phase=>({phase,status:'uncertain',frame_id:null,time_s:null,evidence:'No evaluable'}))}},context);
 await c.SwingLabAgentBridge.completeReview(original,originalFile,review);
 assert.equal(records.get(original.id).notes,'Referencia añadida mientras esperaba');assert.deepEqual(copy(records.get(original.id).drawings),[line]);assert.equal(a.state.current.agentReview.summary,'Hecho');
});
