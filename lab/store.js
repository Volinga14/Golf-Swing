(function(root){
  'use strict';let database;
  function open(){return database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open('swinglab-marking-lab',1);r.onupgradeneeded=()=>{r.result.createObjectStore('records');r.result.createObjectStore('videos')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>{database=null;reject(r.error)}}))}
  async function transaction(names,mode,operation){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(names,mode);let result;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('Operación cancelada.'));tx.onerror=()=>{};try{operation(tx,value=>{result=value})}catch(error){tx.abort();reject(error)}})}
  root.MarkingStore={
    all:()=>transaction(['records'],'readonly',(tx,done)=>{tx.objectStore('records').getAll().onsuccess=e=>done(e.target.result)}),
    save:(record,video)=>transaction(['records','videos'],'readwrite',tx=>{tx.objectStore('records').put(record,record.id);if(video)tx.objectStore('videos').put(video,record.id)}),
    video:id=>transaction(['videos'],'readonly',(tx,done)=>{tx.objectStore('videos').get(id).onsuccess=e=>done(e.target.result||null)}),
    import:records=>transaction(['records'],'readwrite',tx=>{for(const record of records)tx.objectStore('records').put(record,record.id)})
  };
})(globalThis);
