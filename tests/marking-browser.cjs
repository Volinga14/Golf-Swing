const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const {createServer}=require('../tools/serve-marking-lab.cjs');
const root=path.resolve(__dirname,'..'),privateDirectory=path.resolve(root,'../audit/marking-references');
let browser,server;
const results=[];
const privatePack=fs.existsSync(path.join(privateDirectory,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(privateDirectory,'manifest.json'),'utf8')):null;
const swing=privatePack?.records.find(r=>r.reference.status==='draft');
const originalImpact=swing?.reference.phases.impact.time, editedImpact=originalImpact+.01;
async function test(name,fn){await fn();results.push(name);console.log('PASS '+name)}
(async()=>{
  server=createServer(privateDirectory);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],uploads=[],foreign=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  context.on('request',request=>{if(request.method()==='POST')uploads.push(request.url());if(!request.url().startsWith(origin)&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))foreign.push(request.url())});
  await page.goto(origin+'/lab/');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Abre tus')); 
  await test('definitions load with no reference data in the public distribution',async()=>{assert.equal(await page.locator('#definitions article').count(),5);assert.equal(await page.locator('#record option').count(),0);assert.ok(await page.locator('#confirm-reference').isDisabled());assert.deepEqual(uploads,[])});
  await test('importing a reference into an empty library enables its editing controls',async()=>{
    const isolated=await browser.newContext(),importer=await isolated.newPage();
    try{await importer.goto(origin+'/lab/');await importer.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Abre tus'));
      const pack={schema:1,protocol:'swing-phases/1.0',records:[{id:'import-check',duration:6,sha256:'a'.repeat(64),title:'Import check',reference:{status:'draft',phases:{}}}]};
      await importer.setInputFiles('#import',{name:'references.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});await importer.waitForFunction(()=>document.querySelectorAll('#record option').length===1);assert.equal(await importer.locator('#reviewer').isEnabled(),true);assert.equal(await importer.locator('#run-local').isEnabled(),true);
    }finally{await isolated.close()}
  });
  await test('exported models match PyTorch outputs inside a real WebAssembly worker',async()=>{
    const actual=await page.evaluate(()=>new Promise((resolve,reject)=>{const worker=new Worker('./candidate-worker.js'),timer=setTimeout(()=>{worker.terminate();reject(Error('Parity timeout'))},120000);worker.onmessage=e=>{clearTimeout(timer);worker.terminate();e.data.type==='error'?reject(Error(e.data.message)):resolve(e.data)};worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message))};worker.postMessage({type:'parity',id:'parity'})}));
    const golden=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/onnx-golden.json'),'utf8'));
    for(const name of ['encoder','temporal']){assert.equal(actual[name].length,golden[name].length);const difference=Math.max(...actual[name].map((x,i)=>Math.abs(x-golden[name][i])));assert.ok(difference<.0002,`${name}: max error ${difference}`)}
  });
  if(privatePack&&swing){
    await test('private reference videos load by matching their SHA-256 fingerprints',async()=>{await page.click('#load-private');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('7 vídeos privados'),{},{timeout:90000});await page.waitForFunction(()=>document.getElementById('video').readyState>=2);assert.deepEqual(uploads,[])});
    await test('local candidate marks a real swing and keeps the GLAB snapshot unchanged',async()=>{
      await page.selectOption('#record',swing.id);await page.waitForFunction(()=>document.getElementById('video').readyState>=2);await page.click('#run-local');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Propuestas guardadas'),{},{timeout:120000});
      assert.equal(await page.locator('#comparison tr').count(),5);for(const row of await page.locator('#comparison tr').all())assert.ok((await row.locator('td').nth(6).innerText()).includes('s'));assert.deepEqual(uploads,[]);
      fs.mkdirSync(path.join(root,'.test-artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'.test-artifacts/marking-lab.png'),fullPage:true});
    });
    await test('reference edits are explicit, revisioned, persisted and independent of predictions',async()=>{
      const before=await page.locator('#comparison tr').nth(3).locator('td').nth(6).innerText();await page.fill('#mark-time',String(editedImpact));await page.fill('#reviewer','QA');await page.click('#confirm-reference');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Referencia confirmada'));
      assert.equal(await page.locator('#comparison tr').nth(3).locator('td').nth(6).innerText(),before);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#record option').length===7);await page.selectOption('#record',swing.id);await page.waitForFunction(()=>document.getElementById('reference-status').textContent==='Revisada · QA');assert.equal(Number(await page.inputValue('#mark-time')),editedImpact);assert.equal(await page.locator('#revisions button').count(),1);
      await page.click('.history summary');await page.click('#restore-seed');assert.match(await page.locator('#draft-state').textContent(),/sin guardar/);assert.equal(Number(await page.inputValue('#mark-time')),originalImpact);assert.ok((await page.locator('#comparison tr').nth(3).locator('td').nth(1).innerText()).includes(editedImpact.toFixed(3)));await page.click('#save-draft');
    });
    await test('blank control is rejected with no fabricated phases',async()=>{await page.selectOption('#record','negative-no-swing');await page.waitForFunction(()=>document.getElementById('video').readyState>=2);await page.click('#run-local');await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('El candidato ha rechazado'),{},{timeout:30000});assert.ok((await page.locator('#comparison').innerText()).includes('Rechazado'))});
    await test('offline preparation keeps the worker, model and stored videos usable offline',async()=>{
      await page.click('#offline');await page.waitForFunction(()=>document.getElementById('offline').textContent==='Preparado sin conexión',{},{timeout:90000});await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#record option').length===7);await context.setOffline(true);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#record option').length===7);await page.selectOption('#record',swing.id);await page.waitForFunction(()=>document.getElementById('video').readyState>=2);await page.click('#run-local');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Propuestas guardadas'),{},{timeout:120000});await context.setOffline(false);
    });
  }else console.log('SKIP private-video integration: prepare audit/marking-references first.');
  await test('mobile layout keeps the comparator usable without page overflow',async()=>{await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('#run-local').isVisible())});
  assert.deepEqual(uploads,[]);assert.deepEqual(foreign,[]);assert.deepEqual(errors,[]);console.log(`${results.length} marking lab checks passed; no video uploads or external requests.`);
})().catch(async error=>{console.error(error);if(browser){for(const ctx of browser.contexts())for(const p of ctx.pages())console.error(await p.evaluate(()=>({status:document.getElementById('status')?.textContent,record:document.getElementById('record')?.value,video:{error:document.getElementById('video')?.error?.message,ready:document.getElementById('video')?.readyState}})))}process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.closeAllConnections();if(server)server.close()});
