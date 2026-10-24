// Stable per exercise and version across devices; option IDs remain the grading keys.
export function choiceOrder(options, key) {
  let seed=2166136261;
  for(const ch of String(key)) seed=Math.imul(seed ^ ch.codePointAt(0),16777619) >>> 0;
  const out=[...options];
  for(let i=out.length-1;i>0;i--){
    seed=(Math.imul(seed,1664525)+1013904223) >>> 0;
    const j=seed % (i+1);[out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}
