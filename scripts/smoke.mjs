import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {createApplication} from '../app/server/main.mjs';
import {PROJECT_ROOT} from '../app/server/config.mjs';
const parent=path.join(PROJECT_ROOT,'runtime/smoke');fs.mkdirSync(parent,{recursive:true});
const root=fs.mkdtempSync(path.join(parent,'run-'));
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const app=createApplication({root,contentDir:path.join(PROJECT_ROOT,'content'),port,publicOrigin:'',ai:{enabled:false}});
try{
 await app.listen();const base='http://127.0.0.1:'+port;
 const health=await fetch(base+'/api/v1/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 const setup=await fetch(base+'/api/v1/auth/setup',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({setup_token:fs.readFileSync(app.setupFile,'utf8').trim(),username:'Explorer',password:randomBytes(16).toString('hex')})});
 assert.equal(setup.status,201);const user=await setup.json();assert.equal(user.user.username,'Explorer');
 const cookie=setup.headers.get('set-cookie').split(';')[0];
 const status=await fetch(base+'/api/v1/auth/status',{headers:{cookie}});assert.equal((await status.json()).user.username,'Explorer');
 for(const route of ['/','/game/','/game/game.js','/game/world-stream.js','/api/v1/curriculum']){
  const r=await fetch(base+route,{headers:{cookie}});assert.equal(r.status,200,route);
 }
 const audio=JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT,'app/public/game/audio/simulation-v1/manifest.json'))).items[0];
 const file=Object.values(audio.files)[0];
 if(file?.url){const r=await fetch(base+file.url,{headers:{cookie,range:'bytes=0-31'}});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,32);}
 console.log('PASS: isolated first-run setup, authenticated session, course/game routes and audio range.');
}finally{await app.close();fs.rmSync(root,{recursive:true});}
