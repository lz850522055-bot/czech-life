import fs from 'node:fs';
import path from 'node:path';
import { canonical, hash, now, fail, validId } from './util.mjs';
import { transaction } from './db.mjs';
import {listeningSession} from '../public/advanced-listening.js';

export const LEVELS=['Pre-A1','A1','A2','B1','B2','C1','C2'];
export const SKILLS=['listening','speaking','reading','writing','interaction','mediation'];
export const TYPES=['choice','fill','order','correct','writing','speaking','interaction','mediation'];
export function jsonFiles(dir) {
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?jsonFiles(path.join(dir,e.name)):(e.isFile()&&e.name.endsWith('.json')?[path.join(dir,e.name)]:[])).sort();
}
export function validateItem(item,{full=false}={}) {
  const errors=[];
  const check=(ok,message)=>{if(!ok) errors.push(message);};
  check(item&&typeof item==='object'&&!Array.isArray(item),'必须是教材对象');
  if(errors.length) return errors;
  check(validId(item.id),'id 格式不正确');
  check(typeof item.version==='string'&&/^[A-Za-z0-9_.-]{1,50}$/.test(item.version),'版本格式不正确');
  check(LEVELS.includes(item.level),'级别不正确');
  check(typeof item.title_zh==='string'&&item.title_zh.length>1,'缺少课名');
  check(Array.isArray(item.exercises)&&item.exercises.length>=1,'没有真实练习');
  const ids=new Set();
  for(const e of item.exercises||[]) {
    check(validId(e.id)&&!ids.has(e.id),`练习ID无效或重复 ${e.id}`); ids.add(e.id);
    check(TYPES.includes(e.type),`${e.id}: 不支持题型 ${e.type}`);
    check(typeof e.prompt_zh==='string'&&e.prompt_zh.length>1,`${e.id}: 缺题目`);
    check(e.answer!==null&&e.answer!==undefined&&String(e.answer).length>0,`${e.id}: 缺答案/示范`);
    check(Boolean(e.explanation_zh)&&Boolean(e.scoring_basis),`${e.id}: 缺解析/评分依据`);
    check(Array.isArray(e.skill_ids)&&e.skill_ids.length>0&&e.skill_ids.every(s=>SKILLS.includes(s)),`${e.id}: 能力映射错误`);
    if(e.type==='choice') check(Array.isArray(e.options)&&e.options.length>=2&&e.options.some(o=>String(typeof o==='object'?o.id:o)===String(e.answer)),`${e.id}: 选项答案不存在`);
  }
  if(item.listening_session){
    const c=item.listening_session,session=listeningSession(item);
    check(Boolean(session),'听力任务没有有效的现有音源');
    check(!c.id||validId(c.id),'听力任务ID无效');
    check(Array.isArray(c.exercise_ids)&&new Set(c.exercise_ids).size===c.exercise_ids.length&&c.exercise_ids.every(id=>ids.has(id)),'听力任务题目无效或重复');
    check(!c.source_role||c.source_role==='full','整篇听力必须使用full音源');
    check(!(c.source_role&&c.source_exercise_ids?.length),'听力材料不可同时指定正文与独立短音源');
    if(c.source_exercise_ids)check(Array.isArray(c.source_exercise_ids)&&c.source_exercise_ids.length>0&&c.source_exercise_ids.every(id=>item.exercises.some(e=>e.id===id&&e.audio_text_cs)),'独立听力音源题目无效');
    if(c.evidence)check(Array.isArray(c.evidence),'听力依据必须是数组');
    for(const e of Array.isArray(c.evidence)?c.evidence:[]){
      if(!e||typeof e!=='object'){check(false,'听力依据无效');continue;}
      check(c.exercise_ids?.includes(e.exercise_id),'听力依据不属于本组题目');
      if(e.paragraph_indices)check(Array.isArray(e.paragraph_indices)&&e.paragraph_indices.every(i=>Number.isInteger(i)&&i>=0&&i<(session?.paragraphs.length||0)),'听力依据段落无效');
      if(e.source_exercise_ids)check(Array.isArray(e.source_exercise_ids)&&e.source_exercise_ids.every(id=>c.source_exercise_ids?.includes(id)),'听力依据音源无效');
    }
  }
  if(!item.kind || item.kind==='lesson') {
    check(validId(item.unit_id),'缺单元ID');
    check(Array.isArray(item.lesson_text)&&item.lesson_text.length>0,'缺真实课文');
    check((item.lesson_text||[]).every(s=>typeof s.cs==='string'&&s.cs.trim()&&typeof s.zh==='string'&&s.zh.trim()),'课文/翻译缺失');
    check(Array.isArray(item.grammar)&&item.grammar.length>0,'缺规律');
    check(Array.isArray(item.vocabulary)&&item.vocabulary.length>0,'缺词汇');
    check(Boolean(item.intro_zh)&&Array.isArray(item.can_do)&&item.can_do.length>0,'缺导入或能力目标');
    if(full) {
      check(item.exercises?.length>=10,'每课不足10题');
      check(Array.isArray(item.listening?.script)&&item.listening.script.length>0,'缺听力脚本');
      check(Boolean(item.pronunciation?.focus_zh)&&Boolean(item.pronunciation?.task_zh),'缺发音训练');
      check(Boolean(item.transfer_task?.prompt_zh)&&Boolean(item.transfer_task?.model_answer_cs),'缺迁移任务');
      check(Array.isArray(item.sources)&&item.sources.length>0,'缺来源');
    }
  } else {
    check(['unit','level'].includes(item.kind),'测评类型错误');
    check(Array.isArray(item.unseen_text)&&item.unseen_text.length>0,'缺测评新材料');
  }
  return errors;
}
export function importItem(db,item,{activate=true}={}) {
  const errors=validateItem(item);
  if(errors.length) fail(400,errors.join('；'),'INVALID_CONTENT');
  const payload=canonical(item), digest=hash(payload);
  const existing=db.prepare('SELECT sha256 FROM content_versions WHERE content_id=? AND version=?').get(item.id,item.version);
  if(existing) {
    if(existing.sha256!==digest) fail(409,`${item.id} 的 ${item.version} 已存在且内容不同；请提升版本，历史不能改写。`,'VERSION_CONFLICT');
    return {id:item.id,version:item.version,status:'unchanged'};
  }
  return transaction(db,()=>{
    db.prepare('INSERT INTO content_versions VALUES (?,?,?,?)').run(item.id,item.version,digest,now());
    if(activate) db.prepare('UPDATE lessons SET active=0 WHERE id=?').run(item.id);
    db.prepare('INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?,?)').run(item.id,item.version,item.kind||'lesson',item.level,item.unit_id||null,item.title_zh,Number(item.order)||0,activate?1:0,payload);
    for(const skill of new Set([...(item.skills||[]),...item.exercises.flatMap(e=>e.skill_ids)])) {
      if(SKILLS.includes(skill)) db.prepare('INSERT OR IGNORE INTO lesson_skill_links VALUES (?,?,?)').run(item.id,item.version,skill);
    }
    for(const e of item.exercises) db.prepare('INSERT INTO exercises VALUES (?,?,?,?)').run(e.id,item.version,item.id,JSON.stringify(e));
    return {id:item.id,version:item.version,status:'imported'};
  });
}
export function loadContent(db,cfg) {
  const units=JSON.parse(fs.readFileSync(path.join(cfg.contentDir,'units.json'),'utf8'));
  for(const u of units) db.prepare('INSERT OR REPLACE INTO curriculum_units VALUES (?,?,?,?,?)').run(u.id,u.level,u.title_zh,u.order,u.predecessor||null);
  const files=[...jsonFiles(path.join(cfg.contentDir,'lessons')),...jsonFiles(path.join(cfg.contentDir,'assessments')),...jsonFiles(path.join(cfg.contentDir,'updates'))];
  const result=[];
  for(const file of files) result.push(importItem(db,JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))));
  return result;
}
export function getItem(db,id,version) {
  const row=version?db.prepare('SELECT payload FROM lessons WHERE id=? AND version=?').get(id,version):db.prepare('SELECT payload FROM lessons WHERE id=? AND active=1').get(id);
  if(!row) fail(404,'课程或历史版本不存在。','CONTENT_NOT_FOUND');
  return JSON.parse(row.payload);
}
export function curriculum(db) {
  const rows=db.prepare('SELECT payload,kind FROM lessons WHERE active=1 ORDER BY order_no,id').all();
  const lessons=rows.map(r=>{
    const l=JSON.parse(r.payload);
    return {id:l.id,version:l.version,kind:r.kind,level:l.level,unit_id:l.unit_id,title_zh:l.title_zh,title_cs:l.title_cs||'',order:l.order||0,scene:l.scene||'',can_do:l.can_do||[],skills:l.skills||[...new Set(l.exercises.flatMap(e=>e.skill_ids))],knowledge_points:l.knowledge_points||[],prerequisites:l.prerequisites||[],exercise_count:l.exercises.length,content_status:l.content_status||'authored',word_count:(l.lesson_text||l.unseen_text||[]).map(t=>t.cs).join(' ').match(/[\p{L}]+(?:[’'-][\p{L}]+)*/gu)?.length||0};
  });
  return {levels:LEVELS,units:db.prepare('SELECT * FROM curriculum_units ORDER BY order_no').all(),lessons,revision:hash(canonical(lessons)),server_time:now()};
}
export function contentReport(db,cfg) {
  const c=curriculum(db), counts={};
  for(const level of LEVELS) {
    const lessons=c.lessons.filter(l=>l.level===level&&l.kind==='lesson');
    counts[level]={lessons:lessons.length,exercises:lessons.reduce((n,l)=>n+l.exercise_count,0),words:lessons.reduce((n,l)=>n+l.word_count,0),assessments:c.lessons.filter(l=>l.level===level&&l.kind!=='lesson').length};
  }
  const m=path.join(cfg.contentDir,'audio/manifest.json');
  const media=fs.existsSync(m)?JSON.parse(fs.readFileSync(m,'utf8')):[];
  const tracks=media.filter(m=>!m.asset_id),files=new Set(media.filter(m=>m.status==='generated').flatMap(m=>[m.file,m.slow_file]).filter(f=>f&&fs.existsSync(path.join(cfg.contentDir,f))));
  return {counts,missing_units:c.units.filter(u=>!c.lessons.some(l=>l.unit_id===u.id&&l.kind==='lesson')).map(u=>u.id),audio:{scripts:tracks.length,cue_refs:media.length,files:files.size,missing:tracks.filter(m=>m.status!=='generated'||!m.file||!m.slow_file||!fs.existsSync(path.join(cfg.contentDir,m.file))||!fs.existsSync(path.join(cfg.contentDir,m.slow_file))).length},native_review:'尚未完成逐句母语审校'};
}
