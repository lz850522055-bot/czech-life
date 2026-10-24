import {facingFromDelta,poseFrame} from './actor-pose.js?v=1';
import {floorPoint,SHOP_SPOTS,shopDraft,quantityWords,walkSample} from './shop-rules.js?v=2';

let characterAssets;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=url=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('人物图片尚未加载，请返回后重试。'));im.src=url;});
function characters(){return characterAssets||=(async()=>{const r=await fetch('/game/assets/characters.v1.json');if(!r.ok)throw Error('人物资料尚未加载');const meta=await r.json(),[player,npcs]=await Promise.all([image(meta.player.url),image(meta.npcs.url)]);return {meta,player,npcs};})().catch(e=>{characterAssets=null;throw e;});}

// The background, actors, carry items and foreground counter are independent.
// Only the two small actor canvases repaint during walking; the room never
// redecodes/rebuilds its painting for each input or animation frame.
export function mountShop(host,panel,{task,initial={},feedback=null,onChange=()=>{},onSubmit=()=>{},onExit=()=>{},onError=()=>{}}={}){
  let state=shopDraft(initial,task.shop?.max_quantity||2),gone=false,assets=null,walk=null,raf=0,facing='north',lastPose='',pendingAction=null,ready=false,backgroundReady=false,lastMoveFrame=null,frames=[];
  const delivery=task.key==='parcel-receipt',objective=task.kind==='checkout',complete=feedback?.score===1,parcelHeld=delivery&&feedback?.complete===true;
  host.innerHTML=`<div class="shop-room" role="group" aria-label="小城区杯子店的室内场景"><img class="shop-room-art" src="/game/scenes/mala-strana-cup-shop-v1.webp" alt="石墙、木架与克朗价牌的布拉格游戏店铺"><canvas class="shop-actor shop-keeper" width="240" height="280" aria-label="店主彼得"></canvas><img class="shop-counter-foreground" src="/game/scenes/mala-strana-cup-shop-v1.webp" alt=""><canvas class="shop-actor shop-player" width="240" height="280" aria-label="你的独立游戏角色"></canvas><div class="shop-carry" aria-hidden="true"></div><button class="shop-hotspot shop-shelf" data-shop="shelf" aria-label="走到货架，拿取或放回杯子"><span>hrnek</span><small>杯子货架</small></button><button class="shop-hotspot shop-counter" data-shop="counter" aria-label="走到柜台，与店主彼得确认订单"><span>Petr · 彼得</span><small>店主 · 柜台</small></button><button class="shop-exit" data-shop="exit">‹ 返回街区</button><div class="shop-price-plaque" aria-label="当前游戏价牌"><b>1 hrnek</b><span>${esc(task.shop?.unit_price||80)} Kč</span><small>一只杯子 · 游戏标价</small></div><span class="shop-room-task">${esc(task.title)}</span><div class="shop-room-status" role="status">正在点亮店铺…</div><div class="shop-room-receipt" ${complete?'':'hidden'}><b>订单已确认</b><small>数量与总价已核对</small></div></div>`;
  if(delivery){
    const r=host.querySelector('.shop-room');r.setAttribute('aria-label','莫斯特街的教学取货柜台');r.dataset.delivery='true';
    host.querySelector('.shop-shelf').remove();host.querySelector('.shop-counter').setAttribute('aria-label','走到柜台，与彼得核对包裹');
    const plaque=host.querySelector('.shop-price-plaque');plaque.setAttribute('aria-label','教学包裹的取件标签');plaque.innerHTML='<b>Balíček</b><span>pro Janu</span><small>给雅娜 · číslo 24</small>';
    const prop=document.createElement('div');prop.className='shop-parcel-prop';prop.setAttribute('aria-label','彼得柜台上的24号教学包裹');prop.innerHTML='<b>24</b>';prop.hidden=parcelHeld;r.appendChild(prop);
  }
  const room=host.querySelector('.shop-room'),hero=host.querySelector('.shop-player'),keeper=host.querySelector('.shop-keeper'),carry=host.querySelector('.shop-carry'),status=host.querySelector('.shop-room-status'),bg=host.querySelector('.shop-room-art');
  const report=text=>{status.textContent=text;};
  const save=()=>{onChange({...state,position:[...state.position]});};
  function paint(canvas,img,spec,height){const ctx=canvas.getContext('2d'),[x,y,w,h]=spec.rect,scale=height/spec.visible[3];ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,x,y,w,h,canvas.width/2-w*scale*spec.anchor[0],canvas.height-h*scale*spec.anchor[1],w*scale,h*scale);}
  function placeHero(now=0,moving=false){
    const [x,y]=state.position;hero.style.left=(x*100)+'%';hero.style.top=(y*100)+'%';carry.style.left=(x*100)+'%';carry.style.top=(y*100)+'%';
    if(assets){const i=poseFrame(now,moving),key=facing+'|'+i;if(key!==lastPose){lastPose=key;paint(hero,assets.player,assets.meta.player.directions[facing][i],210);room.dataset.playerPose=key;}}
    room.dataset.playerPosition=JSON.stringify(state.position);room.dataset.walking=String(moving);
  }
  function tray(){if(delivery){carry.innerHTML=parcelHeld?'<span class="shop-held-parcel" aria-label="已领取的24号包裹">24</span>':'';return;}carry.innerHTML=Array.from({length:state.quantity},()=>'<img src="/game/assets/cup-item-v1.webp" alt="">').join('');room.dataset.quantity=String(state.quantity);}
  function controls(){
    if(!panel||delivery)return;
    panel.innerHTML=`<div class="shop-tray"><span class="shop-tray-heading">你的托盘</span><div class="shop-tray-items">${state.quantity?Array.from({length:state.quantity},()=>'<img src="/game/assets/cup-item-v1.webp" alt="一只杯子">').join(''):'<span>空托盘</span>'}</div><b>${quantityWords(state.quantity)}</b></div><div class="shop-controls"><button class="secondary" data-shop="shelf" ${complete?'disabled':''}>去货架拿 / 放杯子</button><button class="secondary" data-shop="counter" ${complete?'disabled':''}>走到柜台</button></div>${state.station==='shelf'&&!complete?`<div class="shop-stock-controls" role="group" aria-label="调整托盘数量"><button data-shop="less" class="secondary" ${!state.quantity?'disabled':''}>放回一只</button><span aria-live="polite">${state.quantity} 只</span><button data-shop="more" class="gold-button" ${state.quantity>=(task.shop?.max_quantity||2)?'disabled':''}>拿起一只</button></div><p class="shop-mini-note">先对照委托确认数量，再去柜台。可以随时放回，不扣分。</p>`:''}${state.station==='counter'&&objective&&!complete?`<form class="shop-checkout-form"><label for="shop-total">你向店主报出的总价</label><div class="shop-total-input"><input id="shop-total" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" value="${esc(state.total)}" aria-label="合计多少克朗"><span>Kč · 克朗</span></div><button class="gold-button" type="submit" ${state.quantity?'':'disabled'}>请店主确认</button></form>`:''}${complete?'<div class="shop-complete-note">'+(task.learning_context?'这张新价牌的委托已确认；条件改变时，要重新核对。':'这次委托已确认，杯子可以带走了。下一步换个数量再用一次。')+'</div>':''}<p class="shop-mini-note">游戏店铺 · 购物演练，与经营账本分开。</p>`;
  }
  function arrived(action){
    if(action==='exit'){save();onExit();return;}
    if(action==='shelf'){state.station='shelf';report(!objective?'货架上的杯子就在这里。先看旁边的线索和价牌，再把规律用到委托里。':complete?'可以继续逛店，已确认的订单不会重复提交。':'已走到货架。按委托拿取杯子，拿错可以放回。');}
    else if(action==='counter'){state.station='counter';report(delivery?'彼得在柜台后等你，请核对收件人和编号。':!objective?'店主在这里等你。先完成旁边这条线索，再来把数量与价钱说清。':complete?'店主已经确认这张游戏订单。':state.quantity?'已走到柜台。核对数量，再向店主报总价。':'托盘还是空的。先去货架拿杯子。');}
    else{state.station='entrance';report(delivery?'点柜台走近彼得，核对给雅娜的24号包裹。':'点货架拿杯子，点柜台与店主确认。');}
    controls();save();
  }
  function frame(now){
    raf=0;if(gone||!walk)return;const before=state.position,s=walkSample(walk,now);state.position=s.position;facing=facingFromDelta(state.position[0]-before[0],state.position[1]-before[1],facing);placeHero(now,!s.done);
    if(lastMoveFrame!==null)frames.push(now-lastMoveFrame);lastMoveFrame=now;if(frames.length>240)frames.shift();
    if(s.done){const action=walk.action;walk=null;room.dataset.motionSample=JSON.stringify({scope:'current browser room walk only',frames:frames.length,max_ms:Math.max(0,...frames),over_33ms:frames.filter(x=>x>33.5).length});arrived(action);}
    else raf=requestAnimationFrame(frame);
  }
  function move(to,action){
    if(!ready){pendingAction={to,action};report('场景正在展开，马上带你过去…');return;}
    cancelAnimationFrame(raf);const point=floorPoint(to),r=room.getBoundingClientRect(),distance=Math.hypot((point[0]-state.position[0])*r.width,(point[1]-state.position[1])*r.height),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce||distance<3){state.position=point;placeHero();arrived(action);return;}
    state.station='entrance';controls();walk={from:[...state.position],to:point,start:performance.now(),duration:Math.max(250,Math.min(2000,distance/220*1000)),action};lastMoveFrame=null;frames=[];report('正在走近'+(action==='shelf'?'货架':action==='counter'?'柜台':'…'));raf=requestAnimationFrame(frame);
  }
  function action(e){
    const button=e.target.closest('[data-shop]');if(!button||button.disabled)return;const a=button.dataset.shop;if(delivery&&['shelf','more','less'].includes(a))return;e.preventDefault();e.stopPropagation();
    if(a==='shelf'||a==='counter'||a==='exit'){move(SHOP_SPOTS[a],a);return;}
    if(!ready||complete||walk||state.station!=='shelf')return;
    if(a==='more')state.quantity=Math.min(task.shop?.max_quantity||2,state.quantity+1);
    if(a==='less')state.quantity=Math.max(0,state.quantity-1);
    tray();controls();save();report(state.quantity?'托盘现在有 '+state.quantity+' 只杯子。拿好后走到柜台。':'杯子已放回，托盘现在空了。');
  }
  function floor(e){if(e.target.closest('button')||!ready)return;const r=room.getBoundingClientRect();move([(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height],null);}
  function input(e){if(e.target.id==='shop-total'){const v=e.target.value.replace(/[^0-9]/g,'').slice(0,6);e.target.value=v;state.total=v;save();}}
  function submit(e){if(!e.target.matches('.shop-checkout-form'))return;e.preventDefault();if(complete||walk||!state.quantity||state.station!=='counter')return;if(!/^\d{1,6}$/.test(state.total)){report('先填写合计多少克朗，再让店主确认。');return;}save();onSubmit({quantity:state.quantity,total:Number(state.total)});}
  function tryReady(){if(gone||!assets||!backgroundReady)return;ready=true;room.dataset.ready='true';placeHero();paint(keeper,assets.npcs,assets.meta.npcs.characters.petr.body,230);keeper.style.left='76%';keeper.style.top='51%';report(delivery?'点地面行走 · 到柜台核对收件人与编号':'点地面行走 · 点货架拿杯子 · 点柜台确认');if(pendingAction){const p=pendingAction;pendingAction=null;move(p.to,p.action);}}
  const loaded=()=>{backgroundReady=true;tryReady();};bg.addEventListener('load',loaded);if(bg.complete&&bg.naturalWidth)loaded();
  const failed=()=>{if(!gone){report('店铺图片没有加载出来，返回后可重试；学习记录仍保留。');onError('店铺图片尚未加载。');}};bg.addEventListener('error',failed);
  characters().then(a=>{if(!gone){assets=a;tryReady();}}).catch(e=>{if(!gone){report(e.message);onError(e.message);}});
  host.addEventListener('click',action);room.addEventListener('click',floor);panel?.addEventListener('click',action);panel?.addEventListener('input',input);panel?.addEventListener('submit',submit);
  controls();tray();placeHero();
  return {getState:()=>({...state,position:[...state.position]}),destroy(){gone=true;cancelAnimationFrame(raf);save();bg.removeEventListener('load',loaded);bg.removeEventListener('error',failed);host.removeEventListener('click',action);room.removeEventListener('click',floor);panel?.removeEventListener('click',action);panel?.removeEventListener('input',input);panel?.removeEventListener('submit',submit);}};
}
