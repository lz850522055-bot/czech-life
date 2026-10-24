// Render a small page while searching the complete, unchanged rule inventory.
export function codexPageRows(knowledge,{query='',level='',limit=12}={}){
 const q=String(query).trim().toLocaleLowerCase('cs'),n=Number.isSafeInteger(limit)&&limit>0?limit:12;
 const all=knowledge.filter(g=>(!level||g.level===level)&&(!q||[g.rule_zh,g.detail_zh,g.term,...(g.examples||[]).flatMap(x=>[x.cs,x.zh])].filter(Boolean).join(' ').toLocaleLowerCase('cs').includes(q)));
 return {items:all.slice(0,n),total:all.length,more:all.length>n,limit:n};
}
