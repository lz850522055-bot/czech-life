// Story presentation is derived from immutable learning evidence. Opening a chat
// or changing map levels never invents a solved lesson or changes recommendation.
export const CAST=[
 {id:'jana',cs:'Jana',zh:'雅娜',role:'邻居 · 声音街',xy:[-1733,-1478],place:'ipr:4211',intro:'刚到这里，不用硬听一整段。先认一个声音，再拿它做成一件小事。我把 a 和 á 的声音牌留给你。'},
 {id:'petr',cs:'Petr',zh:'彼得',role:'街角店主 · 城市联络员',xy:[-1736,-1335],place:'ipr:4211',intro:'生意先从听清一张小订单开始。数量、物品、对方确认的条件，都在委托里；也可以去经营区实际做一单。'},
 {id:'tomas',cs:'Tomáš',zh:'托马什',role:'出行伙伴',xy:[-1975,-1490],place:'ipr:4211',intro:'等车时最怕听漏站名和时间。我们先在短线索里找关键词，再去车站的故事里换一种条件用出来。'},
 {id:'eva',cs:'Eva',zh:'伊娃',role:'朋友 · 城市电台的听众',xy:[-1941,-1347],place:'ipr:4211',intro:'我收藏了一些城里的原声。刚起步先练短词，往后再一起听采访、分辨立场，把听到的事说给别人。'}
];
const assigned=m=>m.city_excursion?m.city_excursion.npc_id:m.learning_parent?assigned({...m,id:m.learning_parent,learning_parent:null}):m.native||['F09','F12'].includes(m.id)?'eva':/车站|换乘|站名|问路|公交|火车|交通|找.*关键词/.test(m.location+' '+m.title)?'tomas':m.id==='F11'||m.npc?.includes('彼得')?'petr':'jana';
export function profileForMission(m,task=null){if(m?.city_excursion)return CAST.find(c=>c.id===(task?.npc_id||m.city_excursion.npc_id))||CAST[0];if(m?.journey_story&&['return-note','confirm-destination','delivery-walk','parcel-handoff','journey-work'].includes(task?.key))return CAST.find(c=>c.id==='jana');return m?.native?{id:'radio',cs:'Městské rádio',zh:'城市电台'}:CAST.find(c=>c.id===(m?.npc?.includes('彼得')?'petr':'jana'));}
export function adventureState(catalog,progress,level='Pre-A1'){
  const rows=new Map((progress?.missions||[]).map(p=>[p.id,p])),missions=(catalog?.missions||[]).filter(m=>m.level===level),completed=id=>rows.get(id)?.complete===true;
  const npcs=CAST.map(c=>{const list=missions.filter(m=>assigned(m)===c.id),summaries=list.map(m=>({id:m.id,title:m.title,goal:m.goal,origin:m.npc,complete:completed(m.id),done:rows.get(m.id)?.done||0,total:rows.get(m.id)?.total||m.task_count||m.tasks?.length||0})),next=summaries.find(m=>m.id===progress?.recommended)||summaries.find(m=>!m.complete)||summaries[0],done=summaries.filter(m=>m.complete).length,started=summaries.some(m=>m.done>0);
    return {...c,missions:summaries,next,nextId:next?.id||null,done,total:summaries.length,stage:!list.length?'explore':done===list.length?'recorded':started?'continuing':'new',greeting:!list.length?(c.id==='eva'?'这个阶段先练短声音，长原声以后会带着你一起听。':'这一级暂时没有交给我的委托，先去找有亮标记的伙伴。'):done===list.length?'这一组委托都留下记录了。想再试一次，或翻开另一组，都由你决定。':started?'你上次留下的练习还在。接着往前走，碰到没听清的就让对方再说一次。':c.intro};
  });
  const props=[{id:'sound-sign',cs:'a · á',zh:'长短音牌',xy:[-1765,-1477],mission:'F01',complete:completed('F01')},{id:'word-sign',cs:'káva',zh:'拼读招牌',xy:[-1745,-1410],mission:'F04',complete:completed('F04')},{id:'repeat-sign',cs:'Ještě jednou',zh:'再说一次',xy:[-1925,-1348],mission:'F09',complete:completed('F09')}];
  if(completed('F01')){const caseMission=catalog.missions.find(m=>m.id==='F01-CITY'),signal=caseMission?.tasks?.find(t=>t.kind==='order');if(caseMission)props.push({id:'square-signal',cs:'a → á',zh:'广场声音灯',xy:[-1815,-1468],mission:caseMission.id,complete:!!rows.get(caseMission.id)?.tasks?.[signal?.id]?.solved});}
  return {level,recommended:progress?.recommended||null,npcs,props,complete:missions.filter(m=>completed(m.id)).length,total:missions.length};
}
