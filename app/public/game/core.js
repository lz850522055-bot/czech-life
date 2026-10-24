import {mergeTaskHint} from './task-evidence.js?v=1';
// Shared deterministic learning rules. Used by both the local game and the server.
import {journeyNear} from './journey-rules.js';
export const GAME_VERSION='2026.10.24.12';
// Identity is derived from task content, not its position in a generated list.
// These fields only identify/trace the task and do not change the activity.
export function taskBody(task){const {id,fingerprint,source_assessment_exercise,...body}=task;return JSON.parse(JSON.stringify(body));}
export const LEVELS=['Pre-A1','A1','A2','B1','B2','C1','C2'];
export const normalize=v=>String(v??'').normalize('NFC').trim().toLocaleLowerCase('cs').replace(/\s+/g,' ').replace(/[.!?。！？]+$/,'');
export const isOpen=t=>['writing','speaking','interaction','mediation','work'].includes(t.kind);
export const EVIDENCE_RELATIONS={direct:'材料明确写明',conditional:'附带条件',unsupported:'材料不能推出',contradicted:'与材料明确相反'};
export function mergeBoardState(current={},event){
  const {source,pinned}=event.answer||{},previous=current[source];
  if(previous&&(Date.parse(previous.at)>Date.parse(event.occurred_at)||previous.at===event.occurred_at&&previous.event_id>event.event_id))return current;
  return {...current,[source]:{pinned,at:event.occurred_at,event_id:event.event_id}};
}
export function gradeTask(task,answer,{assisted=false}={}){
  const base={status:'recorded',score:null,independent:false,assisted,explanation:task.explanation||'',rubric:task.rubric||[],model:task.model||'',evidence:'participation'};
  if(isOpen(task)){
    if(typeof answer!=='string'||!answer.trim()||answer.length>20000)throw new Error('先写下你的表达或录音回听记录，再保存。');
    return {...base,status:'needs_self_review',message:'作品已保存；对照量规自查，不自动判为掌握。',evidence:'open_work'};
  }
  if(task.kind==='learn'||task.kind==='source')return {...base,status:'seen',message:'这条线索已收进图鉴。',evidence:'exposure'};
  let correct=false;
  if(task.kind==='travel'){
    if(!answer||typeof answer!=='object'||Array.isArray(answer)||Object.keys(answer).some(k=>!['player','place_id','position_event_id'].includes(k))||!Array.isArray(answer.player)||answer.player.length!==2||!answer.player.every(Number.isFinite)||typeof answer.position_event_id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(answer.position_event_id))throw new Error('先在城市里走近目标，再确认抵达。');
    correct=answer.place_id===task.travel.target.id&&journeyNear(answer.player,task.travel.target);
    return {...base,status:correct?'correct':'retry',score:correct?1:0,independent:false,evidence:'city_arrival',message:correct?'已抵达这处任务地点。接着和对方确认信息。':'你还没有走到目标附近，先沿街走近。'};
  }else if(task.kind==='evidence'){
    if(!answer||typeof answer!=='object'||Array.isArray(answer)||Object.keys(answer).some(k=>!['source','relation'].includes(k))||!task.sources?.includes(answer.source)||!Object.hasOwn(EVIDENCE_RELATIONS,answer.relation))throw new Error('先选本案例的一份材料，再判断它与说法的关系。');
    correct=answer.source===task.answer.source&&answer.relation===task.answer.relation;
    return {...base,status:correct?'correct':'retry',score:correct?1:0,independent:false,evidence:'source_relation',message:correct?'来源和判断都对上了。把限定保留下来，再用自己的话解释。':answer.source!==task.answer.source?'这份材料不是本题最直接的依据。回到原话，核对说的是谁、哪件事。':'来源找对了，再核对条件、否定范围和已经完成到哪一步。'};
  }else if(task.kind==='checkout'){
    if(!answer||typeof answer!=='object'||Array.isArray(answer)||Object.keys(answer).some(k=>!['quantity','total'].includes(k))||!Number.isSafeInteger(answer.quantity)||answer.quantity<0||answer.quantity>(task.shop?.max_quantity||9)||!Number.isSafeInteger(answer.total)||answer.total<0||answer.total>100000)throw new Error('请放好杯子，并填写有效的克朗整数金额。');
    correct=answer.quantity===task.answer.quantity&&answer.total===task.answer.total;
    return {...base,status:correct?'correct':'retry',score:correct?1:0,independent:false,evidence:'quantity_price_simulation',message:correct?'数量和总价都对上了。店主把这张游戏订单确认好了。':answer.quantity!==task.answer.quantity?'托盘的数量与这次委托不符，回货架调整，再核对价钱。':'数量已对上；总价还要按价牌重新核对。'};
  }else if(task.kind==='match'){
    if(!answer||typeof answer!=='object'||Array.isArray(answer))throw new Error('请完成声音与字母的配对。');
    const entries=Object.entries(task.answer);correct=entries.length===Object.keys(answer).length&&entries.every(([k,v])=>answer[k]===v);
  }else{
    if(typeof answer!=='string'||!answer.trim()||answer.length>20000)throw new Error('先完成这一步，再继续。');
    if(['choice','listen'].includes(task.kind)&&!task.options?.some(o=>String(o.id)===answer))throw new Error('请选择当前关卡里的有效选项。');
    correct=[task.answer,...(task.accepted||[])].some(v=>normalize(v)===normalize(answer));
  }
  const production=!['choice','listen','match'].includes(task.kind)&&task.field_scene?.operation!=='sequence';
  return {...base,status:correct?'correct':'retry',score:correct?1:0,independent:correct&&!assisted&&production,evidence:production?'production':'recognition',message:correct?(assisted?'借助提示完成，后面换个情境再试一次。':'机关打开了。看看下一条线索。'):(task.retry||'再试一次：先找关键声音或信息，需要时点提示。')};
}
export function shuffled(items,seed=''){
  let n=2166136261;for(const c of seed)n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;
  const out=[...items];for(let i=out.length-1;i>0;i--){n=(Math.imul(n,1664525)+1013904223)>>>0;const j=n%(i+1);[out[i],out[j]]=[out[j],out[i]];}return out;
}
export function taskDone(task,record){return !!(record&&(task.kind==='dialogue'?record.dialogue_done:isOpen(task)?record.work_saved:['learn','source'].includes(task.kind)?record.seen:record.solved));}
export function projectEvents(catalog,events){
  const missions={},works=[],positions=[],case_boards={};
  for(const e of events){
    if(e.kind==='board'){case_boards[e.mission_id]=mergeBoardState(case_boards[e.mission_id],e);continue;}
    const m=missions[e.mission_id]??={tasks:{},visited:false};
    if(e.kind==='position'){positions.push(e);continue;}
    m.visited=true;if(!e.task_id)continue;
    const t=m.tasks[e.task_id]??={seen:false,helped:false,solved:false,independent:false,work_saved:false,dialogue_done:false,tries:0};
    if(e.kind==='view'){t.seen=true;if(!t.view_at||Date.parse(e.occurred_at)>=Date.parse(t.view_at)){t.view_attempt=e.attempt_id;t.view_at=e.occurred_at;}}
    if(e.kind==='hint')Object.assign(t,mergeTaskHint(t,e));
    if(e.kind==='answer'&&catalog.missions.find(m=>m.id===e.mission_id)?.tasks.find(x=>x.id===e.task_id)?.kind==='listen'&&(!t.last_listen||Date.parse(e.occurred_at)>=Date.parse(t.last_listen.at)))t.last_listen={attempt_id:e.attempt_id,answer:e.answer,assisted:!!e.feedback?.assisted,at:e.occurred_at};
    if(e.kind==='answer'){t.tries++;t.last_score=e.feedback?.score;t.last_answer_at=e.received_at;if(e.feedback?.evidence==='quantity_price_simulation'&&(!t.last_checkout||Date.parse(e.occurred_at)>=Date.parse(t.last_checkout.occurred_at)))t.last_checkout={quantity:e.answer.quantity,total:e.answer.total,attempt_id:e.attempt_id,occurred_at:e.occurred_at,assisted:!!e.feedback.assisted};if(e.feedback?.evidence==='source_relation'&&(!t.last_evidence||Date.parse(e.occurred_at)>=Date.parse(t.last_evidence.occurred_at)))t.last_evidence={...e.answer,attempt_id:e.attempt_id,occurred_at:e.occurred_at,assisted:!!e.feedback.assisted};if(e.feedback?.score===1){t.solved=true;t.independent ||= !!e.feedback.independent;t.recognition ||= e.feedback.evidence==='recognition'&&!e.feedback.assisted;t.last_success=e.received_at;}}
    if(e.kind==='answer'&&e.feedback?.evidence==='city_arrival'&&e.feedback.score===1&&(!t.last_arrival||Date.parse(e.occurred_at)>=Date.parse(t.last_arrival.at)))t.last_arrival={attempt_id:e.attempt_id,at:e.occurred_at,player:e.answer.player,position_event_id:e.answer.position_event_id};
    if(e.kind==='dialogue'){t.dialogue_done ||= !!e.feedback?.complete;if(!t.dialogue_occurred_at||Date.parse(e.occurred_at)>=Date.parse(t.dialogue_occurred_at)){t.dialogue_node=e.feedback?.next;t.dialogue_at=e.received_at;t.dialogue_attempt=e.attempt_id;t.dialogue_occurred_at=e.occurred_at;}}
    if(e.kind==='work'){t.work_saved=true;t.last_work_id=e.event_id;works.push({event_id:e.event_id,attempt_id:e.attempt_id,mission_id:e.mission_id,task_id:e.task_id,answer:e.answer,recording_id:e.feedback?.recording_id||null,assisted:!!e.feedback?.assisted,at:e.received_at,self_review:null});}
    if(e.kind==='review'){t.self_review=e.answer.rating;const w=works.find(w=>w.event_id===e.answer.related_event_id);if(w)w.self_review=e.answer.rating;}
  }
  const summaries=catalog.missions.map(m=>{
    const state=missions[m.id]||{tasks:{},visited:false};let done=0;
    for(const t of m.tasks){if(taskDone(t,state.tasks[t.id]))done++;}
    return {id:m.id,level:m.level,title:m.title,done,total:m.tasks.length,complete:done===m.tasks.length,visited:state.visited,tasks:state.tasks};
  });
  const first=catalog.missions.find(m=>m.foundation&&!summaries.find(s=>s.id===m.id)?.complete)||catalog.missions.find(m=>!summaries.find(s=>s.id===m.id)?.complete)||catalog.missions[0];
  // Merely browsing an advanced chapter must never replace the beginner route.
  const byTime=(a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)||a.event_id.localeCompare(b.event_id);
  const journey_runs={};for(const mission of catalog.missions.filter(m=>m.journey_story||m.city_excursion)){const run=positions.filter(e=>e.mission_id===mission.id&&!e.answer?.city&&!e.answer?.review_context).sort(byTime).at(-1);if(run)journey_runs[mission.id]={...run.answer,mission_id:mission.id,attempt_id:run.attempt_id,at:run.occurred_at};}
  const last=positions.filter(e=>e.answer?.started&&!e.answer.review_context&&summaries.some(m=>m.id===e.mission_id&&m.visited)).sort(byTime).at(-1);
  const lastReview=positions.filter(e=>e.answer?.review_context).sort(byTime).at(-1);
  const foundationPending=summaries.some(m=>catalog.missions.find(x=>x.id===m.id)?.foundation&&!m.complete);
  const recommended=foundationPending?first?.id:(last?.mission_id||first?.id);
  const movementIds=new Set(catalog.missions.flatMap(m=>m.tasks.filter(t=>t.kind==='travel').map(t=>t.id))),due=[];for(const m of summaries)for(const [task_id,t]of Object.entries(m.tasks)){if(movementIds.has(task_id))continue;if(t.last_score===0)due.push({mission_id:m.id,task_id,reason:'上次这里还没解开'});else if(t.last_success&&Date.now()-Date.parse(t.last_success)>3*86400000)due.push({mission_id:m.id,task_id,reason:'换个情境，看看还会不会'});}
  const mapPosition=positions.filter(e=>e.answer?.city).sort((a,b)=>Date.parse(a.occurred_at)-Date.parse(b.occurred_at)).at(-1)?.answer.city||null;
  return {missions:summaries,recommended,journey_runs,case_boards,map_position:mapPosition,position:last?{...last.answer,mission_id:last.mission_id,attempt_id:last.attempt_id,at:last.occurred_at}:null,review_position:lastReview&&!lastReview.answer.review_context.completed?{...lastReview.answer,mission_id:lastReview.mission_id,attempt_id:lastReview.attempt_id,at:lastReview.occurred_at}:null,works:works.slice(-30).reverse(),review:due.slice(0,20),worlds:catalog.worlds.map(w=>({...w,complete:summaries.filter(m=>m.level===w.id&&m.complete).length,total:summaries.filter(m=>m.level===w.id).length}))};
}
