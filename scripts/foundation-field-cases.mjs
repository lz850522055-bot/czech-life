import {createHash} from 'node:crypto';
const audioPlan=new Map();
function voice(input){
  const spec=typeof input==='string'?{text:input}:input,key=createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0,16),id='field-'+key;
  audioPlan.set(id,{id,...spec});return {id,status:'generated',text:spec.text||'分开的捷语声音',file_url:`/game/audio/field-v1/${id}-normal.mp3`,slow_file:`/game/audio/field-v1/${id}-slow.mp3`,voice:'cs_CZ-jirka-medium',quality_status:'machine_checked_not_native_listened'};
}
const seq=(phones)=>voice({phonemes:phones}),opt=(id,text)=>({id,text}),pair=(cs,zh)=>({cs,zh});
const sequence=(audio,tokens,answer,prompt)=>({kind:'order',audio,tokens,answer,prompt,operation:'sequence',requires_audio:true,joiner:' ',explanation:'按刚才听到的顺序摆放；顺序变了，不能照抄上一处的排列。'});
const hear=(audio,options,answer,prompt,explanation)=>({kind:'listen',audio,options,answer,prompt,requires_audio:true,explanation});
const pick=(options,answer,prompt,explanation)=>({kind:'choice',options,answer,prompt,explanation});
const contexts=[];
function scene(parent,phase,title,goal,cards,activity,extra={}){
  const id=`${parent}-${phase==='challenge'?'SQUARE':'COURTYARD'}`;
  contexts.push({id,parent,phase,title,goal,cards,activity,...extra});
}
const lengthCards=[pair('a [a] · á [aː]','仍然只用学过的两个声音。长音符提示持续时间；不是喊响一点，也不是中文声调。')];
scene('F01','challenge','广场的两盏灯','把新听到的两个声音按顺序接到两盏灯上。',lengthCards,sequence(seq(['aː','a']),['a','á'],'á a','先播放广场这次的新信号，再按顺序把声音牌接上。'));
scene('F01','return','庭院的三盏灯','不靠旧排列，给三盏灯接好声音。',lengthCards,sequence(seq(['a','a','aː']),['a','á','a'],'a a á','庭院多了一盏灯。听清三次声音，重复字母也可以使用。'));
const roundCards=[pair('e [ɛ] · o [o] · u [u]','e不圆唇；o和u圆唇。先保留这三个声音，不增加整句听力。')];
scene('F02','challenge','给河边信箱配声音','按新顺序给三个信箱放回元音牌。',roundCards,sequence(seq(['o','u','ɛ']),['e','u','o'],'o u e','按你听到的三个声音排列信箱标签。'));
scene('F02','return','给庭院柜子重新编号','听到的顺序已经换了，重新整理三个元音。',roundCards,sequence(seq(['ɛ','u','o']),['u','o','e'],'e u o','旧位置不再作准。给这次三个声音重新排队。'));
const iCards=[pair('i / y [ɪ] · í / ý [iː]','这里只判断短、长。单凭声音不能决定一个词该拼i还是y；拼写继续按词和环境学习。')];
scene('F03','challenge','印刷坊的长短码','把听到的长度变成三格印刷码。',iCards,sequence(seq(['iː','ɪ','iː']),['短','长','长'],'长 短 长','不用猜i还是y，按顺序只标短音或长音。'));
scene('F03','return','给借书牌校对长度','另一张卡的声音顺序不同，再识别一次长度。',iCards,sequence(seq(['ɪ','iː']),['长','短'],'短 长','先听新声音，再把两个长度标记放对。'));
scene('F04','challenge','替邻居拼一块新招牌','把已经学过的长短与拼读方法用到新短词。',[pair('m [m]','新字母m：双唇合上，让气流从鼻腔出来。只增加这一个字母，再把它接到学过的a/á上。'),pair('máma','意思是妈妈。这个新词要听清两个音节，不能靠上一块káva招牌的位置。')],{...sequence(voice('Máma.'),['ma','má'],'má ma','听清新词，把两个音节按顺序接起来。'),joiner:'',answer:'máma',explanation:'má + ma → máma；第一个元音长，第二个短。'});
scene('F04','return','帮小店修好水的牌子','换词后继续按音节拼读。',[pair('d [d]','新字母d：舌尖在上齿龈附近先阻住再放开气流，并让声带参与。'),pair('voda','水。现在只拼这个词的vo + da，不要求先会别的d开头词。')],{...sequence(voice('Voda.'),['da','vo'],'vo da','听这个词，把两块音节接好。'),joiner:'',answer:'voda',explanation:'vo + da → voda；这两个元音都不带长音符。'});
const hookCards=[pair('c [t͡s] · č [t͡ʃ]','只判断开头的辅音。c与č的发音位置不同；小钩不是长音符。')];
scene('F05','challenge','把茶交到正确窗口','在一个新词里找出开头的声音。',hookCards,hear(voice('Čaj.'),[opt('c','c 开头'),opt('hook','č 开头')],'hook','听新录音，这件货物的词以哪个声音开头？','Čaj 的开头是č；本题检查的是开头声音，不是凭中文猜拼法。'));
scene('F05','return','给价牌选正确抽屉','换一个词，再区分有钩和无钩。',hookCards,hear(voice('Cena.'),[opt('hook','č 开头'),opt('c','c 开头')],'c','这次录音是另一件事。把它放到对应辅音的抽屉。','Cena 的开头是c，不能沿用刚才茶窗口的答案。'));
const rCards=[pair('r · ř','只辨认开头，不强迫难音立即达标。ř带擦音特征；先分辨，再慢慢模仿。'),pair('ruka · řeka','分别是手、河。两词不只开头不同，不能称为只差一个音的最小对立词。')];
scene('F06','challenge','给河岸路牌选开头','新词里听出r与ř的区别。',rCards,hear(voice('Řeka.'),[opt('r','r'),opt('hook','ř')],'hook','先听，给河岸路牌选择正确开头。','Řeka 以ř开头；不会发这个音也可以先完成辨认。'));
scene('F06','return','整理工作室的另一张牌','换词后仍能听出r的开头。',rCards,hear(voice('Ruka.'),[opt('hook','ř'),opt('r','r')],'r','现在换一个词，只判断开头。','Ruka 以r开头；这不是刚才的ř。'));
const stressCards=[pair('重音 ≠ 元音长度','这里的示例词通常第一音节重读；长元音可以在别的音节。不要把“重读”理解成“所有长音都在开头”。')];
scene('F07','challenge','修好节奏钟','把重音和元音长度分开找。',stressCards,hear(voice('Malá.'),[opt('first','ma：第一个音节'),opt('last','lá：第二个音节')],'last','听malá（小的，阴性形式），长元音在哪个音节？','ma-lá 的长音在第二音节，但词重音仍在第一音节。'),{after:pick([opt('first','第一个音节 ma'),opt('last','第二个音节 lá')],'first','刚才长音在后面。这个示例词的重音又在哪里？','malá 的重音在第一个音节；两件事要分别记录。')});
scene('F07','return','三格钟面换了新词','在三个音节里继续分开看重音与长短。',stressCards,hear(voice('Kamarád.'),[opt('first','ka：第一格'),opt('middle','ma：第二格'),opt('last','rád：第三格')],'last','kamarád（朋友）分成ka-ma-rád。长元音在哪格？','长á在第三音节rád，重音仍在第一音节ka。'),{after:pick([opt('first','ka：第一格'),opt('last','rád：第三格')],'first','再给这个示例词放一个重音标记。','重音在第一音节ka，不随着长á移到最后。')});
const drinkOptions=[opt('tea','茶 · čaj'),opt('coffee','咖啡 · káva'),opt('water','水 · voda')];
scene('F08','challenge','河边小摊的短请求','换一个词形，仍先抓出饮品。',[pair('voda → vodu','请求里会遇到vodu。先保留vod-这个线索，知道这里要的是水；这个变化不能套到所有名词。')],hear(voice('Vodu, prosím.'),drinkOptions,'water','听客人的短请求，先把正确饮品放到托盘。','Vodu 在这句中指要水。先抓饮品，再处理礼貌词。'));
scene('F08','return','庭院客人换了饮品','另一份短请求，不能总拿上一杯水。',[pair('káva → kávu','请求里的kávu仍指咖啡。看词根与当前表达，不把变化误当成另一种饮品。')],hear(voice('Kávu, prosím.'),drinkOptions,'coffee','先听新客人要什么，再选择托盘里的饮品。','Kávu 在这句里指咖啡；prosím是在这里配合请求使用。'));
function repairDialogue(audio,{write=false}={}){return {kind:'dialogue',start:'ask',prompt:write?'环境太吵，声音仍听不清。换一种办法拿到信息。':'对方的话还没听清，先修复沟通再继续。',nodes:[{id:'ask',speaker_cs:write?'Kávu, nebo čaj?':'Kávu, nebo čaj?',speaker_zh:'咖啡还是茶？',audio,choices:[{id:'repair',text_cs:write?'Prosím, napište to.':'Prosím, ještě jednou.',text_zh:write?'请写下来。':'请再说一遍。',feedback_zh:write?'对方拿起纸笔，信息换成了能看清的形式。':'对方愿意再说一次，沟通没有因为没听懂停住。',next:'clear'},{id:'pretend',text_cs:'Ano.',text_zh:'是的。',feedback_zh:'对方还不知道你要哪种饮品。补一句具体的求助，别靠猜。',next:'repair'}]},{id:'repair',speaker_cs:'Kávu, nebo čaj?',speaker_zh:'仍在确认咖啡还是茶。',audio,choices:[{id:'repair',text_cs:write?'Prosím, napište to.':'Prosím, ještě jednou.',text_zh:write?'请写下来。':'请再说一遍。',feedback_zh:'信息现在清楚了，可以继续选择。',next:'clear'}]},{id:'clear',speaker_cs:'Kávu, nebo čaj?',speaker_zh:'咖啡还是茶？现在给出一个明确选择。',audio,choices:[{id:'tea',text_cs:'Čaj, prosím.',text_zh:'请给我茶。',feedback_zh:'这次你拿到了茶，刚才的求助解决了实际问题。',next:'done'},{id:'coffee',text_cs:'Kávu, prosím.',text_zh:'请给我咖啡。',feedback_zh:'这次你拿到了咖啡，刚才的求助解决了实际问题。',next:'done'}]},{id:'done',speaker_cs:'Děkuju.',speaker_zh:'谢谢。你把这次沟通推进了。',choices:[]}]};}
scene('F09','challenge','小摊前先别装懂','用学过的请求重复，让对方把话说清楚。',[{...pair('Prosím, ještě jednou.','请再说一遍。不是确认已经听懂，而是主动请求帮助。'),audio:voice('Prosím, ještě jednou.')},pair('Kávu, nebo čaj?','咖啡还是茶？nebo在这组选择里表示“还是”。')],repairDialogue(voice('Kávu, nebo čaj?')));
scene('F09','return','嘈杂庭院换一种沟通','重复仍不清楚时，请对方写下来。',[{...pair('Prosím, napište to.','请把它写下来。先把这句当作能直接用的修复工具，不要求先会整个动词变位表。'),audio:voice('Prosím, napište to.')},pair('Čaj, prosím. · Kávu, prosím.','信息清楚以后，给出茶或咖啡的具体选择。')],repairDialogue(voice('Kávu, nebo čaj?'),{write:true}));
const names=[opt('jana','Jana · 雅娜'),opt('petr','Petr · 彼得'),opt('eva','Eva · 伊娃')];
scene('F10','challenge','把邻居名牌别放错','从另一个人的自我介绍里抓名字。',[pair('Jmenuju se …','我叫……。这次要确认的是对方名字，不是把每个人都当成李。')],hear(voice('Jmenuju se Petr.'),names,'petr','先听邻居说什么，再把名牌交给对应的人。','这位邻居说自己叫Petr，彼得。'));
scene('F10','return','聚会门口认识另一位朋友','问候多了一句，仍抓住名字。',[pair('Těší mě.','很高兴认识你。它不等于名字；要继续找Jmenuju se后面的信息。')],hear(voice('Těší mě. Jmenuju se Eva.'),names,'eva','这次先有一句问候。名字是哪一个？','Těší mě是问候，后面介绍的名字是Eva，伊娃。'));
scene('F11','challenge','另一张杯子价牌','数量相同、价格变了，要重新核对。',[pair('Jeden hrnek stojí šedesát korun.','一只杯子60克朗。šedesát=60；这张游戏价牌不是原先的80。')],{kind:'checkout',prompt:'这次带两只杯子。亲手调整托盘，再按新价牌确认总价。',audio:voice('Jeden hrnek stojí šedesát korun.'),shop:{item:'hrnek',max_quantity:2,unit_price:60},answer:{quantity:2,total:120},explanation:'新价牌每只60，两只120克朗；不能继续填原来的160。'},{shop:true,sourceAudio:voice('Jeden hrnek stojí šedesát korun.')});
scene('F11','return','庭院寄售点又换了价','另一地点、另一价牌，再完成实际结算。',[pair('Jeden hrnek stojí čtyřicet pět korun.','一只杯子45克朗。čtyřicet pět=45；两只需要重新计算，不沿用上一张价牌。')],{kind:'checkout',prompt:'给这次委托拿两只杯子，再给出新总价。',audio:voice('Jeden hrnek stojí čtyřicet pět korun.'),shop:{item:'hrnek',max_quantity:2,unit_price:45},answer:{quantity:2,total:90},explanation:'每只45，两只90克朗。托盘数量和总价都需要正确。'},{shop:true,sourceAudio:voice('Jeden hrnek stojí čtyřicet pět korun.')});
scene('F12','challenge','真的替朋友跑一次小摊','把问候、饮品关键词和求助组合起来。',[pair('Dobrý den. · Čaj, prosím.','您好。请给我茶。只组合已经见过的短表达，不突然放一大段陌生独白。')],hear(voice('Dobrý den. Čaj, prosím.'),drinkOptions,'tea','朋友把请求发来，先听清他要的饮品。','问候以后要的是Čaj，茶。'));
scene('F12','return','换个朋友再出门一次','换请求后继续抓关键词，再留下自己的回应。',[pair('Dobrý den. · Vodu, prosím.','您好。请给我水。需要时仍然可以请对方重复，不必假装全听懂。')],hear(voice('Dobrý den. Vodu, prosím.'),drinkOptions,'water','听这次新的短请求，不能拿上一趟的茶。','这次的饮品是水，Vodu。'));
export const fieldAudioScripts=()=>[...audioPlan.values()];
export function foundationFieldCases(parents,audioIndex={}){
  const result=[],metadata=[];
  const withTiming=value=>{if(Array.isArray(value))return value.map(withTiming);if(!value||typeof value!=='object')return value;const v=Object.fromEntries(Object.entries(value).map(([k,x])=>[k,withTiming(x)]));return v.id&&audioIndex[v.id]?{...v,duration:audioIndex[v.id].normal_seconds}:v;};
  for(let n=1;n<=12;n++){
    const parentId='F'+String(n).padStart(2,'0'),parent=parents.find(m=>m.id===parentId);if(!parent)throw Error('Missing foundation '+parentId);const tasks=[];
    for(const c of contexts.filter(c=>c.parent===parentId)){
      const field_scene={id:c.id,title:c.title,phase:c.phase,place_cs:'Malostranské náměstí',place_zh:'小城区广场',parent:parentId,art:c.shop?'shop':'square',operation:c.activity.operation||'select',result:c.activity.kind==='dialogue'?'对方现在拿到了明确选择。':c.shop?'这张新价牌下的订单已核对。':'这处装置收到了你这次核对的内容。'},common={learning_context:c.id,learning_phase:c.phase,field_scene,transfer:true};
      tasks.push({kind:'source',title:c.title,prompt:c.goal,cards:c.cards,audio:c.sourceAudio||null,...common});
      tasks.push({...c.activity,title:c.shop?'按新价牌拿对杯子':c.activity.kind==='dialogue'?'把沟通继续下去':'动手完成这次委托',...common});
      if(c.after)tasks.push({...c.after,title:'换个问题核对你的判断',...common});
      tasks.push({kind:'work',title:'给这次出门留一句话',prompt:c.shop?'用自己的话说明你怎样核对数量与新价牌；也可以录下这句价格。':'用文字或录音记下你刚才抓住的声音、词或修复表达，以及还需要帮助的地方。',rubric:['记录这次具体用到了什么','把借助帮助的部分说清楚','自己的录音或表达留作前后比较，不自动评定发音水平'],skills:['speaking','writing'],...common});
      metadata.push({id:c.id,mission_id:parentId+'-CITY',parent:parentId,phase:c.phase,title:c.title,authorship:'原创教学情境，合成语音；不是现实商铺公告',place_cs:field_scene.place_cs,place_zh:field_scene.place_zh});
    }
    result.push({...parent,id:parentId+'-CITY',foundation:false,sidequest:true,learning_parent:parentId,shop_scene:parentId==='F11',title:parent.title+' · 街区新委托',goal:'带着刚学的办法，在不同材料和条件里办成两件事。',story:'广场和庭院各有一份新的委托。角色与商铺为原创教学情境，地名来自真实布拉格。',prerequisites:[parentId],reward:'两份不同的街区材料与自己的作品已留下；选择题与自查不等于自由表达已掌握。',tasks:withTiming(tasks)});
  }
  return {missions:result,contexts:metadata,audio_scripts:fieldAudioScripts()};
}
