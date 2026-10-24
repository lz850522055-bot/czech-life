import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildHint} from '../app/public/coaching.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const future={id:'future-tense',rule_zh:'先区分将来过程与计划要达到的结果。',detail_zh:'本卡介绍未来表达及动词体的选择。',examples:[{cs:'Budu pracovat doma.',zh:'我将会在家工作。'}]};
const past={id:'past-tense',rule_zh:'过去的表达要核对人称与分词。',detail_zh:'过去式按相关人称变化。',examples:[{cs:'Včera jsem četl.',zh:'昨天我读书了。'}]};
const lesson={id:'A2-example',level:'A2',grammar:[past,future],knowledge_points:['past-tense','future-tense']};
const exercise={id:'A2-example-E01',type:'fill',prompt_zh:'填出“我们将工作”的助动词。',stimulus_cs:'___ pracovat. (my)',answer:'budeme',accepted_answers:['Budeme'],knowledge_points:['future-tense'],skill_ids:['writing'],error_category:'inflection',explanation_zh:'THIS_IS_THE_DIRECT_ANSWER_EXPLANATION'};

test('三个轮次提供观察、对照与拆小任务，未重复答案解析',()=>{
  const hints=[0,1,2].map(round=>buildHint(lesson,exercise,round));
  assert.equal(new Set(hints.map(h=>h.title)).size,3);
  assert.equal(new Set(hints.map(h=>h.steps.join('\n'))).size,3);
  assert.match(hints[0].steps[0],/空格|作用/);
  assert.ok(hints[1].example_cs);
  assert.match(hints[2].steps[0],/一个判断/);
  assert.ok(hints.every(h=>!JSON.stringify(h).includes(exercise.explanation_zh)));
  assert.deepEqual(buildHint(lesson,exercise,3),hints[0]);
});

test('知识点精确关联，不把另一张规律卡的例句作为本题提示',()=>{
  const h=buildHint(lesson,exercise,1);
  assert.equal(h.example_cs,future.examples[0].cs);
  assert.equal(h.example_zh,future.examples[0].zh);
  assert.ok(h.steps.some(s=>s.includes(future.rule_zh)));
  assert.ok(!JSON.stringify(h).includes(past.rule_zh));
  assert.ok(!JSON.stringify(h).includes(past.examples[0].cs));
});

test('全课宽泛标签必须消歧；格题不得附上不对应的论证规律',()=>{
  const broad={grammar:[{id:'argument',rule_zh:'证据只能支持一定范围的结论。',detail_zh:'抽象名词 rozvoj 需要观察指标。',examples:[{cs:'Rozvoj má své meze.',zh:'发展有其边界。'}]},{id:'nominalization',rule_zh:'名词化压缩信息但要说明做事的人。',detail_zh:'名词化常接第二格。',examples:[{cs:'Ochrana prostoru je důležitá.',zh:'保护空间很重要。'}]}]};
  const e={type:'fill',prompt_zh:'填第六格形式。',stimulus_cs:'Mluvíme o ___. (rozvoj)',answer:'rozvoji',knowledge_points:['argument','nominalization'],error_category:'inflection'};
  const h=buildHint(broad,e,1);
  assert.equal(h.example_cs,'');assert.match(h.note_zh,/没有足够明确/);
  assert.ok(!JSON.stringify(h).includes('名词化常接第二格'));
  const ambiguous=buildHint(lesson,{...exercise,prompt_zh:'填空。',stimulus_cs:'___',knowledge_points:['past-tense','future-tense']},1);
  assert.equal(ambiguous.example_cs,'');
});

test('相关例句与闭合答案或备选答案重合时，改用另一例句而不泄露',()=>{
  const secret='Skrytá přesná odpověď';
  const l={grammar:[{id:'case-pattern',rule_zh:secret,detail_zh:'第三格与动词搭配。',examples:[{cs:secret+'.',zh:'当前题的完整答案'},{cs:'Pomáhám kolegovi.',zh:'我帮助一位男同事。'}]}]};
  const e={type:'correct',prompt_zh:'检查并修改词形。',answer:secret,accepted_answers:['Další tajná varianta'],knowledge_points:['case-pattern'],error_category:'inflection'};
  Object.defineProperty(e,'explanation_zh',{get(){throw new Error('不得读取答案解析来冒充换一种解释');}});
  for(const round of [0,1,2]){
    const h=buildHint(l,e,round);
    assert.ok(!JSON.stringify(h).toLocaleLowerCase('cs').includes(secret.toLocaleLowerCase('cs')));
    assert.deepEqual(Object.keys(h).sort(),['example_cs','example_zh','note_zh','steps','title']);
    assert.ok(!Object.hasOwn(h,'answer'));assert.ok(!Object.hasOwn(h,'explanation_zh'));
  }
  assert.equal(buildHint(l,e,1).example_cs,'Pomáhám kolegovi.');
  const alternative={...e,type:'fill',answer:'hlavní odpověď',accepted_answers:['Pomáhám kolegovi.']};
  assert.ok(!buildHint(l,alternative,1).example_cs.includes('Pomáhám kolegovi'));
});

test('选择题例句不重复任何选项，也不按宽泛阅读标签附加语法答案',()=>{
  const l={grammar:[{id:'target',rule_zh:'检查词形和语境。',detail_zh:'第三格。',examples:[{cs:'Pomáhám kolegovi.',zh:'我帮助一位男同事。'},{cs:'Píšu sestře.',zh:'我给姐姐写信。'}]}]};
  const e={type:'choice',prompt_zh:'选出合适的词形。',answer:'a',options:[{id:'a',text:'Pomáhám kolegovi.'},{id:'b',text:'Jdu domů.'}],knowledge_points:['target'],error_category:'inflection'};
  assert.equal(buildHint(l,e,1).example_cs,'Píšu sestře.');
  const reading=buildHint(l,{...e,prompt_zh:'人物到哪里去了？',error_category:'comprehension'},1);
  assert.equal(reading.example_cs,'');assert.match(reading.steps[0],/候选说法/);
});

test('无规律卡的听力测评和开放任务仍有可执行提示，不编造例句',()=>{
  const assessment={kind:'level',level:'C2',unseen_text:[{cs:'Zpráva byla opravena.',zh:'消息已修订。'}]};
  const e={type:'mediation',prompt_zh:'向未参加会议的同事转述已确认与待确认事项。',skill_ids:['mediation'],knowledge_points:['unknown'],answer:'model text'};
  for(const round of [0,1,2]){const h=buildHint(assessment,e,round);assert.ok(h.steps.length>=2);assert.equal(h.example_cs,'');assert.match(h.note_zh,/没有足够明确/);}
  const listening=buildHint(assessment,{...e,type:'choice',skill_ids:['listening'],options:[{id:'a',text:'已批准'},{id:'b',text:'待确认'}],answer:'b'},0);
  assert.ok(listening.steps.some(s=>s.includes('先不打开听力文字')));
  assert.match(buildHint(assessment,e,2).steps[0],/不确定标记|条件/);
});

test('发音提示使用本课实际focus，但不附带闭合题目标答案',()=>{
  const l={pronunciation:{focus_zh:'保留长元音的持续时间，在完整意义组之间停顿。'}};
  const speaking=buildHint(l,{type:'speaking',prompt_zh:'录一段口头说明。',error_category:'pronunciation'},2);
  assert.ok(speaking.steps.some(s=>s.includes(l.pronunciation.focus_zh)));
  const closed=buildHint({pronunciation:{focus_zh:'先读 tajnéheslo，再比较长短。'}},{type:'fill',prompt_zh:'练习发音。',answer:'tajnéheslo',error_category:'pronunciation'},2);
  assert.ok(!JSON.stringify(closed).includes('tajnéheslo'));
});

test('纯函数不改变输入，缺失对象或无效轮次也不会抛错',()=>{
  const before=JSON.stringify({lesson,exercise});
  for(const r of [0,1,2,-1,NaN,Infinity,undefined])buildHint(lesson,exercise,r);
  assert.equal(JSON.stringify({lesson,exercise}),before);
  const h=buildHint(null,null,Infinity);assert.ok(h.steps.length>=2);assert.equal(typeof h.title,'string');
  assert.deepEqual(buildHint(lesson,exercise,-1),buildHint(lesson,exercise,0));
});

test('七级真实教材与各级无grammar总测评均可得到三轮完整提示',t=>{
  let items=0,questions=0;
  for(const level of ['Pre-A1','A1','A2','B1','B2','C1','C2']){
    const dir=path.join(root,'content','lessons',level),first=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort()[0];
    for(const file of [path.join(dir,first),path.join(root,'content','assessments',level+'-FINAL.json')]){
      const item=JSON.parse(fs.readFileSync(file,'utf8'));items++;
      for(const e of item.exercises){questions++;const hints=[0,1,2].map(round=>buildHint(item,e,round));
        assert.equal(new Set(hints.map(h=>h.title)).size,3,e.id);
        for(const h of hints){assert.ok(h.steps.length>=2,e.id);assert.ok(h.steps.every(s=>typeof s==='string'&&s.trim()),e.id);assert.equal(typeof h.example_cs,'string');assert.equal(typeof h.note_zh,'string');}
        if(!item.grammar?.length)assert.ok(hints.every(h=>h.example_cs===''),e.id);
      }
    }
  }
  t.diagnostic(`实际覆盖 ${items} 份七级课文/总测评、${questions} 道题，每题三轮提示。`);
});
