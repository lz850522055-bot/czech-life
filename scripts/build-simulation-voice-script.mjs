import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {initialSimulation,offers,simulationTask,SIM_SPEC,SIM_VERSION} from '../app/public/game/simulation-rules.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),lines=new Map();
function add(s,action){const q=simulationTask(s,action);if(q?.cs)lines.set(q.cs,{id:createHash('sha256').update(q.cs).digest('hex').slice(0,20),text:q.cs,zh:q.zh});}
for(let round=1;round<=3;round++){const s=initialSimulation();s.round=round;for(const o of offers(s)){s.orders[o.id]={...o,status:'accepted'};for(const kind of ['accept','procure','deliver','collect'])add(s,{kind,target:o.id});}}
const s=initialSimulation();for(const target of Object.keys(SIM_SPEC.sites))add(s,{kind:'site',target});
for(const target of Object.keys(SIM_SPEC.plans)){s.building={plan:target,stage:'planned'};for(const kind of ['plan','materials','foundation','walls','open'])add(s,{kind,target});}
const dir=path.join(root,'runtime/game-implementation-20261024/simulation-voice');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'script.json'),JSON.stringify({version:SIM_VERSION,lines:[...lines.values()]},null,2));console.log(JSON.stringify({lines:lines.size,output:dir}));
