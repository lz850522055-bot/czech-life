"""Decode every released MP3 and verify hashes, duration, non-silence and cues.
This is machine media QA; it does not claim native Czech pronunciation review.
Requires ffmpeg/ffprobe in PATH, no Python third-party packages.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import argparse,json,subprocess,hashlib,array,math,sys,datetime

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);parser.add_argument('--workers',type=int,default=4);args=parser.parse_args()
    root=args.root.resolve();manifest=json.loads((root/'content/audio/manifest.json').read_text('utf-8'))
    tracks=[m for m in manifest if not m.get('asset_id')];errors=[];warnings=[];jobs=[];physical=set()
    for m in tracks:
        if m.get('status')!='generated':errors.append({'id':m['id'],'error':'track_not_generated'});continue
        for speed,key,hkey,dkey in [('normal','file','sha256','duration_seconds'),('slow','slow_file','slow_sha256','slow_duration_seconds')]:
            jobs.append((m,speed,key,hkey,dkey))
    def inspect(job):
        m,speed,key,hkey,dkey=job;f=(root/'content'/m[key]).resolve();item={'id':m['id'],'speed':speed,'file':m[key]}
        try:
            if not f.is_relative_to(root/'content'):raise ValueError('Unsafe media path')
            data=f.read_bytes();digest=hashlib.sha256(data).hexdigest()
            if digest!=m.get(hkey):raise ValueError('SHA256 mismatch')
            p=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_name,sample_rate,channels','-of','json',str(f)],capture_output=True,check=True,timeout=30);info=json.loads(p.stdout)
            duration=float(info['format']['duration']);stream=info['streams'][0]
            if stream['codec_name']!='mp3' or stream['channels']!=1 or int(stream['sample_rate'])!=22050:raise ValueError('Unexpected codec, channel count or sample rate')
            if abs(duration-float(m[dkey]))>.3:raise ValueError('Media and script duration differ beyond MP3 padding tolerance')
            pcm=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',str(f),'-f','s16le','-ac','1','-ar','22050','pipe:1'],capture_output=True,check=True,timeout=45).stdout
            samples=array.array('h');samples.frombytes(pcm)
            if sys.byteorder!='little':samples.byteswap()
            if not samples:raise ValueError('Decoded zero frames')
            peak=max(abs(v) for v in samples);rms=math.sqrt(sum(v*v for v in samples)/len(samples))/32768
            if peak<100 or rms<.0005:raise ValueError('Silence or unusably quiet audio')
            clip=sum(abs(v)>=32760 for v in samples)/len(samples)
            item.update(status='已通过',bytes=len(data),sha256=digest,duration_seconds=duration,decoded_samples=len(samples),peak=peak,rms=round(rms,6),clipped_fraction=round(clip,6))
            if clip>.01:item['warning']='More than 1% near-full-scale samples; listen for clipping.'
        except Exception as exc:item.update(status='未通过',error=str(exc))
        return item
    with ThreadPoolExecutor(max_workers=args.workers) as pool:results=list(pool.map(inspect,jobs))
    trackMap={m['id']:m for m in tracks}
    for ref in manifest:
        if not ref.get('asset_id'):continue
        t=trackMap.get(ref['asset_id'])
        if not t:errors.append({'id':ref['id'],'error':'Missing referenced physical track'});continue
        for prefix,dkey in [('', 'duration_seconds'),('slow_', 'slow_duration_seconds')]:
            begin=ref.get(prefix+'start');end=ref.get(prefix+'end');duration=t.get(dkey)
            if duration is None or begin is None or end is None or not (0<=begin<end<=duration+.01):errors.append({'id':ref['id'],'error':'Invalid '+prefix+'cue bounds'})
    errors.extend({'id':r['id'],'speed':r['speed'],'error':r['error']} for r in results if r['status']!='已通过')
    warnings.extend({'id':r['id'],'speed':r['speed'],'warning':r['warning']} for r in results if r.get('warning'))
    report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'tracks':len(tracks),'cue_references':len(manifest)-len(tracks),'physical_files':len(results),'normal_minutes':round(sum(r.get('duration_seconds',0) for r in results if r['speed']=='normal')/60,2),'slow_minutes':round(sum(r.get('duration_seconds',0) for r in results if r['speed']=='slow')/60,2),'decoded_passed':sum(r['status']=='已通过' for r in results),'errors':errors,'warnings':warnings,'native_listening_review':'尚未验收','method':'Every unique normal/slow MP3: ffprobe + full ffmpeg decode + PCM statistics + SHA256 + every cue bounds','files':results}
    out=root/'evidence/audio-validation.json';out.parent.mkdir(exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False));return 1 if errors else 0

if __name__=='__main__':raise SystemExit(main())
