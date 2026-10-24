// A view may receive an older offline event after a newer session snapshot.
// Keep lifetime history while selecting current help deterministically.
const latest=(oldAt,oldId,event)=>!oldAt||Date.parse(event.occurred_at)>Date.parse(oldAt)||Date.parse(event.occurred_at)===Date.parse(oldAt)&&String(event.event_id||'')>=String(oldId||'');
export function mergeTaskHint(record,event){
  const next={...record,helped:true};
  if(latest(record.hint_at,record.hint_event_id,event))Object.assign(next,{hint_at:event.occurred_at,hint_event_id:event.event_id,hint_attempt:event.attempt_id,last_hint:event.answer,last_help:event.received_at||event.occurred_at});
  if(typeof event.answer==='string'&&event.answer.startsWith('material_translation:')&&latest(record.material_help?.at,record.material_help?.event_id,event))next.material_help={source_task_id:event.answer.slice(21),attempt_id:event.attempt_id,at:event.occurred_at,event_id:event.event_id};
  if(event.answer==='native_transcript'&&latest(record.native_transcript_help?.at,record.native_transcript_help?.event_id,event))next.native_transcript_help={attempt_id:event.attempt_id,at:event.occurred_at,event_id:event.event_id};
  return next;
}
export const taskWasHelped=(record,attempt)=>!!attempt&&record?.hint_attempt===attempt;
export const hintPayload=(context,fallback='opened')=>context?.source?.id?'material_translation:'+context.source.id:fallback;
export const legacyDraftOwnerKey=user=>user+'|district-legacy-draft-owner:v1';
export function legacyDraftForAttempt(owner,attempt,draft,savedAt=null){
  if(!attempt||owner?.attempt_id!==attempt||!draft||typeof draft!=='object')return null;
  if(savedAt&&(!draft.at||Date.parse(draft.at)<=Date.parse(savedAt)))return null;
  return {...draft,attempt_id:attempt};
}
