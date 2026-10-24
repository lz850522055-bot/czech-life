// Keep the legacy main-story key byte-for-byte unchanged.
export function workDraftKey(user,mission,task,review,attempt,{perAttempt=false}={}){
  return user+'|'+mission+'|'+task+(review?'|review:'+(review.unit_id||mission)+':'+attempt:perAttempt?'|attempt:'+attempt:'');
}
export function newerRun(local,position,mission){
  if(!position||position.mission_id!==mission.id)return local;
  const remoteTime=Date.parse(position.at)||0,localTime=Date.parse(local?.at)||0;
  if(local&&localTime>=remoteTime)return local;
  return {attempt:position.attempt_id,step:position.step,started:position.started,version:mission.version,task_id:mission.tasks[position.step]?.id,at:position.at,review_context:position.review_context||null};
}
