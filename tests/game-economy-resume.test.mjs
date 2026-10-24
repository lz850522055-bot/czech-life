import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {PROJECT_ROOT} from '../app/server/config.mjs';
import {initialSimulation,offers,stepSimulation,simulationTask} from '../app/public/game/simulation-rules.js';import {economyUiSnapshot,restoreEconomyUi,economyHelpKey} from '../app/public/game/economy-resume.js';import {economySceneFor} from '../app/public/game/economy-scene.js';
const accept=s=>({kind:'accept',target:offers(s)[0].id});
test('refresh preserves a helped wrong answer; success receipts restore read-only and do not replay a paid action',()=>{
 let state=initialSimulation(),active=accept(state);const wrong=stepSimulation(state,{...active,answer:'one'});state=wrong.state;
 const saved=economyUiSnapshot(state,{tab:'trade',active,help:true,feedback:wrong.feedback,helpedContexts:[economyHelpKey(state,active)]}),r=restoreEconomyUi(saved,state);assert.deepEqual(r.active,active);assert.equal(r.feedback.status,'retry');assert.equal(r.help,true);assert.equal(state.cash,800000);
 const right=stepSimulation(state,{...active,answer:'quantity',assisted:r.help});assert(right.feedback.assisted);const receipt=economyUiSnapshot(right.state,{active,help:true,feedback:right.feedback});assert.equal(restoreEconomyUi(receipt,right.state).feedback.correct,true);assert.throws(()=>stepSimulation(right.state,{...active,answer:'quantity'}));
});
test('an action advanced by another session, a new period, reset epoch and malformed cache never resume as a stale purchase',()=>{
 let state=initialSimulation(),active=accept(state),saved=economyUiSnapshot(state,{active});state=stepSimulation(state,{...active,answer:'quantity'}).state;const stale=restoreEconomyUi(saved,state);assert.equal(stale.active,null);assert(stale.notice.includes('最新账本'));
 const reset=stepSimulation(state,{kind:'reset'}).state;assert.equal(restoreEconomyUi(saved,reset).active,null);assert.equal(restoreEconomyUi({...saved,round:2},state).active,null);assert.equal(restoreEconomyUi({...saved,active:{kind:'accept',target:'missing'},feedback:{correct:true},revision:state.revision},state).active,null);assert.equal(restoreEconomyUi({...saved,active:{kind:'reset'}},state).active,null);
 const unrelated=stepSimulation(initialSimulation(),{kind:'site',target:'plot',answer:'purchase'}).state;assert.deepEqual(restoreEconomyUi(saved,unrelated).active,active,'An unrelated revision may keep a still-valid order question, never its old success feedback');
 const fresh=economyUiSnapshot(unrelated,{active,helpedContexts:['old|old|accept|x']});assert.equal(fresh.helpedContexts.length,0);
});
test('the four authored frames follow actual material/foundation/building stages; opening preserves the building frame',()=>{
 let s=initialSimulation();assert.equal(economySceneFor(s).frame,0);for(const a of [{kind:'site',target:'plot'},{kind:'plan',target:'house'}])s=stepSimulation(s,{...a,answer:simulationTask(s,a).answer}).state;
 for(const [kind,frame]of [['materials',1],['foundation',2],['walls',3]]){const a={kind};s=stepSimulation(s,{...a,answer:simulationTask(s,a).answer}).state;assert.equal(economySceneFor(s).frame,frame);}
 s=stepSimulation(s,{kind:'open',name:'U Liho',text:'V naší prodejně najdete čaj a kávu.'}).state;assert.equal(economySceneFor(s).frame,3);assert(economySceneFor(s).label.includes('打开'));
 const meta=JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT,'app/public/game/assets/courtyard-stages-v1.json'))),image=fs.readFileSync(path.join(PROJECT_ROOT,'app/public/game/assets/courtyard-stages-v1.webp'));assert.equal(createHash('sha256').update(image).digest('hex'),meta.file_sha256);assert.equal(meta.width,meta.tile_width*2);assert.equal(meta.height,meta.tile_height*2);assert(meta.pixel_equal);assert.equal(meta.frames.length,4);
});
