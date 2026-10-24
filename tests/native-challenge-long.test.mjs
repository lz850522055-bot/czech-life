import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {challengePage,resolveChallengeRecord,challengeNote,handleChallengeAction} from '../app/public/native-challenge.js';
import {playNativeSegment,authenticPage} from '../app/public/authentic.js';
const read=rel=>fs.readFileSync(new URL('../'+rel,import.meta.url));
const index=JSON.parse(read('content/authentic/manifest.json')),clip=index.clips.find(c=>c.id==='public-healthcare-continuous');
const aligned=JSON.parse(read('content/authentic/'+clip.source.alignment_file));
const source=JSON.parse(read('content/authentic/'+clip.source.provenance_file));
const digest=b=>createHash('sha256').update(b).digest('hex');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,klass='',data='')=>`<button data-action="${action}" ${data}>${text}</button>`;
const answers={answers:Object.fromEntries(clip.c2_challenge.tasks.map(t=>[t.id,'Moje první shrnutí.']))};
const base=Date.now()-100000,at=n=>new Date(base+n*1000).toISOString();
const first={text:challengeNote(clip,'answer',answers),created_at:at(1)};
const firstState=resolveChallengeRecord(clip,[first]);
const exposure={text:challengeNote(clip,'exposure',{},firstState),created_at:at(2)};
const opened=()=>resolveChallengeRecord(clip,[first,exposure]);

test('one unchanged 134.208-second source recording; six original paragraphs and all 320 published alignment rows retained',()=>{
  assert.equal(index.clips.length,23);assert.equal(clip.media.duration,134.208);
  assert.equal(digest(read('content/authentic/'+clip.media.file)),clip.media.sha256);
  assert.equal(clip.media.sha256,'ee401481e30272d88ddb3a237fb6871cf442f5ae65b3060c6c768d8b811a917d');
  assert.equal(digest(read('content/authentic/'+clip.source.alignment_file)),clip.source.alignment_sha256);
  assert.equal(clip.source.alignment_sha256,'3fed6ffc1227a5f4497e41e37388edd152e91e86b5821eeb982972f93e5d0513');
  assert.equal(aligned.word_rows.length,320);assert.ok(aligned.word_rows.some(w=>w.start===null&&w.end===null));
  assert.ok(aligned.word_rows.some(w=>w.true_word!==w.rec_word));
  assert.equal(source.continuous_interval.recording_count,1);assert.equal(source.continuous_interval.concatenation_used,false);
  assert.equal(aligned.paragraphs.length,6);assert.equal(clip.transcript.length,6);
  for(const [i,t] of clip.transcript.entries()){const p=aligned.paragraphs[i];
    for(const key of ['id','source_start','source_end','start','end','cs','timing_basis'])assert.deepEqual(t[key],p[key]);
    assert.equal(t.speaker_id,p.speaker);assert.equal(t.segment_id,p.id);assert.ok(t.zh.length>10);assert.ok(t.note_zh.length>20);
    assert.ok(Math.abs(t.start-(t.source_start-aligned.original_start))<0.00001);assert.ok(t.end<=clip.media.duration);
  }
  const turns=clip.transcript.map(t=>t.speaker_id).filter((s,i,a)=>!i||a[i-1]!==s);
  assert.deepEqual(turns,['MiroslavOpalka.1952','VojtechFilip.1955','MiroslavOpalka.1952']);
});

test('all tasks and detailed analyses cite exact text in the correct paragraph; no invented evidence timestamp',()=>{
  const segments=new Map(clip.transcript.map(t=>[t.segment_id,t]));
  assert.equal(clip.c2_challenge.tasks.length,3);assert.equal(clip.c2_challenge.tasks.flatMap(t=>t.criteria).length,12);assert.equal(clip.deep_dive.length,7);
  const groups=[...clip.c2_challenge.tasks.map(t=>t.evidence),...clip.deep_dive.map(d=>d.evidence_quotes)];
  for(const group of groups)for(const q of group){assert.ok(segments.has(q.segment_id));assert.ok(segments.get(q.segment_id).cs.includes(q.cs),q.cs);}
  for(const task of clip.c2_challenge.tasks){assert.deepEqual(task.evidence_cs,task.evidence.map(q=>q.cs));assert.ok(task.sample_cs.length>100);assert.ok(task.sample_zh.length>70);}
  assert.ok(clip.transcript[3].cs.includes('asi 30 %'));assert.ok(clip.transcript[3].cs.includes('asi 50 %'));
  assert.match(clip.c2_challenge.tasks[1].sample_cs,/Nejde o procenta ze stejného společného základu ani o sazby z příjmu/);
  assert.match(clip.c2_challenge.tasks[2].sample_cs,/nespravedlnosti, nikoli k narovnání/);
});

test('blind entry has listening guidance and own-answer tasks; source text, Chinese, analysis and models only render after persisted exposure',()=>{
  const hidden=challengePage(index,clip,resolveChallengeRecord(clip),{esc,button});
  assert.ok(hidden.includes('先这样听'));assert.ok(hidden.includes('三个任务'));
  for(const p of clip.transcript){assert.ok(!hidden.includes(esc(p.cs)));assert.ok(!hidden.includes(esc(p.zh)));}
  for(const t of clip.c2_challenge.tasks){assert.ok(hidden.includes(esc(t.prompt_zh)));assert.ok(!hidden.includes(esc(t.focus_zh)));assert.ok(!hidden.includes(esc(t.sample_cs)));}
  for(const d of clip.deep_dive)assert.ok(!hidden.includes(esc(d.analysis_zh)));
  const visible=challengePage(index,clip,opened(),{esc,button});
  for(const p of clip.transcript){assert.ok(visible.includes(esc(p.cs)));assert.ok(visible.includes(esc(p.zh)));assert.ok(visible.includes(`data-segment="${p.segment_id}"`));assert.ok(visible.includes(esc(p.speaker)));}
  for(const d of clip.deep_dive)assert.ok(visible.includes(esc(d.analysis_zh)));
  assert.match(visible,/第5段 · Vojtěch Filip（主持会议）/);assert.match(visible,/回听第6段 · 124\.7–134\.2秒/);
  assert.match(visible,/<p lang="cs">[^]*?<\/p><p>/);
});

test('all six actual paragraph replay boundaries reach the correct section and stop; a new section replaces the old boundary',async()=>{
  const audio={currentTime:0,paused:true,pause(){this.paused=true;},async play(){this.paused=false;}};
  for(const p of clip.transcript){await playNativeSegment(audio,p);assert.equal(audio.currentTime,p.start);assert.equal(audio.paused,false);audio.currentTime=p.end-0.01;audio.ontimeupdate();assert.equal(audio.paused,false);audio.currentTime=p.end;audio.ontimeupdate();assert.equal(audio.paused,true);assert.equal(audio.ontimeupdate,null);}
});

test('long material reuses first-answer / disclosure / assisted self-check records and restores on another client',async()=>{
  const notes=[];let current=resolveChallengeRecord(clip,notes),n=0;
  const fields=new Map(clip.c2_challenge.tasks.map(t=>[`[data-native-answer="${t.id}"]`,'自己的首次长段回答']));
  const root={querySelector:s=>({value:fields.get(s)||'partial'})};
  const effects={queue:async text=>notes.push({text,created_at:at(++n)}),refresh:async()=>{current=resolveChallengeRecord(clip,notes);},render(){},async sync(){}};
  await handleChallengeAction('native-challenge-save',clip,current,root,effects);assert.equal(current.first.assisted,false);
  await handleChallengeAction('native-challenge-reveal',clip,current,root,effects);assert.equal(current.exposed,true);
  for(const key of fields.keys())fields.set(key,'读后辅助修订');
  await handleChallengeAction('native-challenge-save',clip,current,root,effects);await handleChallengeAction('native-challenge-check',clip,current,root,effects);
  const secondClient=resolveChallengeRecord(clip,structuredClone(notes));assert.equal(secondClient.first.answers.argument,'自己的首次长段回答');assert.equal(secondClient.latest.answers.argument,'读后辅助修订');assert.equal(secondClient.latest.assisted,true);assert.equal(secondClient.checks['ratios:0'],'partial');
  const short=index.clips.find(c=>c.id==='public-counterfactual');assert.equal(resolveChallengeRecord(short,notes).first,null);
});

test('raw alignment and audio collection license evidence remain separate; no claim of native auditory certification',()=>{
  assert.equal(source.licenses.raw_alignment.license,'CC BY 4.0');assert.equal(source.licenses.audio_collection.license,'CC0 1.0');
  const raw=read('content/authentic/provenance/public-healthcare-continuous/raw-item-metadata.json').toString();
  const audio=read('content/authentic/provenance/public-healthcare-continuous/audiopsp-item-metadata.json').toString();
  assert.ok(raw.includes('creativecommons.org/licenses/by/4.0/'));assert.ok(audio.includes('creativecommons.org/publicdomain/zero/1.0/'));
  assert.equal(clip.c2_challenge.review.native_auditory_review,false);assert.equal(clip.c2_challenge.review.cefr_certified,false);
  const rendered=authenticPage(index,clip.id,[],{esc,button});assert.match(rendered,/CC BY 4\.0/);assert.match(rendered,/CC0 1\.0/);assert.match(rendered,/未下载大归档/);assert.match(rendered,/客户逾期付款/);
});
