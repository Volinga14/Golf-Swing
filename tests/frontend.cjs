// Responsive UI and local profile regression checks, using an isolated browser.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'.test-artifacts');
const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.replace(/^\/+/, '')||'index.html',file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
});
let browser;
async function enter(page){if(await page.getByRole('button',{name:'Get started',exact:true}).isVisible())await page.getByRole('button',{name:'Get started',exact:true}).click();await page.locator('#screenHome.is-current').waitFor()}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await enter(page);
  await page.locator('#screenHome.is-current').waitFor();
  assert.equal(await page.locator('.bottom-nav').isVisible(),true);
  assert.equal(await page.locator('#screenHome .new-analysis-btn').count(),1);
  assert.equal(await page.locator('#streakWeek .is-practiced').count(),0);
  await page.getByRole('button',{name:'How to use Swing Lab',exact:true}).click();
  assert.equal(await page.getByRole('dialog').isVisible(),true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').isVisible(),false);
  assert.equal(await page.locator('#appView').evaluate(el=>el.inert),false);
  await page.locator('.bottom-nav [data-nav="upload"]').click();
  assert.equal(await page.getByRole('button',{name:'Upload video Choose from your gallery'}).isVisible(),true);
  assert.equal(await page.getByRole('button',{name:'Record video Use your camera'}).isVisible(),true);
  console.log('PASS clear entry, help dialog and Escape, visible navigation, upload and camera choices retained');
  await page.locator('.bottom-nav [data-nav="profile"]').click();await page.getByRole('button',{name:'Edit profile'}).click();
  await page.locator('#profileNameInput').fill('Test Golfer');await page.getByRole('button',{name:'Save profile',exact:true}).click();
  await page.locator('#profileHand').selectOption('left');await page.locator('#profileView').selectOption('FO');await page.locator('#profileClub').fill('Driver');await page.locator('#profileClub').press('Tab');
  await page.reload();await enter(page);
  assert.equal(await page.locator('#homeGreeting').textContent(),'Hi, Test');
  await page.locator('.bottom-nav [data-nav="profile"]').click();
  assert.equal(await page.locator('#profileName').textContent(),'Test Golfer');assert.equal(await page.locator('#profileHand').inputValue(),'left');assert.equal(await page.locator('#profileView').inputValue(),'FO');assert.equal(await page.locator('#profileClub').inputValue(),'Driver');
  await page.getByRole('button',{name:'Open settings',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Prepare offline',exact:true}).isVisible(),true);
  console.log('PASS name and preferences persist across reload; engine settings remain reachable');
  await page.evaluate(async()=>{
    const store=SwingLabStorage.createStore();await store.init();const now=new Date(),monday=new Date(now.getFullYear(),now.getMonth(),now.getDate());monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
    for(let i=0;i<3;i++){const d=new Date(monday);d.setDate(d.getDate()+(i===2?-1:0));await store.save({id:'ui-'+i,title:'Practice '+(i+1),date:d.toISOString(),fileName:'test.webm',phases:{Impact:.3},captures:{},notes:'Example review',drawings:[]},null)}
  });
  await page.reload();await enter(page);await page.waitForFunction(()=>document.getElementById('streakCount').textContent==='2 sessions this week');
  assert.equal(await page.locator('#streakWeek .is-practiced').count(),1);
  console.log('PASS weekly activity counts saved sessions, groups same-day practice, excludes previous week');
  await page.locator('.bottom-nav [data-nav="history"]').click();
  await page.locator('#historySearch').fill('Practice 2');
  assert.equal(await page.locator('#historyList .history-item').count(),1);
  await page.locator('#historySearch').fill('');
  assert.equal(await page.locator('#historyList .history-item').count(),3);
  console.log('PASS history search filters sessions without changing saved data');
  fs.mkdirSync(artifacts,{recursive:true});
  for(const [width,height]of [[320,568],[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});
    for(const destination of ['home','upload','history','compare','profile']){
      await page.locator(`.bottom-nav [data-nav="${destination}"]`).click();
      const layout=await page.evaluate(()=>{const screen=document.querySelector('.app-screen.is-current'),nav=document.querySelector('.bottom-nav'),box=screen.getBoundingClientRect(),n=nav.getBoundingClientRect();return {overflow:screen.scrollWidth>screen.clientWidth+1,bottom:box.bottom,navTop:n.top,selected:nav.querySelectorAll('[aria-current="page"]').length}});
      assert.equal(layout.overflow,false,`${destination} overflows at ${width}`);assert.ok(layout.bottom<=layout.navTop+1);assert.equal(layout.selected,1);
      const alignment=await page.locator('.bottom-nav .nav-item').evaluateAll(buttons=>buttons.map(button=>{const b=button.getBoundingClientRect(),svg=button.querySelector('svg').getBoundingClientRect(),label=button.lastElementChild.getBoundingClientRect();return {offset:Math.abs((svg.left+svg.width/2)-(b.left+b.width/2)),baseline:label.bottom}}));
      assert.ok(alignment.every(a=>a.offset<1),`navigation icons not centered at ${width}`);
      assert.ok(Math.max(...alignment.map(a=>a.baseline))-Math.min(...alignment.map(a=>a.baseline))<=2,`navigation label baselines differ at ${width}`);
      const iconOffsets=await page.locator('.app-screen.is-current .back-btn svg,.app-screen.is-current .circle-btn svg,.app-screen.is-current .choice-icon svg').evaluateAll(icons=>icons.map(svg=>{const i=svg.getBoundingClientRect(),p=svg.parentElement.getBoundingClientRect();return {x:Math.abs(i.left+i.width/2-p.left-p.width/2),y:Math.abs(i.top+i.height/2-p.top-p.height/2)}}));
      assert.ok(iconOffsets.every(i=>i.x<=1&&i.y<=1),`${destination} has an off-center icon at ${width}`);
      if(destination==='upload'){const copyOffsets=await page.locator('.choice-copy').evaluateAll(groups=>groups.flatMap(group=>Array.from(group.children).map(child=>Math.abs(child.getBoundingClientRect().left-group.getBoundingClientRect().left))));assert.ok(copyOffsets.every(x=>x<=1),`upload labels drift at ${width}`)}
      if(width===390&&['home','profile','upload'].includes(destination))await page.screenshot({path:path.join(artifacts,`frontend-${destination}.png`)});
    }
  }
  await page.setViewportSize({width:390,height:844});await page.locator('.bottom-nav [data-nav="compare"]').click();
  await page.locator('[data-compare-id="ui-0"]').click();await page.locator('[data-compare-id="ui-1"]').click();
  await page.locator('[data-compare-id="ui-2"]').click();
  assert.equal(await page.locator('[data-compare-id][aria-pressed="true"]').count(),2);
  assert.equal(await page.locator('[data-compare-id="ui-2"]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('.phase-compare-table').isVisible(),true);await page.locator('.compare-preview-card').first().click();assert.equal(await page.locator('#compareViewer').isVisible(),true);await page.getByRole('button',{name:'Done',exact:true}).click();
  console.log('PASS mobile, tablet and desktop layout; all destinations and comparison overlay work');
  assert.deepEqual(errors,[]);console.log('Frontend checks passed; no uncaught page errors.');await context.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.close()});
