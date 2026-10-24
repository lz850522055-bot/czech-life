import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const manifest=read('content/authentic/manifest.json'),catalog=read('content/game/catalog.json');
const guides={},stats={missions:0,deep_dives:0,quotes:0,transfers:0};
// Earlier three telephone lessons used prose with an inline answer. Keep their
// immutable records but separate the example from the task in the view.
const earlyTransfers={
  'native-groceries':[
    ['站在 A 的角度，用两到三句捷语给第三人说明当前安排。',['保留 B 到家时间的不确定性。','采用自己要表达的语法性别，不添加菜单或人物关系。'],'B bude doma asi kolem deváté. Nakoupím tedy cestou, abych si mohl dát večeři.','B大约九点左右到家。那我就在路上买东西，好让我能吃晚饭。',['安排与时间','说清由A采购，到家时间保留大约九点左右。','采购者或时间范围不够明确。','把B的提议说成最终安排，或把约数改成确定时间。']],
    ['给对方发一条确认消息：确认由你采购，再问还有什么需要带。',['完成确认和追问两个动作。','不替对方编造采购清单。'],'Tak nakoupím cestou. Potřebuješ ještě něco?','那我就在路上买。你还需要别的吗？',['沟通动作','明确自己采购，并给对方补充需求的机会。','只有确认，缺少追问。','改了采购者，或把未说过的需求写成对方已提出。']]
  ],
  'native-online-shop':[
    ['把 B 的非正式说法改成一段中性的书面转述，保留信息来源。',['区分在工作场合听来的说法与自己的核实。','不替购物网站作可靠性或价格结论。'],'B uvádí, že o tomto způsobu nákupu slyšel v práci. Podle toho, co mu řekli, má být nákup v Americe levnější.','B说，他在工作场合听说过这种购物方式。按别人告诉他的说法，在美国买应当更便宜。',['信息来源','保留听说的链条，不把较便宜升级成已核实结论。','用了转述，但没有说清是听来的。','直接宣称网站可靠或总价已核实较低。']],
    ['向对方追问一个能补证据的问题。',['不预设商家不可靠。','复述 A 的观感时保留“A说”的来源。'],'Porovnával někdo celkovou cenu včetně dopravy?','有人比较过包含运费的总价吗？',['追问与边界','提出可回答的核实问题，不把观感当证据。','问题笼统，尚不能获取需要的信息。','问题已预设商家有问题，或把个人观感写成事实。']]
  ],
  'native-traffic':[
    ['给第三人做三句捷语转述，每一句只放一种信息来源。',['区分 B 的推测、节日提醒和车站广播。','不补事故原因或到站时间。'],'B si myslí, že je hodně aut kvůli prodlouženému víkendu. B připomíná, že zítra je svátek. Podle hlášení na nádraží uvízl autobus na dálnici a má ho nahradit jiný.','B认为车多是因为长周末。B提醒明天是假日。按车站广播，一辆公交车堵在高速上，将由另一辆替换。',['来源区分','三句话保留各自来源，不混合推测和广播。','事实大意清楚，但某句缺少来源。','把猜测说成广播结论，或补造原因、到站时间。']],
    ['把 A 的短插问改成明确的澄清问句，再写一句确认理解。',['先澄清“长周末”指什么，再回应明天是假日。','根据你要表达的语法性别选择词尾。'],'Promiň, jaký prodloužený víkend máš na mysli? Aha, zítra je svátek, to jsem nevěděl.','不好意思，你说的长周末指什么？哦，明天是假日，我原先不知道。',['修复与回应','问清所指，再确认新增的信息。','有澄清问题，但没有回应听到的新信息。','只用“是”带过，或把问题改成未提供的事故细节。']]
  ]
};
function earlyView(entry){
  const [prompt,constraints,model,model_zh,r]=entry;
  const levels=[{criterion:r[0],met:r[1],partial:r[2],not_yet:r[3]},{criterion:'用自己的捷语说明',met:'句子能让对方理解当前任务中的关系，不照抄整段原转写。',partial:'基本意思能懂，关系仍靠零散词语。',not_yet:'没有回应当前任务，或只复制未整理的转写。'}];
  return {title:'换个对象，重新表达',prompt,constraints,model,model_zh,rubric:levels.map(r=>r.criterion+'：'+r.met),rubric_levels:levels,native_transfer:true};
}
const normal=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim().toLocaleUpperCase('cs');
for(const clip of manifest.clips){
  const m=catalog.missions.find(m=>m.id==='N-'+clip.id);if(!m)throw Error('Missing native mission '+clip.id);
  const views={},learn=m.tasks.filter(t=>t.kind==='learn'),deep=clip.deep_dive||[],source=m.tasks.find(t=>t.kind==='source');
  if(deep.length!==learn.length)throw Error('Deep-dive mapping drift '+clip.id);
  deep.forEach((d,i)=>{
    const quotes=(d.evidence_quotes||[]).map(q=>{
      const segment=clip.transcript.find(s=>s.segment_id===q.segment_id||s.id===q.segment_id);
      if(!segment||!normal(segment.cs).includes(normal(q.cs)))throw Error('Unverified quote '+clip.id+' '+q.segment_id);
      if(!(segment.end>segment.start&&segment.end<=clip.media.duration+.03))throw Error('Invalid native interval '+q.segment_id);
      return {cs:q.cs,segment_cs:segment.cs,segment_zh:segment.zh,segment_id:q.segment_id,speaker:segment.speaker||'',audio:{kind:'native',id:source.audio.id,url:source.audio.url,text:'真人原声',duration:source.audio.duration,start:segment.start,end:segment.end}};
    });
    if(!quotes.length||!d.analysis_zh||!d.learner_action_zh)throw Error('Incomplete teaching guide '+clip.id);
    views[learn[i].id]={prompt:d.learner_action_zh,native_guide:{analysis:d.analysis_zh,quotes}};
    stats.deep_dives++;stats.quotes+=quotes.length;
  });
  for(const t of m.tasks){
    if(t.kind!=='work'||!t.prompt?.trim().startsWith('{'))continue;
    const d=JSON.parse(t.prompt);
    if(!d.prompt_zh||!d.title_zh||!Array.isArray(d.rubric))throw Error('Unknown structured transfer '+t.id);
    const levels=d.rubric.map(r=>{if(!r.criterion_zh||!r.met_zh||!r.partial_zh||!r.not_yet_zh)throw Error('Incomplete transfer rubric '+t.id);return {criterion:r.criterion_zh,met:r.met_zh,partial:r.partial_zh,not_yet:r.not_yet_zh};});
    views[t.id]={title:d.title_zh,prompt:d.prompt_zh,constraints:d.constraints_zh||[],rubric:levels.map(r=>r.criterion+'：'+r.met),rubric_levels:levels,model:d.sample_response_cs||'',model_zh:d.sample_response_zh||'',native_transfer:true};
    stats.transfers++;
  }
  if(earlyTransfers[clip.id]){
    const transfers=m.tasks.filter(t=>t.kind==='work'&&t.title==='换个对象，重新表达');
    if(transfers.length!==earlyTransfers[clip.id].length)throw Error('Early transfer mapping drift '+clip.id);
    transfers.forEach((t,i)=>{if(t.prompt!==clip.transfer[i])throw Error('Early source changed '+t.id);views[t.id]=earlyView(earlyTransfers[clip.id][i]);stats.transfers++;});
  }
  if(Object.keys(views).length){guides[m.id]=views;stats.missions++;}
}
const data={version:1,catalog_version:catalog.version,manifest_sha256:createHash('sha256').update(fs.readFileSync(path.join(root,'content/authentic/manifest.json'))).digest('hex'),stats,guides};
const output='// Generated by scripts/build-native-study-guides.mjs; view metadata only. Original task IDs and catalog are unchanged.\nexport const nativeStudyGuides='+JSON.stringify(data)+';\n';
const target=path.join(root,'app/public/game/native-guide-data.v1.js');
if(process.argv.includes('--check')){if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==output)throw Error('Native study view needs rebuilding');}
else fs.writeFileSync(target,output);
console.log(JSON.stringify({...stats,bytes:Buffer.byteLength(output),catalog_unchanged:true}));
