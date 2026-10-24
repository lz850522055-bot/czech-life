// Virtual business rules are shared so offline predictions and the server use
// identical arithmetic. None of these prices, plots or trades are real offers.
import {shuffled} from './core.js';
export const SIM_VERSION='2026.10.24.1';
export const SIM_SPEC={version:SIM_VERSION,initial_cash:800000,currency:'CZK',unit:'haler',
  products:{tea:{id:'tea',cs:'čaj',genitive:'čaje',zh:'茶',cost:3200,price:9000,counts:[[6,'šest'],[8,'osm'],[10,'deset']]},coffee:{id:'coffee',cs:'káva',genitive:'kávy',zh:'咖啡',cost:7500,price:14500,counts:[[4,'čtyři'],[5,'pět'],[3,'tři']]},juice:{id:'juice',cs:'džus',genitive:'džusu',zh:'果汁',cost:1800,price:5200,counts:[[12,'dvanáct'],[9,'devět'],[15,'patnáct']]}},
  customers:{tea:{name:'Jan',zh:'小城区的邻居',place_id:'ipr:4211',delivery:3000},coffee:{name:'Petra',zh:'老城的合作伙伴',place_id:'ipr:4155',delivery:4000},juice:{name:'Eva',zh:'维诺赫拉迪的活动组织者',place_id:'ipr:4027',delivery:4500}},
  supplier:{name:'供货点（虚构剧情）',place_id:'ipr:3917',source_place_zh:'斯米霍夫市场'},
  sites:{stall:{id:'stall',cs:'stánek',zh:'教学摊位',mode:'lease',price:65000,deposit:30000,place_id:'ipr:3917',plans:['kiosk']},plot:{id:'plot',cs:'pozemek',zh:'教学地块',mode:'purchase',price:350000,deposit:0,place_id:'ipr:3917',plans:['house','showroom']}},
  plans:{kiosk:{id:'kiosk',cs:'malý stánek',zh:'像素小店',materials:70000,labor:50000},house:{id:'house',cs:'malý dům s prodejnou',zh:'带店铺的小屋',materials:110000,labor:70000},showroom:{id:'showroom',cs:'prodejna se skladem',zh:'店面与小仓库',materials:160000,labor:90000}},
  note:'纯虚拟经营：价格、产权、施工和人物均为教学参数/剧情；地点坐标关联真实布拉格。没有真钱支付或现实下单。'};
export const currency=cents=>new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:2}).format(cents/100)+' Kč';
export function initialSimulation(epoch=0){return {revision:0,epoch,round:1,cash:SIM_SPEC.initial_cash,inventory:{tea:0,coffee:0,juice:0},orders:{},property:null,building:null,store:null,stats:{sales:0,revenue:0,cogs:0,goods:0,delivery:0,rent:0,deposit:0,property:0,construction:0,paid_orders:0},learning:{attempts:0,correct:0,assisted:0,open_works:0}};}
export function offers(state){return Object.values(SIM_SPEC.products).map(p=>{const [qty,word]=p.counts[(state.round-1)%p.counts.length],customer=SIM_SPEC.customers[p.id];return {id:`${state.epoch}-${state.round}-${p.id}`,product_id:p.id,qty,word,price:p.price,total:qty*p.price,customer:customer.name,customer_zh:customer.zh,place_id:customer.place_id,delivery:customer.delivery};});}
export function balances(state){const receivable=Object.values(state.orders).filter(o=>o.status==='delivered').reduce((n,o)=>n+o.total,0),margin=state.stats.revenue-state.stats.cogs-state.stats.delivery-state.stats.rent;return {receivable,operating_result:margin,operating_cashflow:state.stats.sales-state.stats.goods-state.stats.delivery-state.stats.rent,inventory_asset:Object.entries(state.inventory).reduce((n,[id,qty])=>n+SIM_SPEC.products[id].cost*qty,0),capital_paid:state.stats.property+state.stats.construction,deposit_asset:state.stats.deposit};}
const option=(id,cs,zh)=>({id,cs,zh});
function orderFor(s,target,offerAllowed=false){const o=Object.hasOwn(s.orders,target)?s.orders[target]:(offerAllowed?offers(s).find(o=>o.id===target):null);if(!o)throw new Error('这张订单不存在，先刷新经营账本。');return o;}
function requireCash(s,amount){if(!Number.isSafeInteger(amount)||amount<0)throw new Error('游戏金额无效。');if(s.cash<amount)throw new Error('游戏现金不足。可以先完成手里的订单，或选更小的方案。');}
export function assertSimulationState(s){const money=[s.cash,...Object.values(s.stats)],stock=Object.values(s.inventory);if(!money.every(n=>Number.isSafeInteger(n)&&n>=0)||!stock.every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('经营账本出现无效金额或库存。');const b=balances(s);if(s.cash!==SIM_SPEC.initial_cash+s.stats.sales-s.stats.goods-s.stats.delivery-s.stats.rent-s.stats.deposit-s.stats.property-s.stats.construction||b.inventory_asset!==s.stats.goods-s.stats.cogs||b.receivable!==s.stats.revenue-s.stats.sales)throw new Error('经营账本未平衡，原存档保留。');return s;}
export function simulationTask(s,action){
  const {kind,target}=action;let task;
  if(kind==='accept'){
    const o=orderFor(s,target,true),p=SIM_SPEC.products[o.product_id];
    task={level:'A1',speaker:o.customer,cs:`Prosím ${o.word} balení ${p.genitive}.`,zh:`请给我${o.qty}包${p.zh}。`,prompt:'先确认客户要的数量。',answer:'quantity',options:[option('quantity',`${o.qty} balení`,`${o.qty}包`),option('unitprice',`${p.price/100} balení`,'把单价当成数量了'),option('one','1 balení','1包')],rule:'balení 是“包/包装”。先抓数字，再抓物品；不要把金额当数量。',words:[['prosím','请'],['balení','包、包装'],[p.cs,p.zh]],success:'数量确认了。先拿到订单，再决定怎样采购。',retry:'客户问的是包数。再找一次 balení 前面的数字。'};
  }else if(kind==='procure'){
    const o=orderFor(s,target),p=SIM_SPEC.products[o.product_id];
    task={level:'A1–A2',speaker:'供货方',cs:`Za ${o.word} balení zaplatíte ${currency(p.cost*o.qty)}.`,zh:`${o.qty}包进货要支付${currency(p.cost*o.qty)}。`,prompt:'这是本次采购的总价，确认后才扣游戏现金。',answer:'total',options:[option('total',currency(p.cost*o.qty),'本批总采购款'),option('unit',currency(p.cost),'只有一包的采购价'),option('sale',currency(o.total),'这是客户销售总价')],rule:'za + 商品/数量可以引出“买这些要多少钱”。单价 × 数量才是这一批的采购款，销售收入还没有到账。',words:[['zaplatíte','您将支付'],['za','为、购买……所需']],success:'货已入库，采购款已支付。账本里这两件事分开记录。',retry:'把采购单价乘上包数。客户报价不能拿来当供货价。'};
  }else if(kind==='deliver'){
    const o=orderFor(s,target);
    task={level:'A2',speaker:o.customer,cs:'Dnes nemohu. Přijďte prosím zítra v deset.',zh:'今天不方便，请明天十点来。',prompt:'先确认对方方便的时间。',answer:'tomorrow',options:[option('tomorrow','Přijdu zítra v deset. Vyhovuje vám to?','我明天十点来，可以吗？'),option('today','Jsem tady teď.','我现在就在这里。'),option('cancel','Tak objednávku ruším.','那我取消订单。')],rule:'dnes=今天，zítra=明天，v deset=在十点。先确认时间再履约，比只听到一个数字就出发更稳。',words:[['dnes / zítra','今天 / 明天'],['přijdu','我会来'],['vyhovuje vám to?','这样您方便吗？']],success:`交付剧情推进到已送达，出库并扣除${currency(o.delivery)}配送成本；销售款仍是应收。`,retry:'对方说今天不方便。用 zítra 确认明天，先把约定说清。'};
  }else if(kind==='collect'){
    const o=orderFor(s,target),p=SIM_SPEC.products[o.product_id];
    task={level:'A1–A2',speaker:'你',cs:`Je to celkem ${currency(o.total)}, prosím.`,zh:`总共${currency(o.total)}。`,prompt:'核对总价后收取虚拟货款。',answer:'full',options:[option('full',currency(o.total),'整张订单的货款'),option('unit',currency(p.price),'只收一包的钱'),option('cost',currency(p.cost*o.qty),'只收回进货成本')],rule:'celkem=合计。只有收款后现金才增加，已送达的应收款不能先当作现金。',words:[['celkem','合计'],['hotově','现金支付']],success:'货款已收。订单、库存、现金和本次经营结果都可以核对。',retry:'找 celkem 后的合计金额。单价和采购成本都不是整张销售订单的货款。'};
  }else if(kind==='site'){
    if(!Object.hasOwn(SIM_SPEC.sites,target))throw new Error('没有这个教学场地。');const site=SIM_SPEC.sites[target];
    task=site.mode==='lease'?{level:'A2',speaker:'场地方',cs:'Nájem je 650 Kč za měsíc. Kauce je dalších 300 Kč.',zh:'每期租金650，另外交300押金（均为游戏参数）。',prompt:'这一期开始经营，先要拿出多少现金？',answer:'upfront',options:[option('upfront','950 Kč','650租金 + 300押金'),option('rent','650 Kč','漏掉了押金'),option('deposit','300 Kč','只有押金')],rule:'dalších 表示“另外的”。押金占用现金，但在本模拟账本里单列为押金资产，不直接当成本。',words:[['nájem','租金'],['kauce','押金'],['za měsíc','每月']],success:'虚拟摊位已租下。租金和押金已分开记账。',retry:'句子里的 dalších 300 Kč 是另外交的押金，要与租金相加。'}:{level:'A2',speaker:'场地方',cs:'Cena pozemku je 3 500 Kč. Nejde o nájem.',zh:'教学地块买价3500游戏克朗，这不是租金。',prompt:'读懂这份虚构交易的条件。',answer:'purchase',options:[option('purchase','Kupuji pozemek za 3 500 Kč.','支付3500购买教学地块'),option('rent','Platím nájem 3 500 Kč měsíčně.','每月支付3500租金'),option('free','Pozemek dostanu zdarma.','免费取得地块')],rule:'kupuji=我购买；nájem=租金；nejde o…=这里不是……。先弄清买还是租，账本才能记对。',words:[['pozemek','地块'],['kupuji','我购买'],['nejde o','这不是']],success:'教学地块已进入你的模拟存档，可以选择建设方案；不改变真实城市产权。',retry:'第二句已经排除了 nájem。这里是购买游戏地块的价格。'};
  }else if(kind==='plan'){
    if(!Object.hasOwn(SIM_SPEC.plans,target))throw new Error('没有这个建设方案。');const plan=SIM_SPEC.plans[target];
    task={level:'A2–B1',speaker:'施工伙伴',cs:`Cena ${currency(plan.materials+plan.labor)} zahrnuje materiál a práci. Pozemek v ceně není.`,zh:`${currency(plan.materials+plan.labor)}包括材料和施工，地块不包含在内。`,prompt:'先读懂报价包含什么，再确认你选择的方案。',answer:'materials_labor',options:[option('materials_labor','Materiál a práce, bez pozemku.','材料和施工，不含地块'),option('all','Všechno včetně pozemku.','包括地块的一切'),option('materials_only','Jen materiál.','只有材料')],rule:'zahrnuje=包括；v ceně není=不在价格之内。把“包括”与“不包括”分别列出来，别凭总价猜。',words:[['materiál','材料'],['práce','施工、工作'],['bez','不含']],success:'方案已定，报价已拆成材料与人工，接下来可以分阶段采购施工。',retry:'第一句包括材料与人工，第二句明确地块另算。'};
  }else if(kind==='materials'){
    const plan=SIM_SPEC.plans[s.building?.plan];if(!plan)throw new Error('先选建设方案。');
    task={level:'A2–B1',speaker:'施工伙伴',cs:`Teď platíme jen materiál: ${currency(plan.materials)}. Práci zaplatíme později.`,zh:`现在只付材料${currency(plan.materials)}，人工稍后付。`,prompt:'这一笔该支付哪一部分？',answer:'materials',options:[option('materials',currency(plan.materials),'本次材料款'),option('all',currency(plan.materials+plan.labor),'把人工也提前付了'),option('labor',currency(plan.labor),'付错成了人工')],rule:'teď=现在；jen=只；později=以后。先找时间和范围词，避免把报价总额一次性当成本次付款。',words:[['teď / později','现在 / 以后'],['jen','只']],success:'材料到位，材料款已支付，人工还没有支付。',retry:'这次有 jen materiál；práci 的付款时间是 později。'};
  }else if(kind==='foundation'){
    task={level:'A2–B1',speaker:'施工伙伴',cs:'Nejdřív uděláme základy. Potom postavíme stěny.',zh:'先做基础，然后砌墙。',prompt:'下一阶段先做什么？',answer:'foundation',options:[option('foundation','Nejdřív základy.','先做基础'),option('walls','Nejdřív stěny.','先砌墙'),option('open','Hned otevřeme prodejnu.','马上开店')],rule:'nejdřív / potom 把动作排成顺序；读懂关系比只记住“墙”这个名词更有用。',words:[['základy','基础'],['stěny','墙'],['nejdřív / potom','先 / 然后']],success:'基础已完成，支付第一部分人工；像素场地也随阶段改变。',retry:'先看 nejdřív 后面的动作，再看 potom。不要倒着施工。'};
  }else if(kind==='walls'){
    const plan=SIM_SPEC.plans[s.building?.plan];if(!plan)throw new Error('先选方案。');const rest=plan.labor-Math.floor(plan.labor/2);
    task={level:'B1',speaker:'施工伙伴',cs:`První část práce je zaplacená. Zbývá doplatit ${currency(rest)}.`,zh:`第一部分人工已经付过，只剩${currency(rest)}。`,prompt:'完成墙面和店铺，核对剩余人工。',answer:'rest',options:[option('rest',currency(rest),'只付剩余部分'),option('whole',currency(plan.labor),'把全部人工再付一次'),option('nothing','0 Kč','以为不需要再付')],rule:'už/je zaplacená 表示已支付；zbývá 表示还剩。分清已经发生与仍待完成的部分。',words:[['zaplacená','已付清的'],['zbývá','还剩'],['doplatit','付清余款']],success:'像素建筑完成，剩余人工已支付，之后可以写介绍开业。',retry:'已经支付的第一部分不能重复付，找 zbývá 后的余款。'};
  }else if(kind==='open'){
    task={level:'A2–C2 自选表达',speaker:'你',cs:'Představte svoji prodejnu zákazníkům.',zh:'向客户介绍你自己的店。',prompt:'写一段真实的捷语表达，保存为经营作品，再打开像素店门。',kind:'work',rule:'先说卖什么、在哪里、怎样联系或交付。可以先写短句，也可以挑战更完整的介绍；系统保存作品，不自动认定达到某个等级。',model:'Dobrý den! V naší prodejně najdete čaj, kávu a džusy. Napište nám, co potřebujete. Rádi vám pomůžeme.',rubric:['读者能知道卖什么','条件和交付方式说清','想正式还是亲切，语气保持一致','不会的地方标出，之后换个情境重写'],words:[['prodejna','店铺'],['zákazník','客户']],success:'店铺介绍已保存为开放作品，像素店门打开了。'};
  }else return null;
  return {...task,id:[s.epoch,s.round,kind,target||''].join('|'),options:task.options?shuffled(task.options,[s.epoch,s.round,kind,target].join('|')):[]};
}
function allowed(s,a){
  const k=a.kind;
  if(['accept','procure','deliver','collect'].includes(k)){
    const o=orderFor(s,a.target,k==='accept'),existing=s.orders[a.target];
    if(k==='accept'&&existing)throw new Error('这张订单已经接过，不能重复接单。');
    if(k==='procure'&&(o.status!=='accepted'||o.procured))throw new Error('这张订单不需要再次采购。');
    if(k==='deliver'&&(o.status!=='accepted'||!o.procured))throw new Error('先确认订单并采购，再安排交付。');
    if(k==='collect'&&o.status!=='delivered')throw new Error('只有已交付、未收款订单可以收款。');
  }
  if(k==='site'&&s.property)throw new Error('这个存档已有场地，不能再重复购买同一教学场地。');
  if(k==='plan'){if(!s.property||s.building)throw new Error('先取得场地；已确认的方案不能重复收费。');if(!SIM_SPEC.sites[s.property.site].plans.includes(a.target))throw new Error('这个场地不适合所选方案。');}
  if(['materials','foundation','walls','open'].includes(k)){
    const need={materials:'planned',foundation:'materials',walls:'foundation',open:'built'}[k];if(s.building?.stage!==need)throw new Error('施工阶段已经改变，先看最新的场地状态。');
  }
  if(k==='next_round'&&(Object.values(s.orders).some(o=>o.status!=='paid')||!Object.values(s.orders).some(o=>o.round===s.round&&o.status==='paid')))throw new Error('先处理本期未完成订单，再开始下一期。');
  if(k==='review'&&!['independent','with_help','retry'].includes(a.rating))throw new Error('请选择这份经营作品的自查状态。');
  if(!['accept','procure','deliver','collect','site','plan','materials','foundation','walls','open','review','next_round','reset'].includes(k))throw new Error('未知经营动作。');
}
export function isSimulationActionCurrent(state,action){try{allowed(state,action);return true;}catch{return false;}}
export function stepSimulation(current,action){
  assertSimulationState(current);allowed(current,action);const s=structuredClone(current),task=simulationTask(s,action),feedback={status:'applied',correct:null,assisted:!!action.assisted,message:''},changes=[];
  if(task?.kind==='work'){
    if(typeof action.text!=='string'||action.text.trim().length<20||action.text.length>5000)throw new Error('先写下至少20个字符的介绍；这是作品保存条件，不是语言水平评分。');
    feedback.status='needs_self_review';s.learning.open_works++;
  }else if(task){
    if(!task.options.some(o=>o.id===action.answer))throw new Error('请选择这段对话的有效回应。');
    s.learning.attempts++;feedback.correct=action.answer===task.answer;
    if(action.assisted)s.learning.assisted++;
    if(!feedback.correct){s.revision++;return {state:s,feedback:{...feedback,status:'retry',message:task.retry,explanation:task.rule},changes:[]};}
    s.learning.correct++;
  }
  const spend=(n,category,label)=>{requireCash(s,n);s.cash-=n;s.stats[category]+=n;changes.push({kind:'debit',amount:n,category,label});};
  const kind=action.kind;
  if(kind==='accept'){const o=orderFor(s,action.target,true);s.orders[o.id]={...o,status:'accepted',procured:false,round:s.round};}
  if(kind==='procure'){const o=s.orders[action.target],p=SIM_SPEC.products[o.product_id];spend(p.cost*o.qty,'goods','采购 '+o.qty+' 包'+p.zh);s.inventory[p.id]+=o.qty;o.procured=true;o.cost=p.cost*o.qty;}
  if(kind==='deliver'){const o=s.orders[action.target];if(s.inventory[o.product_id]<o.qty)throw new Error('本机库存不足，先核对采购记录。');spend(o.delivery,'delivery','订单配送');s.inventory[o.product_id]-=o.qty;s.stats.revenue+=o.total;s.stats.cogs+=o.cost;o.status='delivered';}
  if(kind==='collect'){const o=s.orders[action.target];s.cash+=o.total;s.stats.sales+=o.total;s.stats.paid_orders++;o.status='paid';changes.push({kind:'credit',amount:o.total,category:'sales',label:'订单收款'});}
  if(kind==='site'){const site=SIM_SPEC.sites[action.target];requireCash(s,site.price+site.deposit);spend(site.price,site.mode==='lease'?'rent':'property',site.mode==='lease'?'本期租金':'虚拟购地');if(site.deposit)spend(site.deposit,'deposit','押金资产');s.property={site:site.id,mode:site.mode,place_id:site.place_id};}
  if(kind==='plan')s.building={plan:action.target,stage:'planned'};
  if(kind==='materials'){const plan=SIM_SPEC.plans[s.building.plan];spend(plan.materials,'construction','建设材料');s.building.stage='materials';}
  if(kind==='foundation'){const plan=SIM_SPEC.plans[s.building.plan];spend(Math.floor(plan.labor/2),'construction','第一部分人工');s.building.stage='foundation';}
  if(kind==='walls'){const plan=SIM_SPEC.plans[s.building.plan];spend(plan.labor-Math.floor(plan.labor/2),'construction','剩余人工');s.building.stage='built';}
  if(kind==='open'){s.store={name:String(action.name||'U Liho').trim().slice(0,40),introduction:action.text.trim(),self_review:null};s.building.stage='open';}
  if(kind==='review'&&s.store&&action.work_epoch===s.epoch)s.store.self_review=action.rating;
  if(kind==='next_round'){if(s.property?.mode==='lease')spend(SIM_SPEC.sites[s.property.site].price,'rent','下一期租金');s.round++;feedback.message='进入下一期。数量会变化，不能只记住上一轮选项。';}
  if(kind==='reset'){const fresh=initialSimulation(s.epoch+1);fresh.revision=s.revision+1;fresh.learning=structuredClone(s.learning);return {state:fresh,feedback:{...feedback,message:'新模拟已开始；以前的经营记录保留，语言作品不删除。'},changes:[]};}
  s.revision++;feedback.message ||= task?.success||'已记入游戏账本。';feedback.explanation=task?.rule||'';
  return {state:assertSimulationState(s),feedback,changes};
}
