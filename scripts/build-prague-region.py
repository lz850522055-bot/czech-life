"""Derive a local 2D pixel-world package from retained real geography.

Road node identities provide topology; geometric line crossings never invent
connections. OSM derivative database and its provenance ship together.
"""
import collections
import datetime
import gc
import hashlib
import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
REGION = ROOT / 'content/game/regions/prague'
OUT = ROOT / 'app/public/game/regions/prague/v1'
OSM = REGION / 'sources/osm-20261024'
IPR = REGION / 'sources/20261023T195310Z'
TILE = 2048
R = 6378137
ORIGIN_LON, ORIGIN_LAT = 14.42, 50.08
OX, OY = R * math.radians(ORIGIN_LON), R * math.log(math.tan(math.pi / 4 + math.radians(ORIGIN_LAT) / 2))
BBOX = [14.202852, 49.912085, 14.718499, 50.191994]


def project(lon, lat):
    return [round(R * math.radians(lon) - OX), round(OY - R * math.log(math.tan(math.pi/4 + math.radians(lat)/2)))]


def inside(lon, lat):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def walkable(tags):
    highway = tags.get('highway')
    allowed = {'footway','pedestrian','steps','path','living_street','residential','unclassified','tertiary','tertiary_link','secondary','secondary_link','primary','primary_link','service','track','road','bridleway','cycleway'}
    foot = tags.get('foot')
    if highway not in allowed or foot in {'no','private','use_sidepath'}:
        return False
    if tags.get('access') in {'no','private','customers','delivery','permit','agricultural','forestry'} and foot not in {'yes','designated','permissive'}:
        return False
    if 'foot:conditional' in tags or 'access:conditional' in tags or tags.get('construction') or tags.get('proposed'):
        return False
    if highway in {'cycleway','bridleway'} and foot not in {'yes','designated','permissive'}:
        return False
    if tags.get('sidewalk') in {'no','none','separate'} and highway in {'primary','primary_link','secondary','secondary_link','tertiary','tertiary_link'} and foot not in {'yes','designated','permissive'}:
        return False
    return True


def main():
    if (OUT / 'manifest.json').exists():
        raise ValueError('Region v1 already exists; inspect before replacing a published package')
    print('Reading retained OSM extract', flush=True)
    data = json.loads((OSM / 'extract.json').read_bytes())
    nodes = {}; blocked = set(); ways = []; relations = []
    for e in data['elements']:
        if e['type'] == 'node':
            nodes[e['id']] = (e['lon'], e['lat'])
            t = e.get('tags', {})
            if t.get('foot') in {'no','private'} or (t.get('access') in {'no','private'} and t.get('foot') not in {'yes','designated','permissive'}) or t.get('locked') == 'yes':
                blocked.add(e['id'])
        elif e['type'] == 'way':
            ways.append(e)
        elif e['type'] == 'relation':
            relations.append(e)
    del data;gc.collect()
    print('Indexed nodes, ways and access barriers', flush=True)
    tiles = {}; road_stats = collections.Counter(); road_types = collections.Counter(); buildings = 0
    overview = []; paths = []; references = collections.Counter(); road_by_id = {}

    def tile_features(feature, kind, xy):
        xs = xy[::2];ys = xy[1::2]
        left,right,bottom,top = min(xs),max(xs),min(ys),max(ys)
        # Geometry is retained once per touched tile; do not flood tiles far outside
        # the extraction rectangle with long ways returned at the bounding edge.
        for tx in range(math.floor(left/TILE), math.floor(right/TILE)+1):
            for ty in range(math.floor(bottom/TILE), math.floor(top/TILE)+1):
                if -13 <= tx <= 17 and -12 <= ty <= 16:
                    entry = tiles.setdefault((tx,ty), {'roads':[],'buildings':[],'water':[]})
                    entry[kind].append(feature)

    def flatten(ids):
        return [v for n in ids for v in project(*nodes[n])]

    for way in ways:
        t = way.get('tags', {});ids = way.get('nodes', [])
        if len(ids) < 2:
            continue
        road_by_id[way['id']] = way
        if 'highway' in t:
            road_types[t['highway']] += 1
            # Break at missing/outside/blocked vertices rather than bridge gaps.
            pieces = [];part=[]
            for n in ids:
                if n in nodes and inside(*nodes[n]) and n not in blocked:
                    part.append(n)
                else:
                    if len(part)>1:pieces.append(part)
                    part=[]
            if len(part)>1:pieces.append(part)
            can_walk=walkable(t)
            for part in pieces:
                xy = flatten(part)
                feature = [way['id'], t['highway'], t.get('name',''), xy, int(can_walk), t.get('bridge',''), t.get('tunnel','')]
                tile_features(feature,'roads',xy);road_stats['drawn_parts'] += 1
                if t['highway'] in {'motorway','trunk','primary','secondary','tertiary','pedestrian'}:
                    # Keep every point: overview simplification happens at draw time.
                    overview.append(feature)
                if can_walk:
                    paths.append((way['id'],part,t));references.update(part)
                    road_stats['walkable_parts'] += 1
        if t.get('building') and t['building'] != 'no' and len(ids)>=4 and ids[0]==ids[-1] and all(n in nodes and inside(*nodes[n]) for n in ids):
            xy=flatten(ids);feature=[way['id'],t.get('building','yes'),[xy],t.get('name','')]
            tile_features(feature,'buildings',xy);buildings+=1

    # Relation buildings: join actual member-node rings. Do not invent a polygon
    # if source segments do not close. Inner courtyards are rendered with evenodd.
    relation_count=0;relation_skipped=0
    for rel in relations:
        t=rel.get('tags',{})
        if t.get('building') in {None,'no'}:continue
        rings=[];valid=True
        for role in ['outer','inner']:
            segments=[list(road_by_id[m['ref']]['nodes']) for m in rel.get('members',[]) if m['type']=='way' and (m.get('role','outer') or 'outer')==role and m['ref'] in road_by_id]
            while segments:
                ring=segments.pop()
                while ring[0]!=ring[-1]:
                    found=False
                    for i,segment in enumerate(segments):
                        if ring[-1]==segment[0]:ring.extend(segment[1:]);segments.pop(i);found=True;break
                        if ring[-1]==segment[-1]:ring.extend(segment[-2::-1]);segments.pop(i);found=True;break
                    if not found:valid=False;break
                if not valid:break
                if not all(n in nodes and inside(*nodes[n]) for n in ring):valid=False;break
                rings.append(flatten(ring))
            if not valid:break
        if valid and rings:
            xy=[v for ring in rings for v in ring]
            tile_features([-rel['id'],t.get('building','yes'),rings,t.get('name','')],'buildings',xy);relation_count+=1
        else:relation_skipped+=1
    print('Prepared real roads and building footprints',flush=True)

    graph_nodes=[];graph_ids=[];node_map={};edges=[];shapes=[]
    def vertex(n):
        if n not in node_map:
            node_map[n]=len(graph_nodes);graph_nodes.append(project(*nodes[n]));graph_ids.append(n)
        return node_map[n]
    for way_id,part,tags in paths:
        shape=len(shapes);shapes.append(flatten(part));start=0
        direction=1 if tags.get('oneway:foot')=='yes' else -1 if tags.get('oneway:foot')=='-1' else 0
        accumulated=0
        for i in range(1,len(part)):
            accumulated+=distance(nodes[part[i-1]],nodes[part[i]])
            if i==len(part)-1 or references[part[i]]>1:
                a,b=vertex(part[start]),vertex(part[i])
                if a!=b:edges.append([a,b,round(accumulated,1),shape,start,i,direction,way_id])
                start=i;accumulated=0
    graph={'schema':'czlife-roadgraph-v1','nodes':graph_nodes,'osm_node_ids':graph_ids,'edges':edges,'shapes':shapes,
           'precision':'Web Mercator projected coordinates rounded to 1 m; edge lengths use unrounded lon/lat',
           'access_note':'Source-based game walking graph; unknown conditional/private access excluded; live closures not represented'}
    write(OUT/'graph.json',graph)
    print('Built shared-node walking topology',flush=True)

    water=json.loads((IPR/'water.geojson').read_text(encoding='utf-8'))
    water_overview=[]
    for f in water['features']:
        polys=[f['geometry']['coordinates']] if f['geometry']['type']=='Polygon' else f['geometry']['coordinates']
        for i,poly in enumerate(polys):
            rings=[[v for point in ring for v in project(*point)] for ring in poly]
            if not rings:continue
            feature=[f['properties']['objectid'],rings,f['properties'].get('nazev','') or '']
            tile_features(feature,'water',[v for ring in rings for v in ring])
            if len(rings[0])>100:water_overview.append(feature)

    official={f['properties']['objectid']:f for f in json.loads((IPR/'landmarks.geojson').read_text(encoding='utf-8'))['features']}
    places=[]
    for definition in json.loads((REGION/'places.zh.json').read_text(encoding='utf-8'))['places']:
        f=official[definition['objectid']];lon,lat=f['geometry']['coordinates'];xy=project(lon,lat)
        anchor=min(range(len(graph_nodes)),key=lambda i:(graph_nodes[i][0]-xy[0])**2+(graph_nodes[i][1]-xy[1])**2)
        snap_m=distance(nodes[graph_ids[anchor]],(lon,lat))
        places.append({**definition,'id':'ipr:'+str(definition['objectid']),'cs':f['properties']['nazev'].strip(),'lon':lon,'lat':lat,'xy':xy,'graph_node':anchor,'anchor_distance_m':round(snap_m,1),'address':f['properties'].get('adresa'),'source_objectid':definition['objectid'],'source':'IPR Praha URK_CUR_URK_VYZNSTAVBYMISTA_B','fictional_scene':True})
    write(OUT/'places.json',places)
    write(OUT/'overview.json',{'roads':overview,'water':water_overview})
    tile_index=[]
    for (x,y),features in sorted(tiles.items()):
        file=f'tiles/{x}_{y}.json';write(OUT/file,features)
        tile_index.append([x,y,(OUT/file).stat().st_size,len(features['roads']),len(features['buildings'])])
    total_bytes=sum(p.stat().st_size for p in OUT.rglob('*.json'))
    manifest={'schema':'czlife-prague-region-v1','version':'2026.10.24.1','name_cs':'Praha','name_zh':'布拉格','built_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'projection':{'type':'EPSG:3857','origin_lon':ORIGIN_LON,'origin_lat':ORIGIN_LAT,'origin_mercator':[OX,OY],'y_axis':'south'},'bbox_lonlat':BBOX,'tile_size':TILE,'tiles':tile_index,
              'counts':{'building_ways':buildings,'building_relations':relation_count,'building_relations_skipped':relation_skipped,'road_parts':road_stats['drawn_parts'],'walkable_parts':road_stats['walkable_parts'],'graph_nodes':len(graph_nodes),'graph_edges':len(edges),'places_reviewed':len(places)},
              'initial_place':'ipr:4211','bytes':total_bytes,
              'sources':[{'name':'OpenStreetMap','licence':'ODbL-1.0','attribution':'© OpenStreetMap contributors','url':'https://www.openstreetmap.org/copyright','snapshot':'osm-20261024','sha256':json.loads((OSM/'manifest.json').read_text(encoding='utf-8'))['sha256']},{'name':'IPR Praha','licence':'CC BY','attribution':'data base © IPR Praha','url':'https://geoportalpraha.cz/en/data-and-services/open-data','snapshot':'20261023T195310Z'}],
              'status':'derived_geography_browser_acceptance_pending','known_gaps':['No live traffic or business opening status','Chinese labels currently limited to reviewed place set','Unclosed building relations omitted, count recorded','Pixel visual and gameplay acceptance pending']}
    write(OUT/'manifest.json',manifest)
    write(OUT/'LICENSES.json',{'database':'OpenStreetMap-derived database distributed under ODbL-1.0; IPR water and landmarks retained as separate attributed layers','source_reproduction':'Raw source extracts, exact query and transform script retained in content/game/regions/prague/sources and scripts/build-prague-region.py','sources':manifest['sources']})
    print(json.dumps({k:manifest[k] for k in ['version','counts','bytes']},ensure_ascii=False),flush=True)


if __name__=='__main__':main()
