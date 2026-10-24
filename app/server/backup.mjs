import fs from 'node:fs';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { canonical, hash, now } from './util.mjs';

function safeChild(base,relative) {
  if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes('\\')||relative.split('/').includes('..')) throw new Error('备份清单含不安全路径');
  const result=path.resolve(base,relative);
  if(!result.startsWith(path.resolve(base)+path.sep)) throw new Error('备份路径越界');
  return result;
}
function copyChecked(from,to) {
  const stat=fs.lstatSync(from);
  if(!stat.isFile()||stat.isSymbolicLink()) throw new Error(`资源不是普通文件: ${path.basename(from)}`);
  fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);
}
export function treeManifest(dir) {
  const entries=[];
  function visit(base) {
    for(const e of fs.readdirSync(base,{withFileTypes:true})) {
      const f=path.join(base,e.name);
      if(e.isDirectory()) visit(f);
      else if(e.isFile()&&e.name!=='backup-manifest.json') {const bytes=fs.readFileSync(f);entries.push({path:path.relative(dir,f).split(path.sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});}
      else if(e.isSymbolicLink()) throw new Error('备份内禁止符号链接');
    }
  }
  visit(dir);return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function createBackup(db,cfg) {
  const id=`backup-${now().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}`;
  const dir=path.join(cfg.backupDir,id);fs.mkdirSync(dir,{recursive:false,mode:0o700});
  const snapshotFile=path.join(dir,'data/czech-study.sqlite');fs.mkdirSync(path.dirname(snapshotFile));
  await backup(db,snapshotFile); // SQLite online backup, never copy a live database file.
  const snapshot=new DatabaseSync(snapshotFile);
  try {
    // Restored copies must require login; users/passwords/recovery survive, live sessions do not.
    snapshot.exec('DELETE FROM sessions; PRAGMA journal_mode=DELETE;');
    if(snapshot.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('SQLite 备份完整性失败');
    fs.mkdirSync(path.join(dir,'uploads'),{recursive:true});
    for(const r of snapshot.prepare('SELECT relative_path,sha256 FROM recordings').all()) {
      const source=safeChild(cfg.uploadsDir,r.relative_path);
      if(hash(fs.readFileSync(source))!==r.sha256) throw new Error('录音校验失败');
      copyChecked(source,safeChild(path.join(dir,'uploads'),r.relative_path));
    }
    const contentRoot=path.join(dir,'content');fs.mkdirSync(contentRoot,{recursive:true});
    // Persist all content versions, including replaced versions referenced by old answers.
    for(const row of snapshot.prepare('SELECT id,version,kind,level,active,payload FROM lessons').all()) {
      const folder=row.active?(row.kind==='lesson'?`lessons/${row.level}`:'assessments'):'archive';
      const file=safeChild(contentRoot,`${folder}/${row.id}${row.active?'':'--'+row.version}.json`);
      fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,row.payload);
    }
    copyChecked(path.join(cfg.contentDir,'units.json'),path.join(contentRoot,'units.json'));
    const hasGame=snapshot.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_catalogs'").get();
    if(hasGame&&snapshot.prepare('SELECT COUNT(*) n FROM game_catalogs').get().n){
      const gameFile=path.join(cfg.contentDir,'game/catalog.json');
      if(!fs.existsSync(gameFile))throw new Error('游戏教材目录缺失，不能生成不可恢复的备份');
      const game=JSON.parse(fs.readFileSync(gameFile,'utf8')),row=snapshot.prepare('SELECT sha256 FROM game_catalogs WHERE version=?').get(game.version);
      if(!row||hash(canonical(game))!==row.sha256)throw new Error('当前游戏教材与数据库版本不一致');
      copyChecked(gameFile,path.join(contentRoot,'game/catalog.json'));
    }
    const authenticFile=path.join(cfg.contentDir,'authentic/manifest.json');
    if(fs.existsSync(authenticFile)) {
      const index=JSON.parse(fs.readFileSync(authenticFile,'utf8'));
      copyChecked(authenticFile,path.join(contentRoot,'authentic/manifest.json'));
      for(const clip of index.clips||[]) {
        const relative='authentic/'+clip.media.file;
        const source=safeChild(cfg.contentDir,relative);
        if(hash(fs.readFileSync(source))!==clip.media.sha256)throw new Error('真人录音摘要不一致');
        copyChecked(source,safeChild(contentRoot,relative));
      }
      for(const name of ['LICENSE.txt','SOURCE_FILES.json']) {
        const file=path.join(cfg.contentDir,'authentic',name);
        if(fs.existsSync(file))copyChecked(file,path.join(contentRoot,'authentic',name));
      }
    }
    if(fs.existsSync(path.join(cfg.contentDir,'scenarios.json')))copyChecked(path.join(cfg.contentDir,'scenarios.json'),path.join(contentRoot,'scenarios.json'));
    const audioManifestFile=path.join(cfg.contentDir,'audio/manifest.json');
    if(fs.existsSync(audioManifestFile)) {
      copyChecked(audioManifestFile,path.join(contentRoot,'audio/manifest.json'));
      const entries=JSON.parse(fs.readFileSync(audioManifestFile,'utf8'));
      for(const row of snapshot.prepare('SELECT payload FROM lessons').all())entries.push(...(JSON.parse(row.payload).audio_refs||[]));
      for(const relative of new Set(entries.filter(m=>m.status==='generated').flatMap(m=>[m.file,m.slow_file]).filter(Boolean)))copyChecked(safeChild(cfg.contentDir,relative),safeChild(contentRoot,relative));
    }
  } finally {snapshot.close();}
  const manifest={format:1,id,created_at:now(),sqlite_method:'node:sqlite backup()',sessions_removed:true,files:treeManifest(dir)};
  fs.writeFileSync(path.join(dir,'backup-manifest.json'),JSON.stringify(manifest,null,2));
  return {id,path:dir,file_count:manifest.files.length,created_at:manifest.created_at};
}
export function verifyBackup(dir) {
  const root=path.resolve(dir),manifest=JSON.parse(fs.readFileSync(path.join(root,'backup-manifest.json'),'utf8'));
  if(manifest.format!==1||!Array.isArray(manifest.files)) throw new Error('不支持的备份格式');
  const seen=new Set();
  for(const entry of manifest.files) {
    if(seen.has(entry.path)) throw new Error('重复备份路径');seen.add(entry.path);
    const file=safeChild(root,entry.path),stat=fs.lstatSync(file);
    if(stat.isSymbolicLink()||!stat.isFile()) throw new Error('非法备份文件');
    const bytes=fs.readFileSync(file);
    if(bytes.length!==entry.bytes||hash(bytes)!==entry.sha256) throw new Error(`备份哈希不符: ${entry.path}`);
  }
  if(!seen.has('data/czech-study.sqlite')||!seen.has('content/units.json')) throw new Error('备份缺数据库或内容');
  const db=new DatabaseSync(path.join(root,'data/czech-study.sqlite'),{readOnly:true});
  try {
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('数据库完整性检查失败');
    if(db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('数据库外键检查失败');
    const hasGame=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game_catalogs'").get();
    const gameVersions=hasGame?db.prepare('SELECT version,sha256,payload FROM game_catalogs').all():[];
    if(gameVersions.length){
      if(!seen.has('content/game/catalog.json'))throw new Error('备份缺少可启用的游戏教材目录');
      const game=JSON.parse(fs.readFileSync(path.join(root,'content/game/catalog.json'),'utf8'));
      if(!gameVersions.some(r=>r.version===game.version&&r.sha256===hash(canonical(game))))throw new Error('备份游戏教材与数据库不一致');
      for(const row of gameVersions)if(hash(canonical(JSON.parse(row.payload)))!==row.sha256)throw new Error('备份历史游戏教材摘要不一致');
    }
    for(const r of db.prepare('SELECT relative_path,sha256 FROM recordings').all()) {
      if(!seen.has('uploads/'+r.relative_path)||hash(fs.readFileSync(safeChild(root,'uploads/'+r.relative_path)))!==r.sha256) throw new Error('备份缺少关联录音');
    }
    return {ok:true,files:manifest.files.length,users:db.prepare('SELECT COUNT(*) n FROM users').get().n,events:db.prepare('SELECT COUNT(*) n FROM attempt_events').get().n,recordings:db.prepare('SELECT COUNT(*) n FROM recordings').get().n,versions:db.prepare('SELECT COUNT(*) n FROM content_versions').get().n};
  }finally{db.close();}
}
export function restoreBackup(source,destination) {
  const verified=verifyBackup(source), dest=path.resolve(destination);
  if(fs.existsSync(dest)&&fs.readdirSync(dest).length) throw new Error('恢复目标必须是不存在或空的独立目录；不覆盖现有数据。');
  fs.mkdirSync(dest,{recursive:true,mode:0o700});
  const manifest=JSON.parse(fs.readFileSync(path.join(source,'backup-manifest.json'),'utf8'));
  for(const entry of manifest.files) copyChecked(safeChild(source,entry.path),safeChild(dest,entry.path));
  fs.copyFileSync(path.join(source,'backup-manifest.json'),path.join(dest,'backup-manifest.json'));
  const after=verifyBackup(dest);
  return {...after,destination:dest,source_verified:verified.ok};
}
