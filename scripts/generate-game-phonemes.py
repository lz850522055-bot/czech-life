"""Isolated Czech phonemes, not a whole example word mislabeled as one sound.
Uses the installed local Czech Piper model; original phonetic files stay intact.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess
import onnxruntime
import numpy as np
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig

def main():
    p=argparse.ArgumentParser();p.add_argument('--model',type=Path,required=True);p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
    root=Path(__file__).resolve().parents[1];out=root/'app/public/assets/phonetics-game-v2';out.mkdir(parents=True,exist_ok=True)
    model=a.model.resolve();config=json.loads(Path(str(model)+'.json').read_text('utf-8'))
    if config['espeak']['voice']!='cs':raise ValueError('Czech model required')
    opts=onnxruntime.SessionOptions();opts.intra_op_num_threads=2;opts.inter_op_num_threads=1
    voice=PiperVoice(session=onnxruntime.InferenceSession(str(model),sess_options=opts,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(config));sr=voice.config.sample_rate
    items=[('a','a','a'),('long-a','á','aː'),('e','e','ɛ'),('i','i','ɪ'),('long-i','í','iː'),('o','o','o'),('u','u','u'),('long-u','ú','uː'),('c','c','ts'),('ch-hook','č','tʃ'),('j','j','j'),('word','káva',None)]
    proof=[]
    for key,label,ipa in items:
        text='[['+ipa+']]' if ipa else label
        phones=[p for p in voice.phonemize(text) if p]
        if ipa and phones!=[list(ipa)]:raise ValueError('Unexpected phoneme expansion '+key)
        for speed,scale in [('normal',1),('slow',1.18)]:
            cfg=SynthesisConfig(length_scale=scale,noise_scale=.667,noise_w_scale=.8)
            if ipa:
                wave=voice.phoneme_ids_to_audio(voice.phonemes_to_ids(list(ipa)),cfg);peak=np.max(np.abs(wave));wave=wave/max(1e-5,float(peak));pcm=(np.clip(wave,-1,1)*32767).astype(np.int16).tobytes()
            else:pcm=b''.join(c.audio_int16_bytes for c in voice.synthesize(text,cfg))
            if not pcm:raise ValueError('Empty audio '+key)
            target=out/f'{key}-{speed}.mp3';tmp=target.with_suffix('.tmp.mp3')
            subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','64k',str(tmp)],input=pcm,check=True)
            subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-i',str(tmp),'-f','null','-'],check=True);tmp.replace(target)
            proof.append({'key':key,'label':label,'ipa_input':ipa,'phonemes':phones,'speed':speed,'seconds':round(len(pcm)/2/sr,4),'file':target.relative_to(root).as_posix(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
        print(key,flush=True)
    record={'scope':'phoneme input and file/decode verification; not native auditory certification','engine':'local Piper Czech','model_sha256':hashlib.sha256(model.read_bytes()).hexdigest(),'phonetic_sources':['https://fonetika.ff.cuni.cz/o-fonetice/foneticka-transkripce/transkripce-cj-ipa/','https://prirucka.ujc.cas.cz/?id=903'],'items':proof}
    (root/'evidence/game-prague-20261024/isolated-phonemes.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')

if __name__=='__main__':main()
