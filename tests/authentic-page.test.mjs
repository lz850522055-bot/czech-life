import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {authenticPage,authenticNotes,playNativeSegment} from '../app/public/authentic.js';
const index=JSON.parse(fs.readFileSync(new URL('../content/authentic/manifest.json',import.meta.url),'utf8'));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button=(action,text,klass='',data='')=>`<button data-action="${action}" class="${klass}" ${data}>${text}</button>`;
test('联网补交后的历史片段只呈现当前素材记录，保留原ID并转义',()=>{
 const notes=[{text:'[真人听辨 native-groceries] 旧笔记',created_at:'today'},{text:'[真人听辨 native-long-navigation] <b>补交笔记</b>',created_at:'today'}];
 const html=authenticNotes('native-long-navigation',notes,esc);
 assert.ok(html.includes('&lt;b&gt;补交笔记&lt;/b&gt;'));assert.ok(!html.includes('旧笔记'));assert.equal((html.match(/native-note-text/g)||[]).length,1);
});
test('全部内容渲染旧字符串任务和新增结构化教材；答案与示范默认折叠',()=>{
 for(const c of index.clips){
  const html=authenticPage(index,c.id,[],{esc,button});
  assert.ok(html.includes(esc(c.title_zh)));assert.ok(!html.includes('[object Object]'));
  if(c.question_details){
   for(const q of c.question_details)assert.ok(html.includes(esc(q.prompt_zh))&&html.includes(esc(q.answer_points_zh[0])));
   for(const d of c.deep_dive)assert.ok(html.includes(esc(d.title_zh)));
   for(const t of c.transfer)assert.ok(html.includes(esc(t.sample_response_cs))&&html.includes(esc(t.rubric[0].met_zh)));
   assert.equal((html.match(/<summary>展开答案与原文依据<\/summary>/g)||[]).length,c.question_details.length);
   assert.ok(html.includes('新编教学示例（不是原录音）'));
  }
  assert.ok(!/<details\s[^>]*open/i.test(html));
 }
});
test('新增教材字段转义；缺音频状态不产生播放和下载入口',()=>{
 const changed=structuredClone(index),c=changed.clips[3],payload='<img src=x onerror=alert(1)>';
 c.deep_dive[0].analysis_zh=payload;c.transfer[0].sample_response_cs=payload;c.media.status='pending_local_generation';
 const html=authenticPage(changed,c.id,[],{esc,button});assert.ok(html.includes(esc(payload)));assert.ok(!html.includes(payload));
 assert.ok(html.includes('音频待本地生成'));assert.ok(!html.includes('<audio'));assert.ok(!html.includes('data-action="native-download"'));assert.ok(!html.includes('data-action="native-seek"'));
});
test('句子定位播放在真实结束位置停下，再次选择不会沿用旧边界',async()=>{
 const audio={currentTime:0,paused:true,ontimeupdate:null,pause(){this.paused=true;},async play(){this.paused=false;}};
 await playNativeSegment(audio,{start:12.4,end:15.2});assert.equal(audio.currentTime,12.4);assert.equal(audio.paused,false);
 audio.currentTime=15.1;audio.ontimeupdate();assert.equal(audio.paused,false);
 await playNativeSegment(audio,{start:22,end:24});audio.currentTime=23;audio.ontimeupdate();assert.equal(audio.paused,false);
 audio.currentTime=24;audio.ontimeupdate();assert.equal(audio.paused,true);assert.equal(audio.ontimeupdate,null);
 await assert.rejects(playNativeSegment(audio,{start:-1,end:2}),/位置无效/);
});
test('音频启动失败不留下错误的结束监听',async()=>{
 const audio={currentTime:0,ontimeupdate:null,pause(){},async play(){throw new Error('media unavailable');}};
 await assert.rejects(playNativeSegment(audio,{start:1,end:2}),/media unavailable/);assert.equal(audio.ontimeupdate,null);
});

test('不同语料正确显示自身许可和声道，来源不允许脚本URL',()=>{
 for(const c of index.clips){
  const html=authenticPage(index,c.id,[],{esc,button});
  if(c.id==='public-healthcare-continuous'){assert.ok(html.includes('CC BY 4.0'));assert.ok(html.includes('CC0 1.0'));assert.ok(html.includes('单声道'));assert.ok(!html.includes('A 在左声道'));} else if(c.id.startsWith('public-')){assert.ok(html.includes('CC BY 2.0'));assert.ok(html.includes('单声道'));assert.ok(!html.includes('A 在左声道'));assert.ok(!html.includes('CC BY-SA 3.0'));}
  else {assert.ok(html.includes('CC BY-SA 3.0'));assert.ok(html.includes('A 在左声道'));}
 }
 const edited=structuredClone(index),c=edited.clips.at(-1);c.source.url='javascript:alert(1)';c.source.license_url='javascript:alert(2)';
 assert.ok(!authenticPage(edited,c.id,[],{esc,button}).includes('javascript:'));
});
