import {deliveryStory,deliveryAudioScripts} from './game-delivery-story.mjs';
import {districtStory,districtAudioScripts} from './district-story.mjs';
import {a1ReturnCases,a1ReturnAudioScripts} from './a1-return-cases.mjs';
import {nativeListeningChecks} from './native-listening-checks.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAME_VERSION,LEVELS,taskBody} from '../app/public/game/core.js';
import {canonical,hash} from '../app/server/util.mjs';
import {buildLearningPaths} from './game-learning-paths.mjs';
import {foundationFieldCases} from './foundation-field-cases.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),content=path.join(root,'content');
const read=p=>JSON.parse(fs.readFileSync(path.join(content,p),'utf8').replace(/^\uFEFF/,''));
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):x.name.endsWith('.json')?[path.join(p,x.name)]:[]);
const lessons=walk(path.join(content,'lessons')).map(f=>JSON.parse(fs.readFileSync(f,'utf8'))).sort((a,b)=>a.order-b.order);
const assessments=walk(path.join(content,'assessments')).map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
const scenarios=read('scenarios.json'),native=read('authentic/manifest.json').clips;
const byId=new Map(lessons.map(l=>[l.id,l])),first=byId.get('Pre-A1-U01-L01');
const audio=r=>r?Object.fromEntries(['id','asset_id','status','start','end','slow_start','slow_end','slow_file','file_url','text','voice','quality_status'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])):null;
const ref=(l,i=0)=>audio(l.audio_refs?.find(r=>r.role==='text'&&r.index===i));
const phrase=(l,s)=>audio(l.audio_refs?.find(r=>r.text?.normalize('NFC').trim()===s.normalize('NFC').trim()));
const phon=(file,label)=>{for(const speed of ['normal','slow'])if(!fs.existsSync(path.join(root,`app/public/assets/phonetics-game-v2/${file}-${speed}.mp3`)))throw new Error('Missing phonetic '+file);return {id:'phonetic-'+file,status:'generated',file_url:`/assets/phonetics-game-v2/${file}-normal.mp3`,slow_file:`/assets/phonetics-game-v2/${file}-slow.mp3`,text:label,voice:'cs_CZ-jirka-medium',quality_status:'machine_checked_not_native_listened'};};
const sounds={a:phon('a','a'),aa:phon('long-a','á'),e:phon('e','e'),i:phon('i','i'),ii:phon('long-i','í'),o:phon('o','o'),u:phon('u','u'),uu:phon('long-u','ú'),c:phon('c','c'),cc:phon('ch-hook','č'),j:phon('j','j'),word:phon('word','káva')};
const worlds=[
['Pre-A1','唤醒城市','让声音和文字第一次对上号','声音街'],['A1','第一次独立出门','认识邻居，买对东西，问清路线','生活街'],['A2','在这里安顿下来','安排日常，说明简单问题','生活街'],['B1','遇事自己处理','把经历、变化与解决办法说清楚','车站'],['B2','把事情谈成','比较方案，讨论和协商','商店'],['C1','听懂话外之意','发现含蓄立场，准确转述','社区'],['C2','掌握表达的分寸','综合证据，处理细微差别与追问','社区']
].map(([id,title,goal,hub])=>({id,title,goal,hub}));
const step=(kind,title,extra={})=>({kind,title,...extra});
const learn=(title,cards,rule='')=>step('learn',title,{cards,rule,prompt:'先听、先看，把这条规律亲手试一遍。'});
const choice=(title,prompt,opts,answer,explanation,extra={})=>step('choice',title,{prompt,options:opts.map(([id,text])=>({id,text})),answer,explanation,...extra});
const listen=(title,a,opts,answer,explanation)=>({...choice(title,'先听声音，再打开对应的门。',opts,answer,explanation),kind:'listen',audio:a});
const work=(title,prompt,model='',rubric=[])=>step('work',title,{prompt,model,rubric,skills:['speaking','writing']});
function assessmentTask(a,e){const open=['writing','speaking','interaction','mediation'].includes(e.type);return step(e.type,'把规律用到新情况',{prompt:e.prompt_zh,stimulus:e.stimulus_cs||'',answer:String(e.answer),accepted:(e.accepted_answers||[]).map(String),explanation:e.explanation_zh,options:e.options?.map(o=>typeof o==='object'?{id:String(o.id),text:String(o.text)}:{id:String(o),text:String(o)}),tokens:e.type==='order'?(e.tokens||String(e.answer).split(/\s+/)):undefined,joiner:' ',model:open?String(e.answer):'',rubric:e.rubric||[],skills:e.skill_ids,knowledge_points:e.knowledge_points||[],transfer:true,source_assessment:a.id,source_assessment_exercise:e.id,audio:audio(a.audio_refs?.find(r=>r.role==='exercise'&&r.exercise_id===e.id)||(e.skill_ids?.includes('listening')?a.audio_refs?.find(r=>r.role==='full'):null))});}
const card=(cs,zh,a=null,extra={})=>({cs,zh,audio:a,...extra});
const missions=[];
function foundation(n,title,goal,tasks,lesson=first,location='声音街'){
  missions.push({id:'F'+String(n).padStart(2,'0'),level:'Pre-A1',foundation:true,title,goal,story:'城市里有些声音还没点亮。和邻居一起，把眼前这件小事办清楚。',npc:'邻居雅娜',location,lesson_id:lesson.id,lesson_version:lesson.version,knowledge_points:lesson.knowledge_points,prerequisites:n>1?['F'+String(n-1).padStart(2,'0')]:[],reward:n===12?'第一段街区故事完成，你可以自己继续探索。':'声音街多了一条你能看懂的线索。',tasks});
}
foundation(1,'声音开门','认识 a / á，听出长短差别。',[
  learn('先认识第一个声音',[card('a','嘴自然张开，舌位较低；短短发出，不加“呃”。',sounds.a,{ipa:'[a]',mouth:'open'})],'字母 a 代表这个声音，方括号里的 [a] 是音标。先听一次，再自己试一次。'),
  learn('同一个声音，长一点',[card('a','短音',sounds.a,{ipa:'[a]'}),card('á','同类的长元音，长音符不是重音符号。',sounds.aa,{ipa:'[aː]'})],'仔细对比持续时间。长短区别与词的重音是两件事，不套“固定长两倍”的公式。'),
  listen('打开第一扇门',sounds.a,[['a','a [a]'],['aa','á [aː]']],'a','刚才听的是短音 a。'),
  listen('现在换一个声音',sounds.aa,[['a','a [a]'],['aa','á [aː]']],'aa','刚才听的是长音 á。再次尝试时门的位置会换。'),
  choice('找出这个符号的作用','á 上面的斜线在这里提醒什么？',[['length','元音是长音'],['loud','一定要喊得更响'],['tone','像中文声调一样往上扬']],'length','这里的斜线标记元音长度，不是音量、声调或重音。'),
  work('留一份声音记录','分别说 a、á，录音回听；也可以先写下你观察到的长短或口型区别。','a — á',['我能把两次声音分开说','我听了自己的回放','记录仍需练习的地方']),
  listen('换门再试一次',sounds.aa,[['short','a [a]'],['long','á [aː]']],'long','不看门的颜色或左右位置，凭声音判断长度。')]);
foundation(2,'修复声音牌','再认识 e / o / u，按口型和声音找到字母。',[
  learn('三个新声音',[card('e','舌面在中间偏前，嘴唇不圆。',sounds.e,{ipa:'[ɛ]',mouth:'front'}),card('o','嘴唇圆拢，舌位比 u 低。',sounds.o,{ipa:'[o]',mouth:'round'}),card('u','嘴唇圆拢，舌位较高。',sounds.u,{ipa:'[u]',mouth:'round'})],'先用声音和口型建立联系，不用中文谐音替代。'),
  listen('修好圆口的招牌',sounds.u,[['e','e'],['o','o'],['u','u']],'u','这个声音是 u。对比 o 时留意舌位。'),
  listen('另一块牌子',sounds.e,[['e','e'],['o','o'],['u','u']],'e','这个声音是 e [ɛ]。'),
  work('记录一个自己的窍门','回听 e、o、u，写下或录下你怎样区分它们。','e / o / u',['有实际回听','口型与声音对应','不只记颜色或位置'])]);
foundation(3,'字母侦探','知道 i/y、í/ý 的声音关系和拼写边界。',[
  learn('先分清声音长度',[card('i / y','标准捷语中，这两种写法可对应同一个短元音；拼写仍受词与环境约束。',sounds.i,{ipa:'[ɪ]'}),card('í / ý','这两种写法可对应同一个长元音；不表示所有词都能互换拼法。',sounds.ii,{ipa:'[iː]'})],'先学声音，再在具体词和辅音环境中学拼写。'),
  listen('听音选择长度',sounds.ii,[['short','i / y · 短'],['long','í / ý · 长']],'long','听到的是长元音。'),
  choice('同音是否等于随便写','i 和 y 在这里声音相同，能把每个词里的 i 都改成 y 吗？',[['no','不能，拼写有自己的条件'],['yes','可以，听起来一样就行']],'no','同音不等于拼写可互换。辅音软硬、词的来源和词形会提供线索。'),
  work('做一张自己的线索卡','用中文解释“同音”和“同拼写”有什么不同，可配 i/y 为例。','i/y 可以同音，但不能随意互换。',['没有把声音和字母混为一谈'])]);
foundation(4,'招牌拼装','从一个音走到一个短词。',[
  learn('看懂一杯咖啡',[card('káva','咖啡。先听整体，再把它分成 ká + va。',sounds.word,{ipa:'[ˈkaːva]'})],'长音在第一个元音；重音标记 ˈ 放在重读音节前，两种符号各司其职。'),
  step('order','把招牌装回去',{prompt:'按听到的顺序拼回“咖啡”。',tokens:['ká','va'],joiner:'',answer:'káva',audio:sounds.word,explanation:'ká + va → káva。拼读不要在中间加一个“呃”。'}),
  choice('找出长音位置','káva 里哪个元音有长音符？',[['first','第一个 a'],['second','最后一个 a']],'first','á 是长音；最后的 a 是短音。'),
  work('把词读给邻居听','读 káva，再听示范与自己的录音。写下哪里还不确定。','káva',['两个音节清楚','没有多加音节','区分长短'])]);
foundation(5,'听错的货物','区分 c 和 č，先听准开头声音。',[
  learn('小钩会换一个声音',[card('c','舌尖附近形成塞擦音，类似 [t] 和 [s] 紧密连在一起。',sounds.c,{ipa:'[t͡s]'}),card('č','比 c 更靠后，类似 [t] 和 [ʃ] 紧密连在一起。',sounds.cc,{ipa:'[t͡ʃ]'})],'先对比声音和位置。有无小钩不是装饰。'),
  listen('把声音交到正确窗口',sounds.cc,[['c','c [t͡s]'],['cc','č [t͡ʃ]']],'cc','带小钩的 č 对应这里的声音。'),
  listen('另一个窗口',sounds.c,[['c','c [t͡s]'],['cc','č [t͡ʃ]']],'c','这是 c 的声音。'),
  work('回听两个开头','分别模仿 c、č；回听有没有把它们读成同一个声音。','c — č',['对比口腔位置','没有靠中文谐音死记'])]);
const p3=byId.get('Pre-A1-U03-L01');
foundation(6,'嘴巴练习室','用发音位置解释难音，遇到 r/ř 仍能继续生活任务。',[
  learn('难音拆开练',[card('r','舌尖靠近齿龈，尝试短促弹动，不硬憋很长的颤音。',ref(p3,0)),card('ř','带摩擦的颤音，逐步寻找位置；不能把它永远当成一个普通 r 或 ž。',ref(p3,1))],'本节点先建立位置意识和记录。难音仍不熟练，可以保留练习支线，继续学习其他表达。'),
  choice('选一条更有用的练法','ř 暂时读不出来，接下来怎么办？',[['practice','回听、找位置、短练，并继续学可用表达'],['stop','必须卡在这里，其他内容都不能学'],['replace','以后永远随便换成别的音']],'practice','保留难点并持续练习，不把整条学习路线锁死。'),
  work('保存难音样本',p3.pronunciation.task_zh,'ř / r',p3.transfer_task.rubric)],p3);
foundation(7,'街头节奏','把重音和长短音分开看。',[
  learn('同一个词的两条线索',[card('káva','ˈ 指示重音起点；á 的斜线提示长元音。',sounds.word,{ipa:'[ˈkaːva]'})],'捷语的词重音通常落在重音组第一个音节；介词等会参与形成重音组。不能简单教成每个单词都喊响第一个音节。'),
  choice('找到错误的说法','哪句话把两个概念混了？',[['wrong','长音符就是重音符'],['right','元音长度与重音要分别判断']],'wrong','长音与重音相互独立。'),
  step('fill','给招牌补回符号',{prompt:'“咖啡”这个词是 k__va，请写出完整的捷语词。',answer:'káva',accepted:['Káva'],explanation:'保留 á 的长音符。',audio:sounds.word}),
  work('跟着词走一遍','模仿 káva，听自己是否多加了音节或把长度当成大声。','káva',['长短清楚','不多加音节'])]);
foundation(8,'找到关键词','从短词组里抓到要用的信息。',[
  learn('三个饮品招牌',[card('Čaj. Káva. Voda.','茶。咖啡。水。',ref(first,2))],'现在只找目标词，不要求一遍听懂所有语法。'),
  choice('把茶交给客人','客人指着 Čaj，你应拿什么？',[['tea','茶'],['coffee','咖啡'],['water','水']],'tea','Čaj 是茶；和 káva、voda 分开建立联系。'),
  step('fill','修好水的标签',{prompt:'给“水”的标签写上捷语词。',answer:'voda',explanation:'水是 voda。'}),
  work('一句话说出你的策略','下次在一句话中找饮品，你会先抓哪个词？','先找 Čaj / káva / voda 这样的目标词。',['能说出目标信息'])]);
foundation(9,'听不懂也能继续','掌握请对方重复的修复表达。',[
  learn('这一句能帮你继续',[card('Prosím, ještě jednou.','请再说一遍。',ref(first,4))],'把它当作可直接使用的声音块；先完成沟通，再逐渐理解内部结构。'),
  choice('对方会怎样理解你','你说 Prosím, ještě jednou.，你在请求什么？',[['again','请对方再说一遍'],['bye','马上结束对话'],['yes','确认每个细节都听懂了']],'again','这是一种修复沟通的请求。'),
  step('order','把求助句装好',{prompt:'组装“请再说一遍”。',tokens:['Prosím,','ještě','jednou.'],joiner:' ',answer:'Prosím, ještě jednou.',explanation:'先使用完整短句，再认识其中词语。'}),
  work('真的试着求助','录下或写出这一句，想象对方说得太快时你会怎样使用它。','Prosím, ještě jednou.',['表达的是请求重复','能把它作为整块使用'])]);
foundation(10,'认识邻居','确认名字，作一句清楚的自我介绍。',[
  learn('听一个问题，给一个名字',[card('Jak se jmenujete?','您叫什么名字？',ref(first,5)),card('Jmenuju se Li.','我叫李。',ref(first,6))],'先听出对方在问“叫什么”，不用把问句逐字翻译。'),
  step('dialogue','门口遇见雅娜',{prompt:'听懂问题，选能把名字说清楚的回应。',start:'name',nodes:[{id:'name',speaker_cs:'Jak se jmenujete?',speaker_zh:'您叫什么名字？',audio:ref(first,5),choices:[{id:'li',text_cs:'Jmenuju se Li.',text_zh:'我叫李。',feedback_zh:'你的名字说清楚了。',next:'done'},{id:'ano',text_cs:'Ano.',text_zh:'是的。',feedback_zh:'对方问的是名字，单说“是”还没回答问题。',next:'repair'}]},{id:'repair',speaker_cs:'Jak se jmenujete?',speaker_zh:'您叫什么名字？',audio:ref(first,5),choices:[{id:'li',text_cs:'Jmenuju se Li.',text_zh:'我叫李。',feedback_zh:'补上名字，对话就继续了。',next:'done'}]},{id:'done',speaker_cs:'Děkuju.',speaker_zh:'谢谢。',choices:[]}]}),
  work('用你自己的话介绍','录下或写出自己的简短介绍。可以从 Jmenuju se Li. 开始。','Jmenuju se Li.',['有清楚的名字','能在被问到时回应'])],byId.get('A1-U01-L01'),'生活街');
const prices=byId.get('A1-U05-L01');
foundation(11,'买对东西','把数字和物品放在一起，听清实际要买的数量。',[
  learn('看清杯子的价牌',[card(prices.lesson_text[1].cs,prices.lesson_text[1].zh,ref(prices,1))],'先认识一只和两只杯子，以及这两种数量对应的总价。只练本页已经教过的数字。'),
  step('checkout','带一只到柜台',{prompt:'给这次委托拿一只杯子，再到柜台确认合计多少克朗。',shop:{item:'hrnek',max_quantity:2,unit_price:80},answer:{quantity:1,total:80},audio:ref(prices,1),explanation:'Jeden hrnek stojí osmdesát korun. 一只杯子80克朗。先对数量，再对总价。',rule:'jeden hrnek 对应一只杯子；stojí 后面这里说的是它的价格。'}),
  step('checkout','带两只回去',{prompt:'这次要带两只杯子。亲手调整托盘，再给店主一个合计金额。',shop:{item:'hrnek',max_quantity:2,unit_price:80},answer:{quantity:2,total:160},audio:ref(prices,1),explanation:'Dva hrnky stojí sto šedesát korun. 两只杯子合计160克朗；总价正确但托盘拿错，事情也没办成。',rule:'数量从 jeden 到 dva，hrnek 也在这句里变成 hrnky；先把一只与两只这组搭配记在场景里，不把这个变化套到所有数词。',transfer:true}),
  work('先确认数量','用中文记录数量变化怎样影响这次价格；可以模仿录下听到的捷语。',prices.lesson_text[1].cs,['一只和两只没有混','价格与数量对应'])],prices,'商店');
foundation(12,'第一次独立出门','把看懂招牌、请求重复和介绍自己组合起来。',[
  listen('再次走到门口',sounds.a,[['a','a [a]'],['aa','á [aː]']],'a','换了位置，仍靠声音辨别。'),
  choice('邻居又问你名字','Jak se jmenujete?',[['name','Jmenuju se Li.'],['again','Děkuju.']],'name','回答名字，才能完成当前目标。',{audio:ref(first,5)}),
  step('fill','替新店写招牌',{prompt:'不看旧牌子，写出捷语的“咖啡”。',answer:'káva',explanation:'káva，保留长音符。'}),
  work('留一段出门记录','用捷语介绍自己，并说一句遇到没听懂时会用的表达。可录音，也可先写。','Jmenuju se Li. Prosím, ještě jednou.',['有名字','会请求重复','保留一个还要继续练的声音'])],first,'生活街');

// A lesson becomes a story episode containing multiple distinct actions, not a
// title-only pin. Every original rule and exercise is retained and linked.
for(const l of lessons){
  const tasks=[];
  tasks.push(step('source','接到一段新的城市留言',{prompt:l.intro_zh,cards:l.lesson_text.map((x,i)=>card(x.cs,x.zh,ref(l,i),{note:x.note_zh})),audio:audio(l.audio_refs.find(r=>r.role==='full')),skills:l.skills}));
  if(l.vocabulary?.length)tasks.push(learn('把必要物品和表达认清',l.vocabulary.map((v,i)=>card(v.lemma,v.meaning_zh,audio(l.audio_refs.find(r=>r.role==='vocabulary'&&r.index===i)),{note:[v.collocation,v.forms].filter(Boolean).join(' · ')})),'点击听词与例句。下一步会在情境中使用，不要求一口气死背。'));
  for(const g of l.grammar){tasks.push(step('learn',g.rule_zh,{prompt:g.detail_zh,rule:g.rule_zh,knowledge_points:[g.id],cards:(g.examples||[]).map(x=>card(x.cs,x.zh,phrase(l,x.cs),{note:x.note_zh})),pitfalls:g.pitfalls||[],exceptions:g.exceptions||[],term:g.term||g.id}));}
  for(const e of l.exercises){
    const t={kind:e.type,title:({choice:'找对线索',fill:'修好这条消息',order:'组装一句话',correct:'找出并修复问题',writing:'写给对方',speaking:'把话说清楚',interaction:'回应新情况',mediation:'替别人解释清楚'})[e.type]||'完成眼前的事',prompt:e.prompt_zh,stimulus:e.stimulus_cs||'',answer:String(e.answer),accepted:(e.accepted_answers||[]).map(String),explanation:e.explanation_zh,rubric:e.rubric||[],model:['writing','speaking','interaction','mediation'].includes(e.type)?String(e.answer):'',skills:e.skill_ids,knowledge_points:e.knowledge_points||[],source_exercise:e.id,scoring_basis:e.scoring_basis,audio:audio(l.audio_refs.find(r=>r.role==='exercise'&&r.exercise_id===e.id))};
    if(e.options)t.options=e.options.map((o,i)=>typeof o==='object'?{id:String(o.id),text:String(o.text)}:{id:String(o),text:String(o)});
    if(e.type==='order'){t.tokens=Array.isArray(e.tokens)?e.tokens:String(e.answer).split(/\s+/);t.joiner=' ';}
    tasks.push(step(t.kind,t.title,t));
  }
  const scene=scenarios.find(s=>s.lesson_id===l.id);
  if(scene)tasks.push(step('dialogue',scene.title_zh,{prompt:scene.intro_zh,start:scene.start,nodes:scene.nodes.map(n=>({...n,audio:audio(l.audio_refs.find(r=>r.scenario_id===scene.id&&r.node_id===n.id))})),skills:['interaction']}));
  const assessment=assessments.find(a=>a.unit_id===l.unit_id&&a.kind==='unit');
  if(assessment){
    tasks.push(step('source','新材料：这次不能只记旧答案',{prompt:'换一份材料，先找人物、地点、条件与转折，再完成下一步。',audio:audio(assessment.audio_refs?.find(r=>r.role==='full')),cards:(assessment.unseen_text||[]).map((x,i)=>card(x.cs,x.zh,audio(assessment.audio_refs?.find(r=>r.role==='text'&&r.index===i))))}));
    for(const e of assessment.exercises)tasks.push(assessmentTask(assessment,e));
  }
  tasks.push(work('这件事，由你来说',l.transfer_task.prompt_zh,l.transfer_task.model_answer_cs,l.transfer_task.rubric));
  const w=worlds.find(w=>w.id===l.level);
  missions.push({id:'G-'+l.id,level:l.level,title:l.title_zh,goal:l.can_do.join('；'),story:l.intro_zh,npc:LEVELS.indexOf(l.level)<3?'邻居雅娜':'城市联络员彼得',location:w.hub,lesson_id:l.id,lesson_version:l.version,knowledge_points:l.knowledge_points,prerequisites:l.prerequisites.map(id=>'G-'+id),reward:'你已经为这次情境留下了回应与作品，新的故事线索进入图鉴。',tasks});
}

// Every level assessment is a separate transfer mission. Reading/recognition,
// spoken/written work and mediation retain separate evidence and full audio.
for(const a of assessments.filter(a=>a.kind==='level')){
  const l=lessons.filter(l=>l.level===a.level).at(-1),tasks=[step('source','收到一份未练过的委托',{prompt:'这次先读懂或听清新材料，再独立回应。需要时可以展开中文帮助；不是背熟旧答案就算完成。',audio:audio(a.audio_refs?.find(r=>r.role==='full')),cards:(a.unseen_text||[]).map((x,i)=>card(x.cs,x.zh,audio(a.audio_refs?.find(r=>r.role==='text'&&r.index===i))))}),...a.exercises.map(e=>assessmentTask(a,e))];
  tasks.push(work('回看这次独立任务','记录哪一步能自己完成，哪一步用了帮助；换一个对象再试一次。','',a.rubric||[]));
  missions.push({id:'T-'+a.id,level:a.level,title:a.title_zh,goal:'把这个阶段的声音、规律与表达带到一份新委托里。',story:'游戏内原创的独立迁移任务，不是现实通知。',npc:'城市联络员彼得',location:worlds.find(w=>w.id===a.level).hub,lesson_id:l.id,lesson_version:l.version,knowledge_points:l.knowledge_points,prerequisites:lessons.filter(x=>x.level===a.level).map(x=>'G-'+x.id),reward:'新情境中的回应已保存；客观题与开放作品分别留证。',tasks});
}

// Real multi-speaker and public recordings stay real recordings, with source,
// capture/genre limits and open-answer rubrics visible in the case evidence.
for(const clip of native){
  const l=byId.get(clip.lesson_id);if(!l||!clip.media?.file||!fs.existsSync(path.join(content,'authentic',clip.media.file)))throw new Error('Missing native audio '+clip.id);if(hash(fs.readFileSync(path.join(content,'authentic',clip.media.file)))!==clip.media.sha256)throw new Error('Native audio hash mismatch '+clip.id);
  const a={kind:'native',id:clip.id,url:'/api/v1/authentic/audio/'+clip.id,text:'真人原声',duration:clip.media.duration,source:clip.source?.attribution||clip.source?.url||'',description:clip.audio_description_zh||clip.source?.processing||''};
  const cards=(clip.transcript||[]).map(t=>card(t.cs,t.zh,{...a,start:t.start||0,end:t.end},{note:t.note_zh,speaker:t.speaker||''}));
  const tasks=[step('source','接通城市电台',{prompt:[clip.context_zh,clip.focus_zh].filter(Boolean).join('\n'),audio:a,cards,source:clip.source,scope:clip.scope_zh||'',skills:['listening']})];
  tasks.push(...nativeListeningChecks(clip,a));
  for(const q of clip.question_details||[]){tasks.push(work('把听到的关系说清楚',q.prompt_zh,'',(q.answer_points_zh||[]).concat(q.limits_zh?[q.limits_zh]:[])));}
  if(!clip.question_details?.length)for(const q of clip.questions||[])tasks.push(work('把听到的关系说清楚',typeof q==='string'?q:q.prompt_zh||JSON.stringify(q),'',clip.key_points||[]));
  for(const d of clip.deep_dive||[]){if(typeof d==='object')tasks.push(learn(d.title_zh||'比对关键线索',[card('',d.analysis_zh||d.explanation_zh||JSON.stringify(d))]));}
  for(const prompt of clip.transfer||[])tasks.push(work('换个对象，重新表达',typeof prompt==='string'?prompt:JSON.stringify(prompt),'',clip.key_points||[]));
  if(tasks.length===1)tasks.push(work('向没听过的人说明','用自己的话说明人物、目的、限制与最后安排，听不清的内容留问号。','',clip.key_points||[]));
  missions.push({id:'N-'+clip.id,level:clip.target_level||clip.level||l.level,title:clip.title_zh,goal:clip.focus_zh||'听清真实语流，保留关键条件。',story:clip.context_zh||'一段真实声音带来新的城市线索。',npc:'城市电台',location:'社区',native:true,lesson_id:l.id,lesson_version:l.version,knowledge_points:l.knowledge_points,prerequisites:[],reward:'原声线索与自己的转述已收入作品册。',tasks});
}

const caseLesson=byId.get('C2-U02-L01');
const caseCards=[card('Město zatím nerozhodlo. O návrhu se bude dále jednat.','市政府尚未作出决定。提案还将继续讨论。',null,{speaker:'公开说明'}),card('Souhlasil bych, kdyby zůstal zachován volný přístup pro obyvatele.','如果能保留居民自由进入的条件，我会赞同。',null,{speaker:'居民留言'}),card('Ne všichni účastníci návrh podpořili. Konkrétní poměr hlasů zveřejněn nebyl.','并非所有参与者都支持提案。具体票数比例没有公开。',null,{speaker:'联络邮件'})];
const comparison=native.find(c=>c.id==='public-quotation-commitment');if(!comparison)throw Error('Missing genuine quotation comparison');
const caseAudio={kind:'native',id:comparison.id,url:'/api/v1/authentic/audio/'+comparison.id,text:'真实公开发言 · 独立对照',duration:comparison.media.duration,source:comparison.source.attribution,description:comparison.source.processing};
const caseSources=caseCards.map((c,i)=>({...c,id:['public','resident','mail'][i],label:c.speaker,kind:'document',scope:'虚构社区案例中的文件'})).concat([{id:'recording',label:'真实公开发言',kind:'audio',scope:'独立对照：另一事件的历史发言，不能证明社区案发生过什么',cs:comparison.transcript.map(t=>t.cs).join(' '),zh:comparison.transcript.map(t=>t.zh).join(' '),audio:caseAudio,source:comparison.source}]);
const evidence=(title,prompt,claim_cs,claim_zh,source,relation,explanation,extra={})=>step('evidence',title,{prompt,claim_cs,claim_zh,sources:caseSources.map(s=>s.id),answer:{source,relation},explanation,...extra});
missions.push({id:'C2-CITY-CASE',level:'C2',title:'终章 · 谁真正答应了什么',goal:'区分公开说法、附带条件与推断；综合多源材料并准确转述。',story:'一处社区空间拟调整用途。公开说明、居民留言和联络邮件并不完全一致，你要帮各方厘清真正已经确认的内容。虚构学习案例，不是实时新闻。',npc:'城市联络员彼得',location:'社区',case_board:{sources:caseSources,notice:'前三份是虚构社区文件。真实公开发言来自另一事件，只作独立语言对照，不能拿它证明社区提案的结果。'},lesson_id:caseLesson.id,lesson_version:caseLesson.version,knowledge_points:['scope-negation','qualification','mediation'],prerequisites:[],reward:'你留下了一份有来源、有限定、能回应追问的捷语说明。',tasks:[
  step('source','把三份文件放上证据板',{prompt:'分别记录原话、由原话能推出什么、还缺什么。中文翻译属于帮助，需要时再展开。',cards:caseCards}),
  evidence('别把“并非全体”写成“全体反对”','哪份材料最直接限定了这句话的范围？把说法连过去，再判断关系。','Všichni účastníci byli proti návrhu.','所有参与者都反对提案。','mail','unsupported','邮件只说并非所有人支持；不能推出全体反对，也不能编造支持、反对或弃权的具体人数。'),
  evidence('保住居民的前提','找到居民立场的依据，判断这句话是否保留了他的前提。','Obyvatel by návrh podpořil, kdyby zůstal zachován volný přístup.','居民会在自由进入得到保留的条件下支持提案。','resident','conditional','Souhlasil bych, kdyby… 保留假设和条件。这里的支持并不是无条件、已经落实的同意。'),
  evidence('分清“尚未”与“已经”','按公开说明发出时的信息，下面这句话与哪份材料直接冲突？','Město už rozhodlo.','市政府已经作出了决定。','public','contradicted','在同一时点，zatím nerozhodlo 是尚未决定，与已经决定相反。这个判断不代替后来可能发生的变化。'),
  evidence('承诺提出，不等于已经生效','这是独立的真实发言对照。先听说话者引用协议，再判断仅凭这段话能否认定法律已生效。','Zákon už platí.','法律已经生效。','recording','unsupported','Předložíme návrh 表达将提出草案；引文属于所引协议的承诺。片段没有交代后来是否通过、何时生效，不能把承诺压成实施结果。',{audio:caseAudio,requires_audio:true,transfer:true}),
  work('替缺席者解释情况','用捷语综合三份材料，分别说明已知内容、附带条件和仍未知的内容。','Město zatím nerozhodlo. Podpora jednoho obyvatele je podmíněna volným přístupem. Návrh nepodpořili všichni, ale přesný poměr hlasů neznáme.',['不把尚未决定改成已决定','保留居民的条件','不把非全体支持改成全体反对','不编造票数']),
  work('回应一次新的追问','对方问：Takže to už všichni odmítli? 请用捷语澄清，指出这句话超出了哪份材料能证明的范围。','Ne. Víme jen, že návrh nepodpořili všichni. Neznamená to, že byli všichni proti.',['明确否定错误推论','说清原材料的范围','语气适合澄清而不是指责']),
  work('换成一份正式说明','把自己的口头解释改写成面向公众的简洁捷语文字。信息不能因压缩而失真。','O návrhu se dále jedná. Město zatím nerozhodlo. Postoje účastníků nebyly jednotné; přesný poměr podpory a nesouhlasu nebyl zveřejněn.',['前后信息一致','正式且清楚','限定与不确定仍在','允许多种自然表达'])]});

const fieldAudio=read('game/field-audio.v4.json');
const fieldCases=foundationFieldCases(missions,Object.fromEntries(fieldAudio.items.map(a=>[a.id,a])));
for(const a of fieldCases.audio_scripts){const row=fieldAudio.items.find(r=>r.id===a.id);if(!row)throw Error('Missing new field audio '+a.id);for(const speed of ['normal','slow']){const file=path.join(root,'app/public/game/audio/field-v1',a.id+'-'+speed+'.mp3');if(!fs.existsSync(file)||hash(fs.readFileSync(file))!==row[speed+'_sha256'])throw Error('Field audio not verified '+a.id);}}
const delivery=deliveryStory(missions.find(m=>m.id==='G-A1-U09-L01'),Object.fromEntries(fieldAudio.items.map(a=>[a.id,a])));
for(const a of deliveryAudioScripts()){const row=fieldAudio.items.find(r=>r.id===a.id);if(!row)throw Error('Missing journey audio '+a.id);for(const speed of ['normal','slow'])if(hash(fs.readFileSync(path.join(root,'app/public/game/audio/field-v1',a.id+'-'+speed+'.mp3')))!==row[speed+'_sha256'])throw Error('Journey audio mismatch '+a.id);}
missions.push(...fieldCases.missions,delivery.mission);
const district=districtStory(missions,Object.fromEntries(fieldAudio.items.map(a=>[a.id,a])));
for(const a of districtAudioScripts(missions.find(m=>m.id==='F01'))){const row=fieldAudio.items.find(r=>r.id===a.id);if(!row)throw Error('Missing district audio '+a.id);for(const speed of ['normal','slow'])if(hash(fs.readFileSync(path.join(root,'app/public/game/audio/field-v1',a.id+'-'+speed+'.mp3')))!==row[speed+'_sha256'])throw Error('District audio mismatch '+a.id);}
missions.push(district.mission);
const a1Returns=a1ReturnCases(missions,Object.fromEntries(fieldAudio.items.map(a=>[a.id,a])));
for(const a of a1ReturnAudioScripts()){const row=fieldAudio.items.find(r=>r.id===a.id);if(!row)throw Error('Missing A1 return audio '+a.id);for(const speed of ['normal','slow'])if(hash(fs.readFileSync(path.join(root,'app/public/game/audio/field-v1',a.id+'-'+speed+'.mp3')))!==row[speed+'_sha256'])throw Error('A1 return audio mismatch '+a.id);}
missions.push(...a1Returns.missions);
const routeOrder=m=>m.district?-70:m.foundation?-100+Number(m.id.slice(1)):m.learning_parent?/^F\d+$/.test(m.learning_parent)?-60+Number(m.learning_parent.slice(1)):(byId.get(m.lesson_id)?.order||0)*10+.5:m.id.startsWith('T-')?1e8:m.id==='C2-CITY-CASE'?1e8+1:(byId.get(m.lesson_id)?.order||0)*10+(m.native?1:0);
missions.sort((a,b)=>LEVELS.indexOf(a.level)-LEVELS.indexOf(b.level)||routeOrder(a)-routeOrder(b));
const taskIds=new Set();for(const m of missions){const repeated=new Map();for(const t of m.tasks){const fingerprint=hash(canonical(taskBody(t))),n=(repeated.get(fingerprint)||0)+1;repeated.set(fingerprint,n);t.fingerprint=fingerprint;t.id=m.id+'-t-'+fingerprint.slice(0,16)+(n>1?'-'+n:'');if(taskIds.has(t.id)||!/^[A-Za-z0-9_-]{1,120}$/.test(t.id))throw new Error('Invalid or duplicate stable task ID: '+t.id);taskIds.add(t.id);}}
const catalog={version:GAME_VERSION,title:'捷语人生',style:'B-pixel-adventure',worlds,missions,learning_contexts:[...fieldCases.contexts,...delivery.contexts,...district.contexts,...a1Returns.contexts],knowledge:lessons.flatMap(l=>l.grammar.map(g=>({...g,lesson_id:l.id,lesson_version:l.version,level:l.level}))),source_counts:{lessons:lessons.length,assessments:assessments.length,native_clips:native.length},created_from:'versioned existing curriculum + authored foundation + authored street cases + authored C2 case'};
catalog.learning_paths=buildLearningPaths(catalog,lessons,assessments);
const dir=path.join(content,'game');fs.mkdirSync(dir,{recursive:true});
if(!process.argv.includes('--check'))fs.writeFileSync(path.join(dir,'catalog.json'),JSON.stringify(catalog,null,2));
console.log(JSON.stringify({version:catalog.version,missions:missions.length,tasks:missions.reduce((n,m)=>n+m.tasks.length,0),worlds:worlds.map(w=>({level:w.id,missions:missions.filter(m=>m.level===w.id).length})),output:path.join(dir,'catalog.json')}));
