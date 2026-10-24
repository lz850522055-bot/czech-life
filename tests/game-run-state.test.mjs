import test from 'node:test';
import assert from 'node:assert/strict';
import {workDraftKey,newerRun} from '../app/public/game/run-state.js';
test('legacy story draft remains accessible while review units and attempts have separate keys',()=>{
  const story=workDraftKey('li','price','work',null,'story');
  assert.equal(story,'li|price|work');assert.equal(workDraftKey('li','price','work',null,'new-story'),story);
  const first=workDraftKey('li','price','work',{unit_id:'price'},'review-1');
  assert.notEqual(first,story);assert.notEqual(first,workDraftKey('li','price','work',{unit_id:'price'},'review-2'));assert.notEqual(first,workDraftKey('other','price','work',{unit_id:'price'},'review-1'));
});
test('newer remote progress supersedes an old local run without erasing newer offline progress',()=>{
  const mission={id:'price',version:'new',tasks:[{id:'first'},{id:'second'}]},local={attempt:'desktop',step:0,at:'2026-10-24T01:00:00.000Z'},remote={mission_id:'price',attempt_id:'phone',step:1,started:true,at:'2026-10-24T02:00:00.000Z'};
  const selected=newerRun(local,remote,mission);assert.equal(selected.attempt,'phone');assert.equal(selected.task_id,'second');assert.equal(selected.version,'new');
  assert.equal(newerRun({...local,at:'2026-10-24T03:00:00.000Z'},remote,mission).attempt,'desktop');assert.equal(newerRun(local,{...remote,mission_id:'other'},mission),local);assert.equal(newerRun(local,null,mission),local);
  assert.equal(newerRun({...local,at:undefined},remote,mission).attempt,'phone');assert.equal(newerRun(local,{...remote,at:undefined},mission),local);
  assert.deepEqual(newerRun(null,{...remote,review_context:{unit_id:'price',mode:'same_material',completed:false}},mission).review_context,{unit_id:'price',mode:'same_material',completed:false});
});
