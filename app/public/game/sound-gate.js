import {GATE_ART,gateMotion} from './sound-gate-rules.js?v=1';
import {facingFromDelta,poseFrame} from './actor-pose.js?v=1';
const closed='/game/scenes/sound-gate-closed-v1.webp',opened='/game/scenes/sound-gate-open-v1.webp';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let assetPromise;
const image=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('门景图片暂未展开，请联网重试。'));im.src=src;});
function assets(){return assetPromise||=(async()=>{const r=await fetch('/game/assets/characters.v1.json');if(!r.ok)throw Error('人物资料暂未加载');const meta=await r.json(),[a,b,player]=await Promise.all([image(closed),image(opened),image(meta.player.url)]);return {closed:a,opened:b,player,meta};})().catch(e=>{assetPromise=null;throw e;});}
export const preloadSoundGate=()=>assets();
const pct=(value,base)=>100*value/base+'%';
function doorMarkup(option,index){
  const [caption,...ipa]=option.text.split(' ['),[letter,...hint]=caption.split(' · ');
  return `<div class="sound-gate-door" data-door-index="${index}" data-door-state="closed"><div class="sound-gate-surface sound-gate-open"></div><div class="sound-gate-leaf"><div class="sound-gate-surface"></div><div class="sound-gate-plaque"><b lang="cs">${esc(letter)}</b><small>${esc(ipa.length?'['+ipa.join(' ['):hint.join(' · '))}</small></div></div><button type="button" class="sound-gate-hit" data-gate-choice="${esc(option.id)}" aria-label="打开 ${esc(option.text)} 对应的门" disabled><span class="sr-only">${esc(option.text)}</span></button></div>`;
}
export function mountSoundGate(host,{options,heard=false,selected=null,feedback=null,onChoose=async()=>null,onError=()=>{}}={}){
  let gone=false,loaded=null,ready=false,busy=false,raf=0,facing='north',lastPose='',lastPlayer=GATE_ART.start,frames=[],previousFrame=null,runGeneration=0,lastDraw=null,boardSize=null;
  let answer=selected,result=feedback,hasHeard=heard;
  host.innerHTML=`<div class="sound-gate-art" role="group" aria-label="声音街的两扇实际门景"><img class="sound-gate-background" src="${closed}" alt="精细二维绘制的布拉格石拱门与藤蔓庭院">${options.map(doorMarkup).join('')}<div class="sound-gate-avatar" aria-label="你在门前的独立游戏角色"><i></i><canvas width="240" height="280"></canvas></div><span class="sound-gate-scene-note">声音街 · 虚构教学庭院</span><span class="sound-gate-motion-status" role="status">正在展开门前的小路…</span></div><div class="sound-gate-access"><span>门牌</span>${options.map((o,i)=>`<button class="secondary" data-gate-choice="${esc(o.id)}" disabled>${esc(o.text)}</button>`).join('')}</div>`;
  const board=host.querySelector('.sound-gate-art'),hero=host.querySelector('.sound-gate-avatar'),canvas=hero.querySelector('canvas'),ctx=canvas.getContext('2d'),note=host.querySelector('.sound-gate-motion-status'),doors=[...host.querySelectorAll('.sound-gate-door')];
  for(const [i,door]of doors.entries()){
    const d=GATE_ART.doors[i];Object.assign(door.style,{left:pct(d.x,GATE_ART.width),top:pct(d.y,GATE_ART.height),width:pct(d.w,GATE_ART.width),height:pct(d.h,GATE_ART.height),clipPath:'polygon('+d.path.map(([x,y])=>pct(x,d.w)+' '+pct(y,d.h)).join(',')+')'});
    for(const surface of door.querySelectorAll('.sound-gate-surface'))Object.assign(surface.style,{backgroundImage:`url('${surface.classList.contains('sound-gate-open')?opened:closed}')`,backgroundSize:pct(GATE_ART.width,d.w)+' '+pct(GATE_ART.height,d.h),backgroundPosition:pct(d.x,GATE_ART.width-d.w)+' '+pct(d.y,GATE_ART.height-d.h)});
  }
  boardSize={width:board.clientWidth,height:board.clientHeight};const observer=new ResizeObserver(()=>{if(gone)return;boardSize={width:board.clientWidth,height:board.clientHeight};if(lastDraw)draw(lastDraw.state,lastDraw.index,lastDraw.now);});observer.observe(board);
  const report=text=>{note.textContent=text;};
  function controls(){for(const b of host.querySelectorAll('[data-gate-choice]')){b.disabled=!ready||!hasHeard||busy||result?.score===1;b.setAttribute('aria-pressed',String(b.dataset.gateChoice===answer));}board.dataset.ready=String(ready);board.dataset.heard=String(hasHeard);}
  function paint(now,moving){if(!loaded)return;const index=poseFrame(now,moving),key=facing+'|'+index;if(key===lastPose)return;lastPose=key;const f=loaded.meta.player.directions[facing][index],[x,y,w,h]=f.rect,scale=210/loaded.meta.player.source_height;ctx.clearRect(0,0,240,280);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(loaded.player,x,y,w,h,120-w*scale*f.anchor[0],280-h*scale*f.anchor[1],w*scale,h*scale);board.dataset.playerPose=key;}
  function draw(state,index,now){
    lastDraw={state,index,now};const [x,y]=state.player;facing=facingFromDelta(x-lastPlayer[0],y-lastPlayer[1],facing);lastPlayer=state.player;hero.style.transform=`translate3d(${x/GATE_ART.width*boardSize.width}px,${y/GATE_ART.height*boardSize.height}px,0) translate(-50%,-100%)`;hero.style.opacity=String(state.alpha);paint(now,state.moving);
    doors.forEach((door,i)=>{const open=i===index?state.open:0;door.querySelector('.sound-gate-leaf').style.transform=`translateX(${-102*open}%)`;door.dataset.doorState=open===1?'open':open>0?'opening':'closed';});
    board.dataset.motion=state.phase;board.dataset.player=JSON.stringify(state.player);board.dataset.openDoor=state.open>0?String(index):'';
  }
  function settle(){busy=false;controls();report(result?.score===1?'门已经打开，你走进了庭院。可以继续下一条线索。':hasHeard?'门还关着。再听一次声音，试试另一扇门。':'先听声音，再把对应的门打开。');}
  function animate(index,correct){
    const generation=++runGeneration,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,start=performance.now(),phases=new Set();frames=[];previousFrame=null;
    const frame=now=>{if(gone||generation!==runGeneration)return;const state=gateMotion({door:index,correct,elapsed:now-start,reduced});if(previousFrame!==null)frames.push(now-previousFrame);previousFrame=now;draw(state,index,now);phases.add(state.phase);report(correct?(state.phase==='approaching'?'你走向选中的门…':state.phase==='opening'?'门扇正在打开…':'走进声音街的小庭院…'):'门没有打开，先回到门前再试。');if(state.done){board.dataset.motionSample=JSON.stringify({scope:'this browser and this door animation only',phases:[...phases],frames:frames.length,p95_ms:[...frames].sort((a,b)=>a-b)[Math.floor(frames.length*.95)]||0,max_ms:Math.max(0,...frames),over_33ms:frames.filter(n=>n>33.5).length});settle();}else raf=requestAnimationFrame(frame);};
    if(reduced)frame(start);else raf=requestAnimationFrame(frame);
  }
  async function choose(e){const b=e.target.closest('[data-gate-choice]');if(!b||b.disabled||busy||!ready||!hasHeard||result?.score===1)return;const index=options.findIndex(o=>o.id===b.dataset.gateChoice);if(index<0)return;busy=true;controls();try{const f=await onChoose(options[index].id);if(gone)return;if(!f){busy=false;controls();return;}answer=options[index].id;result=f;controls();animate(index,f.score===1);}catch(error){if(!gone){busy=false;controls();report('回应没有保存，门还未打开。可以重试。');onError(error.message);}}}
  host.addEventListener('click',choose);
  assets().then(value=>{if(gone)return;loaded=value;ready=true;const i=options.findIndex(o=>o.id===answer);if(i>=0&&result?.score===1){draw(gateMotion({door:i,correct:true,elapsed:1550,reduced:true}),i,0);report('上次已听对并打开这扇门，可以接着往下。');}else{draw({player:GATE_ART.start,open:0,alpha:1,phase:'waiting',moving:false},-1,0);report(hasHeard?'选一扇与你听到的声音对应的门。':'先听声音，再把对应的门打开。');}controls();}).catch(error=>{if(!gone){report(error.message);onError(error.message);}});
  return {setHeard(value,playing=false){hasHeard=value;board.classList.toggle('sound-gate-listening',playing);controls();if(ready&&!busy&&result?.score!==1)report(value?'选一扇与你听到的声音对应的门。':'先听声音，再把对应的门打开。');},isBusy:()=>busy,destroy(){gone=true;runGeneration++;cancelAnimationFrame(raf);observer.disconnect();host.removeEventListener('click',choose);}};
}
