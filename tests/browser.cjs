// Browser integration tests. Install Playwright locally, or set PLAYWRIGHT_MODULE_PATH.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..');
const artifacts=path.join(root,'.test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
const hooks='\nglobalThis.testing={state,ready,store,saveSession,openSession,loadVideoFile,setPhase,analyzeWithEngine,handle,deleteSession,clearHistory,capturePhases,renameSession};\n';
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const boundary=app.indexOf('})();');
const instrumented=app.slice(0,boundary)+hooks+app.slice(boundary);
const errors=[],results=[];
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.end(relative==='app.js'?instrumented:fs.readFileSync(file));
});
let browser;
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name)}
async function ready(page){await page.waitForFunction(()=>window.testing?.state.storageReady);await page.evaluate(()=>testing.handle('go-home'))}
async function closeModal(page){if(await page.locator('#mockupModal').isVisible())await page.locator('#mockupModal .modal-back').click()}

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await context.addInitScript(()=>{
    if(!localStorage.getItem('swinglab_history_v19'))localStorage.setItem('swinglab_history_v19',JSON.stringify([
      {id:'legacy',title:'Older swing',date:'2026-01-01',fileName:'old.mp4',phases:{Impact:1},captures:{},notes:'Legacy notes'}
    ]));
  });
  await page.goto(origin);await ready(page);
  await check('legacy history migrates without deleting its original data',async()=>{
    const data=await page.evaluate(()=>({history:testing.state.history,raw:localStorage.getItem('swinglab_history_v19')}));
    assert.equal(data.history[0].id,'legacy');assert.ok(data.raw.includes('Legacy notes'));
  });
  const video=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=480;const ctx=canvas.getContext('2d');
    const stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
    const done=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=resolve});recorder.start();
    for(let i=0;i<20;i++){ctx.fillStyle=i%2?'#164d22':'#32548a';ctx.fillRect(0,0,320,480);ctx.fillStyle='white';ctx.fillRect(20+i*10,100,30,80);await new Promise(r=>setTimeout(r,60))}
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
  });
  const payload={name:'swing-A.webm',mimeType:'video/webm',buffer:Buffer.from(video)};
  await check('a real video loads, notes save, and phase captures decode',async()=>{
    await page.setInputFiles('#videoInput',payload);
    await page.waitForFunction(()=>document.getElementById('swingVideo').readyState>=2);
    await page.evaluate(async()=>{testing.setPhase('Impact',.3);await testing.capturePhases()});
    await page.fill('#sessionNotes','Notes A');await page.click('#screenResults [data-action="save-session"]');
    await page.waitForFunction(()=>document.getElementById('modalTitle').textContent==='Session saved.');
    const result=await page.evaluate(()=>({id:testing.state.current.id,capture:testing.state.current.captures.Impact,saved:testing.state.history[0].notes}));
    assert.ok(result.capture.startsWith('data:image/jpeg;base64,'));assert.equal(result.saved,'Notes A');
    await page.screenshot({path:path.join(artifacts,'review-report.png')});
  });
  const firstId=await page.evaluate(()=>testing.state.current.id);
  await closeModal(page);
  await check('a failed video write rolls back metadata and preserves the last saved session',async()=>{
    const result=await page.evaluate(async()=>{
      const original=IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put=function(...args){if(this.name==='videos')throw new DOMException('Test storage limit','QuotaExceededError');return original.apply(this,args)};
      try{document.getElementById('sessionNotes').value='Unsaved change';await testing.saveSession()}
      finally{IDBObjectStore.prototype.put=original}
      const history=await testing.store.list();return {stored:history.find(s=>s.id===testing.state.current.id).notes,message:document.getElementById('modalTitle').textContent,history:testing.state.history.find(s=>s.id===testing.state.current.id).notes};
    });
    assert.equal(result.stored,'Notes A');assert.equal(result.history,'Notes A');assert.equal(result.message,'Changes were not saved.');
    await page.evaluate(()=>{document.getElementById('sessionNotes').value='Notes A';testing.state.current.notes='Notes A'});await closeModal(page);
  });
  await check('drawings are saved with the session and restored after reload',async()=>{
    await page.evaluate(()=>testing.openSession(testing.state.current.id));
    await page.screenshot({path:path.join(artifacts,'review-screen.png')});
    await page.locator('#fullscreenEditor').waitFor({state:'visible'});await page.click('[data-fs-action="toggle-tools"]');await page.click('[data-tool="line"]');
    const bounds=await page.locator('#fullscreenCanvas').boundingBox();
    await page.mouse.move(bounds.x+80,bounds.y+260);await page.mouse.down();await page.mouse.move(bounds.x+250,bounds.y+420);await page.mouse.up();
    assert.equal(await page.evaluate(()=>SwingLabEditor.getDrawings().length),1);
    await page.screenshot({path:path.join(artifacts,'drawing-editor.png')});
    const downloadPromise=page.waitForEvent('download');await page.click('[data-fs-action="snapshot"]');const download=await downloadPromise;
    await download.saveAs(path.join(artifacts,'annotated-frame.png'));
    assert.ok(fs.statSync(path.join(artifacts,'annotated-frame.png')).size>1000);
    await page.click('[data-fs-action="close"]');await page.click('#screenReview [data-action="save-session"]');
    await page.waitForFunction(()=>!testing.state.storageBusy);await page.reload();await ready(page);
    await page.evaluate(id=>testing.openSession(id),firstId);await page.waitForFunction(()=>document.getElementById('swingVideo').readyState>=2);
    assert.equal(await page.evaluate(()=>SwingLabEditor.getDrawings().length),1);
    assert.equal(await page.inputValue('#sessionNotes'),'Notes A');assert.equal(await page.evaluate(()=>testing.state.videoFile.name),'swing-A.webm');
  });
  await check('switching sessions restores the correct video and never carries notes or drawings over',async()=>{
    await page.setInputFiles('#videoInput',{...payload,name:'swing-B.webm'});await page.waitForFunction(()=>testing.state.current?.fileName==='swing-B.webm');
    await page.waitForFunction(()=>document.getElementById('swingVideo').readyState>=2);
    assert.equal(await page.inputValue('#sessionNotes'),'');assert.equal(await page.evaluate(()=>SwingLabEditor.getDrawings().length),0);
    await page.evaluate(id=>testing.openSession(id),firstId);
    assert.equal(await page.evaluate(()=>testing.state.videoFile.name),'swing-A.webm');assert.equal(await page.inputValue('#sessionNotes'),'Notes A');
  });
  await check('old sessions without video show a report and clear both players',async()=>{
    await page.evaluate(()=>testing.openSession('legacy','results'));
    const result=await page.evaluate(()=>({file:testing.state.videoFile,src:document.getElementById('swingVideo').getAttribute('src'),fullscreen:document.getElementById('fullscreenVideo').getAttribute('src'),notes:document.getElementById('sessionNotes').value}));
    assert.equal(result.file,null);assert.equal(result.src,null);assert.equal(result.fullscreen,null);assert.equal(result.notes,'Legacy notes');
    await page.fill('#sessionNotes','');await page.click('#screenResults [data-action="save-session"]');await page.waitForFunction(()=>!testing.state.storageBusy);
    assert.equal(await page.evaluate(()=>testing.state.history.find(s=>s.id==='legacy').notes),'');
  });
  await closeModal(page);
  await check('both start pages and versioned assets load without network after installation',async()=>{
    await page.evaluate(async()=>{await navigator.serviceWorker.ready});
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);
    await page.evaluate(()=>caches.open('unrelated-app').then(cache=>cache.put('/unrelated',new Response('keep'))));
    await context.setOffline(true);await page.goto(origin+'/dashboard.html');await ready(page);
    assert.equal(await page.evaluate(()=>testing.state.history.length),2);
    await page.goto(origin+'/index.html');await ready(page);
    assert.equal(await page.evaluate(()=>caches.has('unrelated-app')),true);
    await context.setOffline(false);
  });
  await check('original video is playable again while offline',async()=>{
    await context.setOffline(true);await page.evaluate(id=>testing.openSession(id),firstId);
    await page.waitForFunction(()=>document.getElementById('swingVideo').readyState>=2);
    assert.ok(await page.evaluate(()=>Number.isFinite(document.getElementById('swingVideo').duration)));
    await context.setOffline(false);
  });
  await check('deleting a session removes its video and does not resurrect legacy data on reload',async()=>{
    await page.evaluate(()=>testing.deleteSession('legacy'));await page.reload();await ready(page);
    assert.equal(await page.evaluate(()=>testing.state.history.some(s=>s.id==='legacy')),false);
    await page.evaluate(id=>testing.deleteSession(id),firstId);
    assert.equal(await page.evaluate(id=>testing.store.video(id),firstId),null);
  });
  await check('clearing all history also removes the legacy recovery copy',async()=>{
    await page.evaluate(()=>testing.clearHistory());assert.equal(await page.evaluate(()=>localStorage.getItem('swinglab_history_v19')),null);
    assert.equal(await page.evaluate(()=>testing.state.history.length),0);
  });
  await context.close();
  for(const raw of ['{}','null','not json']){
    const other=await browser.newContext();const p=await other.newPage();p.on('pageerror',e=>errors.push(e.message));
    await other.addInitScript(raw=>localStorage.setItem('swinglab_history_v19',raw),raw);
    await check('malformed legacy history does not prevent startup: '+raw,async()=>{
      await p.goto(origin);await ready(p);assert.equal(await p.evaluate(()=>testing.state.history.length),0);
      assert.equal(await p.evaluate(()=>localStorage.getItem('swinglab_history_v19')),raw);
    });await other.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`${results.length} browser integration checks passed; no uncaught page errors.`);
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
