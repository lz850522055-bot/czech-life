import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {PROJECT_ROOT} from '../app/server/config.mjs';
import {openDatabase} from '../app/server/db.mjs';
import {importItem} from '../app/server/content.mjs';
import {acceptEvent,progress} from '../app/server/events.mjs';
import {CHALLENGE_PREFIX,parseChallengeNote,resolveChallengeRecord,challengeNote,challengePage,handleChallengeAction} from '../app/public/native-challenge.js';

const index=JSON.parse(fs.readFileSync(new URL('../content/authentic/manifest.json',import.meta.url),'utf8'));
const clips=index.clips.filter(c=>c.c2_challenge&&!c.c2_challenge.long_form),clip=clips.find(c=>c.id==='public-counterfactual');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,klass='',data='')=>`<button data-action="${action}" ${data}>${text}</button>`;
const answers=(c=clip,value='Moje vlastní odpověď.')=>({answers:Object.fromEntries(c.c2_challenge.tasks.map(t=>[t.id,value]))});
const base=Date.now()-3600000,at=n=>new Date(base+n*1000).toISOString();
const note=(action,input=answers(),record={},n=1,c=clip)=>({text:challengeNote(c,action,input,record),created_at:at(n),lesson_id:c.lesson_id});
const html=record=>challengePage(index,clip,record,{esc,button});

test('3 groups / 9 tasks / 27 checks: every quoted source exists, Czech model and Chinese follow source attribution',()=>{
  assert.equal(clips.length,3);assert.equal(clips.flatMap(c=>c.c2_challenge.tasks).length,9);
  let criteria=0;
  for(const c of clips){const k=c.c2_challenge,transcript=c.transcript.map(t=>t.cs).join(' ');
    assert.equal(k.source_clip_id,c.id);assert.equal(k.source_audio_sha256,c.media.sha256);
    assert.equal(k.source_segment_id,c.transcript[0].segment_id);
    assert.equal(k.target_level,'C2');assert.equal(k.review.native_auditory_review,false);assert.equal(k.review.cefr_certified,false);
    assert.equal(new Set(k.tasks.map(t=>t.id)).size,3);
    for(const t of k.tasks){assert.ok(t.sample_cs.length>100);assert.ok(t.sample_zh.length>30);assert.ok(t.explanation_zh.length>20);
      for(const q of t.evidence_cs)assert.ok(transcript.includes(q),c.id+' / '+t.id+' / '+q);
      for(const r of t.criteria){criteria++;for(const key of ['label_zh','met_zh','partial_zh','retry_zh'])assert.ok(r[key]?.length>1);}
    }
  }assert.equal(criteria,27);
  assert.equal(index.clips.find(c=>c.id==='public-counterfactual').level,'B2');
});

test('blind page contains tasks but no focus, source transcription, evidence or model; reveal needs saved complete answers',()=>{
  const initial=resolveChallengeRecord(clip),view=html(initial);
  for(const t of clip.c2_challenge.tasks){assert.ok(view.includes(esc(t.prompt_zh)));assert.ok(!view.includes(esc(t.sample_cs)));assert.ok(!view.includes(esc(t.focus_zh)));}
  assert.ok(!view.includes(esc(clip.transcript[0].cs)));assert.ok(!view.includes(esc(clip.c2_challenge.title_zh)));
  assert.match(view,/native-challenge-reveal" disabled/);assert.throws(()=>challengeNote(clip,'exposure',{},initial),/先保存/);
  assert.throws(()=>challengeNote(clip,'answer',{answers:{}}),/三个任务/);
  const first=note('answer'),saved=resolveChallengeRecord(clip,[first]);
  assert.ok(!html(saved).includes(esc(clip.transcript[0].cs)));
  const reveal=note('exposure',{},saved,2),opened=html(resolveChallengeRecord(clip,[first,reveal]));
  assert.ok(opened.includes(esc(clip.transcript[0].cs)));
  for(const t of clip.c2_challenge.tasks){assert.ok(opened.includes(esc(t.sample_cs)));assert.ok(opened.includes(esc(t.sample_zh)));assert.ok(opened.includes(esc(t.focus_zh)));}
  assert.match(opened,/新编捷语示范 · 不是原录音/);assert.match(opened,/不是系统自动评分|保存我的逐项自检/);
  assert.match(opened,/<p lang="cs">[^]*?<\/p><p>/);
});

test('first answer stays immutable; drafts resume; exposure marks later revisions assisted even if offline arrival is late',()=>{
  const first=note('answer'),p=resolveChallengeRecord(clip,[first]);
  const revised=note('answer',answers(clip,'Po pomoci upraveno.'),p,4);
  const exposure=note('exposure',{},p,2);
  const current=resolveChallengeRecord(clip,[revised,first,exposure]);
  assert.equal(current.first.answers.scope,'Moje vlastní odpověď.');assert.equal(current.first.assisted,false);
  assert.equal(current.latest.assisted,true);assert.equal(current.history.length,2);
  const draft=note('draft',answers(clip,'Rozpracováno.'),current,5);
  const restored=resolveChallengeRecord(clip,[draft,revised,first,exposure]);
  assert.equal(restored.draft.answers.scope,'Rozpracováno.');assert.match(html(restored),/Rozpracováno\./);
  const selfcheck=note('selfcheck',{checks:{'scope:0':'met','scope:1':'partial'}},restored,6);
  const checked=resolveChallengeRecord(clip,[draft,revised,first,exposure,selfcheck]);assert.equal(checked.checks['scope:0'],'met');assert.equal(checked.checks['scope:1'],'partial');
});

test('pending acknowledgement deduplicates; other user / clip / content version never replaces current record',()=>{
  const first=note('answer'),pending={user_id:'user-a',event:{kind:'note',answer:first.text,occurred_at:first.created_at}};
  const local=resolveChallengeRecord(clip,[],[pending],'user-a');assert.equal(local.first.pending,true);
  const ack=resolveChallengeRecord(clip,[first],[pending],'user-a');assert.equal(ack.history.length,1);assert.equal(ack.first.pending,false);
  assert.equal(resolveChallengeRecord(clip,[],[pending],'user-b').first,null);
  assert.equal(resolveChallengeRecord(clips.find(c=>c.id!==clip.id),[first]).first,null);
  const future={...clip,c2_challenge:{...clip.c2_challenge,version:'future'}};
  const revised=resolveChallengeRecord(future,[first]);assert.equal(revised.first,null);assert.equal(revised.older_versions,1);
  const error=resolveChallengeRecord(clip,[],[{...pending,error:'test rejection'}],'user-a');assert.match(html(error),/尚未同步：test rejection/);
});

test('only bounded valid self-check values; render escapes typed input and rejects malformed records',()=>{
  assert.equal(parseChallengeNote(CHALLENGE_PREFIX+'{bad'),null);assert.equal(parseChallengeNote('ordinary note'),null);
  assert.throws(()=>challengeNote(clip,'answer',answers(clip,'x'.repeat(2001))),/2000/);
  assert.throws(()=>challengeNote(clip,'selfcheck',{}),/先看原文/);
  assert.throws(()=>challengeNote(clip,'selfcheck',{checks:{'scope:0':'certified'}},{exposed:true}),/无效/);
  const payload='</textarea><script>bad()</script>',record=resolveChallengeRecord(clip,[note('answer',answers(clip,payload))]);
  const view=html(record);assert.ok(view.includes(esc(payload)));assert.ok(!view.includes(payload));
});

test('real action handler persists before revealing, retains unsaved revision as draft, and never reveals on failed storage',async()=>{
  const stored=[note('answer')],order=[];let record=resolveChallengeRecord(clip,stored),view=html(record);
  const root={querySelector:s=>s.includes('data-native-answer')?{value:'改写草稿'}:{value:'met'}};
  const effects={queue:async text=>{order.push(parseChallengeNote(text).action);stored.push({text,created_at:at(stored.length+1)});},refresh:async()=>{record=resolveChallengeRecord(clip,stored);},render:()=>{order.push('render');view=html(record);},sync:async()=>order.push('sync')};
  await handleChallengeAction('native-challenge-reveal',clip,record,root,effects);
  assert.deepEqual(order,['draft','exposure','render','sync']);assert.equal(record.first.answers.scope,'Moje vlastní odpověď.');assert.equal(record.draft.answers.scope,'改写草稿');assert.ok(view.includes(esc(clip.transcript[0].cs)));
  await handleChallengeAction('native-challenge-save',clip,record,root,effects);assert.equal(record.latest.assisted,true);assert.equal(record.history.length,2);
  let rendered=false;
  await assert.rejects(handleChallengeAction('native-challenge-reveal',clip,resolveChallengeRecord(clip,[stored[0]]),root,{...effects,queue:async()=>{throw new Error('disk full');},render:()=>{rendered=true;}}),/disk full/);
  assert.equal(rendered,false);
});

test('actual SQLite event / progress: two devices restore first answer, disclosure and revision after reopen without mastery credit',()=>{
  const dir=path.join(PROJECT_ROOT,'data','test-runs','native-challenge-'+randomUUID());fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,'isolated.sqlite');let db=openDatabase(file);
  const user='native-test-user',other='native-other-user';
  for(const id of [user,other])db.prepare('INSERT INTO users(id,username,password_hash,recovery_hash,created_at,settings) VALUES (?,?,?,?,?,?)').run(id,id,'not-a-login','not-a-recovery',at(0),'{}');
  const lesson=JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT,'content','lessons',clip.level,clip.lesson_id+'.json'),'utf8'));
  importItem(db,lesson);
  const event=(text,n,device)=>({event_id:randomUUID(),device_id:device,kind:'note',lesson_id:lesson.id,content_version:lesson.version,occurred_at:at(n),answer:text});
  const first=event(challengeNote(clip,'answer',answers()),1,'computer');
  assert.equal(acceptEvent(db,user,first).duplicate,false);assert.equal(acceptEvent(db,user,first).duplicate,true);
  assert.throws(()=>acceptEvent(db,user,{...first,answer:first.answer+' '}),/不同内容/);
  let p=progress(db,user),phone=resolveChallengeRecord(clip,p.notes);assert.equal(phone.first.answers.scope,'Moje vlastní odpověď.');
  const exposure=event(challengeNote(clip,'exposure',{},phone),2,'phone');
  // A later offline answer arrives before the earlier disclosure; projection must reconcile it.
  const revision=event(challengeNote(clip,'answer',answers(clip,'Upravená odpověď.'),phone),3,'phone');acceptEvent(db,user,revision);acceptEvent(db,user,exposure);
  p=progress(db,user);let restored=resolveChallengeRecord(clip,p.notes);
  assert.equal(restored.first.assisted,false);assert.equal(restored.latest.assisted,true);assert.equal(restored.history.length,2);
  const check=event(challengeNote(clip,'selfcheck',{checks:{'scope:0':'met'}},restored),4,'computer');acceptEvent(db,user,check);
  assert.equal(p.event_count,0);assert.deepEqual(p.skills,{});assert.deepEqual(p.completed,{});
  assert.equal(db.prepare('SELECT count(*) AS n FROM mastery_evidence').get().n,0);
  assert.equal(progress(db,other).notes.length,0);
  db.close();db=openDatabase(file);p=progress(db,user);restored=resolveChallengeRecord(clip,p.notes);assert.equal(restored.checks['scope:0'],'met');assert.equal(restored.first.answers.scope,'Moje vlastní odpověď.');assert.equal(restored.latest.answers.scope,'Upravená odpověď.');assert.equal(p.total_events,4);
  db.close();
});
