// Authored checks on the SAME existing recording. Not new-material retention,
// a new recording, or an automatic CEFR assessment.
const e=(index,quote)=>({index,quote});
const q=(key,prompt,correct,wrong1,wrong2,evidence,explanation)=>({key,prompt,correct,wrong1,wrong2,evidence,explanation});
const checks={
 'native-groceries':[
  q('final-buyer','把提议和最终安排分开：最后谁说由自己来买家里要用的东西？','先问买没买的人（A）。','说自己会晚到家的人（B）。','已经约定两人一起去商店。',[e(7,'TAK JÁ JÁ JÁ NAKOUPIM VĚCI DOMŮ')],'最后的我来买出现在A的话轮；B先前说也可以一起买，不是最终安排。'),
  q('arrival-scope','对较晚到家的时间，哪种转述保留了说话者的把握程度？','大概要到九点左右，还不确定。','已经保证九点整到家。','对方明确说九点之前一定到。',[e(5,'NO NEVÍM TAK KOLEM DEVÁTÝ AŽ')],'nevím与kolem一起限制了时间；不能把约数说成保证。')],
 'native-online-shop':[
  q('reported-source','“在美国买更便宜”在这段谈话里来自哪里？','B转述工作场合听来的说法。','A出示了包含运费的报价对比。','网站客服当场确认了最低总价。',[e(2,'V PRÁCI HOLKY'),e(3,'PRÝ KOUPIT V AMERICE')],'prý和工作场合的说法保留了听说链条；片段没有完整报价。'),
  q('impression-limit','A谈到页面里的汉字和自己英语水平，这能支持哪种转述？','A解释自己为什么看着觉得奇怪。','已经核实网站一定不可靠。','B承诺这个网站总是最便宜。',[e(7,'SE PŘIZNÁM'),e(7,'STRÁNKY JSOU VŮBEC TAKOVÝ JAKO DIVNÝ')],'这是A对自身理解与页面观感的说明，不能直接改成商家核验结果。')],
 'native-traffic':[
  q('cause-source','车多与长周末之间的联系，首先被怎样提出？','说话者表示这是自己的想法。','车站广播证实了所有堵车原因。','司机公开承认自己造成了拥堵。',[e(1,'SI MYSLÍM')],'myslím把原因放在个人归因层，不是广播已经核实的原因。'),
  q('broadcast-action','按转述的车站广播，原来的巴士卡在高速上之后会怎样？','由另一辆巴士替代运行。','广播保证十分钟内抵达。','所有班次已经永久取消。',[e(5,'MÍSTO NĚJ POJEDE JINEJ')],'jinej在此省略了巴士这个名词；广播转述没有给出精确到站时刻。')],
 'native-long-navigation':[
  q('expected-sign','返程时，她一直等着看到什么标识，而实际说只看到了Brno？','Městský okruh · 城市环线。','Letiště · 机场。','Radotín · 拉多廷已经明确写出。',[e(14,'NAPSÁNO MĚSTSKÝ OKRUH'),e(15,'JENOM BRNO')],'分清她当时期待的文字与实际看见的标识，不把两者互换。'),
  q('changed-decision','错过出口后，她说自己接着怎样决定？','第三个出口先下，不再等特定地名。','继续一直等到出现机场标识。','决定按原路在同一处立即左转。',[e(21,'TŘETÍ SJEZD SJEDU AŤ JE TO CO JE TO'),e(22,'DO PRAHY UŽ TO NEPUDE')],'这是叙述者当时改变策略的回顾，不是今天的导航路线建议。')],
 'native-long-weather-trip':[
  q('personal-choice','谈到Truba塔顶时，哪件事是说话者明确说明的？','她没有登顶，提到有130级台阶。','全团都登上塔顶，没有例外。','她说塔有30级台阶并已登顶。',[e(12,'TAK JSEM NEŠLA BO TAM JE STO TŘICET SCHODŮ')],'想上去的人与我没去分开；不能把集体出游说成人人登顶。'),
  q('planned-actual','把计划与后来补充的实际出发时间对上。','原定14:30，后来说明14:15已出发。','原定14:15，实际14:30才出发。','两次都明确说15:30，没有变化。',[e(25,'ODJEZD V PŮL TŘETÍ'),e(26,'VE ČTVRT NA TŘI ODJÍŽDĚLI')],'půl třetí是14:30；čtvrt na tři是14:15。后一句补的是实际出发。')],
 'native-long-callback':[
  q('callback-sequence','按这段旧通话中的说明，挂断初次拨号后，下一段流程是什么？','程序回拨，再提示输入真正要联系的号码。','先直接把目标号码当服务号码发布。','挂断后通话流程就永久结束。',[e(3,'ZAVĚSÍŠ'),e(4,'ČÍSLO TI NAJEDNOU ZAVOLÁ'),e(4,'ČÍSLO KTERÝ CHCEŠ SKUTEČNĚ VOLAT')],'服务号码和最终联系人的号码不是同一个角色；这里是在理解原说明。'),
  q('time-limit','说话者给这次免费通话描述了什么限制？','八分钟以内，临近结束会提示剩半分钟。','无限时，而且没有任何提示。','只能半分钟，八分钟后才开始计时。',[e(23,'DO OSMI MINUT'),e(23,'ZA PŮL MINUTY')],'八分钟是描述的通话上限；半分钟是提示后所剩的时间，不把两个数字倒置。')],
 'native-long-workshop':[
  q('uncertain-criticism','关于自己讲得太多，她怎样修正先前的判断？','也许别人提到了，也许只是自己这样理解。','全体参与者都明确提出了书面批评。','她确定没有说过任何话。',[e(4,'MOŽNÁ NEBYLO JÁ NEVÍM'),e(5,'MOŽNÁ JSEM SI TO TAK JENOM VZALA')],'两次možná和nevím保留不确定；不能把自我理解改成全体明确评价。'),
  q('reading-time','对方问什么时候读书，她给了什么实际安排？','抽零碎时间，例如饭后去椅子上读一会儿。','每天完整空出四小时，其他事都不做。','必须等整个活动全部结束才能读。',[e(11,'VŽDYCKY CHVÍLAMA'),e(11,'PO JÍDLE')],'回答围绕零碎空档和饭后，不是完整连续的大块时间。')],
 'native-long-sharing':[
  q('sharing-scope','另一位听到“分享/组织”的建议后，怎样明确了自己想的范围？','只是房间内部。','已经确定面向整个城市公开。','已决定在全校公共网站发布。',[e(16,'JENOM V RÁMCI POKOJE')],'纠正后的范围是房间；nasdílet本身不能证明某个平台已经上线。'),
  q('take-turn','在COŽE CO之后，对方说还想告诉她一些事。这段插话在沟通中做了什么？','争取把话轮拿回来，说明自己还有话要说。','确认所有方案已经完全达成一致。','提供了一个正式的共享平台网址。',[e(13,'JÁ JSEM SE TI CHTĚL JEŠTĚ NĚCO ŘÍCT')],'抓住想再说点事这一沟通动作；不要把争取话轮听成已经同意全部方案。')],
 'native-long-traffic':[
  q('waiting-activity','在谈到路况前，乘车的人说自己正在学哪门语言？','Němčinu · 德语。','Angličtinu · 英语。','Češtinu · 捷语。',[e(3,'UČÍM NĚMČINU')],'这句明确是němčinu，不要只凭课程名称猜成捷语。'),
  q('driver-uncertainty','关于司机为什么没有按所说的时刻发车，哪种转述保留了原话的证据边界？','说话者推测司机可能没留意，并多次表示不知道。','司机已亲自承认自己忘记时刻。','车站广播已经核实司机的全部原因。',[e(20,'NEVÍM MYSLIM SI'),e(20,'NEPOSTŘEHL ŽE MĚL VYJET VE ČTYŘI'),e(23,'TO JÁ PRÁVĚ NEVÍM')],'时刻描述和为何如此的推测分开；不能把myslím si、nevím改成司机承认。')],
 'native-long-briefing':[
  q('meeting-topic','被称作会面/培训的活动，具体在说明什么操作？','把比赛成绩录入对方的数据库。','如何给手机安装导航程序。','如何组织一门德语课程。',[e(22,'JAK ZADÁVAT TY VÝSLEDKY'),e(22,'DATABÁZE')],'说话者具体说的是成绩和数据库录入；引号里的活动名称不能替代具体内容。'),
  q('unfinished-ending','结尾说到数据库和试运行时，哪种摘要最稳妥？','提到会做一些修改，但话没说完，具体清单不能补造。','所有修改已经完成并正式验收。','数据库已决定永久停用。',[e(40,'SE TEDA V TÉ DATABÁZI UDĚLAJÍ ŇÁKÉ'),e(40,'PILOTNÍ PROVOZ')],'这里有将来的修改说法和未接完的话头；不能扩成已完工的明细。')],
 'public-stance-change':[
  q('past-now','发言者为什么把过去和现在放在一起？','过去至少两次提过提高缴付，现在却强烈反对。','过去从未提过这个问题，现在首次表示支持。','过去和现在都只说自己无法判断。',[e(0,'minimálně dvakrát'),e(0,'nyní'),e(0,'proti')],'长定语先交代过去，nyní才回到现在的对比；这是发言者提出的质疑。'),
  q('minimum-count','只按minimálně dvakrát，次数能怎样报告？','至少两次，不能断言恰好只有两次。','总共恰好两次，没有更多。','不足两次。',[e(0,'minimálně dvakrát')],'minimálně给的是下限，不是封闭的精确总数。')],
 'public-unsaid-allusion':[
  q('allusion','说自己现在不提某些事情，在这句话里产生了什么效果？','仍然把听者注意力引向那些事情。','完全没有引向任何当前话题。','已经完整列出了所有当前事件的细节。',[e(0,'nedopustím faulu'),e(0,'připomínal některé současné věci')],'说不提同时制造了指向，并不等于给出了事件的完整证据。'),
  q('evidence-limit','这段话本身能够支持哪种记录？','发言者作了暗示，但没有具体展开当前事件。','录音已经证明了所有被暗示事情的细节。','发言者已宣读一份完整调查结论。',[e(0,'některé současné věci')],'některé和未展开的指代保留了空缺；不能替他补成调查事实。')],
 'public-company-analogy':[
  q('recall-cost','在发言者使用的公司类比里，召回费用由谁承担？','公司自行承担。','句中明确说由客户全部承担。','句中明确说费用根本不存在。',[e(0,'na vlastní náklady')],'vlastní náklady对应公司自己的费用；这仍是其用于论证的类比。'),
  q('only-after','teprve když为恢复运行设置了什么先后关系？','先完全改好，之后才能再次飞行。','先恢复飞行，最后才考虑问题。','只要宣布召回，就已证明一切完善。',[e(0,'teprve když je to naprosto dokonalé')],'teprve把后一行动放到条件满足之后，不能反转顺序。')],
 'public-counterfactual':[
  q('inserted-negation','插入的jako že to možné není怎样限制前面的假设？','他明确补充说这种做法实际上并不可行。','他已确认这种做法可以立刻实施。','他只是重复一个金额。',[e(0,'jako že to možné není')],'i kdyby让步假设不等于承认可能；插入句又明确否定了可行性。'),
  q('affected-groups','按发言者对假设后果的判断，哪组对应正确？','伤害已准备的人，却帮助了放任不管的人。','帮助已准备的人，惩罚放任不管的人。','他明确说两组人都不会受到影响。',[e(0,'poškodili ty, kteří'),e(0,'pomohli bychom těm')],'两个关系从句分别接受损与得益的对象；后果仍是他的假设性判断。')],
 'public-numbers-uncertainty':[
  q('range','怎样保留金额与插话里的不确定？','约14万到16万克朗的区间。','已确定恰好15万克朗。','每个月都明确支付16万克朗。',[e(0,'od 140 tisíc do'),e(0,'já nevím'),e(0,'160 tisíc')],'录音给区间并插入不知道，不应擅自取中点当已确认金额。'),
  q('recipient-duration','听清谁收款和四个月的作用，哪种记录正确？','说的是付给实施项目的公司，涉及四个月期间。','说的是当事人每个月直接领取同一笔总额。','说的是公司只工作四天。',[e(0,'Stát proplatil firmám'),e(0,'čtyři měsíce')],'fir­mám是收款对象，四个月不是每月重复支付这笔金额的说明。')],
 'public-provisional-process':[
  q('proposal-stage','一种可选方案首先要让议案怎样推进？','进入下一轮审议，再有机会修改和明确。','所有条款已经终审并生效。','立刻停止任何后续讨论。',[e(0,'Jedna možná varianta'),e(0,'do dalšího čtení')],'možná varianta与下一轮审议都说明仍是过程中的方案。'),
  q('appointment-actor','任命程序由谁负责，在这段话里是否已经定死？','提到参议院议长或教育部长，仍取决于委员会商定。','唯一负责人已确定为高校里的每位教师。','录音明确说不需要任何任命程序。',[e(0,'eventuálně ministrovi školství'),e(0,'jak se dohodneme na výboru')],'或者与取决于讨论不能在摘要里删掉，不能把备选说成最终指定。')],
 'public-symbolic-function':[
  q('symbolic-value','这一段主要用什么价值解释任命行为？','对学识和知识传承表达尊重及社会认可。','已经规定了所有人的具体薪资。','逐条公布了考试分数线。',[e(0,'společenskou vážnost'),e(0,'projevuje úctu vzdělanosti')],'核心是社会声望与尊重的象征意义，不是薪资或考试标准。'),
  q('no-extra-power','只按这段话，哪种说法没有擅自扩大原意？','他说明国家任命行为的社会意义，未交代完整专业评审流程。','他证明国家元首独自完成全部学术考核。','他说知识传承不重要。',[e(0,'jmenování profesorů hlavou státu'),e(0,'předávání vědění dalším generacím')],'提到任命与象征功能，不等于把所有专业判断都归给任命者。')],
 'public-responsibility-negation':[
  q('who-failed','长句中，未满足技术和卫生要求的是哪一方？','住房提供方。','领取补助资格者被明确指为未达标的提供者。','负责发言的人被明确指为提供者。',[e(0,'nejsou splněny ze strany poskytovatele bydlení')],'ze strany把未达标这一侧指向住房提供者，别被长被动句绕到另一人。'),
  q('normative-scope','政府在这句话里反对条款被写成什么结果？','因住房提供方未达标，反让有资格的人失去补助权利。','反对任何技术和卫生要求存在。','宣布所有补助已经被取消。',[e(0,'nemělo být formulováno tak'),e(0,'postihována ztrátou nároku')],'nemělo表达不应这样规定，不能改成已经发生的全部取消，也不是取消要求本身。')],
 'public-statistical-tradeoff':[
  q('cost-chain','按发言者的解释，失业统计下降伴随了什么代价？','提前退休使养老保险缴入减少、领取提前。','所有人都已重新找到工作并增加缴费。','养老账户在句中被说成完全无关。',[e(0,'na úkor důchodového účtu'),e(0,'neplatí důchodové pojištění'),e(0,'předčasně čerpají')],'把统计指标和成本转移的解释链连接起来，不把提前退休直接当成重新就业。'),
  q('statistic-limit','怎样报告这段观点而不额外得出结论？','他说统计下降有成本转移，不能仅据此认定就业实际改善。','统计下降已经独自证明所有人的就业状况改善。','他提供了每个人当前工资的完整数据。',[e(0,'statisticky snižuje'),e(0,'neboť')],'这里给的是一种机制解释和立场，不是所有就业状况的外部核验数据。')],
 'public-concession-principle':[
  q('shared-principle','并列不同立场之后，ale引出什么共同主张？','法律有效期间，所有人都应遵守。','只有支持这部法律的人才需要遵守。','所有人必须永远支持保留这部法律。',[e(0,'ale pravděpodobně'),e(0,'dokud jakékoliv zákony platí'),e(0,'každým')],'前面允许保留或废除的不同立场；共同点是有效期间的遵守。'),
  q('duration-boundary','dokud在这里限定了什么？','法律仍有效的期间。','法律永远不得修改或废除。','只有当天发言结束以前。',[e(0,'dokud jakékoliv zákony platí')],'遵守有效法律与讨论改变法律是两回事，不能把期间条件改成永远不许改。')],
 'public-outsourcing-condition':[
  q('if-condition','结束这种外包做法的条件是什么？','发现内部工作人员能把相关服务组织得更好。','不需要比较，所有外包一律立即结束。','只要外包公司换一个名称就结束。',[e(0,'pokud zjistíme'),e(0,'lépe prostřednictvím vlastních pracovníků')],'pokud保留先核实能否内部做得更好的条件，不是无条件取消全部外包。'),
  q('verified-or-not','哪种转述没有把尚待核查的事说成已证实？','他要求审视并核实条件满足与否，再结束相关做法。','片段已经给出了全部比较实验和已完成的取消结果。','片段明确保证任何内部方案总是便宜。',[e(0,'musí na otázku outsourcingu podívat'),e(0,'pokud zjistíme')],'审视与如果发现不是公布了完整核验结果；保留判断所依赖的条件。')],
 'public-quotation-commitment':[
  q('commitment-stage','Předložíme návrh承诺的是哪一阶段？','将提出一项草案。','草案已经通过并生效。','所有公投已经举行完毕。',[e(0,'Předložíme návrh')],'提出草案、通过和生效是不同阶段，不能压缩成同一件已完成的事。'),
  q('quotation-source','“我们将提出”这一段在叙述中被放在哪个来源里？','发言者引用的执政联盟协议文本。','发言者自己现场宣读的新任命文件。','在场听众已经完成的一次投票记录。',[e(0,'smlouva obsahuje text')],'引文边界由协议包含这样的文字标出；别把引用直接改成发言者个人已办成的事。')],
 'public-healthcare-continuous':[
  q('current-agenda','ale之后，发言者把今天当前议程聚焦到什么？','眼前需要处理的一项立法措施。','已经完成的全部制度重建。','与医疗筹资完全无关的活动。',[e(1,'ale my tady řešíme dnes v tomto bodu'),e(1,'zákonné opatření')],'他把一般制度讨论与眼下议程对照；没有宣布全部制度问题都已解决。'),
  q('risk-not-fact','供货商停止供货在他的论证里属于哪一层？','hrozí引出的风险。','明确宣布所有供应商已永久停供。','主持人已经证明不存在任何风险。',[e(2,'hrozí, že nebudou dodavatelé dodávat')],'hrozí把后果放在可能威胁层，不等于已经全部发生。'),
  q('ratio-denominator','30%和50%分别拿什么作参照？','各类对象的平均使用部分，且带大约/平均限定。','这两类人数占全国总人口的比例。','每个雇员工资中固定扣除的比例。',[e(3,'asi 30 % toho, co v průměru používá'),e(3,'asi 50 % toho, co v průměru užívá')],'分母是各自平均使用，而非人数或工资；这仍是发言者给出的说法。'),
  q('chair-turn','主持人的插话直接说明了什么，随后发言者怎样接续？','提醒发言时间已到；发言者随后作收尾。','主持人逐条否定了此前所有数字。','主持人宣布所有议案已通过。',[e(4,'skončila vám doba'),e(5,'v podstatě vše, co jsem chtěl sdělit')],'时间管理提醒与论点反驳不同；随后用总结和致谢结束，不补造一轮完整辩论。')]
};
const normal=s=>String(s).normalize('NFC').replace(/\s+/g,' ').trim().toLocaleUpperCase('cs');
export function nativeListeningChecks(clip,audio){
 const rows=checks[clip.id];if(!rows)throw Error('Missing native check authoring '+clip.id);
 return rows.map(x=>{
  if(new Set([x.correct,x.wrong1,x.wrong2]).size!==3)throw Error('Ambiguous check options '+clip.id+' '+x.key);
  const evidence=x.evidence.map(({index,quote})=>{const segment=clip.transcript[index];if(!segment||!normal(segment.cs).includes(normal(quote)))throw Error('Unverified native check quote '+clip.id+' '+x.key+' '+index);return {segment_id:segment.segment_id||segment.id,quote,start:segment.start,end:segment.end};});
  const start=Math.min(...evidence.map(e=>e.start)),end=Math.max(...evidence.map(e=>e.end));if(!(end>start&&end<=clip.media.duration+.03))throw Error('Invalid check interval '+clip.id);
  return {key:'native-check-'+x.key,kind:'choice',title:'原声听辨 · '+x.prompt,prompt:x.prompt,options:[{id:'supported',text:x.correct},{id:'misread',text:x.wrong1},{id:'overclaim',text:x.wrong2}],answer:'supported',explanation:x.explanation,audio:{...audio,start,end},requires_audio:true,learning_phase:'challenge',skills:['listening'],native_check:{same_recording:true,clip_id:clip.id,evidence}};
 });
}
