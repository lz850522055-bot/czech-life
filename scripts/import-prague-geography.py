"""Import explicitly licensed Prague layers, with complete feature-ID reconciliation.

No API key. Reads the saved official DCAT catalogue; never substitutes planning
streets for existing streets. Source downloads are versioned and retained on E:.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import time
import threading
import requests
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'runtime/game-implementation-20261024/geodata/iprpraha-dcat.json'
LAYERS = {
    'streets': ('1bbe08c6c9f44c70810957c5e10f22db_0', 'Existing TSK street sections; not a certified pedestrian routing graph'),
    'water': ('e01b4bb6d148496abff4f065686290ff_0', 'Water areas and watercourses; source purpose is cool refuges'),
    'landmarks': ('fb6ab7891a7244f39a3a380027af2981_0', 'Significant buildings and places; not a complete business directory'),
    'landuse': ('4eb682464b504230a7a9791ea1520461_0', 'Observed land use, not ownership or a future building permission'),
}
LAYER_WHERE = {'landuse': "zastupna_funkce IN ('LRO','LRR','RPU','RPP','HY','PLP','PLU','NZS','NZO','RV','RPH','SSY','PND','PRS','PRR','SOK')"}
SESSIONS = threading.local()


def fetch(url, params=None):
    full = url + ('?' + urllib.parse.urlencode(params) if params else '')
    for attempt in range(2):
        try:
            if not hasattr(SESSIONS, 'session'):
                SESSIONS.session = requests.Session()
                SESSIONS.session.headers.update({'User-Agent': 'CzechLife-local-game/1.0', 'Accept': 'application/json'})
            response = SESSIONS.session.get(full, timeout=(15, 60))
            response.raise_for_status()
            data = response.json()
            if data.get('error'):
                raise ValueError(data['error'])
            return data
        except Exception:
            if attempt:
                raise
            time.sleep(1)


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def import_layer(key, dataset, out, chunk_size=100):
    if dataset.get('dct:license') != 'CC BY':
        raise ValueError('Unexpected licence: ' + str(dataset.get('dct:license')))
    base = next(d['dcat:accessURL']['@id'] for d in dataset['dcat:distribution'] if d.get('dct:title') == 'ArcGIS GeoService')
    meta = fetch(base, {'f': 'json'})
    if not meta.get('geometryType'):
        raise ValueError('Missing geometry metadata')
    id_field = next(f['name'] for f in meta['fields'] if f['type'] == 'esriFieldTypeOID')
    where = LAYER_WHERE.get(key, '1=1')
    ids_response = fetch(base + '/query', {'f': 'json', 'where': where, 'returnIdsOnly': 'true'})
    ids = sorted(ids_response['objectIds'])
    count = fetch(base + '/query', {'f': 'json', 'where': where, 'returnCountOnly': 'true'})['count']
    if count != len(ids) or len(set(ids)) != len(ids):
        raise ValueError('Source changed or ID list was truncated')
    size = min(chunk_size, meta.get('maxRecordCount', 1000))
    chunks = [ids[i:i+size] for i in range(0, len(ids), size)]

    def batch(chunk):
        params = {'f': 'geojson', 'objectIds': ','.join(map(str, chunk)), 'outFields': '*', 'returnGeometry': 'true', 'outSR': '4326', 'geometryPrecision': '6'}
        cache_file = out / 'batches' / (key + '-' + hashlib.sha256(where.encode()).hexdigest()[:8] + '-' + str(chunk[0]) + '-' + str(chunk[-1]) + '.json')
        result = json.loads(cache_file.read_text(encoding='utf-8')) if cache_file.exists() else fetch(base + '/query', params)
        if result.get('exceededTransferLimit'):
            raise ValueError('Transfer limit exceeded; refusing partial geography')
        features = result.get('features')
        if not isinstance(features, list) or len(features) != len(chunk):
            raise ValueError('Feature count mismatch in chunk')
        if set(f['properties'][id_field] for f in features) != set(chunk):
            raise ValueError('Feature IDs do not match requested chunk')
        if not cache_file.exists():
            write(cache_file, result)
        return features

    features = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for index, group in enumerate(pool.map(batch, chunks)):
            features.extend(group)
            if index % 10 == 0:
                print(key + ': ' + str(len(features)) + '/' + str(count), flush=True)
    if len(features) != count:
        raise ValueError('Final feature count mismatch')
    invalid = [f.get('id') for f in features if not f.get('geometry')]
    if invalid:
        raise ValueError('Features without geometry: ' + str(invalid[:10]))
    target = out / (key + '.geojson')
    write(target, {'type': 'FeatureCollection', 'features': features})
    write(out / (key + '.metadata.json'), meta)
    write(out / (key + '.dataset.json'), dataset)
    info = {
        'id': key, 'source': base, 'dataset_url': dataset['@id'],
        'title_cs': dataset['dct:title'], 'dataset_identifier': dataset['dct:identifier'],
        'source_modified': dataset.get('dct:modified'), 'downloaded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'licence': 'CC BY', 'attribution': 'data base © IPR Praha', 'crs': 'EPSG:4326',
        'features': count, 'bytes': target.stat().st_size,
        'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'file': target.name,
        'use': LAYERS[key][1], 'query_where': where, 'full_id_list_matched': True, 'query_geometry_precision': 6,
    }
    print(json.dumps(info, ensure_ascii=False), flush=True)
    return info


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--catalog', type=pathlib.Path, default=CATALOG)
    parser.add_argument('--resume', type=pathlib.Path)
    parser.add_argument('--layers', nargs='+', choices=list(LAYERS), default=list(LAYERS))
    parser.add_argument('--chunk-size', type=int, default=100)
    args = parser.parse_args()
    rows = json.loads(args.catalog.read_text(encoding='utf-8'))['dcat:dataset']
    by_id = {x['dct:identifier']: x for x in rows}
    version = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    sources = (ROOT / 'content/game/regions/prague/sources').resolve()
    out = args.resume.resolve() if args.resume else sources / version
    if out.parent != sources:
        raise ValueError('Resume directory must be one version directly in project Prague sources')
    if not args.resume:
        out.mkdir(parents=True, exist_ok=False)
    manifest = {'region': 'prague', 'version': version, 'status': 'data_import_only_not_game_acceptance',
                'catalog_sha256': hashlib.sha256(args.catalog.read_bytes()).hexdigest(), 'layers': [],
                'known_gaps': ['No complete pedestrian topology yet', 'No building footprints yet', 'Bilingual place review and pixel rendering pending', 'No real-time business status']}
    if args.resume:
        manifest = json.loads((out / 'manifest.json').read_text(encoding='utf-8'))
        if manifest['catalog_sha256'] != hashlib.sha256(args.catalog.read_bytes()).hexdigest():
            raise ValueError('Cannot resume with a changed catalogue')
    for key in args.layers:
        if any(x['id'] == key for x in manifest['layers']):
            entry = next(x for x in manifest['layers'] if x['id'] == key)
            if hashlib.sha256((out / entry['file']).read_bytes()).hexdigest() != entry['sha256']:
                raise ValueError('Existing layer changed; refusing to overwrite')
            continue
        identifier, _ = LAYERS[key]
        manifest['layers'].append(import_layer(key, by_id[identifier], out, args.chunk_size))
        write(out / 'manifest.json', manifest)
    print('Saved ' + str(out), flush=True)


if __name__ == '__main__':
    main()
