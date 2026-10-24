import {createHash} from 'node:crypto';
const sounds=new Map();
function voice(text){const id='field-'+createHash('sha256').update(JSON.stringify({text})).digest('hex').slice(0,16);sounds.set(id,{id,text});return {id,text,status:'generated',file_url:`/game/audio/field-v1/${id}-normal.mp3`,slow_file:`/game/audio/field-v1/${id}-slow.mp3`,voice:'cs_CZ-jirka-medium',quality_status:'machine_checked_not_native_listened'};}
const card=(cs,zh)=>({cs,zh,audio:voice(cs)});
const option=(id,text_cs,text_zh,next,feedback_zh)=>({id,text_cs,text_zh,next,feedback_zh});
const square=(cs,zh,xy)=>({id:'ipr:4211',cs,zh,xy,radius:24});
const cases=[
 {unit:'01',title:'新邻居把你认成了别人',npc:'jana',name:'Jana · 雅娜',target:square('Malostranské náměstí','小城区广场的雅娜',[-1733,-1478]),
  cards:[['Dobrý den. Jmenuji se Jana.','您好。我叫雅娜。'],['Jsem vaše nová sousedka.','我是您的新邻居。'],['Nejsem z Brna. Jsem z Prahy.','我不是布尔诺人。我来自布拉格。']],
  rule:'Jsem表示我是；nejsem表示我不是。先听清谁在说话，再认身份。z Prahy说来自布拉格，不等于她交代了现在的具体住址。第一次见面先用Dobrý den。',
  question:'雅娜说自己来自哪里？只按便条，不猜住址。',options:[{id:'right',text:'Z Prahy. · 来自布拉格'},{id:'wrong',text:'Z Brna. · 来自布尔诺'}],explanation:'她先否定z Brna，再说z Prahy；不能把被否定的城市当答案。',
  line:['Jste pan Novák?','您是诺瓦克先生吗？'],right:['Ne, nejsem pan Novák. Jmenuji se Li.','不，我不是诺瓦克先生。我姓李。'],wrong:['Ano, jsem pan Novák.','对，我是诺瓦克先生。'],repair:['Promiňte. Jak se jmenujete?','抱歉。您叫什么名字？'],fix:['Jmenuji se Li.','我姓李。'],end:['Těší mě, pane Li.','很高兴认识您，李先生。'],
  work:'换成你自己的身份向这位新邻居打招呼。不照抄雅娜的姓名或出生地；可以用Li表示李。两句就够，不替你填真实住址。',model:'Dobrý den. Jmenuji se Li. Jsem z Číny.',rubric:['说自己的名字，而不是把雅娜当成自己。','用jsem/nejsem说明身份，不顺着错误称呼答应。','有礼貌地开场；不确定的表达留作自查。']},
 {unit:'02',title:'要的是新地图，不是旧计划',npc:'petr',name:'Petr · 彼得',target:{id:'czlife:mostecka',cs:'Mostecká',zh:'莫斯特街的彼得',xy:[-1456,-1254],radius:24},
  cards:[['Tohle je nová mapa.','这是一张新地图。'],['Tohle je starý plán.','这是一份旧计划。'],['Nová mapa je pro Janu.','新地图是给雅娜的。']],
  rule:'这两样东西分开记：ta nová mapa（阴性），ten starý plán（阳性非生物）。先把指示词、形容词和名词成组看，别只凭中文“这个”猜。这里练主格短句，不突然要求你生成没学过的宾格。',
  question:'你要拿的是那张新地图，哪张标签是一整组搭配？',options:[{id:'right',text:'ta nová mapa'},{id:'wrong',text:'ten nový mapa'}],explanation:'mapa是阴性，这组用ta nová，不是ten nový。plán才是这里另一件阳性名词。',
  line:['Tady je ten nový plán.','这是那份新计划。'],right:['Ne, ta nová mapa, prosím.','不是，请给我那张新地图。'],wrong:['Ano, ten starý plán.','对，那份旧计划。'],repair:['Mapa, nebo plán?','地图，还是计划？'],fix:['Ta nová mapa.','那张新地图。'],end:['Tady je ta nová mapa pro Janu.','这是给雅娜的那张新地图。'],
  work:'给不在场的朋友留下两句纸条，把新地图和旧计划说清楚。保留不同的名词搭配，不只是选出一个词。',model:'Ta nová mapa je pro Janu. Ten starý plán je pro Petra.',rubric:['ta nová mapa与ten starý plán成组对应。','把两件东西区别清楚，不把计划说成地图。','自己组织两句；参考后重写标记为借助帮助。']},
 {unit:'03',title:'你在学捷语，彼得在做什么',npc:'tomas',name:'Tomáš · 托马什',target:square('Malostranské náměstí','小城区广场档案室门前的托马什',[-1972,-1420]),
  cards:[['Ráno pracuji na nádraží.','我早上在车站工作。'],['Odpoledne mám čas.','我下午有空。'],['Teď čekám na Janu.','我现在在等雅娜。'],['Petr dnes pracuje v obchodě.','彼得今天在商店工作。'],['Já se učím česky.','我在学捷语。'],['Ptám se na tebe.','我问的是你。']],
  rule:'这份话由Tomáš说：pracuji/čekám是“我”，Petr pracuje是“彼得”。先找说话人和主语，再看词尾，别看见pracu-就把“他”答成“我”。učím se作为完整搭配学。',
  question:'按托马什这份留言，现在谁在等雅娜？',options:[{id:'right',text:'Tomáš · 托马什'},{id:'wrong',text:'Petr · 彼得'}],explanation:'Teď čekám里的“我”是留言者Tomáš；Petr那句只交代今天在商店工作。',
  line:['Pracuješ dnes v obchodě?','你今天在商店工作吗？'],right:['Ne, dnes se učím česky.','不，我今天在学捷语。'],wrong:['Ano, Petr pracuje v obchodě.','是的，彼得在商店工作。'],repair:['Ptám se na tebe.','我问的是你。'],fix:['Já se učím česky.','我在学捷语。'],end:['Dobře, ty se učíš česky.','明白，你在学捷语。'],
  work:'把自己正在做的事和彼得的事分别告诉托马什。允许使用游戏设定“我在学捷语”，不要答非所问。',model:'Já se učím česky. Petr dnes pracuje v obchodě.',rubric:['自己与彼得的主语区分清楚。','učím se与pracuje的人称对应，不只堆名词。','能用自己的两句话转述，而非系统自动判为口语掌握。']},
 {unit:'04',title:'今天不能来，明天再约',npc:'eva',name:'Eva · 伊娃',target:square('Malostranské náměstí','小城区广场的伊娃',[-1925,-1348]),
  cards:[['Dnes nemůžu přijít.','我今天不能来。'],['Můžeme zítra?','我们明天可以吗？'],['Zítra mám čas.','我明天有空。']],
  rule:'dnes是今天，zítra是明天。nemůžu是否定的“我不能”，不是“我不想”。先分清日期与否定，再做安排；问句Můžeme zítra?是在提议，不代表对方已经答应。',
  question:'伊娃的留言里，哪一天不能来？',options:[{id:'right',text:'Dnes. · 今天'},{id:'wrong',text:'Zítra. · 明天'}],explanation:'Dnes nemůžu否定今天；Zítra mám čas说明明天有空。不能漏掉ne-或把日期互换。',
  line:['Takže dnes?','所以是今天？'],right:['Ne, zítra, prosím.','不是，请安排明天。'],wrong:['Ano, dnes.','对，今天。'],repair:['Zítra, ne dnes.','明天，不是今天。'],fix:['Zítra.','明天。'],end:['Dobře, zítra.','好，明天。'],
  work:'换成你来婉拒今天的安排，再问能否改到明天。不替对方写一个还没发生的承诺。',model:'Dnes nemůžu přijít. Můžeme zítra?',rubric:['否定今天，日期不混淆。','能提出明天的请求，而不把提议写成对方已答应。','完整表达自己的安排；需要的帮助如实保留。']},
 {unit:'05',title:'三只杯子，不是两只',npc:'petr',name:'Petr · 彼得',target:square('Malostranské náměstí','小城区杯子店门前',[-1810,-1478]),
  cards:[['Jeden hrnek stojí sedmdesát pět korun.','一只杯子七十五克朗。'],['Prosím tři hrnky.','请给我三只杯子。'],['Dva hrnky nestačí.','两只杯子不够。'],['Platím dvě stě dvacet pět korun.','我付二百二十五克朗。']],
  rule:'先确定hrnek是杯子，再听tři（三）和sedmdesát pět（75）。一只75，三只225。三只用tři hrnky；这里的价格只是游戏价牌，别沿用前一个委托的60或45。',
  checkout:true,line:['Máte dva hrnky?','您拿了两只杯子吗？'],right:['Ne, mám tři hrnky.','不是，我拿了三只杯子。'],wrong:['Ano, dva.','是的，两只。'],repair:['Na objednávce jsou tři hrnky.','订单上是三只杯子。'],fix:['Mám tři hrnky.','我拿了三只杯子。'],end:['Ano, tři hrnky. Dvě stě dvacet pět korun.','对，三只杯子。二百二十五克朗。'],
  work:'给另一位顾客解释你这单拿了什么、几只、单价或总价。自己说两三句，不只提交一个数字。',model:'Mám tři hrnky. Jeden hrnek stojí sedmdesát pět korun. Celkem dvě stě dvacet pět korun.',rubric:['物品是杯子，数量是三只。','75单价与225总价关系清楚，不套用旧委托。','用自己的话解释；结账正确不等于自由表达自动达标。']},
 {unit:'06',title:'周三晚上，别晚到一小时',npc:'tomas',name:'Tomáš · 托马什',target:square('Malostranské náměstí','小城区广场档案室门前的托马什',[-1972,-1420]),
  cards:[['Ve středu večer mám čas.','我周三晚上有空。'],['Sejdeme se v půl osmé.','我们七点半见。'],['To je v devatenáct třicet.','也就是十九点三十分。'],['Čekám u vchodu do archivu.','我在档案室入口等。']],
  rule:'půl osmé是向八点走到一半，即7:30，不是8:30。留言明确说večer（晚上），因此是19:30，不是早上7:30。ve středu是周三；地点是游戏档案室门口，不代表真实营业预约。',
  question:'托马什明确约的是周三晚上，v půl osmé对应几点？',options:[{id:'right',text:'19:30 · 晚上七点半'},{id:'wrong',text:'20:30 · 晚上八点半'}],explanation:'půl osmé按“向八点走到一半”理解，晚上就是19:30。不能按中文“八点半”直译。',
  line:['Ve čtvrtek v osm?','周四八点？'],right:['Ne, ve středu v půl osmé.','不是，周三七点半。'],wrong:['Ano, ve čtvrtek v osm.','对，周四八点。'],repair:['Ve středu. V devatenáct třicet.','周三。十九点三十分。'],fix:['Ve středu v půl osmé.','周三七点半。'],end:['Dobře. Ve středu v půl osmé.','好。周三七点半。'],
  work:'给托马什写一句或两句确认，必须保留星期、晚上的时间和见面地点。这只是游戏约定，不替你创建真实日程。',model:'Ve středu večer v půl osmé. U vchodu do archivu.',rubric:['保留周三，纠正周四。','晚上půl osmé对应19:30，不是20:30。','保留档案室入口；参考仅用于自查，不冒充掌握。']}
];

function buildCase(c){
 const context=`A1-RETURN-${c.unit}`,shared={learning_context:context,learning_phase:'return'},arrival={key:'meet-walk',kind:'arrival'},place={...c.target,via:'meet-walk'};
 const checkpoint=c.checkout?{key:'check',kind:'checkout',room_scene:'cup-shop',shop:{item:'hrnek',max_quantity:3,unit_price:75},at_place:place,title:'听委托，实际取三只杯子结账',prompt:'先听委托，再到货架拿杯子，走到柜台填总价。不要只看旧草稿直接确认。',audio:voice('Tři hrnky, prosím.'),requires_audio:true,answer:{quantity:3,total:225},requires:[arrival]}:{key:'check',kind:'choice',title:'先从新留言找对信息',prompt:c.question,options:c.options,answer:'right',explanation:c.explanation,requires:[arrival]};
 const dialogue={key:'talk',kind:'dialogue',title:'对方问错了，自己澄清',prompt:'对方可能把条件问反。听一句、回应一句，选错后再澄清，不必重新猜整段。',start:'check',at_place:place,requires:c.checkout?[{key:'check',kind:'checkout'}]:[arrival],...(c.checkout?{room_scene:'cup-shop'}:{}),nodes:[
  {id:'check',speaker_cs:c.line[0],speaker_zh:c.line[1],audio:voice(c.line[0]),choices:[option('correct',...c.right,'done','信息说明白了。再试着不用选项表达一次。'),option('wrong',...c.wrong,'repair','这句没有把条件说对。听对方再确认，纠正后继续。')]},
  {id:'repair',speaker_cs:c.repair[0],speaker_zh:c.repair[1],audio:voice(c.repair[0]),choices:[option('correct',...c.fix,'done','你把误会澄清了。引导沟通与独立作品分别留档。')]},
  {id:'done',speaker_cs:c.end[0],speaker_zh:c.end[1],choices:[]}
 ]};
 return {id:`A1-RETURN-${c.unit}`,learning_parent:`G-A1-U${c.unit}-L01`,level:'A1',sidequest:true,attempt_drafts:true,title:c.title,goal:'换一份留言、一个条件，把学过的规律用在实际街区行程和沟通里。',story:'这是虚构的布拉格邻里委托，实际道路与教学故事分开。先读短留言，再沿街见人，最后留下自己的话。',npc:c.name,location:c.target.zh,prerequisites:[`G-A1-U${c.unit}-L01`],reward:'新条件下的识别、到场、引导沟通、开放表达分别保存。',city_excursion:{npc_id:c.npc,walk_key:'meet-walk'},tasks:[
  {key:'new-note',kind:'source',title:'先读一份不同的短留言',prompt:'每句可以单独听。先找说话人、否定和条件，再把这份新留言用到街上。',cards:c.cards.map(x=>card(...x)),rule:c.rule},
  {key:'meet-walk',kind:'travel',title:'沿街走到伙伴身边',prompt:`按真实道路走到${c.target.zh}。可以拖动观察路，再点沿街走向目标；站到身边才确认抵达。`,travel:{target:c.target}},checkpoint,dialogue,
  {key:'my-words',kind:'work',title:'不用选项，留下自己的话',prompt:c.work,model:c.model,rubric:c.rubric,requires:[{key:'talk',kind:'dialogue',terminal:'done'}]}
 ].map(t=>({...shared,...t}))};
}
const missions=cases.map(buildCase);
export const a1ReturnAudioScripts=()=>[...sounds.values()];
export function a1ReturnCases(parents,index){
 const result=structuredClone(missions);for(const m of result){const parent=parents.find(p=>p.id===m.learning_parent);if(!parent)throw Error('Missing A1 parent '+m.learning_parent);m.lesson_id=parent.lesson_id;m.lesson_version=parent.lesson_version;
  const annotate=v=>{if(!v||typeof v!=='object')return;if(v.id?.startsWith('field-')){if(!index[v.id])throw Error('Missing A1 audio '+v.id);v.duration=index[v.id].normal_seconds;}for(const x of Object.values(v))if(x&&typeof x==='object')Array.isArray(x)?x.forEach(annotate):annotate(x);};annotate(m);
 }return {missions:result,contexts:result.map(m=>({id:m.id,parent:m.learning_parent,phase:'return',title:m.title,source:'New authored fictional Prague message and repair dialogue; existing real street geometry; synthetic Czech voice, not native original audio'}))};
}
