import {createRequestCache} from './request-cache.js';
import {installUpdateNotice} from './update-notice.js';
import {choiceOrder} from './choice-order.js';
import {listeningSession,listeningKey,projectListeningEvent,listeningComplete,listeningPage,bindListeningAudio,playListeningAudio} from './advanced-listening.js';
import {authenticPage,authenticNotes,playNativeSegment} from './authentic.js';
import {isChallengeNote,resolveChallengeRecord,challengePage,handleChallengeAction,challengeNote,collectChallengeInput} from './native-challenge.js';
import * as store from './storage.js';
import {buildHint} from './coaching.js';
import {scenarioKey,scenarioProgressKey,initialGame,choose,scenarioSnapshot,resolveScenarioGame,sceneCards,scenarioPage} from './scenarios.js';
import {api,setContext,queueEvent,queueRecording,pending,flush} from './sync.js';
import {audioCapabilities,czechVoices,playCzech,stopAudio,startRecording,stopRecording,isRecording,cancelRecordingRequest} from './audio.js';

const $=selector=>document.querySelector(selector);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const human=v=>typeof v==='string'?v:Array.isArray(v)?v.map(human).join('；'):v&&typeof v==='object'?Object.entries(v).map(([k,x])=>k+'：'+human(x)).join('；'):String(v??'');
const icons={home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',practice:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',review:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6M12 7v5l4 2"/>',ability:'<path d="M4 20V10M10 20V4M16 20v-8M22 20V7"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z"/>',content:'<path d="M4 3h12l4 4v14H4zM15 3v5h5M8 12h8M8 16h8"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',ear:'<path d="M8 18c0 5 7 5 7 0 0-4 5-4 5-9a8 8 0 0 0-16 0M8 10a4 4 0 0 1 8 0c0 3-4 3-4 6"/>',mic:'<rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',book:'<path d="M12 5c-3-3-7-3-10-1v16c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-2-7-2-10 1v16"/>',check:'<path d="m4 12 5 5L20 6"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',play:'<path d="m8 4 12 8-12 8z"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>'};
const icon=name=>`<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[name]||icons.book}</svg></span>`;
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 4 13 8-13 8z"/></svg>';
const skillNames={listening:'听懂',speaking:'开口表达',reading:'阅读理解',writing:'写作',interaction:'互动',mediation:'转述与解释'};
const errorNames={pronunciation:'发音',spelling:'拼写',inflection:'词形变化',meaning:'词义',collocation:'搭配',word_order:'语序',comprehension:'理解',fluency:'连贯表达'};
const labels={authentic:'真人听辨',home:'学习工作台',map:'课程地图',lesson:'课堂',practice:'练习场',review:'复习薄弱点',ability:'能力与证据',settings:'个人设置',content:'内容管理',scenario:'分支对话'};
const levelNames={'Pre-A1':'声音起步',A1:'生活入门',A2:'独立办事',B1:'说清想法',B2:'讨论协商',C1:'复杂表达',C2:'精确自如'};
const state={authentic:null,authenticId:null,nativeChallengeMode:null,nativeChallengeBusy:false,user:null,csrf:null,device:null,curriculum:null,progress:null,route:'home',lesson:null,tab:'text',step:0,foundationStep:0,filterLevel:'Pre-A1',filterSkill:'',filterScene:'',search:'',answers:{},assisted:{},showTranslation:true,audioSpeed:1,audioRepeat:1,report:null,ai:null,offlineIds:[],authMode:'login',initialized:true,recordings:[],practiceMode:'all',syncMessage:'正在连接',syncWarning:false,loading:false,authExpired:false,hintRounds:{},scenarios:[],scenario:null,scenarioGame:null,scenarioBusy:false};
let toastTimer,installEvent,renderGeneration=0,updateNotice=null,syncBatch=null,positionSyncTimer,warmTimer,progressFlight=null,practiceRequest=0;
const requests=createRequestCache();
const lessonCacheOptions=id=>({version:state.curriculum?.lessons.find(l=>l.id===id)?.version||'',maxAgeMs:300000});
function clearRequests(){requests.clear();clearTimeout(warmTimer);clearTimeout(positionSyncTimer);renderGeneration++;}
function schedulePositionSync(){clearTimeout(positionSyncTimer);positionSyncTimer=setTimeout(()=>{void synchronize({quiet:true});},350);}
function warmVisibleLessons(){
  clearTimeout(warmTimer);
  if(!state.user||state.authExpired||!navigator.onLine||document.hidden)return;
  const uid=state.user.id,generation=renderGeneration;
  const ids=[...new Set([...document.querySelectorAll('a[href^="#lesson/"]')].map(a=>decodeURIComponent(a.getAttribute('href').slice(8).split('?')[0])))].slice(0,2);
  warmTimer=setTimeout(()=>{
    if(state.user?.id!==uid||generation!==renderGeneration||document.hidden)return;
    // Only the next visible text lessons; never download audio or mark them offline.
    void Promise.allSettled(ids.map(id=>loadLesson(id)));
  },450);
}
function aiStatusHtml(){
  const usage=state.ai?.usage;
  return `<p>${esc(state.ai?.message||'正在读取可选 AI 状态；核心课程无需等待。')}</p>${usage?`<p class="small">今日请求 ${usage.requests||0} / ${state.ai.daily_limit}；输入 ${usage.input_tokens??'未报告'}、输出 ${usage.output_tokens??'未报告'} token。${usage.estimated_cost!==null?'配置价格估算 '+Number(usage.estimated_cost).toFixed(4)+' '+esc(state.ai.currency):'价格未配置，不显示虚构费用。'}</p>`:''}`;
}

const broadcast='BroadcastChannel'in window?new BroadcastChannel('czstudy-account-v1'):null;
const lessonLink=(id,tab='',step='')=>`#lesson/${encodeURIComponent(id)}${tab?'?tab='+tab+(step!==''?'&step='+step:''):''}`;
const date=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:state.user?.settings?.timezone||'Asia/Shanghai',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'暂无记录';
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),5500);}
function dialog(html){const d=$('#detail-dialog');d.innerHTML=`<button class="close-dialog" data-action="close-dialog" aria-label="关闭">×</button>${html}`;d.showModal();}
function errorBox(message){return `<div class="notice error" role="alert">${esc(message)}</div>`;}
function badge(text,klass=''){return `<span class="pill ${klass}">${esc(text)}</span>`;}
function empty(text,action=''){return `<div class="empty">${esc(text)}${action?'<div>'+action+'</div>':''}</div>`;}
function button(action,text,klass='',data=''){return `<button class="btn ${klass}" data-action="${action}" ${data}>${text}</button>`;}
function routeCards(){return state.curriculum?.lessons.filter(l=>l.kind==='lesson')||[];}
function currentExercise(){return state.lesson?.exercises?.[state.step];}
const answerKey=(lesson,exercise)=>lesson.id+'|'+lesson.version+'|'+exercise.id;
function listeningRecord(){
  const l=state.lesson;if(!l)return {};
  let record=structuredClone(state.progress?.listening?.[listeningKey(l)]||{});
  for(const entry of state.listeningPending||[]){
    const e=entry.event;if(e.lesson_id===l.id&&e.content_version===l.version&&(e.kind==='listening'||e.context?.activity==='advanced_listening')){if(!entry.error)record=projectListeningEvent(record,{...e,pending:true});else if(e.exercise_id){record.drafts||={};record.drafts[e.exercise_id]={text:e.answer,error:entry.error,pending:true,occurred_at:e.occurred_at};}}
  }
  record.drafts||={};
  const session=listeningSession(l);
  for(const id of [...(session?.exercise_ids||[]),'summary']){
    const local=state.drafts?.['listening|'+listeningKey(l)+'|'+id];
    const saved=record.drafts[id]||record.attempts?.[id]||record.summary;
    if(local?.at&&(!saved?.occurred_at||local.at>saved.occurred_at))record.drafts[id]={text:local.text,pending:true,occurred_at:local.at};
  }
  return record;
}
async function refreshListeningPending(){state.listeningPending=(await pending()).events;}
function nativeChallengeRecord(){
  const clip=state.authentic?.clips.find(c=>c.id===state.authenticId);
  return resolveChallengeRecord(clip,state.progress?.notes,state.listeningPending,state.user?.id);
}
// Read actual persisted values; an in-memory draft or an empty sync icon is not a save receipt.
async function updateSafety(){
  const [queued,drafts]=state.user?await Promise.all([pending(),store.get('kv','drafts:'+state.user.id)]):[{events:[],recordings:[]},{}];
  const result={hasUser:!!state.user,queuedEvents:queued.events.length,queuedRecordings:queued.recordings.length,rejected:queued.events.some(x=>x.error),preservedFields:[]};
  if(isRecording()||state.recordingForUpdate)return {...result,blocked:'录音正在进行或尚未存好。请先停止录音，等本机保存完成再刷新。'};
  if(state.nativeChallengeBusy||state.nativeSaving||state.scenarioBusy||state.updateFormSaves)return {...result,blocked:'当前正在保存，请稍等保存完成后再刷新。'};
  const clip=state.authentic?.clips.find(c=>c.id===state.authenticId);
  if(state.route==='authentic'&&clip?.c2_challenge&&state.nativeChallengeMode!=='standard'){
    const record=resolveChallengeRecord(clip,state.progress?.notes,queued.events,state.user?.id);
    const saved=record.draft?.answers||record.latest?.answers||{};
    for(const field of document.querySelectorAll('[data-native-answer]')){
      if(field.value.trim()!==String(saved[field.dataset.nativeAnswer]||'').trim())return {...result,blocked:'原声回答还有未保存的修改，请先保存回答或草稿，再刷新。'};
      result.preservedFields.push(field);
    }
    for(const field of document.querySelectorAll('[data-native-check]')){
      if(field.value!==(record.checks[field.dataset.nativeCheck]||'unrated'))return {...result,blocked:'逐项自检还有未保存的选择，请先保存自检，再刷新。'};
      result.preservedFields.push(field);
    }
  }
  if(state.lesson){
    for(const field of document.querySelectorAll('[data-listening-answer] [name="answer"]')){
      const id=field.closest('[data-listening-answer]').dataset.listeningAnswer;
      const saved=drafts?.['listening|'+listeningKey(state.lesson)+'|'+id]?.text;
      if(saved!==undefined&&String(saved)===field.value)result.preservedFields.push(field);
    }
    const field=document.querySelector('#answer-form [name="answer"]'),exercise=currentExercise();
    if(field&&exercise&&String(drafts?.[answerKey(state.lesson,exercise)]??'')===field.value)result.preservedFields.push(field);
  }
  return result;
}
function nativeChallengeView(){
  const clip=state.authentic?.clips.find(c=>c.id===state.authenticId);
  if(clip?.c2_challenge&&state.nativeChallengeMode!=='standard')return challengePage(state.authentic,clip,nativeChallengeRecord(),{esc,button});
  const back=clip?.c2_challenge?`<div class="button-row">${button('native-challenge-open','回到原声进阶回答与自检','secondary')}</div>`:'';
  return back+authenticPage(state.authentic,state.authenticId,state.progress?.notes,{esc,button});
}
function refreshNativeChallengeUIStatus(){
  if(state.route!=='authentic')return;
  const status=$('#native-challenge-status');if(!status)return;
  const record=nativeChallengeRecord(),entry=record.draft||record.latest;
  const saved=entry?.error?'本机记录尚未同步：'+entry.error:entry?.pending?'已保存在本机，等待联网同步':entry?'已同步到账号':'';
  status.textContent=(record.exposed?'本账号已展开本训练提示，之后保存均标为辅助作答，首次回答仍保留。':record.first?'首次回答已留存，可以复听或展开原文。':'先留下自己的回答，再展开原文与示范。')+' '+saved;
  const reveal=document.querySelector('[data-action="native-challenge-reveal"]');if(reveal)reveal.disabled=!record.first;
}

function refreshListeningUIStatus(){
  if(state.route!=='lesson'||state.tab!=='listening')return;
  const session=listeningSession(state.lesson),record=listeningRecord();if(!session)return;
  document.querySelectorAll('[data-listening-status]').forEach(node=>{
    const id=node.dataset.listeningStatus,entry=record.drafts?.[id]||(id==='summary'?record.summary:record.attempts?.[id]);
    if(entry)node.textContent=entry.error?'尚未接受：'+entry.error:(entry.pending?'已留在本机，等待联网同步':'已同步')+(record.drafts?.[id]?' · 草稿':' · 回答已保存');
  });
  const status=$('#listening-overall-message');if(status)status.textContent=record.exposed?'本账号已查看原文，后续属于辅助练习':listeningComplete(session,record)?'回答已留存，可以回看原文与依据':'原文未展开';
  const review=document.querySelector('[data-action="deep-review"]');if(review)review.disabled=!listeningComplete(session,record);
}

async function recordListeningExposure(reason){
  const l=state.lesson,session=listeningSession(l);if(!session||listeningRecord().exposed)return;
  await queueEvent(l,'listening',{session_id:session.id,action:'exposure',reason});await refreshListeningPending();
}
async function submitListening(form,values,intent){
  const l=state.lesson,session=listeningSession(l),id=form.dataset.listeningAnswer;
  const text=String(values.answer||'').trim(),record=listeningRecord();
  if(!session)throw new Error('当前课程没有可用听力材料。');
  if(!text&&intent!=='draft')throw new Error('先写下或选择你的回答。');
  if(intent==='draft')await queueEvent(l,'listening',{session_id:session.id,action:'draft',exercise_id:id==='summary'?null:id,text});
  else if(id==='summary')await queueEvent(l,'listening',{session_id:session.id,action:'summary',text},null,!!record.exposed);
  else await queueEvent(l,'exercise',text,id,!!record.exposed,{activity:'advanced_listening',session_id:session.id});
  if(state.drafts)delete state.drafts['listening|'+listeningKey(l)+'|'+id];
  await store.put('kv','drafts:'+state.user.id,state.drafts||{});await refreshListeningPending();
  await synchronize({quiet:true});
  if(state.lesson?.id===l.id&&state.lesson?.version===l.version&&state.tab==='listening')refreshListeningUIStatus();
}
function setAudioStatus(message){document.querySelectorAll('.audio-status').forEach(el=>el.textContent=message);}
function setSync(message,warning=false){state.syncMessage=message;state.syncWarning=warning;const el=$('#sync-state');if(el){el.dataset.action=state.authExpired?'reauth':'sync';el.className='sync-pill'+(warning?' warn':'');el.innerHTML=`<span class="dot ${warning?'offline':''}"></span>${esc(message)}`;}}
function navigation(){return `<a href="/game/">${icon('map')}捷语人生 · 城市冒险</a>`+[['home','首页','home'],['map','课程地图','map'],['practice','练习场','practice'],['authentic','真人听辨','ear'],['review','复习','review'],['ability','能力证据','ability'],['settings','个人设置','settings'],['content','内容管理','content']].map(([route,title,ico])=>`<a href="#${route}" class="${state.route===route?'active':''}">${icon(ico)}${title}</a>`).join('');}
function shell(content){
  const nav=[['home','学习','home'],['map','课程','book'],['practice','练习','practice'],['review','复习','review'],['settings','我的','settings']];
  const current=state.route==='lesson'?'map':['scenario','authentic'].includes(state.route)?'practice':['ability','content'].includes(state.route)?'settings':state.route;
  document.body.dataset.route=state.route;
  const main=`<main id="main" class="main flash-in">${content}</main>`;
  $('#app').innerHTML=`<div class="shell city-shell"><header class="city-header"><a class="brand city-brand" href="#home"><span class="city-brand-mark" aria-hidden="true">${icon('map')}</span><span>捷语<small>Čeština pro tvůj svět</small></span></a><nav class="city-nav" aria-label="主导航">${nav.map(([r,t,i])=>`<a href="#${r}" class="${current===r?'active':''}" ${current===r?'aria-current="page"':''}>${icon(i)}<span>${t}</span></a>`).join('')}</nav><div class="city-tools"><button id="sync-state" data-action="${state.authExpired?'reauth':'sync'}" class="sync-pill ${state.syncWarning?'warn':''}"><span class="dot ${state.syncWarning?'offline':''}"></span>${esc(state.syncMessage)}</button><details class="city-more"><summary aria-label="更多学习入口">${icon('settings')}</summary><nav aria-label="更多学习入口">${navigation()}${installEvent?`<button class="text-btn" data-action="install">安装到桌面</button>`:""}<button class="text-btn" data-action="logout">退出账号</button></nav></details><a class="avatar" href="#settings" aria-label="${esc(state.user.username)}的个人设置">${esc(state.user.username.slice(0,1))}</a></div></header><div class="work">${state.route==='lesson'?`<div class="city-class-scene"><aside class="lesson-landmark"><span class="eyebrow">在布拉格，遇见更大的世界</span><h2>城市探索</h2><nav aria-label="课堂入口"><a href="#home">${icon('home')}学习首页</a><a href="#map" class="active">${icon('book')}课程教学</a><a href="#practice">${icon('mic')}开口练习</a><a href="#authentic">${icon('ear')}真人听辨</a></nav></aside>${main}</div>`:main}</div><nav class="mobile-nav" aria-label="手机导航">${nav.map(([r,t,i])=>`<a href="#${r}" class="${current===r?'active':''}" ${current===r?'aria-current="page"':''}>${icon(i)}${t}</a>`).join('')}</nav></div>`;
  document.documentElement.style.setProperty('--font-size',(state.user.settings?.fontSize||17)+'px');
}
function heading(title,description,extra=''){return `<div class="page-heading"><div><div class="heading-label">一步一步，走进捷语</div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;}

const FOUNDATION_ID='Pre-A1-U01-L01';
const foundationSteps=[["a", "a", "[a]", "a", "和", "嘴自然张开，舌头放松。先发一个短而清楚的 a，收住就好。", "这里的 a 是声音，不是英语字母名“诶”。", "方括号 [a] 标声音；字母 a 是写法。先听，再看着字母模仿。"], ["long-a", "á", "[aː]", "má", "有；他/她有", "先合嘴发 m，再张口把后面的 a 保持稍长。口型保持，不要加第二个音。", "长音符表示声音时长，不是声调，也不等于重读。", "比较 a 和 má 里较长的 á。不要按固定秒数死数拍。"], ["e", "e", "[ɛ]", "ne", "不", "嘴比 a 收小一点，舌头向前抬一些；声音干净、短促。", "不要念成英语字母名，也不要在词尾加“诶伊”的滑动。", "ne 只有一个音节；先照着声音模仿，再看 [ɛ] 这个符号。"], ["i", "i / y", "[ɪ]", "my", "我们", "嘴角轻轻向两边，舌头抬高，但比长 í 放松一些。", "现代标准捷语里，短 i 和 y 读相同的元音。拼写区别以后结合辅音学习。", "my 的 y 发短 [ɪ]；先只听这个短词。"], ["long-i", "í / ý", "[iː]", "mít", "有（动词原形）", "嘴角轻展，舌面抬高，保持较长的 í，再在末尾收成 t。", "短 i [ɪ] 与长 í [iː] 不只时长不同，舌位也略有区别。", "ː 是拉长符号。先认识它的用途，不要求背完整音标表。"], ["o", "o", "[o]", "oko", "眼睛", "嘴唇收成圆形，保持同一口型；oko 分成 o-ko 两个音节。", "不要把一个 o 拖成英语式的双元音。", "先听完整短词，再自己把 o 和 ko 分开读。"], ["u", "u", "[u]", "ruka", "手", "嘴唇比 o 更收圆，舌头靠后抬高，读出短 u。", "ruka 中的 r 后面会单独练，现在先盯住 u 的圆唇口型。", "一个短词里只观察一个目标音，不要求现在就把全部声音都读好。"], ["long-u", "ú / ů", "[uː]", "dům", "房子", "保持圆唇，把 d 后的 ů 留得稍长，再合到末尾 m。", "ú 和 ů 在标准捷语里读同一个长元音。", "两种写法的拼写规律后面学；今天先让耳朵认出长 [uː]。"], ["c", "c", "[ts]", "cena", "价格", "舌尖先短暂阻住气流，再接上 s 的摩擦，连成一个起始辅音。", "捷语 c 不是英语的 k，也不是一个单独的 s。", "c-e-na：重点听第一个辅音 [ts]，不要额外加一个元音。"], ["ch-hook", "č", "[tʃ]", "čaj", "茶", "和 c 相比，舌位往后移一点；先阻气，再带摩擦放开。", "č 上的小钩会改声音；č 和 c 不能混用。", "čaj：先认出 č 的声音，再把后面的 aj 连起来。"], ["j", "j", "[j]", "já", "我", "舌面靠近硬腭，声音平滑滑向后面的长 á。", "捷语 j 不按英语 j 读成 [dʒ]。", "já 是一个音节；不要拆成两个。"], ["word", "káva", "[ˈkaːva]", "káva", "咖啡", "分成 ká-va：第一节的 á 保持长音，第二节的 a 是短音。", "重音 ˈ 和长音 ː 是两件事。捷语词重音通常在第一音节。", "现在才把声音连成一个能用的词：先短音，再长短对比，再拼读。"]].map(([key,letter,ipa,word,meaning,mouth,pitfall,task])=>({key,letter,ipa,word,meaning,mouth,pitfall,task}));
function foundationSection(){
 const i=Math.max(0,Math.min(foundationSteps.length-1,state.foundationStep)),s=foundationSteps[i];
 return `<article class="card foundation-card"><div class="badge-row"><span>零基础 · 字母与发音</span><span>第 ${i+1} / ${foundationSteps.length} 个声音点</span></div><h2>一次只学清一个声音。</h2><p>玩家，先看口型、听短音，再自己跟一遍。这里不用听懂整段捷语。</p><nav class="foundation-sounds" aria-label="选择一个发音点">${foundationSteps.map((p,n)=>`<button class="${n===i?'active':''}" data-action="foundation-step" data-step="${n}" aria-label="发音点 ${n+1}：${esc(p.letter)}">${esc(p.letter)}</button>`).join('')}</nav><div class="foundation-sound"><strong lang="cs">${esc(s.letter)}</strong><span class="foundation-ipa">${esc(s.ipa)}</span></div><div class="button-row">${button('foundation-play','听这个短音 / 短词','',`data-key="${s.key}"`)}${button('foundation-play','慢速再听一次','secondary',`data-key="${s.key}" data-slow="1"`)}${button('stop-audio','停止','secondary')}</div><div class="audio-status" role="status" aria-live="polite">单独的捷语合成短音轨，可反复听；先模仿，不要求一次学会。</div><p class="foundation-legend">${esc(s.task)}</p><section class="foundation-mouth"><h3>嘴巴和舌头怎么放</h3><p>${esc(s.mouth)}</p><p class="small">${esc(s.pitfall)}</p></section><div class="foundation-example"><span lang="cs">${esc(s.word)}</span><small>${esc(s.meaning)}</small></div><details class="foundation-check"><summary>跟读后，检查一下</summary><p>${i===1?'á 上的斜线表示什么？先自己说，再展开答案。':i===9?'c 和 č 的写法有什么不同？声音也一样吗？':`再看 ${esc(s.letter)}，离开示范声音自己发一次，再点播放比较。`}</p><details><summary>看提示</summary><p>${i===1?'表示长元音；不是中文声调，也不是让你用更大的力气读。':esc(s.pitfall)}</p></details></details><div class="exercise-footer">${button('foundation-step','前一个声音','secondary',`data-step="${Math.max(0,i-1)}" ${i===0?'disabled':''}`)}${i<foundationSteps.length-1?button('foundation-step','下一个声音 →','',`data-step="${i+1}"`):button('tab','把声音放回短词与句子 →','',`data-tab="text"`)}</div><details><summary>音标怎么看？</summary><p>字母是写法，方括号里的音标说明声音。[ ] 不用读出来；ː 表示长音；ˈ 标出重音。先把眼前用到的符号认熟，完整字母表和辅音规律在“规律与发音”里继续学。</p><a href="https://fonetika.ff.cuni.cz/en/czech-phonetics/" target="_blank" rel="noreferrer">查理大学语音学依据</a></details></article>`;
}

function home(){
  const p=state.progress||{},lessons=routeCards(),rec=p.recommendation||{lesson_id:lessons[0]?.id,reason:'先听声音，再用一个短句完成真实交流。'},lesson=lessons.find(x=>x.id===rec.lesson_id)||lessons[0],due=(p.reviews||[]).filter(r=>r.due_at<=new Date().toISOString());
  const next=lessonLink(lesson?.id||'Pre-A1-U01-L01',rec.tab||''),notes=(p.notes||[]).filter(n=>!isChallengeNote(n.text)),level=lesson?.level||'Pre-A1';
  return `<section class="discovery-hero"><div class="discovery-copy"><h1>按自己的节奏，<br>学会<span>捷语</span></h1><p>从布拉格出发，在真实的语言与文化中，<br>走向更大的世界。</p><a class="btn city-primary" href="${next}">${p.event_count?'继续学习':'从第一个声音开始'} ${icon('arrow')}</a></div></section>
  <section class="foundation-entry"><div><strong>捷语人生 · 城市冒险</strong><p>走进布拉格街区，从第一个声音开始。使用当前账号，原教材和学习记录继续保留。</p></div><a class="btn" href="/game/">进入游戏 →</a></section>
  <section class="foundation-entry"><div><strong>零基础，从字母和发音开始</strong><p>先学一个声音，再拼一个短词；高级课程可以浏览，起点一直留在这里。</p></div><a class="btn" href="#lesson/Pre-A1-U01-L01?tab=phonetics&step=0">从第一个声音开始 →</a></section><section class="journey-bar" aria-label="完整学习路径"><div><strong>学习路径</strong><small>从零基础到精确表达</small></div><nav>${(state.curriculum?.levels||[]).map(l=>`<a href="#map?level=${l}" class="journey-stop ${l===level?'current':''}"><span class="journey-dot"></span><strong>${l==='Pre-A1'?'零基础':l}</strong></a>`).join('')}</nav></section>
  <div class="discovery-grid"><section class="current-lesson card"><div class="current-lesson-copy"><div class="badge-row"><span>当前课程</span>${badge(level==='Pre-A1'?'Pre-A1':level)}<span class="small">${esc(levelNames[level]||'')}</span></div><h2>${esc(lesson?.title_zh||'先听声音，再看字母')}</h2><p>${esc(rec.reason)}</p><p>${esc(lesson?.can_do?.[0]||'听一遍，再跟读一遍。')}</p><a class="btn" href="${next}">继续学习 ${icon('arrow')}</a></div><div class="letter-postcards" aria-hidden="true"><span>Č</span><span>Ř</span><span>Čeština<small>Praha · tvoje cesta</small></span></div><div class="nearby-lessons">${lessons.filter(l=>l.level===level).slice(0,3).map((l,i)=>`<a href="${lessonLink(l.id)}">${icon(i===0?'play':'book')}<span><small>第 ${i+1} 课</small>${esc(l.title_zh)}</span></a>`).join('')}</div></section>
  <aside class="discovery-side"><section class="review-sun card"><h2>${icon('review')}需要再练的内容</h2>${due.length?due.slice(0,3).map(r=>`<a class="review-link" href="${lessonLink(r.lesson_id,'practice')}">${icon('ear')}<span>${esc(lessons.find(l=>l.id===r.lesson_id)?.title_zh||r.lesson_id)}<small>${esc(skillNames[r.skill_id]||'')} · ${esc(r.knowledge_point||'')}</small></span>${icon('arrow')}</a>`).join(''):`<a class="review-link" href="#practice">${icon('ear')}<span>先听声音，再开口<small>选一个场景，慢慢练习</small></span>${icon('arrow')}</a><a class="review-link" href="#authentic">${icon('mic')}<span>听听真实的捷语<small>原声、中文与听辨线索</small></span>${icon('arrow')}</a>`}<a class="text-btn" href="#review">${due.length?'查看全部 '+due.length+' 项复习':'查看我的复习记录'} →</a></section><div class="discovery-mini"><section class="card"><h3>${icon('book')}我的笔记</h3>${notes.length?`<a class="note-preview" href="${lessonLink(notes[0].lesson_id)}">${esc(notes[0].text)}</a>`:'<p>学到一个规律，<br>留下一句自己的理解。</p>'}<a class="text-btn" href="${next}">去课堂记一笔 →</a></section><section class="card"><h3><span class="dot ${state.syncWarning?'offline':''}"></span>同一个学习空间</h3><p>电脑和手机，<br>接着上次的地方学。</p><button class="text-btn" data-action="${state.authExpired?'reauth':'sync'}">${esc(state.syncMessage)} →</button></section></div></aside></div>
  <div class="section-title"><h2>今天，想把什么弄明白？</h2><a class="text-btn" href="#map">浏览完整课程 →</a></div><div class="grid city-choices"><a class="card route-card" href="#map?mode=grammar">${icon('book')}<h3>发现一个规律</h3><p>先比较，再理解，最后自己组织一句。</p></a><a class="card route-card" href="#practice?mode=speaking">${icon('mic')}<h3>在场景里开口</h3><p>购物、预约、工作，让捷语真的派上用场。</p></a><a class="card route-card" href="#authentic">${icon('ear')}<h3>听真实的声音</h3><p>抓住话题，再听改口、省略和言外之意。</p></a></div><details class="card recent-evidence"><summary>回看学习记录 · 已保存 ${p.event_count||0} 次</summary>${p.recent?.length?p.recent.slice(0,4).map(e=>`<div class="list-item"><div><h3>${esc(lessons.find(l=>l.id===e.lesson_id)?.title_zh||e.lesson_id)}</h3><p>${esc(e.feedback?.message||'已保存')} · ${date(e.occurred_at)}</p></div><a class="btn secondary small" href="${lessonLink(e.lesson_id)}">回看</a></div>`).join(''):'<p>从第一课开始，这里会留下你的学习足迹。</p>'}<a class="text-btn" href="#ability">查看能力证据 →</a></details>`;
}
function mapPage(){
  const all=routeCards(),filtered=all.filter(l=>(!state.filterLevel||l.level===state.filterLevel)&&(!state.filterSkill||l.skills.includes(state.filterSkill))&&(!state.filterScene||l.scene===state.filterScene)&&(!state.search||[l.title_zh,l.title_cs,l.scene,...l.knowledge_points].join(' ').toLowerCase().includes(state.search.toLowerCase())));
  const scenes=[...new Set(all.map(l=>l.scene))].filter(Boolean).sort();
  return `${heading('课程地图','看懂先修关系，也可以直接探索你关心的内容。')}<div class="tabs" role="group" aria-label="选择级别">${['',...(state.curriculum?.levels||[])].map(l=>`<button class="tab ${state.filterLevel===l?'active':''}" data-action="level" data-level="${l}">${l==='Pre-A1'?'零基础':l||'全部'}</button>`).join('')}</div><form id="map-filter" class="filter-bar"><label class="sr-only" for="map-search">搜索课程、场景或规律</label><input id="map-search" name="q" type="search" value="${esc(state.search)}" placeholder="搜索课程、场景或规律"><label class="sr-only" for="skill-filter">能力</label><select id="skill-filter" name="skill"><option value="">全部能力</option>${Object.entries(skillNames).map(([k,n])=>`<option value="${k}" ${state.filterSkill===k?'selected':''}>${n}</option>`).join('')}</select><label class="sr-only" for="scene-filter">场景</label><select id="scene-filter" name="scene"><option value="">全部场景</option>${scenes.map(s=>`<option ${state.filterScene===s?'selected':''}>${esc(s)}</option>`).join('')}</select><button class="btn secondary" type="submit">筛选</button></form><div class="section-title"><h2>${state.filterLevel?levelNames[state.filterLevel]:'完整路线'}</h2><span class="small">${filtered.length} 课 · ${filtered.reduce((a,l)=>a+l.exercise_count,0)} 道练习</span></div><div class="unit-grid">${filtered.map(l=>`<article class="card unit-card"><div class="unit-number">${esc(l.unit_id)}${state.offlineIds.includes(l.id)?' · 已下载':''}</div><div>${badge(l.level==='Pre-A1'?'零基础':l.level)} ${state.progress?.completed?.[l.id]?badge('学习已标记','gold'):badge(l.scene||'综合','outline')}</div><h3>${esc(l.title_zh)}</h3><p class="unit-description">${esc(l.can_do[0]||'独立完成本课情境任务')}</p><details><summary>先修与练习信息</summary><p>${l.prerequisites.length?l.prerequisites.map(id=>`<a href="${lessonLink(id)}">${esc(all.find(x=>x.id===id)?.title_zh||id)}</a>`).join('、'):'无需先修'} · ${l.exercise_count}题</p></details><div class="button-row"><a class="btn secondary small" href="${lessonLink(l.id)}">打开课程 ${icon('arrow')}</a><a class="text-btn" href="${lessonLink(l.unit_id+'-CHECK','practice')}">单元检验</a></div></article>`).join('')}</div>${filtered.length?'':empty('没有符合这些条件的课程，清除一个筛选即可继续。')}<div class="section-title"><h2>各级综合测评</h2><span class="small">新材料 · 分能力看证据</span></div><div class="button-row">${(state.curriculum?.levels||[]).map(l=>`<a class="btn secondary" href="${lessonLink(l+'-FINAL')}">${l==='Pre-A1'?'零基础':l} 测评</a>`).join('')}</div>`;
}
function wordMarkup(text,l){const terms=new Set((l.vocabulary||[]).map(v=>v.lemma?.toLocaleLowerCase('cs')));return String(text).split(/([\p{L}]+(?:[-’'][\p{L}]+)*)/u).map(w=>terms.has(w.toLocaleLowerCase('cs'))?`<button class="word" data-action="word" data-word="${esc(w)}">${esc(w)}</button>`:esc(w)).join('');}
function textSection(l){
  const sections=l.lesson_text||l.unseen_text||[],audio=l.audio_refs||[];
  return `<article class="card content-text"><div class="card-top"><h2>${(l.kind&&l.kind!=='lesson')?'先读新情境':'听见场景，再理解意思'}</h2><label class="translation-toggle"><input id="translation-toggle" type="checkbox" ${state.showTranslation?'checked':''}>中文</label></div><div class="text-tools">${button('play-all',icon('play')+' 连续播放','small')} ${button('stop-audio','停止','secondary small')}<label class="sr-only" for="audio-speed">播放速度</label><select id="audio-speed"><option value="1" ${state.audioSpeed===1?'selected':''}>正常速度</option><option value="0.8" ${state.audioSpeed===.8?'selected':''}>清晰慢速</option></select><label class="sr-only" for="audio-repeat">重复次数</label><select id="audio-repeat"><option value="1">播放一遍</option><option value="2" ${state.audioRepeat===2?'selected':''}>重复两遍</option><option value="3" ${state.audioRepeat===3?'selected':''}>重复三遍</option></select></div><div class="audio-status">${audio.some(r=>r.status==='generated')?'本课附捷语合成音频 · 正常与独立合成慢速 · 尚未经逐句母语听审':audioCapabilities().voices.length?'已检测到捷语语音 · 可逐句播放':'正在检查捷语语音；未提供音频时会明确提示'}</div><div>${sections.map((s,i)=>`<div class="sentence"><button class="play-button" data-action="play-sentence" data-index="${i}" aria-label="播放第 ${i+1} 段">${playIcon}</button><div><div class="cs" lang="cs">${wordMarkup(s.cs,l)}</div>${audio.filter(r=>r.role==='text_sentence'&&r.paragraph_index===i).length>1?`<div class="sentence-cues">${audio.filter(r=>r.role==='text_sentence'&&r.paragraph_index===i).map((r,j)=>`<button class="cue-button" data-action="play-cue" data-id="${r.id}" title="${esc(r.text)}" aria-label="播放本段第 ${j+1} 句：${esc(r.text)}">${playIcon} ${j+1}</button>`).join('')}</div>`:''}${state.showTranslation?`<div class="zh">${esc(s.zh)}</div>`:''}${s.note_zh&&state.user.settings?.detail!=='brief'?`<div class="note">${esc(s.note_zh)}</div>`:''}</div></div>`).join('')}</div>${l.listening?.script?.length?`<details><summary>独立听力脚本与理解重点</summary><p>${esc(l.listening.focus_zh)}</p>${button('play-listening','播放听力材料','secondary small')}<div class="audio-status"></div>${l.listening.script.map(s=>`<p lang="cs">${esc(s.cs)}</p>${state.showTranslation?`<p class="muted">${esc(s.zh)}</p>`:''}`).join('')}</details>`:''}</article>${l.vocabulary?.length?`<article class="card"><h2>带着语境记词</h2><p class="small">点词条看词形、搭配和易混点。</p><div class="vocab-grid">${l.vocabulary.map((v,i)=>`<button class="vocab-chip" data-action="vocab" data-index="${i}"><strong lang="cs">${esc(v.lemma)}</strong><span>${esc(v.meaning_zh)} · ${esc(v.pos)}</span></button>`).join('')}</div></article>`:''}<div class="button-row"><button class="btn" data-action="tab" data-tab="grammar">${(l.kind&&l.kind!=='lesson')?'查看评分量规':'发现规律'} ${icon('arrow')}</button></div>`;
}
function grammarSection(l){
  if(l.kind&&l.kind!=='lesson') return `<article class="card"><h2>如何看自己的表现</h2><p class="muted">按能力逐项对照；开放任务的自评不会变成系统自动认证。</p><ul class="rubric">${(l.rubric||[]).map(r=>`<li>${esc(human(r))}</li>`).join('')}</ul>${l.typical_performance?`<p class="wrap-text">${esc(human(l.typical_performance))}</p>`:''}${(l.remediation||[]).map(r=>`<div class="pitfall">${esc(r.condition_zh)}：${esc(r.action_zh)} ${(r.lesson_ids||[]).map(id=>`<a href="${lessonLink(id)}">${esc(id)}</a>`).join('、')}</div>`).join('')}</article><button class="btn" data-action="tab" data-tab="practice">开始分项测评 →</button>`;
  return `${(l.grammar||[]).map(g=>`<article class="card grammar-card"><div class="eyebrow">ONE RULE, IN CONTEXT</div><h2 class="rule">${esc(g.rule_zh)}</h2><div class="detail">${esc(g.detail_zh)}</div><div class="examples">${(g.examples||[]).map(e=>`<div lang="cs">${esc(e.cs)}</div><div class="zh">${esc(e.zh)}</div>`).join('')}</div>${g.pitfalls?.length?`<div class="pitfall"><strong>容易错在哪里</strong><ul>${g.pitfalls.map(p=>`<li>${esc(human(p))}</li>`).join('')}</ul></div>`:''}${g.exceptions?.length?`<details ${state.user.settings?.detail==='detailed'?'open':''}><summary>适用边界与例外</summary><p>${g.exceptions.map(x=>esc(human(x))).join('<br>')}</p></details>`:''}${g.term?`<details><summary>术语：${esc(g.term)}</summary><p>先掌握上面的意思和例子，再用这个术语检索相关规律。</p></details>`:''}</article>`).join('')}<article class="card"><h2>把规律放回声音里</h2>${l.level==='Pre-A1'?'<img class="articulation" src="/articulation.svg" alt="捷语a、i、u口型和r、ř舌位示意，配合本课声音模仿。">':''}<p>${esc(l.pronunciation?.focus_zh||'逐句对照示范，注意词的长短、清浊和句子重音。')}</p>${(l.pronunciation?.contrast||[]).map((c,i)=>`<div class="list-item"><div><strong lang="cs">${esc(c.a)} / ${esc(c.b)}</strong><p>${esc(c.note_zh)}</p></div><button class="btn secondary small" data-action="play-contrast" data-index="${i}">听对比</button></div>`).join('')}<p>${esc(l.pronunciation?.task_zh)}</p>${recordPanel()}</article><button class="btn" data-action="tab" data-tab="practice">自己试着用一次 →</button>`;
}
function recordPanel(){return `<div class="record-panel"><div class="button-row">${button('record-start',icon('mic')+' 开始录音','secondary small')}${button('record-stop','停止并保存','secondary small')}<span class="small">录音只供回放与量规对照</span></div><div class="small record-status" role="status" aria-live="polite">首次使用请允许麦克风；手机需要 HTTPS。</div><div class="record-playback"></div></div>`;}
function feedbackHtml(e,result){
  if(!result)return '';
  const f=result.feedback||result;
  const rawAnswer=f.model_answer??e.answer;
  const answerOption=e.type==='choice'?e.options?.find(o=>String(typeof o==='object'?o.id:o)===String(rawAnswer)):null;
  const visibleAnswer=answerOption?(typeof answerOption==='object'?answerOption.text:answerOption):rawAnswer;
  return `<div class="feedback ${f.score===0?'retry':f.score===null?'open':''}" role="status"><strong>${f.status==='correct'?'答对了':f.status==='try_again'?'再试一次':'对照下面的要点看看'}</strong><p>${esc(f.message)}</p><p>${esc(f.explanation||e.explanation_zh)}</p><div class="model"><small>${f.score===null?'参考表达，其他合理表达也可能成立':'本题参考答案'}</small><div lang="cs">${esc(human(visibleAnswer))}</div></div><p class="small">评分依据：${esc(f.scoring_basis||e.scoring_basis)}</p>${(f.rubric||e.rubric)?.length?`<ul class="rubric">${(f.rubric||e.rubric).map(r=>`<li>${esc(human(r))}</li>`).join('')}</ul>`:''}${f.score===null?`<div class="button-row">${['independent','with_help','retry'].map((r,i)=>button('self-review',['我独立完成了','需要参考帮助','还要再练'][i],'secondary small',`data-rating="${r}" data-event="${esc(result.event_id||'')}"`)).join('')}</div>`:''}<p class="small">${result.received_at?'已同步 · '+date(result.received_at):''}</p></div>`;
}
function practiceSection(l){
  const e=currentExercise();if(!e)return empty('没有找到本题，请返回课程选择。');
  const key=answerKey(l,e),history=state.progress?.latest?.[key],result=state.answers[key]||(history?.content_version===l.version?history:null),draft=state.drafts?.[key]||'';
  const activeType={choice:'听辨 / 理解选择',fill:'主动填空',correct:'找出并改正',order:'组织句子',writing:'写出你的表达',speaking:'说给自己听',interaction:'情境回应',mediation:'转述与解释'}[e.type];
  return `<article class="card"><div class="exercise-progress"><span>${badge(activeType,'blue')}</span><span>第 ${state.step+1} / ${l.exercises.length} 题</span></div><div class="exercise-nav" aria-label="练习导航">${l.exercises.map((x,i)=>`<button class="step-dot ${i===state.step?'current':''}" data-action="step" data-step="${i}" aria-label="第 ${i+1} 题">${i+1}</button>`).join('')}</div><h2 class="exercise-title">${esc(e.prompt_zh)}</h2>${e.audio_text_cs?`<div class="text-tools">${button('play-exercise',icon('ear')+' 播放题目音频','small')}<details><summary class="small">查看听力文本</summary><p lang="cs">${esc(e.audio_text_cs)}</p></details></div><div class="audio-status"></div>`:''}${e.stimulus_cs?`<div class="stimulus" lang="cs">${esc(e.stimulus_cs)}</div>`:''}<form id="answer-form"><input type="hidden" name="exercise" value="${e.id}">${e.type==='choice'?`<div class="answer-options">${choiceOrder(e.options,l.id+':'+l.version+':'+e.id).map((o,i)=>{const value=typeof o==='object'?o.id:o,text=typeof o==='object'?o.text:o;return `<label class="answer-option"><input type="radio" name="answer" value="${esc(value)}" ${draft===String(value)?'checked':''} required><span lang="cs">${esc(text)}</span></label>`;}).join('')}</div>`:`${e.type==='order'&&e.options?.length?`<div class="button-row">${e.options.map(o=>button('add-chunk',esc(typeof o==='object'?o.text:o),'secondary small',`data-text="${esc(typeof o==='object'?o.text:o)}"`)).join('')}${button('clear-answer','清空','secondary small')}</div>`:''}<label>你的${['speaking','interaction'].includes(e.type)?'文字提纲或录音后的自我记录':'回答'}<textarea id="answer-input" name="answer" required maxlength="20000" lang="cs" placeholder="试着自己组织捷语；保留 č、š、ř、ě、ů 等符号。">${esc(draft)}</textarea></label>`}${['speaking','interaction','mediation'].includes(e.type)?recordPanel():''}<div class="exercise-footer"><button class="btn" type="submit">提交并查看反馈 ${icon('arrow')}</button><button type="button" class="text-btn" data-action="hint">换一种提示</button></div></form><div id="exercise-feedback">${feedbackHtml(e,result)}</div><div class="button-row" id="ai-row">${button('ai-feedback','请求 AI 文字反馈','secondary small')}<small>可选；须联网并配置独立 API</small></div><div id="ai-feedback"></div><div class="exercise-footer"><button class="btn secondary" data-action="step" data-step="${Math.max(0,state.step-1)}" ${state.step===0?'disabled':''}>上一题</button>${state.step<l.exercises.length-1?button('step','下一题 →','',`data-step="${state.step+1}"`):button('tab','换条件完成任务 →','',`data-tab="transfer"`)}</div></article>`;
}
function transferSection(l){
  const t=l.transfer_task;
  return `<article class="card"><div class="eyebrow">TAKE IT INTO REAL LIFE</div><h2>${t?'换一个条件，再独立完成':'把测评结果变成下一步行动'}</h2><p>${esc(t?.prompt_zh||'回看各项表现，选择一个薄弱点，回到对应课程练习。')}</p>${t?`<form id="transfer-form" class="form-stack"><label>你的独立表达<textarea name="answer" required lang="cs" maxlength="20000"></textarea></label><button class="btn" type="submit">保存这次迁移表达</button></form><details><summary>完成后，再看参考表达与量规</summary><p class="wrap-text" lang="cs">${esc(t.model_answer_cs)}</p><ul class="rubric">${(t.rubric||[]).map(r=>`<li>${esc(human(r))}</li>`).join('')}</ul></details>`:''}<div id="transfer-feedback"></div><div class="thin-divider"></div><div class="button-row">${button('complete','标记本课学习完成', '')}<a class="btn secondary" href="${lessonLink(l.unit_id?l.unit_id+'-CHECK':l.level+'-FINAL')}">独立检验</a></div><p class="small">此标记用于继续学习的位置，不代表该级别已达标。</p></article><article class="card"><h2>告诉系统，接下来怎么调整</h2><div class="button-row">${[['confusing','解释没看懂'],['too_easy','太简单'],['too_hard','太难'],['change_topic','今天想换主题']].map(([v,n])=>button('learning-feedback',n,'secondary',`data-value="${v}"`)).join('')}</div><p>这些反馈会改变首页建议；你随时可以自行选课。</p></article>${l.review_links?.length?`<article class="card"><h2>关联复习</h2><div class="button-row">${l.review_links.map(id=>`<a class="btn secondary small" href="${lessonLink(id)}">${esc(routeCards().find(x=>x.id===id)?.title_zh||id)}</a>`).join('')}</div></article>`:''}`;
}
function lessonPage(){
  const l=state.lesson;if(!l)return empty('正在读取课程…');
  const tabs=[['text',(l.kind&&l.kind!=='lesson')?'新情境':'听与读'],['grammar',(l.kind&&l.kind!=='lesson')?'评分量规':'规律与发音'],['practice','自己练'],['transfer','迁移与回看']];
  if(listeningSession(l))tabs.unshift(['listening','先听再答']);
  if(l.id===FOUNDATION_ID)tabs.unshift(['phonetics','字母与发音起步']);
  const notes=state.progress?.notes?.filter(n=>n.lesson_id===l.id&&!isChallengeNote(n.text))||[];
  return `<div class="class-heading"><div class="badge-row">${badge(l.level==='Pre-A1'?'零基础':l.level)} ${badge(l.scene||'综合测评','outline')} ${state.offlineIds.includes(l.id)?badge('已下载','gold'):''}</div><h1>${esc(l.title_zh)}</h1>${l.level!=='Pre-A1'?`<p class="foundation-level-notice">这是 ${esc(l.level)} 级课程。<a href="#lesson/Pre-A1-U01-L01?tab=phonetics&step=0">零基础请从字母和发音开始 →</a></p>`:''}<p>${esc(l.intro_zh||'先理解新的材料，再分别完成各项任务。')}</p><div class="button-row"><a class="text-btn" href="#map?level=${l.level}">← 返回课程地图</a>${button('download-lesson',icon('download')+(state.offlineIds.includes(l.id)?'更新离线内容':'下载本课离线学'),'secondary small')}</div></div><div class="tabs">${tabs.map(([v,n])=>`<button class="tab ${state.tab===v?'active':''}" data-action="tab" data-tab="${v}">${n}</button>`).join('')}</div><div class="class-layout"><div class="class-body">${state.tab==='phonetics'?foundationSection():state.tab==='listening'?listeningPage(l,listeningRecord(),{esc,button,feedbackHtml,recordPanel,audioSpeed:state.audioSpeed}):state.tab==='text'?textSection(l):state.tab==='grammar'?grammarSection(l):state.tab==='practice'?practiceSection(l):transferSection(l)}</div><aside class="class-sidebar"><section class="card"><div class="eyebrow">THIS LESSON</div><h3>学完可以做什么</h3><ul>${(l.can_do||['理解新材料','独立组织表达','据量规定位需要补练的点']).map(t=>`<li>${esc(t)}</li>`).join('')}</ul><div class="badge-row">${(l.skills||[...new Set(l.exercises.flatMap(e=>e.skill_ids))]).map(s=>badge(skillNames[s]||s,'outline')).join('')}</div></section><section class="card"><h3>我的笔记</h3><form id="note-form" class="form-stack"><label class="sr-only" for="note-text">记下一句自己的理解</label><textarea id="note-text" name="text" maxlength="10000" required placeholder="记下一句自己的理解，或下次想问的问题。"></textarea><button type="submit" class="btn secondary small">保存笔记</button></form>${notes.slice(0,5).map(n=>`<div class="note-item">${esc(n.text)}<small><br>${date(n.created_at)}</small></div>`).join('')}</section><section class="card"><h3>版本与来源</h3><p class="small">${esc(l.id)}<br>教材版本 ${esc(l.version)}</p><details><summary class="small">校验状态与来源</summary><p class="small">原创教材；未完成逐句母语审校。</p>${(l.sources||[]).map(s=>`<p class="small">${esc(s.scope||s.source_id)}${s.url&&/^https:\/\//.test(s.url)?`<br><a href="${esc(s.url)}" target="_blank" rel="noreferrer">查看依据 ↗</a>`:''}</p>`).join('')}${(l.quality_notes||[]).map(n=>`<p class="small">${esc(n)}</p>`).join('')}</details></section></aside></div>`;
}
function practicePage(){
  const modes=[['all','综合任务'],['listening','听力'],['speaking','口语录音'],['writing','写作'],['interaction','场景对话'],['mediation','转述'],['grammar','语法规律'],['vocabulary','词汇检索']];
  const lessons=routeCards().filter(l=>(!state.filterLevel||l.level===state.filterLevel)&&(!state.search||[l.title_zh,l.scene].join(' ').includes(state.search)));
  return `${heading('练习场','选一种能力，用新的条件把表达做扎实。')}<div class="button-row"><a class="btn secondary" href="#authentic">真人听辨：听真实聊天 →</a></div><div class="tabs">${modes.map(([m,n])=>`<button class="tab ${state.practiceMode===m?'active':''}" data-action="practice-mode" data-mode="${m}">${n}</button>`).join('')}</div>${state.practiceMode==='interaction'?sceneCards(state.scenarios,{esc,button,badge}):''}${state.practiceMode==='vocabulary'?`<form id="vocab-search" class="filter-bar"><label class="sr-only" for="vocab-query">捷语词或中文意思</label><input id="vocab-query" name="q" type="search" placeholder="捷语词、中文意思或搭配"><button class="btn" type="submit">检索词汇</button></form><div id="vocab-results">${empty('输入一个词，查看它在课程中的变形、搭配和可听例句。')}</div>`:`<form id="practice-filter" class="filter-bar"><label class="sr-only" for="practice-level">级别</label><select id="practice-level" name="level"><option value="">全部级别</option>${state.curriculum.levels.map(l=>`<option value="${l}" ${state.filterLevel===l?'selected':''}>${l==='Pre-A1'?'零基础':l}</option>`).join('')}</select><label class="sr-only" for="practice-query">主题关键词</label><input id="practice-query" name="q" value="${esc(state.search)}" placeholder="主题关键词"><button class="btn secondary" type="submit">筛选</button></form><div class="unit-grid">${lessons.map(l=>`<article class="card unit-card"><div>${badge(l.level)} ${badge(l.scene,'outline')}</div><h3>${esc(l.title_zh)}</h3><p class="unit-description">${esc(l.can_do[0])}</p><div class="button-row">${button('practice-lesson','进入任务 →','secondary small',`data-id="${l.id}"`)}</div></article>`).join('')}</div>`}`;
}
function reviewPage(){
  const p=state.progress||{},reviews=p.reviews||[],due=reviews.filter(r=>r.due_at<=new Date().toISOString()),errors={};
  for(const s of Object.values(p.skills||{}))for(const[k,n]of Object.entries(s.errors||{}))errors[k]=(errors[k]||0)+n;
  return `${heading('复习，把会的留下来。','间隔由真实回答决定；用不同题型检验迁移，不因晚复习扣分。')}<div class="grid two"><section class="card"><div class="card-top"><h2>值得先处理的错因</h2>${badge('历史证据','outline')}</div>${Object.keys(errors).length?Object.entries(errors).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="list-item"><span>${errorNames[k]||esc(k)}</span><span class="small">${n} 条知识点证据</span></div>`).join(''):empty('还没有发现明确错因。先做几道独立练习。')}</section><section class="card"><h2>复习不只是重做原题</h2><p>先换一种问法或表达任务；如果还卡住，回到对应规律，再组织自己的句子。</p><div class="thin-divider"></div><div class="button-row">${button('mixed-review','开始混合复习','') }<a class="btn secondary" href="#settings">调整间隔</a></div><p class="small">到期 ${due.length} 项 / 全部 ${reviews.length} 项。无打卡或截止压力。</p></section></div><div class="section-title"><h2>按薄弱点回到场景</h2><span class="small">${due.length?'先显示已到期项目':'可以提前复习'}</span></div><div class="card">${reviews.length?reviews.slice(0,60).map(r=>`<div class="list-item"><div><h3>${esc(routeCards().find(l=>l.id===r.lesson_id)?.title_zh||r.lesson_id)}</h3><p>${skillNames[r.skill_id]} · ${esc(r.knowledge_point)}<br>${r.due_at<=new Date().toISOString()?'可以复习了':'下次参考时间 '+date(r.due_at)}</p></div>${button('review-lesson','换题复习','secondary small',`data-id="${r.lesson_id}" data-kp="${esc(r.knowledge_point)}"`)}</div>`).join(''):empty('复习队列会在客观题提交后建立；开放表达保留量规自评，不编造熟练度。')}</div>`;
}
function abilityPage(){
  const p=state.progress||{};
  return `${heading('能力，要有可回看的证据。','听、说、读、写分别记录；选择题答对，不自动推断你已经会说。')}<div class="grid">${Object.entries(skillNames).map(([id,label])=>{const s=p.skills?.[id]||{};return `<section class="card ability-card"><div class="card-top"><h2>${label}</h2>${badge(s.attempts||s.open_submissions?'正在积累':'暂无证据','outline')}</div><div class="evidence-number"><strong>${s.correct||0}<small> / ${s.attempts||0}</small></strong><small>符合答案的客观题证据</small></div><p>独立组织证据 ${s.independent||0} 条<br>开放表达提交 ${s.open_submissions||0} 条，待量规核对</p><p class="small">最近：${date(s.last_at)}</p><div class="error-tags">${Object.entries(s.errors||{}).map(([k,n])=>`<span>${errorNames[k]||esc(k)} ${n}</span>`).join('')}</div></section>`;}).join('')}</div><div class="notice">每道题可能对应多个知识点，因此证据条目不等于练习次数；上方分母是该能力已评分的知识点证据。这里不把课数或单一题型折算成 CEFR 等级。</div><div class="section-title"><h2>知识点表现与日期</h2><a class="text-btn" href="#review">去复习 →</a></div><div class="card table-wrap"><table><thead><tr><th>能力</th><th>知识点</th><th>客观题证据</th><th>独立完成日期数</th><th>最近证据</th></tr></thead><tbody>${Object.entries(p.skills||{}).flatMap(([skill,s])=>Object.entries(s.knowledge||{}).map(([kp,k])=>`<tr><td>${skillNames[skill]}</td><td>${esc(kp)}</td><td>${k.correct} / ${k.attempts}</td><td>${k.independent_dates.length}</td><td>${date(k.last_at)}</td></tr>`)).join('')||'<tr><td colspan="5">暂无证据；提交练习后会开始记录。</td></tr>'}</tbody></table></div><div class="section-title"><h2>录音回放</h2><span class="small">与参考声音和量规对照</span></div><div class="card">${p.recordings?.length?p.recordings.slice(0,20).map(r=>`<div class="list-item"><div><h3>${esc(routeCards().find(l=>l.id===r.lesson_id)?.title_zh||r.lesson_id)}</h3><p>${date(r.created_at)} · ${Math.round(r.bytes/1024)} KB</p><audio controls preload="none" src="/api/v1/recordings/${r.id}"></audio></div></div>`).join(''):empty('还没有同步的录音。课堂里的录音任务可以随时回放。')}</div>`;
}
function settingsPage(){
  const s=state.user.settings||{},voices=audioCapabilities(),usage=state.ai?.usage;
  return `${heading('按你的方式学习。','声音、讲解和复习节奏可以随时调整。',`<a class="btn secondary small" href="#ability">能力证据</a>`)}<div class="settings-layout"><div><section class="card"><h2>学习偏好</h2><form id="settings-form" class="form-stack"><label>兴趣场景（用逗号分开）<input name="interests" value="${esc((s.interests||[]).join('，'))}" placeholder="生活，工作，文化，购物"></label><label>今天想怎么学（可留空）<input name="dailyIntention" maxlength="120" value="${esc(s.dailyIntention||'')}" placeholder="例如：慢慢听一段，或写好一条工作消息"></label><label>中文讲解细度<select name="detail"><option value="brief" ${s.detail==='brief'?'selected':''}>简洁，先看核心</option><option value="normal" ${s.detail!=='brief'&&s.detail!=='detailed'?'selected':''}>正常，含例子与易错点</option><option value="detailed" ${s.detail==='detailed'?'selected':''}>详细，展开边界与术语</option></select></label><label>字号<select name="fontSize">${[15,16,17,18,20,22,24].map(n=>`<option value="${n}" ${(s.fontSize||17)===n?'selected':''}>${n} 像素</option>`).join('')}</select></label><label>记录显示时区<select name="timezone">${['Asia/Shanghai','Europe/Prague','Asia/Tokyo','UTC'].map(t=>`<option ${(s.timezone||'Asia/Shanghai')===t?'selected':''}>${t}</option>`).join('')}</select></label><label>复习间隔<select name="reviewScale"><option value="0.5" ${s.reviewScale===.5?'selected':''}>更密一些</option><option value="1" ${!s.reviewScale||s.reviewScale===1?'selected':''}>标准间隔</option><option value="2" ${s.reviewScale===2?'selected':''}>更松一些</option><option value="3" ${s.reviewScale===3?'selected':''}>保持宽松</option></select></label><label class="check-label"><input type="checkbox" name="reminders" ${s.reminders?'checked':''}>进入应用时提示到期复习（不发推送）</label><label>播放音量<input type="range" name="volume" min="0" max="1" step="0.1" value="${s.volume??1}"></label><label>默认播放速度<select name="speed"><option value="1" ${s.speed!==.8?'selected':''}>正常速度</option><option value="0.8" ${s.speed===.8?'selected':''}>清晰慢速</option></select></label><button class="btn" type="submit">保存偏好</button></form></section><section class="card"><h2>声音与权限</h2><p>${voices.voices.length?'检测到 '+voices.voices.map(v=>esc(v.name)+' ('+esc(v.lang)+')').join('、'):'没有检测到捷语系统语音；附带的课程音频仍可正常播放。系统语音试播需要安装捷语语音包。'}</p><p class="small">${voices.secure?'当前为安全上下文':'当前不支持麦克风安全上下文'} · ${voices.recording?'浏览器提供录音接口':'录音接口不可用'}</p><div class="button-row">${button('test-voice','试播捷语','secondary small')}${button('refresh-voices','重新检测','secondary small')}</div><div class="audio-status"></div></section></div><div><section class="card"><h2>这台设备与同步</h2><p>账号：${esc(state.user.username)}<br>最近同步：${date(state.progress?.server_time)}</p><div id="pending-info" class="notice">正在读取本机队列…</div><div class="button-row">${button('sync','立即同步','secondary')}${button('export','导出学习记录','secondary')}</div><div class="thin-divider"></div><h3>离线课程：${state.offlineIds.length} 课</h3><p class="small">只保存主动下载的课文和已有媒体。设备清理浏览器数据会移除尚未同步内容。</p>${state.offlineIds.map(id=>`<div class="list-item"><div><a href="${lessonLink(id)}">${esc(state.curriculum.lessons.find(l=>l.id===id)?.title_zh||id)}</a></div><button class="text-btn" data-action="drop-lesson" data-id="${id}">移除下载</button></div>`).join('')}<div class="button-row">${button('storage-persist','请求保留离线存储','secondary small')}${button('install-guide','手机添加到桌面','secondary small')}</div></section><section class="card"><h2>完整备份</h2><p>备份账号、进度、教材版本和录音到电脑上的本项目备份目录；恢复使用独立目录校验后切换。</p><div class="button-row">${button('backup','创建一致性备份','secondary')}</div><div id="backup-result"></div></section><section class="card"><h2>可选 AI 反馈</h2><div id="ai-status-content">${aiStatusHtml()}</div></section><section class="card"><h2>账号与密码</h2><form id="password-form" class="form-stack"><label>原密码<input type="password" name="old_password" required autocomplete="current-password"></label><label>新密码（至少12个字符）<input type="password" name="new_password" required minlength="12" maxlength="256" autocomplete="new-password"></label><button class="btn secondary" type="submit">修改密码并退出其他设备</button></form><p class="small">忘记密码可在登录页使用初始化时的恢复码；不依赖邮箱或短信。</p><button class="text-btn" data-action="logout">退出并清理本机私有缓存</button></section><div class="button-row"><a class="btn secondary" href="#content">内容管理</a><a class="btn secondary" href="#ability">能力证据</a></div></div></div>`;
}
function contentPage(){
  const report=state.report;
  return `${heading('内容管理','课程按文件与版本独立维护；更新教材保留历史回答。')}<section class="card"><div class="card-top"><h2>教材与媒体检查</h2>${button('content-report','重新检查','secondary small')}</div>${report?`<div class="table-wrap"><table><thead><tr><th>级别</th><th>实际课数</th><th>课堂练习</th><th>正文词数</th><th>测评份数</th></tr></thead><tbody>${Object.entries(report.counts).map(([l,n])=>`<tr><td>${l}</td><td>${n.lessons}</td><td>${n.exercises}</td><td>${n.words}</td><td>${n.assessments}</td></tr>`).join('')}</tbody></table></div><div class="notice">音频脚本 ${report.audio.scripts} 项；实有文件 ${report.audio.files} 个；未生成 ${report.audio.missing} 项。TTS 须由本设备实际检测到捷语语音后播放。</div><p class="small">${esc(report.native_review)}。${report.missing_units.length?'缺正文单元：'+report.missing_units.map(esc).join('、'):'覆盖骨架的单元均有课文文件。'}</p>`:empty('连接服务器后可核验实际内容统计。')}</section><div class="section-title"><h2>导入或修订一课</h2></div><section class="card"><p>选择符合教材契约的 JSON，先校验再导入。修改正文必须提高版本号；同一个 ID 与版本的已发布内容不能原地覆盖。</p><form id="content-import-form" class="form-stack"><label>课程 / 测评 JSON<input type="file" name="file" accept=".json,application/json" required></label><div class="button-row"><button class="btn secondary" type="submit" name="action" value="validate">只校验</button><button class="btn" type="submit" name="action" value="import">校验并导入</button></div></form><div id="import-result"></div></section>`;
}
function authPage(mode=state.authMode){
  state.authMode=mode;const setup=mode==='setup',recover=mode==='recover';
  $('#app').innerHTML=`<div class="auth-shell"><section class="auth-story"><a class="brand" href="#"><img src="/icon.svg" alt=""><span>捷语学习系统<small>ČEŠTINA</small></span></a><h1>听懂一个声音。<br>说清一件事情。<br>慢慢，拥有一种语言。</h1><p>从零基础到精确表达。中文讲解、真实场景，以及属于你自己的学习记录。</p><div class="auth-mark" aria-hidden="true">č</div><div class="eyebrow">LEARN AT YOUR OWN PACE</div></section><section class="auth-form-side"><div class="auth-form"><div class="eyebrow">YOUR PRIVATE LEARNING SPACE</div><h2>${setup?'创建你的私人账号':recover?'恢复账号':'回到你的学习空间'}</h2><p>${setup?'只需一个账号，电脑和手机继续同一条学习路线。':recover?'使用首次创建账号时保存的恢复码。':'登录后，从上次的位置继续。'}</p><form id="auth-form" class="form-stack">${setup?'<label>本机初始化口令<input type="password" name="setup_token" required autocomplete="off" placeholder="见启动窗口或 first-run-token.txt"></label>':''}<label>账号名<input name="username" required minlength="2" maxlength="60" autocomplete="username"></label>${recover?'<label>恢复码<input type="password" name="recovery_code" required autocomplete="off"></label>':''}<label>${recover?'新密码':setup?'设置密码（至少12个字符）':'密码'}<input name="${recover?'new_password':'password'}" type="password" required ${setup||recover?'minlength="12"':''} maxlength="256" autocomplete="${setup||recover?'new-password':'current-password'}"></label><button type="submit" class="btn">${setup?'创建账号，开始学习':recover?'重置密码':'登录'} ${icon('arrow')}</button></form><div id="auth-error" class="auth-error" role="alert"></div>${!setup?`<button class="text-btn" data-action="auth-mode" data-mode="${recover?'login':'recover'}">${recover?'返回登录':'忘记密码？使用恢复码'}</button>`:''}<div class="auth-footer">${setup?'初始化口令只存在本机，不是通用默认密码。':'离线学习仅对已登录并下载过内容的设备可用。'}<br>无需邮箱、短信或付费会员。</div></div></section></div>`;
}
async function loadLesson(id){
  const uid=state.user?.id;if(!uid)throw new Error('请先登录');
  if(state.authExpired){const error=new Error('请重新登录；本机记录保留。');error.status=401;throw error;}
  if(state.lesson?.id===id&&!navigator.onLine)return state.lesson;
  const endpoint='/lessons/'+encodeURIComponent(id);
  try{return await requests.get(uid,endpoint,()=>api(endpoint),lessonCacheOptions(id));}
  catch(error){
    if(error.status===401||error.status===403){requests.clear();if(state.user?.id===uid)state.authExpired=true;throw error;}
    const cached=await store.readCachedJson(uid,'/api/v1/lessons/'+id);if(cached)return cached;throw error;
  }
}
async function saveSession(){await store.put('kv','session',{user:state.user,csrf:state.csrf,device:state.device});setContext(state.user,state.csrf,state.device);}
async function updatePending(){
  if(!state.user)return;
  const p=await pending(),n=p.events.length+p.recordings.length;
  if($('#pending-info'))$('#pending-info').innerHTML=`本设备待同步 ${n} 项（练习等 ${p.events.length}、录音 ${p.recordings.length}）。${p.events.some(x=>x.error)?'<br>有被服务器拒绝的事件；原文仍在本机，请导出后检查版本与时间。':''}`;
  if(!navigator.onLine)setSync(`离线 · 待同步 ${n} 项`,true);else if(n)setSync(`待同步 ${n} 项`,true);
  return n;
}
async function refreshProgress(){
  if(!state.user)return;
  const uid=state.user.id,job={uid,promise:null};progressFlight=job;
  const newer=()=>progressFlight!==job&&progressFlight?.uid===uid?progressFlight.promise:null;
  job.promise=(async()=>{
    try{
      const p=await api('/progress');if(state.user?.id!==uid)return;
      if(newer())return newer();
      state.progress=p;await store.put('kv','progress:'+uid,p);
      // Gates such as first-answer disclosure must wait for the newest fetch too.
      if(newer())return newer();return p;
    }catch(error){if(state.user?.id===uid&&newer())return newer();throw error;}
  })();
  return job.promise;
}
async function refreshScenarioGame(redraw=false){
  const scene=state.scenario,uid=state.user?.id;
  if(state.route!=='scenario'||!scene||!uid)return;
  const local=await store.get('kv',scenarioKey(state.user,scene)),queued=await pending();
  if(state.user?.id!==uid||state.route!=='scenario'||state.scenario!==scene)return;
  const next=resolveScenarioGame(scene,state.progress?.scenarios?.[scenarioProgressKey(scene)],queued.events,local);
  const changed=JSON.stringify(next)!==JSON.stringify(state.scenarioGame);
  state.scenarioGame=next;await store.put('kv',scenarioKey(state.user,scene),next);
  if(redraw&&changed)render();
}
async function synchronize(options={}){
  const uid=state.user?.id;if(!uid)return {results:[]};
  if(syncBatch?.uid===uid){
    const result=await syncBatch.promise;
    if(state.user?.id!==uid||result?.error||!navigator.onLine)return result;
    const queued=await pending(),attempted=new Set((result?.results||[]).map(r=>r.event_id));
    // An answer created during a position upload must get its own acknowledgement.
    if([...queued.events.map(x=>x.event),...queued.recordings].some(x=>!attempted.has(x.event_id))){
      const next=await synchronize(options);return {...next,results:[...(result?.results||[]),...(next?.results||[])]};
    }
    if(!options.quiet&&!queued.events.length&&!queued.recordings.length)toast('服务器已确认，学习记录已同步。');
    return result;
  }
  const batch={uid,promise:null};syncBatch=batch;
  batch.promise=synchronizeNow(options).finally(()=>{if(syncBatch===batch)syncBatch=null;});
  return batch.promise;
}
async function synchronizeNow({quiet=false}={}){
  if(!state.user)return;
  if(!navigator.onLine){await updatePending();if(!quiet)toast('当前离线，回答与录音留在这台设备，联网后会补交。');return {results:[]};}
  const uid=state.user.id;setSync('正在同步');
  try{
    const result=await flush();if(state.user?.id!==uid)return result;
    await refreshProgress();await refreshListeningPending();refreshListeningUIStatus();refreshNativeChallengeUIStatus();await refreshScenarioGame(true);const left=await updatePending();if(!left)setSync('已同步');
    const nativeHistory=$('#native-history');
    if(state.route==='authentic'&&nativeHistory)nativeHistory.innerHTML=authenticNotes(state.authenticId,state.progress?.notes,esc);
    // Refresh the visible answer after a queued offline attempt is acknowledged.
    // Keep the current draft and focus; do not redraw the entire lesson.
    if(!left&&state.lesson){
      const exercise=currentExercise();
      if(exercise){
        const key=answerKey(state.lesson,exercise),accepted=state.progress?.latest?.[key];
        if(accepted?.content_version===state.lesson.version){
          state.answers[key]=accepted;
          const feedback=$('#exercise-feedback');
          if(feedback)feedback.innerHTML=feedbackHtml(exercise,accepted);
        }
      }
    }
    const error=result.results?.find(r=>!r.ok);if(error&&!quiet)toast(error.error);
    if(!quiet&&!left)toast('服务器已确认，学习记录已同步。');
    return result;
  }catch(error){if(error.status===401)state.authExpired=true;setSync(error.status===401?'点此重新登录 · 记录保留':'暂未同步 · 本机已保留',true);if(!quiet)toast(error.message);return {results:[],error};}
}
async function savePosition(){
  if(!state.lesson||!state.user)return;
  const lesson=state.lesson,uid=state.user.id,key='position:'+uid+':'+lesson.id,position={tab:state.tab,step:state.tab==='phonetics'?state.foundationStep:state.step};
  const old=await store.get('kv',key);if(state.user?.id!==uid||old?.tab===position.tab&&old?.step===position.step)return;
  await store.put('kv',key,position);if(state.user?.id!==uid)return;
  await queueEvent(lesson,'position',position);schedulePositionSync();
}
async function renderRoute(){
  if(!state.user)return;
  const uid=state.user.id,generation=++renderGeneration,hashValue=location.hash.slice(1)||'home', [routePath,query='']=hashValue.split('?'),params=new URLSearchParams(query),[route,id]=routePath.split('/');
  state.route=labels[route]?route:'home';stopAudio();stopRecording();
  const current=()=>state.user?.id===uid&&generation===renderGeneration;
  try{
    const waiting=(state.route==='lesson'&&!requests.has(uid,'/lessons/'+encodeURIComponent(decodeURIComponent(id||'')),lessonCacheOptions(decodeURIComponent(id||''))))||['authentic','scenario','content'].includes(state.route);
    if(waiting)shell(`${heading(labels[state.route],'')}<div class="card route-loading" role="status" aria-busy="true">正在打开${esc(labels[state.route])}…</div>`);
    if(state.route==='authentic'){
      const index=await privateJson('/authentic');if(!current())return;const clipId=id||index.clips[0]?.id,clip=index.clips.find(c=>c.id===clipId);
      if(!clip)throw new Error('没有这段真人素材');
      const [lesson]=await Promise.all([loadLesson(clip.lesson_id),clip.c2_challenge&&navigator.onLine?refreshProgress().catch(error=>{if(error.status)throw error;}):null]);if(!current())return;
      state.authentic=index;state.authenticId=clipId;state.lesson=lesson;state.nativeChallengeMode=clip.c2_challenge?'challenge':'standard';
      if(clip.c2_challenge)await refreshListeningPending();
    }
    if(state.route==='map'){
      if(params.has('level'))state.filterLevel=params.get('level');
      if(params.get('mode')==='grammar'){state.search='';state.filterSkill='';}
    }
    if(state.route==='practice'&&params.has('mode'))state.practiceMode=params.get('mode');
    if(state.route==='practice'&&state.practiceMode==='interaction'){
      const index=await privateJson('/scenarios');if(!current())return;state.scenarios=index.items;
    }
    if(state.route==='scenario'){
      const scene=await privateJson('/scenarios/'+encodeURIComponent(id));if(!current())return;
      const [related]=await Promise.all([loadLesson(scene.lesson_id),navigator.onLine?refreshProgress().catch(error=>{if(error.status)throw error;}):null]);if(!current())return;
      state.scenario=scene;state.lesson=related;
      if(!current())return;await refreshScenarioGame();
    }
    if(state.route==='lesson'){
      if(!id)throw new Error('没有选择课程');
      const l=await loadLesson(decodeURIComponent(id));if(!current())return;
      const [localPosition,drafts,queued]=await Promise.all([store.get('kv','position:'+uid+':'+l.id),store.get('kv','drafts:'+uid),pending()]);if(!current())return;
      const lastPosition=queued.events.filter(x=>x.user_id===uid&&x.event.kind==='position'&&x.event.lesson_id===l.id&&x.event.content_version===l.version).sort((a,b)=>a.event.occurred_at.localeCompare(b.event.occurred_at)).at(-1)?.event.answer;
      const saved=lastPosition||state.progress?.positions?.[l.id]||localPosition||{};
      state.lesson=l;state.tab=params.get('tab')||saved.tab||(l.id===FOUNDATION_ID?'phonetics':listeningSession(l)?'listening':'text');if(!['text','grammar','practice','transfer','listening','phonetics'].includes(state.tab))state.tab='text';if(state.tab==='listening'&&!listeningSession(l)||state.tab==='phonetics'&&l.id!==FOUNDATION_ID)state.tab='text';
      const requestedStep=Math.max(0,Number(params.get('step')??(params.get('tab')&&params.get('tab')!==saved.tab?0:saved.step))||0);if(state.tab==='phonetics'){state.foundationStep=Math.min(foundationSteps.length-1,requestedStep);state.step=0}else state.step=Math.min(l.exercises.length-1,requestedStep);
      state.drafts=drafts||{};state.listeningPending=queued.events;
      if(!current())return;if(state.tab!=='listening')await recordListeningExposure('outside_listening');
    }
    if(state.route==='settings'){
      void privateJson('/ai/status',{maxAgeMs:15000,persist:false}).then(value=>{if(!current())return;state.ai=value;const node=$('#ai-status-content');if(node)node.innerHTML=aiStatusHtml();}).catch(()=>{});
    }
    if(state.route==='content'){const report=await privateJson('/content/report',{maxAgeMs:60000,persist:false}).catch(()=>null);if(!current())return;state.report=report;}
    if(!current())return;
    render();window.scrollTo({top:0,behavior:'instant'});warmVisibleLessons();
    if(state.route==='lesson')await savePosition();if(state.route==='settings')await updatePending();
  }catch(error){if(current())shell(`${heading('暂时无法打开','已保存的内容和学习记录不会被删除。')}${errorBox(error.message)}<a class="btn secondary" href="#map">返回课程地图</a>`);}
}
function render(){
  if(!state.user){authPage();return;}
  const pages={authentic:nativeChallengeView,home,map:mapPage,lesson:lessonPage,practice:practicePage,review:reviewPage,ability:abilityPage,settings:settingsPage,content:contentPage,scenario:()=>scenarioPage(state.scenario,state.scenarioGame,{esc,button,badge})};
  shell((pages[state.route]||home)());
  if(state.route==='lesson'&&state.tab==='listening'){
    const session=listeningSession(state.lesson);
    document.querySelectorAll('[data-deep-source]').forEach(audio=>{
      try{bindListeningAudio(audio,session.sources[Number(audio.dataset.deepSource)],{speed:state.audioSpeed,onStatus:setAudioStatus});}
      catch(error){setAudioStatus(error.message);}
      audio.addEventListener('play',()=>{stopAudio();document.querySelectorAll('[data-deep-source]').forEach(other=>{if(other!==audio)other.pause();});});
    });
  }
}
async function privateJson(endpoint,{maxAgeMs=60000,persist=true}={}){
  const uid=state.user?.id;if(!uid)throw new Error('请先登录');
  if(state.authExpired){const error=new Error('请重新登录；本机记录保留。');error.status=401;throw error;}
  try{return await requests.get(uid,endpoint,async()=>{
    const value=await api(endpoint);
    if(persist&&state.user?.id===uid)void store.cachedJson(uid,'/api/v1'+endpoint,value).catch(()=>{});
    return value;
  },{maxAgeMs,version:state.curriculum?.revision||''});}
  catch(error){
    if(error.status===401||error.status===403){requests.clear();if(state.user?.id===uid)state.authExpired=true;throw error;}
    if(persist&&!error.status){const cached=await store.readCachedJson(uid,'/api/v1'+endpoint);if(cached)return cached;}throw error;
  }
}
async function loadWorkspace(){
  const uid=state.user.id;
  const [curriculum,offlineIds]=await Promise.all([api('/curriculum'),store.offlineList(uid),refreshProgress()]);
  if(state.user?.id!==uid)return;
  state.curriculum=curriculum;state.offlineIds=offlineIds;
  void store.cachedJson(uid,'/api/v1/curriculum',curriculum).catch(()=>{});
}
async function bootstrap(){
  const pendingLogout=await store.get('kv','logoutPending');
  if(pendingLogout){try{const current=await api('/auth/status');if(current.user){setContext(current.user,current.csrf,null);await api('/auth/logout',{method:'POST',body:'{}'});}setContext(null,null,null);await store.remove('kv','logoutPending');}catch(e){if(e.status===401)await store.remove('kv','logoutPending');else{state.authMode='login';authPage();$('#auth-error').textContent='本机已退出；联网后才能撤销旧会话并重新登录。';return;}}}
  if(await store.get('kv','reauthRequired')){state.authMode='login';authPage();$('#auth-error').textContent='请重新登录；本机待同步回答与录音已保留。';return;}
  const cached=await store.get('kv','session');
  try{
    const status=await api('/auth/status');state.initialized=status.initialized;
    if(!status.user){state.authMode=status.initialized?'login':'setup';authPage();return;}
    state.user=status.user;state.csrf=status.csrf;state.device=cached?.user?.id===status.user.id?cached.device:crypto.randomUUID();
    if(cached?.user&&cached.user.id!==status.user.id)await store.clearPrivate();
    await saveSession();await loadWorkspace();setSync('已同步');
  }catch(error){
    if(cached?.user&&!error.status){state.user=cached.user;state.csrf=cached.csrf;state.device=cached.device;setContext(state.user,state.csrf,state.device);state.curriculum=await store.readCachedJson(state.user.id,'/api/v1/curriculum');state.progress=await store.get('kv','progress:'+state.user.id);setSync('离线 · 本机内容',true);}
    else{authPage();$('#auth-error').textContent='暂时无法连接服务器：'+error.message;return;}
  }
  if(!state.curriculum){authPage();$('#auth-error').textContent='本机没有课程索引，请先联网登录一次。';return;}
  state.offlineIds=await store.offlineList(state.user.id);state.audioSpeed=state.user.settings?.speed||1;
  await renderRoute();await synchronize({quiet:true});
  if(state.user?.settings?.reminders&&(state.progress?.reviews||[]).some(r=>r.due_at<=new Date().toISOString()))toast('有知识点可以复习了；你也可以继续当前课程。');
}
async function afterAuth(data,recovery=false){
  state.user=data.user;state.csrf=data.csrf;
  const cached=await store.get('kv','session');
  if(cached?.user?.id&&cached.user.id!==state.user.id)await store.clearPrivate();
  state.device=cached?.user?.id===state.user.id?cached.device:crypto.randomUUID();
  setContext(state.user,state.csrf,state.device);
  clearRequests();if(!data.user.settings){const me=await api('/auth/me');state.user=me.user;}state.authExpired=false;await store.remove('kv','reauthRequired');await saveSession();
  await loadWorkspace();
  if(!location.hash||location.hash.startsWith('#login'))location.hash='#home';await renderRoute();
  void synchronize({quiet:true});if(data.recovery_code)showRecovery(data.recovery_code);
}
async function loginPreservingPending(message){
  if(isRecording())throw new Error('请先停止录音，再重新登录；录音仍在进行。');
  clearRequests();cancelRecordingRequest();stopAudio();await store.put('kv','reauthRequired',true);state.user=null;state.csrf=null;state.authExpired=false;setContext(null,null,null);state.authMode='login';authPage('login');$('#auth-error').textContent=message;
}
function showRecovery(code){dialog(`<h2>保存这一次性的恢复码</h2><p>忘记密码时可用它重设密码，不需要邮箱。恢复码等同于账号控制权，请单独保存。</p><code class="recovery-code">${esc(code)}</code><button class="btn" data-action="copy-recovery" data-code="${esc(code)}">复制恢复码</button><button class="text-btn" data-action="close-dialog">我已保存</button>`);}
async function logout(force=false){
  if(isRecording())throw new Error('请先停止录音并等待保存，再退出账号；当前录音仍在进行。');
  const count=await updatePending();
  if(count&&!force&&!window.confirm(`这台设备还有 ${count} 项未同步。现在退出会清理这些本机私有记录。要先取消并联网同步吗？选择“取消”可保留。`))return;
  const csrf=state.csrf;clearRequests();stopRecording();stopAudio();
  let remote=false;try{await api('/auth/logout',{method:'POST',body:'{}'});remote=true;}catch(e){if(e.status===401)remote=true;}
  state.user=null;state.csrf=null;setContext(null,null,null);await store.clearPrivate();
  if(!remote)await store.put('kv','logoutPending',{csrf});
  broadcast?.postMessage({type:'logout'});state.authMode='login';state.lesson=null;state.progress=null;state.answers={};state.recordings=[];authPage();
  if(!remote)$('#auth-error').textContent='本机私有数据已清理；联网后会撤销服务器会话。';
}
async function downloadLesson(){
  if(!navigator.onLine)throw new Error('下载课程需要联网。');
  const l=state.lesson,uid=state.user.id;const index=await privateJson('/scenarios');for(const scene of index.items.filter(x=>x.lesson_id===l.id))await privateJson('/scenarios/'+scene.id);await store.cachedJson(uid,'/api/v1/lessons/'+l.id,l);const cache=await caches.open('czstudy-user-'+uid);let files=0,missing=0;
  const refs=[...new Map((l.audio_refs||[]).map(r=>[r.asset_id||r.id,r])).values()];
  for(const ref of refs){if(ref.status==='generated'){for(const suffix of ['',...(ref.slow_file?['?speed=slow']:[])]){const url='/api/v1/audio/'+(ref.asset_id||ref.id)+suffix,response=await fetch(url);if(response.ok){await cache.put(url,response);files++;}else missing++;}}else missing++;}
  state.offlineIds=await store.offlineList(uid);toast(`本课已下载；音频文件 ${files} 个，未生成或缺失 ${missing} 项。离线 TTS 仍取决于本设备语音包。`);render();
}
async function speak(text,ref=null){await playCzech(text,{ref,speed:state.audioSpeed,volume:state.user.settings?.volume??1,repeat:state.audioRepeat,onStatus:setAudioStatus});}
function vocabDialog(v){if(!v)return;dialog(`<h2 lang="cs">${esc(v.lemma)}</h2><div class="badge-row">${badge(v.pos||'词汇','outline')}</div><p>${esc(v.meaning_zh)}</p><div class="examples"><div>常见形式：<span lang="cs">${esc(v.forms)}</span></div><div>搭配：<span lang="cs">${esc(v.collocation)}</span></div></div><p lang="cs">${esc(v.example_cs)}</p><p class="muted">${esc(v.example_zh)}</p><div class="pitfall">${esc(v.confusion_zh)}</div>${button('play-vocab','播放捷语例句','secondary',`data-text="${esc(v.example_cs||v.lemma)}"`)}<div class="audio-status"></div>`);}
async function goPractice(id,kp=''){
  const uid=state.user?.id,generation=renderGeneration,request=++practiceRequest;
  const l=await loadLesson(id);if(state.user?.id!==uid||generation!==renderGeneration||request!==practiceRequest)return;state.lesson=l;let i=0;
  if(kp){const seen=new Set(Object.values(state.progress?.latest||{}).filter(e=>e.lesson_id===id&&e.content_version===l.version).map(e=>e.exercise_id));i=l.exercises.findIndex(e=>(e.knowledge_points||[]).includes(kp)&&!seen.has(e.id));if(i<0)i=l.exercises.findIndex(e=>['writing','speaking','mediation','interaction'].includes(e.type));}
  else if(!['all','grammar','vocabulary'].includes(state.practiceMode))i=l.exercises.findIndex(e=>e.skill_ids.includes(state.practiceMode));
  const tab=state.practiceMode==='grammar'&&!kp?'grammar':'practice';location.hash=lessonLink(id,tab,Math.max(0,i));
}

document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action]');if(!target||target.disabled)return;
  const action=target.dataset.action;event.preventDefault();
  if(['scenario-choice','scenario-restart'].includes(action)&&state.scenarioBusy)return;
  try{
    if(action.startsWith('native-challenge-')){
      if(state.nativeChallengeBusy)return;
      const clip=state.authentic?.clips.find(c=>c.id===state.authenticId),lesson=state.lesson,uid=state.user?.id;
      if(!clip?.c2_challenge)throw new Error('这组原声训练不存在。');
      const record=nativeChallengeRecord();
      if(action==='native-challenge-standard'&&!record.exposed)throw new Error('先保存回答并展开原文。');
      if(action==='native-challenge-open'){state.nativeChallengeMode='challenge';await refreshListeningPending();render();return;}
      state.nativeChallengeBusy=true;target.disabled=true;
      const samePage=()=>state.user?.id===uid&&state.route==='authentic'&&state.authenticId===clip.id;
      try{
        if(action==='native-challenge-standard'){
          const input=collectChallengeInput(document,clip);
          if(JSON.stringify(input.answers)!==JSON.stringify(record.draft?.answers||record.latest?.answers||{}))await queueEvent(lesson,'note',challengeNote(clip,'draft',input,record));
          await refreshListeningPending();if(samePage()){state.nativeChallengeMode='standard';render();}await synchronize({quiet:true});return;
        }
        await handleChallengeAction(action,clip,record,document,{
        queue:text=>queueEvent(lesson,'note',text),refresh:refreshListeningPending,
        render:()=>{if(samePage())render();},sync:()=>synchronize({quiet:true})
      });}finally{state.nativeChallengeBusy=false;if(target.isConnected)target.disabled=false;}
      return;
    }
    if(action==='native-seek'){
      const clip=state.authentic?.clips.find(c=>c.id===state.authenticId)||state.authentic?.clips[0];
      const segment=clip?.transcript.find((s,i)=>(s.segment_id||`${clip.id}-s${String(i+1).padStart(3,'0')}`)===target.dataset.segment);
      await playNativeSegment($('#native-audio'),segment);return;
    }
    if(action==='native-download'){const clip=state.authentic.clips.find(c=>c.id===target.dataset.id);if(!clip)throw new Error('素材不存在');const url='/api/v1/authentic/audio/'+encodeURIComponent(clip.id),response=await fetch(url);if(!response.ok)throw new Error('下载失败，原内容保留');await(await caches.open('czstudy-user-'+state.user.id)).put(url,response);await store.cachedJson(state.user.id,'/api/v1/lessons/'+state.lesson.id,state.lesson);toast('这段真人音频和转写已下载，可离线听辨。');return;}
    if(action==='native-save'){
      if(state.nativeSaving)return;
      const clip=state.authentic.clips.find(c=>c.id===target.dataset.id),text=$('#native-note').value.trim();
      if(!text)throw new Error('先记下这次听到的内容或疑问。');
      state.nativeSaving=true;target.disabled=true;
      try{
        const event=await queueEvent(state.lesson,'note','[真人听辨 '+clip.id+'] '+text);
        const result=await synchronize({quiet:true});
        const accepted=result.results?.some(r=>r.event_id===event.event_id&&r.ok);
        if(accepted){render();toast('听辨记录已同步。');}
        else{if($('#native-note'))$('#native-note').value='';toast('已保存在这台设备，联网后同步。');}
      }finally{state.nativeSaving=false;target.disabled=false;}
      return;
    }
    if(action==='close-dialog')return $('#detail-dialog').close();
    if(action==='auth-mode')return authPage(target.dataset.mode);
    if(action==='copy-recovery'){await navigator.clipboard.writeText(target.dataset.code);toast('恢复码已复制');return;}
    if(action==='logout')return await logout();
    if(action==='reauth')return await loginPreservingPending('请使用当前密码登录，本机未同步内容保留。');
    if(action==='sync'){await synchronize();if(state.route==='settings')await updatePending();return;}
    if(action==='level'){state.filterLevel=target.dataset.level;render();return;}
    if(action==='scene-map'){state.filterLevel='';state.filterScene='';location.hash='#map';return;}
    if(action==='foundation-step'){stopAudio();stopRecording();state.foundationStep=Math.max(0,Math.min(foundationSteps.length-1,Number(target.dataset.step)||0));state.tab='phonetics';render();await savePosition();return;}
    if(action==='foundation-play'){const part=foundationSteps.find(p=>p.key===target.dataset.key);if(!part||state.lesson?.id!==FOUNDATION_ID)return;return await playCzech(part.word,{ref:{status:'generated',id:'foundation-'+part.key,file_url:'/assets/phonetics/'+part.key+'-normal.mp3',slow_file:'/assets/phonetics/'+part.key+'-slow.mp3'},speed:target.dataset.slow?0.8:1,onStatus:setAudioStatus});}
    if(action==='tab'){stopRecording();if(target.dataset.tab!=='listening')await recordListeningExposure('outside_listening');stopAudio();state.tab=target.dataset.tab;render();await savePosition();return;}
    if(action==='step'){stopRecording();state.step=Number(target.dataset.step);render();await savePosition();return;}
    if(action==='deep-audio'){
      const session=listeningSession(state.lesson),ref=session?.sources[Number(target.dataset.source)];
      if(!ref)throw new Error('没有找到此音源。');return await playListeningAudio(document.querySelector('[data-deep-source="'+target.dataset.source+'"]'),ref,{speed:state.audioSpeed,onStatus:setAudioStatus});
    }
    if(action==='deep-evidence'){
      if(!listeningRecord().exposed)return;
      const paragraph=listeningSession(state.lesson)?.paragraphs[Number(target.dataset.paragraph)];
      if(paragraph?.ref){
        const session=listeningSession(state.lesson),source=paragraph.source_exercise_id?session.sources.findIndex(r=>r.exercise_id===paragraph.source_exercise_id):0;
        const audio=document.querySelector('[data-deep-source="'+Math.max(0,source)+'"]');
        await playListeningAudio(audio,paragraph.ref,{speed:state.audioSpeed,onStatus:setAudioStatus});audio.focus();
      }return;
    }
    if(action==='deep-reveal'||action==='deep-review'){
      const session=listeningSession(state.lesson),complete=listeningComplete(session,listeningRecord());
      if(action==='deep-review'&&!complete)throw new Error('先保存这组回答，再查看原文和反馈。');
      await recordListeningExposure(complete?'after_attempt':'before_attempt');await synchronize({quiet:true});render();return;
    }
    if(action==='play-sentence'){const i=Number(target.dataset.index),l=state.lesson,s=(l.lesson_text||l.unseen_text)[i];return await speak(s.cs,l.audio_refs?.find(r=>r.role==='text'&&r.index===i));}
    if(action==='play-cue'){const ref=state.lesson.audio_refs?.find(r=>r.id===target.dataset.id);if(ref)return await speak(ref.text,ref);}
    if(action==='play-all')return await speak((state.lesson.lesson_text||state.lesson.unseen_text).map(s=>s.cs).join(' '),state.lesson.audio_refs?.find(r=>r.role==='full'));
    if(action==='play-listening')return await speak(state.lesson.listening.script.map(s=>s.cs).join(' '),state.lesson.audio_refs?.find(r=>r.role==='listening-full'));
    if(action==='play-exercise')return await speak(currentExercise().audio_text_cs,state.lesson.audio_refs?.find(r=>r.exercise_id===currentExercise().id));
    if(action==='play-contrast'){const i=Number(target.dataset.index),c=state.lesson.pronunciation.contrast[i];return await speak(c.a+'. '+c.b+'.',state.lesson.audio_refs?.find(r=>r.role==='contrast'&&r.index===i));}
    if(action==='stop-audio'){stopAudio();setAudioStatus('已停止');return;}
    if(action==='vocab')return vocabDialog(state.lesson.vocabulary[Number(target.dataset.index)]);
    if(action==='word')return vocabDialog(state.lesson.vocabulary.find(v=>v.lemma.toLocaleLowerCase('cs')===target.dataset.word.toLocaleLowerCase('cs')));
    if(action==='play-vocab')return await speak(target.dataset.text,target.dataset.searchIndex!==undefined?state.vocabSearch?.[Number(target.dataset.searchIndex)]?.audio_ref:state.lesson?.audio_refs?.find(r=>r.role==='vocabulary'&&r.text===target.dataset.text));
    if(action==='test-voice')return await speak('Dobrý den. Učím se česky. Můžete to prosím zopakovat?');
    if(action==='refresh-voices'){render();toast(czechVoices().length?'已检测到捷语语音':'暂未检测到捷语语音');return;}
    if(action==='download-lesson'){target.disabled=true;return await downloadLesson();}
    if(action==='drop-lesson'){await store.dropLesson(state.user.id,target.dataset.id);state.offlineIds=await store.offlineList(state.user.id);render();toast('已移除本课离线下载，服务器记录保留。');return;}
    if(action==='storage-persist'){const ok=await navigator.storage?.persist?.();toast(ok?'浏览器已同意保留离线存储。':'浏览器未授予持久存储，请及时联网同步。');return;}
    if(action==='install'){if(installEvent){await installEvent.prompt();await installEvent.userChoice;installEvent=null;}render();return;}
    if(action==='install-guide'){dialog('<h2>添加到手机桌面</h2><p>先在手机浏览器打开已配置的 HTTPS 入口并登录。</p><p>iPhone / iPad：Safari 的分享菜单 → 添加到主屏幕。</p><p>Android：浏览器菜单中的安装应用 / 添加到主屏幕。入口、电脑在线状态和系统语音包会影响可用功能。</p><p>先下载想离线学习的课程；录音前允许麦克风。</p>');return;}
    if(action==='record-start'){
      target.disabled=true;state.recordingForUpdate=(state.recordingForUpdate||0)+1;
      let recordingGuard=true;
      const finishRecordingForUpdate=()=>{if(!recordingGuard)return;recordingGuard=false;state.recordingForUpdate=Math.max(0,state.recordingForUpdate-1);};
      const l=state.lesson,uid=state.user.id,panel=target.closest('.record-panel'),status=panel?.querySelector('.record-status'),playback=panel?.querySelector('.record-playback'),form=target.closest('[data-listening-answer]');
      document.querySelectorAll('[data-deep-source]').forEach(audio=>audio.pause());
      try{await startRecording(async(blob,url)=>{
        if(state.user?.id!==uid){finishRecordingForUpdate();return;}const r=await queueRecording(l,blob);finishRecordingForUpdate();
        if(playback?.isConnected){const audio=document.createElement('audio');audio.controls=true;audio.src=url;playback.replaceChildren(audio);}
        if(form?.isConnected){const input=form.querySelector('textarea[name="answer"]');if(input){input.value=(input.value.trim()+'\n[录音事件:'+r.event_id+']').trim();input.dispatchEvent(new Event('input',{bubbles:true}));}}
        if(status?.isConnected)status.textContent='录音已存本机，可回放；正在尝试同步。';
        const result=await synchronize({quiet:true}),ok=result.results?.some(x=>x.ok&&x.event_id===r.event_id);
        if(status?.isConnected)status.textContent=ok?'录音已同步，可在能力页回放；点保存这题回答留下对应记录。':'录音留在本机队列，联网后补交；请保存这题回答。';
      },message=>{if(status?.isConnected)status.textContent=message;});}catch(error){finishRecordingForUpdate();throw error;}return;
    }
    if(action==='record-stop'){stopRecording();return;}
    if(action==='add-chunk'){const input=$('#answer-input');input.value=(input.value.trim()+' '+target.dataset.text).trim();input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    if(action==='clear-answer'){const input=$('#answer-input');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    if(action==='hint'){
      const e=currentExercise(),key=answerKey(state.lesson,e),round=state.hintRounds[key]||0,h=buildHint(state.lesson,e,round);state.hintRounds[key]=round+1;state.assisted[key]=true;
      dialog(`<h2>${esc(h.title)}</h2><ol>${h.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${h.example_cs?`<div class="examples"><p lang="cs">${esc(h.example_cs)}</p><p>${esc(h.example_zh)}</p></div>`:''}<p>${esc(h.note_zh)}</p><div class="button-row">${button('hint','再换一种思路','secondary small')}${button('hint-next','换题试一试','secondary small')}</div><p class="small">已看提示，这次会作为有帮助的练习保存，不计独立完成证据。</p>`);return;
    }
    if(action==='hint-next'){
      const e=currentExercise(),kp=new Set(e.knowledge_points||[]),all=state.lesson.exercises;
      const related=all.map((x,i)=>({x,i})).filter(({x})=>x.id!==e.id&&x.knowledge_points?.some(k=>kp.has(k)));
      const next=related.find(({x})=>x.type!==e.type&&!state.progress?.latest?.[answerKey(state.lesson,x)])||related.find(({x})=>x.type!==e.type)||related[0];
      $('#detail-dialog').close();if(!next){toast('本课暂无另一道关联题，请回到迁移任务试着自己组织表达。');location.hash=lessonLink(state.lesson.id,'transfer');return;}location.hash=lessonLink(state.lesson.id,'practice',next.i);return;
    }
    if(action==='scenario-choice'){
      state.scenarioBusy=true;document.querySelectorAll('[data-action=scenario-choice]').forEach(b=>b.disabled=true);const scene=state.scenario,next=choose(scene,state.scenarioGame,target.dataset.choice);
      const event=await queueEvent(state.lesson,'transfer',JSON.stringify(scenarioSnapshot(scene,next)));
      state.scenarioGame={...next,last_event_id:event.event_id,last_occurred_at:event.occurred_at};await store.put('kv',scenarioKey(state.user,scene),state.scenarioGame);render();
      const result=await synchronize({quiet:true});if($('#scenario-save-state'))$('#scenario-save-state').textContent=result.results?.some(x=>x.ok&&x.event_id===event.event_id)?'这次回应已由服务器确认；对话路径可继续或回放。':'这次回应已存本机，等待服务器确认。';return;
    }
    if(action==='scenario-restart'){
      state.scenarioBusy=true;const scene=state.scenario,next=initialGame(scene);
      const event=await queueEvent(state.lesson,'transfer',JSON.stringify(scenarioSnapshot(scene,next,'restart')));
      state.scenarioGame={...next,last_event_id:event.event_id,last_occurred_at:event.occurred_at};await store.put('kv',scenarioKey(state.user,scene),state.scenarioGame);render();
      await synchronize({quiet:true});return;
    }
    if(action==='scenario-download')return await downloadLesson();
    if(action==='scenario-audio'){const node=state.scenario.nodes.find(n=>n.id===state.scenarioGame.node_id);return await speak(node.speaker_cs,state.scenario.audio_refs.find(r=>r.node_id===node.id));}
    if(action==='self-review'){if(!target.dataset.event)throw new Error('此回答还没有服务器确认，请先同步再自评。');await queueEvent(state.lesson,'self_review',{rating:target.dataset.rating,related_event_id:target.dataset.event});await synchronize();return;}
    if(action==='learning-feedback'){await queueEvent(state.lesson,'feedback',target.dataset.value);await synchronize({quiet:true});toast('学习反馈已保存，首页建议会据此调整。');return;}
    if(action==='complete'){await queueEvent(state.lesson,'lesson_complete','complete');await synchronize({quiet:true});toast('本课学习标记已保存。可以复习或继续探索下一课。');return;}
    if(action==='practice-mode'){location.hash='#practice?mode='+target.dataset.mode;return;}
    if(action==='practice-lesson')return await goPractice(target.dataset.id);
    if(action==='review-lesson')return await goPractice(target.dataset.id,target.dataset.kp);
    if(action==='mixed-review'){const reviews=state.progress?.reviews||[];if(!reviews.length){location.hash='#practice';return;}const index=Number(await store.get('kv','review-index')||0)%reviews.length;await store.put('kv','review-index',index+1);return await goPractice(reviews[index].lesson_id,reviews[index].knowledge_point);}
    if(action==='export'){
      const p=await pending(),data=navigator.onLine?await api('/export'):{schema:'czstudy-offline-export-v1',exported_at:new Date().toISOString(),progress:state.progress};data.local_pending_events=p.events.map(x=>x.event);data.pending_recording_metadata=p.recordings.map(({blob,...r})=>({...r,bytes:blob.size}));
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='czech-learning-export-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出学习记录；录音二进制请通过完整备份保存。');return;
    }
    if(action==='backup'){target.disabled=true;$('#backup-result').textContent='正在制作并验证备份…';const r=await api('/backups',{method:'POST',body:'{}'});$('#backup-result').innerHTML=`<div class="notice">备份完成：${esc(r.id)}<br>${r.files} 个文件通过校验，含 ${r.verified.events} 条事件、${r.verified.recordings} 个录音。保存于电脑本项目 backups 目录。</div>`;return;}
    if(action==='content-report'){state.report=await api('/content/report');render();return;}
    if(action==='ai-feedback'){
      const key=answerKey(state.lesson,currentExercise()),answer=state.drafts?.[key]||'';if(!answer)throw new Error('请先写下回答。');target.disabled=true;$('#ai-feedback').textContent='正在请求服务器配置的 AI 文字反馈…';const r=await api('/ai/feedback',{method:'POST',body:JSON.stringify({lesson_id:state.lesson.id,content_version:state.lesson.version,exercise_id:currentExercise().id,answer})});$('#ai-feedback').innerHTML=`<div class="feedback open"><strong>AI 文字建议</strong><p class="wrap-text">${esc(r.feedback)}</p><p class="small">${esc(r.note)}</p></div>`;return;
    }
  }catch(error){toast(error.message);if(action==='backup'&&$('#backup-result'))$('#backup-result').innerHTML=errorBox(error.message);if(action==='ai-feedback'&&$('#ai-feedback'))$('#ai-feedback').innerHTML=errorBox(error.message);}
  finally{if(['scenario-choice','scenario-restart'].includes(action)){state.scenarioBusy=false;document.querySelectorAll('[data-action=scenario-choice]').forEach(b=>b.disabled=false);}if(target.isConnected)target.disabled=false;}
});

document.addEventListener('submit',async event=>{
  const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();
  const values=Object.fromEntries(new FormData(form)),submit=event.submitter,savedSnapshot=updateNotice?.capture(form);
  state.updateFormSaves=(state.updateFormSaves||0)+1;
  if(submit)submit.disabled=true;
  try{
    if(form.dataset.listeningAnswer){await submitListening(form,values,event.submitter?.value);}
    else if(form.id==='auth-form'){
      const data=await api('/auth/'+(state.authMode==='setup'?'setup':state.authMode==='recover'?'recover':'login'),{method:'POST',body:JSON.stringify(values)});
      if(state.authMode==='recover'){await loginPreservingPending('密码已重置，请用新密码登录，本机未同步内容保留。');showRecovery(data.recovery_code);}else await afterAuth(data);
    } else if(form.id==='map-filter'){state.search=values.q;state.filterSkill=values.skill;state.filterScene=values.scene;render();}
    else if(form.id==='practice-filter'){state.filterLevel=values.level;state.search=values.q;render();}
    else if(form.id==='answer-form'){
      const l=state.lesson,e=currentExercise(),key=answerKey(l,e),answer=String(values.answer||'').trim();if(!answer)throw new Error('请先写下或选择回答。');
      const queued=await queueEvent(l,'exercise',answer,e.id,!!state.assisted[key]);state.drafts ||= {};state.drafts[key]=answer;await store.put('kv','drafts:'+state.user.id,state.drafts);
      const response=await synchronize({quiet:true}),result=response.results?.find(x=>x.event_id===queued.event_id);
      if(result?.ok){state.answers[key]=result;$('#exercise-feedback').innerHTML=feedbackHtml(e,result);}
      else if(result&&!result.ok)$('#exercise-feedback').innerHTML=errorBox('服务器尚未接受：'+result.error+'。回答仍在本机队列。');
      else{
        const normalize=s=>String(s).normalize('NFC').trim().toLocaleLowerCase('cs').replace(/\s+/g,' ').replace(/[.!?]+$/u,'');
        const open=['writing','speaking','interaction','mediation'].includes(e.type),correct=[e.answer,...(e.accepted_answers||[])].map(normalize).includes(normalize(answer));
        $('#exercise-feedback').innerHTML=`<div class="notice">回答已保存本机，等待联网提交。${open?'请按量规对照，开放回答不自动评分。':correct?'本地答案对照相符，尚未由服务器确认。':'本地对照发现差异：'+esc(e.explanation_zh)}</div>`;
      }
    } else if(form.id==='transfer-form'){const queued=await queueEvent(state.lesson,'transfer',String(values.answer||''));const result=await synchronize({quiet:true});const r=result.results?.find(x=>x.event_id===queued.event_id);$('#transfer-feedback').innerHTML=`<div class="notice">${r?.ok?'迁移表达已同步，按上方量规检查。':'迁移表达已存本机，等待联网确认。'}</div>`;}
    else if(form.id==='note-form'){await queueEvent(state.lesson,'note',String(values.text||'').trim());await synchronize({quiet:true});toast('笔记已保存');render();}
    else if(form.id==='settings-form'){
      const settings={dailyIntention:String(values.dailyIntention||''),interests:String(values.interests||'').split(/[,，]/).map(s=>s.trim()).filter(Boolean),detail:values.detail,fontSize:Number(values.fontSize),timezone:values.timezone,reviewScale:Number(values.reviewScale),reminders:values.reminders==='on',volume:Number(values.volume),speed:Number(values.speed)};
      const result=await api('/settings',{method:'PUT',body:JSON.stringify(settings)});state.user.settings=result.settings;state.audioSpeed=settings.speed;await saveSession();await refreshProgress();toast('偏好已保存');render();await updatePending();
    } else if(form.id==='password-form'){
      if(isRecording())throw new Error('请先返回课堂停止录音并同步，再修改密码。');
      const waiting=await pending();if(waiting.events.length||waiting.recordings.length)throw new Error('本设备还有未同步内容。请先联网同步成功，再修改密码；当前回答和录音已保留。');
      await api('/auth/password',{method:'POST',body:JSON.stringify(values)});broadcast?.postMessage({type:'credentials-changed'});await loginPreservingPending('密码已修改，请用新密码登录；本机内容保留。');
    }
    else if(form.id==='content-import-form'){
      const file=form.elements.file.files[0];if(!file||file.size>2*1024*1024)throw new Error('请选择小于2MB的教材JSON。');const item=JSON.parse(await file.text()),dry_run=event.submitter?.value!=='import';
      const r=await api('/content/import',{method:'POST',body:JSON.stringify({item,dry_run})});$('#import-result').innerHTML=`<div class="notice">${dry_run?'校验通过，尚未导入。':'已导入新版本，历史回答保留。'} ${esc(r.id)} / ${esc(r.version)}</div>`;
      if(!dry_run){clearRequests();state.curriculum=await api('/curriculum');await store.cachedJson(state.user.id,'/api/v1/curriculum',state.curriculum);}
    } else if(form.id==='vocab-search'){
      const r=await api('/vocabulary?q='+encodeURIComponent(values.q));state.vocabSearch=r.items;$('#vocab-results').innerHTML=`<p class="small">找到 ${r.total} 项，显示前 ${r.items.length} 项。</p><div class="search-results">${r.items.map((v,i)=>`<section class="card"><h3 lang="cs">${esc(v.lemma)}</h3><p>${esc(v.meaning_zh)} · ${esc(v.pos)}</p><p lang="cs">${esc(v.collocation)}</p><p>${esc(v.forms)}</p><div class="button-row"><a class="btn secondary small" href="${lessonLink(v.lesson_id)}">在课程里学</a>${button('play-vocab','听例句','secondary small',`data-text="${esc(v.example_cs)}" data-search-index="${i}"`)}</div></section>`).join('')}</div>`;
    }
    updateNotice?.accept(savedSnapshot);
  }catch(error){if(form.id==='auth-form')$('#auth-error').textContent=error.message;else if(form.id==='content-import-form')$('#import-result').innerHTML=errorBox(error.message);else toast(error.message);}
  finally{state.updateFormSaves--;if(submit?.isConnected)submit.disabled=false;}
});
document.addEventListener('change',event=>{
  if(event.target.id==='translation-toggle'){state.showTranslation=event.target.checked;render();}
  if(event.target.id==='audio-speed'){
    state.audioSpeed=Number(event.target.value);
    if(state.tab==='listening'){
      const session=listeningSession(state.lesson);
      document.querySelectorAll('[data-deep-source]').forEach(audio=>bindListeningAudio(audio,session.sources[Number(audio.dataset.deepSource)],{speed:state.audioSpeed,onStatus:setAudioStatus}));
      setAudioStatus('速度已切换，材料从开头待播；正常与慢速使用各自的证据位置。');
    }
  }
  if(event.target.id==='audio-repeat')state.audioRepeat=Number(event.target.value);
});
document.addEventListener('input',async event=>{
  const listeningForm=event.target.closest('[data-listening-answer]');
  if(listeningForm&&event.target.name==='answer'&&state.lesson){
    const key='listening|'+listeningKey(state.lesson)+'|'+listeningForm.dataset.listeningAnswer;
    state.drafts||={};state.drafts[key]={text:event.target.value,at:new Date().toISOString()};
    try{await store.put('kv','drafts:'+state.user.id,state.drafts);const status=listeningForm.querySelector('[data-listening-status]');if(status)status.textContent='草稿已留在本机，点“同步草稿”可在另一设备接着写。';}catch{toast('本机草稿保存失败，请暂勿离开页面。');}
  }

  if(event.target.closest('#answer-form')&&event.target.name==='answer'&&state.lesson){const key=answerKey(state.lesson,currentExercise());state.drafts ||= {};state.drafts[key]=event.target.value;try{await store.put('kv','drafts:'+state.user.id,state.drafts);}catch{toast('本机存储失败，请检查浏览器空间，暂勿关闭页面。');}}
});
window.addEventListener('hashchange',renderRoute);
window.addEventListener('offline',()=>updatePending());
window.addEventListener('online',async()=>{if(!state.user){await bootstrap();return;}await synchronize({quiet:true});});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;if(state.user)render();});
window.addEventListener('pagehide',()=>stopRecording());
broadcast?.addEventListener('message',async e=>{if(e.data?.type==='credentials-changed'){clearRequests();state.authExpired=true;setSync('点此重新登录 · 记录保留',true);return;}if(e.data?.type==='logout'){clearRequests();state.user=null;state.csrf=null;setContext(null,null,null);stopAudio();stopRecording();state.lesson=null;state.progress=null;authPage('login');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user)synchronize({quiet:true});});
setInterval(()=>{if(!document.hidden&&state.user)synchronize({quiet:true});},30000);
if('serviceWorker'in navigator){
  updateNotice=installUpdateNotice({document,serviceWorker:navigator.serviceWorker,getSafety:updateSafety,reload:()=>location.reload()});
  navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{updateNotice.watch(reg);void reg.update().catch(()=>{});}).catch(()=>toast('离线缓存暂不可用；联网课程仍可学习。'));
}
bootstrap().catch(error=>{$('#app').innerHTML=`<main class="main">${errorBox('无法打开本机存储：'+error.message)}<p>请检查浏览器是否禁用了网站存储，或空间是否不足。</p></main>`;});
