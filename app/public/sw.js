const SHELL='czstudy-shell-v29-20261024-game-entry';
const FILES=['/app.js?v=20261024-game-entry-v29','/city-explorer.css?v=20261023-foundation-v28','/','/index.html','/styles.css','/city-explorer.css','/assets/prague-discovery.png','/app.js','/request-cache.js','/storage.js','/sync.js','/audio.js','/coaching.js','/scenarios.js','/authentic.js','/native-challenge.js','/update-notice.js','/choice-order.js','/advanced-listening.js','/manifest.webmanifest','/icon.svg','/articulation.svg','/icon-192.png','/icon-512.png',"/assets/phonetics/a-normal.mp3","/assets/phonetics/a-slow.mp3","/assets/phonetics/long-a-normal.mp3","/assets/phonetics/long-a-slow.mp3","/assets/phonetics/e-normal.mp3","/assets/phonetics/e-slow.mp3","/assets/phonetics/i-normal.mp3","/assets/phonetics/i-slow.mp3","/assets/phonetics/long-i-normal.mp3","/assets/phonetics/long-i-slow.mp3","/assets/phonetics/o-normal.mp3","/assets/phonetics/o-slow.mp3","/assets/phonetics/u-normal.mp3","/assets/phonetics/u-slow.mp3","/assets/phonetics/long-u-normal.mp3","/assets/phonetics/long-u-slow.mp3","/assets/phonetics/c-normal.mp3","/assets/phonetics/c-slow.mp3","/assets/phonetics/ch-hook-normal.mp3","/assets/phonetics/ch-hook-slow.mp3","/assets/phonetics/j-normal.mp3","/assets/phonetics/j-slow.mp3","/assets/phonetics/word-normal.mp3","/assets/phonetics/word-slow.mp3"];
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('czstudy-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
function activeUser(){return new Promise(resolve=>{
  const req=indexedDB.open('czstudy-private-v1');
  // A cache lookup must never create a schema-less database before storage.js.
  req.onupgradeneeded=()=>req.transaction.abort();
  req.onerror=()=>resolve(null);
  req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains('kv')){db.close();return resolve(null);}
    const tx=db.transaction('kv'),store=tx.objectStore('kv'),session=store.get('session'),reauth=store.get('reauthRequired');
    tx.oncomplete=()=>{db.close();resolve(reauth.result?null:session.result?.user?.id||null);};
    tx.onerror=tx.onabort=()=>{db.close();resolve(null);};
  };
});}
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(url.origin!==self.location.origin||req.method!=='GET')return;
  if(url.pathname.startsWith('/api/v1/')){
    // Only explicit lesson/media downloads. Authentication, answers, exports and progress never enter SW cache.
    if(url.pathname.startsWith('/api/v1/authentic')||url.pathname.startsWith('/api/v1/lessons/')||url.pathname.startsWith('/api/v1/audio/')||url.pathname==='/api/v1/curriculum'||url.pathname==='/api/v1/scenarios'||url.pathname.startsWith('/api/v1/scenarios/'))event.respondWith(fetch(req).catch(async()=>{const uid=await activeUser();const cached=uid?await(await caches.open('czstudy-user-'+uid)).match(req,{ignoreSearch:false}):null;return cached||new Response(JSON.stringify({error:'当前离线，尚未下载此内容。'}),{status:503,headers:{'Content-Type':'application/json'}});}));
    return;
  }
  if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;}
  if(FILES.includes(url.pathname))event.respondWith(caches.match(req).then(c=>c||fetch(req)));
});

// An already-open page chooses when to reload after checking its own unsaved work.
self.addEventListener('message',event=>{if(event.data?.type==='CZSTUDY_SHELL_VERSION')event.source?.postMessage({type:'CZSTUDY_SHELL_VERSION',version:SHELL});});
