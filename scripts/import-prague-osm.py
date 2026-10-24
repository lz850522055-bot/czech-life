"""One cached public-data extract for the real Prague pixel world; no API key."""
import datetime
import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'content/game/regions/prague/sources/osm-20261024'
QUERY = '''[out:json][timeout:120][maxsize:268435456];
(
  way["highway"](49.912085,14.202852,50.191994,14.718499);
  way["building"](49.912085,14.202852,50.191994,14.718499);
  relation["building"](49.912085,14.202852,50.191994,14.718499);
);
(._;>>;);
out body;
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / 'extract.json'
    if target.exists():
        print('Existing extract retained: ' + str(target), flush=True)
        return
    (OUT / 'query.overpassql').write_text(QUERY, encoding='utf-8')
    url = 'https://overpass-api.de/api/interpreter'
    request = urllib.request.Request(url + '?' + urllib.parse.urlencode({'data': QUERY}),
                                     headers={'User-Agent': 'CzechLife-local-game/1.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=150) as response:
        raw = response.read()
    data = json.loads(raw)
    if data.get('remark') or not data.get('elements'):
        raise ValueError('Incomplete OSM response: ' + str(data.get('remark')))
    nodes = {e['id'] for e in data['elements'] if e['type'] == 'node'}
    ways = [e for e in data['elements'] if e['type'] == 'way']
    missing = [(w['id'], n) for w in ways for n in w.get('nodes', []) if n not in nodes]
    if missing:
        raise ValueError('Way references absent nodes: ' + str(missing[:5]))
    target.write_bytes(raw)
    manifest = {'region': 'prague', 'source': url, 'query': 'query.overpassql',
                'downloaded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'source_timestamp': data.get('osm3s', {}).get('timestamp_osm_base'),
                'licence': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors',
                'licence_url': 'https://www.openstreetmap.org/copyright',
                'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                'nodes': len(nodes), 'ways': len(ways),
                'highway_ways': sum('highway' in w.get('tags', {}) for w in ways),
                'building_ways': sum('building' in w.get('tags', {}) for w in ways),
                'relations': sum(e['type'] == 'relation' for e in data['elements']),
                'all_way_node_references_present': True,
                'scope': 'bbox extract; source tags require access/foot/level/bridge/tunnel filtering before game routing',
                'status': 'downloaded_not_game_accepted'}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
