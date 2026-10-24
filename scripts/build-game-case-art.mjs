import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from '../tools/game-renderer/node_modules/sharp/dist/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'app/public/game/scenes'),source=path.join(dir,'prague-archive-board-v1.png'),runtime=path.join(dir,'prague-archive-board-v1.webp');
await sharp(source).webp({lossless:true,effort:5}).toFile(runtime);const a=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(runtime).removeAlpha().raw().toBuffer();if(!a.data.equals(b))throw Error('Archive painting pixels changed');
const report={at:new Date().toISOString(),mode:'built-in image_gen',source:path.relative(root,source),runtime:path.relative(root,runtime),pixels:[a.info.width,a.info.height],source_bytes:fs.statSync(source).size,runtime_bytes:fs.statSync(runtime).size,rgb_identical:true,pixel_sha256:createHash('sha256').update(a.data).digest('hex')};fs.writeFileSync(path.join(root,'evidence/game-prague-20261024/case-art-audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
