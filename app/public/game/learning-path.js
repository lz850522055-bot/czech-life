// Source-aware evidence. A solved question is evidence about that activity,
// never an automatic CEFR certificate or an assessment of free speech.
export function sourceContext(mission,task){
  if(!mission||!task)return null;
  const at=mission.tasks.findIndex(t=>t.id===task.id);if(at<0)return null;
  if(task.learning_context){const source=task.kind==='source'?task:mission.tasks.slice(0,at).reverse().find(t=>t.kind==='source'&&t.learning_context===task.learning_context);return source?{source,context_id:task.learning_context}:null;}
  if(task.kind==='source'){
    const later=mission.tasks.slice(at+1),end=later.findIndex(t=>t.kind==='source'),group=end<0?later:later.slice(0,end),assessment=group.find(t=>t.source_assessment)?.source_assessment;
    return assessment?{source:task,context_id:assessment}:null;
  }
  if(!task.source_assessment)return null;
  const source=mission.tasks.slice(0,at).reverse().find(t=>t.kind==='source');
  return source?{source,context_id:task.source_assessment}:null;
}
export const materialHint=sourceId=>'material_translation:'+sourceId;
export function materialHintSource(answer){return typeof answer==='string'&&answer.startsWith('material_translation:')?answer.slice(21):null;}
export function materialHelpApplies(hintMission,hintTask,hintAnswer,targetMission,targetTask){
  const id=materialHintSource(hintAnswer);if(!id)return false;
  const a=sourceContext(hintMission,hintTask),b=sourceContext(targetMission,targetTask);
  return !!(a&&b&&a.source.id===id&&a.context_id===b.context_id&&a.source.fingerprint===b.source.fingerprint);
}
const refKey=r=>r.mission_id+'|'+r.task_id;
export function learningUnitFor(paths,missionId,taskId){return paths?.units.find(u=>u.mission_id===missionId&&u.refs.some(r=>r.task_id===taskId))||paths?.units.find(u=>u.refs.some(r=>r.mission_id===missionId&&r.task_id===taskId))||null;}
export function reviewRoute(unit,progress,sourceRef=null){
  if(!unit)return null;
  const states=new Map((progress.missions||[]).map(m=>[m.id,m.tasks||{}])),record=r=>states.get(r.mission_id)?.[r.task_id];
  const from=sourceRef?unit.refs.find(r=>r.mission_id===sourceRef.mission_id&&r.task_id===sourceRef.task_id):unit.refs.find(r=>r.phase==='practice')||unit.refs.find(r=>r.phase==='teach'),pool=unit.refs.filter(r=>['challenge','return'].includes(r.phase)&&r.task_id!==from?.task_id&&r.context_id!==from?.context_id);
  const usedContexts=new Set(unit.refs.filter(r=>{const s=record(r),material=r.source_task_id&&states.get(r.mission_id)?.[r.source_task_id];return s?.seen||s?.tries||s?.work_saved||s?.helped||s?.dialogue_node||s?.dialogue_done||material?.seen||material?.helped;}).map(r=>r.context_id));
  const rank=r=>{const s=record(r);return (!s?.tries&&!s?.work_saved&&!s?.dialogue_node?0:s?.last_score===0?1:2)+(r.phase==='return'?3:0)+(r.open?1:0)+(usedContexts.has(r.context_id)?20:0);};
  const next=pool.filter(r=>r.kind!=='travel').sort((a,b)=>rank(a)-rank(b)).find(r=>{const s=record(r);return !s?.solved&&!s?.work_saved&&!s?.dialogue_done;});
  if(next){const known=usedContexts.has(next.context_id);return {...next,unit_id:unit.id,mode:known?'same_material':'new_context',label:known?'接着这份材料练':'去新的情境里试',prerequisites:unit.prerequisites};}
  const replay=from||unit.refs.find(r=>r.phase==='practice')||unit.refs.find(r=>r.phase==='teach');
  return replay?{...replay,unit_id:unit.id,mode:'replay',label:'回看旧任务',prerequisites:unit.prerequisites}:null;
}
export function projectLearning(paths,events,{now=Date.now()}={}){
  if(!paths)return {units:[],version:0};
  const byTask=new Map();for(const u of paths.units)for(const r of u.refs){const k=refKey(r);if(!byTask.has(k))byTask.set(k,[]);byTask.get(k).push([u,r]);}
  const units=new Map(),ordered=[...events].sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.event_id.localeCompare(b.event_id));
  for(const e of ordered){if(['position','board'].includes(e.kind))continue;for(const [u,r]of byTask.get(e.mission_id+'|'+e.task_id)||[]){
    const s=units.get(u.id)||{id:u.id,seen:new Set(),helped:new Set(),independent:[],later:[],works:[],conversations:new Set(),arrivals:new Set(),self_reviews:0,failures:new Map(),last_at:null};units.set(u.id,s);s.last_at=e.occurred_at;
    if(e.kind==='dialogue'&&e.feedback?.complete)s.conversations.add(refKey(r));
    if(e.kind==='view')s.seen.add(refKey(r));
    if(e.kind==='hint'){s.helped.add(refKey(r));s.last_help_at=e.occurred_at;}
    if(e.kind==='work'){s.works.push({event_id:e.event_id,mission_id:e.mission_id,task_id:e.task_id,assisted:!!e.feedback?.assisted,at:e.occurred_at});if(e.feedback?.assisted){s.helped.add(refKey(r));s.last_help_at=e.occurred_at;}}
    if(e.kind==='review')s.self_reviews++;
    if(e.kind==='answer'&&e.feedback?.evidence==='city_arrival'){if(e.feedback.score===1)s.arrivals.add(refKey(r));continue;}
    if(e.kind==='answer'){
      if(e.feedback?.score===0)s.failures.set(refKey(r),r);else if(e.feedback?.score===1)s.failures.delete(refKey(r));
      if(e.feedback?.score===1&&e.feedback.assisted){s.helped.add(refKey(r));s.last_help_at=e.occurred_at;}
      if(e.feedback?.score===1&&!e.feedback.assisted){
        const proof={event_id:e.event_id,mission_id:e.mission_id,task_id:e.task_id,context_id:r.context_id,attempt_id:e.attempt_id,at:e.occurred_at,type:e.feedback.evidence||'structured_activity'};
        if(['challenge','return'].includes(r.phase)&&s.independent.some(p=>p.context_id!==proof.context_id&&p.task_id!==proof.task_id&&p.attempt_id!==proof.attempt_id&&Date.parse(proof.at)-Date.parse(p.at)>=86400000))s.later.push(proof);
        s.independent.push(proof);
      }
    }
  }}
  return {version:paths.version,units:[...units.values()].map(s=>({id:s.id,seen:s.seen.size,helped:s.helped.size,independent:s.independent.length,later:s.later.length,works:s.works.length,conversations:s.conversations.size,arrivals:s.arrivals.size,self_reviews:s.self_reviews,last_at:s.last_at,last_independent:s.independent.slice(-2),last_works:s.works.slice(-2),needs_review:s.failures.size>0||!!s.last_help_at&&(!s.independent.length||Date.parse(s.last_help_at)>Date.parse(s.independent.at(-1).at))||!!s.independent.length&&now-Date.parse(s.independent.at(-1).at)>=3*86400000,failed:[...s.failures.values()].slice(0,3).map(r=>({mission_id:r.mission_id,task_id:r.task_id}))}))};
}
