const {test}=require('node:test'),assert=require('node:assert/strict'),H=require('../lab/hybrid-core.js');
const fs=require('node:fs'),path=require('node:path');
test('automatic selection chooses audio by model proximity, asks for input on disagreement',()=>{
 const model={phases:{impact:3}};
 assert.equal(H.select(model,{candidates:[{time:5},{time:3.1}]},8).anchor,3.1);
 assert.equal(H.select(model,{candidates:[{time:5}]},8).status,'needs-impact');
 assert.equal(H.select(model,{candidates:[]},8).status,'needs-impact');
 assert.equal(H.select({status:'rejected'},null,8).status,'needs-impact');
 assert.equal(H.select(model,{candidates:[{time:NaN},{time:9}]},8).status,'needs-impact');
});
test('explicit user impact takes precedence and preserves provenance',()=>{
 const x=H.select({phases:{impact:3}},{candidates:[{time:3.1}]},8,4.2);
 assert.equal(x.anchor,4.2);assert.equal(x.source,'user-impact');
 for(const t of [NaN,-1,0,8,9])assert.throws(()=>H.select(null,null,8,t));
});
test('hard anchor overrides a much stronger competing event, without moving user impact',()=>{
 const times=Array.from({length:48},(_,i)=>i/12),logits=new Float32Array(48*8);
 logits[35*8+5]=10000;
 const r=H.decode(logits,times,2.12);
 assert.equal(r.impact,2.12);assert.ok(r.top<r.impact&&r.finish>r.impact);
 assert.ok(r.address<r.takeaway&&r.takeaway<r.top);
});
test('decoding rejects duplicate-time ordering, malformed logits and outside anchors',()=>{
 assert.throws(()=>H.decode(new Float32Array(64),Array(8).fill(1),1));
 assert.throws(()=>H.decode(new Float32Array(8),[0,1,2,3,4,5,6,7],3));
 assert.throws(()=>H.decode(new Float32Array(64),[0,1,2,3,4,5,6,7],9));
});
test('impact window clips to video boundaries without inferring playback speed',()=>{
 assert.equal(H.window(.5,8).start,0);assert.equal(H.window(7.9,8).end,8);
 assert.throws(()=>H.window(0,8));
});
test('anchor retains a containing motion window and selects a later burst if needed',()=>{
 const model={window:{start:1,end:3,alternatives:[{start:6,end:8}]}};
 assert.equal(H.segment(model,[],2,10).start,1);
 assert.equal(H.segment(model,[],7,10).start,6);
 assert.equal(H.segment(model,[],9,10).method,'experimental-impact-window');
 const edge=H.segment({window:{start:1,end:3}},[],1.01,10);
 assert.ok(edge.start<=.411);
});
const parity=path.resolve(__dirname,'../../audit/hybrid-decoder-parity.json');
test('browser anchored decoder matches Python on actual frozen-model logits',{skip:!fs.existsSync(parity)},()=>{
 const p=JSON.parse(fs.readFileSync(parity,'utf8')),actual=H.decode(p.logits,p.times,p.anchor);
 assert.deepEqual(actual,p.expected);
});
