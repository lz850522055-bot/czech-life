import fs from 'node:fs';
import path from 'node:path';
import {canonical,hash,fail,validId,now} from './util.mjs';
import {transaction} from './db.mjs';
import {gradeTask,projectEvents,isOpen,taskBody} from '../public/game/core.js';
import {sourceContext,materialHintSource,materialHelpApplies,learningUnitFor,projectLearning,reviewRoute} from '../public/game/learning-path.js';
import {missingJourneyEvents,journeyNear} from '../public/game/journey-rules.js';

export function installGame(db,cfg){
  db.exec(`CREATE TABLE IF NOT EXISTS game_catalogs(version TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS game_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,device_id TEXT NOT NULL,version TEXT NOT NULL REFERENCES game_catalogs(version),mission_id TEXT NOT NULL,task_id TEXT,attempt_id TEXT NOT NULL,kind TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,feedback TEXT NOT NULL,occurred_at TEXT NOT NULL,received_at TEXT NOT NULL,UNIQUE(user_id,event_id));
  CREATE INDEX IF NOT EXISTS game_events_user_seq ON game_events(user_id,seq);
  CREATE INDEX IF NOT EXISTS game_events_attempt ON game_events(user_id,attempt_id,mission_id,task_id);`);
  const file=path.join(cfg.contentDir,'game/catalog.json');
  if(!fs.existsSync(file))return null;
  const catalog=JSON.parse(fs.readFileSync(file,'utf8')),raw=canonical(catalog),digest=hash(raw);
  const old=db.prepare('SELECT sha256 FROM game_catalogs WHERE version=?').get(catalog.version);
  if(old&&old.sha256!==digest)throw new Error('游戏内容版本已存在且不同；请提升版本，不能覆盖历史。');
  db.prepare('INSERT OR IGNORE INTO game_catalogs VALUES (?,?,?,?)').run(catalog.version,digest,raw,now());
  const byVersion=new Map([[catalog.version,catalog]]);
  // Authored street anchors are registered assets, not arbitrary place names.
  // Historical IPR ids remain valid so an update never strands old cursors.
  const sceneIndex=path.join(cfg.publicDir,'game/scenes/manifest.v2.json');
  const authoredPlaceIds=new Set(fs.existsSync(sceneIndex)?JSON.parse(fs.readFileSync(sceneIndex,'utf8')).scenes.flatMap(s=>(s.places||[]).map(p=>p.id)):[]);
  const getVersion=v=>{if(byVersion.has(v))return byVersion.get(v);const row=db.prepare('SELECT payload FROM game_catalogs WHERE version=?').get(v);if(!row)fail(409,'这份关卡版本尚未导入，请联网更新后重试。','GAME_VERSION');const c=JSON.parse(row.payload);byVersion.set(v,c);return c;};
  const indexes=new Map();
  const index=v=>{if(indexes.has(v))return indexes.get(v);const result=new Map();for(const m of getVersion(v).missions){const tasks=new Map(),groups=new Map();for(const t of m.tasks){const fingerprint=hash(canonical(taskBody(t))),group=groups.get(fingerprint)||[];tasks.set(t.id,{task:t,fingerprint,ordinal:group.length});group.push(t);groups.set(fingerprint,group);}result.set(m.id,{mission:m,tasks,groups});}indexes.set(v,result);return result;};
  const taskInfo=(version,mission,id)=>index(version).get(mission)?.tasks.get(id);
  function mappedTask(version,mission,id){const old=taskInfo(version,mission,id),target=index(catalog.version).get(mission);if(!old||!target)return null;return target.groups.get(old.fingerprint)?.[old.ordinal]||null;}
  function applicable(events){return events.flatMap(e=>{if(e.version===catalog.version)return [e];const target=index(catalog.version).get(e.mission_id);if(!target)return [];if(e.kind==='board')return target.mission.case_board?.sources.some(s=>s.id===e.answer.source)?[e]:[];if(e.kind==='position'){const old=index(e.version).get(e.mission_id)?.mission.tasks[e.answer?.step],mapped=old?mappedTask(e.version,e.mission_id,old.id):null,step=mapped?target.mission.tasks.indexOf(mapped):0;return [{...e,answer:{...e.answer,step,started:!!(mapped&&e.answer?.started)}}];}const task=mappedTask(e.version,e.mission_id,e.task_id);return task?[{...e,task_id:task.id}]:[];});}
  const readEvents=(user,after=0)=>db.prepare('SELECT seq,payload,feedback,received_at FROM game_events WHERE user_id=? AND seq>? ORDER BY seq').all(user,after).map(r=>({...JSON.parse(r.payload),seq:r.seq,feedback:JSON.parse(r.feedback),received_at:r.received_at}));
  function accept(user,input){
    if(!input||!validId(input.event_id)||input.event_id.length<8||!validId(input.device_id)||!validId(input.attempt_id))fail(400,'游戏事件或设备标识无效。');
    if(!['view','hint','answer','work','review','position','dialogue','board'].includes(input.kind))fail(400,'未知游戏动作。');
    const stamp=Date.parse(input.occurred_at);if(!Number.isFinite(stamp)||stamp<Date.UTC(2000,0,1)||stamp>Date.now()+300000)fail(400,'游戏时间无效，请检查设备时间。');
    const c=getVersion(input.version),mission=c.missions.find(m=>m.id===input.mission_id);if(!mission)fail(400,'这份版本没有这个任务。');
    const task=mission.tasks.find(t=>t.id===input.task_id);
    if(!['position','board'].includes(input.kind)&&!task)fail(400,'关卡步骤不存在。');
    const event={event_id:input.event_id,device_id:input.device_id,attempt_id:input.attempt_id,version:input.version,mission_id:mission.id,task_id:task?.id||null,kind:input.kind,answer:input.answer??null,assisted:Boolean(input.assisted),occurred_at:new Date(stamp).toISOString()};
    if(input.position_event_id!==undefined){if(!validId(input.position_event_id))fail(400,'城市位置凭据无效。');event.position_event_id=input.position_event_id;}
    if(JSON.stringify(event).length>40000)fail(413,'游戏事件内容过长。');
    const digest=hash(canonical(event)),previous=db.prepare('SELECT seq,payload_hash,feedback,received_at FROM game_events WHERE user_id=? AND event_id=?').get(user,event.event_id);
    if(previous){if(previous.payload_hash!==digest)fail(409,'同一游戏记录ID的内容不同，原记录已保留。','GAME_CONFLICT');return {event_id:event.event_id,seq:previous.seq,duplicate:true,feedback:JSON.parse(previous.feedback),received_at:previous.received_at};}
    const hints=task?db.prepare("SELECT payload FROM game_events WHERE user_id=? AND attempt_id=? AND mission_id=? AND kind='hint'").all(user,event.attempt_id,mission.id):[];
    const requestedTask=task?taskInfo(event.version,mission.id,task.id):null;
    const relatedTask=e=>{const other=taskInfo(e.version,mission.id,e.task_id);return e.mission_id===mission.id&&other?.fingerprint===requestedTask?.fingerprint&&other?.ordinal===requestedTask?.ordinal;};
    const sharesMaterial=e=>{const oldMission=getVersion(e.version).missions.find(m=>m.id===e.mission_id),oldTask=oldMission?.tasks.find(t=>t.id===e.task_id);return materialHelpApplies(oldMission,oldTask,e.answer,mission,task);};
    const assisted=event.assisted||hints.some(r=>{const e=JSON.parse(r.payload);return Date.parse(e.occurred_at)<=stamp&&(relatedTask(e)||mission.native&&e.answer==='native_transcript'||sharesMaterial(e));});
    if(event.kind==='hint'&&materialHintSource(event.answer)){const context=sourceContext(mission,task);if(!context||context.source.id!==materialHintSource(event.answer))fail(400,'中文材料帮助必须属于这道题的真实源材料。');}
    if(task&&['answer','dialogue','work'].includes(event.kind)&&(task.requires?.length||task.kind==='travel'||task.at_place)){
      const events=db.prepare("SELECT payload,feedback FROM game_events WHERE user_id=? AND attempt_id=? AND mission_id=? AND kind IN ('answer','dialogue')").all(user,event.attempt_id,mission.id).map(r=>({...JSON.parse(r.payload),feedback:JSON.parse(r.feedback)}));
      if(missingJourneyEvents(task,mission,events,event.attempt_id,stamp).length)fail(409,'先把前一段委托办妥，记录会保留并继续同步。','GAME_JOURNEY_PENDING');
      if(task.kind==='travel'||task.at_place){
      const position=db.prepare("SELECT payload FROM game_events WHERE user_id=? AND event_id=? AND kind='position'").get(user,event.position_event_id||event.answer?.position_event_id||''),proof=position&&JSON.parse(position.payload),player=proof?.answer?.city?.player;
      if(!proof||!player||Date.parse(proof.occurred_at)>stamp||stamp-Date.parse(proof.occurred_at)>60000)fail(409,'这次抵达的位置记录还未同步，请稍后继续。','GAME_JOURNEY_PENDING');
      if(task.kind==='travel'&&(!Array.isArray(event.answer.player)||Math.hypot(event.answer.player[0]-player[0],event.answer.player[1]-player[1])>.01))fail(400,'抵达必须使用这次实际保存的角色位置。');
      if(task.at_place&&!journeyNear(player,task.at_place))fail(409,'先回到这位伙伴身边，再继续这段交谈。','GAME_JOURNEY_PENDING');
      }
    }
    let feedback={status:'recorded',score:null,independent:false,assisted};
    if(event.kind==='board'){
      const a=event.answer;if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['source','pinned'].includes(k))||typeof a.pinned!=='boolean'||!mission.case_board?.sources.some(s=>s.id===a.source))fail(400,'只能钉住本案例中的有效材料。');
      feedback={...feedback,evidence:'board_action'};
    }else if(event.kind==='position'){
      const a=event.answer;if(!a||typeof a!=='object'||!Number.isInteger(a.step)||a.step<0||a.step>=mission.tasks.length||typeof a.started!=='boolean')fail(400,'游戏位置无效。');
      if(a.review_context){const r=a.review_context,unit=c.learning_paths?.units.find(u=>u.id===r.unit_id);if(!unit||!['new_context','same_material','replay'].includes(r.mode)||typeof r.completed!=='boolean'||!unit.refs.some(ref=>ref.mission_id===mission.id&&ref.task_id===mission.tasks[a.step].id))fail(400,'复习位置必须关联当前版本的真实材料与任务。');}
      if(a.city){const c=a.city,coordinate=v=>Number.isFinite(v)&&Math.abs(v)<100000;if(!coordinate(c.x)||!coordinate(c.y)||!Number.isFinite(c.zoom)||c.zoom<.01||c.zoom>4.1||c.player&&(!Array.isArray(c.player)||c.player.length!==2||!c.player.every(coordinate))||c.place_id&&!/^ipr:\d+$/.test(c.place_id)&&!authoredPlaceIds.has(c.place_id))fail(400,'城市位置无效。');}
    }else if(event.kind==='answer'){
      if(isOpen(task)||['learn','source','dialogue'].includes(task.kind))fail(400,'这一步不能作为客观题提交。');
      try{feedback=gradeTask(task,event.answer,{assisted});}catch(e){fail(400,e.message);}
    }else if(event.kind==='view'){
      if(!['learn','source'].includes(task.kind))fail(400,'此步骤需要真正回应，不能只看一眼就过关。');
      feedback=gradeTask(task,null,{assisted:true});
    }else if(event.kind==='work'){
      if(!isOpen(task))fail(400,'这里不是开放作品。');
      const a=event.answer;if(!a||typeof a!=='object')fail(400,'作品内容无效。');
      let recording=null;
      if(a.recording_event_id){recording=db.prepare('SELECT id,lesson_id FROM recordings WHERE user_id=? AND event_id=?').get(user,a.recording_event_id);if(!recording||recording.lesson_id!==mission.lesson_id)fail(409,'作品的真实录音还未同步。','GAME_RECORDING_PENDING');}
      if(!recording&&(!a.text||!String(a.text).trim()))fail(400,'请先保存文字或实际录音。');
      if(typeof a.text!=='string'||a.text.length>20000)fail(400,'作品文字无效。');
      if(a.citations!==undefined&&(!Array.isArray(a.citations)||a.citations.length>8||new Set(a.citations).size!==a.citations.length||!a.citations.every(id=>mission.case_board?.sources.some(s=>s.id===id))))fail(400,'引用必须来自这份案例，不能加入其他材料。');
      feedback={...gradeTask(task,a.text||'已保存真实录音',{assisted}),recording_id:recording?.id||null};
    }else if(event.kind==='review'){
      const a=event.answer;if(!a||!['independent','with_help','retry'].includes(a.rating)||!validId(a.related_event_id))fail(400,'自查内容无效。');
      const related=db.prepare("SELECT payload FROM game_events WHERE user_id=? AND event_id=? AND kind='work'").get(user,a.related_event_id);if(!related||!relatedTask(JSON.parse(related.payload)))fail(400,'自查必须关联自己的这份作品。');
      feedback={...feedback,status:'self_review',message:'自查已保存，与系统客观题证据分开。'};
    }else if(event.kind==='dialogue'){
      if(task.kind!=='dialogue')fail(400,'此处不是分支对话。');
      const a=event.answer,node=task.nodes.find(n=>n.id===a?.node_id),choice=node?.choices?.find(o=>o.id===a?.choice_id);if(!choice)fail(400,'对话选择无效。');
      const last=db.prepare("SELECT payload,feedback FROM game_events WHERE user_id=? AND attempt_id=? AND mission_id=? AND kind='dialogue' ORDER BY seq DESC").all(user,event.attempt_id,mission.id).find(r=>relatedTask(JSON.parse(r.payload)));
      const expected=last?JSON.parse(last.feedback).next:task.start;if(node.id!==expected)fail(409,'对话路径已改变，请恢复最新进度。','GAME_DIALOGUE_PATH');
      const next=task.nodes.find(n=>n.id===choice.next);feedback={...feedback,status:'dialogue',next:choice.next,complete:!next?.choices?.length,message:choice.feedback_zh||'继续听对方怎么回应。'};
    }
    return transaction(db,()=>{
      const received=now(),result=db.prepare('INSERT INTO game_events(user_id,event_id,device_id,version,mission_id,task_id,attempt_id,kind,payload_hash,payload,feedback,occurred_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(user,event.event_id,event.device_id,event.version,event.mission_id,event.task_id,event.attempt_id,event.kind,digest,canonical(event),JSON.stringify(feedback),event.occurred_at,received);
      if(event.kind==='hint'){
        const rows=db.prepare("SELECT seq,payload,feedback FROM game_events WHERE user_id=? AND attempt_id=? AND mission_id=? AND kind IN ('answer','work') AND occurred_at>=?").all(user,event.attempt_id,mission.id,event.occurred_at);
        for(const r of rows){const later=JSON.parse(r.payload),laterMission=getVersion(later.version).missions.find(m=>m.id===later.mission_id),laterTask=laterMission?.tasks.find(t=>t.id===later.task_id);if(!relatedTask(later)&&!(mission.native&&event.answer==='native_transcript')&&!materialHelpApplies(mission,task,event.answer,laterMission,laterTask))continue;const f=JSON.parse(r.feedback);f.assisted=true;f.independent=false;db.prepare('UPDATE game_events SET feedback=? WHERE seq=?').run(JSON.stringify(f),r.seq);}
      }
      return {event_id:event.event_id,seq:Number(result.lastInsertRowid),duplicate:false,feedback,received_at:received};
    });
  }
  function reviewMap(user){const map=new Map();for(const r of db.prepare("SELECT payload FROM game_events WHERE user_id=? AND kind='review' ORDER BY seq").all(user)){const e=JSON.parse(r.payload);map.set(e.answer.related_event_id,e.answer.rating);}return map;}
  function formatWork(row,reviews){const e=JSON.parse(row.payload),f=JSON.parse(row.feedback),m=getVersion(e.version).missions.find(m=>m.id===e.mission_id);return {seq:row.seq,event_id:e.event_id,attempt_id:e.attempt_id,mission_id:e.mission_id,task_id:e.task_id,current_task_id:mappedTask(e.version,e.mission_id,e.task_id)?.id||null,answer:e.answer,recording_id:f.recording_id||null,assisted:!!f.assisted,at:row.received_at,self_review:reviews.get(e.event_id)||null,title:m?.title||e.mission_id,content_version:e.version,source:'course'};}
  function works(user,{before=Number.MAX_SAFE_INTEGER,limit=30,attempt_id=null,mission_id=null,task_id=null}={}){
    if(!Number.isSafeInteger(before)||before<1||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'作品分页无效。');
    const clauses=['user_id=?',"kind='work'",'seq<?'],params=[user,before];
    for(const [field,value]of Object.entries({attempt_id,mission_id,task_id})){if(value===null)continue;if(!validId(value))fail(400,'作品尝试标识无效。');clauses.push(field+'=?');params.push(value);}
    const rows=db.prepare('SELECT seq,payload,feedback,received_at FROM game_events WHERE '+clauses.join(' AND ')+' ORDER BY seq DESC LIMIT ?').all(...params,limit+1),selected=rows.slice(0,limit),reviews=reviewMap(user);return {items:selected.map(r=>formatWork(r,reviews)),next_cursor:rows.length>limit?selected.at(-1).seq:null};
  }
  function work(user,id){if(!validId(id))fail(400,'作品标识无效。');const row=db.prepare("SELECT seq,payload,feedback,received_at FROM game_events WHERE user_id=? AND event_id=? AND kind='work'").get(user,id);if(!row)fail(404,'没有这份作品。');return formatWork(row,reviewMap(user));}
  return {catalog,works,work,learningPaths(){return catalog.learning_paths||{version:0,units:[]};},summary(){const {learning_paths,...publicCatalog}=catalog;return {...publicCatalog,learning_available:!!learning_paths,missions:catalog.missions.map(({tasks,...m})=>({...m,tasks:tasks.map(({id,kind,key})=>({id,kind,...(key?{key}:{})})),task_count:tasks.length}))};},mission(id){const m=catalog.missions.find(m=>m.id===id);if(!m)fail(404,'城市里没有这个任务。');return {...m,version:catalog.version};},accept,state(user){const events=readEvents(user),current=applicable(events),p=projectEvents(catalog,current),learning=projectLearning(catalog.learning_paths,current),review=p.review.map(r=>{const unit=learningUnitFor(catalog.learning_paths,r.mission_id,r.task_id),route=reviewRoute(unit,p,r);return {...r,unit_id:unit?.id,route,reason:route?.mode==='new_context'?'带着这条薄弱点，换一份材料再试':route?.mode==='same_material'?'材料已经看过，这次练另一问':'回看旧任务：'+r.reason};});
    const included=new Set(review.map(r=>r.unit_id));for(const row of learning.units.filter(u=>u.needs_review)){if(included.has(row.id)||review.length>=20)continue;const unit=catalog.learning_paths.units.find(u=>u.id===row.id),from=row.failed[0]||row.last_independent.at(-1),route=reviewRoute(unit,p,from);if(route)review.push({mission_id:unit.mission_id,task_id:from?.task_id||route.task_id,unit_id:unit.id,route,reason:route.mode==='new_context'?'刚才借助过帮助，换材料验证':route.mode==='same_material'?'接着已经看过的材料，练另一问':'这里可以回看旧任务'});}
    return {...p,learning,review,cursor:events.at(-1)?.seq||0,version:catalog.version,server_time:now()};},export(user){return {schema:'czlife-game-export-v1',version:catalog.version,events:readEvents(user)};}};
}
