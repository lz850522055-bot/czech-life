import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export const token = (n=32) => randomBytes(n).toString('base64url');
export const now = () => new Date().toISOString();
export function fail(status, message, code='REQUEST_ERROR') { const e = new Error(message); e.status=status; e.code=code; throw e; }
export function safeEqual(a,b) { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x,y); }
export function assertString(value, name, max=20000, min=1) { if (typeof value !== 'string' || value.length<min || value.length>max) fail(400, `${name} 格式或长度不正确。`); return value; }
export function validId(value) { return typeof value==='string' && /^[A-Za-z0-9_-]{1,120}$/.test(value); }
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
}
export function normalizeAnswer(s) { return String(s).normalize('NFC').trim().toLocaleLowerCase('cs').replace(/\s+/g,' ').replace(/[.!?]+$/u,''); }
