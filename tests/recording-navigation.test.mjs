import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {startRecording,stopRecording,isRecording,cancelRecordingRequest} from '../app/public/audio.js';
const app=fs.readFileSync(new URL('../app/public/app.js',import.meta.url),'utf8');
const sync=fs.readFileSync(new URL('../app/public/sync.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const recordBranch=app.slice(app.indexOf("if(action==='record-start'){"),app.indexOf("if(action==='record-stop'){"));
const runRecordBranch=new AsyncFunction('state','target','document','startRecording','queueRecording','synchronize',"const action='record-start';"+recordBranch);
const queueBody=sync.slice(sync.indexOf('export async function queueRecording(lesson,blob){')+'export async function queueRecording(lesson,blob){'.length,sync.indexOf('\nexport async function pending()')).trim().replace(/}\s*$/,'');
const actualQueueRecording=new AsyncFunction('lesson','blob','context','store','crypto',queueBody);
const routeLine=app.split('\n').find(l=>l.includes("state.route=labels[route]?route:'home'"));
const runRoute=new Function('state','stopAudio','stopRecording','cancelRecordingRequest',"const route='home',labels={home:'学习'};"+routeLine);
const branch=action=>app.split('\n').find(l=>l.includes("if(action==='"+action+"'){"));
const runPanel=new AsyncFunction('action','state','target','stopRecording','recordListeningExposure','stopAudio','render','savePosition',branch('tab')+'\n'+branch('step'));
function fixture(t){
 const original=new Map(),streams=[],recorders=[],queue=[],context={user:{id:'isolated'},device:'fixture'};
 for(const name of ['window','navigator','MediaRecorder'])original.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
 const define=(name,value)=>Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});
 define('window',{isSecureContext:true});define('navigator',{mediaDevices:{getUserMedia:async()=>{const track={stops:0,stop(){this.stops++;}};const s={getTracks:()=>[track],track};streams.push(s);return s;}}});
 class FakeRecorder{static isTypeSupported(){return true;}constructor(s){this.stream=s;this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob(['original lesson recording'])});queueMicrotask(()=>this.onstop());}}
 define('MediaRecorder',FakeRecorder);
 t.after(()=>{stopRecording();for(const [name,value] of original){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const lesson={id:'Pre-A1-U01-L01',version:'2026.10.22.1'},state={user:context.user,lesson,route:'lesson'};
 const status={isConnected:true,textContent:''},panel={querySelector:selector=>selector==='.record-status'?status:{isConnected:false}};
 const target={disabled:false,dataset:{tab:'grammar',step:'7'},closest:selector=>selector==='.record-panel'?panel:null};
 const document={querySelectorAll:()=>[]};let saved;
 const savedPromise=new Promise(resolve=>saved=resolve);
 const queueRecording=(l,blob)=>actualQueueRecording(l,blob,context,{put:async(store,key,item)=>queue.push({store,key,item})},{randomUUID});
 const synchronize=async()=>{saved();return {results:[]};};
 return {state,target,document,status,streams,queue,savedPromise,record:()=>runRecordBranch(state,target,document,startRecording,queueRecording,synchronize)};
}
for(const action of ['route','tab','step'])test(action+'导航停止真实处理分支中的录音，并按开始时课程/版本入队',async t=>{
 const f=fixture(t);await f.record();assert.equal(isRecording(),true);f.status.isConnected=false;
 if(action==='route'){runRoute(f.state,()=>{},stopRecording,cancelRecordingRequest);f.state.lesson={id:'C2-U12-L01',version:'2026.10.23.2'};}
 else await runPanel(action,f.state,f.target,stopRecording,async()=>{},()=>{},()=>{},async()=>{});
 assert.equal(isRecording(),false);await f.savedPromise;assert.equal(f.streams[0].track.stops,1);assert.equal(f.queue.length,1);
 const row=f.queue[0];assert.equal(row.store,'recordings');assert.equal(row.item.lesson_id,'Pre-A1-U01-L01');assert.equal(row.item.content_version,'2026.10.22.1');assert.equal(await row.item.blob.text(),'original lesson recording');assert.equal(row.item.user_id,'isolated');
});
test('路由离开授权等待取消录音意图；迟到流不产生录音/队列',async t=>{
 const f=fixture(t);let resolve;const late=new Promise(r=>resolve=r);navigator.mediaDevices.getUserMedia=()=>late;
 const p=f.record();const rejected=assert.rejects(p,/已取消本次录音等待/);runRoute(f.state,()=>{},stopRecording,cancelRecordingRequest);await rejected;
 const track={stops:0,stop(){this.stops++;}};resolve({getTracks:()=>[track]});await new Promise(r=>setImmediate(r));assert.equal(track.stops,1);assert.equal(f.queue.length,0);assert.equal(isRecording(),false);
});