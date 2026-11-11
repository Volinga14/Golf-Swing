(() => {
const root=document.documentElement,landing=document.getElementById('landingView'),app=document.getElementById('appView');
const screenIds={home:'screenHome',upload:'screenUpload',review:'screenReview',results:'screenResults',history:'screenHistory',compare:'screenCompare',profile:'screenProfile',train:'screenTrain'};
const screens=Object.fromEntries(Object.entries(screenIds).map(([k,id])=>[k,document.getElementById(id)]));
const video=document.getElementById('swingVideo'),videoInput=document.getElementById('videoInput'),cameraInput=document.getElementById('cameraInput'),timeline=document.getElementById('timeline'),phaseList=document.getElementById('phaseList'),capturesGrid=document.getElementById('capturesGrid'),historyList=document.getElementById('historyList'),compareList=document.getElementById('compareList'),latestCarousel=document.getElementById('latestCarousel'),reviewTitleInput=document.getElementById('reviewTitleInput'),compareOutput=document.getElementById('compareOutput'),compareCount=document.getElementById('compareCount'),profileSwingCount=document.getElementById('profileSwingCount'),profileSavedCount=document.getElementById('profileSavedCount'),profilePhaseCount=document.getElementById('profilePhaseCount'),engineStatusDot=document.getElementById('engineStatusDot'),engineStatusText=document.getElementById('engineStatusText'),analysisProgress=document.getElementById('analysisProgress'),analysisProgressText=document.getElementById('analysisProgressText'),reviewPlayButton=document.querySelector('[data-action="play-toggle"]');
const modal=document.getElementById('mockupModal'),modalTitle=document.getElementById('modalTitle'),modalText=document.getElementById('modalText');
function uiIcon(name){return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#${name}"/></svg>`}
function emptyState(title,text,action='New analysis',destination='upload',symbol='swings'){return `<section class="empty-state">${uiIcon(symbol)}<h3>${title}</h3><p>${text}</p>${action?`<button type="button" class="primary-solid" data-nav="${destination}">${action} ${uiIcon('chevron')}</button>`:''}</section>`}
let toastTimer,dialogReturn;
function hideToast(){clearTimeout(toastTimer);const toast=document.getElementById('appToast');if(toast)toast.hidden=true}
function showToast(message){const toast=document.getElementById('appToast');if(!toast)return;clearTimeout(toastTimer);toast.textContent=message;toast.hidden=false;toastTimer=setTimeout(()=>{toast.hidden=true},3500)}
function updateSessionStatus(){
 const dirty=state.current&&hasUnsavedChanges(),status=document.getElementById('sessionStatus');
 if(status)status.textContent=state.storageBusy?'Saving…':state.current?(dirty?'Unsaved changes':'Saved on device'):'New session';
 document.querySelectorAll('[data-action="save-session"]').forEach(b=>{b.disabled=!state.current||state.storageBusy||state.engineBusy;b.setAttribute('aria-busy',String(state.storageBusy))});
 const playable=!!state.videoFile&&video.readyState>=2;const clear=document.querySelector('[data-action="clear-phases"]');if(clear)clear.disabled=!phaseCount(state.current);const mark=document.getElementById('markModeBtn');if(mark)mark.disabled=!playable;
 document.querySelectorAll('#screenReview [data-action="play-toggle"],#screenReview [data-action="back-frame"],#screenReview [data-action="forward-frame"],#screenReview [data-fs-action="open"]').forEach(b=>b.disabled=!playable);
 timeline.disabled=!playable;
 document.querySelectorAll('[data-action="capture-phases"]').forEach(b=>{b.disabled=!playable||!phaseCount(state.current)||!!captureJob;b.setAttribute('aria-busy',String(!!captureJob))});
 const help=document.getElementById('phaseHelp');if(help)help.textContent=state.markMode?'Marking mode is on. Tap a phase to set it at this frame.':'Pause at a key moment, then tap an unmarked phase. Tap a marked phase to jump back to it.';
 const title=document.getElementById('reportTitle'),summary=document.getElementById('reportSummary'),meta=document.getElementById('reportMeta');
 if(title)title.textContent=state.current?.title||'Tu informe de swing';
 if(summary)summary.textContent=state.current?.agentReview?'Tus puntos clave, ejercicios y próximos pasos.':state.current?'Tus momentos clave y notas, guardados en este dispositivo.':'Empieza un análisis para crear tu primer informe.';
 updateLearningUI();segmentPicker.sync();
 window.SwingLabAgent?.renderReport?.();
 if(meta&&state.current?.agentReview){const r=state.current.agentReview;meta.innerHTML=`<span class="meta-chip">${r.priorities.length} prioridades</span><span class="meta-chip">${r.practice_plan?.length||0} sesiones de práctica</span><span class="meta-chip">Análisis técnico</span>`;}else if(meta)meta.innerHTML=state.current?`<span class="meta-chip">${phaseCount(state.current)}/5 phases</span><span class="meta-chip">${Object.keys(state.current.captures||{}).length} captures</span><span class="meta-chip">${state.current.analyses?.length?'Local marking + review':'Manual review'}</span>`:'';
}
const installButtons=()=>document.querySelectorAll('[data-action="install-app"]');
const phases=['Address','Takeaway','Top','Impact','Finish'];
const store=SwingLabStorage.createStore(), clone=SwingLabStorage.clone;
let state={current:null,videoUrl:null,videoFile:null,history:[],markMode:false,compareSelected:[],comparePhase:'',compareLayer:'overlay',compareAdjust:{},engineOnline:!!window.SwingLabLocal,engineBusy:false,reviewStep:'manual',engineGuide:false,installPrompt:null,storageReady:false,storageBusy:false};
let mediaRevision=0, phaseRevision=0, engineJob=null, captureJob=null, draftBaseline=null;
const segmentPicker=SwingLabSegment.mount({video,getSession:()=>state.current,isBusy:()=>state.engineBusy||state.storageBusy,changed:()=>updateSessionStatus()});
let referenceCatalog=[],guidedPending=false;
const ready=store.init().then(async({history,warning})=>{state.history=history;state.storageReady=true;renderAll();if(warning)modalMsg('History recovered.',warning);try{referenceCatalog=await store.references?.()||[];updateReferenceUI()}catch{showToast('The reference library could not be read. Your sessions are available.')}}).catch(()=>modalMsg('Storage unavailable.','Your browser could not open local storage. Sessions cannot be saved. Existing data has not been removed.'));
const notesInput=document.getElementById('sessionNotes');
notesInput.addEventListener('input',()=>{if(state.current)state.current.notes=notesInput.value;updateSessionStatus()});
function setVh(){root.style.setProperty('--vh',`${window.innerHeight*.01}px`)}setVh();addEventListener('resize',setVh);
function showApp(){if(landing)landing.classList.remove('is-active');if(app)app.classList.add('is-active');if(landing)landing.inert=true;try{localStorage.setItem('swinglab_started_v1','1')}catch{}go('home')}
function go(s){if(!screens[s])return;if(s!=='review'&&!document.getElementById('fullscreenEditor')?.hidden)window.SwingLabEditor?.close?.();window.SwingLabPracticeUI?.stop?.();hideToast();if(s!=='review')video.pause();Object.entries(screens).forEach(([k,el])=>{el.classList.toggle('is-current',k===s);el.inert=k!==s;el.setAttribute('aria-hidden',String(k!==s))});document.querySelectorAll('.nav-item').forEach(b=>{const active=b.dataset.nav===s||(s==='train'&&b.dataset.nav==='profile')||(['review','results'].includes(s)&&b.dataset.nav==='upload');b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});screens[s].scrollTop=0;const sc=screens[s].querySelector('.screen-scroll');if(sc)sc.scrollTop=0;renderAll();if(s==='review'&&state.videoFile&&video.readyState>=2)window.SwingLabEditor?.open?.()}
function modalMsg(t,txt=''){modalTitle.textContent=t;modalText.textContent=txt;if(t==='Session saved.'){showToast('Session saved on this device');updateSessionStatus();return}dialogReturn=document.activeElement;modal.hidden=false;app.inert=true;if(landing)landing.inert=true;modal.querySelector('.modal-back')?.focus()}
function closeModal(){modal.hidden=true;app.inert=false;if(landing)landing.inert=!landing.classList.contains('is-active');dialogReturn?.focus?.()}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.action)handle(b.dataset.action);if(b.dataset.nav)go(b.dataset.nav);if(b.dataset.openSession)openSession(b.dataset.openSession);if(b.dataset.deleteId)deleteSession(b.dataset.deleteId);if(b.dataset.compareId)toggleCompare(b.dataset.compareId);if(b.dataset.comparePhase)renderCompareViewer(b.dataset.comparePhase);if(b.dataset.modalTitle)modalMsg(b.dataset.modalTitle);if(b.hasAttribute('data-close'))closeModal()});
function handle(a){if(a==='open-segment'){window.SwingLabEditor?.close?.();const picker=document.getElementById('swingSegmentPicker');picker.open=true;picker.scrollIntoView({block:'start'});document.getElementById('segmentStartSlider').focus()}if(a==='help')modalMsg('Tu primera revisión','1. Elige un clip corto con un único swing y el cuerpo y palo completos.\n\n2. Pulsa Analizar. Puedes usar el marcado local o la revisión con ChatGPT en Android.\n\n3. Guarda tu informe y trabaja una prioridad en Entrenar.\n\nEn Mi progreso podrás consultar tus revisiones y registrar la práctica.');if(a==='account-info')modalMsg('Tu cuenta y tus datos','Tus vídeos, informes y prácticas se guardan en este dispositivo. El marcado local funciona sin cuenta. En Android, ChatGPT es opcional: puedes conectar tu cuenta desde el análisis y revisar las imágenes que se enviarán. No hay sincronización entre dispositivos.');if(a==='cancel-profile'){nameInput.value=profile.name;document.getElementById('profileEditForm').hidden=true}if(a==='copy-feedback')copyFeedback();if(a==='edit-profile'){const form=document.getElementById('profileEditForm');form.hidden=!form.hidden;if(!form.hidden)nameInput.value=profile.name;if(!form.hidden)document.getElementById('profileNameInput').focus()}if(a==='focus-settings'){const settings=document.getElementById('profileSettings');settings.open=true;settings.scrollIntoView({block:'nearest',behavior:'smooth'});settings.querySelector('summary').focus()}if(a==='go-home')showApp();if(a==='install-app')installApp();if(a==='pick-video')videoInput.click();if(a==='record-video')cameraInput.click();if(a==='play-toggle')togglePlay();if(a==='back-frame')stepFrame(-1);if(a==='forward-frame')stepFrame(1);if(a==='capture-phases')capturePhases();if(a==='toggle-mark-mode'){state.markMode=!state.markMode;renderPhases()}if(a==='clear-phases'&&state.current&&(!phaseCount(state.current)||confirm('Clear all phase marks and their captures? Your video, notes and drawings will stay.'))){if(state.storageBusy)return;for(const phase of phases)if(state.current.phases[phase]!=null)SwingLabLearning.record(state.current,phase,state.current.phases[phase],null,profile.name);phaseRevision++;state.current.phases={};state.current.impactReference=null;state.current.captures={};state.markMode=false;renderPhases();renderCaptures();updateSessionStatus()}if(a==='save-session')saveSession();if(a==='open-latest')openLatest();if(a==='clear-history')clearHistory();if(a==='open-compare-viewer')openCompareViewer();if(a==='close-compare-viewer')closeCompareViewer();if(a==='load-engine')loadEngine();if(a==='analyze-local')analyzeWithEngine(state.videoFile);if(a==='cancel-analysis')cancelAnalysis();if(a==='mark-impact-reference')markImpactReference();if(a==='jump-impact-reference')jumpImpactReference();if(a==='clear-impact-reference')clearImpactReference();if(a==='confirm-phase-review')confirmPhaseReview();if(a==='confirm-no-swing')confirmNoSwing();if(a==='export-learning')exportLearning(false);if(a==='export-current-learning')exportLearning(true)}
videoInput.addEventListener('change',e=>loadVideoFile(e.target.files?.[0]));cameraInput.addEventListener('change',e=>loadVideoFile(e.target.files?.[0]));
if(reviewTitleInput){reviewTitleInput.addEventListener('input',()=>{if(!state.current)return;state.current.title=reviewTitleInput.value.trim()||'Swing session';renderHome();updateSessionStatus()});reviewTitleInput.addEventListener('blur',()=>{if(state.current)reviewTitleInput.value=state.current.title||'Swing session'})}
async function loadVideoFile(file){
  if(!file)return;
  await ready;
  videoInput.value='';cameraInput.value='';
  if(state.storageBusy)return modalMsg('Save in progress.','Wait for the current save to finish.');
  if(!file.size||(!file.type.startsWith('video/')&&!/\.(mp4|mov|webm|m4v)$/i.test(file.name)))return modalMsg('Choose a video.','This file is empty or is not a supported video.');
  if(!canLeaveSession())return;
  releaseMedia();
  state.current={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:file.name.replace(/\.[^.]+$/,''),fileName:file.name,club:profile.club,date:new Date().toISOString(),phases:{},captures:{},notes:'',drawings:[],duration:null,videoSha256:null,view:profile.view,feedbackEnabled:true,analyses:[],corrections:[],review:{status:'draft'}};
  attachMedia(file);state.markMode=false;hydrateSession();go('review');
  const sourceSession=state.current,sourceRevision=mediaRevision;
  SwingLabLocal.prepare(file).then(info=>{if(state.current!==sourceSession||mediaRevision!==sourceRevision)return;Object.assign(sourceSession,{duration:info.duration,videoSha256:info.sha256,timing:info.timing});updateSessionStatus()}).catch(()=>{});
  videoInput.value='';cameraInput.value='';
}
video.addEventListener('loadedmetadata',()=>{if(state.current&&Number.isFinite(video.duration))state.current.duration=video.duration;timeline.value=0;updateTime()});
video.addEventListener('loadeddata',()=>{captureVideoPreview();updateSessionStatus();if(guidedPending){guidedPending=false;window.SwingLabEditor?.open?.()}});
video.addEventListener('error',()=>{if(state.videoFile)modalMsg('Video cannot be played.','Try an MP4 or WebM video supported by your browser. Your saved sessions are unchanged.')});
video.addEventListener('timeupdate',updateTime);video.addEventListener('play',updateReviewPlayButton);video.addEventListener('pause',updateReviewPlayButton);timeline.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=(+timeline.value/1000)*video.duration});
function updateReviewPlayButton(){if(reviewPlayButton){reviewPlayButton.textContent=video.paused?'Play':'Pause';reviewPlayButton.classList.toggle('is-playing',!video.paused)}}
function togglePlay(){if(!state.videoFile)return modalMsg('No video loaded.','Upload or record a video first.');if(video.paused)video.play().catch(()=>modalMsg('Playback unavailable.','Try another video supported by your browser.'));else video.pause();updateReviewPlayButton()}
function stepFrame(d){if(!video.src)return;video.pause();video.currentTime=Math.max(0,Math.min(video.duration||0,SwingLabVideo.step(state.current?.timing,video.currentTime,d,video.duration||0)))}
function updateTime(){if(!video.duration)return;timeline.value=Math.round((video.currentTime/video.duration)*1000);document.getElementById('currentTimeLabel').textContent=`${video.currentTime.toFixed(2)}s`;document.getElementById('durationLabel').textContent=`${video.duration.toFixed(2)}s`;updateReviewPlayButton()}
const previewRequests=new Map(),previewAttempted=new Set();
function captureVideoPreview(){if(state.current&&state.videoFile&&video.readyState>=2)requestPreview(state.current,state.videoFile)}
function requestPreview(session,file){
 if(!session?.id||file&&(video.readyState<2||!video.videoWidth))return;
 const key=session.id;
 if(previewRequests.has(key)||previewAttempted.has(key))return;
 const ownFile=file,sha=session.videoSha256;
 const task=(async()=>{
  previewAttempted.add(key);const original=ownFile||await store.video(session.id);if(!original)return;
  const preferred=session.phases?.Impact??session.phases?.Top??session.duration*.5;
  const thumb=await SwingLabVideo.thumbnail(original,{time:preferred});if(!thumb)return;
  const current=state.current?.id===session.id?state.current:null;
  if(current&&(!ownFile||state.videoFile===ownFile)){current.thumb=thumb;if(draftBaseline){const baseline=JSON.parse(draftBaseline);baseline.thumb=thumb;draftBaseline=JSON.stringify(baseline)}}
  state.history=state.history.map(s=>s.id===session.id?{...s,thumb}:s);
  if(state.history.some(s=>s.id===session.id))await store.updateThumbnail?.(session.id,thumb,sha);
  renderHome();renderHistory();
 })().catch(()=>{}).finally(()=>{previewRequests.delete(key);renderHome()});
 previewRequests.set(key,task);
}

function frameLabel(t,session=state.current){const index=SwingLabVideo.frameIndex(session?.timing,t);return index==null?`${(t||0).toFixed(3)}s`:`F${index}`}
window.SwingLabSourceTiming=()=>state.current?.timing||null;
function renderPhases(){const markBtn=document.getElementById('markModeBtn');if(markBtn){markBtn.classList.toggle('is-active',state.markMode);markBtn.textContent=state.markMode?'Done':'Mark';markBtn.setAttribute('aria-pressed',String(state.markMode))}if(!state.current){phaseList.innerHTML='<p class="empty-text">Upload a video to mark phases.</p>';return}phaseList.innerHTML=phases.map(p=>{const t=state.current.phases[p];return`<button class="phase-btn ${t!=null?'is-marked':''} ${state.markMode?'is-mark-mode':''}" data-phase="${p}"><strong>${p}</strong><span>${t!=null?frameLabel(t):(state.markMode?'Set':'--')}</span></button>`}).join('');phaseList.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>{if(!state.videoFile)return modalMsg('Original video unavailable.','This older session contains captures and notes only.');const p=b.dataset.phase,t=state.current.phases[p];if(state.markMode){setPhase(p,video.currentTime||0);updateSessionStatus();return}if(t!=null){video.pause();video.currentTime=Math.max(0,Math.min(video.duration||t,t));updateTime();return}setPhase(p,video.currentTime||0);updateSessionStatus()})}
function seekVideo(t,signal){return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new DOMException('Cancelled','AbortError'));
  const target=Math.min(Math.max(0,t),video.duration);
  if(!video.seeking&&video.readyState>=2&&Math.abs(video.currentTime-target)<.001)return resolve();
  const finish=error=>{clearTimeout(timer);video.removeEventListener('seeked',done);video.removeEventListener('error',failed);signal.removeEventListener('abort',aborted);error?reject(error):resolve()};
  const done=()=>finish(),failed=()=>finish(new Error('Video could not be decoded.')),aborted=()=>finish(new DOMException('Cancelled','AbortError'));
  const timer=setTimeout(()=>finish(new Error('Video seek timed out.')),5000);
  video.addEventListener('seeked',done,{once:true});video.addEventListener('error',failed,{once:true});signal.addEventListener('abort',aborted,{once:true});
  try{video.currentTime=target}catch(error){finish(error)}
})}
async function capturePhases(navigate=true){
  if(!state.current||!state.videoFile||video.readyState<2||!Number.isFinite(video.duration))return modalMsg('No video ready.','Load a playable video first.');
  if(captureJob)return;
  const marked=Object.entries(state.current.phases);if(!marked.length)return modalMsg('No phases marked.','Tap Mark, then choose phases at the current frame.');
  const session=state.current,revision=mediaRevision,marks=phaseRevision,old=video.currentTime,controller=new AbortController();captureJob=controller;
  const canvas=document.createElement('canvas'),scale=Math.min(1,1280/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const captures={},ctx=canvas.getContext('2d');video.pause();updateSessionStatus();
  const isCurrent=()=>state.current===session&&mediaRevision===revision&&phaseRevision===marks&&!controller.signal.aborted;
  try{
    for(const[p,t]of marked){await seekVideo(t,controller.signal);if(!isCurrent())return;ctx.drawImage(video,0,0,canvas.width,canvas.height);captures[p]=canvas.toDataURL('image/jpeg',.82)}
    await seekVideo(old,controller.signal);if(!isCurrent())return;session.captures=captures;renderCaptures();if(navigate)go('results');return true;
  }catch(error){if(isCurrent())modalMsg('Captures could not be created.','Wait for the video to load and try again. Existing captures have been kept.')}
  finally{if(captureJob===controller)captureJob=null;updateSessionStatus()}
}
function renderCaptures(){if(!state.current){capturesGrid.innerHTML=emptyState('No review yet','Choose a video to start reviewing your swing.');return}const entries=Object.entries(state.current.captures||{});capturesGrid.innerHTML=entries.length?entries.map(([phase,img])=>`<article class="capture-card"><img src="${img}" alt="${phase} phase capture"><strong>${phase}</strong><button type="button" class="tiny-btn" data-open-capture="${phase}">Analyze image</button></article>`).join(''):emptyState('Add your key moments','Mark a phase in the review, then create captures to include its image here.','Back to review','review')}
document.addEventListener('click',e=>{const b=e.target.closest('[data-open-capture]');if(b)window.SwingLabEditor?.openCapture?.(b.dataset.openCapture)});
async function saveSession(){
  await ready;if(!state.current){modalMsg('No session to save.','Upload a video first.');return false}
  if(!state.storageReady)return storageFailure();if(state.storageBusy||state.engineBusy||captureJob)return false;
  if(state.videoFile&&Object.keys(state.current.phases).some(p=>!state.current.captures?.[p])&&!(await capturePhases(false)))return false;
  state.current.title=reviewTitleInput.value.trim()||'Swing session';state.current.notes=notesInput.value;state.current.drawings=window.SwingLabEditor?.getDrawings()||state.current.drawings||[];
  const summary=SwingLabStorage.normalize(state.current),file=state.videoFile;let savedSuccessfully=false;state.storageBusy=true;updateSessionStatus();
  try{
    if(file){let metadata;try{metadata=await SwingLabLocal.prepare(file)}catch{}if(metadata){if(summary.videoSha256&&summary.videoSha256!==metadata.sha256)throw Error('Saved video identity mismatch');Object.assign(summary,{duration:metadata.duration,videoSha256:metadata.sha256,timing:metadata.timing})}}
    const feedback=file?await SwingLabLearning.collect(file,summary,message=>setAnalysisProgress(true,message)):[];
    const saved=SwingLabStorage.normalize(summary);await store.save(saved,file,feedback);savedSuccessfully=true;state.history=[clone(saved),...state.history.filter(s=>s.id!==saved.id)];
    if(state.current?.id===saved.id){for(const key of ['analysisRange','duration','videoSha256','timing','analyses','corrections','review','feedbackEnabled','view','referenceReview','referenceHistory'])if(key in saved)state.current[key]=clone(saved[key]);draftBaseline=JSON.stringify(saved)}
    modalMsg('Session saved.',file?'Your video, review and correction context were saved on this device.':'Your captures and notes were saved. The original video is unavailable for this older session.');renderAll();return true;
  }catch{storageFailure();return false}finally{state.storageBusy=false;setAnalysisProgress(true,savedSuccessfully?'Review and correction context saved on this device.':'Save failed. The previous saved review is unchanged.');updateSessionStatus()}
}
function storageFailure(){modalMsg('Changes were not saved.','Local storage may be full or unavailable. Your previous saved sessions have been kept. Free some device space and try again.');return false}
function hydrateSession(){
  notesInput.value=state.current?.notes||'';
  reviewTitleInput.value=state.current?.title||'Review swing';
  document.dispatchEvent(new CustomEvent('swinglab:session-changed',{detail:{drawings:clone(state.current?.drawings||[])}}));
  draftBaseline=state.history.some(s=>s.id===state.current?.id)?JSON.stringify(SwingLabStorage.normalize(state.current)):null;
}
function hasUnsavedChanges(){if(!state.current)return false;const draft={...state.current,notes:notesInput.value,drawings:window.SwingLabEditor?.getDrawings()||state.current.drawings};return JSON.stringify(SwingLabStorage.normalize(draft))!==draftBaseline}
function canLeaveSession(){return !hasUnsavedChanges()||confirm('This session has unsaved changes. Discard them and continue?')}
window.addEventListener('beforeunload',event=>{if(hasUnsavedChanges()){event.preventDefault();event.returnValue=''}});
function cancelAnalysis(){if(engineJob){engineJob.controller.abort();engineJob=null}state.engineBusy=false;setEngineStatus(state.engineOnline?'online':'offline');setAnalysisProgress(false)}
function releaseMedia(){
  guidedPending=false;window.SwingLabEditor?.release?.();
  mediaRevision++;phaseRevision++;cancelAnalysis();captureJob?.abort();captureJob=null;
  video.pause();video.removeAttribute('src');video.load();
  const fullscreen=document.getElementById('fullscreenVideo');fullscreen.pause();fullscreen.removeAttribute('src');fullscreen.load();document.getElementById('fullscreenEditor').hidden=true;
  if(state.videoUrl)URL.revokeObjectURL(state.videoUrl);
  state.videoUrl=null;state.videoFile=null;
  document.getElementById('videoEmpty').style.display='';document.getElementById('videoEmpty').textContent='No video loaded';timeline.value=0;
  document.getElementById('currentTimeLabel').textContent='0.00s';document.getElementById('durationLabel').textContent='0.00s';
}
function attachMedia(file){state.reviewStep='manual';state.engineGuide=false;guidedPending=true;state.videoFile=file;state.videoUrl=URL.createObjectURL(file);video.src=state.videoUrl;document.getElementById('videoEmpty').style.display='none';document.getElementById('useAnalysisRange').checked=false;document.getElementById('analysisRangeStart').value='0';document.getElementById('analysisRangeEnd').value='';segmentPicker.restore()}
function setPhase(phase,time){
  if(!state.current||!state.videoFile||state.storageBusy||!phases.includes(phase)||!Number.isFinite(time))return;
  const limit=Number.isFinite(video.duration)?video.duration:time;state.current.duration=limit;
  let target=Math.max(0,Math.min(limit,time));const index=SwingLabVideo.frameIndex(state.current.timing,target);if(index!=null)target=state.current.timing.times[index];
  if(phase==='Impact'&&target>0&&target<limit)state.current.impactReference={time:target,source:'user-impact',updatedAt:new Date().toISOString(),videoSha256:state.current.videoSha256||null};
  if(state.current.phases[phase]===target){if(phase==='Impact')phaseRevision++;updateSessionStatus();return}
  SwingLabLearning.record(state.current,phase,state.current.phases[phase],target,profile.name);
  phaseRevision++;state.current.phases[phase]=target;delete state.current.captures[phase];if(state.current.captureDrawings)delete state.current.captureDrawings[phase];renderPhases();renderCaptures();updateSessionStatus();
}
function markImpactReference(time=video.currentTime){
  if(!state.current||!state.videoFile||state.engineBusy||state.storageBusy||video.readyState<2)return;
  video.pause();const t=time;
  if(!Number.isFinite(t)||t<=0||t>=video.duration)return showToast('Choose an impact frame inside the video');
  setPhase('Impact',t);state.reviewStep='analyze';window.SwingLabEditor?.refresh?.();
  showToast('Impact marked. Tap Analyze to recalculate the other phases');
}
function jumpImpactReference(){
  const t=state.current?.impactReference?.time;
  if(Number.isFinite(t)&&state.videoFile){video.pause();video.currentTime=t;updateTime()}
}
function clearImpactReference(){
  if(!state.current||state.engineBusy||state.storageBusy)return;
  state.current.impactReference=null;phaseRevision++;updateSessionStatus();
  showToast('Reference cleared. Existing phase marks were kept');
}
function setEngineStatus(status,detail=''){if(status!=='busy')state.engineOnline=status==='online';if(engineStatusDot)engineStatusDot.className=`engine-dot is-${status}`;if(engineStatusText)engineStatusText.textContent=detail||({online:'Ready on device',checking:'Preparing…',offline:'Unavailable',busy:'Marking locally'}[status]||'Offline')}
function setAnalysisProgress(on,text=''){if(!analysisProgress)return;analysisProgress.hidden=!on;analysisProgress.classList.toggle('is-result',!state.engineBusy&&!state.storageBusy);const heading=analysisProgress.querySelector('strong');if(heading)heading.textContent=state.storageBusy?'Saving review context':state.engineBusy?'Analyzing swing':'Analysis status';if(analysisProgressText)analysisProgressText.textContent=text||'Analyzing swing...';window.SwingLabEditor?.refresh?.()}
function isStandalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function updateInstallButtons(){installButtons().forEach(b=>{b.hidden=isStandalone();b.innerHTML=uiIcon('download')+'<span>Install app</span>'})}
async function installApp(){if(isStandalone())return modalMsg('Swing Lab is installed.','Open it from your home screen whenever you want to analyze a swing.');if(state.installPrompt){const promptEvent=state.installPrompt;state.installPrompt=null;promptEvent.prompt();const choice=await promptEvent.userChoice.catch(()=>({outcome:'dismissed'}));updateInstallButtons();return modalMsg(choice.outcome==='accepted'?'Installing Swing Lab.':'Install was cancelled.',choice.outcome==='accepted'?'The app will appear on your home screen once the browser finishes installing it.':'You can try again from the Install button.')}const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);modalMsg('Install Swing Lab.',isiOS?'In Safari, tap Share and choose Add to Home Screen.':'Open the browser menu and choose Install app or Add to Home screen. If it does not appear yet, refresh this page once.')}
function setupPwa(){updateInstallButtons();window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;updateInstallButtons()});window.addEventListener('appinstalled',()=>{state.installPrompt=null;updateInstallButtons();modalMsg('Swing Lab installed.','You can now launch it from your home screen.')});if(!window.SwingLabNative&&'serviceWorker'in navigator&&location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(registration=>registration.update().catch(()=>{})).catch(()=>{})}}
async function loadEngine(){
  if(window.SwingLabNative){setEngineStatus('online','Bundled with Android app');return;}

  if(!('serviceWorker'in navigator))return modalMsg('Offline preparation unavailable.','Use HTTPS or localhost in a supported browser.');
  try{const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});let worker=registration.installing||registration.waiting;
    if(worker&&worker.state!=='activated')await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preparation is taking longer. Reopen the app and try again.')),60000);const inspect=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve()}if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Could not save the offline resources.'))}};worker.addEventListener('statechange',inspect);inspect()});
    showToast('App and local marker prepared for offline use');
  }catch(error){modalMsg('Offline resources unavailable.',error.message)}
}
async function analyzeWithEngine(file){
  if(!file||file!==state.videoFile||!state.current||!state.engineOnline||state.engineBusy||state.storageBusy||video.readyState<2)return;
  const range=document.getElementById('useAnalysisRange').checked?{start:Number(document.getElementById('analysisRangeStart').value),end:document.getElementById('analysisRangeEnd').value===''?video.duration:Number(document.getElementById('analysisRangeEnd').value)}:undefined;
  if(range)try{SwingLabMotion.range(range,video.duration)}catch(error){return modalMsg('Check the swing segment.',error.message)}
  const previousRun=state.current.analyses?.at(-1),replaceable=phases.filter(p=>SwingLabLearning.canReplaceProposal(state.current,previousRun,p));
  const job={controller:new AbortController(),session:state.current,revision:mediaRevision,marks:phaseRevision};engineJob=job;state.engineBusy=true;
  const timer=setTimeout(()=>job.controller.abort(),240000),isCurrent=()=>engineJob===job&&state.current===job.session&&mediaRevision===job.revision;
  setEngineStatus('busy','Marking locally');setAnalysisProgress(true,'Reading this video on your device…');updateSessionStatus();
  try{
    const result=await SwingLabLocal.analyze(file,{signal:job.controller.signal,range,impactAnchor:job.session.impactReference?.time,view:job.session.view||profile.view,onProgress:message=>{if(isCurrent())setAnalysisProgress(true,message)}});
    if(!isCurrent()||job.controller.signal.aborted)return;
    const estimated=Object.fromEntries(phases.filter(p=>Number.isFinite(result.phases?.[p.toLowerCase()])).map(p=>[p,result.phases[p.toLowerCase()]]));
    Object.assign(job.session,{duration:result.duration,videoSha256:result.videoSha256,timing:result.timing});if(job.session.impactReference)job.session.impactReference.videoSha256=result.videoSha256;
    const run={runId:crypto.randomUUID(),modelId:result.id,protocol:SwingLabLearning.PROTOCOL,checkpointSha256:result.checkpointSha256,modelFiles:result.modelFiles,videoSha256:result.videoSha256,createdAt:result.createdAt,status:result.status,view:job.session.view||'DTL',phases:clone(estimated),window:result.window,sampleTimes:result.sampleTimes||[],preprocessing:result.preprocessing,impactEvidence:result.impactEvidence,audioCandidates:result.audioCandidates,initialPhases:Object.fromEntries(phases.filter(p=>Number.isFinite(result.initialPhases?.[p.toLowerCase()])).map(p=>[p,result.initialPhases[p.toLowerCase()]])),note:result.note};
    job.session.analyses=job.session.analyses||[];job.session.analyses.push(run);if(result.status==='needs-review'){state.reviewStep='review';state.engineGuide=false;}
    if(result.status!=='needs-review'){if(phaseRevision===job.marks&&replaceable.length){for(const p of replaceable){delete job.session.phases[p];delete job.session.captures[p]}phaseRevision++;renderPhases();renderCaptures()}setAnalysisProgress(true,result.status==='rejected'?'No usable swing information was found. You can mark phases manually.':result.note);return}
    if(phaseRevision!==job.marks){setAnalysisProgress(true,'Local analysis finished. Your manual phase changes were kept; the proposals are available below.');return}
    // Replace untouched automatic marks; retain edited and confirmed references.
    for(const [p,t]of Object.entries(estimated))if(replaceable.includes(p)){job.session.phases[p]=t;delete job.session.captures[p]}
    if(replaceable.length){job.session.review={status:'draft'};phaseRevision++}renderPhases();renderCaptures();setAnalysisProgress(true,replaceable.length?'Local marking complete. Review the proposals and the selected segment below.': 'Local analysis finished. Your reviewed marks were kept; the new proposals are available below.');
  }catch(error){if(isCurrent())setAnalysisProgress(true,error.name==='AbortError'?'Local analysis cancelled or timed out. Manual marking is available.':`Local marking unavailable: ${error.message} Manual marking is available.`)}
  finally{clearTimeout(timer);if(isCurrent()){engineJob=null;state.engineBusy=false;setEngineStatus('online');setAnalysisProgress(!analysisProgress.hidden,analysisProgressText.textContent);updateSessionStatus()}}
}
function updateLearningUI(){
  updateReferenceUI();window.SwingLabEditor?.refresh?.();
  const session=state.current,run=session?.analyses?.at(-1),busy=state.engineBusy||state.storageBusy;
  const analyze=document.getElementById('analyzeLocal');if(analyze){analyze.disabled=!state.videoFile||video.readyState<2||busy||!state.engineOnline;analyze.textContent=Number.isFinite(session?.impactReference?.time)?'Analyze from my impact':run?'Run local marking again':'Analyze on this device'}
  const reference=session?.impactReference,hasReference=Number.isFinite(reference?.time),playable=!!state.videoFile&&video.readyState>=2;
  const impactButton=document.getElementById('markImpactReference');if(impactButton){impactButton.disabled=!playable||busy;impactButton.textContent=hasReference?'Update impact here':'Mark impact here'}
  for(const id of ['jumpImpactReference','clearImpactReference']){const b=document.getElementById(id);if(b){b.hidden=!hasReference;b.disabled=!playable||busy}}
  const impactAnalyze=document.getElementById('analyzeFromImpact');if(impactAnalyze){impactAnalyze.hidden=!hasReference;impactAnalyze.disabled=!playable||busy||!state.engineOnline}
  const impactStatus=document.getElementById('impactReferenceStatus');if(impactStatus){
    impactStatus.textContent=hasReference?'Your impact: '+reference.time.toFixed(3)+(run?.impactEvidence?.source==='user-impact'&&run.impactEvidence.anchor===reference.time?' s. Used for the latest analysis. Review the other four phases.':' s. Analyze to recalculate the other phases.'):run?.impactEvidence?.status==='needs-impact'?'Check impact: '+run.impactEvidence.note:run?.impactEvidence?.source==='audio-model-agreement'?'Audio and movement support an impact proposal. Check it in the video.':'The automatic marker runs without a manual reference.';
    impactStatus.closest('.impact-reference')?.classList.toggle('needs-impact',!hasReference&&run?.impactEvidence?.status==='needs-impact');
  }
  const cancel=document.getElementById('cancelLocal');if(cancel)cancel.hidden=!state.engineBusy;
  const choice=document.getElementById('sessionView');if(choice){choice.value=session?.view||profile.view;choice.disabled=!session||busy}
  for(const id of ['useAnalysisRange','analysisRangeStart','analysisRangeEnd'])document.getElementById(id).disabled=!state.videoFile||busy;
  for(const action of ['segment-start','segment-end']){const button=document.querySelector(`[data-action="${action}"]`);if(button)button.disabled=!state.videoFile||video.readyState<2||busy}
  const segmentNote=document.getElementById('analysisSegmentNote');if(segmentNote)segmentNote.textContent=Number.isFinite(run?.window?.start)&&Number.isFinite(run?.window?.end)?`Last analyzed segment: ${run.window.start.toFixed(2)}–${run.window.end.toFixed(2)} s. ${(run.window.warnings||[]).join(' ')}`:'';
  const checkbox=document.getElementById('keepCorrectionContext');if(checkbox){checkbox.checked=session?.feedbackEnabled!==false;checkbox.disabled=!session||busy}
  const confirmed=!!session&&SwingLabLearning.reviewMatches(session),reviewState=document.getElementById('phaseReviewState');if(reviewState)reviewState.textContent=session&&SwingLabLearning.negativeMatches(session)?'Confirmed: no swing in this video':confirmed?'Phases confirmed for model review':'Phase labels need visual confirmation';
  const confirm=document.getElementById('confirmPhaseReview');if(confirm)confirm.disabled=!session||!state.videoFile||busy;const noSwing=document.getElementById('confirmNoSwing');if(noSwing)noSwing.disabled=!session||!state.videoFile||busy;
  const summary=document.getElementById('correctionSummary');if(summary){const count=(session?.corrections||[]).filter(e=>!e.supersededBy).length;summary.textContent=`${count} active correction${count===1?'':'s'}. Original proposals are retained. Nothing is uploaded or trained automatically.`}
  const body=document.getElementById('phaseAudit');if(body)body.innerHTML=phases.map(p=>{const proposed=run?.phases?.[p],current=session?.phases?.[p],supplied=p==='Impact'&&run?.impactEvidence?.source==='user-impact',delta=!supplied&&Number.isFinite(proposed)&&Number.isFinite(current)?current-proposed:null;return `<tr><td>${p}</td><td>${Number.isFinite(proposed)?proposed.toFixed(3)+' s'+(supplied?' (your reference)':''):'—'}</td><td>${Number.isFinite(current)?current.toFixed(3)+' s':'—'}</td><td>${delta==null?'—':(delta>0?'+':'')+delta.toFixed(3)+' s'}</td></tr>`}).join('');
  const known=session?.timing?.verified;for(const [action,label]of [['back-frame',known?'−1 frame':'−20 ms'],['forward-frame',known?'+1 frame':'+20 ms']]){const button=document.querySelector(`#screenReview [data-action="${action}"]`);if(button){button.textContent=label;button.setAttribute('aria-label',known?(action==='back-frame'?'Previous source frame':'Next source frame'):(action==='back-frame'?'Back 20 milliseconds':'Forward 20 milliseconds'))}}
}
function updateReferenceUI(){
  const status=document.getElementById('referenceLibraryStatus'),detail=document.getElementById('referenceComparison');if(!status||!detail)return;
  status.textContent=`${referenceCatalog.length} reviewed videos on this device. Importing references keeps existing session marks.`;
  const session=state.current,entry=referenceCatalog.find(r=>SwingLabReferences.matches(r,session?.videoSha256,session?.duration)),applied=session?.referenceReview,shown=entry||applied;
  const busy=state.storageBusy||state.engineBusy;
  document.getElementById('matchReference').disabled=!state.videoFile||busy;
  document.getElementById('applyReference').disabled=!entry||!state.videoFile||busy;
  document.getElementById('importReferenceFile').disabled=busy;
  const local=document.getElementById('loadPrivateReferences');local.hidden=!['localhost','127.0.0.1','[::1]'].includes(location.hostname);local.disabled=busy;
  const choices=document.getElementById('referenceClipChoice'),selected=choices.value;choices.innerHTML=referenceCatalog.map(r=>`<option value="${esc(r.sha256)}">${esc(r.title)}${r.reference.status==='negative'?' · No swing':''}</option>`).join('');if(referenceCatalog.some(r=>r.sha256===selected))choices.value=selected;document.getElementById('localReferenceClips').hidden=local.hidden||!referenceCatalog.length;document.getElementById('openLocalReference').disabled=busy;choices.disabled=busy;
  if(!shown){detail.textContent=session?'Match the original video to find its reviewed phases.':'Choose a video to compare it with the reference library.';return}
  const r=shown.reference,run=session?.analyses?.at(-1),sameApplied=applied&&JSON.stringify(applied.reference)===JSON.stringify(r);
  detail.innerHTML=`<p><strong>${esc(shown.title)}</strong><br>${esc(r.reviewer)} · ${esc(r.updatedAt.slice(0,10))} · v${r.version}${sameApplied?' · Applied to this session':''}</p>${r.status==='negative'?'<p>Reviewed control: this clip does not contain a complete swing.</p>':`<div class="learning-table"><table><thead><tr><th>Phase</th><th>Reference / uncertainty</th><th>Model difference</th></tr></thead><tbody>${phases.map(p=>{const m=r.phases[p.toLowerCase()],t=m.time,proposed=run?.phases?.[p],delta=Number.isFinite(t)&&Number.isFinite(proposed)?proposed-t:null;return `<tr><td>${p}</td><td>${t==null?'Unresolved':t.toFixed(3)+' s'}${m.range?`<br>${m.range[0].toFixed(3)}–${m.range[1].toFixed(3)} s`:''}<br><small>${esc(m.reason)}</small></td><td>${delta==null?'—':(delta>0?'+':'')+delta.toFixed(3)+' s'}</td></tr>`}).join('')}</tbody></table></div>`}<p class="field-hint">Ranges remain part of the saved reference. Applying it keeps previous marks and model runs. Assisted references are excluded from point-label training exports.</p>`;
}
async function importReferencePayload(payload){
  const records=SwingLabReferences.pack(payload);referenceCatalog=await store.importReferences(records);updateReferenceUI();showToast(`${referenceCatalog.length} reviewed references available on this device`);
}
async function readReferenceFile(file){
  if(!file||state.engineBusy||state.storageBusy)return;state.storageBusy=true;updateSessionStatus();
  try{await ready;if(file.size>20*1024*1024)throw Error('Choose a reference JSON file smaller than 20 MB.');await importReferencePayload(JSON.parse(await file.text()))}catch(error){modalMsg('References not imported.',error.message)}finally{state.storageBusy=false;document.getElementById('referenceFileInput').value='';updateSessionStatus()}
}
async function loadPrivateReferences(){
  if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname)||state.storageBusy||state.engineBusy)return;
  state.storageBusy=true;updateSessionStatus();try{await ready;const response=await fetch('/__lab/manifest.json',{cache:'no-store'});if(!response.ok)throw Error('Start the local review library to load its references.');await importReferencePayload(await response.json())}catch(error){modalMsg('References not imported.',error.message)}finally{state.storageBusy=false;updateSessionStatus()}
}
async function matchReference(apply=false){
  if(!state.current||!state.videoFile||state.storageBusy||state.engineBusy)return;
  const session=state.current,file=state.videoFile;state.storageBusy=true;updateSessionStatus();
  try{const info=await SwingLabLocal.prepare(file);if(state.current!==session||state.videoFile!==file)return;Object.assign(session,{duration:info.duration,videoSha256:info.sha256,timing:info.timing});
    const entry=referenceCatalog.find(r=>SwingLabReferences.matches(r,info.sha256,info.duration));if(!entry){showToast('No reviewed reference matches this original video.');return}
    if(apply){state.current.impactReference=null;SwingLabReferences.apply(session,entry);phaseRevision++;state.markMode=false;renderPhases();renderCaptures();showToast('Reviewed phases applied. Save to keep this session.')}else showToast('Reviewed reference found. Compare it below before applying.');
  }catch(error){modalMsg('Reference unavailable.',error.message)}finally{state.storageBusy=false;updateSessionStatus()}
}
document.getElementById('referenceFileInput')?.addEventListener('change',e=>readReferenceFile(e.target.files?.[0]));
document.getElementById('importReferenceFile')?.addEventListener('click',()=>document.getElementById('referenceFileInput').click());
document.getElementById('loadPrivateReferences')?.addEventListener('click',loadPrivateReferences);
document.getElementById('matchReference')?.addEventListener('click',()=>matchReference());
document.getElementById('applyReference')?.addEventListener('click',()=>matchReference(true));
document.getElementById('openLocalReference')?.addEventListener('click',async()=>{
  if(state.storageBusy||state.engineBusy||!['localhost','127.0.0.1','[::1]'].includes(location.hostname))return;
  const entry=referenceCatalog.find(r=>r.sha256===document.getElementById('referenceClipChoice').value);if(!entry)return;
  state.storageBusy=true;updateSessionStatus();let file;
  try{const response=await fetch('/__lab/private/'+encodeURIComponent(entry.id),{cache:'no-store'});if(!response.ok)throw Error('The original video is absent from the local library.');const blob=await response.blob();if(blob.size>150*1024*1024)throw Error('Choose a local clip smaller than 150 MB.');file=new File([blob],entry.title+'.mp4',{type:blob.type||'video/mp4'});const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');if(digest!==entry.sha256)throw Error('The original video does not match its reviewed reference.')}catch(error){file=null;modalMsg('Video unavailable.',error.message)}finally{state.storageBusy=false;updateSessionStatus()}
  if(file){await loadVideoFile(file);if(state.videoFile===file)await matchReference()}
});
ready.then(()=>{if(new URLSearchParams(location.search).get('reviewLibrary')==='local'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)){showApp();go('profile');loadPrivateReferences()}});
async function confirmPhaseReview(){
  if(!state.current||!state.videoFile||state.engineBusy||state.storageBusy)return;
  const session=state.current;state.storageBusy=true;updateSessionStatus();
  try{const metadata=await SwingLabLocal.prepare(state.videoFile);if(state.current!==session)return;Object.assign(session,{duration:metadata.duration,videoSha256:metadata.sha256,timing:metadata.timing});
    let previous=-1;for(const phase of phases){const t=session.phases[phase];if(!Number.isFinite(t)||t<0||t>metadata.duration||t<=previous)throw Error('Mark all five phases in increasing time order before confirming.');previous=t}
    session.review={status:'reviewed',protocol:SwingLabLearning.PROTOCOL,videoSha256:session.videoSha256,reviewer:profile.name||'Local reviewer',confirmedAt:new Date().toISOString(),phases:clone(session.phases)};
  }catch(error){modalMsg('Review not confirmed.',error.message);return}finally{state.storageBusy=false;updateSessionStatus()}
  await saveSession();
}
async function confirmNoSwing(){
  if(!state.current||!state.videoFile||state.engineBusy||state.storageBusy)return;
  const session=state.current;state.storageBusy=true;updateSessionStatus();
  try{const metadata=await SwingLabLocal.prepare(state.videoFile);if(state.current!==session)return;Object.assign(session,{duration:metadata.duration,videoSha256:metadata.sha256,timing:metadata.timing});
    for(const phase of phases)if(session.phases[phase]!=null)SwingLabLearning.record(session,phase,session.phases[phase],null,profile.name);
    session.phases={};session.impactReference=null;session.captures={};phaseRevision++;session.review={status:'negative',protocol:SwingLabLearning.PROTOCOL,videoSha256:session.videoSha256,reviewer:profile.name||'Local reviewer',confirmedAt:new Date().toISOString(),phases:{}};renderPhases();renderCaptures();
  }catch(error){modalMsg('No-swing review not saved.',error.message);return}finally{state.storageBusy=false;updateSessionStatus()}
  await saveSession();
}
async function exportLearning(onlyCurrent){
  if(state.storageBusy||state.engineBusy)return;if(state.current&&hasUnsavedChanges()&&!(await saveSession()))return;
  const sessions=onlyCurrent?state.history.filter(s=>s.id===state.current?.id):state.history;if(!sessions.length)return modalMsg('No saved reviews.','Save a session before exporting its feedback.');
  state.storageBusy=true;updateSessionStatus();
  try{const includeVideo=!!document.getElementById(onlyCurrent?'includeCurrentVideo':'includeLearningVideos')?.checked,blob=await SwingLabLearning.exportPack(sessions,store,includeVideo),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='swinglab-learning-'+new Date().toISOString().slice(0,10)+'.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);showToast('Learning pack downloaded. Nothing was uploaded.')}catch(error){modalMsg('Export failed.',error.message)}finally{state.storageBusy=false;updateSessionStatus()}
}
document.getElementById('keepCorrectionContext')?.addEventListener('change',event=>{if(state.current&&!state.storageBusy)state.current.feedbackEnabled=event.target.checked;updateSessionStatus()});
document.getElementById('sessionView')?.addEventListener('change',event=>{if(state.current&&!state.storageBusy){cancelAnalysis();state.current.view=event.target.value;state.current.review={status:'draft'};updateSessionStatus()}});
for(const [action,input]of [['segment-start','analysisRangeStart'],['segment-end','analysisRangeEnd']])document.querySelector(`[data-action="${action}"]`)?.addEventListener('click',()=>{if(!state.videoFile||state.engineBusy||state.storageBusy||video.readyState<2)return;video.pause();document.getElementById(input).value=video.currentTime.toFixed(6);document.getElementById('useAnalysisRange').checked=true;segmentPicker.persist()});
async function clearHistory(){
  await ready;if(!state.storageReady)return storageFailure();if(state.storageBusy)return;
  if(!confirm('Delete all saved sessions and their videos from this device?'))return;
  state.storageBusy=true;
  try{await store.clear();releaseMedia();state.current=null;state.history=[];hydrateSession();renderAll();let message='Saved sessions, videos and the legacy recovery copy have been removed from this device.';try{localStorage.removeItem('swinglab_history_v19')}catch{message='Current sessions and videos were removed. The old recovery copy could not be removed from browser storage.'}modalMsg('Local history cleared.',message)}catch{storageFailure()}finally{state.storageBusy=false}
}
async function deleteSession(id){
  if(state.storageBusy)return;const session=state.history.find(x=>x.id===id);if(!session)return;
  if(!confirm(`Delete "${session.title||'Swing session'}" and its saved video?`))return;
  state.storageBusy=true;
  try{await store.remove(id);state.history=state.history.filter(x=>x.id!==id);if(state.current?.id===id){releaseMedia();state.current=null;hydrateSession()}renderAll()}catch{storageFailure()}finally{state.storageBusy=false}
}
function openLatest(){const latest=state.current||state.history[0];if(!latest){go('upload');return}openSession(latest.id)}
async function openSession(id,target){
  await ready;if(state.storageBusy)return;
  if(state.current?.id===id){go(target||(state.videoFile?'review':'results'));return}
  const session=state.history.find(s=>s.id===id);if(!session){go('upload');return}
  if(!canLeaveSession())return;
  releaseMedia();const revision=mediaRevision;state.current=clone(session);state.markMode=false;hydrateSession();go('results');
  try{
    const file=await store.video(id);if(mediaRevision!==revision||state.current?.id!==id)return;
    if(file){attachMedia(file);go(target||'review')}
    else{document.getElementById('videoEmpty').textContent='Original video unavailable for this older session';if(target==='review')go('review')}
  }catch{if(mediaRevision===revision)modalMsg('Video unavailable.','The original video could not be read. Your saved captures and notes are still available.')}
}
async function renameSession(id,title){
  const clean=(title||'').trim()||'Swing session',session=state.history.find(x=>x.id===id);if(!session||session.title===clean)return;
  if(state.storageBusy){renderHistory();return}state.storageBusy=true;
  const updated=clone(session);updated.title=clean;
  try{await store.save(updated);state.history=state.history.map(s=>s.id===id?updated:s);if(state.current?.id===id){state.current.title=clean;reviewTitleInput.value=clean;if(draftBaseline){const baseline=JSON.parse(draftBaseline);baseline.title=clean;draftBaseline=JSON.stringify(baseline)}}renderHome();renderCompare()}catch{storageFailure();renderHistory()}finally{state.storageBusy=false}
}
function renderHistory(){const query=(document.getElementById('historySearch')?.value||'').trim().toLowerCase(),filtered=state.history.filter(s=>(s.title||'Swing session').toLowerCase().includes(query));document.getElementById('historyCount').textContent=state.history.length?`${filtered.length} ${filtered.length===1?'session':'sessions'}${query?' found':' saved on this device'}`:'';historyList.innerHTML=!state.history.length?emptyState('Your swings start here','Save your first review to build your practice history. Videos, captures and notes stay together.'):!filtered.length?emptyState('No matching swings','Try a shorter name or clear the search.','','history'):filtered.map(s=>`<article class="history-item"><img class="history-thumb" src="${s.thumb||'assets/analysis-thumb.webp'}" alt=""><div><input class="history-title-input" data-title-id="${s.id}" value="${esc(s.title||'Swing session')}" aria-label="Rename ${esc(s.title||'Swing session')}"><p>${shortDate(s.date)} &middot; ${phaseCount(s)}/5 phases</p><div class="history-actions"><button type="button" class="tiny-btn" data-open-session="${s.id}">Open ${uiIcon('chevron')}</button><button type="button" class="tiny-btn" data-report="${s.id}">Report</button></div></div><button type="button" class="history-delete" data-delete-id="${s.id}" aria-label="Delete ${esc(s.title||'Swing session')}">${uiIcon('trash')}</button></article>`).join('');historyList.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>openSession(b.dataset.report,'results'));historyList.querySelectorAll('[data-title-id]').forEach(input=>input.addEventListener('change',()=>renameSession(input.dataset.titleId,input.value)))}

function toggleCompare(id){if(!id)return;const set=new Set(state.compareSelected);if(set.has(id))state.compareSelected=state.compareSelected.filter(x=>x!==id);else{if(state.compareSelected.length>=2){showToast('Deselect a swing before choosing another');return}state.compareSelected.push(id)}renderCompare()}
function renderCompare(){const history=state.history;state.compareSelected=state.compareSelected.filter(id=>history.some(s=>s.id===id)).slice(0,2);if(compareCount)compareCount.textContent=`${state.compareSelected.length}/2`;if(!history.length){compareList.innerHTML=emptyState('See your practice side by side','Save two swing reviews, then choose them here to compare phases and timing.','New analysis','upload','compare');if(compareOutput)compareOutput.innerHTML='';return}compareList.innerHTML=history.map(s=>{const selected=state.compareSelected.includes(s.id);return`<article class="history-item compare-select ${selected?'is-selected':''}"><img class="history-thumb" src="${s.thumb||'assets/analysis-thumb.webp'}"><div><h3>${esc(s.title||'Swing session')}</h3><p>${Object.keys(s.phases||{}).length}/5 phases marked</p></div><button class="tiny-btn" aria-pressed="${selected}" data-compare-id="${s.id}">${selected?'Selected':'Select'}</button></article>`}).join('');if(!compareOutput)return;const chosen=state.compareSelected.map(id=>history.find(s=>s.id===id)).filter(Boolean);if(chosen.length<2){compareOutput.innerHTML=history.length<2?emptyState('One more swing to compare','Save another review to unlock a comparison.','Add another swing','upload','plus'):`<section class="compare-empty"><strong>${chosen.length?'Choose one more swing':'Select any two swings'}</strong><span>Your comparison will appear here.</span></section>`;return}const [a,b]=chosen;compareOutput.innerHTML=`<button class="primary-solid compare-open" type="button" data-action="open-compare-viewer">${uiIcon('compare')} Open comparison</button><section class="compare-result-head"><button type="button" class="compare-preview-card" data-action="open-compare-viewer"><img src="${compareImage(a)}"><strong>${esc(a.title||'Swing A')}</strong><span>${phaseCount(a)}/5 phases</span></button><button type="button" class="compare-preview-card" data-action="open-compare-viewer"><img src="${compareImage(b)}"><strong>${esc(b.title||'Swing B')}</strong><span>${phaseCount(b)}/5 phases</span></button></section><section class="phase-compare-table"><div class="table-head"><span>Phase</span><span>${esc(a.title||'A')}</span><span>${esc(b.title||'B')}</span><span>Diff</span></div>${phases.map(p=>{const fa=a.phases?.[p],fb=b.phases?.[p],diff=fa!=null&&fb!=null?fb-fa:null;return`<div><span>${p}</span><strong>${fa==null?'--':frameLabel(fa,a)}</strong><strong>${fb==null?'--':frameLabel(fb,b)}</strong><em>${diff==null?'--':(diff>0?'+':'')+diff.toFixed(3)+' s'}</em></div>`}).join('')}</section>`}
function comparePair(){return state.compareSelected.map(id=>state.history.find(s=>s.id===id)).filter(Boolean).slice(0,2)}
function compareImage(s,phase=state.comparePhase){return phase&&s?.captures?.[phase]?s.captures[phase]:s?.thumb||Object.values(s?.captures||{})[0]||'assets/analysis-thumb.webp'}
function comparePhases(pair){const available=phases.filter(p=>pair.some(s=>s?.captures?.[p]||s?.phases?.[p]!=null));return available.length?available:phases}
function ensureCompareViewer(){let viewer=document.getElementById('compareViewer');if(viewer)return viewer;viewer=document.createElement('section');viewer.id='compareViewer';viewer.className='compare-viewer';viewer.hidden=true;document.body.appendChild(viewer);return viewer}
function openCompareViewer(){const pair=comparePair();if(pair.length<2)return modalMsg('Select two swings.','Choose two saved swings before opening the compare viewer.');state.comparePhase=state.comparePhase||comparePhases(pair)[0]||'';renderCompareViewer(state.comparePhase)}
function closeCompareViewer(){const viewer=document.getElementById('compareViewer');if(viewer)viewer.hidden=true;app.inert=false;document.querySelector('.compare-open')?.focus()}
function compareLayerState(phase,layer){state.compareAdjust.global=state.compareAdjust.global||{};state.compareAdjust.global[layer]=state.compareAdjust.global[layer]||{x:0,y:0,scale:1,opacity:layer==='base'?1:.52};return state.compareAdjust.global[layer]}
function syncCompareStage(viewer,phase){const base=compareLayerState(phase,'base'),overlay=compareLayerState(phase,'overlay'),stage=viewer.querySelector('.compare-stage');if(!stage)return;stage.style.setProperty('--base-x',`${base.x}px`);stage.style.setProperty('--base-y',`${base.y}px`);stage.style.setProperty('--base-scale',base.scale);stage.style.setProperty('--base-opacity',base.opacity);stage.style.setProperty('--overlay-x',`${overlay.x}px`);stage.style.setProperty('--overlay-y',`${overlay.y}px`);stage.style.setProperty('--overlay-scale',overlay.scale);stage.style.setProperty('--overlay-opacity',overlay.opacity);viewer.querySelectorAll('[data-compare-layer]').forEach(b=>b.classList.toggle('is-active',b.dataset.compareLayer===state.compareLayer));viewer.querySelectorAll('[data-opacity-layer]').forEach(i=>{const s=compareLayerState(phase,i.dataset.opacityLayer);i.value=Math.round(s.opacity*100)});viewer.querySelectorAll('[data-zoom-layer]').forEach(i=>{const s=compareLayerState(phase,i.dataset.zoomLayer);i.value=Math.round(s.scale*100)})}
function bindCompareViewer(viewer,phase){viewer.querySelectorAll('[data-compare-layer]').forEach(b=>b.onclick=()=>{state.compareLayer=b.dataset.compareLayer;syncCompareStage(viewer,phase)});viewer.querySelectorAll('[data-opacity-layer]').forEach(i=>i.oninput=()=>{compareLayerState(phase,i.dataset.opacityLayer).opacity=Number(i.value)/100;syncCompareStage(viewer,phase)});viewer.querySelectorAll('[data-zoom-layer]').forEach(i=>i.oninput=()=>{compareLayerState(phase,i.dataset.zoomLayer).scale=Number(i.value)/100;syncCompareStage(viewer,phase)});const reset=viewer.querySelector('[data-compare-reset]');if(reset)reset.onclick=()=>{state.compareAdjust.global={base:{x:0,y:0,scale:1,opacity:1},overlay:{x:0,y:0,scale:1,opacity:.52}};syncCompareStage(viewer,phase)};const stage=viewer.querySelector('.compare-stage');if(!stage)return;const points=new Map();let lastPinch=null;const pinch=()=>{const p=[...points.values()];if(p.length<2)return null;return {x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2,d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)}};stage.onpointerdown=e=>{points.set(e.pointerId,{x:e.clientX,y:e.clientY});lastPinch=pinch();stage.setPointerCapture?.(e.pointerId);e.preventDefault()};stage.onpointermove=e=>{if(!points.has(e.pointerId))return;const prev=points.get(e.pointerId),layer=state.compareLayer,s=compareLayerState(phase,layer);points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size>=2){const next=pinch();if(lastPinch&&next&&lastPinch.d>0){s.scale=Math.max(.7,Math.min(1.8,s.scale*(next.d/lastPinch.d)));s.x+=next.x-lastPinch.x;s.y+=next.y-lastPinch.y}lastPinch=next}else if(prev){s.x+=e.clientX-prev.x;s.y+=e.clientY-prev.y}syncCompareStage(viewer,phase);e.preventDefault()};const end=e=>{points.delete(e.pointerId);lastPinch=pinch()};stage.onpointerup=end;stage.onpointercancel=end}
function renderCompareViewer(phase=state.comparePhase){const pair=comparePair();if(pair.length<2)return;state.comparePhase=phase;const [a,b]=pair,viewer=ensureCompareViewer(),phaseOptions=comparePhases(pair),baseName=esc(a.title||'Swing A'),overlayName=esc(b.title||'Swing B');hideToast();app.inert=true;viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','Swing comparison');viewer.hidden=false;viewer.innerHTML=`<div class="compare-viewer-top"><button type="button" class="compare-close" data-action="close-compare-viewer">Done</button><div><strong>Compare overlay</strong><span>${baseName} vs ${overlayName}</span></div></div><div class="compare-stage"><img class="compare-base" src="${compareImage(a,phase)}" alt=""><img class="compare-overlay" src="${compareImage(b,phase)}" alt=""></div><div class="compare-viewer-controls"><div class="compare-phase-tabs">${phaseOptions.map(p=>`<button type="button" class="${p===phase?'is-active':''}" data-compare-phase="${p}">${p}</button>`).join('')}</div><div class="compare-layer-tabs"><button type="button" data-compare-layer="base">${baseName}</button><button type="button" data-compare-layer="overlay">${overlayName}</button><button type="button" data-compare-reset>Reset</button></div><div class="compare-control-grid"><label class="compare-control"><span>${baseName} opacity</span><input data-opacity-layer="base" type="range" min="0" max="100"></label><label class="compare-control"><span>${baseName} zoom</span><input data-zoom-layer="base" type="range" min="70" max="150"></label><label class="compare-control"><span>${overlayName} opacity</span><input data-opacity-layer="overlay" type="range" min="0" max="100"></label><label class="compare-control"><span>${overlayName} zoom</span><input data-zoom-layer="overlay" type="range" min="70" max="150"></label></div></div>`;bindCompareViewer(viewer,phase);syncCompareStage(viewer,phase);viewer.querySelector('.compare-close')?.focus()}
function phaseCount(s){return Object.keys(s?.phases||{}).length}
const PROFILE_KEY='swinglab_profile_v1';
function readProfile(){try{const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'{}');return {name:typeof p.name==='string'?p.name.slice(0,60):'',hand:p.hand==='left'?'left':'right',view:p.view==='FO'?'FO':'DTL',club:typeof p.club==='string'?p.club.slice(0,60):''}}catch{return {name:'',hand:'right',view:document.getElementById('profileView')?.value||'DTL',club:''}}}
let profile=readProfile();
function saveProfile(){try{localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));return true}catch{modalMsg('Preferences could not be saved.','Your preferences remain available in this tab. Browser storage may be unavailable.');return false}}
function profileInitials(){return profile.name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(n=>Array.from(n)[0]).join('').toUpperCase()||'SL'}
function renderProfile(){
  const saved=state.history.length,totalPhases=state.history.reduce((sum,s)=>sum+phaseCount(s),0),now=new Date();
  if(profileSwingCount)profileSwingCount.textContent=`${saved} ${saved===1?'swing':'swings'}`;
  if(profileSavedCount)profileSavedCount.textContent=saved;if(profilePhaseCount)profilePhaseCount.textContent=totalPhases;
  document.getElementById('profileMonthCount').textContent=state.history.filter(s=>{const d=new Date(s.date);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()}).length;
  document.getElementById('profileName').textContent=profile.name||'Swing Lab User';
  document.querySelectorAll('[data-profile-initials]').forEach(el=>el.textContent=profileInitials());
  document.getElementById('homeGreeting').textContent=profile.name?'Hi, '+profile.name.trim().split(/\s+/)[0]:'Hi, golfer';
}
const nameInput=document.getElementById('profileNameInput');nameInput.value=profile.name;
document.getElementById('profileEditForm').addEventListener('submit',e=>{e.preventDefault();profile.name=nameInput.value.trim();if(saveProfile()){document.getElementById('profileEditForm').hidden=true;document.querySelector('.edit-profile-link')?.focus();showToast('Profile updated')}renderProfile()});
for(const [id,key]of [['profileHand','hand'],['profileView','view'],['profileClub','club']]){const el=document.getElementById(id);el.value=profile[key];el.addEventListener('change',()=>{profile[key]=el.value;saveProfile();renderProfile()})}
function dayKey(date){return [date.getFullYear(),date.getMonth(),date.getDate()].join('-')}
function renderStreak(){
  const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());start.setDate(start.getDate()-((start.getDay()+6)%7));
  const end=new Date(start);end.setDate(end.getDate()+7);
  const sessions=state.history.filter(s=>{const d=new Date(s.date);return d>=start&&d<end});
  document.getElementById('streakCount').textContent=`${sessions.length} ${sessions.length===1?'session':'sessions'} this week`;
  const days=new Set(sessions.map(s=>dayKey(new Date(s.date))));
  const week=document.getElementById('streakWeek');week.replaceChildren();
  for(let i=0;i<7;i++){const date=new Date(start);date.setDate(date.getDate()+i);const practiced=days.has(dayKey(date)),day=document.createElement('span');day.className='streak-day'+(practiced?' is-practiced':'')+(dayKey(date)===dayKey(now)?' is-today':'');day.title=date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})+(practiced?' — Session saved':' — No sessions');const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=['M','T','W','T','F','S','S'][i];day.append(dot,label);week.append(day)}
  week.setAttribute('aria-label',`${sessions.length} saved sessions this week. View practice history`);
}

function shortDate(d){try{return new Date(d).toLocaleDateString(undefined,{month:'short',day:'numeric'})}catch{return'New'}}
function renderHome(){
 renderStreak();if(!latestCarousel)return;
 const sessions=[state.current,...state.history.filter(s=>!state.current||s.id!==state.current.id)].filter(Boolean).slice(0,6);
 if(!sessions.length){latestCarousel.innerHTML='<article class="latest-empty"><div class="latest-empty-copy"><h4>Tu próxima mejora empieza aquí</h4><p>Elige un vídeo para encontrar tu próximo objetivo.</p></div></article>';return}
 latestCarousel.innerHTML=sessions.map((s,i)=>{
  const capture=s.captures?.Impact||s.captures?.Top||Object.values(s.captures||{})[0],preview=capture||s.thumb;
  const media=preview?'<img src="'+esc(preview)+'" alt="Swing video preview">':'<div class="preview-placeholder">'+uiIcon('video')+'<span>'+(previewAttempted.has(s.id)&&!previewRequests.has(s.id)?'Vista previa no disponible':'Preparando vista previa')+'</span></div>';
  return '<article class="latest-card"><div class="latest-card-media">'+media+'<button class="latest-card-play" data-open-session="'+s.id+'" aria-label="Open '+esc(s.title||'Swing session')+'">'+uiIcon('play')+'</button></div><div class="latest-card-body"><div class="latest-card-kicker"><span>'+(i?'Guardado':'Último')+' · '+shortDate(s.date)+'</span></div><h4>'+esc(s.title||'Swing session')+'</h4><p>'+phaseCount(s)+'/5 fases marcadas</p><button type="button" class="session-continue" data-open-session="'+s.id+'">Continuar '+uiIcon('chevron')+'</button></div></article>';
 }).join('');
 for(const s of sessions)if(!Object.keys(s.captures||{}).length)requestPreview(s,state.current?.id===s.id?state.videoFile:undefined);
}

function renderReviewHeader(){if(!state.current||!reviewTitleInput)return;reviewTitleInput.value=state.current.title||'Swing session';document.getElementById('reviewSubtitle').textContent=state.current.fileName||'Manual phase review'}

document.getElementById('historySearch')?.addEventListener('input',renderHistory);
const feedbackInput=document.getElementById('feedbackNotes');
if(feedbackInput){try{feedbackInput.value=localStorage.getItem('swinglab_feedback_v1')||''}catch{}feedbackInput.addEventListener('input',()=>{try{localStorage.setItem('swinglab_feedback_v1',feedbackInput.value)}catch{}})}
async function copyFeedback(){const text=feedbackInput?.value.trim();if(!text)return showToast('Write a feedback note first');try{await navigator.clipboard.writeText('Swing Lab v31 feedback\n\n'+text);showToast('Feedback copied. Ready to share.')}catch{feedbackInput?.focus();feedbackInput?.select();showToast('Select and copy your feedback text')}}
document.addEventListener('keydown',e=>{if(modal.hidden)return;if(e.key==='Escape'){e.preventDefault();closeModal()}else if(e.key==='Tab'){const focusable=Array.from(modal.querySelectorAll('button:not(.modal-scrim),input,textarea,a[href]')).filter(el=>!el.disabled);if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
document.addEventListener('swinglab:editor-closed',updateSessionStatus);
document.addEventListener('swinglab:editor-opened',hideToast);
document.addEventListener('keydown',e=>{const overlay=document.querySelector('.fullscreen-editor:not([hidden]),.compare-viewer:not([hidden])');if(!overlay||!modal.hidden)return;if(e.key==='Escape'&&overlay.id==='compareViewer'){e.preventDefault();closeCompareViewer()}if(e.key==='Tab'){const controls=Array.from(overlay.querySelectorAll('button,input,select,textarea')).filter(el=>!el.disabled&&el.getClientRects().length);const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}});


/* Agent review uses the same session, storage, and fullscreen editor. */
window.SwingLabProductBridge={ready:()=>ready,current:()=>state.current?clone(state.current):null,profile:()=>({...profile}),
 history:()=>state.history.map(s=>({id:s.id,title:s.title,date:s.date,view:s.agentContext?.context?.view||s.view||'DTL',club:s.club||'',videoSha256:s.videoSha256,agentReview:s.agentReview?{request_id:s.agentReview.request_id,scorecard:s.agentReview.scorecard,priorities:clone(s.agentReview.priorities),capture_quality:s.agentReview.capture_quality}:null,corrections:(s.corrections||[]).map(c=>({phase:c.phase,originalTime:c.originalTime,correctedTime:c.correctedTime,at:c.at}))})),
 journal:()=>store.practiceJournal(),record:entry=>store.recordPractice(entry),go,open:openSession};
window.SwingLabAgentBridge={
 current:()=>state.current?clone(state.current):null,file:()=>state.videoFile,busy:()=>state.engineBusy||state.storageBusy,
 async prepareForAgent(){if(!state.current||!state.videoFile)throw Error('Carga un vídeo primero.');if(!phases.every(p=>Number.isFinite(state.current.phases?.[p])))await analyzeWithEngine(state.videoFile);await SwingLabAgent.prepare({allowOverview:true});},
 playable:()=>!!state.videoFile&&video.readyState>=2,
 mode(mode){if(state.current)state.current.analysisMode=mode;updateSessionStatus()},
 startLocal(){if(state.videoFile&&video.readyState>=2){go('review');window.SwingLabEditor?.open?.()}state.engineGuide=true;state.reviewStep=Number.isFinite(state.current?.impactReference?.time)?'analyze':'impact';updateSessionStatus();window.SwingLabEditor?.refresh?.()},
 setContext(context,metadata){if(!state.current)return;Object.assign(state.current,{duration:metadata.duration,videoSha256:metadata.sha256,timing:metadata.timing,agentContext:context,agentReview:null,analysisMode:'agent'});updateSessionStatus()},
 setReview(review){if(state.current){state.current.agentReview=review;updateSessionStatus()}},
 async save(){if(!(await saveSession()))throw Error('The review could not be saved. Keep this page open and try Save again.');},
 jump(time){if(!state.videoFile)return;go('review');window.SwingLabEditor?.open?.();video.pause();video.currentTime=time;const full=document.getElementById('fullscreenVideo');if(full){full.pause();full.currentTime=time}},
 report(){window.SwingLabEditor?.close?.();go('results')}
};

/* A small UI bridge keeps the fullscreen workspace on the same session/actions. */
window.SwingLabReview={
 capture(phase){return {src:state.current?.captures?.[phase],drawings:clone(state.current?.captureDrawings?.[phase]||[]) };},
 saveCapture(phase,drawings){if(state.current?.captures?.[phase]){state.current.captureDrawings=state.current.captureDrawings||{};state.current.captureDrawings[phase]=clone(drawings);}},
 snapshot(){
  const session=state.current,run=session?.analyses?.at(-1);
  return {id:session?.id,title:session?.title||'Review swing',view:session?.view||'DTL',
   step:state.engineBusy?'analyzing':state.reviewStep,engineGuide:state.engineGuide,busy:state.engineBusy||state.storageBusy,
   captureBusy:!!captureJob,captures:Object.keys(session?.captures||{}),playable:!!state.videoFile&&video.readyState>=2,
   online:state.engineOnline,phases:{...session?.phases},markMode:state.markMode,
   impact:session?.impactReference?.time,progress:analysisProgress&&!analysisProgress.hidden?analysisProgressText?.textContent||'':'',
   saved:session&&!hasUnsavedChanges(),runStatus:run?.status};
 },
 async command(action,time,phase){
  if(!state.current)return;
  if(action==='manual'){if(state.engineBusy)cancelAnalysis();state.engineGuide=false;state.reviewStep='manual';updateSessionStatus();return}
  if(action==='cancel'){cancelAnalysis();window.SwingLabEditor?.refresh?.();return}
  if(state.engineBusy||state.storageBusy)return;
  if(action==='engine'){window.SwingLabAgent.openModes();return}
  if(action==='local'){window.SwingLabAgentBridge.mode('local');window.SwingLabAgentBridge.startLocal();return}
  if(action==='mark')markImpactReference(time);
  if(action==='skip'){clearImpactReference();state.reviewStep='analyze'}
  if(action==='edit-impact'){state.reviewStep='impact';state.engineGuide=true;}
  if(action==='analyze')await analyzeWithEngine(state.videoFile);
  if(action==='save')await saveSession();
  if(action==='phase'&&phases.includes(phase))setPhase(phase,time);
  if(action==='mark-mode'){state.markMode=!state.markMode;renderPhases()}
  if(action==='captures')await capturePhases();
  if(action==='report'){if(!(await saveSession()))return;window.SwingLabEditor?.close?.();go('results')}
  updateSessionStatus();window.SwingLabEditor?.refresh?.();
 }
};

function renderAll(){renderReviewHeader();renderHome();renderPhases();renderCaptures();renderHistory();renderCompare();renderProfile();updateSessionStatus();window.SwingLabPracticeUI?.refresh?.()}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
setEngineStatus(state.engineOnline?'online':'offline',state.engineOnline?'Local marker · video stays on device':'Local marker unavailable');
setupPwa();
renderAll();
try{if(landing&&localStorage.getItem('swinglab_started_v1')==='1')showApp()}catch{}
document.addEventListener('visibilitychange',()=>{if(document.hidden){video.pause();document.getElementById('fullscreenVideo')?.pause()}});
})();





/* v24 fullscreen video analysis editor */
(function(){
  const mainVideo = document.getElementById('swingVideo');
  const wrap = document.querySelector('.analysis-video-wrap');
  const editor = document.getElementById('fullscreenEditor');
  const fsVideo = document.getElementById('fullscreenVideo');
  const canvas = document.getElementById('fullscreenCanvas');
  const fsTimeline = document.getElementById('fsTimeline');
  const fsTime = document.getElementById('fsTime');
  const fsSpeed = document.getElementById('fsSpeed');
  const speedMenu = document.getElementById('speedMenu');
  const fsPlayButton = document.getElementById('fsPlayButton');
  const fsToolName = document.getElementById('fsToolName');
  const fsStatusText = document.getElementById('fsStatusText');
  const fsFitState = document.getElementById('fsFitState');
  const toolPanel = document.getElementById('toolPanel');
  const toolDock = document.getElementById('toolDock');
  const toolStyle = document.getElementById('toolStyle');
  if(!mainVideo || !editor || !fsVideo || !canvas) return;

  const S = {
    tool:'select',
    color:'#99f032',
    width:5,
    shapes:[],
    selected:null,
    temp:null,
    drawing:false,
    drawEnabled:false,
    toolsCollapsed:false,
    snapLine:false,
    drawStart:0,
    fps:30,
    angleDraft:null,
    drag:null,
    panelDrag:null,
    guides:false,
    fitSafe:false,
    view:document.getElementById('profileView')?.value||'DTL',
    speeds:[.125,.25,.5,1,1.5],
    speedIndex:3,
    lastSrc:null
  };

  document.addEventListener('swinglab:session-changed', event => {
    S.shapes=JSON.parse(JSON.stringify(event.detail.drawings||[]));
    resetDrawState();
  });
  window.SwingLabEditor={getDrawings:()=>{flushCapture();return JSON.parse(JSON.stringify(imagePhase?videoShapes:S.shapes))},openCapture,open:openEditor,close:closeEditor,refresh:refreshReview,
 release(){closeEditor();fsVideo.removeAttribute('src');fsVideo.load()}};
  let imagePhase=null,videoShapes=[],phaseSignature='';
  const still=document.getElementById('fsCaptureImage');
  function flushCapture(){if(imagePhase)window.SwingLabReview.saveCapture(imagePhase,S.shapes)}
  function leaveCapture(){flushCapture();if(imagePhase)S.shapes=videoShapes;imagePhase=null;still.hidden=true;editor.classList.remove('is-image-review');phaseSignature='';}
  function openCapture(phase){
   const item=window.SwingLabReview.capture(phase);if(!item.src)return;
   if(!imagePhase)videoShapes=S.shapes;else flushCapture();
   imagePhase=phase;S.shapes=item.drawings;resetDrawState();fsVideo.pause();still.src=item.src;still.alt=phase+' swing capture';still.hidden=false;editor.hidden=false;editor.classList.add('is-image-review');document.getElementById('appView').inert=true;
   phaseSignature='';refreshReview();still.onload=()=>{resizeCanvas();draw()};draw();
  }

  function refreshReview(){
    const r=window.SwingLabReview?.snapshot?.();if(!r)return;
    const title=document.getElementById('fsReviewTitle'),status=document.getElementById('fsSessionStatus');
    if(title)title.textContent=r.title;
    if(status)status.textContent=imagePhase?imagePhase+' capture':r.busy?(r.step==='analyzing'?'Analyzing on device':'Saving on device'):r.saved?'Saved on device':'Unsaved changes';
    const labels={
     impact:['1 / 3 · IMPACT','Where is impact?','Pause at contact, or the first frame of ball departure. You can skip this step.','Mark this frame','mark','Skip for now','skip'],
     analyze:['2 / 3 · ANALYZE',Number.isFinite(r.impact)?'Start from your impact':'Ready to analyze',Number.isFinite(r.impact)?'Impact at '+r.impact.toFixed(3)+' s. The other phases will be proposed on this device.':'No impact reference selected. Let the local marker find the swing.','Analyze swing','analyze','Back to impact','edit-impact'],
     analyzing:['2 / 3 · ANALYZE','Analyzing your swing',r.progress,'Analyzing…','analyze','Cancel','cancel'],
     review:['3 / 3 · REVIEW','Check your key phases','Tap a phase to inspect it. Open tools below to draw, correct or capture.','Save review','save','Analyze again','analyze']
    };
    const text=[...(labels[r.step]||labels.impact)];if(r.step==='analyze'&&r.progress&&(r.runStatus&&r.runStatus!=='needs-review'||/unavailable|cancelled|timed out/i.test(r.progress)))text[2]=r.progress;
    for(const [id,value]of [['fsFlowStep',text[0]],['fsFlowTitle',text[1]],['fsFlowHint',text[2]]]){const el=document.getElementById(id);if(el)el.textContent=value}
    for(const [id,label,command]of [['fsFlowPrimary',text[3],text[4]],['fsFlowSecondary',text[5],text[6]]]){
      const b=document.getElementById(id);if(!b)continue;b.textContent=label;b.dataset.reviewCommand=command;
      b.disabled=command==='cancel'?false:r.busy||!r.playable||(command==='analyze'&&!r.online)||(command==='mark'&&(!fsVideo.currentTime||fsVideo.currentTime>=fsVideo.duration));
    }
    editor.querySelectorAll('[data-review-command="save"]').forEach(b=>{b.disabled=r.busy||!r.id});
    const guide=document.getElementById('fsEngineGuide');if(guide)guide.hidden=!!imagePhase||!r.engineGuide||r.step==='review';
    const trigger=document.getElementById('fsEngineTrigger');if(trigger){trigger.disabled=r.busy||!r.playable||!r.online;trigger.textContent=r.runStatus==='needs-review'?'Analyze again':'Analyze'}
    keepPanelsVisible();const optionsToggle=editor.querySelector('[data-fs-action="options"]');if(optionsToggle)optionsToggle.setAttribute('aria-expanded',String(!document.getElementById('fsReviewOptions').hidden));
    const player=editor.querySelector('.fs-player');if(player)editor.style.setProperty('--fs-controls-height',Math.max(22,player.offsetHeight-sheetOffset)+'px');
    const mode=document.getElementById('fsMarkMode');if(mode)mode.textContent=r.markMode?'Done marking':'Mark phases';
    const signature=JSON.stringify([r.id,r.phases,r.markMode,r.busy,r.step]);
    if(signature!==phaseSignature){
      phaseSignature=signature;const strip=document.getElementById('fsPhaseStrip');if(strip){
       strip.replaceChildren();
       for(const name of ['Address','Takeaway','Top','Impact','Finish']){
        const t=r.phases[name],button=document.createElement('button'),label=document.createElement('strong'),time=document.createElement('span');
        label.textContent=name;time.textContent=Number.isFinite(t)?t.toFixed(2)+' s':'—';button.type='button';button.dataset.reviewPhase=name;
        button.disabled=r.busy||!!imagePhase&&!r.captures.includes(name);button.classList.toggle('is-marked',Number.isFinite(t));button.classList.toggle('is-mark-mode',r.markMode);
        button.append(label,time);strip.append(button);
       }
      }
    }
  }


  function openEditor(){
    leaveCapture();setCompact(false);
    if(!mainVideo.src) return;
    S.view=window.SwingLabReview?.snapshot?.().view||'DTL';
    S.fitSafe=false;editor.classList.remove('is-fit-safe');document.getElementById('fsReviewOptions').hidden=true;speedMenu.hidden=true;
    updateLabels();
    editor.hidden = false;
    document.getElementById('appView').inert=true;
    document.dispatchEvent(new CustomEvent('swinglab:editor-opened'));
    editor.querySelector('[data-fs-action="close"]')?.focus();
    const source=mainVideo.src,newSource=fsVideo.src!==source,target=Math.max(.001,Math.min(mainVideo.duration-.001,mainVideo.currentTime>.05?mainVideo.currentTime:Math.min(.15,mainVideo.duration*.05)));
    const ready=()=>{
      if(editor.hidden||mainVideo.src!==source||fsVideo.src!==source)return;
      SwingLabVideo.seek(fsVideo,target).then(()=>{resizeCanvas();draw();updateTime()}).catch(()=>setStatus('Use the timeline to choose a frame'));
    };
    if(newSource){fsVideo.addEventListener('loadeddata',ready,{once:true});fsVideo.src=source;resetDrawState()}
    else if(fsVideo.readyState>=2)ready();
    else fsVideo.addEventListener('loadeddata',ready,{once:true});
    fsVideo.playbackRate = S.speeds[S.speedIndex];
    mainVideo.pause();
    refreshReview();setTimeout(()=>{ resizeCanvas(); draw(); updateTime(); }, 80);
  }
  function closeEditor(){
    const wasImage=!!imagePhase;leaveCapture();
    if(!wasImage)try { mainVideo.currentTime = fsVideo.currentTime || 0; } catch(e) {}
    fsVideo.pause();
    editor.hidden = true;
    document.getElementById('appView').inert=false;
    document.dispatchEvent(new CustomEvent('swinglab:editor-closed'));
    document.querySelector('.open-editor-hint')?.focus();
    draw();
  }

  mainVideo.addEventListener('loadedmetadata', () => {
    if(mainVideo.src !== S.lastSrc){
      S.lastSrc = mainVideo.src;
      resetDrawState();
    }
  });

  if(wrap){
    wrap.addEventListener('click', (e)=>{
      if(mainVideo.src && !e.target.closest('button,input')) openEditor();
    });
  }

  function resizeCanvas(){
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(r.height * devicePixelRatio));
  }
  function point(e){
    const r = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return {x:(p.clientX-r.left)/r.width, y:(p.clientY-r.top)/r.height};
  }
  function center(s){
    if(s.type==='circle') return {x:s.x1,y:s.y1};
    if(s.type==='angle') return {x:s.x2,y:s.y2};
    if(s.type==='free'){
      const mid=s.points[Math.floor(s.points.length/2)] || s.points[0];
      return mid || {x:0,y:0};
    }
    return {x:(s.x1+s.x2)/2, y:(s.y1+s.y2)/2};
  }
  function distToSegment(p,a,b){
    const vx=b.x-a.x, vy=b.y-a.y, wx=p.x-a.x, wy=p.y-a.y;
    const len=vx*vx+vy*vy || 1;
    const t=Math.max(0,Math.min(1,(wx*vx+wy*vy)/len));
    const px=a.x+t*vx, py=a.y+t*vy;
    return Math.hypot(p.x-px,p.y-py);
  }
  function hit(p){
    let best=null, dist=.045;
    for(const s of S.shapes){
      let d;
      if(s.type==='line') d=distToSegment(p,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2});
      else if(s.type==='angle') d=Math.min(distToSegment(p,{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}),distToSegment(p,{x:s.x2,y:s.y2},{x:s.x3,y:s.y3}));
      else if(s.type==='box') {
        const x=Math.min(s.x1,s.x2), y=Math.min(s.y1,s.y2), w=Math.abs(s.x2-s.x1), h=Math.abs(s.y2-s.y1);
        d=(p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h)?0:Math.hypot(p.x-(x+w/2),p.y-(y+h/2));
      } else if(s.type==='circle') {
        d=Math.abs(Math.hypot(p.x-s.x1,p.y-s.y1)-Math.hypot(s.x2-s.x1,s.y2-s.y1));
      } else {
        const c = center(s); d = Math.hypot(p.x-c.x,p.y-c.y);
      }
      if(d<dist){ best=s; dist=d; }
    }
    return best;
  }
  function shapeSize(s){
    if(!s) return 0;
    if(s.type==='free') {
      let minX=1,minY=1,maxX=0,maxY=0;
      (s.points||[]).forEach(p=>{minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);});
      return Math.max(maxX-minX,maxY-minY);
    }
    if(s.type==='angle') return Math.min(Math.hypot(s.x1-s.x2,s.y1-s.y2),Math.hypot(s.x3-s.x2,s.y3-s.y2));
    return Math.hypot((s.x2||s.x1)-s.x1,(s.y2||s.y1)-s.y1);
  }
  function isDrawable(s){
    const min = s?.type==='free' ? .022 : .028;
    return shapeSize(s) >= min;
  }
  function moveShape(s,dx,dy){
    ['x1','x2','x3'].forEach(k=>{ if(s[k]!=null) s[k]+=dx; });
    ['y1','y2','y3'].forEach(k=>{ if(s[k]!=null) s[k]+=dy; });
    if(s.points) s.points.forEach(p=>{p.x+=dx;p.y+=dy;});
  }
  function resetDrawState(){
    S.drawEnabled=false;
    S.tool='select';
    S.selected=null;
    S.temp=null;
    S.drawing=false;
    S.drag=null;
    S.angleDraft=null;
    S.toolsCollapsed=false;
    if(toolPanel) toolPanel.hidden=true;
    if(toolDock) toolDock.hidden=true;
    if(toolStyle) toolStyle.hidden=true;
    document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('is-active', b.dataset.tool==='select'));
    setStatus('Draw tools are off');
  }
  function setDrawEnabled(on){
    S.drawEnabled=on;
    if(on){S.toolsCollapsed=false;toolPanel?.classList.remove('is-collapsed');}
    editor.classList.toggle('is-draw-off', !on);
    if(toolPanel) toolPanel.hidden=!on;
    if(toolDock) toolDock.hidden=true;
    if(!on){
      if(toolStyle) toolStyle.hidden=true;
      S.temp=null; S.drag=null; S.drawing=false; S.selected=null; S.angleDraft=null;
      setStatus('Draw tools are off');
    } else {
      setStatus('Select or choose a mark tool');
    }
    draw();
  }
  function collapseTools(){
    if(!toolPanel || !toolDock) return;
    S.toolsCollapsed=true;
    toolPanel.hidden=true;
    toolPanel.classList.add('is-collapsed');
    toolPanel.style.left='';
    toolPanel.style.top='';
    toolPanel.style.bottom='';
    if(toolStyle) toolStyle.hidden=true;
    toolDock.hidden=false;
    toolDock.classList.add('is-visible');
    updateLabels();
  }
  function expandTools(){
    if(!toolPanel || !toolDock) return;
    S.toolsCollapsed=false;
    setDrawEnabled(true);
    toolPanel.hidden=false;
    toolPanel.classList.remove('is-collapsed');
    toolDock.hidden=true;
    toolDock.classList.remove('is-visible');
    updateLabels();
  }
  function draw(){
    resizeCanvas();
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.scale(canvas.width, canvas.height);

    if(S.guides){
      ctx.strokeStyle='rgba(255,255,255,.22)';
      ctx.lineWidth=1/canvas.width;
      ctx.beginPath();
      ctx.moveTo(.5,0); ctx.lineTo(.5,1);
      ctx.moveTo(0,.5); ctx.lineTo(1,.5);
      ctx.moveTo(.33,0); ctx.lineTo(.33,1);
      ctx.moveTo(.66,0); ctx.lineTo(.66,1);
      ctx.stroke();
    }

    [...S.shapes, S.angleDraft, S.temp].filter(Boolean).forEach(s => drawShape(ctx,s,s.id===S.selected));
    ctx.restore();
    updateLabels();
  }
  function drawShape(ctx,s,selected){
    const lw = (selected ? (s.width||S.width)+1.25 : (s.width || S.width)) / Math.max(canvas.width, canvas.height);
    ctx.strokeStyle = selected ? '#ffffff' : (s.color || S.color);
    ctx.fillStyle = hexToRgba(s.color || S.color, .09);
    ctx.lineWidth = lw;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.shadowColor = hexToRgba(s.color || S.color, selected ? .55 : .25);
    ctx.shadowBlur = selected ? 10/canvas.width : 6/canvas.width;

    if(s.type==='line'){
      ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.stroke();
    }
    if(s.type==='box'){
      const x=Math.min(s.x1,s.x2), y=Math.min(s.y1,s.y2), w=Math.abs(s.x2-s.x1), h=Math.abs(s.y2-s.y1);
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(x,y,w,h,.01); else ctx.rect(x,y,w,h);
      ctx.fill(); ctx.stroke();
    }
    if(s.type==='circle'){
      const r=Math.hypot(s.x2-s.x1,s.y2-s.y1);
      const ratio = canvas.width / Math.max(1, canvas.height);
      ctx.beginPath(); ctx.ellipse(s.x1,s.y1,r,r*ratio,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
    if(s.type==='angle'){
      ctx.beginPath(); ctx.moveTo(s.x1,s.y1); ctx.lineTo(s.x2,s.y2); ctx.lineTo(s.x3??s.x2,s.y3??s.y2); ctx.stroke();
      const val = angleVal(s);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.font = '600 .034px system-ui';
      if(isDrawable(s)) ctx.fillText(Math.round(val)+'°', s.x2+.018, s.y2-.018);
    }
    if(s.type==='free'){
      ctx.beginPath();
      s.points.forEach((p,i)=> i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.stroke();
    }
  }
  function drawHandle(ctx,x,y){
    ctx.save();
    ctx.shadowBlur=0;
    ctx.fillStyle='#99f032';
    ctx.beginPath(); ctx.arc(x,y,.008,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  function angleVal(s){
    const ax=(s.x1-s.x2)*canvas.width, ay=(s.y1-s.y2)*canvas.height, bx=((s.x3??s.x2)-s.x2)*canvas.width, by=((s.y3??s.y2)-s.y2)*canvas.height;
    const dot=ax*bx+ay*by, ma=Math.hypot(ax,ay), mb=Math.hypot(bx,by);
    return Math.acos(Math.max(-1,Math.min(1,dot/(ma*mb||1))))*180/Math.PI;
  }
  function hexToRgba(hex,a){
    const h=hex.replace('#','');
    const r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  canvas.addEventListener('pointerdown', e=>{
    if(!S.drawEnabled) return;
    const p=point(e);
    S.drawing=true;
    S.drawStart=Date.now();
    const h=hit(p);
    if(h){
      S.selected=h.id;
      S.drag={shape:h,last:p};
      setStatus('Move selected mark');
      draw(); return;
    }
    if(S.tool==='select'){
      S.selected=null;
      setStatus('Tap a mark to select it');
      draw(); return;
    }
    const id=Date.now()+Math.random();
    if(S.tool==='free') S.temp={id,type:'free',color:S.color,width:S.width,points:[p]};
    else if(S.tool==='angle') {
      if(S.angleDraft) S.temp={id,type:'angle',color:S.color,width:S.width,x1:S.angleDraft.x1,y1:S.angleDraft.y1,x2:S.angleDraft.x2,y2:S.angleDraft.y2,x3:p.x,y3:p.y};
      else S.temp={id,type:'line',angleSeed:true,color:S.color,width:S.width,x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    }
    else S.temp={id,type:S.tool,color:S.color,width:S.width,x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    draw(); e.preventDefault();
  });
  canvas.addEventListener('pointermove', e=>{
    if(!S.drawing) return;
    const p=point(e);
    if(S.drag){
      const dx=p.x-S.drag.last.x, dy=p.y-S.drag.last.y;
      moveShape(S.drag.shape, dx, dy);
      S.drag.last=p;
      draw(); return;
    }
    if(S.temp){
      if(S.temp.type==='free') S.temp.points.push(p);
      else if(S.temp.type==='angle'){ S.temp.x3=p.x; S.temp.y3=p.y; }
      else { S.temp.x2=p.x; S.temp.y2=p.y; if(S.temp.type==='line' && S.snapLine && Date.now()-S.drawStart>380) snapLine(S.temp); }
      draw();
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointerup', finishDraw);
  canvas.addEventListener('pointercancel', finishDraw);
  function finishDraw(){
    if(S.temp && S.temp.type==='line' && S.snapLine && Date.now()-S.drawStart>380) snapLine(S.temp);
    if(S.temp && !isDrawable(S.temp)){
      if(S.temp.angleSeed) setStatus('Drag a longer first angle line');
      S.temp=null;
    } else if(S.temp && S.temp.angleSeed){
      S.angleDraft={id:'angle-draft',type:'line',color:S.color,width:S.width,x1:S.temp.x1,y1:S.temp.y1,x2:S.temp.x2,y2:S.temp.y2};
      S.temp=null;
      setStatus('Draw the second angle line');
    } else if(S.temp){
      S.shapes.push(S.temp); S.selected=S.temp.id; S.temp=null; S.angleDraft=null;
    }
    S.drawing=false; S.drag=null; draw();
  }
  function snapLine(s){
    const dx=s.x2-s.x1, dy=s.y2-s.y1;
    if(Math.abs(dx)>Math.abs(dy)) s.y2=s.y1; else s.x2=s.x1;
  }

  document.addEventListener('click', e=>{
    const phase=e.target.closest('[data-review-phase]');
    if(phase&&editor.contains(phase)){
      if(imagePhase){openCapture(phase.dataset.reviewPhase);return;}
      e.preventDefault();e.stopPropagation();fsVideo.pause();const r=window.SwingLabReview?.snapshot?.(),name=phase.dataset.reviewPhase,t=r?.phases[name];
      if(r?.markMode||!Number.isFinite(t))window.SwingLabReview?.command?.('phase',fsVideo.currentTime,name);
      else{fsVideo.currentTime=t;mainVideo.currentTime=t;updateTime()}
      return;
    }
    const review=e.target.closest('[data-review-command]');
    if(review&&editor.contains(review)){
      e.preventDefault();e.stopPropagation();const action=review.dataset.reviewCommand;
      if(['mark','analyze','captures','edit-impact','save','report'].includes(action))fsVideo.pause();
      if(['engine','edit-impact'].includes(action)){setDrawEnabled(false);setCompact(false);S.fitSafe=false;editor.classList.remove('is-fit-safe');const g=document.getElementById('fsEngineGuide');g.style.left='';g.style.top='';g.style.bottom='';}
      if(action==='mark-mode'&&window.SwingLabReview.snapshot().engineGuide)window.SwingLabReview.command('manual');
      if(['engine','edit-impact','manual','save','captures','report'].includes(action)){const more=document.getElementById('fsReviewOptions');if(more)more.hidden=true}
      window.SwingLabReview?.command?.(action,fsVideo.currentTime).catch(()=>setStatus('The review action could not finish. Try again.'));
      return;
    }

    const tool = e.target.closest('[data-tool]');
    if(tool){
      S.tool=tool.dataset.tool;
      S.angleDraft=null;
      S.temp=null;
      document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('is-active', b.dataset.tool===S.tool));
      setStatus(S.tool==='angle'?'Draw the first angle line':(tool.querySelector('small')?.textContent || S.tool));
      draw();
      return;
    }
    const color = e.target.closest('[data-color]');
    if(color){
      S.color=color.dataset.color;
      document.querySelectorAll('[data-color]').forEach(b=>b.classList.toggle('is-active', b.dataset.color===S.color));
      return;
    }
    const width = e.target.closest('[data-width]');
    if(width){
      S.width=Number(width.dataset.width)||5;
      document.querySelectorAll('[data-width]').forEach(b=>b.classList.toggle('is-active', Number(b.dataset.width)===S.width));
      return;
    }
    const speed = e.target.closest('[data-speed]');
    if(speed){
      setSpeed(Number(speed.dataset.speed)||1);
      if(speedMenu) speedMenu.hidden=true;
      e.preventDefault(); e.stopPropagation();
      return;
    }
    const action = e.target.closest('[data-fs-action]');
    if(action){
      const a=action.dataset.fsAction;
      e.preventDefault(); e.stopPropagation();
      handleFs(a);
    }
  }, true);

  function handleFs(a){
    if(a==='toggle-controls'){if(suppressToggle)suppressToggle=false;else setCompact(!editor.classList.contains('is-controls-compact'));}
    if(a==='options'){const p=document.getElementById('fsReviewOptions');p.hidden=!p.hidden;if(!p.hidden){speedMenu.hidden=true;placePanel(p)}editor.querySelector('[data-fs-action="options"]').setAttribute('aria-expanded',String(!p.hidden));}
    if(a==='open') openEditor();
    if(a==='close') closeEditor();
    if(a==='toggle-tools') setDrawEnabled(!S.drawEnabled);
    if(a==='collapse-tools') collapseTools();
    if(a==='expand-tools') expandTools();
    if(a==='toggle-fit'){ S.fitSafe=!S.fitSafe; editor.classList.toggle('is-fit-safe',S.fitSafe); setTimeout(draw,60); updateLabels(); }
    if(a==='toggle-style'){ if(toolStyle) toolStyle.hidden=!toolStyle.hidden; updateLabels(); }
    if(a==='toggle-guides'){ S.guides=!S.guides; draw(); }
    if(a==='toggle-view'){ S.view=S.view==='DTL'?'FO':'DTL'; updateLabels(); }
    if(a==='delete'){ S.shapes=S.shapes.filter(s=>s.id!==S.selected); S.selected=null; draw(); }
    if(a==='undo'){ S.shapes.pop(); S.selected=null; draw(); }
    if(a==='clear'){ S.shapes=[]; S.selected=null; draw(); }
    if(a==='duplicate') duplicateSelected();
    if(a==='toggle-snap'){ S.snapLine=!S.snapLine; updateLabels(); }
    if(a==='speed-menu'){if(speedMenu){speedMenu.hidden=!speedMenu.hidden;if(!speedMenu.hidden)placePanel(speedMenu)}updateLabels();}
    if(a==='back-frame') step(-1);
    if(a==='forward-frame') step(1);
    if(a==='play'){if(fsVideo.paused)fsVideo.play().catch(()=>setStatus('This video cannot be played'));else fsVideo.pause()}
    if(a==='snapshot') saveSnapshot();
  }
  function saveSnapshot(){
    if(!imagePhase&&fsVideo.readyState<2)return setStatus('Wait for the video to load');
    try{const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d'),vw=imagePhase?still.naturalWidth:fsVideo.videoWidth,vh=imagePhase?still.naturalHeight:fsVideo.videoHeight,scale=Math.min(output.width/vw,output.height/vh),w=vw*scale,h=vh*scale;ctx.fillStyle='#071009';ctx.fillRect(0,0,output.width,output.height);ctx.drawImage(imagePhase?still:fsVideo,(output.width-w)/2,(output.height-h)/2,w,h);ctx.drawImage(canvas,0,0);const link=document.createElement('a');link.download='swing-lab-frame.png';link.href=output.toDataURL('image/png');link.click();setStatus('Image saved to your downloads')}catch{setStatus('Image could not be saved. Try phase captures instead')}
  }
  function setSpeed(sp){
    const idx=S.speeds.indexOf(sp);
    S.speedIndex=idx>=0?idx:S.speeds.findIndex(x=>x===1);
    fsVideo.playbackRate=sp;
    mainVideo.playbackRate=sp;
    updateLabels();
  }
  function duplicateSelected(){
    const s=S.shapes.find(x=>x.id===S.selected);
    if(!s) return setStatus('Select a mark first');
    const copy=JSON.parse(JSON.stringify(s));
    copy.id=Date.now()+Math.random();
    moveShape(copy,.035,.035);
    S.shapes.push(copy);
    S.selected=copy.id;
    draw();
  }
  function step(dir){
    fsVideo.pause();
    fsVideo.currentTime=SwingLabVideo.step(window.SwingLabSourceTiming?.(),fsVideo.currentTime||0,dir,fsVideo.duration||0);
  }
  function updateTime(){
    const t=fsVideo.currentTime||0, frame=SwingLabVideo.frameIndex(window.SwingLabSourceTiming?.(),t);
    fsTime.textContent=`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}${frame==null?'':' · source frame '+frame}`;
    for(const [action,label]of [['back-frame',frame==null?'−20ms':'−1f'],['forward-frame',frame==null?'+20ms':'+1f']]){const button=editor.querySelector(`[data-fs-action="${action}"]`);if(button)button.textContent=label}
    if(fsTimeline && fsVideo.duration) fsTimeline.value=Math.round((t/fsVideo.duration)*1000);
    updateLabels();refreshReview();
  }
  function updateLabels(){
    document.getElementById('fsGuidesState').textContent=S.guides?'ON':'OFF';
    document.getElementById('fsViewState').textContent=S.view;
    document.getElementById('fsUndoCount').textContent=S.shapes.length;
    const drawState=document.getElementById('fsDrawState');
    const styleState=document.getElementById('fsStyleState');
    const snapState=document.getElementById('fsSnapState');
    if(drawState) drawState.textContent=S.drawEnabled?'ON':'OFF';
    if(styleState) styleState.textContent=toolStyle && !toolStyle.hidden?'Close':'Open';
    if(snapState) snapState.textContent=S.snapLine?'Snap':'Free';
    if(fsFitState) fsFitState.textContent=S.fitSafe?'SAFE':'FULL';
    fsSpeed.textContent=S.speeds[S.speedIndex]+'x';
    if(speedMenu) speedMenu.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('is-active', Number(b.dataset.speed)===S.speeds[S.speedIndex]));
    if(fsPlayButton){ fsPlayButton.textContent=fsVideo.paused?'Play':'Pause'; fsPlayButton.classList.toggle('is-playing', !fsVideo.paused); }
    fsToolName.textContent=S.tool.charAt(0).toUpperCase()+S.tool.slice(1);
    editor.classList.toggle('is-draw-off', !S.drawEnabled);
    document.querySelectorAll('[data-fs-action="toggle-guides"]').forEach(b=>b.classList.toggle('is-on', S.guides));
    document.querySelectorAll('[data-fs-action="toggle-tools"]').forEach(b=>b.classList.toggle('is-on', S.drawEnabled));
    document.querySelectorAll('[data-fs-action="toggle-fit"]').forEach(b=>b.classList.toggle('is-on', S.fitSafe));
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!editor.hidden){e.preventDefault();closeEditor()}});
  function setStatus(txt){ fsStatusText.textContent=txt; updateLabels(); }
  fsVideo.addEventListener('timeupdate', updateTime);
  fsVideo.addEventListener('play', updateLabels);
  fsVideo.addEventListener('pause', updateLabels);
  fsVideo.addEventListener('loadedmetadata', () => {
    const rate = fsVideo.getVideoPlaybackQuality ? fsVideo.getVideoPlaybackQuality().totalVideoFrames / Math.max(.001, fsVideo.duration || 1) : 30;
    S.fps = Number.isFinite(rate) && rate > 10 && rate < 240 ? Math.round(rate) : 30;
    updateTime();
  });
  const player=editor.querySelector('.fs-player');let sheetOffset=0,sheetStart=null,suppressToggle=false;
  function setSheetOffset(value){sheetOffset=Math.max(0,Math.min(Math.max(0,player.offsetHeight-22),value));player.style.setProperty('--sheet-offset',sheetOffset+'px');editor.classList.toggle('is-controls-compact',sheetOffset>10);const b=document.getElementById('fsControlsHandle');b.setAttribute('aria-expanded',String(sheetOffset<10));b.title=sheetOffset>10?'Raise playback controls':'Lower playback controls';editor.style.setProperty('--fs-controls-height',Math.max(22,player.offsetHeight-sheetOffset)+'px');}
  function setCompact(on){setSheetOffset(on?player.offsetHeight-22:0)}
  editor.querySelector('.fs-stage').addEventListener('click',e=>{if(!S.drawEnabled&&[fsVideo,canvas,still,e.currentTarget].includes(e.target))setCompact(!editor.classList.contains('is-controls-compact'))});
  const handle=document.getElementById('fsControlsHandle');
  handle.addEventListener('pointerdown',e=>{sheetStart={y:e.clientY,offset:sheetOffset,moved:false};handle.setPointerCapture(e.pointerId);e.preventDefault()});
  handle.addEventListener('pointermove',e=>{if(!sheetStart)return;if(Math.abs(e.clientY-sheetStart.y)>3)sheetStart.moved=true;setSheetOffset(sheetStart.offset+e.clientY-sheetStart.y);e.preventDefault()});
  const finishSheet=()=>{if(sheetStart?.moved)suppressToggle=true;sheetStart=null;};handle.addEventListener('pointerup',finishSheet);handle.addEventListener('pointercancel',()=>{sheetStart=null});
  handle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setSheetOffset(sheetOffset+(e.key==='ArrowDown'?20:-20))}});
  function placePanel(panel){panel.style.left='12px';panel.style.top='78px';panel.style.bottom='auto';panel.style.transform='none';clampPanel(panel)}
  function clampPanel(panel){if(panel.hidden||editor.hidden)return;const r=panel.getBoundingClientRect();if(!r.width||!r.height)return;const bounds=editor.getBoundingClientRect(),x=Math.max(6,Math.min(bounds.width-r.width-6,r.left-bounds.left)),y=Math.max(6,Math.min(bounds.height-r.height-6,r.top-bounds.top));if(Math.abs(x-(r.left-bounds.left))>.5||Math.abs(y-(r.top-bounds.top))>.5){panel.style.transform='none';panel.style.left=x+'px';panel.style.top=y+'px';panel.style.bottom='auto';}}
  function keepPanelsVisible(){for(const id of ['toolPanel','fsEngineGuide','fsReviewOptions','speedMenu']){const p=document.getElementById(id);if(p)clampPanel(p)}}
  let scrub=null;
  fsTimeline.addEventListener('pointerdown',e=>{if(!fsVideo.duration)return;e.preventDefault();fsVideo.pause();scrub={x:e.clientX,y:e.clientY,time:fsVideo.currentTime};fsTimeline.setPointerCapture(e.pointerId)});
  fsTimeline.addEventListener('pointermove',e=>{if(!scrub)return;e.preventDefault();const fine=Math.abs(e.clientY-scrub.y)>40?.15:1;fsVideo.currentTime=Math.max(0,Math.min(fsVideo.duration,fsVideo.currentTime+(e.clientX-scrub.x)/fsTimeline.getBoundingClientRect().width*fsVideo.duration*fine));scrub.x=e.clientX});
  const endScrub=()=>{scrub=null};fsTimeline.addEventListener('pointerup',endScrub);fsTimeline.addEventListener('pointercancel',endScrub);
  fsTimeline.addEventListener('input',()=>{if(!scrub&&fsVideo.duration){fsVideo.pause();fsVideo.currentTime=(+fsTimeline.value/1000)*fsVideo.duration}});

  window.addEventListener('resize', ()=>setTimeout(()=>{setSheetOffset(sheetOffset);keepPanelsVisible();draw()},120));

  document.addEventListener('pointerdown', e=>{
    if(e.target.closest('.panel-mini')) return;
    const h=e.target.closest('[data-drag-panel]');
    const broad=e.target.closest('.floating-panel');
    if(!h && (!broad || e.target.closest('button,input,select,textarea'))) return;
    const panel=h?document.getElementById(h.dataset.dragPanel):broad;
    const r=panel.getBoundingClientRect();
    S.panelDrag={panel,dx:e.clientX-r.left,dy:e.clientY-r.top};
    try{ (h||panel).setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
  }, true);
  document.addEventListener('pointermove', e=>{
    if(!S.panelDrag) return;
    const p=S.panelDrag.panel;
    const w=p.offsetWidth||120, h=p.offsetHeight||60;
    p.style.left=Math.max(6,Math.min(window.innerWidth-w-6,e.clientX-S.panelDrag.dx))+'px';
    p.style.top=Math.max(6,Math.min(window.innerHeight-h-6,e.clientY-S.panelDrag.dy))+'px';
    p.style.bottom='auto';
    e.preventDefault();
  }, true);
  document.addEventListener('pointerup', ()=>{ S.panelDrag=null; }, true);
  document.addEventListener('pointercancel',()=>{S.panelDrag=null},true);

  updateLabels();
})();
