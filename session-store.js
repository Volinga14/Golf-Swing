/* Sessions and original videos are committed in the same IndexedDB transaction. */
(() => {
  'use strict';
  const LEGACY_KEY = 'swinglab_history_v19';
  const PHASES = ['Address', 'Takeaway', 'Top', 'Impact', 'Finish'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const image = value => typeof value === 'string' &&
    (/^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value) || value === 'assets/analysis-thumb.webp') ? value : '';

  function normalize(value) {
    if (!value || typeof value !== 'object' || !/^[\w-]{1,100}$/.test(String(value.id || ''))) return null;
    const phases = {}, captures = {};
    for (const phase of PHASES) {
      const time = value.phases?.[phase];
      if (typeof time === 'number' && Number.isFinite(time) && time >= 0) {
        phases[phase] = time;
        const capture = image(value.captures?.[phase]);
        if (capture) captures[phase] = capture;
      }
    }
    const drawings = Array.isArray(value.drawings) ? value.drawings.filter(shape => {
      if (!shape || !['line', 'angle', 'circle', 'box', 'free'].includes(shape.type)) return false;
      if (!/^#[a-f0-9]{6}$/i.test(shape.color || '') || !Number.isFinite(shape.width) || shape.width < 1 || shape.width > 20) return false;
      const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
      if (shape.type === 'free') return Array.isArray(shape.points) && shape.points.length <= 10000 && shape.points.every(point);
      return ['x1', 'y1', 'x2', 'y2', ...(shape.type === 'angle' ? ['x3', 'y3'] : [])].every(key => Number.isFinite(shape[key]));
    }).slice(0, 1000).map(clone) : [];
    return {
      version: 1, id: String(value.id), title: String(value.title || 'Swing session'),
      fileName: String(value.fileName || ''), club:typeof value.club==='string'?value.club.slice(0,60):'',
      date: Number.isFinite(Date.parse(value.date)) ? value.date : new Date().toISOString(),
      phases, captures, notes: typeof value.notes === 'string' ? value.notes : '',
      thumb: image(value.thumb), drawings, captureDrawings:Object.fromEntries(PHASES.filter(p=>captures[p]).map(p=>[p,normalize({id:'capture',drawings:value.captureDrawings?.[p]}).drawings])),
      ...(globalThis.SwingLabLearning?SwingLabLearning.normalize(value):{}),
      ...(globalThis.SwingLabAgent?SwingLabAgent.normalizeState(value):{})
    };
  }

  function createStore() {
    let database;
    function open() {
      if (!database) database = new Promise((resolve, reject) => {
        if (!globalThis.indexedDB) return reject(new Error('Local storage is unavailable in this browser.'));
        const request = indexedDB.open('swinglab-sessions', 2);
        request.onupgradeneeded = () => {
          for (const name of ['sessions', 'videos', 'meta', 'feedback']) if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); database = null; };
          resolve(db);
        };
        request.onerror = () => { database = null; reject(request.error); };
        request.onblocked = () => { database = null; reject(new Error('Close other Swing Lab tabs and try again.')); };
      });
      return database;
    }
    async function transaction(names, mode, run) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(names, mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || new Error('The save was cancelled.'));
        tx.onerror = () => {}; // onabort reports the failed atomic operation.
        try { run(tx, value => { result = value; }); } catch (error) { tx.abort(); reject(error); }
      });
    }
    async function init() {
      let warning = '';
      const migrated = await transaction(['meta'], 'readonly', (tx, done) => {
        tx.objectStore('meta').get('legacy-imported').onsuccess = event => done(event.target.result);
      });
      if (!migrated) {
        let legacy = [];
        try {
          const raw = localStorage.getItem(LEGACY_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) throw new Error('Invalid history');
            legacy = parsed.map(normalize).filter(Boolean);
            if (legacy.length !== parsed.length) warning = 'Some old sessions could not be read. The original history has been kept.';
          }
        } catch {
          warning = 'The old history could not be read. Its original data has been kept.';
        }
        await transaction(['sessions', 'meta'], 'readwrite', tx => {
          for (const session of legacy) tx.objectStore('sessions').put(session, session.id);
          tx.objectStore('meta').put(true, 'legacy-imported');
        });
      }
      return { history: await list(), warning };
    }
    async function list() {
      const values = await transaction(['sessions'], 'readonly', (tx, done) => {
        tx.objectStore('sessions').getAll().onsuccess = event => done(event.target.result);
      });
      return values.map(normalize).filter(Boolean).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    }
    function save(session, video, feedback=[]) {
      const normalized = normalize(session);
      if (!normalized) return Promise.reject(new Error('Invalid session.'));
      return transaction(['sessions', 'videos', 'feedback'], 'readwrite', tx => {
        tx.objectStore('sessions').put(normalized, normalized.id);
        if (video) tx.objectStore('videos').put(video, normalized.id);
        if(feedback.length)tx.objectStore('feedback').get(normalized.id).onsuccess=event=>{try{const images=new Map((event.target.result||[]).map(image=>[image.key,image]));for(const image of feedback){if(!/^[-\w]{1,150}$/.test(image.key)||!(image.blob instanceof Blob)||image.blob.type!=='image/jpeg')throw new Error('Invalid correction image.');images.set(image.key,image)}tx.objectStore('feedback').put([...images.values()],normalized.id)}catch{tx.abort()}};
      });
    }
    function video(id) {
      return transaction(['videos'], 'readonly', (tx, done) => {
        tx.objectStore('videos').get(id).onsuccess = event => done(event.target.result || null);
      });
    }
    function updateThumbnail(id,thumb,expectedSha){
      if(!image(thumb))return Promise.reject(new Error('Invalid thumbnail.'));
      return transaction(['sessions'],'readwrite',tx=>{
        const sessions=tx.objectStore('sessions');sessions.get(id).onsuccess=e=>{
          const current=e.target.result;if(!current||expectedSha&&current.videoSha256!==expectedSha)return;
          sessions.put({...current,thumb},id);
        };
      });
    }
    function remove(id) {
      return transaction(['sessions', 'videos', 'feedback'], 'readwrite', tx => {
        for (const name of ['sessions', 'videos', 'feedback']) tx.objectStore(name).delete(id);
      });
    }
    function clear() {
      return transaction(['sessions', 'videos', 'feedback'], 'readwrite', tx => {
        for (const name of ['sessions', 'videos', 'feedback']) tx.objectStore(name).clear();
      });
    }
    const feedback=id=>transaction(['feedback'],'readonly',(tx,done)=>{tx.objectStore('feedback').get(id).onsuccess=event=>done(event.target.result||[])});
    const references=()=>transaction(['meta'],'readonly',(tx,done)=>{tx.objectStore('meta').get('reviewed-references-v1').onsuccess=e=>done(e.target.result||[])});
    function importReferences(records){
      return transaction(['meta'],'readwrite',(tx,done)=>{const meta=tx.objectStore('meta');meta.get('reviewed-references-v1').onsuccess=e=>{try{const merged=SwingLabReferences.merge(e.target.result||[],records);meta.put(merged,'reviewed-references-v1');done(merged)}catch{tx.abort()}}});
    }
    const practiceJournal=()=>transaction(['meta'],'readonly',(tx,done)=>{tx.objectStore('meta').get('practice-journal-v1').onsuccess=e=>done(SwingLabPractice.normalizeJournal(e.target.result))});
    const recordPractice=entry=>transaction(['meta'],'readwrite',(tx,done)=>{const meta=tx.objectStore('meta');meta.get('practice-journal-v1').onsuccess=e=>{try{const value=SwingLabPractice.addEntry(e.target.result,entry);meta.put(value,'practice-journal-v1');done(value)}catch{tx.abort()}}});
    return { init, list, save, video, remove, clear, feedback, references, importReferences, updateThumbnail,practiceJournal,recordPractice };
  }
  globalThis.SwingLabStorage = { createStore, normalize, clone };
})();
