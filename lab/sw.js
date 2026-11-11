const PREFIX='swinglab-marking-lab:'+new URL(self.registration.scope).pathname+':';
const CACHE=PREFIX+'v9-free-tray';
const FILES=['./hybrid-core.js','./audio-cues.js','./candidate-worker.js?v=40-20261029','./motion.js?v=35-20261023','../video-tools.js?v=35-20261023','../local-engine.js?v=40-20261029','./','./?v=35-20261023','./index.html','./lab.css?v=35-20261023','./lab.js?v=35-20261023','./core.js?v=35-20261023','./store.js?v=35-20261023','./core.js','./candidate-worker.js','./references.json','./models/model.json','./models/encoder.onnx','./models/temporal.onnx','./vendor/ort.wasm.min.js','./vendor/ort-wasm-simd-threaded.mjs','./vendor/runtime.json',...Array.from({length:6},(_,i)=>'./vendor/ort-runtime.gz.'+i)];
const URLS=new Set(FILES.map(file=>new URL(file,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(!URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
