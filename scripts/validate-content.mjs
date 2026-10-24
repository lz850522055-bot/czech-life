#!/usr/bin/env node
/**
 * Read-only curriculum audit. Does not rewrite content, audio, or learning data.
 * Usage: node scripts/validate-content.mjs [--root PATH] [--levels Pre-A1,A1,A2]
 *        [--out-dir PATH] [--verify-media-hashes]
 * Default: all seven levels, evidence/content-validation.json + content-coverage.csv.
 * Partial audits explicitly report scope=partial; they cannot certify the full curriculum.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2);
const opt=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(i+1>=args.length||args[i+1].startsWith('--'))throw new Error(`Missing value for ${name}`);return args[i+1];};
const known=new Set(['--root','--levels','--out-dir','--verify-media-hashes']);
for(let i=0;i<args.length;i++){if(!known.has(args[i]))throw new Error(`Unknown argument: ${args[i]}`);if(args[i]!=='--verify-media-hashes')i++;}
const root=fs.realpathSync(path.resolve(opt('--root',fileURLToPath(new URL('..',import.meta.url)))));
const content=path.join(root,'content');
const allLevels=['Pre-A1','A1','A2','B1','B2','C1','C2'];
const selected=opt('--levels',allLevels.join(',')).split(',').map(x=>x.trim()).filter(Boolean);
if(selected.length===0||selected.some(x=>!allLevels.includes(x))||new Set(selected).size!==selected.length)throw new Error('Invalid --levels; use unique values from Pre-A1,A1,A2,B1,B2,C1,C2');
const full=selected.length===allLevels.length;
const outDir=path.resolve(opt('--out-dir',path.join(root,'evidence')));
const now=new Date().toISOString();
const errors=[],warnings=[],documents=[];
const add=(severity,code,file,message)=>{(severity==='error'?errors:warnings).push({code,file,message});};
const rel=p=>path.relative(root,p).split(path.sep).join('/');
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
const list=x=>Array.isArray(x)?x:[];
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const csWords=s=>(String(s).normalize('NFC').match(/\p{L}+(?:[-’']\p{L}+)*/gu)||[]).length;
const hanChars=s=>(String(s).match(/\p{Script=Han}/gu)||[]).length;
const allowedSkills=new Set(['listening','speaking','reading','writing','interaction','mediation']);
const allowedTypes=new Set(['choice','fill','order','correct','writing','speaking','interaction','mediation']);
const openTypes=new Set(['writing','speaking','interaction','mediation']);
const errorsTypes=new Set(['pronunciation','spelling','inflection','meaning','collocation','word_order','comprehension','fluency']);
const expectedUnits={'Pre-A1':6,A1:12,A2:14,B1:14,B2:14,C1:14,C2:12};
const wordTargets={'Pre-A1':0,A1:80,A2:140,B1:220,B2:300,C1:450,C2:550};
const checkedPaths=new Map();
function safeFile(base,reference,where){
 if(!nonempty(reference)||path.isAbsolute(reference)||reference.includes('\0')||/^[a-z]:[\\/]/i.test(reference)){add('error','unsafe_local_path',where,String(reference));return null;}
 const resolved=path.resolve(base,reference),r=path.relative(base,resolved);
 if(r==='..'||r.startsWith('..'+path.sep)){add('error','path_escape',where,reference);return null;}
 if(!fs.existsSync(resolved)){add('error','missing_local_file',where,reference);return null;}
 const real=fs.realpathSync(resolved),rr=path.relative(fs.realpathSync(base),real);
 if(rr==='..'||rr.startsWith('..'+path.sep)||!fs.statSync(real).isFile()){add('error','unsafe_local_target',where,reference);return null;}
 return real;
}
function filesUnder(dir){
 if(!fs.existsSync(dir))return [];
 const result=[];
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,ent.name);
  if(ent.isSymbolicLink()){add('error','symlink_in_content',rel(p),'Content files must not escape via symbolic links.');continue;}
  if(ent.isDirectory())result.push(...filesUnder(p));else if(ent.isFile()&&ent.name.endsWith('.json'))result.push(p);
 }
 return result.sort();
}
function readJSON(p){
 try{const bytes=fs.readFileSync(p);if(bytes.includes(Buffer.from('\uFFFD')))add('error','replacement_character',rel(p),'Contains Unicode replacement character.');const data=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));checkedPaths.set(p,hash(bytes));return data;}
 catch(e){add('error','json_read_error',rel(p),e.message);return null;}
}
const unitsData=readJSON(path.join(content,'units.json'));
const units=list(unitsData),unitMap=new Map();
for(const u of units){if(!u||!nonempty(u.id)){add('error','unit_id_missing','content/units.json','Unit needs id.');continue;}if(unitMap.has(u.id))add('error','duplicate_unit_id','content/units.json',u.id);unitMap.set(u.id,u);if(!allLevels.includes(u.level))add('error','unit_level','content/units.json',u.id);}
for(const level of selected){const n=units.filter(u=>u.level===level).length;if(n!==expectedUnits[level])add('error','skeleton_unit_count','content/units.json',`${level}: expected ${expectedUnits[level]}, found ${n}.`);}
for(const u of units){if(nonempty(u.predecessor)&&!unitMap.has(u.predecessor))add('error','broken_unit_predecessor','content/units.json',`${u.id} -> ${u.predecessor}`);}
const allLessonFiles=filesUnder(path.join(content,'lessons'));
const allAssessmentFiles=filesUnder(path.join(content,'assessments'));
const allLessons=[],allAssessments=[];
for(const [kind,paths] of [['lesson',allLessonFiles],['assessment',allAssessmentFiles]])for(const file of paths){
 const data=readJSON(file);if(!data)continue;
 if(!data||typeof data!=='object'||Array.isArray(data)){add('error','document_object',rel(file),'Expected JSON object.');continue;}
 const d={kind,file:rel(file),data};(kind==='lesson'?allLessons:allAssessments).push(d);
 if(selected.includes(data.level))documents.push(d);
}
const lessons=documents.filter(d=>d.kind==='lesson'),assessments=documents.filter(d=>d.kind==='assessment');
const lessonById=new Map(),docById=new Map();
for(const d of [...allLessons,...allAssessments]){if(docById.has(d.data.id))add('error','duplicate_document_id',d.file,`Duplicate ${d.data.id}; first at ${docById.get(d.data.id).file}`);docById.set(d.data.id,d);if(d.kind==='lesson')lessonById.set(d.data.id,d);}
const exerciseIds=new Map(),grammarKeys=new Set(allLessons.flatMap(d=>list(d.data.knowledge_points)));
const textHashes=new Map(),repeatedExercises=new Map(),coverage=[];
let nativeReviewedClaimCount=0;
function reqString(x,key,file){if(!nonempty(x[key]))add('error','required_string',file,`Missing or empty ${key}`);}
function reqArray(x,key,min,file){if(!Array.isArray(x[key])||x[key].length<min)add('error','required_array',file,`${key} needs at least ${min} item(s).`);}
function checkText(segments,file,field){
 if(!Array.isArray(segments)||segments.length===0){add('error','empty_language_material',file,`${field} is empty.`);return;}
 const seen=new Set();
 for(const [i,s]of segments.entries()){
  if(!s||!nonempty(s.cs)||!nonempty(s.zh)){add('error','parallel_text_missing',file,`${field}[${i}] requires cs and zh.`);continue;}
  if(/\p{Script=Han}/u.test(s.cs))add('error','czech_field_has_chinese',file,`${field}[${i}].cs contains Chinese characters.`);
  if(s.id){if(seen.has(s.id))add('error','duplicate_segment_id',file,`${field}: ${s.id}`);seen.add(s.id);}
 }
}
function checkExercise(e,d){
 const f=d.file,x=d.data;
 if(!e||typeof e!=='object'){add('error','invalid_exercise',f,'Exercise is not an object.');return;}
 for(const k of ['id','type','prompt_zh','explanation_zh','scoring_basis','error_category'])reqString(e,k,f);
 if(exerciseIds.has(e.id))add('error','duplicate_exercise_id',f,`${e.id}; first at ${exerciseIds.get(e.id)}`);exerciseIds.set(e.id,f);
 if(!allowedTypes.has(e.type))add('error','exercise_type',f,`${e.id}: ${e.type}`);
 if(!errorsTypes.has(e.error_category))add('error','error_category',f,`${e.id}: ${e.error_category}`);
 if(e.answer===null||e.answer===undefined||(typeof e.answer==='string'&&!e.answer.trim()))add('error','missing_answer',f,e.id);
 reqArray(e,'skill_ids',1,f);
 for(const sk of list(e.skill_ids))if(!allowedSkills.has(sk))add('error','unknown_skill',f,`${e.id}: ${sk}`);
 if(e.knowledge_points!==undefined&&!Array.isArray(e.knowledge_points))add('error','knowledge_points_type',f,e.id);
 for(const k of list(e.knowledge_points))if(!grammarKeys.has(k))add('warning','knowledge_point_not_in_lesson_index',f,`${e.id}: ${k}`);
 if(e.type==='choice'){
  reqArray(e,'options',2,f);const ids=list(e.options).map(o=>o?.id);
  if(new Set(ids).size!==ids.length||ids.some(z=>!nonempty(z)))add('error','choice_option_ids',f,e.id);
  if(!ids.includes(e.answer))add('error','choice_answer_missing_option',f,e.id);
  if(list(e.options).some(o=>!nonempty(o?.text)))add('error','choice_option_text',f,e.id);
 }
 if(['fill','correct','order'].includes(e.type)){
  reqArray(e,'accepted_answers',1,f);
  if(list(e.accepted_answers).some(v=>!nonempty(v)))add('error','empty_accepted_answer',f,e.id);
  if(nonempty(e.answer)&&!list(e.accepted_answers).includes(e.answer))add('warning','model_not_in_accepted',f,e.id);
 }
 if(e.type==='order'){reqArray(e,'options',2,f);if(list(e.options).some(v=>!nonempty(v)))add('error','order_option_type',f,e.id);}
 if(openTypes.has(e.type)){reqArray(e,'rubric',3,f);if(typeof e.score==='number')add('warning','fixed_open_score',f,`${e.id}: fixed score needs justification.`);}
 if(list(e.skill_ids).includes('listening')&&!nonempty(e.audio_text_cs)&&!list(x.listening?.script).length&&!list(x.unseen_text).length)add('error','listening_no_script',f,e.id);
 if(e.audio_text_cs!==undefined&&!nonempty(e.audio_text_cs))add('error','empty_audio_script',f,e.id);
 const h=hash(JSON.stringify([e.type,e.prompt_zh,e.stimulus_cs??'',e.options??[],e.answer]));
 if(repeatedExercises.has(h))add('warning','identical_exercise',f,`${e.id} duplicates ${repeatedExercises.get(h)}; review pedagogical intent.`);else repeatedExercises.set(h,e.id);
}
for(const d of documents){
 const x=d.data,f=d.file;
 for(const k of ['id','level','version','title_zh'])reqString(x,k,f);
 if(!allLevels.includes(x.level))add('error','unknown_level',f,x.level);
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(x.id??''))add('error','unsafe_id',f,String(x.id));
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(x.version??''))add('error','unsafe_version',f,String(x.version));
 if(d.kind==='lesson'){
  for(const k of ['unit_id','title_cs','scene','intro_zh','content_status'])reqString(x,k,f);
  const u=unitMap.get(x.unit_id);if(!u)add('error','unknown_unit',f,x.unit_id);else if(u.level!==x.level)add('error','unit_level_mismatch',f,x.unit_id);
  if(!Number.isFinite(x.order))add('error','lesson_order',f,'Order must be numeric.');
  for(const k of ['can_do','skills','knowledge_points','grammar','vocabulary','sources'])reqArray(x,k,1,f);
  for(const k of ['prerequisites','review_links']){if(!Array.isArray(x[k]))add('error','link_array',f,k);for(const id of list(x[k])){if(!lessonById.has(id))add('error','broken_lesson_link',f,`${k}: ${id}`);if(id===x.id)add('error','self_prerequisite',f,k);}}
  for(const sk of list(x.skills))if(!allowedSkills.has(sk))add('error','lesson_unknown_skill',f,sk);
  checkText(x.lesson_text,f,'lesson_text');checkText(x.listening?.script,f,'listening.script');
  const gramIds=new Set();
  for(const g of list(x.grammar)){
   for(const k of ['id','rule_zh','detail_zh'])reqString(g,k,f);
   if(gramIds.has(g.id))add('error','duplicate_grammar_id_in_lesson',f,g.id);gramIds.add(g.id);
   if(!list(x.knowledge_points).includes(g.id))add('error','grammar_not_indexed',f,g.id);
   reqArray(g,'examples',1,f);checkText(g.examples,f,`grammar.${g.id}.examples`);reqArray(g,'pitfalls',1,f);reqArray(g,'exceptions',1,f);
  }
  for(const v of list(x.vocabulary))for(const k of ['lemma','pos','forms','meaning_zh','collocation','example_cs','example_zh','confusion_zh'])reqString(v,k,f);
  if(!x.pronunciation||typeof x.pronunciation!=='object')add('error','pronunciation_missing',f,x.id);else{reqString(x.pronunciation,'focus_zh',f);reqString(x.pronunciation,'task_zh',f);for(const c of list(x.pronunciation.contrast))for(const k of ['a','b','note_zh'])reqString(c,k,f);}
  if(!x.transfer_task||typeof x.transfer_task!=='object')add('error','transfer_missing',f,x.id);else{reqString(x.transfer_task,'prompt_zh',f);reqString(x.transfer_task,'model_answer_cs',f);reqArray(x.transfer_task,'rubric',1,f);}
  for(const s of list(x.sources)){
   if(!s||typeof s!=='object'){add('error','source_object',f,x.id);continue;}
   reqString(s,'url',f);reqString(s,'scope',f);reqString(s,'verification',f);
   try{const u=new URL(s.url);if(!['http:','https:'].includes(u.protocol))throw new Error('not HTTP(S)');}catch{add('error','source_url_invalid',f,String(s.url));}
  }
  if(/(^|[^a-z])native_reviewed($|[^a-z])/i.test(x.content_status)&&!x.content_status.includes('not_native'))nativeReviewedClaimCount++;
  reqArray(x,'exercises',10,f);
  const body=list(x.lesson_text).map(s=>s.cs??'').join(' '),wc=csWords(body);
  if(wc<wordTargets[x.level])add('warning','below_editorial_word_target',f,`${wc} Czech words; internal editorial target ${wordTargets[x.level]}, not a CEFR rule.`);
  const normalized=body.normalize('NFC').toLocaleLowerCase('cs').replace(/[\p{P}\p{S}\s]+/gu,' ').trim(),th=hash(normalized);
  if(textHashes.has(th))add('error','duplicate_main_text',f,`Same normalized text as ${textHashes.get(th)}`);else textHashes.set(th,x.id);
 }else{
  if(!['unit','level'].includes(x.kind))add('error','assessment_kind',f,String(x.kind));
  if(x.kind==='unit'){reqString(x,'unit_id',f);if(!unitMap.has(x.unit_id))add('error','assessment_unknown_unit',f,x.unit_id);if(x.id!==x.unit_id+'-CHECK')add('error','assessment_id_mismatch',f,x.id);}
  if(x.kind==='level'&&x.id!==x.level+'-FINAL')add('error','level_assessment_id',f,x.id);
  checkText(x.unseen_text,f,'unseen_text');reqArray(x,'exercises',x.kind==='level'?6:3,f);reqArray(x,'rubric',1,f);reqArray(x,'remediation',1,f);
  for(const r of list(x.remediation)){reqString(r,'condition_zh',f);reqString(r,'action_zh',f);reqArray(r,'lesson_ids',1,f);for(const id of list(r.lesson_ids))if(!lessonById.has(id))add('error','broken_remediation_link',f,id);}
  if(x.kind==='level'){const represented=new Set(list(x.exercises).flatMap(e=>list(e.skill_ids)));for(const sk of allowedSkills)if(!represented.has(sk))add('error','level_assessment_missing_skill',f,sk);}
 }
 for(const e of list(x.exercises))checkExercise(e,d);
}
// Prerequisite cycles: map dependencies independently from the lesson display order.
const visiting=new Set(),visited=new Set();
function visit(id,chain=[]){if(visiting.has(id)){add('error','prerequisite_cycle',lessonById.get(id)?.file??'',chain.concat(id).join(' -> '));return;}if(visited.has(id)||!lessonById.has(id))return;visiting.add(id);for(const pre of list(lessonById.get(id).data.prerequisites))visit(pre,chain.concat(id));visiting.delete(id);visited.add(id);}
for(const d of lessons)visit(d.data.id);
for(const u of units.filter(u=>selected.includes(u.level))){
 if(!lessons.some(d=>d.data.unit_id===u.id))add('error','unit_without_lesson','content/units.json',u.id);
 const matches=assessments.filter(d=>d.data.kind==='unit'&&d.data.unit_id===u.id);if(matches.length!==1)add('error','unit_assessment_count','content/assessments',`${u.id}: expected 1, found ${matches.length}`);
}
for(const level of selected){const matches=assessments.filter(d=>d.data.kind==='level'&&d.data.level===level);if(matches.length!==1)add('error','level_assessment_count','content/assessments',`${level}: expected 1, found ${matches.length}`);}
// Per-lesson matrix includes direct question mappings, not just a named capability.
for(const d of lessons){
 const x=d.data;
 const related=assessments.filter(a=>a.data.unit_id===x.unit_id||(a.data.kind==='level'&&a.data.level===x.level));
 for(const [dimension,keys]of [['skill',x.skills],['knowledge_point',x.knowledge_points],['scene',[x.scene]]])for(const key of [...new Set(list(keys))]){
  const match=e=>dimension==='skill'?list(e.skill_ids).includes(key):dimension==='knowledge_point'?list(e.knowledge_points).includes(key):true;
  const exercises=list(x.exercises).filter(match).map(e=>e.id);
  const mapped=related.filter(a=>dimension!=='scene'||a.data.kind==='unit').flatMap(a=>list(a.data.exercises).filter(match).map(e=>({assessment_id:a.data.id,exercise_id:e.id})));
  const status=!exercises.length?'missing_lesson_exercise':!mapped.length?'missing_assessment_mapping':'mapped';
  if(!exercises.length)add('error','coverage_no_exercise',d.file,`${dimension}: ${key}`);
  if(!mapped.length)add('warning','coverage_no_assessment_mapping',d.file,`${dimension}: ${key}; add explicit assessment knowledge/skill links.`);
  coverage.push({dimension,key,level:x.level,scene:x.scene,unit_id:x.unit_id,lesson_id:x.id,lesson_file:d.file,content_version:x.version,exercise_ids:exercises.join('|'),assessment_ids:[...new Set(mapped.map(m=>m.assessment_id))].join('|'),assessment_exercise_ids:mapped.map(m=>m.exercise_id).join('|'),coverage_status:status});
 }
}
// Media integrity; no claim of auditory/native quality or actual speaker playback.
const media={manifest_present:false,references:0,current_references:0,historical_references:0,generated_references:0,not_generated_references:0,physical_files:0,physical_bytes:0,sha256_verified_files:0,invalid_generated_files:0,auditory_native_review:'not_performed_by_this_validator',file_integrity_only:true};
const mediaPath=path.join(content,'audio/manifest.json'),audioFiles=new Set(),mediaIdMap=new Map(),mediaHashes=new Map();
if(fs.existsSync(mediaPath)){
 media.manifest_present=true;const manifest=readJSON(mediaPath);
 if(!Array.isArray(manifest))add('error','audio_manifest_type',rel(mediaPath),'Expected array.');
 for(const a of list(manifest)){
  if(mediaIdMap.has(a.id))add('error','duplicate_audio_id',rel(mediaPath),a.id);mediaIdMap.set(a.id,a);
  const doc=docById.get(a.lesson_id);
  if(!doc){add('error','audio_unknown_document',rel(mediaPath),a.lesson_id);continue;}
  if(!selected.includes(doc.data.level))continue;
  media.references++;
  // finalize-audio retains inactive, versioned assets for historical attempts.
  // Those still require valid media/hash/cues and their own version in the ID.
  if(a.active===false)media.historical_references++;else media.current_references++;
  if(a.active!==false&&a.content_version!==doc.data.version)add('error','audio_version_mismatch',rel(mediaPath),a.id);
  if(!a.id.startsWith(`${a.lesson_id}--${a.content_version}--`))add('error','audio_id_version_mismatch',rel(mediaPath),a.id);
  if(a.language!=='cs-CZ'&&a.language!=='cs')add('error','audio_not_czech',rel(mediaPath),a.id);
  if(!nonempty(a.text))add('error','audio_script_missing',rel(mediaPath),a.id);
  if(a.status==='generated'){
   media.generated_references++;
   for(const [key,hashKey] of [['file','sha256'],['slow_file','slow_sha256']]){
    const before=errors.length,p=safeFile(content,a[key],`${rel(mediaPath)}#${a.id}.${key}`);if(!p){media.invalid_generated_files++;continue;}
    audioFiles.add(p);
    if(args.includes('--verify-media-hashes')&&a[hashKey]){
     let digest=mediaHashes.get(p);if(!digest){digest=hash(fs.readFileSync(p));mediaHashes.set(p,digest);}
     if(digest!==a[hashKey])add('error','audio_hash_mismatch',rel(mediaPath),`${a.id}.${key}`);
    }
    if(errors.length>before)media.invalid_generated_files++;
   }
   if(a.asset_id&&(!(Number.isFinite(a.start)&&Number.isFinite(a.end))||a.end<=a.start))add('error','invalid_audio_cue',rel(mediaPath),a.id);
   if(a.asset_id&&(!(Number.isFinite(a.slow_start)&&Number.isFinite(a.slow_end))||a.slow_end<=a.slow_start))add('error','invalid_slow_audio_cue',rel(mediaPath),a.id);
  }else{media.not_generated_references++;if(a.status!=='not_generated'&&a.status!=='missing')add('warning','audio_status_unknown',rel(mediaPath),`${a.id}: ${a.status}`);}
 }
 for(const d of documents){
  if(!Array.isArray(d.data.audio_refs)||!d.data.audio_refs.length){add('warning','lesson_audio_refs_missing',d.file,d.data.id);continue;}
  for(const ref of d.data.audio_refs){
   const id=typeof ref==='string'?ref:ref?.id,asset=mediaIdMap.get(id);
   if(!asset)add('error','broken_audio_ref',d.file,String(id));
   else if(asset.active===false||asset.lesson_id!==d.data.id||asset.content_version!==d.data.version)add('error','lesson_audio_ref_version',d.file,String(id));
  }
 }
}else add('warning','audio_manifest_missing','content/audio/manifest.json','Generate scripts and manifest before media acceptance.');
for(const f of audioFiles){media.physical_bytes+=fs.statSync(f).size;}
media.physical_files=audioFiles.size;media.sha256_verified_files=mediaHashes.size;
if(media.not_generated_references)add('warning','audio_assets_missing','content/audio/manifest.json',`${media.not_generated_references} reference(s) not generated; requires honest TTS fallback and missing list.`);
if(fs.existsSync(path.join(content,'audio/scripts.json'))){
 const tracks=readJSON(path.join(content,'audio/scripts.json'));
 for(const t of list(tracks)){
  const d=docById.get(t.lesson_id);if(!d||!selected.includes(d.data.level))continue;
  if(t.content_version!==d.data.version)add('error','audio_script_version','content/audio/scripts.json',t.id);
  if(t.source_file)safeFile(root,t.source_file,'content/audio/scripts.json');
  if(!list(t.units).length)add('error','empty_audio_track','content/audio/scripts.json',t.id);
 }
}else add('warning','audio_scripts_missing','content/audio/scripts.json','Stable generation input script index not present.');
const byLevel={};
for(const level of selected){
 const ls=lessons.filter(d=>d.data.level===level),as=assessments.filter(d=>d.data.level===level);
 const words=ls.map(d=>csWords(list(d.data.lesson_text).map(s=>s.cs??'').join(' ')));
 const allEx=[...ls,...as].flatMap(d=>list(d.data.exercises));
 byLevel[level]={expected_units:expectedUnits[level],actual_units:new Set(ls.map(d=>d.data.unit_id)).size,lessons:ls.length,lesson_exercises:ls.reduce((n,d)=>n+list(d.data.exercises).length,0),unit_assessments:as.filter(d=>d.data.kind==='unit').length,level_assessments:as.filter(d=>d.data.kind==='level').length,assessment_exercises:as.reduce((n,d)=>n+list(d.data.exercises).length,0),main_text_czech_words:words.reduce((a,b)=>a+b,0),min_main_text_words:words.length?Math.min(...words):0,max_main_text_words:words.length?Math.max(...words):0,chinese_explanation_characters:ls.reduce((n,d)=>n+hanChars(d.data.intro_zh)+list(d.data.grammar).reduce((m,g)=>m+hanChars(g.rule_zh)+hanChars(g.detail_zh),0),0),vocabulary_entries:ls.reduce((n,d)=>n+list(d.data.vocabulary).length,0),open_production_exercises:allEx.filter(e=>openTypes.has(e.type)).length,exercise_types:Object.fromEntries([...allowedTypes].map(t=>[t,allEx.filter(e=>e.type===t).length])),skills_with_exercise_evidence:[...new Set(allEx.flatMap(e=>list(e.skill_ids)))].sort()};
 for(const sk of allowedSkills)if(!byLevel[level].skills_with_exercise_evidence.includes(sk))add('error','level_missing_skill',`content/lessons/${level}`,sk);
}
// Detect concurrent editing, rather than claiming a stable snapshot when authors are still writing.
for(const [p,digest]of checkedPaths){if(!fs.existsSync(p)||hash(fs.readFileSync(p))!==digest)add('error','changed_during_audit',rel(p),'File changed during audit; rerun after content writes finish.');}
const report={schema_version:'1.0',generated_at_utc:now,audit_scope:full?'full_curriculum':'partial_selected_levels',selected_levels:selected,project_root_portable:'.',mode:'read_only_content_audit',status:errors.length?'failed':'passed_structure_checks',totals:{expected_units:selected.reduce((n,l)=>n+expectedUnits[l],0),lessons:lessons.length,unit_assessments:assessments.filter(d=>d.data.kind==='unit').length,level_assessments:assessments.filter(d=>d.data.kind==='level').length,lesson_exercises:lessons.reduce((n,d)=>n+list(d.data.exercises).length,0),assessment_exercises:assessments.reduce((n,d)=>n+list(d.data.exercises).length,0),coverage_rows:coverage.length,coverage_rows_with_direct_mappings:coverage.filter(r=>r.coverage_status==='mapped').length,errors:errors.length,warnings:warnings.length},by_level:byLevel,media,source_check_scope:'URL syntax and non-empty provenance fields checked; this script does not fetch sources or certify Czech naturalness.',language_review_scope:'Structure, references, explicit answers, duplicate whole texts, word counts and mapped evidence only; no native-language audit.',native_review_claims_detected:nativeReviewedClaimCount,errors,warnings,content_files:documents.map(d=>({path:d.file,id:d.data.id,version:d.data.version,sha256:checkedPaths.get(path.join(root,d.file))}))};
fs.mkdirSync(outDir,{recursive:true});fs.writeFileSync(path.join(outDir,'content-validation.json'),JSON.stringify(report,null,2)+'\n');
const headers=['dimension','key','level','scene','unit_id','lesson_id','lesson_file','content_version','exercise_ids','assessment_ids','assessment_exercise_ids','coverage_status'];
const csv=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync(path.join(outDir,'content-coverage.csv'),'\uFEFF'+[headers.map(csv).join(','),...coverage.map(r=>headers.map(k=>csv(r[k])).join(','))].join('\r\n')+'\r\n');
console.log(JSON.stringify({scope:report.audit_scope,status:report.status,...report.totals,media:report.media,report:rel(path.join(outDir,'content-validation.json'))},null,2));
if(errors.length){console.error(errors.slice(0,30).map(e=>`${e.code}: ${e.file}: ${e.message}`).join('\n'));process.exitCode=1;}
