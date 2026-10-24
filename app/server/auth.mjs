import { scrypt as rawScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { hash, token, safeEqual, fail, now, assertString } from './util.mjs';
const scrypt=promisify(rawScrypt);
export const COOKIE='czstudy_session_v1';
export async function passwordHash(password) {
  assertString(password, '密码', 256, 12);
  const salt=token(16);
  const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
export async function passwordMatches(password, encoded) {
  if (typeof password!=='string' || password.length>256) return false;
  const [algorithm,n,r,p,salt,expected]=encoded.split('$');
  if(algorithm!=='scrypt') return false;
  const key=await scrypt(password,salt,64,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024});
  return safeEqual(key.toString('hex'),expected);
}
export function issueSession(db,userId,cfg) {
  const raw=token(), csrf=token();
  const expires=new Date(Date.now()+cfg.sessionDays*86400000).toISOString();
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?)').run(hash(raw),userId,csrf,now(),expires);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  return {raw,csrf,expires};
}
export function readSession(db,req) {
  const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!raw || raw.length>200) return null;
  return db.prepare('SELECT s.*,u.username,u.settings FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hash(raw),now())||null;
}
export function requireSession(db,req,write=false) {
  const session=readSession(db,req);
  if(!session) fail(401,'请先登录；离线待同步记录仍保留在本设备。','AUTH_REQUIRED');
  if(write && !safeEqual(req.headers['x-csrf-token']||'',session.csrf)) fail(403,'会话校验失败，请重新登录。','CSRF');
  return session;
}
export function cookieHeader(raw,cfg,req,expired=false) {
  const secure=Boolean(cfg.publicOrigin && req.headers.host===new URL(cfg.publicOrigin).host);
  return `${COOKIE}=${expired?'':raw}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expired?0:cfg.sessionDays*86400}${secure?'; Secure':''}`;
}
export function publicUser(session) { return {id:session.user_id,username:session.username,settings:JSON.parse(session.settings||'{}')}; }
