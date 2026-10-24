import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {PROJECT_ROOT} from '../app/server/config.mjs';
import sharp from '../tools/game-renderer/node_modules/sharp/dist/index.mjs';
const base=path.join(PROJECT_ROOT,'app/public/game/scenes'),source=path.join(base,'mala-strana-square-v1.png');
const polygon=[[549,357],[590,351],[609,362],[620,344],[649,337],[665,349],[681,349],[700,376],[736,367],[754,356],[766,347],[769,327],[775,319],[780,332],[783,348],[790,351],[795,372],[819,381],[835,391],[835,424],[841,480],[828,507],[829,540],[895,562],[946,590],[976,633],[972,654],[911,674],[856,668],[808,656],[741,670],[682,669],[627,655],[589,649],[551,634],[541,584],[539,543],[540,499],[550,470],[550,423]];
const crop={left:539,top:319,width:438,height:356},scale=1536/600;
const mask=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${crop.width}" height="${crop.height}"><polygon points="${polygon.map(([x,y])=>`${x-crop.left},${y-crop.top}`).join(' ')}" fill="white"/></svg>`);
const rgba=await sharp(source).extract(crop).ensureAlpha().composite([{input:mask,blend:'dest-in'}]).raw().toBuffer();
const file=path.join(base,'st-nicholas-foreground-v1.webp');
await sharp(rgba,{raw:{width:crop.width,height:crop.height,channels:4}}).webp({lossless:true,effort:6}).toFile(file);
const decoded=await sharp(file).ensureAlpha().raw().toBuffer();assert.equal(decoded.length,rgba.length);
const original=await sharp(source).extract(crop).ensureAlpha().raw().toBuffer();let opaque=0,clear=0,visibleMismatch=0,alphaMismatch=0,transparentRGBChanges=0;
for(let i=0;i<rgba.length;i+=4){
  if(decoded[i+3]!==rgba[i+3])alphaMismatch++;
  const changed=decoded[i]!==rgba[i]||decoded[i+1]!==rgba[i+1]||decoded[i+2]!==rgba[i+2];
  if(rgba[i+3]&&changed)visibleMismatch++;else if(changed)transparentRGBChanges++;
  if(rgba[i+3]===255){assert.ok(rgba[i]===original[i]&&rgba[i+1]===original[i+1]&&rgba[i+2]===original[i+2]);opaque++;}if(rgba[i+3]===0)clear++;
}
assert.equal(alphaMismatch,0,'Alpha must be preserved');assert.equal(visibleMismatch,0,'All visible pixel colors must be preserved');
assert.ok(opaque>40000&&clear>5000);
const object={id:'st-nicholas',cs:'Kostel svatého Mikuláše',zh:'圣尼古拉教堂',url:'/game/scenes/st-nicholas-foreground-v1.webp',bounds:{left:-2140+crop.left/scale,top:-1620+crop.top/scale,width:crop.width/scale,height:crop.height/scale},depth_y:-1620+674/scale,scope:'layer cut from the existing authored illustration; artistic facade, not surveyed 3D geometry'};
fs.writeFileSync(path.join(base,'foreground.v1.json'),JSON.stringify({version:1,objects:[object]},null,2));
const report={at:new Date().toISOString(),method:'lossless game sprite extraction with polygon alpha; no generative repaint',source,source_sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),crop,polygon,opaque_pixels_preserved:opaque,clear_pixels:clear,visible_pixels_exact:true,alpha_exact:true,transparent_rgb_changes:transparentRGBChanges,bytes:fs.statSync(file).size,object};
fs.writeFileSync(path.join(PROJECT_ROOT,'evidence/game-prague-20261024/city-foreground-art.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({visible_pixels_exact:true,alpha_exact:true,transparent_rgb_changes:transparentRGBChanges,opaque_pixels_preserved:opaque,bytes:report.bytes}));
