import fs from 'node:fs';
import path from 'node:path';
import {fail,validId} from './util.mjs';

export function authenticIndex(cfg) {
  const file=path.join(cfg.contentDir,'authentic/manifest.json');
  if(!fs.existsSync(file))return {version:1,clips:[],notice:'尚未安装真人听辨素材。'};
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  if(data.version!==1||!Array.isArray(data.clips))fail(500,'真人听辨清单格式无效。');
  return data;
}
export function authenticMedia(cfg,id) {
  if(!validId(id))fail(404,'素材不存在。');
  const clip=authenticIndex(cfg).clips.find(x=>x.id===id);
  if(!clip)fail(404,'素材不存在。');
  const relative=clip.media?.file;
  if(typeof relative!=='string'||!/^files\/[A-Za-z0-9_.-]+\.mp3$/.test(relative))fail(500,'素材路径无效。');
  const root=fs.realpathSync(path.join(cfg.contentDir,'authentic'));
  const file=path.join(root,relative);
  if(!fs.existsSync(file))fail(404,'素材文件缺失。');
  const real=fs.realpathSync(file);
  if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())fail(403,'素材路径越界。');
  return real;
}
