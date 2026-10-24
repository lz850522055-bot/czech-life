"""New starter-map sounds; immutable v2 clips are never replaced."""
from pathlib import Path
import argparse,hashlib,json,subprocess
import onnxruntime
import numpy as np
from piper import PiperVoice,SynthesisConfig
from piper.config import PiperConfig
p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--ffmpeg',required=True);args=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'app/public/assets/phonetics-game-v3';out.mkdir(parents=True,exist_ok=True)
assert not (out/'manifest.json').exists(), 'Do not overwrite verified sound pack'
model=args.model.resolve();conf=json.loads(Path(str(model)+'.json').read_text('utf-8'));assert conf['espeak']['voice']=='cs'
opts=onnxruntime.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
voice=PiperVoice(session=onnxruntime.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(conf));sr=voice.config.sample_rate
rows=[]
for key,text,ipa in [('long-e','é','ɛː'),('long-o','ó','oː'),('ra','ra','ra'),('rha','řa','r̝a'),('ch','ch','x')]:
    phones=voice.phonemize('[['+ipa+']]');assert [p for p in phones if p]==[list(ipa)]
    assert all(ch in voice.config.phoneme_id_map for ch in ipa), 'Missing model phoneme '+ipa
    row={'key':key,'text':text,'ipa_input':ipa,'phones':phones,'files':{}}
    for speed,scale in [('normal',1),('slow',1.18)]:
        wave=voice.phoneme_ids_to_audio(voice.phonemes_to_ids(list(ipa)),SynthesisConfig(length_scale=scale,noise_scale=.667,noise_w_scale=.8));assert wave.size
        peak=float(np.max(np.abs(wave)));assert peak>.001
        pcm=(np.clip(wave/peak,-1,1)*32767).astype(np.int16).tobytes();target=out/f'{key}-{speed}.mp3';assert not target.exists()
        tmp=target.with_suffix('.tmp.mp3')
        subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','64k',str(tmp)],input=pcm,check=True)
        subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-xerror','-i',str(tmp),'-f','null','-'],check=True);tmp.replace(target)
        row['files'][speed]={'url':'/assets/phonetics-game-v3/'+target.name,'seconds':round(len(pcm)/2/sr,4),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    rows.append(row);print(key,flush=True)
record={'version':1,'engine':'local Piper Czech explicit phonemes','quality':'input, bytes and decode checked; not native-listened','model_sha256':hashlib.sha256(model.read_bytes()).hexdigest(),'items':rows}
(out/'manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
(root/'evidence/game-prague-20261024/sound-map-audio.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
