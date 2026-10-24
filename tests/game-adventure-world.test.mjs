import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adventureState,profileForMission} from '../app/public/game/adventure-world.js';
import {facingFromDelta,poseFrame,stopShort} from '../app/public/game/actor-pose.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../content/game/catalog.json',import.meta.url))),characters=JSON.parse(fs.readFileSync(new URL('../app/public/game/assets/characters.v1.json',import.meta.url)));
test('all actual missions have a contact at their own level, and advanced browsing never rewrites recommendation',()=>{
  const progress={recommended:'F01',missions:[]};for(const world of catalog.worlds){const s=adventureState(catalog,progress,world.id),ids=s.npcs.flatMap(n=>n.missions.map(m=>m.id));assert.deepEqual([...ids].sort(),catalog.missions.filter(m=>m.level===world.id).map(m=>m.id).sort());assert.equal(new Set(ids).size,ids.length);assert.equal(s.recommended,'F01');assert.equal(progress.recommended,'F01');}
});
test('looking at a lesson cannot light a repaired prop; only actual completion changes the world',()=>{
  const first=adventureState(catalog,{recommended:'F01',missions:[{id:'F01',visited:true,done:2,total:7,complete:false}]});assert.equal(first.props[0].complete,false);const done=adventureState(catalog,{recommended:'F02',missions:[{id:'F01',done:7,total:7,complete:true}]});assert.equal(done.props[0].complete,true);assert.equal(done.props[1].complete,false);assert.ok(done.npcs.find(n=>n.id==='jana').missions.find(m=>m.id==='F01').complete);
});
test('avatars represent the named teacher or radio rather than the player',()=>{assert.equal(profileForMission({npc:'邻居雅娜'}).id,'jana');assert.equal(profileForMission({npc:'城市联络员彼得'}).id,'petr');assert.equal(profileForMission({native:true}).id,'radio');});
test('directional poses and stop-before-contact follow route segments without cutting a corner',()=>{
  assert.equal(facingFromDelta(3,0),'east');assert.equal(facingFromDelta(-3,0),'west');assert.equal(facingFromDelta(0,-3),'north');assert.equal(facingFromDelta(0,3),'south');assert.equal(facingFromDelta(0,0,'east'),'east');assert.deepEqual([0,125,250,375,500].map(t=>poseFrame(t,true)),[0,1,2,3,0]);assert.equal(poseFrame(300,false),1);
  assert.deepEqual(stopShort([[0,0],[10,0],[10,20]],5),[[0,0],[10,0],[10,15]]);assert.deepEqual(stopShort([[0,0],[10,0],[10,20]],25),[[0,0],[5,0]]);
});
test('runtime atlases include all directions, transparent frames and adequate retina portrait resolution',()=>{
  assert.deepEqual(Object.keys(characters.player.directions),['south','east','north','west']);assert.ok(characters.player.source_height>=104);for(const list of Object.values(characters.player.directions)){assert.equal(list.length,4);for(const f of list){assert.ok(f.anchor[1]>0&&f.anchor[1]<=1);assert.ok(f.rect[0]+f.rect[2]<=characters.player.size[0]);assert.ok(f.rect[1]+f.rect[3]<=characters.player.size[1]);assert.ok(f.visible[3]>150);}}
  for(const id of ['jana','petr','tomas','eva']){assert.ok(characters.npcs.characters[id].body.visible[3]>250);assert.ok(characters.npcs.characters[id].portrait.rect[2]>=176);}
});
