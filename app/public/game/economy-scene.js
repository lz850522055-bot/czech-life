export function economySceneFor(state){
 const stage=state.building?.stage;
 if(stage==='materials')return {frame:1,label:'材料已到位'};
 if(stage==='foundation')return {frame:2,label:'基础已完成'};
 if(stage==='built'||stage==='open')return {frame:3,label:stage==='open'?'店门已打开':'建筑已完成'};
 return {frame:0,label:state.property?'教学场地已取得':'从一份虚拟委托开始'};
}
export function paintEconomyScene(canvas,state,{atlas,hero}={}){
 const c=canvas.getContext('2d'),{frame,label}=economySceneFor(state),w=canvas.width,h=canvas.height;
 c.clearRect(0,0,w,h);c.fillStyle='#18313c';c.fillRect(0,0,w,h);
 if(!atlas?.complete||!atlas.naturalWidth){c.fillStyle='#e6d4a9';c.textAlign='center';c.font='18px "Microsoft YaHei"';c.fillText('正在打开你的庭院…',w/2,h/2);return;}
 const tw=atlas.naturalWidth/2,th=atlas.naturalHeight/2,side=Math.min(tw,th),target=Math.max(w,h);
 c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(atlas,(frame%2)*tw,Math.floor(frame/2)*th,side,side,(w-target)/2,(h-target)/2,target,target);
 canvas.dataset.sceneFrame=String(frame);canvas.dataset.sceneStage=label;
 if(state.building?.stage==='open'){
  const light=c.createRadialGradient(w*.49,h*.73,1,w*.49,h*.73,w*.1);light.addColorStop(0,'#ffe5a65c');light.addColorStop(1,'#ffe5a600');c.fillStyle=light;c.fillRect(w*.36,h*.61,w*.28,h*.25);
  c.save();c.fillStyle='#f9e4b5';c.textAlign='center';c.font='bold 16px Georgia';c.shadowBlur=2;c.shadowColor='#30200b';c.fillText(state.store?.name||'U Liho',w*.646,h*.448,w*.19);c.restore();
 }
 if(hero?.complete&&hero.naturalWidth){const scale=Math.min(w/680,h/700);c.drawImage(hero,w*.51,h*.72,98*scale,147*scale);}
}
