import * as store from './storage.js';
let context={user:null,csrf:null,device:null},syncing,lastEventTime=0;
export function setContext(user,csrf,device){context={user,csrf,device};}
export async function api(url,options={}){
  const send=()=>fetch('/api/v1'+url,{credentials:'same-origin',...options,headers:{...(options.body&&!(options.body instanceof Blob)?{'Content-Type':'application/json'}:{}),...(context.csrf?{'X-CSRF-Token':context.csrf}:{}),...(context.user?{'X-CZ-Expected-User':context.user.id}:{}),...options.headers}});
  let response=await send(),data=await response.json().catch(()=>({error:'服务器返回格式错误'}));
  // A second tab may replace the HttpOnly cookie. Refresh only a verified CSRF
  // failure for the same user, once; never retry authorization or Origin failures.
  if(response.status===403&&data.code==='CSRF'&&context.user){
    const statusResponse=await fetch('/api/v1/auth/status',{credentials:'same-origin'});
    const status=await statusResponse.json().catch(()=>({}));
    if(statusResponse.ok&&status.user?.id===context.user.id&&status.csrf){context.csrf=status.csrf;response=await send();data=await response.json().catch(()=>({error:'服务器返回格式错误'}));}
  }
  if(!response.ok){const e=new Error(data.error||'请求失败');e.status=response.status;e.code=data.code;throw e;}return data;
}
export async function queueEvent(lesson,kind,answer,exerciseId=null,assisted=false,activityContext=null){
  if(!context.user)throw new Error('请先登录');
  // Preserve order when a draft, answer and disclosure are queued in one millisecond.
  lastEventTime=Math.max(Date.now(),lastEventTime+1);
  const event={event_id:crypto.randomUUID(),device_id:context.device,kind,lesson_id:lesson.id,content_version:lesson.version,exercise_id:exerciseId,answer,assisted,occurred_at:new Date(lastEventTime).toISOString()};
  if(activityContext)event.context=activityContext;
  await store.put('events',event.event_id,{user_id:context.user.id,event});return event;
}
export async function queueRecording(lesson,blob){
  const item={user_id:context.user.id,event_id:crypto.randomUUID(),device_id:context.device,lesson_id:lesson.id,content_version:lesson.version,occurred_at:new Date().toISOString(),blob};
  await store.put('recordings',item.event_id,item);return item;
}
export async function pending(){return {events:(await store.all('events')).filter(x=>x.user_id===context.user?.id),recordings:(await store.all('recordings')).filter(x=>x.user_id===context.user?.id)};}
export function flush(){return syncing ||= flushNow().finally(()=>{syncing=null;});}
async function flushNow(){
  if(!context.user||!navigator.onLine)return {offline:true,results:[]};
  const userId=context.user.id,p=await pending(),results=[];
  // Recordings go first so subsequent self-review can refer to accepted recording events.
  for(const r of p.recordings){
    if(context.user?.id!==userId)break;
    try{const result=await api('/recordings/'+r.event_id,{method:'PUT',body:r.blob,headers:{'Content-Type':r.blob.type,'X-Lesson-Id':r.lesson_id,'X-Content-Version':r.content_version,'X-Device-Id':r.device_id,'X-Occurred-At':r.occurred_at}});await store.remove('recordings',r.event_id);results.push({ok:true,event_id:r.event_id,recording:result});}
    catch(error){if(error.status===401||error.status===403)throw error;results.push({ok:false,event_id:r.event_id,error:error.message});}
  }
  for(let offset=0;offset<p.events.length;offset+=100){
    if(context.user?.id!==userId)break;
    const response=await api('/events',{method:'POST',body:JSON.stringify({events:p.events.slice(offset,offset+100).map(x=>x.event)})});
    for(const r of response.results){results.push(r);if(r.ok)await store.remove('events',r.event_id);else{const original=await store.get('events',r.event_id);if(original)await store.put('events',r.event_id,{...original,error:r.error});}}
  }
  return {results};
}
