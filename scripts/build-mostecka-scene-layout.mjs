import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PROJECT_ROOT} from '../app/server/config.mjs';
const require=createRequire(new URL('../tools/game-renderer/package.json',import.meta.url)),{createCanvas,loadImage}=require('@napi-rs/canvas');
const base=path.join(PROJECT_ROOT,'app/public/game'),region=path.join(base,'regions/prague/v1'),out=path.join(PROJECT_ROOT,'design/画质修正_20261024/莫斯特街连续场景');fs.mkdirSync(out,{recursive:true});
const bounds={left:-1740,top:-1420,width:600,height:400},width=1536,height=1024,scale=width/bounds.width;
const data=JSON.parse(fs.readFileSync(path.join(region,'tiles/-1_-1.json'))),inside=a=>{const x=a.filter((_,i)=>!(i%2)),y=a.filter((_,i)=>i%2);return Math.max(...x)>=bounds.left&&Math.min(...x)<=bounds.left+bounds.width&&Math.max(...y)>=bounds.top&&Math.min(...y)<=bounds.top+bounds.height;};
const roads=data.roads.filter(r=>inside(r[3])&&!['construction','proposed','platform'].includes(r[1])),buildings=data.buildings.filter(b=>inside(b[2][0]));
const canvas=createCanvas(width,height),c=canvas.getContext('2d');c.fillStyle='#dbcead';c.fillRect(0,0,width,height);c.save();c.scale(scale,scale);c.translate(-bounds.left,-bounds.top);
for(const [id,kind,rings]of buildings){c.beginPath();for(const ring of rings){c.moveTo(ring[0],ring[1]);for(let i=2;i<ring.length;i+=2)c.lineTo(ring[i],ring[i+1]);c.closePath();}c.fillStyle=kind==='church'?'#498882':'#b77d60';c.fill('evenodd');c.lineWidth=.6;c.strokeStyle='#865c42';c.stroke();}
for(const [id,kind,name,xy]of roads){c.beginPath();c.moveTo(xy[0],xy[1]);for(let i=2;i<xy.length;i+=2)c.lineTo(xy[i],xy[i+1]);c.lineJoin=c.lineCap='round';c.strokeStyle='#faf1d6';c.lineWidth=name==='Mostecká'?11:['residential','living_street','unclassified'].includes(kind)?8:['footway','path','steps'].includes(kind)?2.6:5;c.stroke();}c.restore();
fs.writeFileSync(path.join(out,'layout-control.png'),canvas.toBuffer('image/png'));
// The overlap image is only an input guide. Runtime will retain the entire old
// scene above the new one; a generator cannot silently replace that artwork.
const old=JSON.parse(fs.readFileSync(path.join(base,'scenes/manifest.v1.json'))).scenes[0],art=await loadImage(path.join(base,old.image.replace('/game/','')));
const overlap={left:Math.max(bounds.left,old.bounds.left),top:Math.max(bounds.top,old.bounds.top),right:Math.min(bounds.left+bounds.width,old.bounds.left+old.bounds.width),bottom:Math.min(bounds.top+bounds.height,old.bounds.top+old.bounds.height)};
const ox=art.width/old.bounds.width,oy=art.height/old.bounds.height;
c.drawImage(art,(overlap.left-old.bounds.left)*ox,(overlap.top-old.bounds.top)*oy,(overlap.right-overlap.left)*ox,(overlap.bottom-overlap.top)*oy,(overlap.left-bounds.left)*scale,(overlap.top-bounds.top)*scale,(overlap.right-overlap.left)*scale,(overlap.bottom-overlap.top)*scale);
fs.writeFileSync(path.join(out,'layout-with-existing-overlap.png'),canvas.toBuffer('image/png'));
const layout={id:'mostecka-street-v1',name_cs:'Mostecká',name_zh:'莫斯特街',translation:'教学译名',bounds,pixel_size:[width,height],projection:'same offset EPSG:3857, y south; north up',overlap,roads,buildings,scope:'Authoring blueprint from existing OSM geometry. Exact facade appearance is illustrative. Runtime alignment not yet accepted.'};
fs.writeFileSync(path.join(out,'layout.json'),JSON.stringify(layout,null,2));console.log(JSON.stringify({out,roads:roads.length,buildings:buildings.length,overlap}));
