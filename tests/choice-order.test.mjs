import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceOrder} from '../app/public/choice-order.js';
test('排列稳定、无副作用，保留答案ID且分散固定位置',()=>{
 const options=[{id:'a',text:'A'},{id:'b',text:'B'},{id:'c',text:'C'}], original=JSON.stringify(options),positions=new Set();
 for(let i=0;i<50;i++){
  const key='B2-U'+i+':2026.10.23.1:E01',out=choiceOrder(options,key);
  assert.deepEqual(out,choiceOrder(options,key));assert.deepEqual(out.map(o=>o.id).sort(),['a','b','c']);
  assert.equal(out.find(o=>o.id==='b').text,'B');positions.add(out.findIndex(o=>o.id==='b'));
 }
 assert.equal(positions.size,3);assert.equal(JSON.stringify(options),original);
});
