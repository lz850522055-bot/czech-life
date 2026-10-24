/** A bounded, resumable dialogue graph. Choice effects are communication feedback,
 * never a score for spontaneous speaking. Full dialogue snapshots go into events. */
export const scenarioKey=(user,scene)=>'scenario:'+user.id+':'+scene.id+':'+scene.version;
export const scenarioProgressKey=scene=>scene.id+'|'+scene.version;
export function initialGame(scene){return{node_id:scene.start,history:[],run_id:crypto.randomUUID(),run_started_at:new Date().toISOString()};}
export function choose(scene,game,choiceId){
  const node=scene.nodes.find(n=>n.id===game.node_id),choice=node?.choices.find(c=>c.id===choiceId);
  if(!choice||!scene.nodes.some(n=>n.id===choice.next))throw new Error('这条对话路径不可用，请重新打开场景。');
  if(game.history.length>=30)throw new Error('本次对话已记录30步，请回看后重新开始。');
  const run=game.run_id&&game.run_started_at?game:initialGame(scene);
  return{...run,node_id:choice.next,history:[...game.history,{node_id:node.id,speaker_cs:node.speaker_cs,choice_id:choice.id,text_cs:choice.text_cs,text_zh:choice.text_zh,feedback_zh:choice.feedback_zh,next:choice.next}]};
}

// Immutable full-path snapshots keep concurrent branches and interrupted old runs
// recoverable. Ordering uses the start of a run, then event time and event ID;
// receiving an old offline event later can never restart a newer run.
export function scenarioSnapshot(scene,game,action='choice'){
  return {activity:'dialogue_branch',protocol:2,scenario_id:scene.id,scenario_version:scene.version,action,run_id:game.run_id,run_started_at:game.run_started_at,node_id:game.node_id,history:game.history};
}
export function scenarioSnapshotError(s,e){
  const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,120}$/.test(x);
  const text=x=>typeof x==='string'&&x.length<=3000;
  if(!id(s.scenario_id)||!id(s.scenario_version))return '场景或场景版本无效。';
  if(s.protocol===undefined)return null; // Legacy choice snapshots remain readable.
  if(s.protocol!==2||!['choice','restart','resume_legacy'].includes(s.action)||!id(s.run_id)||!id(s.node_id))return '对话轮次或路径无效。';
  const start=Date.parse(s.run_started_at),at=Date.parse(e.occurred_at);
  if(!Number.isFinite(start)||start<Date.UTC(2000,0,1)||start>at||new Date(start).toISOString()!==s.run_started_at)return '对话轮次开始时间无效。';
  if(!Array.isArray(s.history)||s.history.length>30||(s.action==='choice'&&!s.history.length)||(s.action==='restart'&&s.history.length))return '对话路径长度无效。';
  if(!s.history.every(h=>h&&id(h.node_id)&&id(h.choice_id)&&id(h.next)&&['speaker_cs','text_cs','text_zh','feedback_zh'].every(k=>text(h[k]))))return '对话路径缺少原文快照。';
  return null;
}
function readScenarioEvent(e){
  if(e?.kind!=='transfer'||typeof e.answer!=='string')return null;
  let s;try{s=JSON.parse(e.answer);}catch{return null;}
  return s?.activity==='dialogue_branch'&&!scenarioSnapshotError(s,e)?s:null;
}
export function projectScenarioEvent(records,e){
  const s=readScenarioEvent(e);if(!s)return records;
  const key=scenarioProgressKey({id:s.scenario_id,version:s.scenario_version});
  const record=records[key]||={events:{}};
  Object.defineProperty(record.events,e.event_id,{value:{event_id:e.event_id,device_id:e.device_id,lesson_id:e.lesson_id,content_version:e.content_version,occurred_at:e.occurred_at,kind:e.kind,answer:e.answer},enumerable:true,configurable:true,writable:true});
  return records;
}
const compareEvent=(a,b)=>String(a.last_occurred_at||a.occurred_at||'').localeCompare(String(b.last_occurred_at||b.occurred_at||''))||String(a.last_event_id||a.event_id||'').localeCompare(String(b.last_event_id||b.event_id||''));
const compareRun=(a,b)=>String(a.run_started_at||'').localeCompare(String(b.run_started_at||''))||String(a.run_id||'').localeCompare(String(b.run_id||''))||compareEvent(a,b);
const pathKey=g=>g.history.map(h=>h.node_id+':'+h.choice_id).join('|');
function validPath(scene,g){
  if(!Array.isArray(g.history)||g.history.length>30)return false;
  let node=scene.start;
  for(const h of g.history){const c=scene.nodes.find(n=>n.id===node)?.choices.find(c=>c.id===h.choice_id);if(h.node_id!==node||!c||c.next!==h.next)return false;node=c.next;}
  return node===g.node_id;
}
export function resolveScenarioGame(scene,record,pendingEvents=[],local=null){
  const events=new Map(Object.values(record?.events||{}).map(e=>[e.event_id,e]));
  for(const item of pendingEvents){const e=item.event||item,s=readScenarioEvent(e);if(s?.scenario_id===scene.id&&s.scenario_version===scene.version)events.set(e.event_id,e);}
  const candidates=[],legacy=new Map();
  for(const e of [...events.values()].sort(compareEvent)){
    const s=readScenarioEvent(e);if(!s||s.scenario_id!==scene.id||s.scenario_version!==scene.version||e.lesson_id!==scene.lesson_id)continue;
    if(s.protocol===2){const g={node_id:s.node_id,history:s.history,run_id:s.run_id,run_started_at:s.run_started_at,last_event_id:e.event_id,last_occurred_at:e.occurred_at};if(validPath(scene,g))candidates.push(g);continue;}
    // Old versions saved one choice per event. Rebuild each device's uninterrupted
    // path, without inventing a cross-device ordering between old independent runs.
    let g=legacy.get(e.device_id);
    if(!g||g.node_id!==s.node_id||s.node_id===scene.start)g={node_id:scene.start,history:[],run_id:'legacy-'+e.event_id,run_started_at:e.occurred_at};
    const h={node_id:s.node_id,speaker_cs:s.speaker_cs,choice_id:s.choice_id,text_cs:s.text_cs,text_zh:s.text_zh,feedback_zh:s.feedback_zh,next:s.next};
    const next={...g,node_id:s.next,history:[...g.history,h],last_event_id:e.event_id,last_occurred_at:e.occurred_at};
    if(validPath(scene,next)){legacy.set(e.device_id,next);candidates.push(next);}
  }
  // A previous browser-only path remains visible even if its queue was already
  // flushed by an old client. It must not overrule a newer server-confirmed run.
  if(local&&validPath(scene,local)&&(local.last_event_id||local.history.length)){
    const g={node_id:local.node_id,history:local.history,run_id:local.run_id||'legacy-local',run_started_at:local.run_started_at||'2000-01-01T00:00:00.000Z',last_event_id:local.last_event_id||'legacy-local',last_occurred_at:local.last_occurred_at||'2000-01-01T00:00:00.000Z'};
    if(!candidates.some(c=>c.last_event_id===g.last_event_id))candidates.push(g);
  }
  if(!candidates.length)return local&&validPath(scene,local)?local:initialGame(scene);
  candidates.sort((a,b)=>compareRun(a,b));
  const current=candidates.at(-1),tips=candidates.filter((c,i)=>!candidates.some((other,j)=>i!==j&&c.run_id===other.run_id&&(pathKey(other)===pathKey(c)?compareEvent(other,c)>0:pathKey(other).startsWith(pathKey(c)+'|'))));
  const unique=new Map();for(const t of tips)unique.set(t.run_id+'|'+pathKey(t),t);
  const history=[...unique.values()].filter(g=>g.last_event_id!==current.last_event_id&&g.history.length).sort((a,b)=>compareRun(b,a));
  return {...current,saved_paths:history,retained_event_count:events.size};
}
export function sceneCards(scenes,{esc,button,badge}){
  return `<section class="card"><h2>对话会因你的回应而改变</h2><p>先选择怎样回应，再看对方如何接话。选择结果记录为情境练习；它不等于已经能自发说出这些句子。</p><div class="unit-grid">${scenes.map(s=>`<article class="card"><div>${badge(s.level,'outline')}</div><h3>${esc(s.title_zh)}</h3><p>${esc(s.intro_zh)}</p><a class="btn secondary small" href="#scenario/${s.id}">进入分支对话 →</a></article>`).join('')}</div></section>`;
}
function savedPathsHtml(game,esc){
  const paths=game.saved_paths||[];if(!paths.length)return '';
  return `<details class="card"><summary>以前轮次与其他设备的路径（${paths.length} 条）</summary><p class="small">另一设备的选择、重新开始前的记录和晚到的离线路径都保留在这里，不会覆盖当前较新的轮次。</p>${paths.map((g,i)=>`<details><summary>路径 ${i+1} · ${g.history.length} 次回应</summary>${g.history.map(h=>`<p lang="cs">${esc(h.speaker_cs)}<br><strong>你：${esc(h.text_cs)}</strong></p><p>${esc(h.feedback_zh)}</p>`).join('')}</details>`).join('')}</details>`;
}
export function scenarioPage(scene,game,{esc,button,badge}){
  if(!scene)return '<div class="notice">正在打开场景…</div>';
  const node=scene.nodes.find(n=>n.id===game.node_id)||scene.nodes.find(n=>n.id===scene.start),last=game.history.at(-1);
  return `<div class="page-heading"><div><div class="eyebrow">${esc(scene.level)} · 场景对话</div><h1>${esc(scene.title_zh)}</h1><p>${esc(scene.intro_zh)}</p></div></div><div class="button-row"><a class="text-btn" href="#practice?mode=interaction">← 返回场景列表</a>${button('scenario-download','下载本场景与关联课','secondary small')}${button('scenario-restart','重新走一条路径','secondary small')}</div><div class="scenario-grid"><section class="card"><div class="badge-row">${badge('第 '+(game.history.length+1)+' 步','outline')}</div>${last?`<div class="notice"><strong>刚才的回应产生了什么效果</strong><p>${esc(last.feedback_zh)}</p></div>`:''}<h2>对方这样说</h2><p class="cs" lang="cs">${esc(node.speaker_cs)}</p><p class="muted">${esc(node.speaker_zh)}</p>${button('scenario-audio','听这一句','secondary small')}<div class="audio-status"></div><div class="thin-divider"></div>${node.choices.length?`<h3>你准备怎样回应？</h3><div class="scenario-choices">${node.choices.map(c=>`<button class="answer-option scenario-choice" data-action="scenario-choice" data-choice="${c.id}"><span lang="cs">${esc(c.text_cs)}</span><small>${esc(c.text_zh)}</small></button>`).join('')}</div>`:`<h3>这条路径的结果</h3><p>${esc(node.outcome_zh||'回看你的回应，想一想换一种表达会怎样。')}</p><p class="small">想尝试别的回应，可重新开始；已经保存的事件会保留。</p>`}<div id="scenario-save-state" class="small">每次选择先存本机，再由服务器确认。声音与离线下载沿用关联课程。</div></section><aside class="card"><h2>本次对话回放</h2>${game.history.length?game.history.map((h,i)=>`<details ${i===game.history.length-1?'open':''}><summary>第 ${i+1} 次回应</summary><p lang="cs">${esc(h.speaker_cs)}</p><p lang="cs"><strong>你：${esc(h.text_cs)}</strong></p><p>${esc(h.feedback_zh)}</p></details>`).join(''):'<p class="muted">回应后会保留路径，刷新也能继续。想练真正的主动表达，可回关联课录音或改写。</p>'}${savedPathsHtml(game,esc)}<a class="btn secondary small" href="#lesson/${scene.lesson_id}?tab=practice">到关联课自己组织表达 →</a></aside></div>`;
}
