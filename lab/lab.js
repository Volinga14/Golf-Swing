/* Experimental marking only. No video upload occurs except the explicit GLAB action. */
(() => {
  'use strict';
  const C=MarkingCore,S=MarkingStore,$=id=>document.getElementById(id),video=$('video');
  const state={records:[],id:null,file:null,url:null,draft:null,dirty:false,busy:false,worker:null,controller:null,generation:0,phase:'impact'};
  const current=()=>state.records.find(r=>r.id===state.id);
  const time=value=>Number.isFinite(value)?value.toFixed(3)+' s':'—';
  const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error)};
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};
  const updateRecord=record=>{state.records=state.records.map(r=>r.id===record.id?record:r)};
  function exportFile(name,payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function safeLeave(){return !state.dirty||confirm('La referencia tiene cambios sin guardar. ¿Descartarlos?')}
  function lock(on){state.busy=on;for(const id of ['record','record-view','files','load-private','run-local','run-glab','import','import-glab','play','back','forward','timeline'])$(id).disabled=on;for(const el of $('reference-form').elements)el.disabled=on||!state.records.length;for(const id of ['record','record-view','run-local','run-glab'])$(id).disabled=on||!state.records.length;for(const button of $('phase-tabs').querySelectorAll('button'))button.disabled=on||!state.records.length;$('cancel').hidden=!on;$('progress').hidden=!on;}
  function renderLibrary(){const previous=state.id;$('record').replaceChildren();for(const record of state.records){const option=text('option',record.title+(record.reference.status==='draft'?' · pendiente de revisión':''));option.value=record.id;$('record').append(option)}$('record').value=previous||state.records[0]?.id||'';if(!state.busy){for(const el of $('reference-form').elements)el.disabled=!state.records.length;for(const id of ['record','record-view','run-local','run-glab'])$(id).disabled=!state.records.length;for(const button of $('phase-tabs').querySelectorAll('button'))button.disabled=!state.records.length}renderSummary()}
  function renderSummary(){
    $('summary').replaceChildren();for(const [key,label]of [['glab','GLAB'],['local','Local Mark v0.3']]){const summary=C.summarize(state.records,key),article=document.createElement('article');article.append(text('h3',label));
      for(const line of [`Casos revisados con resultado: ${summary.completed}/${summary.reviewed}`,`Fases comparadas: ${summary.matched}/${summary.eligible} · ausentes: ${summary.missing}`,`Error absoluto medio: ${time(summary.mae)} · mediana: ${time(summary.median)} · P95: ${time(summary.p95)}`,`Falsos análisis en controles negativos: ${summary.falsePositives}/${summary.negatives}`,`Comparaciones con FPS constante verificado: ${summary.frameSamples}`])article.append(text('p',line));
      if(summary.frameSamples)article.append(text('p',`Dentro de ±1 / ±3 / ±5 fotogramas: ${[1,3,5].map(n=>Math.round(summary.frameHits[n]*100)+'%').join(' / ')}`));
      $('summary').append(article);
    }
  }
  function seekButton(value){const button=text('button',time(value));button.type='button';button.disabled=!state.file||state.busy;button.addEventListener('click',()=>{video.pause();video.currentTime=Math.max(0,Math.min(video.duration,value))});return button}
  function renderComparison(){
    $('comparison').replaceChildren();const record=current();if(!record)return;
    for(const phase of C.PHASES){const row=document.createElement('tr');row.append(text('td',phase.label));const mark=record.reference.phases?.[phase.id],ref=mark?.time,refCell=document.createElement('td');if(Number.isFinite(ref))refCell.append(seekButton(ref));else refCell.textContent='Sin resolver';if(mark?.range)refCell.append(text('small',` · ${time(mark.range[0])}–${time(mark.range[1])}`));row.append(refCell);
      const previous=record.resultHistory?.filter(r=>r.key==='local').at(-1)?.result;
      for(const key of ['glab','previous','local']){const result=key==='previous'?previous:record.results?.[key],cell=document.createElement('td'),value=result?.phases?.[phase.id];if(Number.isFinite(value))cell.append(seekButton(value));else cell.textContent=result?.status==='rejected'?'Rechazado':result?.status==='needs-segment'?'Delimitar tramo':'—';row.append(cell);const delta=Number.isFinite(value)&&Number.isFinite(ref)?value-ref:null;row.append(text('td',delta==null?'—':(delta>0?'+':'')+delta.toFixed(3)+' s'))}
      $('comparison').append(row);
    }
    const results=Object.entries(record.results||{}).map(([key,r])=>`${key==='local'?'Local':'GLAB'}: ${r.status==='rejected'?'rechazado':r.status==='error'?'error':r.status==='needs-segment'?'necesita delimitar el swing':'propuestas pendientes de revisión'}${r.note?' · '+r.note:''}`);
    $('engine-note').textContent=results.join(' | ');renderSummary();
  }
  function renderPhase(){
    const phase=C.PHASES.find(p=>p.id===state.phase),mark=state.draft?.phases?.[state.phase]||{};
    $('phase-definition').textContent=phase.definition;
    for(const button of $('phase-tabs').querySelectorAll('button'))button.classList.toggle('active',button.dataset.phase===state.phase);
    $('mark-time').value=mark.time??'';$('range-start').value=mark.range?.[0]??'';$('range-end').value=mark.range?.[1]??'';$('reason').value=mark.reason||'';
  }
  function renderReference(){
    if(!state.draft)return;
    $('reviewer').value=state.draft.reviewer||'';$('notes').value=state.draft.notes||'';$('negative').checked=state.draft.status==='negative';
    $('reference-status').textContent=(state.draft.status==='negative'?'Sin swing':state.draft.status==='reviewed'?'Revisada':'Borrador')+(state.draft.reviewer?' · '+state.draft.reviewer:'');renderPhase();
    $('revisions').replaceChildren();const revisions=current()?.revisions||[];
    for(const revision of [...revisions].reverse()){const line=document.createElement('p');line.append(text('span',`v${revision.version} · ${revision.savedAt} · ${revision.reference.reviewer||'sin revisor'} `));const restore=text('button','Recuperar como borrador');restore.type='button';restore.onclick=()=>{if(state.busy)return;state.draft=C.clone(revision.reference);state.draft.status=state.draft.status==='negative'?'negative':'draft';changed();renderReference()};line.append(restore);$('revisions').append(line)}
    if(!revisions.length)$('revisions').append(text('p','Aún no hay versiones previas guardadas.'));
    if(current()?.incomingReference){const apply=text('button','Aplicar revisión disponible conservando la anterior');apply.type='button';apply.onclick=async()=>{if(state.busy||!safeLeave())return;const record=C.clone(current());record.revisions=record.revisions||[];record.revisions.push({version:record.referenceVersion||1,savedAt:new Date().toISOString(),reference:C.clone(record.reference)});record.reference=record.incomingReference;record.referenceVersion=record.reference.version;record.updatedAt=record.reference.updatedAt;if(record.incomingReviewMetadata){Object.assign(record,record.incomingReviewMetadata);delete record.incomingReviewMetadata}delete record.incomingReference;lock(true);try{await S.save(record);updateRecord(record);state.dirty=false;state.draft=C.clone(record.reference);renderReference();renderComparison();status('Revisión aplicada. La referencia anterior se conserva en versiones.')}catch{status('No se pudo aplicar la revisión.',true)}finally{lock(false)}};$('revisions').prepend(apply)}
    const alternatives=current()?.alternativeHistoricalReferences||[];
    if(alternatives.length)$('revisions').append(text('strong','Etiquetas históricas en conflicto para este mismo vídeo'));
    for(const alternative of alternatives){const line=document.createElement('p');line.append(text('span',`${alternative.sourceId}: ${C.PHASES.map(p=>p.label+' '+time(alternative.phases?.[p.id])).join(' · ')} `));const choose=text('button','Usar esta alternativa como borrador');choose.type='button';choose.onclick=()=>{if(state.busy)return;state.draft={status:alternative.negative?'negative':'draft',reviewer:'',notes:'Alternativa histórica pendiente de reconciliación con el protocolo actual.',phases:alternative.negative?{}:Object.fromEntries(C.PHASES.map(p=>[p.id,{time:Number.isFinite(alternative.phases?.[p.id])?alternative.phases[p.id]:null,reason:''}]))};changed();renderReference()};line.append(choose);$('revisions').append(line)}
    $('draft-state').textContent=state.dirty?'Cambios sin guardar. La tabla y las métricas conservan la referencia guardada.':'Referencia guardada. Las métricas se recalculan al guardar una nueva versión.';
  }
  function changed(){state.dirty=true;if(state.draft.status==='reviewed')state.draft.status='draft';$('draft-state').textContent='Cambios sin guardar. La tabla y las métricas conservan la referencia guardada.';$('reference-status').textContent=state.draft.status==='negative'?'Sin swing':'Borrador'}
  function captureFields(){if(!state.draft)return;const numeric=id=>$(id).value.trim()===''?null:Number($(id).value),mark={time:numeric('mark-time'),reason:$('reason').value.trim()},start=numeric('range-start'),end=numeric('range-end');if(start!=null||end!=null)mark.range=[start,end];state.draft.phases[state.phase]=mark;state.draft.reviewer=$('reviewer').value.trim();state.draft.notes=$('notes').value}
  async function saveReference(reviewed){
    if(state.busy||!current())return;captureFields();const reference=C.clone(state.draft);reference.status=$('negative').checked?'negative':reviewed?'reviewed':'draft';if(reference.status==='negative')reference.phases={};
    const errors=C.validateReference(reference,current().duration);if(errors.length)return status(errors.join(' '),true);
    const record=C.clone(current());record.revisions=record.revisions||[];record.revisions.push({version:record.revisions.length+1,savedAt:new Date().toISOString(),reference:C.clone(record.reference)});record.referenceVersion=(record.referenceVersion||0)+1;record.updatedAt=new Date().toISOString();reference.updatedAt=record.updatedAt;reference.version=record.referenceVersion;reference.method='visual-review';record.reference=reference;
    lock(true);
    try{await S.save(record);updateRecord(record);state.draft=C.clone(reference);state.dirty=false;renderLibrary();renderReference();renderComparison();status(reviewed?'Referencia confirmada. Resultados recalculados sin modificar las predicciones.':'Borrador guardado. No se incluye en los errores agregados.')}catch{status('No se pudo guardar la referencia. Conserva los cambios y exporta una copia antes de salir.',true)}finally{lock(false);renderComparison()}
  }
  function updateTime(){$('time').textContent=time(video.currentTime);if(Number.isFinite(video.duration))$('timeline').value=video.currentTime;$('play').textContent=video.paused?'Reproducir':'Pausar'}
  async function openRecord(id){
    if(state.busy)return;if(!safeLeave()){$('record').value=state.id;return}
    const record=state.records.find(r=>r.id===id);if(!record)return;const generation=++state.generation;
    $('back').textContent=record.timing?.verified?'−1 fotograma':'−20 ms';$('forward').textContent=record.timing?.verified?'+1 fotograma':'+20 ms';
    video.pause();video.removeAttribute('src');video.load();if(state.url)URL.revokeObjectURL(state.url);state.url=null;state.file=null;state.id=id;state.draft=C.clone(record.reference);state.dirty=false;
    $('no-video').hidden=false;$('duration').textContent=time(record.duration);$('record-view').value=record.view||'unknown';$('view-label').textContent=record.view==='dtl'?'Down the line':'Vista no compatible con este candidato';renderReference();renderComparison();$('availability').textContent='Buscando vídeo en este navegador…';
    try{const file=await S.video(id);if(generation!==state.generation)return;if(file){state.file=file;state.url=URL.createObjectURL(file);video.src=state.url;$('no-video').hidden=true;$('availability').textContent='Vídeo disponible en este navegador'}else $('availability').textContent=`Carga ${record.fileName} para revisar estas marcas.`}catch{status('No se pudo leer el vídeo guardado.',true)}
  }
  async function loadFile(file,expectedId,internal=false){
    if(state.busy&&!internal)return;if(file.size>150*1024*1024)throw Error('Elige un clip de menos de 150 MB.');
    if(!file.size||(!file.type.startsWith('video/')&&!/\.(mp4|mov|m4v|webm)$/i.test(file.name)))throw Error('El archivo no es un vídeo reconocido.');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');
    let record=state.records.find(r=>r.sha256===hash);if(expectedId&&record?.id!==expectedId)throw Error('La huella del vídeo no coincide con la referencia.');
    if(!record){const probe=document.createElement('video'),url=URL.createObjectURL(file);try{probe.preload='metadata';probe.src=url;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No se pudo leer el vídeo.')),10000);probe.onloadedmetadata=()=>{clearTimeout(timer);resolve()};probe.onerror=()=>{clearTimeout(timer);reject(Error('Vídeo incompatible.'))}});if(!Number.isFinite(probe.duration)||probe.duration<=0||probe.duration>60)throw Error('Elige un clip con duración conocida, de hasta 60 segundos.');record={id:'local-'+hash.slice(0,24),title:file.name,fileName:file.name,sha256:hash,duration:probe.duration,view:'unknown',timing:{fps:null,cfrVerified:false,source:'Browser timestamps'},reference:{status:'draft',reviewer:'',notes:'Nuevo vídeo: confirmar vista DTL y marcar las fases.',phases:{}},revisions:[],results:{}};record.seedReference=C.clone(record.reference)}finally{probe.removeAttribute('src');probe.load();URL.revokeObjectURL(url)}}
    await S.save(record,file);if(!state.records.some(r=>r.id===record.id))state.records.push(record);renderLibrary();return record.id;
  }
  async function analyzeLocal(){
    if(state.busy||!state.file||video.readyState<2)return status('Primero carga el archivo y espera a que el vídeo esté listo.',true);
    if(current().view!=='dtl')return status('Este candidato está limitado a DTL. No se ha validado para Face on.',true);
    const id=state.id,started=performance.now();state.controller=new AbortController();lock(true);$('progress').value=0;
    try{
      const result=await SwingLabLocal.analyze(state.file,{view:'DTL',signal:state.controller.signal,onProgress:(message,percent)=>{status(message);$('progress').value=percent}});
      if(state.controller.signal.aborted)throw new DOMException('Cancelado','AbortError');
      result.totalMs=performance.now()-started;result.measuredAt=new Date().toISOString();const record=C.clone(current());if(record.results?.local){record.resultHistory=record.resultHistory||[];record.resultHistory.push({key:'local',result:record.results.local})}record.results={...record.results,local:result};record.timing=result.timing;await S.save(record);if(state.id===id){updateRecord(record);renderComparison();status(result.status==='rejected'?'El candidato ha rechazado este vídeo: '+result.note:result.status==='needs-segment'?'No se pudo aislar el swing. Delimita el tramo en la app principal o marca las fases manualmente.':`Propuestas guardadas. Tiempo total: ${(result.totalMs/1000).toFixed(1)} s. Revisa las cinco fases.`)}
    }catch(error){status(error.name==='AbortError'?'Proceso cancelado. Los resultados anteriores se conservan.':error.message,true)}finally{state.controller=null;lock(false);renderComparison()}
  }
  function parseGlab(payload){
    if(payload?.ok===false)throw Error(payload.error||'GLAB no considera válido el análisis.');
    const row=payload.rows?.[0]||payload,source=row.phases||row.pred_phases,phases={};if(!source||typeof source!=='object')throw Error('El resultado GLAB no contiene fases en segundos.');
    for(const phase of C.PHASES){const value=source[phase.id]??source[phase.id[0].toUpperCase()+phase.id.slice(1)];if(value!=null){if(!Number.isFinite(value)||value<0||value>current().duration)throw Error('GLAB devuelve una fase fuera del vídeo.');phases[phase.id]=value}}
    if(!Object.keys(phases).length)throw Error('No hay fases GLAB reconocibles.');
    return {id:row.engine_version||row.source||'glab-import',status:'needs-review',phases,window:row.window||null,sampling:row.debug||null,checkpointSha256:row.checkpointSha256||null,measuredAt:new Date().toISOString(),note:'Propuestas de GLAB; no son una referencia revisada.'};
  }
  async function saveGlab(payload){const record=C.clone(current());record.results={...record.results,glab:parseGlab(payload)};await S.save(record);updateRecord(record);renderComparison()}
  async function analyzeGlab(){
    if(state.busy||!state.file)return status('Carga el archivo antes de enviarlo a GLAB.',true);
    let base;try{const url=new URL($('engine-url').value.trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();base=url.href.replace(/\/+$/,'').replace(/\/api(?:\/(?:health|analyze))?$/,'')}catch{return status('Introduce la URL HTTP(S) base del servicio GLAB, sin credenciales ni parámetros.',true)}
    state.controller=new AbortController();const timer=setTimeout(()=>state.controller?.abort(),60000);lock(true);status('Enviando este vídeo al servicio GLAB seleccionado…');
    try{const form=new FormData();form.append('file',state.file,state.file.name);form.append('view',current().view);form.append('num_frames','48');form.append('image_size','144');form.append('use_motion_window','true');const response=await fetch(base+'/api/analyze',{method:'POST',body:form,signal:state.controller.signal,credentials:'omit'});const payload=await response.json();if(!response.ok)throw Error(payload.error||payload.detail||`GLAB respondió HTTP ${response.status}`);await saveGlab(payload);status('Resultado GLAB guardado por separado. La referencia no ha cambiado.')}catch(error){status(error.name==='AbortError'?'Envío cancelado o fuera de tiempo. Se conserva el resultado anterior.':String(error.message),true)}finally{clearTimeout(timer);state.controller=null;lock(false);renderComparison()}
  }
  async function loadPrivate(){
    if(state.busy||!safeLeave())return;const original=state.id;lock(true);let loaded=0;
    try{
      if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))throw Error('Las muestras privadas están en tu equipo. Abre el laboratorio local o importa su manifest.json y selecciona los vídeos con «Abrir vídeos».');
      const response=await fetch('../__lab/manifest.json',{cache:'no-store'});if(!response.ok)throw Error('No se encuentra la carpeta privada. Abre el laboratorio con el servidor local y la carpeta de referencias.');
      const records=C.normalizeImport(await response.json());
      for(const seed of records){const existing=state.records.find(r=>r.id===seed.id);if(existing&&existing.sha256!==seed.sha256)throw Error('La muestra privada no coincide con el vídeo guardado.');if(!existing){seed.seedReference=C.clone(seed.reference);await S.save(seed);state.records.push(seed)}else if(JSON.stringify(seed.reference)!==JSON.stringify(existing.reference)&&Date.parse(seed.reference.updatedAt)>Date.parse(existing.reference.updatedAt||existing.updatedAt||'1970-01-01')){const retained=C.clone(existing);retained.incomingReference=C.clone(seed.reference);retained.incomingReviewMetadata={referenceReconciliation:seed.referenceReconciliation||null,sourceGroup:seed.sourceGroup||seed.id};await S.save(retained);updateRecord(retained)}}renderLibrary();
      for(const record of records){status(`Cargando muestra privada ${loaded+1}/${records.length}…`);const media=await fetch('../__lab/private/'+encodeURIComponent(record.id));if(!media.ok)throw Error('No se pudo cargar una muestra privada.');const file=new File([await media.blob()],record.fileName,{type:media.headers.get('Content-Type')||'video/mp4'});await loadFile(file,record.id,true);loaded++;}
      state.dirty=false;status(`${loaded} vídeos privados guardados en este navegador.`);
    }catch(error){status(error.message,true)}finally{lock(false);await openRecord(original||state.records[0]?.id)}
  }
  async function importPack(file){
    if(!file||state.busy||!safeLeave())return;if(file.size>15*1024*1024)throw Error('El JSON supera 15 MB.');const records=C.normalizeImport(JSON.parse(await file.text()));
    for(const record of records){const previous=state.records.find(r=>r.id===record.id);if(previous&&previous.sha256!==record.sha256)throw Error('El archivo intenta cambiar el vídeo de una referencia existente.');if(previous){record.seedReference=C.clone(previous.seedReference||previous.reference);record.revisions=[...(previous.revisions||[]),{version:(previous.revisions||[]).length+1,savedAt:new Date().toISOString(),reference:C.clone(previous.reference)},...(record.revisions||[])]}}
    await S.import(records);for(const record of records){if(state.records.some(r=>r.id===record.id))updateRecord(record);else state.records.push(record)}state.dirty=false;renderLibrary();await openRecord(state.id||records[0]?.id);status(`${records.length} referencias importadas. Las predicciones y los vídeos mantienen su identidad.`);
  }
  async function setupOffline(){
    if(!('serviceWorker'in navigator))return status('Este navegador no permite preparar el laboratorio sin conexión.',true);
    $('offline').disabled=true;status('Descargando y conservando modelo y runtime en este dispositivo…');
    try{
      const registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      if(!registration.active)await new Promise((resolve,reject)=>{
        const worker=registration.installing||registration.waiting;
        if(!worker)return reject(Error('No se pudo iniciar la preparación.'));
        const timer=setTimeout(()=>reject(Error('La preparación está tardando. Reabre el laboratorio y vuelve a intentarlo.')),60000);
        const inspect=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve()}if(worker.state==='redundant'){clearTimeout(timer);reject(Error('No se pudieron conservar los recursos. Comprueba el espacio disponible.'))}};
        worker.addEventListener('statechange',inspect);inspect();
      });
      status('Recursos preparados. Los vídeos guardados y el candidato pueden usarse sin conexión.');$('offline').textContent='Preparado sin conexión';
    }catch(error){status(error.message,true)}finally{$('offline').disabled=false}
  }
  async function init(){
    for(const phase of C.PHASES){const item=document.createElement('article');item.append(text('strong',phase.label),text('p',phase.definition));$('definitions').append(item);const button=text('button',phase.id==='takeaway'?'Takeaway':phase.label);button.type='button';button.dataset.phase=phase.id;button.onclick=()=>{if(state.busy)return;captureFields();state.phase=phase.id;renderPhase();const target=state.draft?.phases?.[phase.id]?.time;if(state.file&&Number.isFinite(target)){video.pause();video.currentTime=Math.min(video.duration-.001,target)}};$('phase-tabs').append(button)}
    const response=await fetch('./references.json'),pack=await response.json(),seeds=C.normalizeImport(pack),existing=await S.all(),ids=new Set(existing.map(r=>r.id));for(const seed of seeds)if(!ids.has(seed.id)){seed.seedReference=C.clone(seed.reference);await S.save(seed);existing.push(seed)}state.records=existing;renderLibrary();if(existing.length)await openRecord(existing[0].id);status('Abre tus vídeos o carga las referencias privadas desde este equipo. Las referencias reales requieren revisión.');
  }
  $('record').onchange=()=>openRecord($('record').value);$('load-private').onclick=loadPrivate;
  $('record-view').onchange=async()=>{if(state.busy||!current())return;const record=C.clone(current());record.view=$('record-view').value;lock(true);try{await S.save(record);updateRecord(record);$('view-label').textContent=record.view==='dtl'?'Down the line':'Vista no compatible con este candidato';status('Vista guardada. Los resultados anteriores conservan su procedencia; vuelve a ejecutar si cambia el contexto.')}catch{status('No se pudo guardar la vista.',true);$('record-view').value=current().view||'unknown'}finally{lock(false)}};
  $('files').onchange=async event=>{if(!safeLeave())return;lock(true);let id;try{for(const file of event.target.files)id=await loadFile(file,undefined,true);state.dirty=false;status('Vídeos vinculados por su huella SHA-256. No se han enviado a ningún servidor.')}catch(error){status(error.message,true)}finally{lock(false);event.target.value='';if(id)await openRecord(id)}};
  $('import').onchange=async event=>{try{await importPack(event.target.files[0])}catch(error){status(error.message,true)}finally{event.target.value=''}};
  $('import-glab').onchange=async event=>{try{const file=event.target.files[0];if(!file||!current()||state.busy)return;if(file.size>5*1024*1024)throw Error('Resultado demasiado grande.');const payload=JSON.parse(await file.text());if(payload.sha256!==current().sha256)throw Error('El resultado necesita sha256 igual a la huella de este vídeo. Utiliza el exportador GLAB del laboratorio.');if(payload.protocol!==C.PROTOCOL)throw Error('El resultado usa otro protocolo.');await saveGlab(payload.result||payload);status('Resultado GLAB importado para el vídeo verificado.')}catch(error){status(error.message,true)}finally{event.target.value=''}};
  $('export').onclick=()=>{if(state.dirty)status('Se exporta la última versión guardada. Guarda primero si quieres incluir los cambios pendientes.');exportFile('swinglab-references-'+new Date().toISOString().slice(0,10)+'.json',{schema:1,protocol:C.PROTOCOL,records:state.records})};
  $('reference-form').onsubmit=event=>{event.preventDefault();saveReference(true)};$('save-draft').onclick=()=>saveReference(false);
  for(const id of ['mark-time','range-start','range-end','reason','reviewer','notes'])$(id).oninput=()=>{captureFields();changed()};
  $('mark-now').onclick=()=>{if(!state.file||video.readyState<2)return status('Carga el vídeo antes de marcar.',true);video.pause();$('mark-time').value=video.currentTime.toFixed(6);$('range-start').value='';$('range-end').value='';captureFields();changed()};
  $('clear-mark').onclick=()=>{$('mark-time').value='';$('range-start').value='';$('range-end').value='';captureFields();changed()};
  $('negative').onchange=()=>{state.draft.phases=$('negative').checked?{}:C.clone(current().reference.phases||{});state.draft.status=$('negative').checked?'negative':'draft';changed();renderPhase()};
  $('restore-seed').onclick=()=>{if(state.busy||!current())return;state.draft=C.clone(current().seedReference||current().reference);state.draft.status=state.draft.status==='negative'?'negative':'draft';changed();renderReference()};
  $('run-local').onclick=analyzeLocal;$('run-glab').onclick=analyzeGlab;$('cancel').onclick=()=>state.controller?.abort();$('offline').onclick=setupOffline;
  const step=direction=>{if(!state.file||state.busy)return;video.pause();video.currentTime=Math.max(0,Math.min(video.duration-.001,SwingLabVideo.step(current()?.timing,video.currentTime,direction,video.duration)))};
  $('back').onclick=()=>step(-1);$('forward').onclick=()=>step(1);$('play').onclick=()=>{if(!state.file)return;if(video.paused)video.play().catch(()=>status('El navegador no puede reproducir este archivo.',true));else video.pause()};$('speed').onchange=()=>{video.playbackRate=Number($('speed').value)};
  $('timeline').oninput=()=>{if(state.file&&!state.busy){video.pause();video.currentTime=Number($('timeline').value)}};
  video.addEventListener('loadedmetadata',()=>{if(!Number.isFinite(video.duration))return;$('timeline').max=video.duration;$('duration').textContent=time(video.duration);updateTime()});for(const name of ['timeupdate','play','pause'])video.addEventListener(name,updateTime);video.addEventListener('error',()=>{if(state.file)status('No se pudo decodificar el vídeo. Prueba otro formato compatible.',true)});
  document.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select,button,summary')||state.busy)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1)}if(event.code==='Space'){event.preventDefault();$('play').click()}});
  window.addEventListener('beforeunload',event=>{if(state.dirty||state.busy){event.preventDefault();event.returnValue=''}});
  init().catch(error=>status('No se pudo iniciar el laboratorio: '+error.message,true));
})();
