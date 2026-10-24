import {api,flush as flushLegacy} from '/sync.js?game=5';
import * as local from './storage.js';
let current=null,inFlight=null,lastTime=0;
export function gameContext(user,device){current={user,device};}
export async function cached(name,url){
  if(!current)throw new Error('请先登录');const uid=current.user.id,key=uid+'|'+name;
  try{const data=await api(url);if(current?.user.id!==uid)throw new Error('账号已切换');await local.put('cache',key,data);return data;}
  catch(e){if(e.status===401||e.status===403)throw e;const saved=await local.get('cache',key);if(saved)return saved;throw e;}
}
export async function queue(mission,task,kind,answer,attempt,assisted=false,positionEventId=null){
  if(!current)throw new Error('请先登录');lastTime=Math.max(Date.now(),lastTime+1);
  const event={event_id:crypto.randomUUID(),device_id:current.device,version:mission.version,mission_id:mission.id,task_id:task?.id||null,kind,answer,attempt_id:attempt,assisted,occurred_at:new Date(lastTime).toISOString()};
  if(positionEventId)event.position_event_id=positionEventId;
  await local.put('outbox',event.event_id,{user_id:current.user.id,event});return event;
}
export async function pending(){if(!current)return [];return (await local.all('outbox')).filter(x=>x.user_id===current.user.id&&x.scope!=='simulation').sort((a,b)=>a.event.occurred_at.localeCompare(b.event.occurred_at));}
export function flushGame(){return inFlight ||= flushNow().finally(()=>{inFlight=null;});}
async function flushNow(){
  if(!current||!navigator.onLine)return {offline:true,results:[]};const uid=current.user.id;
  const old=await flushLegacy();const recordingFailed=old.results?.some(x=>!x.ok);
  const items=await pending(),results=[];
  for(let offset=0;offset<items.length;offset+=100){
    if(current?.user.id!==uid)break;
    const response=await api('/game/events',{method:'POST',body:JSON.stringify({events:items.slice(offset,offset+100).map(x=>x.event)})});
    for(const result of response.results){results.push(result);if(result.ok)await local.remove('outbox',result.event_id);else{const original=await local.get('outbox',result.event_id);if(original)await local.put('outbox',result.event_id,{...original,error:result.error});}}
  }
  return {results,recordingFailed};
}
export async function downloadAudio(user,ref){
  if(!ref)return;const urls=ref.kind==='native'?[ref.url]:ref.file_url?[ref.file_url,ref.slow_file]:['/api/v1/audio/'+(ref.asset_id||ref.id),...(ref.slow_file?['/api/v1/audio/'+(ref.asset_id||ref.id)+'?speed=slow']:[])];
  const cache=await caches.open('czstudy-user-'+user);
  for(const url of urls){if(!url||await cache.match(url))continue;const r=await fetch(url,{credentials:'same-origin'});if(!r.ok)throw new Error('音频下载失败 '+r.status);await cache.put(url,r);}
}
