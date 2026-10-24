export const GATE_ART={width:1536,height:1024,start:[790,937],doors:[
  {x:412,y:155,w:326,h:622,plaque:[574,337],threshold:[574,780],path:[[0,622],[0,159],[10,104],[38,58],[78,23],[123,4],[164,0],[207,8],[251,31],[290,72],[316,123],[326,160],[326,622]]},
  {x:886,y:155,w:326,h:622,plaque:[1049,337],threshold:[1049,780],path:[[0,622],[0,159],[12,101],[46,57],[89,23],[133,4],[176,0],[218,10],[258,35],[292,77],[316,126],[326,166],[326,622]]}
]};
export const gateApplies=(mission,task)=>!!mission?.foundation&&task?.kind==='listen'&&task.options?.length===2;
const lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t*t*(3-2*t),clamp=t=>Math.max(0,Math.min(1,t));
export function gateMotion({door,correct,elapsed,reduced=false}){
  const target=GATE_ART.doors[door]?.threshold;if(!target)throw Error('Unknown gate');
  const total=correct?1550:950,t=reduced?total:Math.max(0,elapsed),approach=ease(clamp(t/(correct?650:450)));
  let player=[lerp(GATE_ART.start[0],target[0],approach),lerp(GATE_ART.start[1],target[1]+28,approach)],open=0,alpha=1,phase='approaching';
  if(correct&&t>=650){open=ease(clamp((t-650)/450));phase='opening';if(t>=1050){const enter=ease(clamp((t-1050)/500));player=[target[0],lerp(target[1]+28,target[1]-92,enter)];alpha=1-enter;phase=enter===1?'entered':'entering';}}
  if(!correct&&t>=450){const back=ease(clamp((t-450)/500));player=[lerp(target[0],GATE_ART.start[0],back),lerp(target[1]+28,GATE_ART.start[1],back)];phase=back===1?'closed':'returning';}
  return {player,open,alpha,phase,moving:t<total,done:t>=total};
}
