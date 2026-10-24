/** Import a replacement recording into an unpublished version's track metadata.
 * Usage: node scripts/import-audio.mjs DESCRIPTOR.json [--dry-run]
 * Follow with finalize-audio.mjs, then publish/import the new lesson version.
 * Input records an actual existing pair of normal/slow audio files and exact cues.
 */
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {loadConfig} from '../app/server/config.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
try{
 const file=process.argv[2];if(!file)throw new Error('Provide a JSON descriptor; see docs/AUDIO.md.');
 const d=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')),cfg=loadConfig(),root=cfg.root,audio=path.join(cfg.contentDir,'audio');
 const scripts=JSON.parse(fs.readFileSync(path.join(audio,'scripts.json'),'utf8')),track=scripts.find(t=>t.id===d.track_id);if(!track)throw new Error('Unknown track_id. Rebuild scripts for the new course version first.');
 if(fs.existsSync(cfg.dbPath)){const db=new DatabaseSync(cfg.dbPath,{readOnly:true});try{if(db.prepare('SELECT 1 FROM content_versions WHERE content_id=? AND version=?').get(track.lesson_id,track.content_version))throw new Error('This version is already published. Increase the lesson version before replacing audio.');}finally{db.close();}}
 if(!Array.isArray(d.cues)||d.cues.length!==track.units.length)throw new Error('Provide one cue per script unit, in the original order.');
 for(const [i,c]of d.cues.entries()){
  if(c.text!==track.units[i].text)throw new Error('Cue text must match the authored script exactly.');
  for(const prefix of ['', 'slow_'])if(!Number.isFinite(c[prefix+'start'])||!Number.isFinite(c[prefix+'end'])||c[prefix+'start']<0||c[prefix+'end']<=c[prefix+'start']||c[prefix+'end']>Number(d[prefix+'duration_seconds']))throw new Error('Invalid cue or duration.');
  if(!Array.isArray(c.sentences)||c.sentences.length!==track.units[i].parts.length)throw new Error('Provide sentence cues for every script part.');
  for(const [j,s]of c.sentences.entries())for(const prefix of ['', 'slow_'])if(s.text!==track.units[i].parts[j]||!Number.isFinite(s[prefix+'start'])||!Number.isFinite(s[prefix+'end'])||s[prefix+'start']<c[prefix+'start']||s[prefix+'end']>c[prefix+'end']||s[prefix+'end']<=s[prefix+'start'])throw new Error('Invalid sentence cue or text.');
 }
 if(typeof d.voice_label!=='string'||!d.voice_label.trim())throw new Error('Describe the recording source and rights in voice_label and rights_note.');
 if(typeof d.rights_note!=='string'||!d.rights_note.trim())throw new Error('rights_note is required.');
 const assets={};for(const speed of ['normal','slow']){
  const input=path.resolve(path.dirname(path.resolve(file)),d[speed+'_file']);if(!fs.statSync(input).isFile()||!['.mp3','.wav','.ogg','.m4a'].includes(path.extname(input).toLowerCase()))throw new Error('Input must be an existing MP3/WAV/OGG/M4A file.');
  const bytes=fs.readFileSync(input);if(bytes.length<512)throw new Error('Audio file is too small.');const digest=sha(bytes),relative='audio/files/'+track.id+'--'+digest.slice(0,12)+'--'+speed+path.extname(input).toLowerCase();assets[speed]={bytes,digest,relative};
 }
 const metadata={...track,status:'generated',file:path.relative(root,path.join(cfg.contentDir,assets.normal.relative)).split(path.sep).join('/'),slow_file:path.relative(root,path.join(cfg.contentDir,assets.slow.relative)).split(path.sep).join('/'),duration_seconds:Number(d.duration_seconds),slow_duration_seconds:Number(d.slow_duration_seconds),cues:d.cues,engine:'imported recording',voice:d.voice_label,rights_note:d.rights_note,quality_status:'imported_requires_decode_and_listening_review',model_sha256:'external-recording',files_sha256:{normal:assets.normal.digest,slow:assets.slow.digest}};
 if(!process.argv.includes('--dry-run')){fs.mkdirSync(path.join(audio,'files'),{recursive:true});fs.mkdirSync(path.join(audio,'track-metadata'),{recursive:true});for(const a of Object.values(assets))fs.writeFileSync(path.join(cfg.contentDir,a.relative),a.bytes,{flag:fs.existsSync(path.join(cfg.contentDir,a.relative))?'w':'wx'});fs.writeFileSync(path.join(audio,'track-metadata',track.id+'.json'),JSON.stringify(metadata,null,2));}
 console.log(JSON.stringify({valid:true,dry_run:process.argv.includes('--dry-run'),track_id:track.id,next:'Finalize audio, decode/listen to it, then publish the new lesson version. This command does not claim linguistic quality.'},null,2));
}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
