import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {installUpdateNotice,APP_BUILD,newerBuild} from '../app/public/update-notice.js';

class Target {
  listeners=new Map();
  addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn({type,...event});}
}
class Element extends Target {
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.doc=doc;this.children=[];this.hidden=false;this.isConnected=true;this.attributes={};this.value='';this.defaultValue='';this.type='';}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
  setAttribute(k,v){this.attributes[k]=v;}
  hasAttribute(k){return k in this.attributes;}
  remove(){this.isConnected=false;this.parent.children=this.parent.children.filter(x=>x!==this);}
  closest(selector){let p=this;while(p){if(selector==='form'&&p.tagName==='FORM')return p;if(selector==='#app-update-notice'&&p.id==='app-update-notice')return p;if(selector.split(',').some(x=>x==='#'+p.id))return p;p=p.parent;}return null;}
  querySelectorAll(){const out=[];const visit=p=>{for(const c of p.children){if(['INPUT','SELECT','TEXTAREA'].includes(c.tagName))out.push(c);visit(c);}};visit(this);return out;}
}
function fixture(){
  const document=new Target();document.hidden=false;document.body=new Element('body',document);document.createElement=t=>new Element(t,document);document.querySelectorAll=()=>document.body.querySelectorAll();
  const sw=new Target(),messages=[];sw.controller={postMessage:m=>messages.push(m)};
  let reloads=0,safety={hasUser:true,queuedEvents:0,queuedRecordings:0,preservedFields:[]},reads=0;
  const notice=installUpdateNotice({document,serviceWorker:sw,getSafety:async()=>{reads++;return typeof safety==='function'?await safety():safety;},reload:()=>reloads++,setInterval:()=>1,clearInterval:()=>{}});
  const form=document.createElement('form');form.id='note-form';const field=document.createElement('textarea');field.name='text';form.append(field);document.body.append(form);
  const banner=()=>document.body.children.find(x=>x.id==='app-update-notice');
  const find=(root,p)=>{if(p(root))return root;for(const c of root?.children||[]){const r=find(c,p);if(r)return r;}return null;};
  return {document,sw,messages,notice,form,field,banner,reloads:()=>reloads,reads:()=>reads,setSafety:x=>{safety=x;},
    version:v=>sw.emit('message',{data:{type:'CZSTUDY_SHELL_VERSION',version:v},source:sw.controller}),
    status:()=>find(banner(),e=>e.tagName==='P')?.textContent,
    refresh:()=>find(banner(),e=>e.textContent==='刷新使用新版').emit('click'),
    later:()=>find(banner(),e=>e.textContent==='稍后').emit('click')};
}
const tick=()=>new Promise(r=>setImmediate(r));
const newer='czstudy-shell-v'+(Number(APP_BUILD.match(/^czstudy-shell-v(\d+)-/)[1])+1)+'-fixture-next';

test('SW version handshake only announces a newer controlling shell and never reloads automatically',async()=>{
  const f=fixture();assert.ok(f.messages.length);assert.equal(newerBuild(APP_BUILD),false);
  f.version('czstudy-shell-v21-previous');f.version(APP_BUILD);assert.equal(f.banner(),undefined);
  f.sw.emit('controllerchange');assert.equal(f.messages.at(-1).type,'CZSTUDY_SHELL_VERSION');
  f.version(newer);await tick();assert.ok(f.banner());assert.equal(f.reloads(),0);assert.match(f.status(),/队列为空/);
  f.refresh();await tick();assert.equal(f.reloads(),1);
});
test('unsaved edits block explicit refresh; a successful save acknowledges only its original snapshot',async()=>{
  const f=fixture();f.field.value='旧提交';f.document.emit('input');const snapshot=f.notice.capture(f.form);
  f.field.value='提交过程中继续打字';f.notice.accept(snapshot);f.version(newer);await tick();f.refresh();await tick();
  assert.equal(f.reloads(),0);assert.match(f.status(),/未保存/);
  f.notice.accept(f.notice.capture(f.form));f.refresh();await tick();assert.equal(f.reloads(),1);
});
test('real local queue counts and errors are shown without claiming upload success; explicit reload preserves queue',async()=>{
  const f=fixture();const queue={hasUser:true,queuedEvents:2,queuedRecordings:1,rejected:true,preservedFields:[]};
  f.setSafety(queue);f.version(newer);await tick();assert.match(f.status(),/3 项待同步/);assert.match(f.status(),/同步失败/);assert.doesNotMatch(f.status(),/已同步到账号/);
  f.refresh();await tick();assert.equal(f.reloads(),1);assert.equal(queue.queuedEvents,2);assert.equal(queue.queuedRecordings,1);
});
test('recording, persistence failure and edits during an asynchronous save check cannot trigger reload',async()=>{
  const f=fixture();f.setSafety({blocked:'录音正在进行'});f.version(newer);await tick();f.refresh();await tick();assert.equal(f.reloads(),0);
  f.setSafety(async()=>{throw new Error('IDB unavailable');});f.refresh();await tick();assert.match(f.status(),/无法核对/);assert.equal(f.reloads(),0);
  let release;f.setSafety(()=>new Promise(r=>{release=r;}));f.refresh();await tick();f.document.emit('input');release({});await tick();assert.equal(f.reloads(),0);assert.match(f.status(),/正在修改/);
});
test('persisted field exemptions, later action, DOM independence and cleanup',async()=>{
  const f=fixture();f.field.value='已入 IndexedDB 的练习草稿';f.setSafety({preservedFields:[f.field],queuedEvents:0,queuedRecordings:0});
  f.version(newer);await tick();assert.doesNotMatch(f.status(),/未保存的修改/);f.later();assert.equal(f.banner().hidden,true);
  // Replacing the app's own form does not remove the sibling update notice.
  f.form.remove();assert.ok(f.banner());f.document.emit('visibilitychange');await tick();assert.equal(f.banner().hidden,false);assert.equal(f.reloads(),0);
  f.notice.destroy();assert.equal(f.banner(),undefined);f.version(newer);assert.equal(f.banner(),undefined);
});
test('actual service worker answers its build without navigating pages or deleting private caches',async()=>{
  const source=fs.readFileSync(new URL('../app/public/sw.js',import.meta.url),'utf8'),handlers={},messages=[];
  const self={addEventListener:(type,fn)=>handlers[type]=fn};vm.runInNewContext(source,{self});
  handlers.message({data:{type:'CZSTUDY_SHELL_VERSION'},source:{postMessage:m=>messages.push(m)}});
  assert.equal(messages[0].version,APP_BUILD);assert.ok(source.includes("'/update-notice.js'"));
  assert.doesNotMatch(source,/\.navigate\(|location\.reload|caches\.delete\(['"]czstudy-user/);
  assert.match(source,/k\.startsWith\('czstudy-shell-'\)/);
});

