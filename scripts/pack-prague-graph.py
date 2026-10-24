"""Pack the retained road graph into a typed-array format for a mobile worker."""
import array
import gzip
import json
import pathlib
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PACK = ROOT / 'app/public/game/regions/prague/v1'
x = json.loads((PACK / 'graph.json').read_bytes())
target = PACK / 'graph.bin'
if target.exists():
    raise ValueError('Existing binary retained; inspect before replacing')


def raw(code, values):
    a = array.array(code, values)
    if sys.byteorder != 'little':
        a.byteswap()
    return a.tobytes()


offsets = [0]
for shape in x['shapes']:
    offsets.append(offsets[-1] + len(shape))
with target.open('xb') as out:
    out.write(struct.pack('<8I', 0x435A4752, 1, len(x['nodes']), len(x['edges']), len(x['shapes']), offsets[-1], 0, 0))
    out.write(raw('i', (v for point in x['nodes'] for v in point)))
    out.write(raw('i', (v for edge in x['edges'] for v in [edge[0],edge[1],edge[3],edge[4],edge[5],edge[6]])))
    out.write(raw('f', (edge[2] for edge in x['edges'])))
    out.write(raw('I', offsets))
    out.write(raw('i', (v for shape in x['shapes'] for v in shape)))
(PACK / 'graph.bin.gz').write_bytes(gzip.compress(target.read_bytes(), compresslevel=6, mtime=0))
print(json.dumps({'nodes':len(x['nodes']),'edges':len(x['edges']),'binary_bytes':target.stat().st_size,'gzip_bytes':(PACK/'graph.bin.gz').stat().st_size}))
