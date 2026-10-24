"""New, short authored street materials. Local Czech Piper only; no paid API."""
from pathlib import Path
import argparse, hashlib, json, subprocess
import numpy as np
import onnxruntime
from piper import PiperVoice, SynthesisConfig
from piper.config import PiperConfig

def sha(file): return hashlib.sha256(file.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--model',type=Path,required=True);parser.add_argument('--ffmpeg',required=True)
    parser.add_argument('--plan',default='runtime/game-implementation-20261024/foundation-field-audio-plan.json');parser.add_argument('--manifest',default='content/game/field-audio.v1.json');parser.add_argument('--evidence',default='evidence/game-prague-20261024/foundation-field-audio.json');args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    for value in [args.plan,args.manifest,args.evidence]:
        if not (root/value).resolve().is_relative_to(root):raise ValueError('Project paths must remain under the E-drive project')
    plan=json.loads((root/args.plan).read_text('utf-8-sig'))
    target=root/'app/public/game/audio/field-v1';target.mkdir(parents=True,exist_ok=True)
    model=args.model.resolve();model_hash=sha(model)
    if model_hash!='cbd5c900acacc8e8cbecd64347abb8de39c00a9d3104bed06fee92e4f319efc8':raise ValueError('Unexpected Czech model bytes')
    config=json.loads(Path(str(model)+'.json').read_text('utf-8'))
    if config['espeak']['voice']!='cs':raise ValueError('Czech voice required')
    options=onnxruntime.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
    voice=PiperVoice(session=onnxruntime.InferenceSession(str(model),sess_options=options,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(config));rate=voice.config.sample_rate
    manifest=root/args.manifest;previous=json.loads(manifest.read_text('utf-8')) if manifest.exists() else {};old={x['id']:x for x in previous.get('items',[])};items=[]
    checkpoints=root/'runtime/game-implementation-20261024/field-audio-checkpoints';checkpoints.mkdir(exist_ok=True)
    for source in plan:
        identity=hashlib.sha256(json.dumps(source,ensure_ascii=False,sort_keys=True).encode()).hexdigest();existing=old.get(source['id'])
        if existing and existing.get('script_sha256')==identity and previous.get('model_sha256')==model_hash and all((target/(source['id']+'-'+speed+'.mp3')).exists() and sha(target/(source['id']+'-'+speed+'.mp3'))==existing[speed+'_sha256'] for speed in ['normal','slow']):
            items.append(existing);continue
        entry={**source,'script_sha256':identity}
        for speed,scale in [('normal',1),('slow',1.18)]:
            file=target/(source['id']+'-'+speed+'.mp3')
            if file.exists():raise ValueError('Do not overwrite unverified or changed audio: '+str(file))
            synthesis=SynthesisConfig(length_scale=scale,noise_scale=.667,noise_w_scale=.8)
            if source.get('phonemes'):
                chunks=[]
                for number,phone in enumerate(source['phonemes']):
                    wave=voice.phoneme_ids_to_audio(voice.phonemes_to_ids(list(phone)),synthesis)
                    wave=wave/max(.00001,float(np.max(np.abs(wave))))*.92
                    chunks.append((np.clip(wave,-1,1)*32767).astype(np.int16).tobytes())
                    if number<len(source['phonemes'])-1:chunks.append(bytes(int(rate*.32)*2))
                pcm=b''.join(chunks)
            else:pcm=b''.join(c.audio_int16_bytes for c in voice.synthesize(source['text'],synthesis))
            samples=np.frombuffer(pcm,dtype=np.int16)
            if len(samples)<rate*.1 or float(np.sqrt(np.mean(samples.astype(np.float64)**2)))<20:raise ValueError('Empty or silent material')
            temporary=file.with_suffix('.tmp.mp3')
            subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(rate),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','64k',str(temporary)],input=pcm,check=True)
            subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-i',str(temporary),'-f','null','-'],check=True)
            temporary.replace(file);entry[speed+'_seconds']=round(len(samples)/rate,4);entry[speed+'_sha256']=sha(file);entry[speed+'_bytes']=file.stat().st_size
        items.append(entry);(checkpoints/(source['id']+'.json')).write_text(json.dumps(entry,ensure_ascii=False,indent=2),'utf-8');print(json.dumps({'id':source['id'],'normal_seconds':entry['normal_seconds'],'status':'generated'}),flush=True)
        record={'version':1,'engine':'local Piper Czech','model_sha256':model_hash,'sample_rate':rate,'quality_scope':'script, phoneme input, bytes, full decode, non-silence and timing; not a native auditory certification','items':items}
        manifest.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
    record={'version':1,'engine':'local Piper Czech','model_sha256':model_hash,'sample_rate':rate,'quality_scope':'script, phoneme input, bytes, full decode, non-silence and timing; not a native auditory certification','items':items}
    manifest.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf-8')
    (root/args.evidence).write_text(json.dumps({'scripts':len(items),'files':len(items)*2,'normal_seconds':sum(x['normal_seconds'] for x in items),'slow_seconds':sum(x['slow_seconds'] for x in items),'model_sha256':model_hash,'native_auditory_review':False},ensure_ascii=False,indent=2),'utf-8')

if __name__=='__main__':main()
