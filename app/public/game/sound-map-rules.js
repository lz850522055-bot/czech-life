// Starter relationships; not a claim that the entire Czech sound system is covered.
export const SOUND_GROUPS=[
 {id:'a',label:'a / á',sounds:['a','aa']},{id:'e',label:'e / é',sounds:['e','ee']},{id:'i',label:'i / í',sounds:['i','ii']},{id:'o',label:'o / ó',sounds:['o','oo']},{id:'u',label:'u / ú',sounds:['u','uu']},
 {id:'c',label:'c / č',sounds:['c','cc']},{id:'r',label:'r / ř',sounds:['ra','rha']},{id:'ch',label:'ch',sounds:['ch']},{id:'word',label:'ká + va',sounds:['word']}
];
const vowel=(symbol,ipa,file,why,course,text=symbol,pack=2)=>({symbol,ipa,file,text,pack,why,course});
const rows={
 a:vowel('a','[a]','a','嘴自然张开，舌位较低；短短发出，不额外加一个“呃”。','F01'),
 aa:vowel('á','[aː]','long-a','同类元音的长音。斜线标记长度，不表示喊响、升调或重音；不按固定两倍计时。','F01'),
 e:vowel('e','[ɛ]','e','嘴唇不圆，舌位在中间偏前。先对比e与é的持续时间，再与圆唇的o对比。','F02'),
 ee:vowel('é','[ɛː]','long-e','保留e这一组的发音位置，听长音é；不能把斜线当成另一个音节。','F02','é',3),
 i:vowel('i / y','[ɪ]','i','i和y可写同一个标准短元音；发音相同不等于词里可以任意换拼写。','F03','i'),
 ii:vowel('í / ý','[iː]','long-i','í和ý可写同一个标准长元音。对比短音[ɪ]时也留意音质，不把录音机械拉长当成完整发音方法。','F03','í'),
 o:vowel('o','[o]','o','嘴唇圆拢，舌位比u低。这里用起步的宽式标记辅助对照，不要求按符号猜出所有语音细节。','F02'),
 oo:vowel('ó','[oː]','long-o','听长音ó，再回听短音o；不要把一个长元音拆成两个音节。','F02','ó',3),
 u:vowel('u','[u]','u','嘴唇圆拢，舌位较高；别在末尾另加一个元音。','F02'),
 uu:vowel('ú / ů','[uː]','long-u','ú和ů可对应同一个长音；不能仅凭这个声音决定一个具体词该用哪种拼写。','F03','ú'),
 c:vowel('c','[t͡s]','c','先短暂阻住，再紧接着放出摩擦气流；与č比较发音位置，别额外加一个元音。','F05'),
 cc:vowel('č','[t͡ʃ]','ch-hook','比c的发音位置更靠后。小钩改变声音，不是把同一个c说得更响。','F05','č'),
 ra:vowel('r → ra','[ra]','ra','舌尖靠近齿龈，先在ra音节里尝试短促弹动。下方播放ra，不冒充只有一个r的录音。','F06','ra',3),
 rha:vowel('ř → řa','[r̝a]','rha','在带摩擦的颤音后接a形成řa。下方播放整个音节；先与ra交替回听，不靠拼成“日”来替代。','F06','řa',3),
 ch:vowel('ch','[x]','ch','这里两个字母组合对应一个声音。气流在口腔后部形成摩擦，不是先读c再读h。','F04','ch',3),
 word:vowel('ká · va','[ˈkaːva]','word','káva有两个音节：ká + va。ˈ标出重音起点，ː标出元音长度；两个符号回答不同问题。','F07','káva')
};
export function starterSound(key='a'){const r=rows[key];if(!r)throw Error('Unknown starter sound');return {...r,key,group:SOUND_GROUPS.find(g=>g.sounds.includes(key)).id,zh:r.symbol};}
export function starterSoundRef(key){const r=starterSound(key);return {id:'starter-sound-'+key,text:r.text,status:'generated',file_url:`/assets/phonetics-game-v${r.pack}/${r.file}-normal.mp3`,slow_file:`/assets/phonetics-game-v${r.pack}/${r.file}-slow.mp3`,voice:'cs_CZ-jirka-medium',quality_status:'machine_checked_not_native_listened'};}
export function starterSoundForTask(m,t){if(m?.id==='F02')return 'e';if(m?.id==='F03')return 'i';if(m?.id==='F05')return 'c';if(m?.id==='F06')return 'ra';if(m?.id==='F04'||m?.id==='F07')return 'word';return t?.cards?.some(c=>c.cs==='á')?'aa':'a';}
export function foundationTaskView(m,t){
 if(m?.id!=='F06'||t?.cards?.length!==2||t.cards[0].cs!=='r'||t.cards[1].cs!=='ř')return t;
 return {...t,cards:t.cards.map((card,i)=>({...card,cs:i?'ř → řa':'r → ra',ipa:starterSound(i?'rha':'ra').ipa,audio:starterSoundRef(i?'rha':'ra'),note:'播放带a的短音节来比较发音位置；本地合成示范，不做发音评分。'}))};
}
