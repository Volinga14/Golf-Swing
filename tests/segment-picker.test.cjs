const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../segment-picker.js'),L=require('../learning.js');
test('trim never permits reversed, non-finite, too short or out-of-video intervals',()=>{
 for(const value of [{start:4,end:3},{start:0,end:.49},{start:-1,end:2},{start:0,end:11},{start:NaN,end:4},{start:0,end:Infinity}])assert.equal(S.normalize(value,10),null);
 assert.deepEqual(S.normalize({start:1,end:1.5},10),{start:1,end:1.5});
});
test('moving either handle cannot cross the other and preserves at least half a second',()=>{
 assert.deepEqual(S.move({start:2,end:5},'start',9,10),{start:4.5,end:5});
 assert.deepEqual(S.move({start:2,end:5},'end',0,10),{start:2,end:2.5});
 assert.deepEqual(S.move({start:2,end:5},'start',-4,10),{start:0,end:5});
 assert.deepEqual(S.move({start:2,end:5},'end',20,10),{start:2,end:10});
 assert.equal(S.move(null,'start',0,.2),null);
});
test('saved trim remains on the original timeline and does not alter phases or manual impact',()=>{
 const input={duration:10,videoSha256:'a'.repeat(64),phases:{Impact:4},analysisRange:{start:2,end:6,unexpected:'excluded'}};
 const result=L.normalize(input);assert.deepEqual(result.analysisRange,{start:2,end:6});assert.equal(input.phases.Impact,4);
 assert.equal(L.normalize({...input,analysisRange:{start:6,end:2}}).analysisRange,null);
 assert.equal(L.normalize({...input,analysisRange:null}).analysisRange,null);
 assert.equal(L.normalize({...input,duration:0}).analysisRange,null);
});
test('trim controls become available again after a seek lowers media readiness',()=>{
 const previous=global.document,nodes=new Map(),listeners=new Map();
 const element=()=>({value:'',checked:false,disabled:true,textContent:'',setAttribute(){},addEventListener(){}});
 global.document={getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)},addEventListener(){}};
 const video={duration:4,readyState:2,currentTime:0,paused:true,addEventListener(name,fn){listeners.set(name,fn)},pause(){this.paused=true},play(){this.paused=false;return Promise.resolve()}};
 try{
  const api=S.mount({video,getSession:()=>({analysisRange:{start:1,end:2}}),isBusy:()=>false,changed(){}});api.restore();
  assert.equal(nodes.get('resetSegment').disabled,false);
  video.readyState=1;api.sync();assert.equal(nodes.get('resetSegment').disabled,true);
  video.readyState=2;listeners.get('seeked')();assert.equal(nodes.get('resetSegment').disabled,false);
  assert.equal(nodes.get('previewSegment').disabled,false);assert.equal(nodes.get('analysisRangeStart').value,'1');assert.equal(nodes.get('analysisRangeEnd').value,'2');
 }finally{if(previous===undefined)delete global.document;else global.document=previous}
});
