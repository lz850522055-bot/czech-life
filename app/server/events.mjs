import { canonical, hash, fail, now, assertString, normalizeAnswer, validId } from './util.mjs';
import { getItem, curriculum } from './content.mjs';
import { transaction } from './db.mjs';
import {listeningSession,listeningKey,projectListeningEvent} from '../public/advanced-listening.js';
import {scenarioSnapshotError,projectScenarioEvent} from '../public/scenarios.js';

const OPEN=new Set(['writing','speaking','interaction','mediation']);
const FEEDBACK={pronunciation:'把目标声音单独读清楚，再放回原句；比较长短、舌位和重音，不给未经测量的音素分。',spelling:'保留捷语附加符号，按字母重新比对；长音符会改变词义。',inflection:'先找谁在做、作用于谁，再看动词或介词需要哪种词尾。',meaning:'回到上下文：这个词在此处指的是什么？',collocation:'把整组常见搭配一起记，避免按中文逐词拼接。',word_order:'先确认信息重点，再检查短代词和助动词的位置。',comprehension:'先找人物、时间和转折，再重新提取题目要求的信息。',fluency:'先完整表达一条意思，再增加理由与衔接；不以快慢代替准确度。'};
export function scoreExercise(exercise,answer,assisted=false) {
  if(typeof answer!=='string' || answer.length>20000 || !answer.trim()) fail(400,'请先填写或录下你的回答。');
  const base={explanation:exercise.explanation_zh,model_answer:exercise.answer,scoring_basis:exercise.scoring_basis,rubric:exercise.rubric||[],error_category:exercise.error_category||'comprehension'};
  if(OPEN.has(exercise.type)) return {...base,status:'needs_self_review',score:null,independent:false,message:'回答已保存，请按量规对照；开放表达没有被自动判为正确。'};
  if(exercise.type==='choice' && !exercise.options.some(o=>String(typeof o==='object'?o.id:o)===answer)) fail(400,'请选择题目中的一个有效选项。');
  const accepted=[exercise.answer,...(exercise.accepted_answers||[])].map(normalizeAnswer);
  const correct=accepted.includes(normalizeAnswer(answer));
  return {...base,status:correct?'correct':'try_again',score:correct?1:0,independent:correct&&!assisted&&exercise.type!=='choice',message:correct?(assisted?'参考答案后的练习已记录，不计独立完成证据。':'符合本题答案依据。'):(FEEDBACK[exercise.error_category]||FEEDBACK.comprehension)};
}
function validateEvent(event) {
  if(!event||typeof event!=='object'||!validId(event.event_id)||event.event_id.length<8||!validId(event.device_id)) fail(400,'事件或设备ID无效。');
  if(!['exercise','position','lesson_complete','feedback','note','recording','self_review','transfer','listening'].includes(event.kind)) fail(400,'不支持的事件类型。');
  if(!validId(event.lesson_id)) fail(400,'课程ID无效。');
  assertString(event.content_version,'教材版本',50);
  const t=Date.parse(event.occurred_at);
  if(!Number.isFinite(t)||t<Date.UTC(2000,0,1)||t>Date.now()+300000) fail(400,'事件时间无效，请检查设备时间。');
}
export function acceptEvent(db,userId,input) {
  validateEvent(input);
  const e={event_id:input.event_id,device_id:input.device_id,kind:input.kind,lesson_id:input.lesson_id,exercise_id:input.exercise_id||null,content_version:input.content_version,answer:input.answer??'',occurred_at:new Date(input.occurred_at).toISOString(),assisted:Boolean(input.assisted)};
  // Keep old event hashes byte-compatible: context is absent on legacy attempts.
  if(input.context!==undefined){
    if(input.context?.activity!=='advanced_listening'||typeof input.context.session_id!=='string')fail(400,'听力练习上下文无效。');
    e.context={activity:'advanced_listening',session_id:input.context.session_id};
  }
  const digest=hash(canonical(e));
  const previous=db.prepare('SELECT seq,feedback,received_at,payload_hash FROM attempt_events WHERE user_id=? AND event_id=?').get(userId,e.event_id);
  if(previous) {
    if(previous.payload_hash!==digest) fail(409,'相同事件ID携带了不同内容；原记录已保留。','EVENT_CONFLICT');
    return {event_id:e.event_id,seq:previous.seq,duplicate:true,received_at:previous.received_at,feedback:JSON.parse(previous.feedback)};
  }
  const lesson=getItem(db,e.lesson_id,e.content_version);
  const session=listeningSession(lesson);
  if(e.context&&(e.kind!=='exercise'||!session||e.context.session_id!==session.id||!session.exercise_ids.includes(e.exercise_id)))fail(400,'练习不属于该版本听力任务。');
  const exposureBefore=time=>db.prepare("SELECT answer,occurred_at FROM attempt_events WHERE user_id=? AND lesson_id=? AND content_version=? AND kind='listening' AND occurred_at<=?").all(userId,e.lesson_id,e.content_version,time).some(r=>JSON.parse(r.answer).action==='exposure');
  let feedback={status:'recorded',score:null,message:'记录已保存。'}, exercise=null, skills=[];
  if(e.kind==='exercise') {
    exercise=lesson.exercises.find(x=>x.id===e.exercise_id);
    if(!exercise) fail(400,'练习不属于该课程版本。');
    const assisted=e.assisted||(e.context?.activity==='advanced_listening'&&exposureBefore(e.occurred_at));
    feedback={...scoreExercise(exercise,e.answer,assisted),assisted}; skills=exercise.skill_ids;
  } else if(e.kind==='listening') {
    const a=e.answer;
    if(!session||!a||typeof a!=='object'||a.session_id!==session.id||!['exposure','draft','summary'].includes(a.action))fail(400,'听力记录无效。');
    if(a.action==='exposure'){
      if(!['before_attempt','after_attempt','outside_listening'].includes(a.reason))fail(400,'原文查看记录无效。');
      feedback.message='原文查看已记录，之后作答为辅助练习；此操作不计完成或能力分数。';
    }else{
      if(typeof a.text!=='string'||a.text.length>20000||(a.action==='summary'&&!a.text.trim()))fail(400,'请填写有效的听后记录。');
      if(a.action==='summary'&&session.exercise_ids.length)fail(400,'请逐题提交这组听力任务。');
      if(a.exercise_id&&!session.exercise_ids.includes(a.exercise_id))fail(400,'草稿不属于该版本听力任务。');
      if(a.action==='draft'&&session.exercise_ids.length&&!a.exercise_id)fail(400,'缺少草稿题目。');
      feedback={status:'recorded',score:null,independent:false,assisted:e.assisted||exposureBefore(e.occurred_at),message:a.action==='draft'?'听力草稿已同步。':'听后概述已同步，仅记录表达，不自动评分。'};
    }
  } else if(e.kind==='transfer') {
    assertString(e.answer,'迁移表达',20000);
    if(!lesson.transfer_task)fail(400,'此课没有迁移任务。');
    feedback={status:'needs_self_review',score:null,independent:false,message:'迁移表达已保存，请按量规核对；未自动判为掌握。',model_answer:lesson.transfer_task.model_answer_cs,rubric:lesson.transfer_task.rubric,scoring_basis:'开放迁移任务：量规自评，不自动评分'};
    let snapshot;try{snapshot=JSON.parse(e.answer);}catch{}
    if(snapshot?.activity==='dialogue_branch'){
      const problem=scenarioSnapshotError(snapshot,e);if(problem)fail(400,problem);
      feedback={status:'recorded',score:null,independent:false,message:'场景回应与路径已保存；选择理解不等于独立口语能力。',scoring_basis:'分支选择的原文快照，仅记录情境练习，不自动评分'};
    }
  } else if(e.kind==='feedback') {
    if(!['confusing','too_easy','too_hard','change_topic'].includes(e.answer)) fail(400,'未知学习反馈。');
    feedback.message={confusing:'下次先从对比例子和词汇入手，再回到规律。',too_easy:'已记录；建议尝试下一课或本单元迁移任务。',too_hard:'已记录；建议先回到本课先修内容。',change_topic:'已记录；首页将优先展示其他兴趣场景。'}[e.answer];
  } else if(e.kind==='position') {
    if(!e.answer||typeof e.answer!=='object'||!['text','grammar','practice','transfer','listening','phonetics'].includes(e.answer.tab)||!Number.isInteger(e.answer.step)||e.answer.step<0||e.answer.step>500) fail(400,'学习位置无效。');
    if(e.answer.tab==='phonetics'&&e.lesson_id!=='Pre-A1-U01-L01')fail(400,'发音起步位置只适用于零基础第一课。');
  } else if(e.kind==='note') assertString(e.answer,'笔记',10000);
  else if(e.kind==='self_review') {
    if(!e.answer||!['independent','with_help','retry'].includes(e.answer.rating)||!validId(e.answer.related_event_id)) fail(400,'自评内容无效。');
    const related=db.prepare('SELECT kind,lesson_id FROM attempt_events WHERE user_id=? AND event_id=?').get(userId,e.answer.related_event_id);
    if(!related||related.lesson_id!==e.lesson_id||!['exercise','recording'].includes(related.kind)) fail(400,'自评必须关联自己的回答或录音。');
    feedback.message='自评已记录，和系统客观题证据分开呈现。';
  } else if(e.kind==='lesson_complete') {
    if(e.answer!=='complete') fail(400,'完成标记无效。');
    feedback.message='本课学习标记已保存；完成课程不等于通过能力认证。';
  }
  const received=now();
  return transaction(db,()=>{
    const inserted=db.prepare('INSERT INTO attempt_events(event_id,user_id,device_id,kind,lesson_id,exercise_id,content_version,skill_ids,answer,feedback,scoring_basis,occurred_at,received_at,payload_hash,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(e.event_id,userId,e.device_id,e.kind,e.lesson_id,e.exercise_id,e.content_version,JSON.stringify(skills),JSON.stringify(e.answer),JSON.stringify(feedback),feedback.scoring_basis||'不可自动评分',e.occurred_at,received,digest,JSON.stringify(e));
    if(exercise) {
      for(const skill of skills) for(const kp of (exercise.knowledge_points?.length?exercise.knowledge_points:(lesson.knowledge_points?.slice(0,1)||['general']))) {
        db.prepare('INSERT INTO mastery_evidence VALUES (?,?,?,?,?,?,?,?,?,?)').run(hash(`${userId}|${e.event_id}|${skill}|${kp}`),userId,e.event_id,skill,kp,feedback.score,feedback.independent?1:0,feedback.score===0?feedback.error_category:null,e.occurred_at,feedback.score===null?'open_submission':(exercise.type==='choice'?'recognition':'production'));
        if(feedback.score!==null) rebuildReview(db,userId,skill,kp,e.lesson_id);
      }
    }
    if(e.kind==='listening'&&e.answer.action==='exposure'){
      // An offline disclosure may arrive after its later answers. Reconcile those
      // answers too, while keeping original immutable request payloads for retry hashes.
      const affected=db.prepare("SELECT event_id,kind,payload,feedback FROM attempt_events WHERE user_id=? AND lesson_id=? AND content_version=? AND kind IN ('exercise','listening') AND occurred_at>=?").all(userId,e.lesson_id,e.content_version,e.occurred_at);
      for(const row of affected){
        const payload=JSON.parse(row.payload);
        if(row.kind==='exercise'?payload.context?.activity!=='advanced_listening':!['summary','draft'].includes(payload.answer?.action))continue;
        const f=JSON.parse(row.feedback);f.assisted=true;f.independent=false;
        if(f.score===1)f.message='参考原文后的练习已记录，不计独立完成证据。';
        db.prepare('UPDATE attempt_events SET feedback=? WHERE user_id=? AND event_id=?').run(JSON.stringify(f),userId,row.event_id);
        db.prepare('UPDATE mastery_evidence SET independent=0 WHERE user_id=? AND event_id=?').run(userId,row.event_id);
      }
    }
    if(e.kind==='note') db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?)').run(hash(userId+e.event_id),userId,e.lesson_id,e.answer,e.occurred_at,e.event_id);
    return {event_id:e.event_id,seq:Number(inserted.lastInsertRowid),duplicate:false,received_at:received,feedback};
  });
}
export function rebuildReview(db,userId,skill,kp,lessonId) {
  const rows=db.prepare('SELECT * FROM mastery_evidence WHERE user_id=? AND skill_id=? AND knowledge_point=? AND score IS NOT NULL ORDER BY occurred_at,event_id').all(userId,skill,kp);
  const settings=JSON.parse(db.prepare('SELECT settings FROM users WHERE id=?').get(userId).settings);
  const scale=Number(settings.reviewScale)||1;
  let repetitions=0,days=1,last=null;
  for(const r of rows) { repetitions=r.score===1?Math.min(repetitions+1,5):0; days=([1,1,3,7,14,30][repetitions])*scale; last=r; }
  if(last) {
    const due=new Date(Date.parse(last.occurred_at)+days*86400000).toISOString();
    const actualLesson=db.prepare('SELECT lesson_id FROM attempt_events WHERE user_id=? AND event_id=?').get(userId,last.event_id)?.lesson_id||lessonId;
    db.prepare('INSERT OR REPLACE INTO review_queue VALUES (?,?,?,?,?,?,?,?)').run(userId,skill,kp,actualLesson,due,days,repetitions,last.event_id);
  }
}
export function progress(db,userId) {
  const userSettings=JSON.parse(db.prepare('SELECT settings FROM users WHERE id=?').get(userId).settings);
  const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:userSettings.timezone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
  const events=db.prepare('SELECT seq,event_id,device_id,kind,lesson_id,exercise_id,content_version,answer,feedback,occurred_at,received_at,payload FROM attempt_events WHERE user_id=? ORDER BY occurred_at,seq').all(userId).map(({payload,...e})=>({...e,context:JSON.parse(payload).context,answer:JSON.parse(e.answer),feedback:JSON.parse(e.feedback)}));
  const positions={},completed={},latest={},listening={},scenarios={};
  for(const e of events) {
    projectScenarioEvent(scenarios,e);
    if(e.kind==='listening'||e.context?.activity==='advanced_listening'){const key=e.lesson_id+'|'+e.content_version;listening[key]=projectListeningEvent(listening[key],e);}
    if(e.kind==='position') positions[e.lesson_id]={...e.answer,content_version:e.content_version,at:e.occurred_at};
    if(e.kind==='lesson_complete') completed[e.lesson_id]=e.occurred_at;
    if(e.kind==='exercise') latest[`${e.lesson_id}|${e.content_version}|${e.exercise_id}`]=e;
  }
  const evidences=db.prepare('SELECT * FROM mastery_evidence WHERE user_id=? ORDER BY occurred_at,event_id').all(userId);
  const skills={};
  for(const r of evidences) {
    const s=skills[r.skill_id] ||= {attempts:0,correct:0,independent:0,open_submissions:0,last_at:null,errors:{},knowledge:{}};
    if(r.score!==null) {s.attempts++;s.correct+=r.score;s.independent+=r.independent;} else s.open_submissions++;
    s.last_at=r.occurred_at;
    if(r.error_category) s.errors[r.error_category]=(s.errors[r.error_category]||0)+1;
    const k=s.knowledge[r.knowledge_point] ||= {attempts:0,correct:0,independent_dates:[],last_at:null};
    if(r.score!==null) {k.attempts++;k.correct+=r.score;}
    const localDay=dateFormatter.format(new Date(r.occurred_at));
    if(r.independent&&!k.independent_dates.includes(localDay)) k.independent_dates.push(localDay);
    k.last_at=r.occurred_at;k.status=k.independent_dates.length>=2?'repeated_independent_evidence':k.attempts?'practicing':'awaiting_output_review';
  }
  const reviews=db.prepare('SELECT * FROM review_queue WHERE user_id=? ORDER BY due_at').all(userId);
  const recent=events.filter(e=>['exercise','recording','feedback','lesson_complete','self_review','transfer'].includes(e.kind)).slice(-60).reverse();
  const notes=db.prepare('SELECT id,lesson_id,text,created_at FROM notes WHERE user_id=? ORDER BY created_at DESC').all(userId);
  const recordings=db.prepare('SELECT id,lesson_id,content_version,mime,bytes,created_at FROM recordings WHERE user_id=? ORDER BY created_at DESC').all(userId);
  const p={event_count:events.filter(e=>e.kind==='exercise').length,total_events:events.length,cursor:events.reduce((n,e)=>Math.max(n,e.seq),0),positions,completed,latest,listening,scenarios,skills,reviews,recent,notes,recordings,server_time:now()};
  p.recommendation=recommend(db,userId,p,events);
  return p;
}
export function recommend(db,userId,p,events) {
  const c=curriculum(db).lessons.filter(x=>x.kind==='lesson');
  const feedback=[...events].reverse().find(e=>e.kind==='feedback');
  const last=[...events].reverse().find(e=>e.kind!=='feedback');
  const selected=c.find(l=>l.id===(feedback?.lesson_id||last?.lesson_id));
  if(feedback&&(!last||feedback.occurred_at>=last.occurred_at)) {
    if(feedback.answer==='too_hard'&&selected?.prerequisites?.length) return {lesson_id:selected.prerequisites[0],reason:'你反馈这一课太难，先补一个相关先修点，再回来继续。'};
    if(feedback.answer==='confusing') return {lesson_id:feedback.lesson_id,tab:'grammar',reason:'你说解释没看懂：先看对比例子和易错点，再做主动改写。'};
    if(feedback.answer==='too_easy') {const next=c[c.findIndex(x=>x.id===feedback.lesson_id)+1];if(next)return {lesson_id:next.id,reason:'你反馈太简单，试试下一课的新条件与主动输出。'};}
    if(feedback.answer==='change_topic') {const other=c.find(x=>x.level===selected?.level&&x.scene!==selected?.scene&&!p.completed[x.id]);if(other)return {lesson_id:other.id,reason:'你想换主题，先在相近难度里换一个场景。'};}
  }
  const foundation=c.find(x=>x.id==='Pre-A1-U01-L01');
  const foundationPractice=events.some(e=>e.lesson_id===foundation?.id&&['exercise','transfer','lesson_complete'].includes(e.kind));
  if(foundation&&!p.completed[foundation.id]&&!foundationPractice)return {lesson_id:foundation.id,tab:'phonetics',reason:'从字母、音标和单个声音起步；只浏览高级课不会改变你的学习起点。'};
  const due=p.reviews.find(r=>r.due_at<=now());
  if(due) return {lesson_id:due.lesson_id,tab:'practice',reason:`${due.knowledge_point} 的复习已到期，换一种题型检验能否独立使用。`};
  if(last&&c.some(x=>x.id===last.lesson_id)&&!p.completed[last.lesson_id]) return {lesson_id:last.lesson_id,reason:'接着上次的位置学；已提交的回答都保留。'};
  const settings=JSON.parse(db.prepare('SELECT settings FROM users WHERE id=?').get(userId).settings);
  const interests=settings.interests||[];
  const next=c.find(x=>!p.completed[x.id]&&(x.prerequisites||[]).every(id=>p.completed[id]))||c.find(x=>!p.completed[x.id])||c[0];
  const interestMatch=interests.length&&c.find(x=>x.level===next?.level&&!p.completed[x.id]&&interests.some(i=>x.scene.includes(i)));
  return {lesson_id:(interestMatch||next)?.id||'Pre-A1-U01-L01',reason:interestMatch?'结合你选的兴趣场景，保持当前难度继续练。':'从声音与拼读起步，逐步建立能听懂、能表达的证据。'};
}
