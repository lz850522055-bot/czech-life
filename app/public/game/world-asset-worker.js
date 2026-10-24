const active=new Map();
self.onmessage=async({data})=>{
  if(data.cancel){active.get(data.id)?.abort();return;}
  const controller=new AbortController();active.set(data.id,controller);
  try{const r=await fetch(data.url,{signal:controller.signal});if(!r.ok)throw new Error('TILE_HTTP_'+r.status);const blob=await r.blob();if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'premultiply'});if(controller.signal.aborted){bitmap.close();throw new DOMException('Cancelled','AbortError');}self.postMessage({id:data.id,bitmap,bytes:blob.size},[bitmap]);}
  catch(e){self.postMessage({id:data.id,error:e.message,aborted:e.name==='AbortError'});}finally{active.delete(data.id);}
};
