import {api} from '/sync.js?game=5';
import * as local from './storage.js';
import {SIM_VERSION,initialSimulation,stepSimulation,offers,balances} from './simulation-rules.js';
let context=null,base=null,inFlight=null,again=false,lastTime=0,syncError=null,enqueueTail=Promise.resolve();const listeners=new Set();
export function simulationContext(user,device){if(context?.user.id!==user.id){base=null;syncError=null;}context={user,device};}
export function subscribeSimulation(fn){listeners.add(fn);return()=>listeners.delete(fn);}
async function announce(){const view=await simulationView();for(const fn of listeners)fn(view);return view;}
export async function simulationPending(){if(!context)return [];return(await local.all('outbox')).filter(x=>x.user_id===context.user.id&&x.scope==='simulation').sort((a,b)=>a.event.occurred_at.localeCompare(b.event.occurred_at));}
export async function simulationView(){
  if(!context)throw new Error('先登录学习账号。');const uid=context.user.id;
  base ||= await local.get('cache',uid+'|simulation-base');
  if(!base)return {ready:false,state:null,pending:0,conflict:null,offline:!navigator.onLine,error:syncError};
  let state=structuredClone(base.state),conflict=null;const pending=await simulationPending();
  for(const row of pending){if(row.error||row.event.base_revision!==state.revision){conflict={event:row.event,message:row.error||'这段离线操作需要与新账本重新核对。'};break;}try{state=stepSimulation(state,row.event.action).state;}catch(e){conflict={event:row.event,message:e.message};break;}}
  return {ready:true,version:base.version,state,offers:offers(state),balances:balances(state),pending:pending.length,conflict,offline:!navigator.onLine,error:syncError};
}
async function storeBase(uid,value){await local.put('cache',uid+'|simulation-base',value);if(context?.user.id===uid){base=value;syncError=null;}}
export function queueSimulation(action){const uid=context?.user.id;return enqueueTail=enqueueTail.catch(()=>{}).then(()=>{if(context?.user.id!==uid)throw new Error('账号已切换，原操作未提交。');return enqueue(action);});}
async function enqueue(action){
  const view=await simulationView();if(!view.ready)throw new Error('本机还没有这份经营存档，先联网打开一次。');if(view.conflict)throw new Error('先核对待同步的经营操作，再继续下一笔。');
  const preview=stepSimulation(view.state,action);lastTime=Math.max(Date.now(),lastTime+1);
  const event={event_id:crypto.randomUUID(),device_id:context.device,version:SIM_VERSION,base_revision:view.state.revision,action,occurred_at:new Date(lastTime).toISOString()};
  await local.put('outbox',event.event_id,{scope:'simulation',user_id:context.user.id,event});await announce();void syncSimulation();return {event,result:preview};
}
export function syncSimulation(force=false){if(!context)return Promise.resolve(null);if(inFlight){again=true;return inFlight;}inFlight=flush(force).finally(()=>{const repeat=again;inFlight=null;if(repeat&&context&&navigator.onLine)void syncSimulation();});return inFlight;}
async function flush(force){
  if(!context)return null;const uid=context.user.id;if(!navigator.onLine)return announce();
  try{do{again=false;const pending=await simulationPending();for(const row of pending){if(context?.user.id!==uid)return null;if(row.error)break;
      try{const response=await api('/game/simulation/events',{method:'POST',body:JSON.stringify(row.event)});if(context?.user.id!==uid)return null;await storeBase(uid,response);await local.remove('outbox',row.event.event_id);}
      catch(e){if(e.status===409||e.status===400){await local.put('outbox',row.event.event_id,{...row,error:e.message,code:e.code});await storeBase(uid,await api('/game/simulation/state'));return announce();}throw e;}}
    if(context?.user.id!==uid)return null;if(force||pending.length){await storeBase(uid,await api('/game/simulation/state'));force=false;}
    const remaining=await simulationPending();if(remaining.some(r=>r.error))break;if(remaining.length)again=true;
  }while(again&&context?.user.id===uid&&navigator.onLine);return announce();}
  catch(e){syncError={message:e.message,code:e.code||'NETWORK',status:e.status||0};return announce();}
}
export async function reconcileSimulation(){
  if(!navigator.onLine)throw new Error('联网后再核对服务器账本，原操作先保留。');const uid=context.user.id,rows=await simulationPending();
  for(const row of rows){await local.put('drafts',uid+'|simulation-archived|'+row.event.event_id,{...row,archived_at:new Date().toISOString(),reason:'user_reviewed_conflict'});await local.remove('outbox',row.event.event_id);}
  await storeBase(uid,await api('/game/simulation/state'));return {view:await announce(),previous:rows[0]?.event.action||null};
}
export const simulationLedger=before=>api('/game/simulation/ledger'+(before?'?before='+before:''));
export async function simulationArchived(){if(!context)return [];return(await local.all('drafts')).filter(x=>x.user_id===context.user.id&&x.reason==='user_reviewed_conflict').sort((a,b)=>b.archived_at.localeCompare(a.archived_at));}
