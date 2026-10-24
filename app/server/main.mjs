import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {brotliCompressSync,gzipSync,constants as zlibConstants} from 'node:zlib';
import { loadConfig,createDirectories } from './config.mjs';
import { openDatabase,transaction } from './db.mjs';
import { loadContent,curriculum,getItem,importItem,validateItem,contentReport } from './content.mjs';
import { passwordHash,passwordMatches,issueSession,readSession,requireSession,cookieHeader,publicUser } from './auth.mjs';
import { acceptEvent,progress,rebuildReview } from './events.mjs';
import { createBackup,verifyBackup } from './backup.mjs';
import { aiStatus,aiFeedback } from './ai.mjs';
import {authenticIndex,authenticMedia} from './authentic.mjs';
import {installGame} from './game.mjs';
import {installSimulation} from './simulation.mjs';
import { fail,hash,token,now,assertString,validId,safeEqual } from './util.mjs';

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.webm':'audio/webm','.m4a':'audio/mp4'};
const WRITE=new Set(['POST','PUT','PATCH','DELETE']);
function send(res,status,data,headers={}) {
  const raw=Buffer.from(JSON.stringify(data));
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':raw.length,...headers});res.end(raw);
}
async function readBody(req,max=2*1024*1024,json=true) {
  if(Number(req.headers['content-length']||0)>max) fail(413,'提交内容超过大小限制。');
  if(json&&!(req.headers['content-type']||'').startsWith('application/json')) fail(415,'请求须使用 JSON。');
  let size=0;const chunks=[];
  for await (const chunk of req) {size+=chunk.length;if(size>max)fail(413,'提交内容超过大小限制。');chunks.push(chunk);}
  const data=Buffer.concat(chunks);
  if(!json) return data;
  try {const result=JSON.parse(data.toString('utf8'));if(!result||typeof result!=='object')fail(400,'JSON 对象无效。');return result;}
  catch(e){if(e.status)throw e;fail(400,'JSON 无法解析。');}
}
function fileResponse(req,res,file,type,cache='no-store') {
  const stat=fs.statSync(file);let start=0,end=stat.size-1,status=200;
  if(req.headers.range) {
    const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!m) {res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
    start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;
    if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();} status=206;
  }
  res.writeHead(status,{'Content-Type':type,'Content-Length':end-start+1,'Cache-Control':cache,'Accept-Ranges':'bytes',...(status===206?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{})});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
}
export function createApplication(overrides={}) {
  const cfg=loadConfig(overrides);createDirectories(cfg);
  const db=openDatabase(cfg.dbPath);loadContent(db,cfg);const game=installGame(db,cfg),simulation=installSimulation(db);
  const learningRaw=game?Buffer.from(JSON.stringify(game.learningPaths())):null;
  const learningWire=learningRaw?{identity:learningRaw,gzip:gzipSync(learningRaw,{level:6}),br:brotliCompressSync(learningRaw,{params:{[zlibConstants.BROTLI_PARAM_QUALITY]:4}})}:null;
  const setupFile=path.join(cfg.dataDir,'first-run-token.txt');
  const controlFile=path.join(cfg.cacheDir,'control-token.txt');
  if(!fs.existsSync(controlFile))fs.writeFileSync(controlFile,token(),{mode:0o600});
  if(!db.prepare('SELECT id FROM users LIMIT 1').get()&&!fs.existsSync(setupFile)) fs.writeFileSync(setupFile,token(),{mode:0o600});
  let setupBusy=false,backupBusy=false;
  const rate=new Map();
  function limit(key,max=10,windowMs=900000) {
    const t=Date.now(),entry=rate.get(key)||{n:0,until:t+windowMs};
    if(entry.until<t){entry.n=0;entry.until=t+windowMs;}entry.n++;rate.set(key,entry);
    if(rate.size>5000) for(const [k,v] of rate) if(v.until<t)rate.delete(k);
    if(entry.n>max) fail(429,'尝试过于频繁，请稍后再试。','RATE_LIMIT');
  }
  const allowedOrigins=new Set([`http://127.0.0.1:${cfg.port}`,`http://localhost:${cfg.port}`,`http://[::1]:${cfg.port}`,...(cfg.publicOrigin?[cfg.publicOrigin]:[])]);
  function originCheck(req) {
    const host=req.headers.host||'';
    if(![...allowedOrigins].some(o=>new URL(o).host===host))fail(403,'请求主机未在本项目配置中。','HOST_REJECTED');
    if(WRITE.has(req.method)) {
      if(!req.headers.origin||!allowedOrigins.has(req.headers.origin))fail(403,'请求来源校验失败。','ORIGIN_REJECTED');
      if(new URL(req.headers.origin).host!==host)fail(403,'请求必须来自同源页面。','ORIGIN_REJECTED');
    }
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(self), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      originCheck(req);
      const url=new URL(req.url,`http://${req.headers.host}`),pathname=decodeURIComponent(url.pathname),method=req.method;
      const peer=req.socket.remoteAddress||'local';
      if(pathname==='/__control/stop'&&method==='POST') {
        if(cfg.publicOrigin&&req.headers.host===new URL(cfg.publicOrigin).host)fail(403,'此操作只供本机停止脚本使用。');
        if(!safeEqual(req.headers['x-cz-control']||'',fs.readFileSync(controlFile,'utf8')))fail(403,'本机控制口令无效。');
        send(res,200,{ok:true,app:'czech-study',message:'正在安全停止'});setImmediate(()=>server.emit('requested-stop'));return;
      }
      if(pathname==='/api/v1/health'&&method==='GET')return send(res,200,{ok:true,app:'czech-study',api_version:1,time:now()});
      if(pathname==='/api/v1/auth/status'&&method==='GET')return send(res,200,{initialized:Boolean(db.prepare('SELECT id FROM users LIMIT 1').get()),csrf:readSession(db,req)?.csrf||null,user:readSession(db,req)?publicUser(readSession(db,req)):null});
      if(pathname==='/api/v1/auth/setup'&&method==='POST') {
        limit('setup:'+peer,10);const body=await readBody(req,4096);
        if(setupBusy||db.prepare('SELECT id FROM users LIMIT 1').get())fail(409,'个人账号已初始化，请登录。');
        if(!fs.existsSync(setupFile)||!safeEqual(body.setup_token||'',fs.readFileSync(setupFile,'utf8').trim()))fail(403,'初始化口令不正确。请从本机启动窗口或 data/first-run-token.txt 读取。');
        const username=assertString(body.username,'账号名',60,2).trim();
        if(username.length<2)fail(400,'账号名至少两个字符。');
        setupBusy=true;
        try {
          const encoded=await passwordHash(body.password),id=randomUUID(),recovery=token(24);
          db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,username,encoded,hash(recovery),now(),JSON.stringify({timezone:'Asia/Shanghai',fontSize:17,volume:1,speed:1,reviewScale:1,reminders:false,detail:'normal',interests:[]}));
          fs.unlinkSync(setupFile);const s=issueSession(db,id,cfg);
          return send(res,201,{user:{id,username},csrf:s.csrf,recovery_code:recovery},{'Set-Cookie':cookieHeader(s.raw,cfg,req)});
        } finally {setupBusy=false;}
      }
      if(pathname==='/api/v1/auth/login'&&method==='POST') {
        const body=await readBody(req,4096);limit('login:'+peer+':'+String(body.username||'').slice(0,60),10);limit('login-global:'+peer,40);
        const u=db.prepare('SELECT * FROM users WHERE username=?').get(String(body.username||''));
        const matches=u?await passwordMatches(body.password,u.password_hash):await passwordMatches(String(body.password||''),'scrypt$32768$8$1$not-a-real-salt$'+'0'.repeat(128));
        if(!u||!matches)fail(401,'账号或密码不正确。','LOGIN_FAILED');
        const current=db.prepare('SELECT password_hash FROM users WHERE id=?').get(u.id);
        if(!current||!safeEqual(current.password_hash,u.password_hash))fail(401,'密码已变更，请使用当前密码重新登录。','CREDENTIALS_CHANGED');
        const s=issueSession(db,u.id,cfg);
        return send(res,200,{user:{id:u.id,username:u.username,settings:JSON.parse(u.settings)},csrf:s.csrf},{'Set-Cookie':cookieHeader(s.raw,cfg,req)});
      }
      if(pathname==='/api/v1/auth/recover'&&method==='POST') {
        limit('recover:'+peer,5);const body=await readBody(req,4096);
        const u=db.prepare('SELECT * FROM users WHERE username=?').get(String(body.username||''));
        if(!u||!safeEqual(hash(String(body.recovery_code||'')),u.recovery_hash))fail(403,'账号或恢复码不正确。');
        const encoded=await passwordHash(body.new_password),recovery=token(24);
        transaction(db,()=>{const updated=db.prepare('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(encoded,hash(recovery),u.id,u.recovery_hash);if(Number(updated.changes)!==1)fail(409,'此恢复码已被另一请求使用，请使用最新恢复码。','RECOVERY_CONSUMED');db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);});
        return send(res,200,{ok:true,recovery_code:recovery,message:'密码已重置，旧恢复码和全部旧会话已失效。'},{'Set-Cookie':cookieHeader('',cfg,req,true)});
      }
      if(pathname.startsWith('/api/v1/')) {
        const s=requireSession(db,req,WRITE.has(method)),userId=s.user_id;
        if(req.headers['x-cz-expected-user']&&req.headers['x-cz-expected-user']!==userId)fail(403,'浏览器已切换账号；本机未同步记录仍保留在原账号，请重新登录。','ACCOUNT_CHANGED');
        if(pathname.startsWith('/api/v1/game/')){
          if(!game)fail(503,'游戏内容还未准备好。','GAME_NOT_READY');
          if(pathname==='/api/v1/game/simulation/state'&&method==='GET')return send(res,200,simulation.state(userId));
          if(pathname==='/api/v1/game/simulation/events'&&method==='POST'){const body=await readBody(req,16000);return send(res,200,simulation.accept(userId,body));}
          if(pathname==='/api/v1/game/simulation/ledger'&&method==='GET')return send(res,200,simulation.ledger(userId,{before:Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER),limit:Number(url.searchParams.get('limit')||30)}));
          if(pathname==='/api/v1/game/simulation/works'&&method==='GET')return send(res,200,simulation.works(userId,{before:Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER),limit:Number(url.searchParams.get('limit')||30)}));
          if(pathname==='/api/v1/game/simulation/export'&&method==='GET')return send(res,200,simulation.export(userId),{'Content-Disposition':'attachment; filename="czech-life-business.json"'});
          if(pathname==='/api/v1/game/learning/paths'&&method==='GET'){const accept=req.headers['accept-encoding']||'',encoding=/(?:^|,)\s*br\s*(?:,|$)/.test(accept)?'br':/(?:^|,)\s*gzip\s*(?:,|$)/.test(accept)?'gzip':'identity',body=learningWire[encoding];res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding','Content-Length':body.length,...(encoding!=='identity'?{'Content-Encoding':encoding}:{})});return res.end(body);}
          if(pathname==='/api/v1/game/catalog'&&method==='GET')return send(res,200,game.summary());
          if(pathname==='/api/v1/game/state'&&method==='GET')return send(res,200,game.state(userId));
          if(pathname==='/api/v1/game/works'&&method==='GET')return send(res,200,game.works(userId,{before:Number(url.searchParams.get('before')||Number.MAX_SAFE_INTEGER),limit:Number(url.searchParams.get('limit')||30),attempt_id:url.searchParams.get('attempt_id'),mission_id:url.searchParams.get('mission_id'),task_id:url.searchParams.get('task_id')}));
          if(pathname.startsWith('/api/v1/game/works/')&&method==='GET')return send(res,200,game.work(userId,pathname.slice('/api/v1/game/works/'.length)));
          if(pathname.startsWith('/api/v1/game/missions/')&&method==='GET')return send(res,200,game.mission(pathname.slice('/api/v1/game/missions/'.length)));
          if(pathname==='/api/v1/game/events'&&method==='POST'){
            const body=await readBody(req);if(!Array.isArray(body.events)||body.events.length<1||body.events.length>100)fail(400,'一次提交1–100个游戏动作。');
            const results=body.events.map(e=>{try{return {ok:true,...game.accept(userId,e)};}catch(error){if(!error.status)throw error;return {ok:false,event_id:e?.event_id,status:error.status,error:error.message,code:error.code};}});
            return send(res,200,{results,server_time:now()});
          }
          if(pathname==='/api/v1/game/export'&&method==='GET')return send(res,200,game.export(userId),{'Content-Disposition':'attachment; filename="czech-life-game-export.json"'});
          fail(404,'游戏接口不存在。');
        }
        if(pathname==='/api/v1/authentic'&&method==='GET')return send(res,200,authenticIndex(cfg));
        if(pathname.startsWith('/api/v1/authentic/audio/')&&method==='GET')return fileResponse(req,res,authenticMedia(cfg,pathname.slice('/api/v1/authentic/audio/'.length)),'audio/mpeg','private, max-age=86400');
        if(pathname==='/api/v1/auth/me'&&method==='GET')return send(res,200,{user:publicUser(s),csrf:s.csrf});
        if(pathname==='/api/v1/auth/logout'&&method==='POST') {db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash);return send(res,200,{ok:true},{'Set-Cookie':cookieHeader('',cfg,req,true)});}
        if(pathname==='/api/v1/auth/password'&&method==='POST') {
          limit('password:'+userId,5);const body=await readBody(req,4096),u=db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId);
          if(!await passwordMatches(body.old_password,u.password_hash))fail(403,'原密码不正确。');
          const encoded=await passwordHash(body.new_password);
          transaction(db,()=>{if(!readSession(db,req))fail(401,'会话已变更，请重新登录。');const updated=db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?').run(encoded,userId,u.password_hash);if(Number(updated.changes)!==1)fail(409,'密码已被另一请求修改，请重新登录。','CREDENTIALS_CHANGED');db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);});
          return send(res,200,{ok:true,message:'密码已修改，请重新登录所有设备。'},{'Set-Cookie':cookieHeader('',cfg,req,true)});
        }
        if(pathname==='/api/v1/curriculum'&&method==='GET')return send(res,200,curriculum(db));
        if((pathname==='/api/v1/scenarios'||pathname.startsWith('/api/v1/scenarios/'))&&method==='GET'){
          const file=path.join(cfg.contentDir,'scenarios.json'),scenes=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
          if(pathname==='/api/v1/scenarios')return send(res,200,{items:scenes.map(({id,version,level,lesson_id,title_zh,intro_zh})=>({id,version,level,lesson_id,title_zh,intro_zh}))});
          const scene=scenes.find(x=>x.id===pathname.slice('/api/v1/scenarios/'.length));if(!scene)fail(404,'场景不存在。');
          const lesson=getItem(db,scene.lesson_id);return send(res,200,{...scene,lesson_version:lesson.version,audio_refs:(lesson.audio_refs||[]).filter(a=>a.scenario_id===scene.id&&a.scenario_version===scene.version&&scene.nodes.some(n=>n.id===a.node_id&&n.speaker_cs.normalize('NFC').trim()===a.text))});
        }
        if(pathname==='/api/v1/vocabulary'&&method==='GET') {
          const q=(url.searchParams.get('q')||'').toLocaleLowerCase('cs').slice(0,100),level=url.searchParams.get('level');
          const items=[];
          for(const row of db.prepare("SELECT payload FROM lessons WHERE active=1 AND kind='lesson'").all()) {
            const l=JSON.parse(row.payload);if(level&&l.level!==level)continue;
            for(const [index,v]of (l.vocabulary||[]).entries())if(!q||[v.lemma,v.meaning_zh,v.collocation,v.forms].join(' ').toLocaleLowerCase('cs').includes(q))items.push({...v,lesson_id:l.id,lesson_title:l.title_zh,level:l.level,audio_ref:l.audio_refs?.find(r=>r.role==='vocabulary'&&r.index===index)||null});
          }
          return send(res,200,{items:items.slice(0,100),total:items.length});
        }
        if(pathname.startsWith('/api/v1/lessons/')&&method==='GET')return send(res,200,getItem(db,pathname.slice('/api/v1/lessons/'.length),url.searchParams.get('version')||undefined));
        if(pathname==='/api/v1/progress'&&method==='GET')return send(res,200,progress(db,userId));
        if(pathname==='/api/v1/events'&&method==='POST') {
          const body=await readBody(req);
          if(!Array.isArray(body.events)||body.events.length<1||body.events.length>100)fail(400,'一次需提交1–100个事件。');
          const results=body.events.map(e=>{try{if(e?.kind==='recording')fail(400,'录音事件必须随真实音频上传。','RECORDING_UPLOAD_REQUIRED');return {ok:true,...acceptEvent(db,userId,e)};}catch(error){if(!error.status)throw error;return {ok:false,event_id:e?.event_id,status:error.status,error:error.message,code:error.code};}});
          return send(res,200,{results,server_time:now()});
        }
        if(pathname==='/api/v1/sync'&&method==='GET') {
          const after=Number(url.searchParams.get('after')||0),device=url.searchParams.get('device')||'unknown-device';
          if(!Number.isSafeInteger(after)||after<0||!validId(device))fail(400,'同步游标无效。');
          const events=db.prepare('SELECT seq,event_id,kind,lesson_id,exercise_id,content_version,answer,feedback,occurred_at,received_at,payload FROM attempt_events WHERE user_id=? AND seq>? ORDER BY seq LIMIT 501').all(userId,after);
          const batch=events.slice(0,500),cursor=batch.at(-1)?.seq||after;
          db.prepare('INSERT INTO sync_cursors VALUES (?,?,?,?) ON CONFLICT(user_id,device_id) DO UPDATE SET last_seq=MAX(sync_cursors.last_seq,excluded.last_seq),updated_at=excluded.updated_at').run(userId,device,cursor,now());
          return send(res,200,{events:batch.map(({payload,...e})=>({...e,context:JSON.parse(payload).context,answer:JSON.parse(e.answer),feedback:JSON.parse(e.feedback)})),cursor,has_more:events.length>500,server_time:now()});
        }
        if(pathname==='/api/v1/settings'&&method==='PUT') {
          const body=await readBody(req,8192),settings=JSON.parse(s.settings);
          if(body.timezone!==undefined) {try{new Intl.DateTimeFormat('zh-CN',{timeZone:body.timezone}).format();}catch{fail(400,'时区无效。');}settings.timezone=body.timezone;}
          for(const [key,min,max]of [['fontSize',14,24],['volume',0,1],['speed',0.75,1.1],['reviewScale',0.5,3]])if(body[key]!==undefined){if(typeof body[key]!=='number'||body[key]<min||body[key]>max)fail(400,`${key} 超出允许范围。`);settings[key]=body[key];}
          if(body.interests!==undefined){if(!Array.isArray(body.interests)||body.interests.length>12||body.interests.some(x=>typeof x!=='string'||x.length>40))fail(400,'兴趣场景无效。');settings.interests=body.interests;}
          if(body.reminders!==undefined)settings.reminders=Boolean(body.reminders);
          if(body.detail!==undefined){if(!['brief','normal','detailed'].includes(body.detail))fail(400,'讲解细度无效。');settings.detail=body.detail;}
          if(body.dailyIntention!==undefined){if(typeof body.dailyIntention!=='string'||body.dailyIntention.length>120)fail(400,'学习意愿最多120字，可留空。');settings.dailyIntention=body.dailyIntention.trim();}
          db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify(settings),userId);
          if(body.reviewScale!==undefined)for(const q of db.prepare('SELECT * FROM review_queue WHERE user_id=?').all(userId))rebuildReview(db,userId,q.skill_id,q.knowledge_point,q.lesson_id);
          return send(res,200,{settings});
        }
        if(pathname.startsWith('/api/v1/recordings/')&&method==='PUT') {
          const eventId=pathname.slice('/api/v1/recordings/'.length);
          if(!validId(eventId)||eventId.length<8)fail(400,'录音ID无效。');
          const allowed={'audio/webm':'webm','audio/ogg':'ogg','audio/mp4':'m4a','audio/wav':'wav'};
          const mime=(req.headers['content-type']||'').split(';')[0];if(!allowed[mime])fail(415,'不支持的录音格式。');
          const bytes=await readBody(req,20*1024*1024,false);if(bytes.length<32)fail(400,'录音为空或过短。');
          const magic=bytes.subarray(0,12);
          if((mime==='audio/webm'&&magic.readUInt32BE(0)!==0x1a45dfa3)||(mime==='audio/ogg'&&magic.subarray(0,4).toString()!=='OggS')||(mime==='audio/wav'&&!(magic.subarray(0,4).toString()==='RIFF'&&magic.subarray(8,12).toString()==='WAVE'))||(mime==='audio/mp4'&&magic.subarray(4,8).toString()!=='ftyp'))fail(415,'文件内容与录音格式不符。');
          const digest=hash(bytes),previous=db.prepare('SELECT * FROM recordings WHERE user_id=? AND event_id=?').get(userId,eventId);
          if(previous){if(previous.sha256!==digest||previous.lesson_id!==req.headers['x-lesson-id']||previous.content_version!==req.headers['x-content-version'])fail(409,'相同录音ID内容不同。');return send(res,200,{id:previous.id,duplicate:true});}
          const e={event_id:eventId,device_id:req.headers['x-device-id'],kind:'recording',lesson_id:req.headers['x-lesson-id'],content_version:req.headers['x-content-version'],occurred_at:req.headers['x-occurred-at'],answer:{sha256:digest,mime,bytes:bytes.length}};
          const item=getItem(db,e.lesson_id,e.content_version);void item;
          const id=randomUUID(),relative=`${userId}/${id}.${allowed[mime]}`,file=path.join(cfg.uploadsDir,relative);
          fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
          try {
            // The immutable event can safely survive a crash before metadata; retry reuses its ID.
            const accepted=acceptEvent(db,userId,e);
            db.prepare('INSERT INTO recordings VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,userId,eventId,e.lesson_id,e.content_version,relative,mime,bytes.length,digest,now());
            return send(res,201,{id,duplicate:false,event:accepted});
          }catch(error){fs.unlinkSync(file);throw error;}
        }
        if(pathname.startsWith('/api/v1/recordings/')&&method==='GET') {
          const row=db.prepare('SELECT * FROM recordings WHERE id=? AND user_id=?').get(pathname.split('/').at(-1),userId);if(!row)fail(404,'录音不存在。');
          return fileResponse(req,res,path.join(cfg.uploadsDir,row.relative_path),row.mime);
        }
        if(pathname.startsWith('/api/v1/audio/')&&method==='GET') {
          const f=path.join(cfg.contentDir,'audio/manifest.json'),list=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):[],m=list.find(a=>a.id===pathname.split('/').at(-1));
          if(!m||m.status!=='generated'||!m.file)fail(404,'该音频未生成；请使用已检测到的捷语语音。','AUDIO_MISSING');
          const relative=url.searchParams.get('speed')==='slow'?m.slow_file:m.file;
          if(!relative)fail(404,'该速度的音频未生成。','AUDIO_MISSING');
          const file=path.resolve(cfg.contentDir,relative);if(!file.startsWith(cfg.contentDir+path.sep)||!fs.existsSync(file))fail(404,'音频文件缺失。');
          return fileResponse(req,res,file,MIME[path.extname(file)]||'audio/mpeg','private, max-age=86400');
        }
        if(pathname==='/api/v1/content/report'&&method==='GET')return send(res,200,contentReport(db,cfg));
        if(pathname==='/api/v1/content/import'&&method==='POST') {
          const body=await readBody(req),item=body.item,errors=validateItem(item,{full:true});
          if(errors.length)fail(400,errors.join('；'));
          if(body.dry_run)return send(res,200,{valid:true,id:item.id,version:item.version});
          const result=importItem(db,item);
          const dir=path.join(cfg.contentDir,'updates',item.id);fs.mkdirSync(dir,{recursive:true});
          fs.writeFileSync(path.join(dir,`${item.version}.json`),JSON.stringify(item,null,2));
          return send(res,200,result);
        }
        if(pathname==='/api/v1/export'&&method==='GET') {
          const rows=db.prepare('SELECT event_id,device_id,kind,lesson_id,exercise_id,content_version,skill_ids,answer,feedback,scoring_basis,occurred_at,received_at,payload FROM attempt_events WHERE user_id=? ORDER BY seq').all(userId);
          const versionIds=[...new Set(rows.map(r=>`${r.lesson_id}|${r.content_version}`))];
          const content_versions=versionIds.map(k=>{const[id,v]=k.split('|');return db.prepare('SELECT * FROM content_versions WHERE content_id=? AND version=?').get(id,v);});
          return send(res,200,{schema:'czstudy-export-v1',exported_at:now(),user:publicUser(s),events:rows.map(({payload,...e})=>({...e,context:JSON.parse(payload).context,skill_ids:JSON.parse(e.skill_ids),answer:JSON.parse(e.answer),feedback:JSON.parse(e.feedback)})),content_versions,progress:progress(db,userId),recording_note:'录音二进制见本项目完整备份；此JSON保留录音ID和元数据。'},{'Content-Disposition':'attachment; filename="czech-learning-export.json"'});
        }
        if(pathname==='/api/v1/backups'&&method==='POST') {
          if(backupBusy)fail(409,'已有备份正在进行。');backupBusy=true;
          try{const result=await createBackup(db,cfg),verified=verifyBackup(result.path);return send(res,201,{id:result.id,created_at:result.created_at,files:result.file_count,verified});}finally{backupBusy=false;}
        }
        if(pathname==='/api/v1/ai/status'&&method==='GET')return send(res,200,aiStatus(db,userId,cfg));
        if(pathname==='/api/v1/ai/feedback'&&method==='POST')return send(res,200,await aiFeedback(db,userId,cfg,await readBody(req,20000)));
        fail(404,'接口不存在。');
      }
      if(!['GET','HEAD'].includes(method))fail(405,'不支持的方法。');
      const relative=pathname==='/'?'index.html':['/game','/game/'].includes(pathname)?'game/index.html':pathname.slice(1),file=path.resolve(cfg.publicDir,relative);
      if(!file.startsWith(cfg.publicDir+path.sep)||relative.split('/').some(s=>s.startsWith('.'))||!fs.existsSync(file)||!fs.statSync(file).isFile())fail(404,'页面不存在。');
      if(pathname==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
      if(pathname.startsWith('/game/')&&['.js','.css','.json'].includes(path.extname(file))&&!req.headers.range){
        const accepts=req.headers['accept-encoding']||'';
        const compression=[['br',/(?:^|,)\s*br\s*(?:,|$)/],['gzip',/(?:^|,)\s*gzip\s*(?:,|$)/]].find(([encoding,re])=>re.test(accepts)&&fs.existsSync(file+(encoding==='br'?'.br':'.gz')));
        if(compression){const encoding=compression[0];res.setHeader('Content-Encoding',encoding);res.setHeader('Vary','Accept-Encoding');return fileResponse(req,res,file+(encoding==='br'?'.br':'.gz'),MIME[path.extname(file)],'no-cache');}
      }
      if(pathname.startsWith('/game/regions/prague/')&&['.json','.bin'].includes(path.extname(file))&&fs.existsSync(file+'.gz')&&!req.headers.range&&/(?:^|,)\s*gzip\s*(?:,|$)/.test(req.headers['accept-encoding']||'')){
        res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');
        return fileResponse(req,res,file+'.gz',MIME[path.extname(file)]||'application/octet-stream','public, max-age=31536000, immutable');
      }
      return fileResponse(req,res,file,MIME[path.extname(file)]||'application/octet-stream','no-cache');
    }catch(error){
      if(!error.status)fs.appendFileSync(path.join(cfg.logsDir,'errors.log'),`${now()} ${req.method} ${req.url?.split('?')[0]} ${error.stack}\n`,{mode:0o600});
      if(!res.headersSent)send(res,error.status||500,{error:error.status?error.message:'服务暂时出错，记录已保存到本项目日志。',code:error.code||'INTERNAL_ERROR'});else res.destroy();
    }
  });
  server.requestTimeout=60000;server.headersTimeout=15000;server.maxRequestsPerSocket=100;
  return {cfg,db,server,setupFile,async listen(){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(cfg.port,cfg.host,resolve);});return server.address();},async close(){server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));db.close();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const app=createApplication();
  try{await app.listen();}catch(error){console.error(error.code==='EADDRINUSE'?`端口 ${app.cfg.port} 已被使用；请修改本项目配置，不会停止其他服务。`:error.message);app.db.close();process.exitCode=1;}
  if(app.server.listening){
    console.log(`捷语学习系统 http://127.0.0.1:${app.cfg.port}`);
    if(fs.existsSync(app.setupFile)) console.log(`首次初始化口令（仅本机显示）：${fs.readFileSync(app.setupFile,'utf8').trim()}`);
    fs.writeFileSync(path.join(app.cfg.cacheDir,'server.pid.json'),JSON.stringify({pid:process.pid,started_at:now(),entry:path.resolve(process.argv[1]),port:app.cfg.port,root:app.cfg.root}));
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await app.close();const pid=path.join(app.cfg.cacheDir,'server.pid.json');if(fs.existsSync(pid)&&JSON.parse(fs.readFileSync(pid,'utf8')).pid===process.pid)fs.unlinkSync(pid);process.exit(0);};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);
    app.server.on('requested-stop',stop);
  }
}

