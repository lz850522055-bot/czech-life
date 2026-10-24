import fs from 'node:fs';
import path from 'node:path';
import {PROJECT_ROOT} from '../app/server/config.mjs';
import {jsonFiles} from '../app/server/content.mjs';
import {hash,canonical} from '../app/server/util.mjs';
const root=path.resolve(process.argv[2]||PROJECT_ROOT),content=path.join(root,'content'),tracks=[];
const segmenter=new Intl.Segmenter('cs',{granularity:'sentence'});
for(const file of [...jsonFiles(path.join(content,'lessons')),...jsonFiles(path.join(content,'assessments'))]){
 const l=JSON.parse(fs.readFileSync(file,'utf8'));
 const groups=[
  ['text',(l.lesson_text||l.unseen_text||[]).map((s,index)=>({text:s.cs,index,role:'text'}))],
  ['listening',(l.listening?.script||[]).map((s,index)=>({text:s.cs,index,role:'listening'}))],
  ['vocabulary',(l.vocabulary||[]).map((v,index)=>({text:v.example_cs,index,role:'vocabulary'}))],
  ['exercises',l.exercises.filter(e=>e.audio_text_cs).map((e,index)=>({text:e.audio_text_cs,index,role:'exercise',exercise_id:e.id}))],
  ['contrasts',(l.pronunciation?.contrast||[]).map((c,index)=>({text:c.a+'. '+c.b+'.',index,role:'contrast'}))]
 ];
 for(const [group,units]of groups){
  const filtered=units.filter(u=>typeof u.text==='string'&&u.text.trim());if(!filtered.length)continue;
  const id=`${l.id}--${l.version}--${group}`;
  const normalized=filtered.map(u=>({...u,text:u.text.normalize('NFC').trim(),parts:[...segmenter.segment(u.text)].map(x=>x.segment.trim()).filter(Boolean)}));
  tracks.push({id,lesson_id:l.id,content_version:l.version,level:l.level,group,language:'cs-CZ',units:normalized,text_sha256:hash(canonical(normalized)),source_file:path.relative(root,file).split(path.sep).join('/'),status:'script_ready'});
 }
}
const scenarioFile=path.join(content,'scenarios.json');
if(fs.existsSync(scenarioFile))for(const scene of JSON.parse(fs.readFileSync(scenarioFile,'utf8'))){
 const lessonFile=path.join(content,'lessons',scene.level,scene.lesson_id+'.json'),lesson=JSON.parse(fs.readFileSync(lessonFile,'utf8'));
 const units=scene.nodes.map((n,index)=>({text:n.speaker_cs.normalize('NFC').trim(),index,role:'scenario',scenario_id:scene.id,scenario_version:scene.version,node_id:n.id,parts:[...segmenter.segment(n.speaker_cs)].map(x=>x.segment.trim()).filter(Boolean)}));
 tracks.push({id:`${scene.lesson_id}--${lesson.version}--scenario-${scene.id}`,lesson_id:scene.lesson_id,content_version:lesson.version,level:scene.level,group:'scenario-'+scene.id,language:'cs-CZ',units,text_sha256:hash(canonical(units)),source_file:'content/scenarios.json',status:'script_ready'});
}
fs.mkdirSync(path.join(content,'audio'),{recursive:true});fs.writeFileSync(path.join(content,'audio/scripts.json'),JSON.stringify(tracks,null,2));
const header='track_id,lesson_id,content_version,group,language,text_sha256';
fs.writeFileSync(path.join(content,'audio/SCRIPT_IDS.csv'),'\uFEFF'+[header,...tracks.map(t=>[t.id,t.lesson_id,t.content_version,t.group,t.language,t.text_sha256].join(','))].join('\n'));
console.log(JSON.stringify({tracks:tracks.length,paragraphs:tracks.reduce((n,t)=>n+t.units.length,0),sentence_segments:tracks.reduce((n,t)=>n+t.units.reduce((m,u)=>m+u.parts.length,0),0)}));
