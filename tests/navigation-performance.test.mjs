import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createRequestCache} from '../app/public/request-cache.js';
import * as listening from '../app/public/advanced-listening.js';
import * as challenge from '../app/public/native-challenge.js';
import * as scenes from '../app/public/scenarios.js';
import {choiceOrder} from '../app/public/choice-order.js';
const source=fs.readFileSync(new URL('../app/public/app.js',import.meta.url),'utf8');
const lesson=JSON.parse(fs.readFileSync(new URL('../content/lessons/Pre-A1/Pre-A1-U01-L01.json',import.meta.url),'utf8'));
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
  const calls=[],nodes=new Map(),stored=new Map(),queue=[],saved=[],timers=[];let apiImpl,flushGate,appWrites=0;
  const node=()=>({innerHTML:'',textContent:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},isConnected:true});
  for(const id of ['#app','#sync-state','#toast','#pending-info','#ai-status-content'])nodes.set(id,node());
  let html='';Object.defineProperty(nodes.get('#app'),'innerHTML',{get:()=>html,set:x=>{html=x;appWrites++;}});
  const document={hidden:false,body:{dataset:{}},documentElement:{style:{setProperty(){}}},querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],addEventListener(){}};
  const defaultProgress={server_time:new Date().toISOString(),positions:{},latest:{},reviews:[],notes:[],skills:{},event_count:0};
  const curriculum={revision:'catalog-v1',levels:['Pre-A1'],lessons:[{...lesson,exercise_count:lesson.exercises.length}]};
  const context=vm.createContext({...listening,...challenge,...scenes,choiceOrder,createRequestCache,Date,Intl,URLSearchParams,URL,console,crypto:{randomUUID},document,
    location:{hash:'#home'},navigator:{onLine:true},window:{addEventListener(){},scrollTo(){}},
    setInterval(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},stopAudio(){},stopRecording(){},audioCapabilities:()=>({voices:[],secure:true,recording:true}),
    store:{get:async(s,k)=>stored.get(k),put:async(s,k,v)=>stored.set(k,v),offlineList:async()=>[],cachedJson:async()=>{},readCachedJson:async()=>undefined},
    pending:async()=>({events:queue.map(e=>({user_id:'u1',event:e})),recordings:[]}),
    queueEvent:async(l,kind,answer)=>{const event={event_id:randomUUID(),kind,answer,lesson_id:l.id,content_version:l.version,occurred_at:new Date().toISOString()};queue.push(event);return event;},
    flush:async()=>{const batch=queue.splice(0);if(flushGate)await flushGate;const results=batch.map(e=>({ok:true,event_id:e.event_id}));saved.push(...batch);return {results};},
    api:async endpoint=>{calls.push(endpoint);if(apiImpl)return apiImpl(endpoint);if(endpoint==='/progress')return structuredClone(defaultProgress);if(endpoint==='/curriculum')return curriculum;if(endpoint.startsWith('/lessons/'))return lesson;if(endpoint==='/ai/status')return {message:'AI ready'};throw new Error(endpoint);},
  });
  vm.runInContext(source.replace(/^import [^\n]+\n/gm,'').replace(/^bootstrap\(\)\.catch\(error=>[^\n]*\);\s*$/m,'')+'\nglobalThis.h={state,loadLesson,renderRoute,goPractice,synchronize,savePosition,loadWorkspace,clearRequests,refreshProgress};',context);
  const h=context.h;Object.assign(h.state,{user:{id:'u1',username:'Test',settings:{}},device:'d1',curriculum,progress:structuredClone(defaultProgress),listeningPending:[]});
  return {h,calls,nodes,stored,queue,saved,context,html:()=>html,writes:()=>appWrites,api:fn=>apiImpl=fn,gate:p=>flushGate=p,route:hash=>{context.location.hash=hash;return h.renderRoute();}};
}
test('reopening a lesson, including goPractice -> route, reuses its complete versioned content',async()=>{
  const f=fixture();await f.h.loadLesson(lesson.id);await f.h.goPractice(lesson.id);await f.h.renderRoute();
  assert.equal(f.calls.filter(x=>x.startsWith('/lessons/')).length,1);assert.equal(f.h.state.lesson,lesson);
  f.h.state.curriculum.lessons=[{...lesson,version:'updated'}];await f.h.loadLesson(lesson.id);
  assert.equal(f.calls.filter(x=>x.startsWith('/lessons/')).length,2);
});
test('settings are usable before remote AI response; response does not rebuild form or discard edits',async()=>{
  const f=fixture(),slow=deferred();f.api(endpoint=>{assert.equal(endpoint,'/ai/status');return slow.promise;});
  await f.route('#settings');assert.match(f.html(),/settings-form/);const writes=f.writes();
  f.nodes.set('#settings-draft',{value:'unsaved personal preference'});slow.resolve({message:'ready'});await tick();
  assert.equal(f.writes(),writes);assert.equal(f.nodes.get('#settings-draft').value,'unsaved personal preference');assert.match(f.nodes.get('#ai-status-content').innerHTML,/ready/);
});
test('late course and practice responses cannot pull user away from a newer route',async()=>{
  const f=fixture(),slow=deferred();f.api(endpoint=>endpoint.startsWith('/lessons/')?slow.promise:{message:'ready'});
  const old=f.h.goPractice(lesson.id);await tick();await f.route('#settings');slow.resolve(lesson);await old;
  assert.equal(f.context.location.hash,'#settings');assert.equal(f.h.state.route,'settings');assert.equal(f.h.state.lesson,null);
});
test('reopening a course uses queued local position before older server position',async()=>{
  const f=fixture();f.h.state.progress.positions[lesson.id]={tab:'text',step:0};
  f.queue.push({event_id:'position1',kind:'position',lesson_id:lesson.id,content_version:lesson.version,answer:{tab:'grammar',step:4},occurred_at:new Date().toISOString()});
  await f.route('#lesson/'+lesson.id);assert.equal(f.h.state.tab,'grammar');assert.equal(f.h.state.step,4);
});
test('overlapping quiet synchronizations share one progress request',async()=>{
  const f=fixture(),gate=deferred();f.gate(gate.promise);
  const a=f.h.synchronize({quiet:true}),b=f.h.synchronize({quiet:true});await tick();gate.resolve();await Promise.all([a,b]);
  assert.equal(f.calls.filter(x=>x==='/progress').length,1);
});
test('answer arriving during another upload gets acknowledged by the waiting caller',async()=>{
  const f=fixture(),gate=deferred();f.gate(gate.promise);
  f.queue.push({event_id:'position-before',kind:'position'});const first=f.h.synchronize({quiet:true});await tick();
  f.queue.push({event_id:'answer-after',kind:'exercise'});const second=f.h.synchronize({quiet:true});gate.resolve();await first;const result=await second;
  assert.ok(result.results.some(x=>x.event_id==='answer-after'&&x.ok));assert.deepEqual(f.saved.map(x=>x.event_id),['position-before','answer-after']);assert.equal(f.queue.length,0);
});
test('curriculum and progress start in parallel while logging in',async()=>{
  const f=fixture(),gate=deferred();f.api(endpoint=>endpoint==='/curriculum'?gate.promise:({positions:{}}));
  const pending=f.h.loadWorkspace();await tick();assert.ok(f.calls.includes('/curriculum'));assert.ok(f.calls.includes('/progress'));
  gate.resolve(f.h.state.curriculum);await pending;
});
test('a superseded progress request waits for the newest answer-disclosure state',async()=>{
  const f=fixture(),old=deferred(),latest=deferred();let calls=0,oldFinished=false;
  f.api(()=>++calls===1?old.promise:latest.promise);
  const first=f.h.refreshProgress().then(()=>{oldFinished=true;}),second=f.h.refreshProgress();
  old.resolve({notes:['stale']});await tick();assert.equal(oldFinished,false);
  latest.resolve({notes:['latest disclosure']});await Promise.all([first,second]);
  assert.deepEqual(f.h.state.progress.notes,['latest disclosure']);
});
test('malformed route is handled inside the app and old accounts cannot reuse lesson cache',async()=>{
  const f=fixture();await f.route('#lesson/%');assert.match(f.html(),/暂时无法打开/);
  await f.h.loadLesson(lesson.id);f.h.state.user={id:'u2',username:'Another',settings:{}};await f.h.loadLesson(lesson.id);
  assert.equal(f.calls.filter(x=>x.startsWith('/lessons/')).length,2);
});

test('phonetic sound progress does not skip exercise questions when changing learning mode',async()=>{
  const f=fixture();await f.route('#lesson/'+lesson.id+'?tab=phonetics&step=7');
  assert.equal(f.h.state.foundationStep,7);assert.equal(f.h.state.step,0);
  assert.equal(f.queue.at(-1).answer.tab,'phonetics');assert.equal(f.queue.at(-1).answer.step,7);
  await f.route('#lesson/'+lesson.id+'?tab=practice');assert.equal(f.h.state.step,0);assert.equal(f.h.state.foundationStep,7);
});
