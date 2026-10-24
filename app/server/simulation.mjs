import {SIM_SPEC,SIM_VERSION,initialSimulation,stepSimulation,offers,balances} from '../public/game/simulation-rules.js';
import {canonical,hash,fail,validId,now} from './util.mjs';
import {transaction} from './db.mjs';

export function installSimulation(db){
  db.exec(`CREATE TABLE IF NOT EXISTS game_sim_versions(version TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS game_sim_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL REFERENCES users(id),event_id TEXT NOT NULL,device_id TEXT NOT NULL,version TEXT NOT NULL REFERENCES game_sim_versions(version),base_revision INTEGER NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,state_after TEXT NOT NULL,received_at TEXT NOT NULL,UNIQUE(user_id,event_id));
    CREATE INDEX IF NOT EXISTS game_sim_user_seq ON game_sim_events(user_id,seq);`);
  const spec=canonical(SIM_SPEC),digest=hash(spec),old=db.prepare('SELECT sha256 FROM game_sim_versions WHERE version=?').get(SIM_VERSION);
  if(old&&old.sha256!==digest)throw new Error('经营剧情版本内容已改变，请提升版本后导入。');
  db.prepare('INSERT OR IGNORE INTO game_sim_versions VALUES (?,?,?)').run(SIM_VERSION,digest,spec);
  const current=user=>{const row=db.prepare('SELECT state_after FROM game_sim_events WHERE user_id=? ORDER BY seq DESC LIMIT 1').get(user);return row?JSON.parse(row.state_after):initialSimulation();};
  const state=user=>{const s=current(user);return {version:SIM_VERSION,state:s,offers:offers(s),balances:balances(s),server_time:now()};};
  function accept(user,input){
    if(!input||!validId(input.event_id)||input.event_id.length<8||!validId(input.device_id)||!Number.isInteger(input.base_revision)||input.base_revision<0)fail(400,'经营动作标识或账本版本无效。');
    if(input.version!==SIM_VERSION)fail(409,'经营剧情版本已改变，请先同步。','SIM_VERSION');
    const stamp=Date.parse(input.occurred_at);if(!Number.isFinite(stamp)||stamp<Date.UTC(2000,0,1)||stamp>Date.now()+300000)fail(400,'经营动作时间无效。');
    if(typeof input.action?.kind!=='string'||JSON.stringify(input.action).length>12000)fail(400,'经营动作无效或过长。');
    for(const [field,max]of Object.entries({kind:40,target:120,answer:80,text:5000,name:40,rating:30})){const value=input.action[field];if(value!=null&&(typeof value!=='string'||value.length>max))fail(400,'经营动作字段无效。');}
    const action={kind:input.action.kind,target:input.action.target??null,answer:input.action.answer??null,text:input.action.text??null,name:input.action.name??null,assisted:!!input.action.assisted,...(input.action.kind==='review'?{rating:input.action.rating}:{} )};
    if(action.kind==='review'){const work=db.prepare("SELECT state_after FROM game_sim_events WHERE user_id=? AND event_id=? AND json_extract(payload,'$.action.kind')='open'").get(user,action.target);if(!work)fail(400,'只能自查自己的已保存经营作品。');action.work_epoch=JSON.parse(work.state_after).epoch;}
    const event={event_id:input.event_id,device_id:input.device_id,version:input.version,base_revision:input.base_revision,action,occurred_at:new Date(stamp).toISOString()},raw=canonical(event),payloadHash=hash(raw);
    return transaction(db,()=>{
      const duplicate=db.prepare('SELECT seq,payload_hash,result FROM game_sim_events WHERE user_id=? AND event_id=?').get(user,event.event_id);
      if(duplicate){if(duplicate.payload_hash!==payloadHash)fail(409,'同一经营动作ID内容不同，原记录保留。','SIM_ID_CONFLICT');return {ok:true,duplicate:true,seq:duplicate.seq,result:JSON.parse(duplicate.result),...state(user)};}
      const before=current(user);if(before.revision!==event.base_revision)fail(409,'另一设备或先前动作已经更新账本；原操作保留，先看新账本再确认。','SIM_STALE');
      let next;try{next=stepSimulation(before,action);}catch(error){fail(400,error.message,'SIM_RULE');}
      const received=now(),result={feedback:next.feedback,changes:next.changes},inserted=db.prepare('INSERT INTO game_sim_events(user_id,event_id,device_id,version,base_revision,payload_hash,payload,result,state_after,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(user,event.event_id,event.device_id,event.version,event.base_revision,payloadHash,raw,JSON.stringify(result),JSON.stringify(next.state),received);
      return {ok:true,duplicate:false,seq:Number(inserted.lastInsertRowid),result,...state(user)};
    });
  }
  function ledger(user,{before=Number.MAX_SAFE_INTEGER,limit=30}={}){
    if(!Number.isSafeInteger(before)||before<1||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'经营记录分页无效。');
    const rows=db.prepare('SELECT seq,payload,result,received_at FROM game_sim_events WHERE user_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(user,before,limit+1),more=rows.length>limit,selected=rows.slice(0,limit);
    return {items:selected.map(r=>({seq:r.seq,...JSON.parse(r.payload),result:JSON.parse(r.result),received_at:r.received_at})),next_cursor:more?selected.at(-1).seq:null};
  }
  function works(user,{before=Number.MAX_SAFE_INTEGER,limit=30}={}){
    if(!Number.isSafeInteger(before)||before<1||!Number.isInteger(limit)||limit<1||limit>100)fail(400,'经营作品分页无效。');
    const reviews=new Map();for(const r of db.prepare("SELECT payload FROM game_sim_events WHERE user_id=? AND json_extract(payload,'$.action.kind')='review' ORDER BY seq").all(user)){const a=JSON.parse(r.payload).action;reviews.set(a.target,a.rating);}
    const rows=db.prepare("SELECT seq,payload,state_after,received_at FROM game_sim_events WHERE user_id=? AND seq<? AND json_extract(payload,'$.action.kind')='open' ORDER BY seq DESC LIMIT ?").all(user,before,limit+1),selected=rows.slice(0,limit);
    return {items:selected.map(r=>{const e=JSON.parse(r.payload);return {seq:r.seq,event_id:e.event_id,title:'经营作品 · '+e.action.name,source:'business',answer:{text:e.action.text},at:r.received_at,self_review:reviews.get(e.event_id)||null,epoch:JSON.parse(r.state_after).epoch};}),next_cursor:rows.length>limit?selected.at(-1).seq:null};
  }
  return {state,accept,ledger,works,export(user){return {schema:'czlife-simulation-export-v1',...state(user),events:db.prepare('SELECT seq,payload,result,received_at FROM game_sim_events WHERE user_id=? ORDER BY seq').all(user).map(r=>({seq:r.seq,...JSON.parse(r.payload),result:JSON.parse(r.result),received_at:r.received_at}))};}};
}
