import {choiceOrder} from './choice-order.js';

// Only explicitly reviewed question sets are connected to full recordings.
// Other advanced lessons offer a listening summary, without relabelling unrelated exercises.
export function listeningSession(lesson){
  if(!lesson||!['B2','C1','C2'].includes(lesson.level))return null;
  const explicit=lesson.listening_session;
  if(explicit&&(typeof explicit!=='object'||Array.isArray(explicit)||!Array.isArray(explicit.exercise_ids)||explicit.source_exercise_ids&&!Array.isArray(explicit.source_exercise_ids)))return null;
  if(!explicit&&lesson.kind&&lesson.kind!=='lesson')return null;
  const c=explicit||{source_role:'full',exercise_ids:[]};
  const refs=lesson.audio_refs||[];
  const sources=c.source_exercise_ids?.length
    ?c.source_exercise_ids.map(id=>refs.find(r=>r.exercise_id===id))
    :[refs.find(r=>r.role===(c.source_role||'full'))];
  if(sources.some(r=>!r))return null;
  return {id:c.id||'long-text',title:c.title_zh||'先听完整材料，再组织自己的回答',
    sources,exercise_ids:c.exercise_ids||[],evidence:Array.isArray(c.evidence)?c.evidence:[],
    paragraphs:c.source_exercise_ids?.length?c.source_exercise_ids.map((id,i)=>({
      cs:lesson.exercises.find(e=>e.id===id)?.audio_text_cs||sources[i].text||'',zh:'',ref:sources[i],source_exercise_id:id
    })):(lesson.lesson_text||lesson.unseen_text||[]).map((p,i)=>({...p,ref:refs.find(r=>r.role==='text'&&r.index===i),paragraph_index:i}))};
}
export const listeningKey=lesson=>lesson.id+'|'+lesson.version;
export function listeningAudioSource(ref,speed=1){
  if(!ref?.id||ref.status!=='generated')throw new Error('此音轨尚未可用。');
  const slow=speed<.95&&!!ref.slow_file;
  return {url:'/api/v1/audio/'+encodeURIComponent(ref.asset_id||ref.id)+(slow?'?speed=slow':''),
    begin:Number((slow?ref.slow_start:ref.start)||0),end:Number(slow?ref.slow_end:ref.end)||null};
}
export function bindListeningAudio(audio,ref,{speed=1,onStatus=()=>{}}={}){
  const source=listeningAudioSource(ref,speed);audio.pause();
  const changed=audio.dataset.audioSource!==source.url;
  if(changed){audio.src=source.url;audio.dataset.audioSource=source.url;}
  audio.playbackRate=1;audio.dataset.begin=String(source.begin);audio.dataset.end=source.end?String(source.end):'';
  const position=()=>{audio.currentTime=source.begin;};
  audio.onloadedmetadata=position;
  audio.onseeking=()=>{if(audio.currentTime<source.begin)audio.currentTime=source.begin;if(source.end&&audio.currentTime>source.end)audio.currentTime=source.end;};
  audio.ontimeupdate=()=>{if(source.end&&audio.currentTime>=source.end){audio.pause();onStatus('本段播放完毕，可拖动进度或重新播放。');}};
  audio.onplay=()=>{if(source.end&&audio.currentTime>=source.end)position();onStatus('正在播放 · '+(speed<.95?'独立合成慢速':'正常速度'));};
  audio.onerror=()=>onStatus('音轨读取失败；请检查连接或下载本课离线音频。');
  if(changed)audio.load();else position();
  return source;
}
export async function playListeningAudio(audio,ref,options={}){
  bindListeningAudio(audio,ref,options);
  // Native controls remain available for pause/resume/scrub throughout playback.
  await audio.play();
}
export function projectListeningEvent(previous,event){
  const out=structuredClone(previous||{drafts:{},attempts:{}});out.drafts||={};out.attempts||={};out.first_attempts||={};
  const newer=(a,b)=>!b||a.occurred_at>b.occurred_at||(a.occurred_at===b.occurred_at&&a.event_id>b.event_id);
  if(event.kind==='listening'){
    const a=event.answer;
    if(a.action==='exposure'){out.exposed=true;out.exposed_at=out.exposed_at&&out.exposed_at<event.occurred_at?out.exposed_at:event.occurred_at;}
    const id=a.exercise_id||'summary';
    if(a.action==='draft'&&newer(event,out.drafts[id])&&newer(event,id==='summary'?out.summary:out.attempts[id]))out.drafts[id]={text:a.text,event_id:event.event_id,pending:!!event.pending,occurred_at:event.occurred_at};
    if(a.action==='summary'){
      if(!out.first_summary||newer(out.first_summary,event))out.first_summary=event;
      if(newer(event,out.summary)){out.summary=event;if(newer(event,out.drafts.summary))delete out.drafts.summary;}
    }
  }else if(event.kind==='exercise'&&event.context?.activity==='advanced_listening'){
    const id=event.exercise_id;
    if(!out.first_attempts[id]||newer(out.first_attempts[id],event))out.first_attempts[id]=event;
    if(newer(event,out.attempts[id])){out.attempts[id]=event;if(newer(event,out.drafts[id]))delete out.drafts[id];}
  }
  return out;
}
export function listeningComplete(session,record){
  return session.exercise_ids.length?session.exercise_ids.every(id=>record?.attempts?.[id]):!!record?.summary;
}
export function listeningPage(lesson,record={},helpers){
  const {esc,button,feedbackHtml}=helpers,s=listeningSession(lesson);if(!s)return '';
  const complete=listeningComplete(s,record),review=complete&&record.exposed;
  const savedLabel=e=>e?.pending?'已留在本机，等待联网同步':e?'已同步':'';
  const tools=`<div class="text-tools"><label>速度 <select id="audio-speed"><option value="1" ${helpers.audioSpeed!==.8?'selected':''}>正常速度</option><option value="0.8" ${helpers.audioSpeed===.8?'selected':''}>清晰慢速</option></select></label></div>${s.sources.map((r,i)=>`<div><p class="small">${s.sources.length===1?'完整材料':'材料 '+(i+1)}</p><audio data-deep-source="${i}" controls preload="none" aria-label="${s.sources.length===1?'完整材料':'材料 '+(i+1)}的播放进度" class="deep-listening-audio"></audio>${button('deep-audio','从材料开头播放','secondary small',`data-source="${i}"`)}</div>`).join('')}<div class="audio-status" role="status">现有捷语合成音轨 · 可暂停、继续和拖动进度，不计时</div>`;
  const prompts=s.exercise_ids.map((id,index)=>{
    const e=lesson.exercises.find(x=>x.id===id);if(!e)return '';
    const attempt=record.attempts?.[id],draft=record.drafts?.[id]?.text??attempt?.answer??'';
    return `<section class="card"><p class="small">任务 ${index+1} / ${s.exercise_ids.length}</p><h3>${esc(e.prompt_zh)}</h3><form class="form-stack" data-listening-answer="${esc(id)}">${e.type==='choice'?`<div class="answer-options">${choiceOrder(e.options,lesson.id+':'+lesson.version+':'+e.id).map(o=>{const value=typeof o==='object'?o.id:o,text=typeof o==='object'?o.text:o;return `<label class="answer-option"><input type="radio" name="answer" value="${esc(value)}" ${String(draft)===String(value)?'checked':''} required><span lang="cs">${esc(text)}</span></label>`;}).join('')}</div>`:`<label>写下你的回答或口述要点<textarea name="answer" required maxlength="20000" lang="cs">${esc(draft)}</textarea></label>`}${['speaking','interaction','mediation'].includes(e.type)?helpers.recordPanel?.()||'':''}<div class="button-row"><button class="btn" type="submit">保存这题回答</button><button class="btn secondary" type="submit" name="intent" value="draft" formnovalidate>同步草稿</button></div><p class="small" data-listening-status="${esc(id)}">${savedLabel(attempt||record.drafts?.[id])}${attempt?' · 参考答案留到整组完成后查看':''}</p></form>${review&&attempt?(attempt.pending?'<p class="notice">回答已留在本机，联网确认后显示评分反馈。</p>':feedbackHtml(e,attempt)):''}${review&&record.first_attempts?.[id]&&record.first_attempts[id].event_id!==attempt?.event_id?`<details><summary>查看首次回答</summary><p class="wrap-text">${esc(record.first_attempts[id].answer)}</p><p class="small">${record.first_attempts[id].feedback?.assisted?'参考原文后的回答':'首次提交记录；保持原有评分依据'}</p></details>`:''}</section>`;
  }).join('');
  const summary=!s.exercise_ids.length?`<section class="card"><h3>把听懂的内容组织出来</h3><p>用自己的话记下：主旨、主要理由或转折、最后的结论，以及你仍不确定的地方。可先用中文梳理，再试着改为捷语。</p><form class="form-stack" data-listening-answer="summary"><label>听后概述<textarea name="answer" required maxlength="20000">${esc(record.drafts?.summary?.text??record.summary?.answer?.text??'')}</textarea></label><div class="button-row"><button class="btn" type="submit">保存听后概述</button><button class="btn secondary" type="submit" name="intent" value="draft" formnovalidate>同步草稿</button></div><p class="small" data-listening-status="summary">${savedLabel(record.summary||record.drafts?.summary)}</p></form><p class="small">概述单独留作回看记录，不自动评分，也不替代本课原有练习。</p></section>`:'';
  const transcript=record.exposed?`<section class="card"><h2>原文与回听</h2><p class="small">已查看原文；之后的作答保留为辅助练习。此前已提交的首次回答仍保留。</p>${s.paragraphs.map((p,i)=>`<div class="sentence"><div>${p.ref?button('deep-evidence','回听第 '+(i+1)+' 段','secondary small',`data-paragraph="${i}"`):''}<p class="cs" lang="cs">${esc(p.cs)}</p>${p.zh?`<p class="zh">${esc(p.zh)}</p>`:''}</div></div>`).join('')}${review?s.evidence.map(e=>`<div class="notice"><strong>任务 ${s.exercise_ids.indexOf(e.exercise_id)+1} 的原文依据</strong><p>${esc(e.note_zh)}</p>${e.quote_cs?`<p lang="cs">${esc(e.quote_cs)}</p>`:''}<div class="button-row">${(e.paragraph_indices||[]).map(i=>s.paragraphs[i]?.ref?button('deep-evidence','回听依据 · 第 '+(i+1)+' 段','secondary small',`data-paragraph="${i}"`):'').join('')}${(e.source_exercise_ids||[]).map(id=>{const i=s.paragraphs.findIndex(p=>p.source_exercise_id===id);return i<0?'':button('deep-evidence','回听依据 · 材料 '+(i+1),'secondary small',`data-paragraph="${i}"`);}).join('')}</div></div>`).join(''):''}</section>`:'';
  return `<article class="card"><div class="eyebrow">听见，再理解</div><h2>${esc(s.title)}</h2><p>先听材料，带着问题复听，再写下回答。原文和参考表达先收起来，按你的节奏完成。</p>${tools}<p class="small" id="listening-overall-status"><span id="listening-overall-message">${record.exposed?'本次已查看原文，后续属于辅助练习':complete?'回答已留存，可以回看原文与依据':'原文未展开'}</span>${record.exposed?'':` · ${button('deep-reveal','需要原文帮助','text-btn')}`}</p></article>${prompts}${summary}<div class="button-row">${button('deep-review','完成后查看原文与反馈','',complete?'':'disabled')}</div>${transcript}`;
}
