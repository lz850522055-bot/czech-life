// Entrance markers belong to fictional teaching rooms in a real street layout.
// Street anchors are snapped to the bundled OSM graph by the build/QA checks.
export const CITY_DOORS=[
  {id:'petr-cups',cs:'Petrův obchod',zh:'彼得杯子店',kind:'shop',mission:'F11',facade:[-1809.5,-1492],approach:[-1810,-1478],intro:'先到门口，再进店与彼得确认数量和价钱。',scope:'虚构游戏店铺 · 小城区'},
  {id:'city-archive',cs:'Městský archiv',zh:'城市档案室',kind:'archive',mission:'C2-CITY-CASE',facade:[-1991,-1423],approach:[-1972,-1420],intro:'来查社区文件、留言与原声。可以先参观，不会改变你的零基础推荐。',scope:'虚构教学档案室 · 小城区'},
  {id:'mostecka-pickup',cs:'Petrův výdejní pult',zh:'彼得取货点',kind:'shop',mission:'F11-CITY',facade:[-1459,-1265],approach:[-1456,-1254],intro:'这次价钱变了。进店看清新价牌，再拿对杯子、确认金额。',scope:'虚构教学取货点 · Mostecká 莫斯特街'}
];
export function doorById(id){return CITY_DOORS.find(d=>d.id===id)||null;}
export function distanceToDoor(player,door){return Array.isArray(player)&&player.length===2&&player.every(Number.isFinite)&&door?Math.hypot(player[0]-door.approach[0],player[1]-door.approach[1]):Infinity;}
export function canEnterDoor(player,door){return distanceToDoor(player,door)<=24;}
export function doorReadiness(player,door){const distance=distanceToDoor(player,door);return {near:distance<=24,distance:Number.isFinite(distance)?Math.round(distance):null};}
export function foregroundDepth(object){return object.depth_y??object.bounds.top+object.bounds.height;}
export function actorBehindRoof(player,object){const b=object.bounds;return Array.isArray(player)&&player.length===2&&player.every(Number.isFinite)&&player[0]>=b.left&&player[0]<=b.left+b.width&&player[1]>=b.top&&player[1]<foregroundDepth(object);}
