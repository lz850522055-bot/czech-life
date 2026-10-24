import test from 'node:test';
import assert from 'node:assert/strict';
import {playCzech,stopAudio,isBundledCzechAudio} from '../app/public/audio.js';
function browser(t,voices){
  const originals=new Map(),spoken=[];
  function set(name,value){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}
  const speech={getVoices:()=>voices,cancel(){},speak:u=>spoken.push(u)};
  set('window',{speechSynthesis:speech});set('speechSynthesis',speech);set('navigator',{onLine:true});set('SpeechSynthesisUtterance',class {constructor(text){this.text=text;}});
  t.after(()=>{stopAudio();for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {spoken,set};
}
test('Czech fallback voice only marks listening after actual speech start',async t=>{
  const b=browser(t,[{lang:'cs-CZ',name:'Czech',localService:true}]),statuses=[];let starts=0;
  await playCzech('a',{onStarted:()=>starts++,onStatus:s=>statuses.push(s)});
  assert.equal(starts,0);assert.equal(b.spoken.length,1);assert.equal(b.spoken[0].lang,'cs-CZ');b.spoken[0].onstart();assert.equal(starts,1);assert.match(statuses.at(-1),/^正在播放捷语/);
});
test('missing Czech voice never substitutes English or marks listening started',async t=>{
  const b=browser(t,[{lang:'en-US',name:'English',localService:true}]);let starts=0;
  await playCzech('a',{onStarted:()=>starts++});assert.equal(starts,0);assert.equal(b.spoken.length,0);
});
test('offline network-only Czech voice cannot count as played',async t=>{
  const b=browser(t,[{lang:'cs-CZ',name:'Remote Czech',localService:false}]);navigator.onLine=false;let starts=0;
  await playCzech('a',{onStarted:()=>starts++});assert.equal(starts,0);assert.equal(b.spoken.length,0);
});
test('recorded phonetic file marks start only after Audio.play resolves',async t=>{
  const b=browser(t,[]);let release,starts=0,instance;
  b.set('Audio',class {constructor(src){this.src=src;instance=this;}load(){queueMicrotask(()=>this.onloadedmetadata?.());}play(){return new Promise(resolve=>{release=resolve;});}pause(){}removeAttribute(){}});
  const playing=playCzech('a',{ref:{id:'phonetic-a',status:'generated',file_url:'/assets/phonetics/a-normal.mp3',slow_file:'/assets/phonetics/a-slow.mp3'},onStarted:()=>starts++});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,0);assert.equal(instance.src,'/assets/phonetics/a-normal.mp3');release();await playing;assert.equal(starts,1);
});
test('new authored street clips use the exact bundled file instead of the old lesson asset endpoint',async t=>{
  const b=browser(t,[]);let instance,starts=0;b.set('Audio',class {constructor(src){this.src=src;instance=this;}load(){queueMicrotask(()=>this.onloadedmetadata?.());}async play(){}pause(){}removeAttribute(){}});
  const ref={id:'field-b2b06097b40e32fc',status:'generated',file_url:'/game/audio/field-v1/field-b2b06097b40e32fc-normal.mp3',slow_file:'/game/audio/field-v1/field-b2b06097b40e32fc-slow.mp3'};
  await playCzech('分开的捷语声音',{ref,speed:.8,onStarted:()=>starts++});assert.equal(instance.src,ref.slow_file);assert.equal(starts,1);assert.equal(b.spoken.length,0);
  assert.equal(isBundledCzechAudio({...ref,file_url:'https://outside.example/audio.mp3'}),false);assert.equal(isBundledCzechAudio({...ref,slow_file:'/game/audio/field-v1/field-0000000000000000-slow.mp3'}),false);
});
test('unreadable bundled clips never synthesize their Chinese descriptive label as Czech speech',async t=>{
  const b=browser(t,[{lang:'cs-CZ',name:'Czech',localService:true}]),statuses=[];let starts=0;b.set('Audio',class {load(){queueMicrotask(()=>this.onerror?.());}pause(){}removeAttribute(){}});
  await playCzech('分开的捷语声音',{ref:{id:'field-b2b06097b40e32fc',status:'generated',file_url:'/game/audio/field-v1/field-b2b06097b40e32fc-normal.mp3',slow_file:'/game/audio/field-v1/field-b2b06097b40e32fc-slow.mp3'},onStarted:()=>starts++,onStatus:s=>statuses.push(s)});
  assert.equal(starts,0);assert.equal(b.spoken.length,0);assert.match(statuses.at(-1),/暂时未能读取/);
});
