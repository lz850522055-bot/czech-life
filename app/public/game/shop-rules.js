// Normalized floor coordinates belong to the authored fictional room, never to
// a fabricated real-world map. The convex polygon keeps walks off the walls.
export const SHOP_FLOOR=[[.18,.74],[.40,.55],[.59,.59],[.83,.68],[.83,.96],[.22,.96]];
export const SHOP_SPOTS={entrance:[.50,.90],shelf:[.34,.68],counter:[.70,.70],exit:[.22,.82]};
export function floorPoint(point,polygon=SHOP_FLOOR){
  const [x,y]=point;if(!Number.isFinite(x)||!Number.isFinite(y))return [...SHOP_SPOTS.entrance];
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
  if(inside)return [x,y];let best=null,distance=Infinity;
  for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))),p=[a[0]+t*dx,a[1]+t*dy],d=(p[0]-x)**2+(p[1]-y)**2;if(d<distance){best=p;distance=d;}}
  return best;
}
export function shopDraft(value={},max=2){
  return {position:floorPoint(Array.isArray(value.position)?value.position:SHOP_SPOTS.entrance),quantity:Number.isSafeInteger(value.quantity)?Math.max(0,Math.min(max,value.quantity)):0,total:typeof value.total==='string'&&/^\d{0,6}$/.test(value.total)?value.total:'',station:['shelf','counter'].includes(value.station)?value.station:'entrance'};
}
export function quantityWords(n){return n===1?'jeden hrnek':n===2?'dva hrnky':n===3?'tři hrnky':n===4?'čtyři hrnky':Number.isSafeInteger(n)&&n>=5?n+' hrnků':'空托盘';}
export function walkSample(walk,now){const part=Math.max(0,Math.min(1,(now-walk.start)/walk.duration));return {position:walk.from.map((v,i)=>v+(walk.to[i]-v)*part),done:part===1};}
