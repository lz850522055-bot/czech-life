let utterance,currentAudio,recorder,activeUrl,playGeneration=0;
export function isBundledCzechAudio(ref){
  return /^\/assets\/phonetics(?:-game-v[23])?\/[a-z-]+-normal\.mp3$/.test(ref?.file_url||'')&&/^\/assets\/phonetics(?:-game-v[23])?\/[a-z-]+-slow\.mp3$/.test(ref?.slow_file||'')||/^\/game\/audio\/field-v1\/field-[a-f0-9]{16}-normal\.mp3$/.test(ref?.file_url||'')&&ref.slow_file===ref.file_url.replace('-normal.mp3','-slow.mp3');
}
export function czechVoices(){return ('speechSynthesis'in window)?speechSynthesis.getVoices().filter(v=>/^cs(?:[-_]|$)/i.test(v.lang)):[];}
export function audioCapabilities(){return {voices:czechVoices().map(v=>({name:v.name,lang:v.lang,local:v.localService})),recording:!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined',secure:window.isSecureContext};}
export function stopAudio(){playGeneration++;window.speechSynthesis?.cancel();if(currentAudio){currentAudio.pause();currentAudio.removeAttribute('src');currentAudio.load();}currentAudio=null;}
export async function playCzech(text,{ref=null,speed=1,volume=1,repeat=1,onStatus=()=>{},onStarted=()=>{}}={}){
  stopAudio();
  if(ref?.status==='generated'&&ref.id){
    const slow=speed<.95&&ref.slow_file,begin=(slow?ref.slow_start:ref.start)||0,end=slow?ref.slow_end:ref.end,generation=playGeneration;
    const local=isBundledCzechAudio(ref);
    const audio=currentAudio=new Audio(local?(slow?ref.slow_file:ref.file_url):'/api/v1/audio/'+(ref.asset_id||ref.id)+(slow?'?speed=slow':''));audio.volume=volume;audio.preload='auto';
    // Slow files are separately synthesized; preserve the recorded voice without time stretching.
    audio.playbackRate=1;let finishing=false;
    const finish=()=>{if(finishing||generation!==playGeneration)return;finishing=true;audio.pause();if(--repeat>0){audio.currentTime=begin;finishing=false;audio.play().catch(e=>onStatus('播放失败：'+e.message));}else onStatus('播放完毕 · 捷语合成音频');};
    audio.ontimeupdate=()=>{if(end&&audio.currentTime>=end)finish();};audio.onended=finish;
    try{
      await new Promise((resolve,reject)=>{audio.onloadedmetadata=resolve;audio.onerror=()=>reject(new Error('音频文件无法读取或解码'));audio.load();});
      if(generation!==playGeneration)return;audio.currentTime=begin;await audio.play();onStarted();onStatus('正在播放课程音频 · '+(slow?'独立合成慢速':'正常速度'));return;
    }catch{if(generation!==playGeneration)return;if(local){onStatus('这段随包捷语音频暂时未能读取，请重试播放。');return;}onStatus('文件不可用，检查本设备捷语语音…');}
  }
  const voices=czechVoices();
  const voice=voices.find(v=>v.localService)||voices[0];
  if(!voice){onStatus('本设备未检测到捷语语音，且此音频尚未生成。请安装捷语语音包或导入音频；不会改用英语朗读。');return;}
  if(!navigator.onLine&&!voice.localService){onStatus('只有联网捷语语音，当前离线不能播放；请下载音频或安装本地捷语语音。');return;}
  const speak=()=>{utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.rate=Math.max(.75,Math.min(1.1,speed));utterance.volume=volume;utterance.onstart=()=>{onStarted();onStatus('正在播放捷语语音 · '+voice.name);};utterance.onend=()=>{if(--repeat>0)speak();else onStatus('播放完毕 · '+voice.name);};utterance.onerror=e=>onStatus('捷语语音播放失败：'+e.error+'。请检查系统语音包和声音权限。');speechSynthesis.speak(utterance);};
  onStatus('捷语 TTS · '+voice.name+(voice.localService?' · 本地语音':' · 需要网络'));speak();
}
// getUserMedia may remain unresolved indefinitely. Keep one native request until
// it settles; timed-out/cancelled requests must never start a late recording.
export function createMicrophoneRequest({getUserMedia,timeoutMs=20000,setTimer=setTimeout,clearTimer=clearTimeout}){
  let pending=null;
  const release=stream=>stream.getTracks().forEach(track=>track.stop());
  return {
    request(onStatus=()=>{}){
      if(pending){
        const message=pending.active?'正在等待麦克风授权，请先处理浏览器的权限提示。':'上一次麦克风请求尚未结束。请处理网站权限提示；仍无响应时刷新当前页面后重试。当前没有录音。';
        onStatus(message);return Promise.reject(new Error(message));
      }
      const request={active:true,timer:null,cancel:null};pending=request;
      return new Promise((resolve,reject)=>{
        request.cancel=message=>{
          if(!request.active)return;
          request.active=false;clearTimer(request.timer);onStatus(message);reject(new Error(message));
        };
        onStatus('正在等待麦克风授权…请查看浏览器或地址栏的网站权限提示，选择允许；当前还没有开始录音。');
        request.timer=setTimer(()=>request.cancel('20秒内未收到麦克风授权结果，当前没有录音。请查看地址栏网站权限或尚未处理的提示；处理后点“开始录音”，仍无响应时刷新当前页面重试。'),timeoutMs);
        const settled=()=>{clearTimer(request.timer);if(pending===request)pending=null;};
        try{
          Promise.resolve(getUserMedia({audio:true})).then(stream=>{
            settled();
            if(!request.active){release(stream);return;}
            request.active=false;resolve(stream);
          },error=>{
            settled();if(!request.active)return;request.active=false;
            const message=error?.name==='NotAllowedError'?'麦克风权限被拒绝。请在地址栏网站权限中允许麦克风，再试一次。':'无法打开麦克风：'+(error?.message||'设备未返回具体原因');
            onStatus(message);reject(new Error(message));
          });
        }catch(error){settled();request.active=false;const message='无法打开麦克风：'+error.message;onStatus(message);reject(new Error(message));}
      });
    },
    cancel(){pending?.cancel('已取消本次录音等待，当前没有录音。若浏览器稍后返回麦克风，也会立即释放；需要时重新点“开始录音”。');}
  };
}
const microphoneRequest=createMicrophoneRequest({getUserMedia:constraints=>navigator.mediaDevices.getUserMedia(constraints)});
export function cancelRecordingRequest(){microphoneRequest.cancel();}
export async function startRecording(onStop,onStatus=()=>{}){
  if(recorder?.state==='recording')throw new Error('已有录音正在进行。');
  if(!window.isSecureContext){const message='录音需要 HTTPS，电脑本机 localhost 也可用。';onStatus(message);throw new Error(message);}
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){const message='当前浏览器不支持录音，请使用支持麦克风的浏览器。';onStatus(message);throw new Error(message);}
  const stream=await microphoneRequest.request(onStatus);
  let current;
  try{
    const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m));
    current=new MediaRecorder(stream,mime?{mimeType:mime}:{});recorder=current;
    const chunks=[];let bytes=0,timer;
    const release=()=>{clearTimeout(timer);stream.getTracks().forEach(t=>t.stop());};
    current.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>18*1024*1024&&current.state==='recording')current.stop();}};
    current.onstop=async()=>{release();const blob=new Blob(chunks,{type:current.mimeType});if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=URL.createObjectURL(blob);await onStop(blob,activeUrl);};
    current.onerror=e=>{release();onStatus('录音失败：'+(e.error?.message||'未知错误'));};
    current.start(1000);timer=setTimeout(()=>{if(current.state==='recording')current.stop();},10*60*1000);onStatus('正在录音…完成后点击停止。单段最多10分钟，以控制文件大小。');
  }catch(error){stream.getTracks().forEach(t=>t.stop());const message='无法开始录音：'+error.message;onStatus(message);throw new Error(message);}
}
export function stopRecording(){cancelRecordingRequest();if(recorder?.state==='recording')recorder.stop();}
export function isRecording(){return recorder?.state==='recording';}
