import test from 'node:test';
import assert from 'node:assert/strict';
import {createMicrophoneRequest,startRecording,stopRecording,isRecording} from '../app/public/audio.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const stream=()=>{const track={stops:0,stop(){this.stops++;}};return {track,getTracks:()=>[track]};};
function fixture(){
  const requests=[],statuses=[],timers=new Map();let id=0;
  const mic=createMicrophoneRequest({getUserMedia:constraints=>{assert.deepEqual(constraints,{audio:true});const d=deferred();requests.push(d);return d.promise;},setTimer:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimer:key=>timers.delete(key)});
  return {mic,requests,statuses,timers,request:()=>mic.request(s=>statuses.push(s)),timeout(){const t=[...timers.values()][0];assert.equal(t.ms,20000);timers.clear();t.fn();}};
}
test('等待提示立即显示；20秒内明确无响应而非拒绝',async()=>{
  const f=fixture(),p=f.request();assert.equal(f.requests.length,1);assert.match(f.statuses[0],/正在等待麦克风授权/);assert.match(f.statuses[0],/还没有开始录音/);
  const rejected=assert.rejects(p,/20秒内未收到/);f.timeout();await rejected;assert.match(f.statuses.at(-1),/当前没有录音/);assert.doesNotMatch(f.statuses.at(-1),/被拒绝/);
  f.requests[0].reject(new Error('late browser failure'));await tick();
});
test('连续点击和超时后重复点击只保留一个原生授权请求',async()=>{
  const f=fixture(),p=f.request();await assert.rejects(f.request(),/正在等待/);await assert.rejects(f.request(),/正在等待/);assert.equal(f.requests.length,1);
  const rejected=assert.rejects(p,/20秒内/);f.timeout();await rejected;await assert.rejects(f.request(),/上一次麦克风请求尚未结束/);assert.equal(f.requests.length,1);
  f.requests[0].reject(new Error('closed'));await tick();
});
test('及时授权清除超时并将流交给录音，未提前释放',async()=>{
  const f=fixture(),p=f.request(),s=stream();f.requests[0].resolve(s);assert.equal(await p,s);assert.equal(s.track.stops,0);assert.equal(f.timers.size,0);
});
test('超时后迟到成功立即释放；随后显式重试可取得新流',async()=>{
  const f=fixture(),p=f.request();const rejected=assert.rejects(p,/20秒内/);f.timeout();await rejected;
  const stale=stream();f.requests[0].resolve(stale);await tick();assert.equal(stale.track.stops,1);
  const retry=f.request(),fresh=stream();assert.equal(f.requests.length,2);f.requests[1].resolve(fresh);assert.equal(await retry,fresh);assert.equal(fresh.track.stops,0);
});
test('取消等待后迟到授权也释放，不会自动录音',async()=>{
  const f=fixture(),p=f.request();const rejected=assert.rejects(p,/已取消本次录音等待/);f.mic.cancel();await rejected;assert.equal(f.timers.size,0);
  const s=stream();f.requests[0].resolve(s);await tick();assert.equal(s.track.stops,1);
  const retry=f.request();f.requests[1].reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));await assert.rejects(retry,/权限被拒绝/);
});
test('真实拒绝与无设备原因保留；失败后允许重试',async()=>{
  const f=fixture(),p=f.request();f.requests[0].reject(Object.assign(new Error('denied'),{name:'NotAllowedError'}));await assert.rejects(p,/麦克风权限被拒绝/);assert.match(f.statuses.at(-1),/地址栏网站权限/);
  const retry=f.request();f.requests[1].reject(Object.assign(new Error('Requested device not found'),{name:'NotFoundError'}));await assert.rejects(retry,/无法打开麦克风：Requested device not found/);assert.equal(f.timers.size,0);
});
test('超时后的迟到拒绝不会覆写提示或成为未处理拒绝',async()=>{
  const f=fixture(),p=f.request();const rejected=assert.rejects(p,/20秒内/);f.timeout();await rejected;const count=f.statuses.length;
  f.requests[0].reject(Object.assign(new Error('late denied'),{name:'NotAllowedError'}));await tick();assert.equal(f.statuses.length,count);assert.equal(f.timers.size,0);
});
test('同步设备调用异常也清理请求锁与计时器',async()=>{
  let calls=0;const timers=new Set(),statuses=[];
  const f=createMicrophoneRequest({getUserMedia:()=>{calls++;throw new Error('native call failed');},setTimer:()=>{timers.add(1);return 1;},clearTimer:t=>timers.delete(t)});
  await assert.rejects(f.request(x=>statuses.push(x)),/无法打开麦克风：native call failed/);await assert.rejects(f.request(),/native call failed/);assert.equal(calls,2);assert.equal(timers.size,0);
});
function browserGlobals(t,{secure=true,supported=true,failStart=false}={}){
  const originals=new Map(),streams=[],recorders=[];
  function set(name,value){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});}
  class FakeRecorder{
    static isTypeSupported(){return true;}
    constructor(s){this.stream=s;this.state='inactive';this.mimeType='audio/webm';recorders.push(this);}
    start(){if(failStart)throw new Error('recorder start failed');this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test recording'])});queueMicrotask(()=>this.onstop());}
  }
  set('window',{isSecureContext:secure});set('navigator',{mediaDevices:supported?{getUserMedia:async()=>{const s=stream();streams.push(s);return s;}}:undefined});set('MediaRecorder',supported?FakeRecorder:undefined);
  t.after(()=>{stopRecording();for(const [key,value] of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
  return {streams,recorders};
}
test('录音包装接口保持开始/停止/Blob回放回调并释放设备',async t=>{
  const f=browserGlobals(t),statuses=[],done=deferred();await startRecording((blob,url)=>done.resolve({blob,url}),x=>statuses.push(x));assert.equal(isRecording(),true);assert.match(statuses[0],/等待麦克风授权/);assert.match(statuses.at(-1),/正在录音/);
  stopRecording();const result=await done.promise;assert.equal(await result.blob.text(),'test recording');assert.match(result.url,/^blob:/);assert.equal(f.streams[0].track.stops,1);assert.equal(isRecording(),false);
});
test('旧录音的延后stop回调不会释放新录音设备',async t=>{
  const f=browserGlobals(t),first=deferred();await startRecording(()=>first.resolve());const old=f.recorders[0];old.state='inactive';old.ondataavailable({data:new Blob(['old'])});
  const second=deferred();await startRecording(()=>second.resolve());await old.onstop();await first.promise;assert.equal(f.streams[0].track.stops,1);assert.equal(f.streams[1].track.stops,0);assert.equal(isRecording(),true);stopRecording();await second.promise;assert.equal(f.streams[1].track.stops,1);
});
test('非HTTPS与不支持分支保持明确反馈且不请求设备',async t=>{
  const f=browserGlobals(t,{secure:false}),messages=[];await assert.rejects(startRecording(()=>{},x=>messages.push(x)),/需要 HTTPS/);assert.match(messages.at(-1),/需要 HTTPS/);assert.equal(f.streams.length,0);
  window.isSecureContext=true;navigator.mediaDevices=undefined;await assert.rejects(startRecording(()=>{},x=>messages.push(x)),/不支持录音/);assert.match(messages.at(-1),/不支持录音/);assert.equal(f.streams.length,0);
});
test('MediaRecorder启动失败也释放取得的麦克风',async t=>{
  const f=browserGlobals(t,{failStart:true}),messages=[];await assert.rejects(startRecording(()=>{},x=>messages.push(x)),/无法开始录音/);assert.equal(f.streams[0].track.stops,1);assert.match(messages.at(-1),/recorder start failed/);assert.equal(isRecording(),false);
});