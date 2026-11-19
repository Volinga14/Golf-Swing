const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function environment(black=false){
 let current,closed=0,revoked=0;const seeks=[];
 const video={duration:6,videoWidth:120,videoHeight:240,readyState:2,seeking:false,listeners:{},
  addEventListener(n,f){(this.listeners[n]||=[]).push(f)},removeEventListener(n,f){this.listeners[n]=(this.listeners[n]||[]).filter(x=>x!==f)},
  pause(){},load(){},removeAttribute(){closed++},
  set src(v){queueMicrotask(()=>this.onloadeddata?.())},
  set currentTime(t){current=t;seeks.push(t);queueMicrotask(()=>{for(const f of [...this.listeners.seeked||[]])f()})},get currentTime(){return current??0}};
 const ctx={drawImage(){},getImageData(){return {data:new Uint8ClampedArray(120*240*4).fill(black||current<.01?0:170)}}};
 const canvas={getContext:()=>ctx,toDataURL:()=> 'data:image/jpeg;base64,'+Buffer.from('source frame '+current).toString('base64')};
 const context={document:{createElement:n=>n==='video'?video:canvas},URL:{createObjectURL:()=> 'blob:private',revokeObjectURL(){revoked++}},DOMException,setTimeout,clearTimeout,Float32Array,Uint8ClampedArray,DataView,ArrayBuffer,AbortController};context.globalThis=context;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../video-tools.js'),'utf8'),context);
 return {api:context.SwingLabVideo,seeks,get closed(){return closed},get revoked(){return revoked}};
}
test('preview seeks inside the source clip and preserves aspect ratio',async()=>{
 const e=environment(),result=await e.api.thumbnail({size:100});
 assert.match(Buffer.from(result.split(',')[1],'base64').toString(),/source frame 3/);
 assert.equal(e.seeks[0],3);assert.equal(e.closed,1);assert.equal(e.revoked,1);
});
test('black first frames are retried and never become the permanent preview',async()=>{
 const e=environment(),result=await e.api.thumbnail({size:100},{time:0});
 assert.ok(result);assert.ok(e.seeks.length>1);assert.ok(e.seeks.at(-1)>.01);assert.equal(e.closed,1);
});
test('unusable footage yields no fabricated stock preview and releases its source',async()=>{
 const e=environment(true);assert.equal(await e.api.thumbnail({size:100}),null);
 assert.equal(e.seeks.length,3);assert.equal(e.closed,1);assert.equal(e.revoked,1);
});
test('a canceled thumbnail request does not open source media',async()=>{
 const e=environment(),c=new AbortController();c.abort();
 await assert.rejects(e.api.thumbnail({size:100},{signal:c.signal}),{name:'AbortError'});
 assert.equal(e.seeks.length,0);assert.equal(e.revoked,0);
});
