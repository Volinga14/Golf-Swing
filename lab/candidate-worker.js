'use strict';
importScripts('./core.js','./hybrid-core.js','./vendor/ort.wasm.min.js');
let encoder,temporal;
async function initialize(){
  if(encoder&&temporal)return;
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=new URL('./vendor/',self.location.href).href;
  if(typeof DecompressionStream==='undefined')throw Error('Este navegador no admite la descompresión del motor. Prueba una versión reciente.');
  const metadata=await (await fetch('./vendor/runtime.json')).json();
  const parts=await Promise.all(metadata.parts.map(async part=>{const response=await fetch('./vendor/'+part.name);if(!response.ok)throw Error('Falta un recurso del motor.');return response.blob()}));
  const binary=await new Response(new Blob(parts).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',binary))).map(x=>x.toString(16).padStart(2,'0')).join('');
  if(binary.byteLength!==metadata.uncompressedBytes||hash!==metadata.sha256)throw Error('La copia del runtime está incompleta. Vuelve a preparar el modo sin conexión.');
  ort.env.wasm.wasmBinary=binary;
  const options={executionProviders:['wasm'],graphOptimizationLevel:'all'};
  encoder=await ort.InferenceSession.create(new URL('./models/encoder.onnx',self.location.href).href,options);
  temporal=await ort.InferenceSession.create(new URL('./models/temporal.onnx',self.location.href).href,options);
}
self.onmessage=async event=>{
  const {id,type}=event.data;
  try{
    if(type==='parity'){
      await initialize();const image=Float32Array.from({length:3*144*144},(_,i)=>Math.fround(Math.fround((i%97)/97)*2-1)),features=Float32Array.from({length:48*96},(_,i)=>Math.fround(Math.fround((i%89)/89)*2-1));
      const a=await encoder.run({image:new ort.Tensor('float32',image,[1,3,144,144])});const b=await temporal.run({features:new ort.Tensor('float32',features,[1,48,96])});
      self.postMessage({id,type:'parity',encoder:Array.from(a.features.data),temporal:Array.from(b.logits.data)});return;
    }
    if(type!=='analyze')throw Error('Operación desconocida.');
    const {frames,times,window,anchor}=event.data;
    if(!Array.isArray(frames)||frames.length!==48||times.length!==48||frames.some(frame=>frame.byteLength!==144*144*4))throw Error('Muestreo incompatible.');
    await initialize();const started=performance.now(),features=new Float32Array(48*96),plane=144*144,mean=[.485,.456,.406],std=[.229,.224,.225];
    for(let frame=0;frame<48;frame++){
      const rgba=new Uint8ClampedArray(frames[frame]),input=new Float32Array(3*plane);
      for(let p=0;p<plane;p++)for(let c=0;c<3;c++)input[c*plane+p]=(rgba[p*4+c]/255-mean[c])/std[c];
      const output=await encoder.run({image:new ort.Tensor('float32',input,[1,3,144,144])});features.set(output.features.data,frame*96);
      self.postMessage({id,type:'progress',value:frame+1});
    }
    const output=await temporal.run({features:new ort.Tensor('float32',features,[1,48,96])});
    const phases=Number.isFinite(anchor)?SwingLabHybrid.decode(output.logits.data,times,anchor):MarkingCore.decode(output.logits.data,times);
    self.postMessage({id,type:'result',result:{id:'local-mark-v0.1',status:'needs-review',phases,window,inferenceMs:performance.now()-started,sampling:{frames:48,imageSize:144},note:'Mismos pesos que GLAB. Propuestas no calibradas: confirmar cada fase.'}});
  }catch(error){self.postMessage({id,type:'error',message:String(error.message||error)})}
};
