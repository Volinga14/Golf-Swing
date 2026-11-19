/* Evidence-bound swing coaching, reports and explicit agent sharing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwingLabAgent=api})(globalThis,()=>{
'use strict';
const Guides=typeof module==='object'&&module.exports?require('./swing-guides.js'):globalThis.SwingLabGuides;
const PHASES=['Address','Takeaway','Top','Impact','Finish'],IDS=['address','takeaway','top','impact','finish'];
const AREAS=[['setup','Preparación'],['takeaway','Salida del palo'],['backswing','Subida'],['transition','Transición y bajada'],['impact','Impacto y liberación'],['finish','Final y equilibrio']];
const text=(v,n=3000)=>typeof v==='string'?v.slice(0,n):'',finite=Number.isFinite;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v),image=v=>typeof v==='string'&&v.length<3000000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v);
function fingerprint(session){return JSON.stringify([session.videoSha256,session.view||'DTL',...PHASES.map(p=>session.phases?.[p]??null),session.impactReference?.time??null,session.analysisRange?.start??null,session.analysisRange?.end??null])}
function normalizeContext(raw){
 if(!raw||!hash(raw.video_sha256)||typeof raw.request_id!=='string'||!Array.isArray(raw.frames)||raw.frames.length<1||raw.frames.length>30)return null;
 let previous=-1;const used=new Set(),frames=[];
 for(const f of raw.frames){if(!f||!/^F\d{3}$/.test(f.frame_id)||used.has(f.frame_id)||!finite(f.time_s)||f.time_s<0||f.time_s<=previous||!image(f.image))return null;used.add(f.frame_id);previous=f.time_s;frames.push({frame_id:f.frame_id,time_s:f.time_s,image:f.image,source_frame:Number.isInteger(f.source_frame)?f.source_frame:null,labels:Array.isArray(f.labels)?f.labels.map(x=>text(x,100)).slice(0,10):[],width:Math.min(1024,Math.max(1,Number(f.width)||1)),height:Math.min(1024,Math.max(1,Number(f.height)||1))})}
 return {request_id:text(raw.request_id,100),video_sha256:raw.video_sha256,fingerprint:text(raw.fingerprint,2000),created_at:text(raw.created_at,100),mode:['compact','extended','refine','overview'].includes(raw.mode)?raw.mode:'compact',timing_verified:raw.timing_verified===true,context:raw.context&&typeof raw.context==='object'?JSON.parse(JSON.stringify(raw.context)): {},frames};
}
function parseReview(value,context){
 const raw=value?.schema==='swinglab-trial-results/1'?value.result?.parsed:value?.schema==='swinglab-agent-result/1'?value.review:value;
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.phase_review))throw Error('Choose the agent JSON response or a local-trial result file.');
 if(!context)throw Error('Prepare an image package for this swing before importing its review.');
 const sha=value?.video_sha256||value?.result?.context?.video_sha256;
 const request=value?.request_id||value?.result?.context?.request_id;
 if(sha&&sha!==context.video_sha256)throw Error('This response belongs to a different video.');
 if(request&&request!==context.request_id)throw Error('This response belongs to a different image package.');
 const known=new Map(context.frames.map(f=>[f.frame_id,f]));
 const refs=values=>{if(!Array.isArray(values)||values.some(id=>!known.has(id)))throw Error('The response cites images that were not in this package.');return [...new Set(values)].slice(0,30)};
 const seen=new Set();const phases=raw.phase_review.map(p=>{if(!IDS.includes(p.phase)||seen.has(p.phase)||!['supported','review','uncertain'].includes(p.status))throw Error('The phase review is incomplete or invalid.');seen.add(p.phase);if(p.frame_id!=null&&(!known.has(p.frame_id)||!finite(p.time_s)||Math.abs(known.get(p.frame_id).time_s-p.time_s)>.005))throw Error('A suggested phase time does not match its evidence image.');if(p.frame_id==null&&p.time_s!=null)throw Error('A phase time requires an evidence image.');return {phase:p.phase,status:p.status,frame_id:p.frame_id??null,time_s:p.time_s??null,evidence:text(p.evidence),confidence:['low','medium','high'].includes(p.confidence)?p.confidence:'low',source:text(p.source,100)}});
 if(seen.size!==5)throw Error('The response must review all five phases.');
 const observations=(Array.isArray(raw.observations)?raw.observations:[]).slice(0,25).map(o=>({topic:text(o.topic,200),frame_ids:refs(o.frame_ids||[]),observation:text(o.observation),hypothesis:text(o.hypothesis)||null,confidence:['low','medium','high'].includes(o.confidence)?o.confidence:'low'}));
 const priorities=(Array.isArray(raw.priorities)?raw.priorities:[]).slice(0,3).map(p=>{const ids=refs(p.frame_ids||[]);if(!ids.length)throw Error('Each priority needs image evidence.');const e=p.exercise||{};return {area:AREAS.some(a=>a[0]===p.area)?p.area:null,drill_id:/^SL0[1-6]$/.test(p.drill_id||'')?p.drill_id:null,title:text(p.title,200),frame_ids:ids,observation:text(p.observation),change:text(p.change),confidence:['low','medium','high'].includes(p.confidence)?p.confidence:'low',reason:text(p.reason),drill:text(p.drill),check:text(p.check),exercise:{name:text(e.name,200),steps:(Array.isArray(e.steps)?e.steps:[]).slice(0,5).map(v=>text(v,700)),sets:Number.isInteger(e.sets)&&e.sets>=1&&e.sets<=10?e.sets:null,reps:Number.isInteger(e.reps)&&e.reps>=1&&e.reps<=50?e.reps:null,frequency:text(e.frequency,200),progression:text(e.progression,700),feel:text(e.feel,700),common_errors:(Array.isArray(e.common_errors)?e.common_errors:[]).slice(0,4).map(v=>text(v,700))}}});
 const intervals=(Array.isArray(raw.additional_frames)?raw.additional_frames:[]).slice(0,10).map(v=>{if(!finite(v.from_s)||!finite(v.to_s)||v.from_s<0||v.to_s<v.from_s||v.to_s>(Number(context.context.duration_s)||600))throw Error('An additional-image interval is outside this video.');return {from_s:v.from_s,to_s:v.to_s,reason:text(v.reason)}});
 const strengths=(Array.isArray(raw.strengths)?raw.strengths:[]).slice(0,3).map(v=>{const ids=refs(v.frame_ids||[]);if(!ids.length)throw Error('Each strength needs image evidence.');return {title:text(v.title,200),description:text(v.description),frame_ids:ids,confidence:['low','medium','high'].includes(v.confidence)?v.confidence:'low'}});
 const practice_plan=(Array.isArray(raw.practice_plan)?raw.practice_plan:[]).slice(0,3).map(v=>{if(!Number.isInteger(v.priority_index)||!priorities[v.priority_index]||!Number.isInteger(v.minutes)||v.minutes<5||v.minutes>60)throw Error('A practice session needs a valid priority and duration.');return {title:text(v.title,200),minutes:v.minutes,priority_index:v.priority_index,goal:text(v.goal,1000),steps:(Array.isArray(v.steps)?v.steps:[]).slice(0,6).map(x=>text(x,700)),success_check:text(v.success_check,1000)}});
 const canReview=raw.capture_quality?.can_review===true,source=raw.scorecard?.rubric_version==='swinglab-coaching/1'&&Array.isArray(raw.scorecard.areas)?raw.scorecard.areas:[];
 const areaSeen=new Set();for(const a of source){if(!AREAS.some(([id])=>id===a.id)||areaSeen.has(a.id))throw Error('Invalid or repeated coaching area.');areaSeen.add(a.id);}
 const areas=AREAS.map(([id,label])=>{const a=source.find(v=>v.id===id),ids=refs(a?.frame_ids||[]);const score=a?.score??null,confidence=['low','medium','high'].includes(a?.confidence)?a.confidence:'low';if(score!==null&&(!Number.isInteger(score)||score<0||score>10||!ids.length))throw Error('A coaching score must be 0–10 with image evidence.');return {id,label,score:canReview&&confidence!=='low'?score:null,reason:text(a?.reason),frame_ids:ids,confidence}});
 const scored=areas.filter(a=>a.score!==null),scorecard={rubric_version:'swinglab-coaching/1',areas,total:scored.length>=3?Math.round(scored.reduce((sum,a)=>sum+a.score,0)/scored.length*10)/10:null,coverage:scored.length};
 const record=value?.native_record||value?.result?.record;const u=record?.usage||{};
 return {request_id:context.request_id,video_sha256:context.video_sha256,imported_at:new Date().toISOString(),identity_bound:!!sha&&!!request,summary:text(raw.summary),visual_guides:canReview?Guides?.normalize(raw.visual_guides,known)||[]:[],scorecard,strengths:canReview?strengths:[],practice_plan:canReview?practice_plan:[],capture_quality:{view:['DTL','FO','uncertain'].includes(raw.capture_quality?.view)?raw.capture_quality.view:'uncertain',can_review:raw.capture_quality?.can_review===true,limitations:(Array.isArray(raw.capture_quality?.limitations)?raw.capture_quality.limitations:[]).map(s=>text(s,1500)).slice(0,15)},phase_review:phases,observations,priorities:canReview?priorities:[],additional_frames:intervals,usage:{input_tokens:finite(u.input_tokens)?u.input_tokens:null,output_tokens:finite(u.output_tokens)?u.output_tokens:null,total_tokens:finite(u.total_tokens)?u.total_tokens:null,duration_s:finite(record?.duration_s)?record.duration_s:null,model:text(record?.model,100)}};
}
function normalizeState(value){let context=normalizeContext(value.agentContext);if(context&&value.videoSha256&&context.video_sha256!==value.videoSha256)context=null;let review=null;try{if(context&&value.agentReview)review={...parseReview({schema:'swinglab-agent-result/1',video_sha256:context.video_sha256,request_id:context.request_id,review:value.agentReview},context),imported_at:text(value.agentReview.imported_at,100),identity_bound:value.agentReview.identity_bound===true,usage:value.agentReview.usage||{}}}catch{}return {analysisMode:value.analysisMode==='agent'?'agent':'local',agentContext:context,agentReview:review}}
let reportSignature=null,dialog,workspace,packetController=null,working=false,prompt='',lastFocus;
const $=id=>document.getElementById(id),B=()=>globalThis.SwingLabAgentBridge;
function el(tag,classes,content){const node=document.createElement(tag);if(classes)node.className=classes;if(content!=null)node.textContent=content;return node}
function button(label,fn,classes='agent-button'){const b=el('button',classes,label);b.type='button';b.addEventListener('click',async()=>{try{await fn()}catch(e){status(e.message,true)}});return b}
function status(message,error=false){const n=$('agentStatus');if(n){n.textContent=message;n.classList.toggle('is-error',error)}}
function saveFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function show(d){lastFocus=document.activeElement;if(!d.open)d.showModal()}
function close(d){d.close();lastFocus?.focus?.()}
function stale(session){return !!session?.agentContext&&session.agentContext.fingerprint!==fingerprint(session)}
function evidence(ids,session){const row=el('div','agent-evidence');for(const id of ids||[]){const f=session.agentContext?.frames.find(f=>f.frame_id===id);if(!f)continue;const b=button('',()=>openEvidence(f,session),'agent-evidence-card');const img=el('img');img.src=f.image;img.alt=id+' · '+f.time_s.toFixed(3)+' s';b.append(img,el('span','',id+' · '+f.time_s.toFixed(3)+' s'));row.append(b)}return row}
function openEvidence(frame,session){
 const d=$('agentEvidence'),guides=Guides.frameGuides(session.agentReview,frame.frame_id);
 d.replaceChildren();d.append(button('Cerrar',()=>close(d),'agent-close'),el('h2','',frame.frame_id+' · '+frame.time_s.toFixed(3)+' s'));
 const stage=el('div','agent-evidence-stage'),img=el('img','agent-full-image');img.src=frame.image;img.alt='Fotograma del swing';stage.append(img);d.append(stage);
 const actions=el('div','agent-action-row');
 if(guides.length){
  const overlay=el('div','agent-evidence-overlay');overlay.innerHTML=Guides.svg(guides,frame.width,frame.height);stage.append(overlay);
  const toggle=button('Ocultar líneas',()=>{overlay.hidden=!overlay.hidden;toggle.setAttribute('aria-pressed',String(!overlay.hidden));toggle.textContent=overlay.hidden?'Mostrar líneas':'Ocultar líneas'});
  toggle.setAttribute('aria-pressed','true');actions.append(toggle);
  const legend=el('div','agent-guide-legend');for(const kind of new Set(guides.map(g=>g.kind))){const chip=el('span','',Guides.kinds[kind].label);chip.style.setProperty('--guide-color',Guides.kinds[kind].color);legend.append(chip)}
  d.append(legend,el('p','agent-footnote','Referencias 2D aproximadas sobre este fotograma.'));
 }
 if(B().playable())actions.append(button('Ver este momento en el vídeo',()=>{close(d);if(workspace.open)close(workspace);B().jump(frame.time_s,!!guides.length)},'agent-button agent-primary'));
 d.append(actions);show(d);
}
function renderReport(){
 const container=$('agentResults');if(!container||!B())return;const s=B().current(),signature=JSON.stringify([s?.id,s?.agentReview,s?.notes,s?.drawings,s?.phases,s?.agentContext?.request_id,s?.analyses?.at(-1)?.runId,B().playable()]);if(signature===reportSignature)return;reportSignature=signature;container.replaceChildren();if(!s)return;
 if(s.agentReview&&globalThis.SwingLabCoaching){
  container.innerHTML='<style>'+SwingLabCoaching.STYLE+'</style>'+SwingLabCoaching.markup(s);
  const tools=el('details','coach-export-row');tools.append(el('summary','','Compartir informe'));tools.append(button('PDF para practicar',()=>exportReport(true,false),'agent-button agent-primary'),button('PDF con detalle técnico',()=>exportReport(true,true)),button('Informe HTML sin conexión',()=>exportReport(false,false)));
  container.prepend(tools);
  container.querySelectorAll('[data-coach-frame]').forEach(b=>b.onclick=()=>{const f=s.agentContext?.frames.find(f=>f.frame_id===b.dataset.coachFrame);if(f)openEvidence(f,s)});
  container.querySelectorAll('[data-coach-jump]').forEach(b=>{b.disabled=!B().playable();b.onclick=()=>B().jump(Number(b.dataset.coachJump),b.hasAttribute('data-coach-show-guides'))});
  const toggle=container.querySelector('[data-coach-guide-toggle]');if(toggle)toggle.onclick=()=>{const hidden=toggle.closest('.coach-visual-correction').classList.toggle('is-lines-hidden');toggle.setAttribute('aria-pressed',String(!hidden));toggle.textContent=hidden?'Mostrar líneas':'Ocultar líneas'};
  if(stale(s))container.append(el('p','agent-warning','Las marcas cambiaron después de preparar estos fotogramas. El informe conserva la evidencia de esa revisión; prepara nuevas imágenes si vuelves a analizar.'));
  const usage=s.agentReview.usage||{},details=el('details','agent-detail');details.append(el('summary','','Uso del agente'),el('p','',[(usage.model||'Modelo no indicado'),finite(usage.total_tokens)?usage.total_tokens.toLocaleString()+' tokens':'Consumo no informado',finite(usage.duration_s)?usage.duration_s+' s':''].filter(Boolean).join(' · ')),el('p','agent-footnote','Los tokens no indican euros ni el porcentaje restante del plan.'));container.append(details);globalThis.SwingLabPracticeUI?.attachReport(container,s);return;
 }
 const intro=el('section','agent-report-intro');intro.append(el('span','agent-eyebrow','REVISIÓN LOCAL'),el('h3','','Tus momentos clave'),el('p','','El motor local propone marcas de fase. Añade la revisión del agente para obtener recomendaciones técnicas, ejercicios y una valoración respaldada por imágenes.'));container.append(intro);
 const line=el('div','agent-timeline');for(const name of PHASES){const t=s.phases?.[name],b=button(name+' · '+(finite(t)?t.toFixed(3)+' s':'sin marca'),()=>{if(finite(t)&&B().playable())B().jump(t)},'agent-phase-point');b.disabled=!finite(t)||!B().playable();line.append(b)}container.append(line);
 const run=s.analyses?.at(-1),deltas=PHASES.filter(p=>finite(run?.phases?.[p])&&finite(s.phases?.[p])&&Math.abs(run.phases[p]-s.phases[p])>.005);
 for(const name of deltas){const card=el('section','agent-detail');card.append(el('h4','',name),el('p','','Tu marca y la propuesta del motor local'));const actions=el('div','agent-action-row');for(const [label,time] of [['Tu marca',s.phases[name]],['Propuesta',run.phases[name]]]){const seek=button(label+' · '+time.toFixed(2)+' s',()=>B().jump(time));seek.disabled=!B().playable();actions.append(seek)}card.append(actions);container.append(card)}
 container.append(button('Añadir análisis técnico',openAgent,'agent-button agent-primary'));
}
async function exportReport(pdf,technical=false){
 const s=B().current();if(!s?.agentReview)throw Error('Primero añade una revisión del agente.');const html=SwingLabCoaching.documentHTML(s,{technical});
 if(globalThis.SwingLabNativeReport){await globalThis.SwingLabNativeReport(html,pdf);return}
 if(pdf){const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),tab=window.open(url,'_blank');if(!tab){URL.revokeObjectURL(url);throw Error('Permite abrir el informe para imprimirlo o guardarlo como PDF.')}tab.addEventListener('load',()=>{tab.focus();tab.print()},{once:true});setTimeout(()=>URL.revokeObjectURL(url),60000);return}
 saveFile(new Blob([html],{type:'text/html'}),'SwingLab-informe-'+new Date().toISOString().slice(0,10)+'.html');
}

async function prepare(options={}){
 if(working)return;const s=B().current(),file=B().file();if(!s||!file)throw Error('Open a session with its original video to prepare images.');if(B().busy())throw Error('Wait for the current save or analysis.');const bounds=s.analysisRange;const complete=PHASES.every(p=>finite(s.phases?.[p])&&(!bounds||(s.phases[p]>=bounds.start&&s.phases[p]<=bounds.end)));if(!complete&&!options.allowOverview)throw Error('Mark or detect all five phases first, then review their order.');
 working=true;packetController=new AbortController();let resource;const sessionId=s.id,signature=fingerprint(s);$('agentPrepare').disabled=true;$('agentCancel').hidden=false;
 try{const metadata=await SwingLabLocal.prepare(file,packetController.signal);const original={...s,videoSha256:metadata.sha256};const phaseMap=Object.fromEntries(PHASES.map((p,i)=>[IDS[i],{time:s.phases[p],source:(s.impactReference&&p==='Impact')||(s.corrections||[]).some(c=>!c.supersededBy&&c.phase===p&&c.correctedTime===s.phases[p])?'manual':s.analyses?.at(-1)?.phases?.[p]===s.phases[p]?'local_model':'user_mark'}]));const mode=metadata.timing.verified?'refine':'compact';const selected=complete?SwingLabSampling.select(phaseMap,metadata.duration,metadata.timing,mode,bounds):SwingLabSampling.overview(metadata.duration,metadata.timing,bounds);resource=await SwingLabVideo.open(file,packetController.signal);const scale=Math.min(1,768/Math.max(metadata.width,metadata.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(metadata.width*scale));canvas.height=Math.max(1,Math.round(metadata.height*scale));const ctx=canvas.getContext('2d'),frames=[];
 for(const point of selected){if(packetController.signal.aborted)throw new DOMException('Cancelled','AbortError');const next=point.source_frame==null?null:metadata.timing.times[point.source_frame+1],offset=point.source_frame==null?0:Math.min(.004,next==null?.001:(next-point.time)/2);await SwingLabVideo.seek(resource.video,Math.min(metadata.duration-.001,point.time+offset),packetController.signal);ctx.drawImage(resource.video,0,0,canvas.width,canvas.height);frames.push({frame_id:point.frame_id,time_s:point.time,source_frame:point.source_frame,labels:point.labels,width:canvas.width,height:canvas.height,image:canvas.toDataURL('image/jpeg',.82)});const progress='Preparando fotogramas: '+frames.length+' / '+selected.length;status(progress);options.onProgress?.(progress)}
 if(B().current()?.id!==sessionId||B().file()!==file||fingerprint({...B().current(),videoSha256:metadata.sha256})!==fingerprint(original))throw Error('The session changed. Prepare images again.');
 const context={analysis_range:bounds||null,selection_method:complete?'local_phase_context':'uniform_overview',phase_hypotheses_incomplete:!complete,view:s.view||'DTL',duration_s:metadata.duration,video_sha256:metadata.sha256,phases:phaseMap,impact_reference:s.impactReference?{time_s:s.impactReference.time,source:'manual_reference'}:null,timing_source:metadata.timing.source,timing_verified:metadata.timing.verified};
 B().setContext({request_id:crypto.randomUUID(),video_sha256:metadata.sha256,fingerprint:fingerprint(original),created_at:new Date().toISOString(),mode:complete?mode:'overview',timing_verified:metadata.timing.verified,context,frames},metadata);
 renderWorkspace();status(frames.length+' fotogramas listos. Revisa las imágenes antes de compartir.');
 }finally{resource?.close();working=false;packetController=null;$('agentPrepare').disabled=false;$('agentCancel').hidden=true}
}
async function instructions(context){if(!prompt){const r=await fetch('./agent-prompt.txt');if(!r.ok)throw Error('Instructions are unavailable. Reconnect once to prepare offline resources.');prompt=await r.text()}return prompt+'\n\nReturn your response using this exact outer envelope, with no Markdown fences:\n'+JSON.stringify({schema:'swinglab-agent-result/1',video_sha256:context.video_sha256,request_id:context.request_id,review:'Insert the review object specified above here.'})+'\nUse only the supplied image files and manifest. Inspect every supplied image, whether attached directly or included in a package; if your environment cannot open the images, state that limitation instead of inventing an analysis. Do not infer observations from phase labels alone.'}
let preparedShare;
const sharePrefix='Analiza este swing con las láminas adjuntas. Cada recuadro tiene un ID y un tiempo. Usa esos IDs como evidencia.';
function shareContext(){
 const s=B().current(),context=s?.agentContext;
 if(!context||stale(s))throw Error('Prepara fotogramas para el tramo y las marcas actuales.');
 if(!$('agentShareConsent').checked)throw Error('Autoriza compartir estos fotogramas antes de continuar.');
 return context;
}
async function prepareShareFiles(context){
 const guide=await instructions(context);
 const manifest={schema:'swinglab-review-packet/1',context:{...context.context,request_id:context.request_id},frames:context.frames.map(({image,...frame})=>frame)};
 const instructionsText=sharePrefix+'\n\n'+guide+'\n\nContexto del swing y marcas:\n'+JSON.stringify(manifest);
 const files=[];
 for(let offset=0;offset<context.frames.length;offset+=6){
  const frames=context.frames.slice(offset,offset+6),canvas=document.createElement('canvas');
  const columns=3,cellWidth=400,cellHeight=464;
  canvas.width=columns*cellWidth;canvas.height=54+cellHeight*Math.ceil(frames.length/columns);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#10251b';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#fff';ctx.font='bold 26px sans-serif';ctx.fillText('SwingLab · Lámina '+(files.length+1)+' / '+Math.ceil(context.frames.length/6),18,37);
  for(const [i,frame] of frames.entries()){
   const img=new Image();img.src=frame.image;await img.decode();
   const left=(i%columns)*cellWidth,top=54+Math.floor(i/columns)*cellHeight;
   const scale=Math.min((cellWidth-20)/img.naturalWidth,(cellHeight-50)/img.naturalHeight),width=img.naturalWidth*scale,height=img.naturalHeight*scale;
   ctx.drawImage(img,left+(cellWidth-width)/2,top+(cellHeight-40-height)/2,width,height);
   ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.fillText(frame.frame_id+' · '+frame.time_s.toFixed(3)+' s',left+12,top+cellHeight-12);
  }
  const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.87));
  if(!jpeg)throw Error('No se pudo preparar una lámina. Usa el paquete ZIP.');
  files.push(new File([jpeg],'SwingLab-lamina-'+(files.length+1)+'.jpg',{type:'image/jpeg'}));
 }
 return {files,instructionsText};
}
function prepareSharePanel(context){
 if(!context)return;
 const panel=$('agentSheetDownloads');
 if(preparedShare?.id!==context.request_id){
  $('agentPromptText').value='';panel.textContent='Preparando las láminas…';
  const entry={id:context.request_id,promise:prepareShareFiles(context)};
  preparedShare=entry;
  entry.promise.then(contents=>{
   if(preparedShare!==entry)return;
   entry.contents=contents;
   $('agentPromptText').value=contents.instructionsText;
   panel.replaceChildren(...contents.files.map((file,i)=>button('Descargar lámina '+(i+1),()=>{if(shareContext().request_id===entry.id)saveFile(file,file.name)})));
   $('agentShare').disabled=false;$('agentCopyPrompt').disabled=false;
  }).catch(()=>{if(preparedShare===entry){preparedShare=null;panel.textContent='No se pudieron crear las láminas. Puedes guardar el ZIP con los originales.'}});
 }else if(preparedShare.contents){
  $('agentShare').disabled=false;$('agentCopyPrompt').disabled=false;
 }
}
async function shareSheets(){
 const context=shareContext(),packet=preparedShare?.id===context.request_id?preparedShare.contents:null;
 if(!packet)throw Error('Espera a que se preparen las láminas.');
 const data={files:packet.files,title:'SwingLab · Fotogramas del swing'};
 try{
  // Invoke the picker from this click. Canvas/ZIP work has already completed.
  if(!navigator.share||!navigator.canShare?.(data))throw new DOMException('Sharing unavailable','NotAllowedError');
  await navigator.share(data);
  status('En ChatGPT, adjunta las láminas si no aparecen y pega las instrucciones. Después, trae aquí el JSON.');
 }catch(error){
  if(error.name==='AbortError'){status('Compartir se canceló. Las láminas siguen disponibles.');return}
  $('agentManualFiles').open=true;
  status('El navegador no pudo abrir el selector. Descarga las láminas, copia las instrucciones y adjunta las imágenes en ChatGPT.');
  $('agentManualFiles').scrollIntoView({block:'nearest'});
 }
}
async function exportPackage(){
 const c=shareContext(),guide=await instructions(c);
 const manifest={schema:'swinglab-review-packet/1',context:{...c.context,request_id:c.request_id},frames:c.frames.map(({image,...f})=>({...f,path:'images/'+f.frame_id+'.jpg'}))};
 const entries=[{name:'INSTRUCTIONS.txt',data:guide},{name:'manifest.json',data:JSON.stringify(manifest,null,2)},{name:'review-packet.json',data:JSON.stringify({schema:'swinglab-review-packet/1',context:manifest.context,frames:c.frames})}];
 for(const f of c.frames){const raw=atob(f.image.split(',')[1]);entries.push({name:'images/'+f.frame_id+'.jpg',data:new Blob([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],{type:'image/jpeg'})})}
 const blob=await SwingLabLearning.zip(entries);
 saveFile(blob,'SwingLab-agent-'+c.request_id.slice(0,8)+'.zip');
 status('Paquete guardado. Contiene los fotogramas originales y el archivo de instrucciones.');
}
async function importResult(value){const s=B().current();if(!s?.agentContext)throw Error('Prepare a package for this swing before importing its response.');const review=parseReview(value,s.agentContext);if(!review.identity_bound&&!confirm('This response does not include both the current package ID and video identity. Confirm it came from the images shown here before attaching it to this session.'))return;B().setReview(review);await B().save();renderWorkspace();renderReport();status('Review attached to this swing. Your phase marks and drawings were kept.');}
function renderWorkspace(){
 if(!workspace||!B())return;
 const s=B().current(),context=s?.agentContext,preview=$('agentPreview'),valid=!!context&&!stale(s);
 preview.replaceChildren();if(context)preview.append(evidence(context.frames.map(f=>f.frame_id),s));
 $('agentShareConsent').checked=false;
 $('agentPackageMeta').textContent=context?context.frames.length+' fotogramas · '+(context.timing_verified?'tiempos verificados':'tiempos aproximados')+(valid?'':' · prepara de nuevo tras cambiar las marcas'):'Prepara las imágenes desde tu vídeo.';
 $('agentFramesDetails').hidden=!context;
 $('agentCancel').hidden=!working;
 for(const id of ['agentExport','agentLocalExport'])$(id).disabled=!valid;
 $('agentShare').disabled=true;$('agentCopyPrompt').disabled=true;
 $('agentPrepare').disabled=working||!s;
 $('agentResultText').value='';
 if(valid&&!globalThis.SwingLabNative)prepareSharePanel(context);
}
function openModes(){if(!B()?.current())return;show(dialog)}
function openAgent(){if(!B()?.current())return;if(dialog?.open)close(dialog);B().mode('agent');renderWorkspace();show(workspace)}
function init(){
 dialog=$('analysisModeDialog');workspace=$('agentWorkspace');if(!dialog||!workspace)return;if(!globalThis.SwingLabNative){document.querySelector('.agent-route-note').textContent='Estás en SwingLab web. Envía las láminas a ChatGPT y vuelve con el informe. Para revisar desde SwingLab con tu cuenta, abre el APK de Android.';}else $('agentAndroidBuild').hidden=true;
 $('chooseLocal').onclick=()=>{B().mode('local');close(dialog);B().startLocal()};$('chooseAgent').onclick=openAgent;$('agentLocalFirst').onclick=()=>{close(workspace);B().startLocal()};
 for(const d of [dialog,workspace,$('agentEvidence')]){d.querySelector('[data-agent-close]')?.addEventListener('click',()=>close(d));d.addEventListener('cancel',()=>{if(working)packetController?.abort()})}
 $('agentPrepare').onclick=()=>prepare({allowOverview:true}).catch(e=>status(e.name==='AbortError'?'Preparación cancelada.':e.message,true));$('agentCancel').onclick=()=>packetController?.abort();
 $('agentExport').onclick=()=>exportPackage().catch(e=>status(e.message,true));
 $('agentShare').onclick=()=>shareSheets().catch(e=>status(e.message,true));
 $('agentShareConsent').onchange=()=>{try{prepareSharePanel(shareContext())}catch{/* Consent is checked again before each export. */}};
 $('agentCopyPrompt').onclick=async()=>{try{const c=shareContext();if(preparedShare?.id!==c.request_id||!preparedShare.contents)return;const box=$('agentPromptText');try{await navigator.clipboard.writeText(box.value);status('Instrucciones copiadas. Pégalas en ChatGPT junto a las láminas.')}catch{$('agentManualFiles').open=true;box.focus();box.select();status('Las instrucciones están seleccionadas. Usa Copiar en tu navegador.')}}catch(e){status(e.message,true)}};
 $('agentLocalExport').onclick=()=>{const c=B().current()?.agentContext;if(!c||!$('agentShareConsent').checked)return status('Review the images and tick the sharing confirmation first.',true);saveFile(new Blob([JSON.stringify({schema:'swinglab-review-packet/1',context:{...c.context,request_id:c.request_id},frames:c.frames})],{type:'application/json'}),'SwingLab_review_packet.json')};
 $('agentImport').onchange=async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>2000000)throw Error('Choose a result JSON smaller than 2 MB, not the image package.');await importResult(JSON.parse(await file.text()))}catch(error){status(error.message,true)}finally{e.target.value=''}};
 $('agentPasteImport').onclick=()=>{try{const input=$('agentResultText').value.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');importResult(JSON.parse(input)).catch(e=>status(e.message,true))}catch{status('Paste the complete JSON response.',true)}};
 document.querySelectorAll('[data-agent-open]').forEach(b=>b.addEventListener('click',openAgent));$('agentOpenResults').onclick=()=>{close(workspace);B().report()};
 renderReport();
}
if(typeof document!=='undefined')document.addEventListener('DOMContentLoaded',init);
return {PHASES,IDS,AREAS,fingerprint,normalizeContext,parseReview,normalizeState,renderReport,exportReport,openModes,openAgent,prepare,instructions,importResult};
});
