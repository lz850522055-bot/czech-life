import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'app/public/game'),[shell,world]=process.argv.slice(2);if(!/^\d+$/.test(shell)||!/^\d+$/.test(world))throw new Error('Usage: node scripts/version-game-shell.mjs <shell> <world>');
const core=fs.readFileSync(path.join(dir,'core.js'),'utf8'),version=core.match(/GAME_VERSION='([\d.]+)'/)?.[1];if(!version)throw Error('Missing game rules version');const rules=version+'-'+createHash('sha256').update(core).digest('hex').slice(0,10);
for(const name of ['index.html','game.js','world.js','world-gpu.js','sw.js']){const f=path.join(dir,name);let s=fs.readFileSync(f,'utf8');s=s.replace(/game\.js\?v=\d+/g,'game.js?v='+shell).replace(/czlife-shell-v\d+/g,'czlife-shell-v'+shell).replace(/world\.js\?stream=\d+/g,'world.js?stream='+world).replace(/world-gpu\.js\?v=\d+/g,'world-gpu.js?v='+world).replace(/world-stream\.js\?v=\d+/g,'world-stream.js?v='+world);
  if(name==='game.js')s=s.replace(/from '\.\/core\.js(?:\?rules=[a-zA-Z0-9.-]+)?'/g,"from './core.js?rules="+rules+"'");
  s=s.replace(/native-guide-data\.v1\.js\?catalog=[\d.]+/g,'native-guide-data.v1.js?catalog='+version);
  if(name==='sw.js'){if(s.includes('core.js?rules='))s=s.replace(/core\.js\?rules=[a-zA-Z0-9.-]+/g,'core.js?rules='+rules);else s=s.replace("self.addEventListener('install'","FILES.push('/game/core.js?rules="+rules+"');\nself.addEventListener('install'");}
  if(name==='sw.js'){
    const v4=path.join(root,'content/game/field-audio.v4.json'),manifest=fs.existsSync(v4)?v4:path.join(root,'content/game/field-audio.v3.json');
    if(fs.existsSync(v4))s=s.replace(/\/\* pattern-media-v1:start \*\/[\s\S]*?\/\* pattern-media-v1:end \*\/\n?/, '');
    if(fs.existsSync(manifest)){const items=JSON.parse(fs.readFileSync(manifest,'utf8')).items,urls=items.flatMap(a=>['normal','slow'].map(speed=>'/game/audio/field-v1/'+a.id+'-'+speed+'.mp3')),block='/* field-media-v1:start */\nFILES.push(...'+JSON.stringify(urls)+');\n/* field-media-v1:end */\n';s=s.includes('/* field-media-v1:start */')?s.replace(/\/\* field-media-v1:start \*\/[\s\S]*?\/\* field-media-v1:end \*\/\n?/,block):s.replace("self.addEventListener('install'",block+"self.addEventListener('install'");}
  }
  fs.writeFileSync(f,s);}
console.log(JSON.stringify({shell,world,rules,scope:'game-owned static cache only; no user data'}));
