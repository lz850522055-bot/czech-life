export function facingFromDelta(dx,dy,previous='south'){
  if(Math.abs(dx)+Math.abs(dy)<.001)return previous;
  return Math.abs(dx)>Math.abs(dy)?dx>0?'east':'west':dy>0?'south':'north';
}
export function poseFrame(now,moving){return moving?Math.floor(now/125)%4:1;}
export function stopShort(points,offset=0){
  if(points.length<2||offset<=0)return points;
  const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  const target=Math.max(0,lengths.at(-1)-offset);if(!target)return [points[0],points[0]];
  let i=1;while(i<lengths.length&&lengths[i]<target)i++;
  const a=points[i-1],b=points[i],t=(target-lengths[i-1])/Math.max(.0001,lengths[i]-lengths[i-1]);return [...points.slice(0,i),[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]];
}
