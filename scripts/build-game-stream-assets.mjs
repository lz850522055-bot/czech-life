import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import sharp from '../tools/game-renderer/node_modules/sharp/dist/index.mjs';
import {paintTile,paintOverview} from '../app/public/game/world-paint.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'app/public/game'),region=path.join(base,'regions/prague/v1'),out=path.join(base,'stream-v1'),require=createRequire(new URL('../tools/game-renderer/package.json',import.meta.url)),{createCanvas,loadImage}=require('@napi-rs/canvas');
sharp.concurrency(1);
const write=async(canvas,file,maxWidth)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let image=sharp(data,{raw:{width:canvas.width,height:canvas.height,channels:4}});if(maxWidth)image=image.resize({width:maxWidth});await image.webp({lossless:true,effort:3}).toFile(file);};
if(!isMainThread){
  const textures={roof:await loadImage(path.join(base,'assets/roof-texture-v1.png')),ground:await loadImage(path.join(base,'assets/pavement-texture-v1.png'))},cache=new Map();
  parentPort.on('message',async job=>{try{
    if(!cache.has(job.key)){const data=JSON.parse(fs.readFileSync(path.join(region,'tiles',job.key+'.json'))),land=path.join(region,'../land-v1/tiles',job.key+'.json');data.landuse=fs.existsSync(land)?JSON.parse(fs.readFileSync(land)).areas:[];cache.set(job.key,data);while(cache.size>4)cache.delete(cache.keys().next().value);}
    const canvas=createCanvas(1,1),{a,b,span,pixels}=job,scale=pixels/span,bleed=1/scale;
    paintTile(canvas,cache.get(job.key),...job.key.split('_').map(Number),scale,textures,{left:a*span-bleed,top:b*span-bleed,size:span+2*bleed});
    await write(canvas,job.file);parentPort.postMessage({ok:true,file:job.file,bytes:fs.statSync(job.file).size});
  }catch(e){parentPort.postMessage({ok:false,error:e.stack});}});
}else{
  fs.mkdirSync(out,{recursive:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(region,'manifest.json'))),keys=new Set(manifest.tiles.map(a=>a[0]+'_'+a[1])),overview=createCanvas(1,1),ov=paintOverview(overview,JSON.parse(fs.readFileSync(path.join(region,'overview.json'))));
  await write(overview,path.join(out,'overview.webp'),768);
  const jobs=[],detail=[];
  for(const key of keys){const [a,b]=key.split('_').map(Number);jobs.push({key,a,b,span:2048,pixels:512,file:path.join(out,'base',key+'.webp')});}
  // Close-view geometry is baked ahead of visits, never reconstructed during a drag.
  for(let a=-16;a<8;a++)for(let b=-16;b<8;b++){const key=Math.floor(a*256/2048)+'_'+Math.floor(b*256/2048);if(!keys.has(key))continue;detail.push([a,b]);jobs.push({key,a,b,span:256,pixels:512,file:path.join(out,'detail256',a+'_'+b+'.webp')});}
  const missing=jobs.filter(j=>!fs.existsSync(j.file));let completed=jobs.length-missing.length,bytes=0;
  await Promise.all(Array.from({length:2},()=>new Promise((resolve,reject)=>{const worker=new Worker(new URL(import.meta.url));function next(){const job=missing.shift();if(!job){worker.terminate();resolve();}else worker.postMessage(job);}worker.on('message',m=>{if(!m.ok){worker.terminate();return reject(new Error(m.error));}completed++;bytes+=m.bytes;if(completed%100===0)console.log(`baked ${completed}/${jobs.length}`);next();});worker.on('error',reject);next();})));
  const scenes=JSON.parse(fs.readFileSync(path.join(base,'scenes/manifest.v1.json'))),sceneOutput=[];
  for(const scene of scenes.scenes){const image=sharp(path.join(base,scene.image.replace('/game/',''))),meta=await image.metadata(),levels=[];
    for(const factor of [.25,.5,1]){const width=Math.round(meta.width*factor),height=Math.round(meta.height*factor),level=levels.length,buffer=await image.clone().resize(width,height).raw().toBuffer(),files=[];
      for(let a=0;a<Math.ceil(width/512);a++)for(let b=0;b<Math.ceil(height/512);b++){const left=Math.max(0,a*512-1),top=Math.max(0,b*512-1),w=Math.min(width,(a+1)*512+1)-left,h=Math.min(height,(b+1)*512+1)-top,rel=`scenes/${scene.id}/${level}/${a}_${b}.webp`,dest=path.join(out,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});await sharp(buffer,{raw:{width,height,channels:meta.channels}}).extract({left,top,width:w,height:h}).webp({lossless:true,effort:4}).toFile(dest);files.push({a,b,left,top,width:w,height:h,url:'/game/stream-v1/'+rel});}
      levels.push({level,width,height,scale:width/scene.bounds.width,tiles:files});
    }sceneOutput.push({...scene,image:undefined,levels});
  }
  const result={version:'2026.10.24.stream.2',tile_size:512,gutter:1,encoding:'lossless WebP; source resolution retained',overview:{url:'/game/stream-v1/overview.webp',left:ov.left,top:ov.top,width:overview.width/ov.scale,height:overview.height/ov.scale},base:{span:2048,pixels:512,keys:[...keys]},detail:{dir:'detail256',span:256,pixels:512,keys:detail.map(a=>a.join('_'))},scenes:sceneOutput};
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result));
  const files=['overview.webp',...[...keys].map(k=>'base/'+k+'.webp'),...detail.map(a=>'detail256/'+a.join('_')+'.webp'),...sceneOutput.flatMap(s=>s.levels.flatMap(l=>l.tiles.map(t=>t.url.replace('/game/stream-v1/',''))))],size=files.reduce((n,f)=>n+fs.statSync(path.join(out,f)).size,0),evidence={date:new Date().toISOString(),referenced_tiles:files.length,referenced_bytes:size,base_tiles:keys.size,detail_tiles:detail.length,authored_scenes:sceneOutput.length,source_png_bytes:scenes.scenes.reduce((n,s)=>n+fs.statSync(path.join(base,s.image.replace('/game/',''))).size,0),source_scene_decode_bytes:scenes.scenes.reduce((n,s)=>n+s.pixels[0]*s.pixels[1]*4,0),compression:'lossless; not low-quality JPEG',runtime:'only visible tiles + bounded neighbor prefetch; no entire-city fetch'};
  fs.writeFileSync(path.join(root,'evidence/game-prague-20261024/stream-assets.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}
