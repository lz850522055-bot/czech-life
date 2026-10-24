import {createRequestCache} from '../app/public/request-cache.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import * as challenge from '../app/public/native-challenge.js';
import {authenticPage,authenticNotes,playNativeSegment} from '../app/public/authentic.js';

const index=JSON.parse(fs.readFileSync(new URL('../content/authentic/manifest.json',import.meta.url),'utf8'));
const clip=index.clips.find(c=>c.id==='public-counterfactual');
const lesson=JSON.parse(fs.readFileSync(new URL('../content/lessons/B2/'+clip.lesson_id+'.json',import.meta.url),'utf8'));
const appSource=fs.readFileSync(new URL('../app/public/app.js',import.meta.url),'utf8');

// Run the actual app functions and click listener in a browser-API fixture.
// Disable only startup IO; do not replace the app's route, save or sync logic.
function appFixture(){
  const listeners=new Map(),nodes=new Map(),values=new Map(),saved=[],queue=[];
  let online=true,sequence=0,flushGate=null;
  const node=()=>({innerHTML:'',textContent:'',className:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},isConnected:true});
  for(const id of ['#app','#sync-state','#toast','#native-challenge-status'])nodes.set(id,node());
  const document={body:{dataset:{}},documentElement:{style:{setProperty(){}}},hidden:false,
    querySelector:s=>values.has(s)?{value:values.get(s)}:nodes.get(s)||null,
    querySelectorAll:()=>[],addEventListener:(type,fn)=>{const group=listeners.get(type)||[];group.push(fn);listeners.set(type,group);}};
  const progress=()=>({notes:saved.map(x=>({...x})),latest:{},reviews:[],skills:{},event_count:0});
  const context=vm.createContext({createRequestCache,...challenge,authenticPage,authenticNotes,playNativeSegment,console,URL,URLSearchParams,Date,Intl,crypto:{randomUUID},structuredClone,
    document,location:{hash:'#authentic/'+clip.id},navigator:{get onLine(){return online;}},window:{addEventListener(){},scrollTo(){}},
    setInterval(){},setTimeout(){return 1;},clearTimeout(){},stopAudio(){},stopRecording(){},
    store:{async put(){},async get(){return null;}},
    pending:async()=>({events:queue.map(x=>({...x})),recordings:[]}),
    queueEvent:async(l,kind,answer)=>{const event={event_id:randomUUID(),device_id:'test-computer',kind,lesson_id:l.id,content_version:l.version,answer,occurred_at:new Date(Date.now()-100000+(++sequence)).toISOString()};queue.push({user_id:'test-user',event});return event;},
    flush:async()=>{if(flushGate)await flushGate;const results=[];while(queue.length){const {event}=queue.shift();saved.push({text:event.answer,created_at:event.occurred_at,lesson_id:event.lesson_id});results.push({ok:true,event_id:event.event_id});}return {results};},
    api:async endpoint=>{if(endpoint==='/progress')return progress();if(endpoint==='/authentic')return index;if(endpoint==='/lessons/'+lesson.id)return lesson;throw new Error('unexpected fixture API '+endpoint);}
  });
  const startup=/^bootstrap\(\)\.catch\(error=>[^\n]*\);\s*$/m;assert.equal((appSource.match(/^bootstrap\(\)\.catch/gm)||[]).length,1);
  vm.runInContext(appSource.replace(/^import [^\n]+\n/gm,'').replace(startup,'')+'\nglobalThis.appTest={state,render,renderRoute,nativeChallengeRecord,nativeChallengeView,refreshNativeChallengeUIStatus};',context);
  const h=context.appTest;Object.assign(h.state,{user:{id:'test-user',username:'Test',settings:{}},curriculum:{levels:[],lessons:[]},route:'authentic',authentic:index,authenticId:clip.id,lesson,progress:progress(),listeningPending:[],nativeChallengeMode:'challenge'});
  const click=async action=>{const target={dataset:{action},disabled:false,isConnected:true};for(const fn of listeners.get('click')||[])await fn({target:{closest:()=>target},preventDefault(){}});return target;};
  const fill=text=>{for(const task of clip.c2_challenge.tasks)values.set(`[data-native-answer="${task.id}"]`,text);};
  return {h,click,fill,saved,queue,values,nodes,view:()=>nodes.get('#app').innerHTML,toast:()=>nodes.get('#toast').textContent,
    setOnline:v=>{online=v;},holdSync:promise=>{flushGate=promise;}};
}

test('actual app click flow: first response -> reveal -> assisted revision -> standard lesson -> restored challenge',async()=>{
  const f=appFixture();f.h.render();assert.ok(!f.view().includes(clip.transcript[0].cs));
  await f.click('native-challenge-reveal');assert.match(f.toast(),/先保存/);assert.equal(f.saved.length,0);
  f.fill('První vlastní odpověď.');await f.click('native-challenge-save');
  assert.equal(f.saved.length,1);assert.equal(f.h.nativeChallengeRecord().first.answers.scope,'První vlastní odpověď.');
  assert.ok(!f.view().includes(clip.transcript[0].cs));
  await f.click('native-challenge-reveal');assert.equal(f.saved.length,2);assert.ok(f.view().includes(clip.transcript[0].cs));
  f.fill('Upraveno po přečtení.');await f.click('native-challenge-save');
  assert.equal(f.h.nativeChallengeRecord().latest.assisted,true);assert.equal(f.h.nativeChallengeRecord().first.answers.scope,'První vlastní odpověď.');
  await f.click('native-challenge-standard');assert.ok(f.view().includes(clip.title_zh));assert.ok(f.view().includes('回到原声进阶回答与自检'));
  await f.click('native-challenge-open');assert.ok(f.view().includes('Upraveno po přečtení.'));assert.ok(f.view().includes('首次保存的回答'));
  f.fill('切到旧教材前的未提交草稿');await f.click('native-challenge-standard');await f.click('native-challenge-open');
  assert.ok(f.view().includes('切到旧教材前的未提交草稿'));assert.equal(f.h.nativeChallengeRecord().first.answers.scope,'První vlastní odpověď.');
});

test('actual app offline save/reveal queues records; background ack never replaces the current typed text or playback DOM',async()=>{
  const f=appFixture();f.setOnline(false);f.fill('离线首次回答');f.h.render();await f.click('native-challenge-save');
  assert.equal(f.saved.length,0);assert.equal(f.queue.length,1);assert.equal(f.h.nativeChallengeRecord().first.pending,true);
  await f.click('native-challenge-reveal');assert.equal(f.queue.length,2);assert.ok(f.view().includes(clip.transcript[0].cs));
  f.fill('同步期间还在打字');const before=f.view();f.setOnline(true);await f.click('sync');
  assert.equal(f.queue.length,0);assert.equal(f.saved.length,2);assert.equal(f.view(),before);
  assert.equal(f.values.get('[data-native-answer="scope"]'),'同步期间还在打字');assert.match(f.nodes.get('#native-challenge-status').textContent,/已同步到账号/);
});

test('actual app serializes saves while synchronization is busy',async()=>{
  const f=appFixture();let release;f.holdSync(new Promise(resolve=>{release=resolve;}));f.fill('第一份');
  const first=f.click('native-challenge-save');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.h.state.nativeChallengeBusy,true);f.fill('第二份不应重入');await f.click('native-challenge-save');assert.equal(f.queue.length,1);
  release();await first;assert.equal(f.saved.length,1);assert.equal(f.h.state.nativeChallengeBusy,false);
});

test('shell cache includes the new module; structured records do not appear in ordinary note previews',()=>{
  const sw=fs.readFileSync(new URL('../app/public/sw.js',import.meta.url),'utf8');assert.ok(sw.includes("'/native-challenge.js'"));assert.match(sw,/const SHELL='czstudy-shell-v\d+-[^']+'/);
  assert.match(appSource,/notes=\(p\.notes\|\|\[\]\)\.filter\(n=>!isChallengeNote\(n\.text\)\)/);
  assert.match(appSource,/filter\(n=>n\.lesson_id===l\.id&&!isChallengeNote\(n\.text\)\)/);
});

