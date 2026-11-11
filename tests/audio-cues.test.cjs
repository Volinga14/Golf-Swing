const test=require('node:test'),assert=require('node:assert/strict'),{candidates}=require('../lab/audio-cues.js');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
test('audio evidence rejects silence and keeps transient candidates unconfirmed',()=>{
 assert.deepEqual(candidates(new Float32Array(32000)),[]);
 const samples=new Float32Array(32000);for(let i=16000;i<16160;i++)samples[i]=i%2?.8:-.8;
 const result=candidates(samples);assert.equal(result.length,1);assert.ok(Math.abs(result[0].time-1)<.02);assert.equal(result[0].status,'needs-review');
});
const privateRoot=path.resolve(__dirname,'../../audit'),comparison=path.join(privateRoot,'local-alternatives-20261023.json');
test('real user recordings yield reviewable impact cues using the browser audio algorithm',{skip:!fs.existsSync(comparison)},()=>{
 const records=JSON.parse(fs.readFileSync(comparison,'utf8')).records;
 for(const id of ['user-1','user-2','user-3']){
  const file=path.join(privateRoot,'reviewed-corpus',id+'.mp4');if(!fs.existsSync(file))continue;
  const raw=spawnSync('ffmpeg',['-v','error','-i',file,'-vn','-ac','1','-ar','16000','-f','f32le','-'],{maxBuffer:16*1024*1024});assert.equal(raw.status,0,raw.stderr?.toString());
  const buffer=raw.stdout,samples=new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length)),actual=candidates(samples),reference=records.find(r=>r.id===id).reference.impact;
  assert.ok(actual.length>0);assert.ok(Math.abs(actual[0].time-reference)<.1,`${id}: ${actual[0].time} vs ${reference}`);
 }
});
test('audio evidence returns at most three distinct cues and validates sample rates',()=>{
 const samples=new Float32Array(64000);for(const start of [8000,16000,32000,48000])for(let j=0;j<160;j++)samples[start+j]=j%2?.5:-.5;
 const result=candidates(samples);assert.equal(result.length,3);assert.ok(result.every((r,i)=>result.slice(i+1).every(other=>Math.abs(r.time-other.time)>.25)));
 assert.throws(()=>candidates(samples,0),/Invalid/);
});
