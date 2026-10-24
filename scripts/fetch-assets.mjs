import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/runtime-assets-manifest.json')));
const allowed=new Set(manifest.files.map(f=>f.path));
function safe(p){return typeof p==='string'&&!p.includes('\\')&&!p.startsWith('/')&&!p.includes(':')&&!p.split('/').includes('..')&&/^(app\/public\/|content\/)/.test(p);}
if([...allowed].some(p=>!safe(p)))throw Error('Unsafe manifest path');
async function hashFile(file){const h=createHash('sha256');for await(const c of fs.createReadStream(file))h.update(c);return h.digest('hex');}
async function verify(){let missing=0,bad=0;for(const row of manifest.files){const file=path.join(root,row.path);if(!fs.existsSync(file)){missing++;continue;}if(fs.statSync(file).size!==row.bytes||await hashFile(file)!==row.sha256){bad++;console.error('Mismatch:',row.path);}}return {files:manifest.files.length,missing,bad};}
if(process.argv.includes('--verify')){const r=await verify();console.log(r);if(r.missing||r.bad)process.exitCode=1;}
else{
 const flag=process.argv.indexOf('--archive'),local=flag>=0?process.argv[flag+1]:null;
 if(flag>=0&&!local)throw Error('--archive requires a path');
 if(!local){const r=await verify();if(!r.missing&&!r.bad){console.log('All runtime assets already verified.');process.exit(0);}}
 const archive=local?path.resolve(local):path.join(root,'cache/downloads',manifest.file);
 fs.mkdirSync(path.dirname(archive),{recursive:true});
 if(!local&&(!fs.existsSync(archive)||fs.statSync(archive).size!==manifest.bytes)){
  const url='https://github.com/lz850522055-bot/czech-life/releases/download/v0.1.0-alpha/'+manifest.file;
  console.log('Downloading',url,'('+manifest.bytes+' bytes)');
  const res=await fetch(url);if(!res.ok)throw Error('Download failed: HTTP '+res.status);
  let bytes=0,last=0;const meter=new Transform({transform(c,e,cb){bytes+=c.length;if(bytes-last>50000000){console.log(Math.round(bytes/manifest.bytes*100)+'%');last=bytes;}cb(null,c);}});
  await pipeline(Readable.fromWeb(res.body),meter,fs.createWriteStream(archive+'.part'));
  if(bytes!==manifest.bytes)throw Error('Incomplete download');
  fs.renameSync(archive+'.part',archive);
 }
 if(await hashFile(archive)!==manifest.sha256)throw Error('Archive SHA-256 mismatch; nothing extracted');
 const listed=spawnSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:8*1024*1024});
 if(listed.status!==0)throw Error('tar unavailable or archive invalid: '+listed.stderr);
 const names=listed.stdout.split(/\r?\n/).filter(Boolean);
 if(names.length!==allowed.size||new Set(names).size!==names.length||names.some(n=>!safe(n)||!allowed.has(n)))throw Error('Archive contains unexpected paths');
 const detailed=spawnSync('tar',['-tvzf',archive],{encoding:'utf8',maxBuffer:16*1024*1024});
 if(detailed.status!==0||detailed.stdout.split(/\r?\n/).filter(Boolean).some(l=>!l.startsWith('-')))throw Error('Only regular files may be extracted');
 for(const n of names){let parent=path.dirname(path.join(root,n));while(parent!==root){if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('Refusing symlink destination '+parent);parent=path.dirname(parent);}const dest=path.join(root,n);if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('Refusing symlink '+dest);}
 const extracted=spawnSync('tar',['-xzf',archive,'-C',root],{stdio:'inherit'});if(extracted.status!==0)throw Error('Extraction failed');
 const r=await verify();console.log(r);if(r.missing||r.bad)throw Error('Installed asset verification failed');console.log('Assets ready. Run npm start.');
}
