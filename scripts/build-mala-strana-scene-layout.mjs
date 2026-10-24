import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PROJECT_ROOT} from '../app/server/config.mjs';
const require=createRequire(new URL('../tools/game-renderer/package.json',import.meta.url)),{createCanvas}=require('@napi-rs/canvas');
const region=path.join(PROJECT_ROOT,'app/public/game/regions/prague/v1'),out=path.join(PROJECT_ROOT,'design/画质修正_20261024/小城区连续场景');fs.mkdirSync(out,{recursive:true});
const bounds={left:-2140,top:-1620,width:600,height:400},width=1536,height=1024,scale=width/bounds.width,roads=new Map(),buildings=new Map();
for(let a=Math.floor(bounds.left/2048);a<=Math.floor((bounds.left+bounds.width)/2048);a++)for(let b=Math.floor(bounds.top/2048);b<=Math.floor((bounds.top+bounds.height)/2048);b++){const f=path.join(region,`tiles/${a}_${b}.json`);if(!fs.existsSync(f))continue;const d=JSON.parse(fs.readFileSync(f,'utf8'));for(const r of d.roads)roads.set(r[0],r);for(const p of d.buildings)buildings.set(p[0],p);}
const inside=a=>{const xs=a.filter((_,i)=>!(i%2)),ys=a.filter((_,i)=>i%2);return Math.max(...xs)>=bounds.left&&Math.min(...xs)<=bounds.left+bounds.width&&Math.max(...ys)>=bounds.top&&Math.min(...ys)<=bounds.top+bounds.height;};
const selectedRoads=[...roads.values()].filter(r=>inside(r[3])),selectedBuildings=[...buildings.values()].filter(b=>inside(b[2][0])),canvas=createCanvas(width,height),c=canvas.getContext('2d');c.fillStyle='#dbcead';c.fillRect(0,0,width,height);c.scale(scale,scale);c.translate(-bounds.left,-bounds.top);
function pathRings(rings){c.beginPath();for(const a of rings){c.moveTo(a[0],a[1]);for(let i=2;i<a.length;i+=2)c.lineTo(a[i],a[i+1]);c.closePath();}}
for(const [id,kind,rings]of selectedBuildings){pathRings(rings);c.fillStyle=kind==='church'?'#3b817d':'#bd8365';c.fill('evenodd');c.lineWidth=.6;c.strokeStyle='#865c42';c.stroke();}
for(const [id,kind,name,xy]of selectedRoads){if(['construction','proposed','platform'].includes(kind))continue;c.beginPath();c.moveTo(xy[0],xy[1]);for(let i=2;i<xy.length;i+=2)c.lineTo(xy[i],xy[i+1]);c.lineJoin=c.lineCap='round';c.strokeStyle='#faf1d6';c.lineWidth=['residential','living_street','unclassified'].includes(kind)?8:['footway','path','steps'].includes(kind)?2.6:5;c.stroke();}
fs.writeFileSync(path.join(out,'layout-control.png'),canvas.toBuffer('image/png'));
const layout={id:'mala-strana-square-v1',name_cs:'Malostranské náměstí',name_zh:'小城区广场',bounds,pixel_size:[width,height],projection:'same EPSG:3857 offset and south-facing y as Prague region; north up',roads:selectedRoads,buildings:selectedBuildings,style_reference:'../用户指定画质标准.png',factual_sources:['OpenStreetMap snapshot 2026-10-23','IPR Praha snapshot 2026-10-23','https://www.stnicholas.cz/en/about-the-church/'],status:'layout for authored art, alignment and gameplay acceptance pending'};
fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(layout,null,2));console.log(JSON.stringify({roads:selectedRoads.length,buildings:selectedBuildings.length,out}));
