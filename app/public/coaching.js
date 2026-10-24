/**
 * Deterministic process hints. No DOM, storage, network, learner scoring, or AI.
 * A knowledge-point tag is a candidate link, not proof that a particular rule
 * explains this question. Broad/ambiguous tags fall back to task methods.
 * explanation_zh, scoring_basis and model answers are never used as teaching text.
 */
const CLOSED=new Set(['choice','fill','order','correct']);
const string=value=>typeof value==='string'?value.trim():'';
const strings=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()):[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const fold=value=>string(value).normalize('NFC').toLocaleLowerCase('cs').replace(/[“”„"'’‘«».,!?;:()[\]{}]/gu,' ').replace(/\s+/gu,' ').trim();
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

const METHODS={
  choice:{
    observe:'先遮住选项，用自己的话说明题目要找什么。把要辨认的声音、形式或事实，与材料里的其他信息分开。',
    compare:'任选两个候选说法，分别写下支持它们必须找到的依据，再回到材料核查。暂时无法确认的部分先标问号。',
    shrink:'先检查一个选项中的一处信息，确认材料是否真的支持它；再用同一办法处理其余选项。'
  },
  fill:{
    observe:'先不填词，说明空格在句中要表达什么、担当什么作用，再看它前后的搭配与语境。',
    compare:'先提出两个可能的填法，分别说出它们适用的条件；比较哪个条件与原句一致，暂时不要凭眼熟决定。',
    shrink:'先只完成一个判断：需要哪一类词、什么搭配或哪组词形。确定依据后，再写完整回答。'
  },
  order:{
    observe:'把词块按人物、动作、对象和补充信息分组，先弄清整句话想表达什么。',
    compare:'试排两个顺序，分别朗读并解释各自突出的信息；检查句法关系有没有被拆散。',
    shrink:'先用核心词块组成最小的意思单位，再逐块加回其他信息。每加一块，就检查关系和语气是否改变。'
  },
  correct:{
    observe:'先用中文说清原句想表达的意思，圈出题目要求检查的位置，保留原来的事实与交际意图。',
    compare:'把原句与自己的一种改法并排，说明改动解决了什么问题；检查有没有顺手改掉本来成立的信息。',
    shrink:'先只调整一个位置，再朗读整句，检查相关的词形、搭配或语序是否需要随之变化。'
  },
  writing:{
    observe:'先确定谁会读、你希望对方知道或做什么，以及题目要求保留哪些信息。先列关键词，再写句子。',
    compare:'试写两种开头，比较哪一种更清楚地交代目的与对象；再检查事实、理由和条件有没有混在一起。',
    shrink:'先写一句完成核心交际目的的话，再补题目要求的理由、条件或细节，最后逐项核对遗漏的信息。'
  },
  speaking:{
    observe:'先确定说给谁听、要让对方明白什么。只写几个关键词，试着说一个意思完整的小片段。',
    compare:'把同一个小片段录两遍，第二遍只调整一个明确的点；回放比较可懂度，不用快慢代替准确。',
    shrink:'先录一个意思完整的小片段，回听只检查一个点，重新录一遍后再接下一片段。'
  },
  interaction:{
    observe:'先标出对方已经表达了什么、现在需要你回应什么；用一句中文说清这一轮回应的目的。',
    compare:'试写两种回应，比较它们是否接住对方的问题、是否给了对方继续说明的空间。',
    shrink:'先只完成下一轮回应：处理对方的一个具体问题，再补一句必要的澄清或确认。'
  },
  mediation:{
    observe:'把材料明确说出的内容、尚不确定的部分，以及听者真正需要的信息分开列出，保留原有条件。',
    compare:'把原材料与自己的转述并排，逐项检查人物、数量、否定、条件和承诺程度有没有变化。',
    shrink:'先转述一条已确认的信息，保留它的条件或不确定标记；再加下一条，最后检查有没有补入原文未说的内容。'
  },
  other:{
    observe:'先把给定信息与需要完成的任务分开，用自己的话说明要求。',
    compare:'提出两种尝试，分别说明依据，再回到原材料比较。',
    shrink:'把任务分成小步骤，先完成其中一个，再检查能否继续。'
  }
};

const CHECKS={
  pronunciation:'只选一个可听见的点来检查：目标声音、元音长短、重音或停顿。听示范后回放自己的小片段，不给自己编造音素分数。',
  spelling:'逐个检查字母及附加符号。先确认读到的字母，再检查小钩、长音符与遗漏，保留捷语拼写区别。',
  inflection:'标出空格或目标词关联的做事人、支配词或介词，再检查题干是否限定性、数、人称、格、时态或体。',
  meaning:'先用中文解释这个词在当前语境中指什么，再检查它是否符合整句意思。',
  collocation:'把目标词与附近支配它的词连起来看，检查整组搭配，不逐字套中文。',
  word_order:'先圈出一个完整的开头成分，再标出动词与短代词，检查关系和信息重点；不要机械数单个词。',
  comprehension:'划出能支持判断的具体片段，并检查否定、条件、转折或后续修正有没有改变范围。',
  fluency:'先保证一个意思说完整，再接下一层理由或细节；停顿放在意义边界。'
};

// These only select an existing authored card; they do not supply a Czech rule.
const TOPICS=[
  [/过去|昨天|昨日|曾经|过去分词/u,/过去|past|minul/iu],
  [/将来|未来|明天|后天/u,/将来|未来|future|budouc/iu],
  [/完成体|未完成体|动词体/u,/完成体|未完成体|动词体|aspect/iu],
  [/条件式|假设|要是|如果.*会/u,/条件式|假设|conditional|podmiň/iu],
  [/反身|自己做|给自己/u,/反身|reflexive/iu],
  [/被动|施事|被.*所/u,/被动|passive/iu],
  [/语序|词序|附着|第二位置/u,/语序|词序|附着|第二位置|word.order|clitic/iu],
  [/否定|不是|不曾|没有.*过/u,/否定|negation/iu],
  [/人称|我们|你们|第三人称|第一人称|第二人称/u,/人称|být|byt-present|personal|agreement/iu],
  [/女性|男性|中性|有生|无生|性别/u,/女性|男性|中性|有生|无生|性别|gender|agreement/iu],
  [/复数|单数/u,/复数|单数|plural|number|agreement/iu],
  [/敬称|礼貌|正式称呼|对陌生人/u,/敬称|礼貌|正式|formal|register/iu],
  [/名词化/u,/名词化|nominali/iu],
  [/让步|反驳/u,/让步|反驳|concession|rebuttal/iu],
  [/省略|指代|指的是/u,/省略|指代|ellipsis|reference/iu],
  [/证据|推断|结论|论证|范围/u,/证据|推断|结论|论证|范围|argument|qualification/iu],
  [/小钩|附加符号|长音符/u,/小钩|附加符号|长音符|diacritic/iu],
  [/长元音|短元音|元音长短/u,/长元音|短元音|元音长短|vowel.length/iu]
];
const CASE_WORDS=[null,/第一格|一格|主格|nominative/iu,/第二格|二格|属格|genitive/iu,/第三格|三格|与格|dative/iu,/第四格|四格|宾格|accusative/iu,/第五格|五格|呼格|vocative/iu,/第六格|六格|处格|locative/iu,/第七格|七格|工具格|instrumental/iu];
const HAN_SKIP=new Set(['填空','恰当','形式','句子','选择','下面','表达','这个','词语','使用','要求','完成']);
function caseRequested(text){
  const m=text.match(/第?([一二三四五六七1-7])格/u);
  return m?('一二三四五六七'.indexOf(m[1])+1||Number(m[1])):null;
}
function czechWords(text){return new Set((fold(text).match(/[a-záčďéěíňóřšťúůýž]{2,}/gu)||[]));}
function hanPairs(text){
  const found=new Set();
  for(const run of text.match(/[\p{Script=Han}]{2,}/gu)||[])for(let i=0;i<run.length-1;i++){const pair=run.slice(i,i+2);if(!HAN_SKIP.has(pair))found.add(pair);}
  return found;
}
function cardText(card){return [card.id,card.rule_zh,card.detail_zh,card.term,...(Array.isArray(card.examples)?card.examples.flatMap(e=>[e?.cs,e?.zh]):[])].map(string).join(' ');}
function chooseCard(lesson,exercise){
  const points=new Set(strings(exercise.knowledge_points));
  if(!points.size)return null;
  const linked=(Array.isArray(lesson.grammar)?lesson.grammar:[]).map(object).filter(card=>points.has(string(card.id))||strings(card.knowledge_points).some(id=>points.has(id)));
  if(!linked.length)return null;
  const explicit=new Set([string(exercise.hint_grammar_id),...strings(exercise.grammar_ids)].filter(Boolean));
  const named=linked.filter(card=>explicit.has(card.id));
  if(named.length===1)return named[0];
  // Course-wide tags on a fact-retrieval choice do not establish a grammar link.
  if(exercise.type==='choice'&&['comprehension','meaning'].includes(exercise.error_category))return null;
  const task=[string(exercise.prompt_zh),string(exercise.stimulus_cs)].join(' '),requestedCase=caseRequested(task);
  const words=czechWords(task),pairs=hanPairs(task),topics=TOPICS.filter(([test])=>test.test(task));
  const ranked=[];
  for(const card of linked){
    const text=cardText(card);
    if(requestedCase&&!CASE_WORDS[requestedCase].test(text))continue;
    if(exercise.error_category==='inflection'&&!/词形|词尾|变格|变位|人称|时态|过去|将来|未来|完成体|反身|条件式|被动|一致|[一二三四五六七]格|declension|valency|tense|gender|plural|aspect|agreement/iu.test(text))continue;
    if(exercise.error_category==='word_order'&&!/语序|词序|位置|附着|word.order|clitic/iu.test(text))continue;
    const cardWords=czechWords(text);
    const score=topics.filter(([,test])=>test.test(text)).length*6+Math.min(5,[...words].filter(w=>cardWords.has(w)).length)*2+Math.min(3,[...pairs].filter(p=>text.includes(p)).length)+(requestedCase?6:0);
    ranked.push({card,score});
  }
  if(linked.length===1&&ranked.length===1)return ranked[0].card;
  ranked.sort((a,b)=>b.score-a.score);
  return ranked[0]?.score>=4&&(!ranked[1]||ranked[0].score>ranked[1].score)?ranked[0].card:null;
}

function answerGuard(exercise){
  if(!CLOSED.has(exercise.type))return()=>true;
  let hidden=[];
  if(exercise.type==='choice'){
    // Exclude all option texts, so the example cannot single out the right one.
    hidden=(Array.isArray(exercise.options)?exercise.options:[]).map(o=>typeof o==='string'?o:string(o?.text));
  }else hidden=[string(exercise.answer),...strings(exercise.accepted_answers)];
  const expressions=[...new Set(hidden.map(fold).filter(Boolean))].map(value=>new RegExp((/\p{Script=Han}/u.test(value)?'':'(^|[^\\p{L}\\p{M}\\p{N}_])')+escapeRegExp(value)+(/\p{Script=Han}/u.test(value)?'':'(?=$|[^\\p{L}\\p{M}\\p{N}_])'),'u'));
  return value=>!expressions.some(expression=>expression.test(fold(value)));
}
function pronunciationFocus(lesson,exercise,allowed){
  const focus=string(object(lesson.pronunciation).focus_zh),prompt=string(exercise.prompt_zh);
  if(!focus||!allowed(focus))return'';
  const spoken=['speaking','interaction'].includes(exercise.type);
  const soundTask=exercise.error_category==='pronunciation'||/发音|声音|音节|元音|辅音|口型|舌位|重音|跟读|朗读/u.test(prompt);
  if(!spoken&&!soundTask)return'';
  // A specific letter/sound question must not inherit a different sound's focus.
  const targets=czechWords(prompt),focusWords=czechWords(focus);
  if(!spoken&&targets.size&&![...targets].some(w=>focusWords.has(w)))return'';
  if(!spoken&&!targets.size&&![...hanPairs(prompt)].some(p=>focus.includes(p)))return'';
  return focus;
}

/**
 * @returns {{title:string,steps:string[],example_cs:string,example_zh:string,note_zh:string}}
 * round cycles through observing the context, comparing, and reducing the task.
 * Empty example strings mean no accurately linked, non-answer example was found.
 */
export function buildHint(lesson,exercise,round=0){
  lesson=object(lesson);exercise=object(exercise);
  const phase=Number.isFinite(round)?Math.max(0,Math.trunc(round))%3:0;
  const method=METHODS[exercise.type]||METHODS.other,allowed=answerGuard(exercise),card=chooseCard(lesson,exercise);
  const rule=card&&allowed(string(card.rule_zh))?string(card.rule_zh):'';
  const example=card?(Array.isArray(card.examples)?card.examples:[]).map(object).find(e=>string(e.cs)&&allowed(e.cs)&&allowed(e.zh)):null;
  const focus=pronunciationFocus(lesson,exercise,allowed);
  const check=CHECKS[exercise.error_category]||'回到题目限定的情境，说明自己的依据，再检查有没有遗漏必须保留的信息。';
  const listening=strings(exercise.skill_ids).includes('listening')||Boolean(string(exercise.audio_text_cs));
  let title,steps;
  if(phase===0){
    title='先观察语境';
    steps=[method.observe,listening?'先不打开听力文字，听一遍抓场景，再听一遍只记与提问有关的线索；留意后续是否有修正。':check,
      rule?'用这条已关联规律检查线索：'+rule:'先说出自己的判断依据，再决定怎样作答。'];
  }else if(phase===1){
    title=example?'换个例子作对照':'比较两种尝试';
    steps=[example?'先用中文说明下面例句的意思，并标出与本题有关的词或关系。':method.compare,
      rule?'对照本课规律：'+rule:check,
      example?'比较例句与原题的对象、时间、条件或表达目的；借用关系，再用原题的信息独立尝试。':'把两种尝试的不同之处说清楚，再回到原材料或任务条件核查。'];
  }else{
    title='把任务缩小一步';
    steps=[method.shrink,focus?'这一遍只核对本课发音点：'+focus:check,
      '完成这个小步骤后，再恢复完整任务。提交前说明依据，不把看过提示后的表现算作独立完成证据。'];
  }
  if(focus&&phase!==2)steps.push('本课可用的发音对照点：'+focus);
  steps=steps.filter(step=>allowed(step));
  for(const fallback of ['再读一遍要求，检查自己遗漏了什么。','试着说明你的依据。','完成一个小步骤，再继续。'])if(steps.length<2&&allowed(fallback))steps.push(fallback);
  const note=card?(rule?'提示按本题知识点关联到本课规律卡。请把这里的方法用于原题，再自行提交。':'已找到关联规律卡；本轮只展示不会代填本题的方法。'):
    '本题没有足够明确的规律卡关联，本轮按题型拆解；没有附上推测的语法解释。';
  return{title,steps,example_cs:phase===1&&example?string(example.cs):'',example_zh:phase===1&&example?string(example.zh):'',note_zh:allowed(note)?note:'请先独立尝试，再提交核对。'};
}
