import {starterSound} from './sound-map-rules.js?v=2';
export const PATTERN_TOPICS=[{id:'sound',title:'声音地图',subtitle:'长短、拼写、拼读，连起来看'},{id:'quantity',title:'数量与词形',subtitle:'换东西、换数量、换角色'},{id:'identity',title:'谁在家',subtitle:'我、你、他，与肯定和否定'}];
const select=(list,value,name)=>{if(!list.includes(value))throw Error('Unknown '+name);return value;};
export function quantityPattern({item='hrnek',count=1,mode='label'}={}){
 select(['hrnek','kava'],item,'item');select([1,2],count,'quantity');select(['label','request'],mode,'role');
 const cup=item==='hrnek',number=cup?(count===1?'jeden':'dva'):(count===2?'dvě':mode==='label'?'jedna':'jednu'),noun=cup?(count===1?'hrnek':'hrnky'):(count===2?'kávy':mode==='label'?'káva':'kávu'),baseNumber=cup?'jeden':'jedna',baseNoun=cup?'hrnek':'káva';
 const body=number+' '+noun,text=mode==='request'?'Prosím '+body+'.':body,zh=(mode==='request'?'请给我':'')+(count===1?'一':'两')+(cup?'只杯子':'杯咖啡');
 const why=count===2?(cup?'从一只变成两只：jeden hrnek → dva hrnky。这里连数量词和名词一起看；hrnek中间的e也不再出现。':'同样是两个，这里用dvě kávy；杯子是dva hrnky。名词的语法性别不同，不能只把中文“二”换成同一个词。'):!cup&&mode==='request'?'标签里是jedna káva；向店主请求时是Prosím jednu kávu. 数量词和名词都跟着句里的角色变化。':mode==='request'?'请求里加上Prosím。这组jeden hrnek看起来没有变形；不能因此认定所有名词在请求里都不变。':'先记住这一整组：'+body+'。再换数量或说话目的，看同一个东西怎样出现在不同表达里。';
 return {item,count,mode,text,zh,base:baseNumber+' '+baseNoun,parts:[...(mode==='request'?[{text:'Prosím',label:'礼貌请求',changed:true}]:[]),{text:number,label:'数量',changed:number!==baseNumber},{text:noun+(mode==='request'?'.':''),label:'要说的东西',changed:noun!==baseNoun}],why,boundary:'这里比较这两个词在标签和请求里的形式；其他名词、格和数量需要各自学习，不能一律删e或把a改成u。',contrast:cup?(count===1?(mode==='request'?'Prosím jednu kávu.':'jedna káva'):(mode==='request'?'Prosím dvě kávy.':'dvě kávy')):(count===1?(mode==='request'?'Prosím jeden hrnek.':'jeden hrnek'):(mode==='request'?'Prosím dva hrnky.':'dva hrnky'))};
}
export function identityPattern({person='ja',negative=false}={}){
 const people={ja:['Já','我','jsem','nejsem'],ty:['Ty','你','jsi','nejsi'],on:['On','他','je','není'],ona:['Ona','她','je','není']};if(!people[person]||typeof negative!=='boolean')throw Error('Unknown person or polarity');const [pronoun,zh,positive,negated]=people[person],verb=negative?negated:positive;
 return {person,negative,text:`${pronoun} ${verb} doma.`,zh:zh+(negative?'不在家。':'在家。'),base:`${pronoun} ${positive} doma.`,parts:[{text:pronoun,label:'谁',changed:person!=='ja'},{text:verb,label:negative?'否定的“在”':'“在”的人称形式',changed:verb!=='jsem'},{text:'doma.',label:'在家',changed:false}],why:negative&&['on','ona'].includes(person)?'je的否定是není，不能直接拼成neje。他和她在这里都用není。':negative?'先保留“谁”和doma，再把'+positive+'换成'+negated+'，整句就从“在家”变成“不在家”。':['on','ona'].includes(person)?'他和她在这里都用je。不是每换一个代词，动词形式就一定不同。':'我用jsem，你用jsi；先找句子说的是谁，再选být的形式。',boundary:'这是být现在时的几个例子，不是所有动词都使用jsem/jsi/je这组形式。doma表示在家。'};
}
export function soundPattern(sound='a'){
 return starterSound(sound);
}
export function patternTopicFor(m,t){
 if(!m||!t)return null;
 if(m.native||!['Pre-A1','A1'].includes(m.level))return null;
 if(/^F0[1-7]$/.test(m.id))return 'sound';
 if(t.cards?.some(c=>c.ipa&&['a','á'].includes(c.cs))||t.kind==='listen'&&t.options?.some(o=>/a \[a\]|á \[a/.test(o.text)))return 'sound';
 if(t.kind==='checkout'||m.district&&[2,3,4].includes(t.chapter)||/^F11/.test(m.id))return 'quantity';
 if(m.district&&t.chapter===1||/G-A1-U01/.test(m.id))return 'identity';
 return null;
}
export function allPatternPhrases(){return [...new Set([...['hrnek','kava'].flatMap(item=>[1,2].flatMap(count=>['label','request'].map(mode=>quantityPattern({item,count,mode}).text))),...['ja','ty','on','ona'].flatMap(person=>[false,true].map(negative=>identityPattern({person,negative}).text))])];}
