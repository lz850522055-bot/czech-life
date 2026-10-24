from pathlib import Path
import argparse,hashlib,json,subprocess
import onnxruntime
from piper import PiperVoice,SynthesisConfig
from piper.config import PiperConfig
p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
root=Path(__file__).resolve().parents[1];source=json.loads((root/'runtime/game-implementation-20261024/simulation-voice/script.json').read_text('utf-8'));out=root/'app/public/game/audio/simulation-v1';out.mkdir(parents=True,exist_ok=True)
model=a.model.resolve();conf=json.loads(Path(str(model)+'.json').read_text('utf-8'));assert conf['espeak']['voice']=='cs'
opts=onnxruntime.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
voice=PiperVoice(session=onnxruntime.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(conf));sr=voice.config.sample_rate;items=[]
for i,line in enumerate(source['lines']):
    record={**line,'files':{}}
    for speed,scale in [('normal',1),('slow',1.18)]:
        target=out/(line['id']+'-'+speed+'.mp3');pcm=b''.join(c.audio_int16_bytes for c in voice.synthesize(line['text'],SynthesisConfig(length_scale=scale,noise_scale=.667,noise_w_scale=.8)))
        assert pcm
        temporary=target.with_suffix('.tmp.mp3');subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','64k',str(temporary)],input=pcm,check=True)
        subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-i',str(temporary),'-f','null','-'],check=True);temporary.replace(target)
        record['files'][speed]={'url':'/game/audio/simulation-v1/'+target.name,'seconds':round(len(pcm)/2/sr,3),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    items.append(record);print(str(i+1)+'/'+str(len(source['lines'])),flush=True)
manifest={'version':source['version'],'voice':'Czech Piper cs_CZ-jirka-medium','kind':'synthetic','review':'decoded; not native-listened','model_sha256':hashlib.sha256(model.read_bytes()).hexdigest(),'items':items}
target=out/'manifest.json';target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8');(root/'evidence/game-prague-20261024/simulation-audio.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
