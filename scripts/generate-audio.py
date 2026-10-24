"""Generate original Czech speech with an explicitly supplied local Piper model.

No account or paid API. Model/engine are optional external dependencies, not bundled.
Read docs/AUDIO.md and install audio-requirements.txt in a dedicated virtualenv.
Writes normal and separately synthesized slower MP3, with sample-based cues.
Existing hash-matching tracks are reused; failures never become generated entries.
"""
from pathlib import Path
import argparse, hashlib, json, subprocess, time, os, sys

def valid_checkpoint(root,metadata,track,model_hash):
    if metadata.get('text_sha256')!=track['text_sha256'] or metadata.get('model_sha256')!=model_hash:return False
    try:
        for key,speed in [('file','normal'),('slow_file','slow')]:
            f=root/metadata[key]
            if not f.is_file() or f.stat().st_size<512 or hashlib.sha256(f.read_bytes()).hexdigest()!=metadata['files_sha256'][speed]:return False
        return True
    except (KeyError,OSError):return False

def durable_text(file,text):
    temporary=file.with_suffix('.tmp')
    with temporary.open('w',encoding='utf-8') as stream:
        stream.write(text);stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,file)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--threads', type=int, default=2)
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--levels', default='')
    parser.add_argument('--single-track', default='', help=argparse.SUPPRESS)
    args=parser.parse_args()
    if not args.single_track:
        # Native phonemizer/runtime calls can stall. Isolate each track, retain
        # completed checkpoints, and retry in a clean worker with a time limit.
        root=args.root.resolve();audio=root/'content/audio'
        tracks=json.loads((audio/'scripts.json').read_text('utf-8'))
        if args.levels:tracks=[t for t in tracks if t['level'] in args.levels.split(',')]
        if args.limit:tracks=tracks[:args.limit]
        model_hash=hashlib.sha256(args.model.read_bytes()).hexdigest();done=[];errors=[];retries=[];start=time.time()
        for i,t in enumerate(tracks):
            checkpoint=audio/'track-metadata'/(t['id']+'.json')
            old=json.loads(checkpoint.read_text('utf-8')) if checkpoint.exists() else {}
            if valid_checkpoint(root,old,t,model_hash):done.append(t['id']);continue
            command=[sys.executable,str(Path(__file__).resolve()),'--root',str(root),'--model',str(args.model.resolve()),'--ffmpeg',args.ffmpeg,'--threads',str(args.threads),'--single-track',t['id']]
            budget=max(45,min(240,30+sum(len(u['text'].split()) for u in t['units'])*.24))
            for attempt in range(2):
                try:
                    result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=budget)
                    if result.returncode:raise RuntimeError(result.stderr.decode('utf-8','replace')[-1500:]+result.stdout.decode('utf-8','replace')[-1000:])
                    finished=json.loads(checkpoint.read_text('utf-8'))
                    if not valid_checkpoint(root,finished,t,model_hash):raise RuntimeError('Completed audio failed parent-process SHA256 verification')
                    done.append(t['id']);print(json.dumps({'track':i+1,'total':len(tracks),'id':t['id'],'status':'generated','elapsed_seconds':round(time.time()-start,1)}),flush=True);break
                except Exception as exc:
                    record={'id':t['id'],'attempt':attempt+1,'error':str(exc)};retries.append(record);print(json.dumps(record),flush=True)
                    if attempt==1:errors.append(record)
        report={'requested_tracks':len(tracks),'generated_or_reused_tracks':len(done),'errors':errors,'worker_retries':retries,'elapsed_seconds':round(time.time()-start,2),'model_sha256':model_hash,'engine':'Piper 1.3.0','native_listening_review':'not_performed'}
        durable_text(audio/'generation-report.json',json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False),flush=True)
        return 1 if errors else 0
    import onnxruntime
    from piper import PiperVoice,SynthesisConfig
    from piper.config import PiperConfig
    config=json.loads(Path(str(args.model)+'.json').read_text('utf-8'))
    if config.get('espeak',{}).get('voice')!='cs': raise ValueError('Model is not an explicitly Czech espeak voice; refusing English fallback')
    model_hash=hashlib.sha256(args.model.read_bytes()).hexdigest()
    options=onnxruntime.SessionOptions();options.intra_op_num_threads=args.threads;options.inter_op_num_threads=1
    voice=PiperVoice(session=onnxruntime.InferenceSession(str(args.model),sess_options=options,providers=['CPUExecutionProvider']),config=PiperConfig.from_dict(config))
    root=args.root.resolve();audio=root/'content/audio';out=audio/'files';out.mkdir(exist_ok=True,parents=True)
    checkpoints=audio/'track-metadata';checkpoints.mkdir(exist_ok=True)
    scripts=json.loads((audio/'scripts.json').read_text('utf-8'));done=[];errors=[];start=time.time()
    if args.levels:scripts=[t for t in scripts if t['level'] in args.levels.split(',')]
    if args.single_track:scripts=[t for t in scripts if t['id']==args.single_track]
    if args.limit:scripts=scripts[:args.limit]
    for track_index,track in enumerate(scripts):
        ident=track['id'];meta_file=checkpoints/(ident+'.json')
        if meta_file.exists():
            existing=json.loads(meta_file.read_text('utf-8'))
            if valid_checkpoint(root,existing,track,model_hash):
                done.append(existing);continue
        try:
            cues=[];files={};durations={};sr=voice.config.sample_rate
            for speed,length_scale in [('normal',1.0),('slow',1.18)]:
                pieces=[];sample_offset=0;speed_cues=[]
                for unit in track['units']:
                    begin=sample_offset/sr;sentence_cues=[]
                    for sentence in unit['parts']:
                        sentence_start=sample_offset/sr
                        raw=b''.join(chunk.audio_int16_bytes for chunk in voice.synthesize(sentence,SynthesisConfig(length_scale=length_scale,noise_scale=.667,noise_w_scale=.8)))
                        if not raw:raise RuntimeError('Empty synthesis')
                        pieces.append(raw);sample_offset+=len(raw)//2
                        sentence_cues.append({'text':sentence,'start':sentence_start,'end':sample_offset/sr})
                        silence=bytes(round(sr*.18)*2);pieces.append(silence);sample_offset+=len(silence)//2
                    speed_cues.append({**unit,'start':begin,'end':sentence_cues[-1]['end'],'sentences':sentence_cues})
                basename=f"{ident}--{track['text_sha256'][:10]}--{speed}.mp3";target=out/basename;temporary=out/(basename+'.'+str(os.getpid())+'.tmp.mp3')
                command=[args.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','s16le','-ar',str(sr),'-ac','1','-i','pipe:0','-c:a','libmp3lame','-b:a','64k','-id3v2_version','3',str(temporary)]
                result=subprocess.run(command,input=b''.join(pieces),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                if result.returncode:raise RuntimeError(result.stderr.decode('utf-8','replace'))
                if temporary.stat().st_size<512:raise RuntimeError('Encoded audio too small')
                # Windows _commit/fsync requires a write-capable handle.
                with temporary.open('r+b') as encoded:os.fsync(encoded.fileno())
                os.replace(temporary,target)
                files[speed]=target.relative_to(root).as_posix();durations[speed]=sample_offset/sr
                if speed=='normal':cues=speed_cues
                else:
                    for c,slow in zip(cues,speed_cues):
                        c['slow_start']=slow['start'];c['slow_end']=slow['end']
                        for sentence,slow_sentence in zip(c['sentences'],slow['sentences']):sentence['slow_start']=slow_sentence['start'];sentence['slow_end']=slow_sentence['end']
            metadata={**track,'status':'generated','file':files['normal'],'slow_file':files['slow'],'duration_seconds':durations['normal'],'slow_duration_seconds':durations['slow'],'cues':cues,'engine':'Piper 1.3.0','voice':'cs_CZ-jirka-medium','model_sha256':model_hash,'quality_status':'machine_checked_not_native_listened','sample_rate':sr,'files_sha256':{speed:hashlib.sha256((root/f).read_bytes()).hexdigest() for speed,f in files.items()}}
            durable_text(meta_file,json.dumps(metadata,ensure_ascii=False,indent=2));done.append(metadata)
            print(json.dumps({'track':track_index+1,'total':len(scripts),'id':ident,'seconds':round(durations['normal'],2),'elapsed_seconds':round(time.time()-start,1)}),flush=True)
        except Exception as exc:
            errors.append({'id':ident,'error':str(exc)});print(json.dumps(errors[-1]),flush=True)
    summary={'generated_or_reused_tracks':len(done),'requested_tracks':len(scripts),'errors':errors,'elapsed_seconds':round(time.time()-start,2),'model_sha256':model_hash,'engine':'Piper 1.3.0','native_listening_review':'not_performed'}
    if not args.single_track:(audio/'generation-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(summary,ensure_ascii=False),flush=True)
    return 1 if errors else 0

if __name__=='__main__': raise SystemExit(main())
