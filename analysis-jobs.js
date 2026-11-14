/* One visible, session-bound task per engine. Navigation never owns the result. */
(()=>{'use strict';
 const jobs=new Map();let serial=0,panel;
 function render(){
  if(!panel){panel=document.createElement('aside');panel.id='analysisTasks';panel.className='analysis-tasks';panel.setAttribute('aria-label','Análisis en curso');document.body.append(panel)}
  panel.replaceChildren();panel.hidden=!jobs.size;
  for(const job of jobs.values()){
   const row=document.createElement('article');row.className='analysis-task';row.dataset.status=job.status;
   if(job.image){const img=document.createElement('img');img.src=job.image;img.alt='Swing en análisis';row.append(img)}
   const content=document.createElement('div'),title=document.createElement('strong'),status=document.createElement('span');title.textContent=job.title;status.textContent=job.message;status.setAttribute('role','status');content.append(title,status);row.append(content);
   const open=document.createElement('button');open.type='button';open.textContent=job.status==='done'?'Ver informe':job.status==='error'?'Revisar':'Ver vídeo';open.onclick=()=>job.open?.(job.status);row.append(open);
   if(job.status!=='running'){const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='analysis-task-dismiss';dismiss.textContent='×';dismiss.setAttribute('aria-label','Ocultar estado del análisis');dismiss.onclick=()=>{jobs.delete(job.key);render()};row.append(dismiss)}
   panel.append(row);
  }
 }
 window.SwingLabJobs={
  start({session,kind,image,open}){const key=kind+'-'+(++serial);jobs.set(key,{key,sessionId:session.id,title:session.title||'Tu swing',kind,image:image||session.thumb,status:'running',message:kind==='local'?'Buscando las fases en tu dispositivo…':'ChatGPT está revisando los fotogramas…',open});render();return key},
  update(key,message){const j=jobs.get(key);if(j){j.message=message;render()}},
  finish(key,error){const j=jobs.get(key);if(j){j.status=error?'error':'done';j.message=error||'Informe guardado · listo para revisar';render()}},
  active(id){return [...jobs.values()].some(j=>j.sessionId===id&&j.status==='running')},
  get running(){return [...jobs.values()].some(j=>j.status==='running')}
 };
 addEventListener('beforeunload',e=>{if(window.SwingLabJobs.running){e.preventDefault();e.returnValue=''}});
})();
