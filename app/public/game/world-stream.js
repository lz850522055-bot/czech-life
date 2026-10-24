// Bounded priority streaming, independent of the rendering engine and account data.
export class TileStream {
  constructor({load,publish,dispose,onChange=()=>{},concurrency=3,maxBytes=64*1024*1024,maxReady=4,retryMs=5000}){
    Object.assign(this,{load,publish,dispose,onChange,concurrency,maxBytes,maxReady,retryMs});
    this.plan=new Map();this.cache=new Map();this.inflight=new Map();this.ready=[];this.failures=new Map();this.bytes=0;this.closed=false;
    this.stats={requested:0,aborted:0,failed:0,uploaded:0,evicted:0,peak_fetches:0,peak_ready:0,peak_bytes:0};
  }
  setPlan(list){
    if(this.closed)return;this.plan=new Map(list.map(d=>[d.url,d]));
    for(const [url,r]of this.inflight)if(!this.plan.has(url)){r.abort();this.stats.aborted++;}
    this.ready=this.ready.filter(r=>{if(this.plan.has(r.desc.url))return true;this.dispose(r.data);return false;});
    let urgent=list.filter(d=>d.visible&&!this.cache.has(d.url)&&!this.inflight.has(d.url)&&!this.ready.some(r=>r.desc.url===d.url)).length;
    if(urgent&&this.inflight.size>=this.concurrency)for(const [url,r]of this.inflight){if(!urgent)break;if(!r.signal.aborted&&!this.plan.get(url)?.visible){r.abort();this.stats.aborted++;urgent--;}}
    this.trim();this.pump();
  }
  get(url){const item=this.cache.get(url);if(item){this.cache.delete(url);this.cache.set(url,item);}return item?.value;}
  pump(){
    if(this.closed)return;
    const list=[...this.plan.values()].sort((a,b)=>a.priority-b.priority);
    for(const d of list){
      if(this.inflight.size>=this.concurrency||this.ready.length+this.inflight.size>=this.maxReady)break;
      if(this.cache.has(d.url)||this.inflight.has(d.url)||this.ready.some(r=>r.desc.url===d.url)||Date.now()-(this.failures.get(d.url)||0)<this.retryMs)continue;
      const controller=new AbortController();this.inflight.set(d.url,controller);this.stats.requested++;this.stats.peak_fetches=Math.max(this.stats.peak_fetches,this.inflight.size);
      this.load(d,controller.signal).then(data=>{
        if(this.closed||controller.signal.aborted||!this.plan.has(d.url)){this.dispose(data);return;}
        this.ready.push({desc:d,data});this.stats.peak_ready=Math.max(this.stats.peak_ready,this.ready.length);this.onChange();
      }).catch(e=>{if(e.name!=='AbortError'&&!this.closed){this.failures.set(d.url,Date.now());this.stats.failed++;this.onChange();if(!this.retryTimer)this.retryTimer=setTimeout(()=>{this.retryTimer=null;this.pump();this.onChange();},this.retryMs+10);}}).finally(()=>{this.inflight.delete(d.url);this.pump();});
    }
  }
  upload({max=2,budgetMs=3,now=()=>performance.now()}={}){
    const start=now();let count=0;
    this.ready.sort((a,b)=>(this.plan.get(a.desc.url)?.priority??Infinity)-(this.plan.get(b.desc.url)?.priority??Infinity));
    while(this.ready.length&&count<max&&(count===0||now()-start<budgetMs)){
      const {desc,data}=this.ready.shift();if(!this.plan.has(desc.url)){this.dispose(data);continue;}
      try{const item=this.publish(this.plan.get(desc.url),data);this.cache.set(desc.url,item);this.bytes+=item.bytes;this.stats.uploaded++;count++;}catch(e){this.dispose(data);this.failures.set(desc.url,Date.now());this.stats.failed++;}
    }
    this.trim();this.stats.peak_bytes=Math.max(this.stats.peak_bytes,this.bytes);this.pump();return count;
  }
  trim(){
    if(this.bytes<=this.maxBytes)return;
    const candidates=[...this.cache].filter(([url])=>!this.plan.get(url)?.visible).sort((a,b)=>Number(this.plan.has(a[0]))-Number(this.plan.has(b[0])));
    for(const [url,item]of candidates){if(this.bytes<=this.maxBytes)break;this.cache.delete(url);this.bytes-=item.bytes;this.dispose(item.value);this.stats.evicted++;}
  }
  snapshot(){return {...this.stats,bytes:this.bytes,cached:this.cache.size,fetches:this.inflight.size,ready:this.ready.length,wanted:this.plan.size};}
  close(){this.closed=true;clearTimeout(this.retryTimer);for(const c of this.inflight.values())c.abort();for(const r of this.ready)this.dispose(r.data);for(const r of this.cache.values())this.dispose(r.value);this.ready=[];this.cache.clear();this.bytes=0;}
}
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function streamPlan(manifest,view,{dpr=1,vx=0,vy=0}={}){
  const {x,y,zoom,width,height}=view,b={left:x-width/zoom/2,right:x+width/zoom/2,top:y-height/zoom/2,bottom:y+height/zoom/2},out=[],seen=new Set(),distance=(l,t,w,h)=>Math.hypot((l+w/2-x)*zoom,(t+h/2-y)*zoom)/Math.max(width,height);
  const add=d=>{if(!seen.has(d.url)){seen.add(d.url);out.push(d);}};
  add({...manifest.overview,pixelWidth:768,pixelHeight:695,priority:0,visible:true,order:0});
  const expandX=Math.min(width/zoom,Math.abs(vx)*.3)+width/zoom*.3,expandY=Math.min(height/zoom,Math.abs(vy)*.3)+height/zoom*.3,predicted={left:b.left-expandX,right:b.right+expandX,top:b.top-expandY,bottom:b.bottom+expandY};
  for(const [name,order]of [['base',1],['detail',2]]){
    if(zoom<(name==='base'?.12:.65))continue;const layer=manifest[name],span=layer.span,index=layer.index||=new Set(layer.keys);
    for(let a=Math.floor(predicted.left/span);a<=Math.floor(predicted.right/span);a++)for(let c=Math.floor(predicted.top/span);c<=Math.floor(predicted.bottom/span);c++){
      const key=a+'_'+c;if(!index.has(key))continue;const tile={left:a*span,top:c*span,right:(a+1)*span,bottom:(c+1)*span},visible=intersects(tile,b),boost=(name==='base'?10:20)+distance(tile.left,tile.top,span,span);
      add({url:`/game/stream-v1/${layer.dir||name}/${key}.webp`,left:tile.left-span/layer.pixels,top:tile.top-span/layer.pixels,width:span+2*span/layer.pixels,height:span+2*span/layer.pixels,pixelWidth:layer.pixels+2,pixelHeight:layer.pixels+2,visible,priority:(visible?0:1000)+boost,order});
    }
  }
  for(const scene of manifest.scenes){const box={left:scene.bounds.left,top:scene.bounds.top,right:scene.bounds.left+scene.bounds.width,bottom:scene.bounds.top+scene.bounds.height};if(!intersects(box,predicted))continue;
    const ideal=scene.levels.find(l=>l.scale>=zoom*dpr*.85)||scene.levels.at(-1),levels=ideal===scene.levels[0]?[ideal]:[scene.levels[0],ideal];
    for(const level of levels)for(const t of level.tiles){const w=t.width/level.scale,h=t.height/level.scale,l=box.left+t.left/level.scale,top=box.top+t.top/level.scale,visible=intersects({left:l,top,right:l+w,bottom:top+h},b);
      if(!visible&&!intersects({left:l,top,right:l+w,bottom:top+h},predicted))continue;
      add({url:t.url,left:l,top,width:w,height:h,pixelWidth:t.width,pixelHeight:t.height,visible,priority:(visible?0:1000)+(level.level?5:1)+distance(l,top,w,h),order:10+(scene.stack||0)+level.level});
    }
  }
  // Admission control prevents prefetch/decode churn from exceeding the memory budget.
  let bytes=0;return out.sort((a,b)=>a.priority-b.priority).filter(d=>{const size=Math.ceil(d.pixelWidth*d.pixelHeight*4*7/3);if(bytes+size>48*1024*1024)return false;bytes+=size;return true;}).slice(0,40);
}
