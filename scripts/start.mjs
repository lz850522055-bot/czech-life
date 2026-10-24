import fs from 'node:fs';
import {createApplication} from '../app/server/main.mjs';
if(Number(process.versions.node.split('.')[0])<24)throw Error('Node.js 24+ required');
if(!fs.existsSync(new URL('../app/public/game/scenes/mostecka-street-v1.png',import.meta.url)))throw Error('Missing runtime assets. Run npm run assets:fetch first.');
const app=createApplication({port:Number(process.env.CZ_PORT||8766)});
try{await app.listen();}catch(e){app.db.close();console.error(e.code==='EADDRINUSE'?'Port busy. Set CZ_PORT to another free port.':e);process.exit(1);}
console.log('Czech Life: http://127.0.0.1:'+app.cfg.port+'/');
console.log('First district: http://127.0.0.1:'+app.cfg.port+'/game/?district=small-town');
if(fs.existsSync(app.setupFile))console.log('First-run setup token:',fs.readFileSync(app.setupFile,'utf8').trim());
let closing=false;
async function close(){if(closing)return;closing=true;await app.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);app.server.on('requested-stop',close);
