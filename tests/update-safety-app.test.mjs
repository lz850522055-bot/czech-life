import {createRequestCache} from '../app/public/request-cache.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as challenge from '../app/public/native-challenge.js';
const source=fs.readFileSync(new URL('../app/public/app.js',import.meta.url),'utf8');
const index=JSON.parse(fs.readFileSync(new URL('../content/authentic/manifest.json',import.meta.url),'utf8'));
const clip=index.clips.find(c=>c.id==='public-healthcare-continuous');
function fixture(){
  let recording=false,queue={events:[],recordings:[]},drafts={},onStop,saveGate;const nodes=new Map(),groups=new Map(),listeners=new Map();
  const document={addEventListener:(type,fn)=>{const a=listeners.get(type)||[];a.push(fn);listeners.set(type,a);},querySelector:s=>nodes.get(s)||null,querySelectorAll:s=>groups.get(s)||[],hidden:false};
  const context=vm.createContext({createRequestCache,...challenge,document,navigator:{},window:{addEventListener(){}},location:{},setInterval(){},
    isRecording:()=>recording,pending:async()=>queue,store:{get:async()=>drafts},listeningKey:l=>l.id+'|'+l.version,
    startRecording:async callback=>{onStop=callback;recording=true;},queueRecording:async()=>{if(saveGate)await saveGate;return {event_id:'fixture-recording'};}});
  vm.runInContext(source.replace(/^import [^\n]+\n/gm,'').replace(/^bootstrap\(\)\.catch\(error=>[^\n]*\);\s*$/m,'')+'\nglobalThis.h={state,updateSafety};',context);
  Object.assign(context.h.state,{user:{id:'test'},authentic:index,authenticId:clip.id,route:'authentic',nativeChallengeMode:'challenge',progress:{notes:[]},lesson:{id:'C2-U12',version:'test',exercises:[{id:'e1'}]}});
  return {...context.h,nodes,groups,setRecording:x=>recording=x,setQueue:x=>queue=x,setDrafts:x=>drafts=x,
    holdRecordingSave:p=>saveGate=p,stop:()=>{recording=false;return onStop({},'blob:fixture');},
    isolateRecordingSync:()=>vm.runInContext('synchronize=async()=>({results:[]});',context),
    click:async action=>{const target={dataset:{action},disabled:false,isConnected:true,closest:()=>null};for(const fn of listeners.get('click')||[])await fn({target:{closest:()=>target},preventDefault(){}});}};
}
test('actual app detects new native answers/selfchecks against saved record, then permits persisted pending notes',async()=>{
  const f=fixture(),fields=clip.c2_challenge.tasks.map(t=>({value:'我的首次作答',dataset:{nativeAnswer:t.id}}));
  f.groups.set('[data-native-answer]',fields);assert.match((await f.updateSafety()).blocked,/原声回答/);
  const answers=Object.fromEntries(fields.map(x=>[x.dataset.nativeAnswer,x.value]));
  f.setQueue({events:[{user_id:'test',event:{kind:'note',answer:challenge.challengeNote(clip,'answer',{answers}),occurred_at:new Date().toISOString()}}],recordings:[]});
  const saved=await f.updateSafety();assert.equal(saved.blocked,undefined);assert.equal(saved.queuedEvents,1);assert.equal(saved.preservedFields.length,3);
  const key=clip.c2_challenge.tasks[0].id+':0';f.groups.set('[data-native-check]',[{value:'partial',dataset:{nativeCheck:key}}]);
  assert.match((await f.updateSafety()).blocked,/自检/);
});
test('actual app distinguishes durable exercise drafts from in-memory edits, and blocks save/recording handoff',async()=>{
  const f=fixture();f.state.route='lesson';const field={value:'已真正落盘'};f.nodes.set('#answer-form [name="answer"]',field);
  f.state.drafts={'C2-U12|test|e1':'已真正落盘'};
  assert.equal((await f.updateSafety()).preservedFields.length,0);
  f.setDrafts({'C2-U12|test|e1':'已真正落盘'});assert.equal((await f.updateSafety()).preservedFields[0],field);
  f.setRecording(true);assert.match((await f.updateSafety()).blocked,/录音/);f.setRecording(false);
  f.state.recordingForUpdate=1;assert.match((await f.updateSafety()).blocked,/录音/);f.state.recordingForUpdate=0;
  f.state.updateFormSaves=1;assert.match((await f.updateSafety()).blocked,/正在保存/);f.state.updateFormSaves=0;
  assert.equal((await f.updateSafety()).blocked,undefined);
});
test('actual recording callback keeps upgrade blocked after Stop until its blob save resolves',async()=>{
  const f=fixture();f.isolateRecordingSync();let release;f.holdRecordingSave(new Promise(r=>release=r));await f.click('record-start');
  assert.equal(f.state.recordingForUpdate,1);const stopped=f.stop();await new Promise(r=>setImmediate(r));
  assert.match((await f.updateSafety()).blocked,/录音/);release();
  // The existing synchronization path is tested separately; this test gates the actual blob handoff.
  await stopped;assert.equal(f.state.recordingForUpdate,0);
});
test('two stopped recordings with overlapping persistence stay protected until both independent saves finish',async()=>{
  const f=fixture();f.isolateRecordingSync();let releaseFirst,releaseSecond;
  f.holdRecordingSave(new Promise(r=>releaseFirst=r));await f.click('record-start');const first=f.stop();
  f.holdRecordingSave(new Promise(r=>releaseSecond=r));await f.click('record-start');const second=f.stop();
  assert.equal(f.state.recordingForUpdate,2);assert.match((await f.updateSafety()).blocked,/录音/);
  releaseFirst();await first;assert.equal(f.state.recordingForUpdate,1);assert.match((await f.updateSafety()).blocked,/录音/);
  releaseSecond();await second;assert.equal(f.state.recordingForUpdate,0);assert.equal((await f.updateSafety()).blocked,undefined);
});
test('mobile authentic paragraphs receive a more-specific single-column rule; ordinary lesson grid remains',()=>{
  const css=fs.readFileSync(new URL('../app/public/styles.css',import.meta.url),'utf8');
  const esc=x=>String(x??'');const button=()=>'';
  const first=challenge.challengeNote(clip,'answer',{answers:Object.fromEntries(clip.c2_challenge.tasks.map(t=>[t.id,'Odpověď.']))});
  const at='2026-10-23T01:00:00Z',record=challenge.resolveChallengeRecord(clip,[{text:first,created_at:at}]);record.exposed=true;
  const html=challenge.challengePage(index,clip,record,{esc,button});
  assert.ok(html.includes('class="authentic-layout"'));assert.equal((html.match(/class="sentence"><div>/g)||[]).length,9);
  assert.match(css,/\.sentence\{display:grid;grid-template-columns:34px minmax\(0,1fr\)/);
  assert.match(css,/\.sentence\{gap:8px;grid-template-columns:30px 1fr/);
  assert.match(css,/\.authentic-layout \.sentence\{display:block\}/);
  assert.match(css,/\.authentic-layout \.sentence>div\{min-width:0;width:100%\}/);
  assert.ok(css.lastIndexOf('.authentic-layout .sentence{')>css.indexOf('@media(max-width:640px)'));
});

