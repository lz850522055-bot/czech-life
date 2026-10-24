import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TileStream,streamPlan} from '../app/public/game/world-stream.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('streaming bounds simultaneous downloads and ready decodes; stale pan requests abort',async()=>{
  const active=new Map(),disposed=[],published=[];
  const stream=new TileStream({concurrency:2,maxReady:3,maxBytes:100,load:(d,signal)=>new Promise((resolve,reject)=>{active.set(d.url,{resolve,reject});signal.addEventListener('abort',()=>{const e=new Error('cancelled');e.name='AbortError';reject(e);});}),publish:(d,data)=>{published.push(d.url);return {value:data,bytes:30};},dispose:x=>disposed.push(x)});
  stream.setPlan(Array.from({length:9},(_,i)=>({url:String(i),priority:i,visible:i<2})));assert.equal(active.size,2);
  active.get('0').resolve({id:0});active.get('1').resolve({id:1});await tick();assert.ok(stream.ready.length+stream.inflight.size<=3);
  stream.setPlan([{url:'next',priority:0,visible:true}]);await tick();assert.ok(stream.stats.aborted>0);assert.equal(disposed.length,2);
  active.get('next').resolve({id:'next'});await tick();stream.upload({max:1});assert.deepEqual(published,['next']);assert.ok(stream.stats.peak_fetches<=2);assert.ok(stream.stats.peak_ready<=3);stream.close();assert.equal(stream.bytes,0);
});
test('LRU releases old textures; invisible prefetch cannot grow residency without bound',async()=>{
  const disposed=[];const stream=new TileStream({concurrency:1,maxReady:1,maxBytes:90,load:async d=>({url:d.url}),publish:(d,v)=>({value:v,bytes:30}),dispose:v=>disposed.push(v.url)});
  for(let i=0;i<12;i++){stream.setPlan([{url:String(i),priority:0,visible:true}]);await tick();stream.upload();assert.ok(stream.bytes<=90);}
  assert.equal(stream.cache.size,3);assert.equal(stream.stats.evicted,9);stream.close();assert.equal(disposed.length,12);
});
test('upload quota spreads GPU publication over frames',async()=>{
  const stream=new TileStream({load:async d=>d,publish:(d,v)=>({value:v,bytes:1}),dispose:()=>{},maxReady:4});stream.setPlan([0,1,2,3].map(n=>({url:String(n),priority:n})));await tick();assert.equal(stream.upload({max:1}),1);assert.equal(stream.cache.size,1);assert.equal(stream.ready.length,3);stream.close();
});
test('a failed visible tile retries automatically without requiring another drag',async()=>{
  let calls=0;const stream=new TileStream({retryMs:20,load:async()=>{if(++calls===1)throw new Error('temporary connection failure');return {ok:true};},publish:(d,v)=>({value:v,bytes:1}),dispose:()=>{}});stream.setPlan([{url:'recover',priority:0,visible:true}]);await new Promise(r=>setTimeout(r,60));stream.upload();assert.equal(calls,2);assert.equal(stream.cache.size,1);stream.close();
});
test('a visible destination preempts lower-priority neighbor prefetch',async()=>{
  const requests=new Map();const stream=new TileStream({concurrency:1,load:(d,signal)=>new Promise((resolve,reject)=>{requests.set(d.url,signal);signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')));}),publish:()=>({}),dispose:()=>{}});stream.setPlan([{url:'neighbor',priority:1000,visible:false}]);stream.setPlan([{url:'now',priority:1,visible:true},{url:'neighbor',priority:1000,visible:false}]);await tick();assert.ok(requests.get('neighbor').aborted);assert.ok(requests.has('now'));stream.close();
});
const manifest=JSON.parse(fs.readFileSync(new URL('../app/public/game/stream-v1/manifest.json',import.meta.url)));
test('city plan only requests nearby chunks, visible art mips, and bounded prefetch',()=>{
  const view={x:-1733,y:-1478,zoom:1.9,width:600,height:480},p=streamPlan(manifest,view,{dpr:2,vx:400,vy:0});assert.ok(p.some(t=>t.url.includes('/scenes/')));assert.ok(p.some(t=>!t.visible));assert.ok(p.length<40);assert.equal(p[0].order,0);assert.ok(p.filter(t=>t.url.includes('/base/')).length<12);
  assert.ok(p.reduce((n,d)=>n+Math.ceil(d.pixelWidth*d.pixelHeight*4*7/3),0)<=48*1024*1024);
  for(const d of p.filter(d=>d.url.includes('/scenes/')))assert.ok(d.pixelWidth<=514&&d.pixelHeight<=514);
  const far=streamPlan(manifest,{...view,x:18000,y:15000});assert.ok(!far.some(t=>t.url.includes('/scenes/')));
});
test('whole-city zoom uses overview without requesting the entire city',()=>{
  const p=streamPlan(manifest,{x:0,y:0,zoom:.02,width:1280,height:800});assert.equal(p.filter(t=>t.url.includes('/base/')||t.url.includes('/detail/')).length,0);assert.ok(p.length<12);
});
