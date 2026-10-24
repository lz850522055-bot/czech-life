import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PROJECT_ROOT } from './config.mjs';

export function openDatabase(file) {
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  const migration = fs.readFileSync(path.join(PROJECT_ROOT, 'app/migrations/001.sql'), 'utf8');
  db.exec(migration);
  db.prepare('INSERT OR IGNORE INTO schema_migrations VALUES (?,?)').run(1, new Date().toISOString());
  for (const [id, label] of Object.entries({listening:'听懂',speaking:'开口表达',reading:'阅读理解',writing:'写作',interaction:'互动',mediation:'转述与解释'})) db.prepare('INSERT OR IGNORE INTO skills VALUES (?,?)').run(id, label);
  return db;
}
export function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
