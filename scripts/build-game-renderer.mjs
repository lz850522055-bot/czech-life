import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../tools/game-renderer/node_modules/esbuild/lib/main.js';
import {brotliCompressSync,gzipSync,constants} from 'node:zlib';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),tools=path.join(root,'tools/game-renderer'),out=path.join(root,'app/public/game/vendor');
fs.mkdirSync(out,{recursive:true});
const result=await build({entryPoints:[path.join(tools,'vendor-entry.mjs')],outfile:path.join(out,'pixi-world-v1.js'),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',metafile:true});
const bundle=fs.readFileSync(path.join(out,'pixi-world-v1.js'));fs.writeFileSync(path.join(out,'pixi-world-v1.js.br'),brotliCompressSync(bundle,{params:{[constants.BROTLI_PARAM_QUALITY]:9}}));fs.writeFileSync(path.join(out,'pixi-world-v1.js.gz'),gzipSync(bundle,{level:9}));
const names=[...new Set(Object.keys(result.metafile.inputs).filter(k=>k.includes('/node_modules/')).map(k=>{const a=k.split('/node_modules/').at(-1).split('/');return a[0].startsWith('@')?a.slice(0,2).join('/'):a[0];}))];let notice='Vendored open-source game renderer. Rebuild: node scripts/build-game-renderer.mjs\n\n';
for(const name of names){const dir=path.join(tools,'node_modules',name),pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json'))),license=['LICENSE','LICENSE.txt','LICENSE.md','LICENSE-MIT','license','LICENSE-MIT.txt'].find(f=>fs.existsSync(path.join(dir,f))),licenseFile=license?path.join(dir,license):name==='@pixi/colord'?path.join(tools,'licenses/colord-MIT.txt'):null;if(!licenseFile)throw new Error('Missing bundled license: '+name);notice+=`${name} ${pkg.version}\nSource: ${typeof pkg.repository==='string'?pkg.repository:pkg.repository?.url}\n${fs.readFileSync(licenseFile,'utf8')}\n\n`;}
fs.writeFileSync(path.join(out,'LICENSES.txt'),notice);fs.writeFileSync(path.join(tools,'bundle-meta.json'),JSON.stringify(result.metafile,null,2));
console.log(JSON.stringify({bundle:'app/public/game/vendor/pixi-world-v1.js',bytes:fs.statSync(path.join(out,'pixi-world-v1.js')).size,licenses:names}));
