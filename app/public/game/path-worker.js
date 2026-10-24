// A* runs outside the UI thread. Shared OSM node IDs define connectivity.
let ready=null,xy,edge,weight,shapeOffset,shapeXY,offset,neighbors,edgeIndex,bounds;
async function load(){
  const r=await fetch('/game/regions/prague/v1/graph.bin');if(!r.ok)throw new Error('路网尚未加载');
  const b=await r.arrayBuffer(),h=new Uint32Array(b,0,8);if(h[0]!==0x435a4752||h[1]!==1)throw new Error('路网格式无效');
  const [n,m,s,p]=[h[2],h[3],h[4],h[5]];let at=32;
  xy=new Int32Array(b,at,n*2);at+=n*8;edge=new Int32Array(b,at,m*6);at+=m*24;
  weight=new Float32Array(b,at,m);at+=m*4;shapeOffset=new Uint32Array(b,at,s+1);at+=(s+1)*4;shapeXY=new Int32Array(b,at,p);
  if(at+p*4!==b.byteLength)throw new Error('路网数据不完整');
  const counts=new Uint32Array(n);
  for(let i=0;i<m;i++){const k=i*6,a=edge[k],c=edge[k+1],direction=edge[k+5];if(direction!==-1)counts[a]++;if(direction!==1)counts[c]++;}
  offset=new Uint32Array(n+1);for(let i=0;i<n;i++)offset[i+1]=offset[i]+counts[i];
  neighbors=new Uint32Array(offset[n]);edgeIndex=new Uint32Array(offset[n]);const cursor=offset.slice(0,n);
  for(let i=0;i<m;i++){const k=i*6,a=edge[k],c=edge[k+1],direction=edge[k+5];if(direction!==-1){const q=cursor[a]++;neighbors[q]=c;edgeIndex[q]=i;}if(direction!==1){const q=cursor[c]++;neighbors[q]=a;edgeIndex[q]=i;}}
  bounds=new Int32Array(m*4);for(let e=0;e<m;e++){const k=e*6,base=shapeOffset[edge[k+2]];let l=Infinity,t=Infinity,r=-Infinity,b=-Infinity;for(let j=edge[k+3];j<=edge[k+4];j++){const x=shapeXY[base+j*2],y=shapeXY[base+j*2+1];l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}bounds.set([l,t,r,b],e*4);}
  return n;
}
const near=(x,y)=>{let best=-1,d=Infinity;for(let i=0;i<xy.length/2;i++){if(offset[i]===offset[i+1])continue;const q=(xy[i*2]-x)**2+(xy[i*2+1]-y)**2;if(q<d){d=q;best=i;}}return best;};
class Heap{
  constructor(){this.a=[];}
  push(node,score){const v=[node,score];this.a.push(v);let i=this.a.length-1;while(i){const p=(i-1)>>1;if(this.a[p][1]<=score)break;this.a[i]=this.a[p];i=p;}this.a[i]=v;}
  pop(){if(!this.a.length)return null;const first=this.a[0],last=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1][1]<this.a[c][1])c++;if(this.a[c][1]>=last[1])break;this.a[i]=this.a[c];i=c;}this.a[i]=last;}return first[0];}
}
function nodeRoute(from,to){
  const start=Number.isInteger(from)?from:near(...from),end=Number.isInteger(to)?to:near(...to),n=xy.length/2;
  if(start<0||end<0||start>=n||end>=n)throw new Error('没有找到附近的可走道路');
  const g=new Float64Array(n);g.fill(Infinity);g[start]=0;
  const previous=new Int32Array(n);previous.fill(-1);const byEdge=new Int32Array(n);byEdge.fill(-1);const visited=new Uint8Array(n),open=new Heap();
  const estimate=i=>Math.hypot(xy[i*2]-xy[end*2],xy[i*2+1]-xy[end*2+1])*.6;
  open.push(start,estimate(start));let current,seen=0;
  while((current=open.pop())!==null){if(visited[current])continue;if(current===end)break;visited[current]=1;seen++;
    for(let k=offset[current];k<offset[current+1];k++){const next=neighbors[k],e=edgeIndex[k],score=g[current]+weight[e];if(score<g[next]){g[next]=score;previous[next]=current;byEdge[next]=e;open.push(next,score+estimate(next));}}
  }
  if(!Number.isFinite(g[end]))return {found:false,from:[xy[start*2],xy[start*2+1]],to:[xy[end*2],xy[end*2+1]],visited:seen};
  const chain=[];let v=end;while(v!==start){chain.push([previous[v],v,byEdge[v]]);v=previous[v];}chain.reverse();
  const points=[];
  for(const [a,,e]of chain){const k=e*6,shape=edge[k+2],lo=edge[k+3],hi=edge[k+4],base=shapeOffset[shape],forward=edge[k]===a;
    if(forward){for(let i=lo;i<=hi;i++)points.push([shapeXY[base+i*2],shapeXY[base+i*2+1]]);}
    else{for(let i=hi;i>=lo;i--)points.push([shapeXY[base+i*2],shapeXY[base+i*2+1]]);}
  }
  if(!points.length)points.push([xy[start*2],xy[start*2+1]]);
  return {found:true,distance_m:Math.round(g[end]),points,from:points[0],to:points.at(-1),visited:seen};
}
self.onmessage=async e=>{const {id,type,from,to}=e.data;try{await(ready ||= load());self.postMessage({id,...(type==='init'?{ready:true}:route(from,to))});}catch(error){ready=null;self.postMessage({id,error:error.message});}};

function geometry(e){const k=e*6,base=shapeOffset[edge[k+2]],p=[];for(let j=edge[k+3];j<=edge[k+4];j++)p.push([shapeXY[base+j*2],shapeXY[base+j*2+1]]);return p;}
function snap(point){
  if(Number.isInteger(point)){if(point<0||point>=xy.length/2)throw new Error('路网节点无效');return {node:point,point:[xy[point*2],xy[point*2+1]],distance:0};}
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))throw new Error('行走位置无效');
  let best=null,d=Infinity;
  for(let e=0;e<weight.length;e++){const b=e*4,dx=Math.max(bounds[b]-point[0],0,point[0]-bounds[b+2]),dy=Math.max(bounds[b+1]-point[1],0,point[1]-bounds[b+3]);if(dx*dx+dy*dy>d)continue;const k=e*6,base=shapeOffset[edge[k+2]];
    for(let j=edge[k+3];j<edge[k+4];j++){const x=shapeXY[base+j*2],y=shapeXY[base+j*2+1],vx=shapeXY[base+(j+1)*2]-x,vy=shapeXY[base+(j+1)*2+1]-y,part=Math.max(0,Math.min(1,((point[0]-x)*vx+(point[1]-y)*vy)/Math.max(1,vx*vx+vy*vy))),p=[x+vx*part,y+vy*part],q=(p[0]-point[0])**2+(p[1]-point[1])**2;if(q<d){d=q;best={e,segment:j-edge[k+3],part,point:p};}}
  }
  if(!best||d>500**2)throw new Error('点击位置离已收录的步行道路较远，请点附近街道');
  best.points=geometry(best.e);const lengths=[0];for(let j=1;j<best.points.length;j++)lengths.push(lengths.at(-1)+Math.hypot(best.points[j][0]-best.points[j-1][0],best.points[j][1]-best.points[j-1][1]));best.fraction=(lengths[best.segment]+(lengths[best.segment+1]-lengths[best.segment])*best.part)/Math.max(1,lengths.at(-1));best.distance=Math.sqrt(d);return best;
}
function anchors(s,starting){if(s.node!==undefined)return [{node:s.node,cost:0,points:[s.point]}];const k=s.e*6,dir=edge[k+5],out=[],left=[...s.points.slice(0,s.segment+1),s.point],right=[s.point,...s.points.slice(s.segment+1)];if(starting?dir!==1:dir!==-1)out.push({node:edge[k],cost:weight[s.e]*s.fraction,points:starting?left.reverse():left});if(starting?dir!==-1:dir!==1)out.push({node:edge[k+1],cost:weight[s.e]*(1-s.fraction),points:starting?right:right.reverse()});return out;}
function route(from,to){
  if(Number.isInteger(from)&&Number.isInteger(to))return nodeRoute(from,to);
  const a=snap(from),b=snap(to),starts=anchors(a,true),ends=anchors(b,false),n=xy.length/2,goals=new Map(ends.map(x=>[x.node,x]));
  let best=Infinity,last=-1,direct=null;
  if(a.e!==undefined&&a.e===b.e){const dir=edge[a.e*6+5],forward=b.fraction>=a.fraction;if(forward?dir!==-1:dir!==1){const lo=forward?a:b,hi=forward?b:a;direct=[lo.point,...lo.points.slice(lo.segment+1,hi.segment+1),hi.point];if(!forward)direct.reverse();best=weight[a.e]*Math.abs(a.fraction-b.fraction);}}
  const g=new Float64Array(n);g.fill(Infinity);const prev=new Int32Array(n);prev.fill(-1);const via=new Int32Array(n);via.fill(-1);const roots=new Map(),visited=new Uint8Array(n),open=new Heap(),estimate=i=>Math.hypot(xy[i*2]-b.point[0],xy[i*2+1]-b.point[1])*.6;
  for(const s of starts)if(s.cost<g[s.node]){g[s.node]=s.cost;roots.set(s.node,s);open.push(s.node,s.cost+estimate(s.node));}
  let current,seen=0;
  while((current=open.pop())!==null){if(visited[current])continue;if(g[current]+estimate(current)>best)continue;visited[current]=1;seen++;const end=goals.get(current);if(end&&g[current]+end.cost<best){best=g[current]+end.cost;last=current;direct=null;}
    for(let k=offset[current];k<offset[current+1];k++){const next=neighbors[k],e=edgeIndex[k],score=g[current]+weight[e];if(score<g[next]){g[next]=score;prev[next]=current;via[next]=e;roots.delete(next);open.push(next,score+estimate(next));}}
  }
  if(!Number.isFinite(best))return {found:false,from:a.point,to:b.point,visited:seen};let points=direct;
  if(!points){const chain=[];let v=last;while(prev[v]>=0){chain.push([prev[v],v,via[v]]);v=prev[v];}chain.reverse();points=[...roots.get(v).points];for(const [node,,e]of chain){const p=geometry(e);if(edge[e*6]!==node)p.reverse();points.push(...p);}points.push(...goals.get(last).points);}
  points=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.01);if(points.length===1)points.push([...points[0]]);
  return {found:true,distance_m:Math.round(best),points,from:a.point,to:b.point,snap_distance:[Math.round(a.distance),Math.round(b.distance)],visited:seen};
}
