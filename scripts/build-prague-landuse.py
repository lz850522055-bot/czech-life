"""Build a separately versioned observed-land-use layer, not planning/ownership."""
import collections
import datetime
import gzip
import hashlib
import json
import math
import pathlib

ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'content/game/regions/prague/sources/20261023T195310Z'
OUT=ROOT/'app/public/game/regions/prague/land-v1'
BASE=ROOT/'app/public/game/regions/prague/v1'
R=6378137
OX,OY=R*math.radians(14.42),R*math.log(math.tan(math.pi/4+math.radians(50.08)/2))


def project(lon,lat):return [round(R*math.radians(lon)-OX),round(OY-R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))]


def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
    path.write_bytes(raw);path.with_name(path.name+'.gz').write_bytes(gzip.compress(raw,6,mtime=0))


def main():
    if (OUT/'manifest.json').exists():raise ValueError('Existing version retained')
    source=json.loads((SOURCE/'manifest.json').read_bytes());layer=next(x for x in source['layers'] if x['id']=='landuse')
    raw=(SOURCE/'landuse.geojson').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=layer['sha256']:raise ValueError('Source hash changed')
    base=json.loads((BASE/'manifest.json').read_bytes());tiles={(x[0],x[1]):[] for x in base['tiles']};features=json.loads(raw)['features'];counts=collections.Counter()
    for f in features:
        p=f['properties'];code=p['zastupna_funkce'];counts[code]+=1
        g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        for poly in polys:
            rings=[[v for point in ring for v in project(*point)] for ring in poly]
            if not rings:continue
            xs=[x for r in rings for x in r[::2]];ys=[y for r in rings for y in r[1::2]]
            feature=[p['objectid'],code,rings,p.get('verej_pristup')]
            for x in range(math.floor(min(xs)/2048),math.floor(max(xs)/2048)+1):
                for y in range(math.floor(min(ys)/2048),math.floor(max(ys)/2048)+1):
                    if (x,y) in tiles:tiles[x,y].append(feature)
    for (x,y),areas in tiles.items():write(OUT/f'tiles/{x}_{y}.json',{'areas':areas})
    landmarks={f['properties']['objectid']:f for f in json.loads((SOURCE/'landmarks.geojson').read_bytes())['features']}
    nodes=json.loads((BASE/'graph.json').read_bytes())['nodes'];extra=[]
    for objectid,zh,frame in [(4055,'圣维特大教堂',0),(4245,'泰恩教堂',1)]:
        f=landmarks[objectid];lon,lat=f['geometry']['coordinates'];xy=project(lon,lat);anchor=min(range(len(nodes)),key=lambda i:(nodes[i][0]-xy[0])**2+(nodes[i][1]-xy[1])**2)
        extra.append({'id':'ipr:'+str(objectid),'objectid':objectid,'cs':f['properties']['nazev'],'zh':zh,'kind':'landmark','scene':'城市的建筑故事','xy':xy,'lon':lon,'lat':lat,'graph_node':anchor,'source_objectid':objectid,'source':'IPR Praha URK_CUR_URK_VYZNSTAVBYMISTA_B','fictional_scene':True,'sprite_frame':frame,'address':f['properties'].get('adresa')})
    write(OUT/'places-extra.json',extra)
    atlas={'image':'/game/assets/prague-landmarks-v2.png','note':'Symbolic pixel landmarks; footprints and coordinates remain the geographic source. Fictional shop used inside game scenes only.','frames':[[20,20,680,640],[730,35,510,630],[20,660,765,490],[800,700,440,470]],'place_frames':{'ipr:4055':0,'ipr:4245':1,'ipr:4029':2}}
    write(OUT/'sprites.json',atlas)
    write(OUT/'manifest.json',{'version':'2026.10.24.1','kind':'observed_landuse_not_ownership','built_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':layer,'counts':dict(counts),'features':len(features),'tile_count':len(tiles),'licence':'CC BY','attribution':'data base © IPR Praha','coverage_note':'Selected green, forest, agriculture, industrial and major-commercial observed uses only; other ground is artistically neutral, not asserted grass or empty land.'})
    print(json.dumps({'features':len(features),'categories':dict(counts),'tiles':len(tiles),'extra_places':len(extra)}),flush=True)


if __name__=='__main__':main()
