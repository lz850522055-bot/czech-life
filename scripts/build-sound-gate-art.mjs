import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from '../tools/game-renderer/node_modules/sharp/dist/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'app/public/game/scenes'),sha=b=>createHash('sha256').update(b).digest('hex');
sharp.concurrency(1);const assets=[];
for(const state of ['closed','open']){
  const source=path.join(dir,'sound-gate-'+state+'-v1.png'),out=path.join(dir,'sound-gate-'+state+'-v1.webp');
  if(fs.existsSync(out))throw Error('Versioned art already exists; inspect before rebuilding');
  await sharp(source).webp({lossless:true,effort:5}).toFile(out);
  const original=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true}),runtime=await sharp(out).removeAlpha().raw().toBuffer();
  if(!original.data.equals(runtime))throw Error('Lossless scene pixels changed');
  assets.push({state,source:path.relative(root,source),runtime:path.relative(root,out),size:[original.info.width,original.info.height],source_bytes:fs.statSync(source).size,runtime_bytes:fs.statSync(out).size,pixels_sha256:sha(original.data),runtime_sha256:sha(fs.readFileSync(out)),identical_rgb:true});
}
const report={at:new Date().toISOString(),generation:'built-in image_gen; selected fine 2D reference; closed environment plus aligned open-door edit; no paid API',reference:'design/画质修正_20261024/用户指定画质标准.png',assets,scope:'Fictional sound courtyard. Paintings supply surface textures; actual letters, door motions, player and grading are runtime objects. No 3D model.'};
fs.writeFileSync(path.join(root,'evidence/game-prague-20261024/sound-gate-art.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({assets:assets.length,identical_rgb:true,bytes:assets.map(a=>a.runtime_bytes)}));
