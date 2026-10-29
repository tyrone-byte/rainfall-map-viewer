"""Prepare named river/larger-creek context from a user-supplied QSpatial ZIP.

Offline dependencies: pyogrio, shapely, pyproj. Run with source ZIP path.
No stream order is supplied; mapped length is a display heuristic only.
"""
import argparse
import hashlib
import json
import re
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

import pyogrio.raw
from pyproj import Transformer
from shapely import force_2d, from_wkb, Point
from shapely.ops import transform
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]


def build(source):
    with tempfile.TemporaryDirectory() as temporary:
        with zipfile.ZipFile(source) as archive:
            archive.extractall(temporary)
        gdb = next(Path(temporary).glob('*/data.gdb'))
        meta, _, wkbs, columns = pyogrio.raw.read(gdb)
    records = [dict(zip(meta['fields'], values)) for values in zip(*columns)]
    metric = Transformer.from_crs(meta['crs'], 3577, always_xy=True).transform
    map_crs = Transformer.from_crs(3577, 4326, always_xy=True).transform
    from_map = Transformer.from_crs(4326, 3577, always_xy=True).transform
    grouped = defaultdict(list)
    for record, wkb in zip(records, wkbs):
        name = record['name'] or ''
        if not name or re.search(r'unnamed|drain|gully|tributary|<null>', name, re.I):
            continue
        if not re.search(r'\b(river|creek)\b', name, re.I):
            continue
        geometry = transform(metric, force_2d(from_wkb(wkb)))
        if not geometry.is_empty:
            grouped[name].append(geometry)
    selected = [(name, g) for name, parts in grouped.items()
                if re.search(r'\briver\b', name, re.I) or sum(p.length for p in parts) >= 10000
                for g in parts]
    tree = STRtree([g for _, g in selected])
    catalogue = json.loads((ROOT / 'public/dams-catalogue.json').read_text())
    boundaries = json.loads((ROOT / 'public/dam-boundaries.json').read_text())
    output = ROOT / 'public/dam-watercourses'
    output.mkdir(exist_ok=True)
    sizes = {}
    for dam in catalogue['dams']:
        boundary = boundaries['dams'].get(dam['id'])
        if boundary:
            from shapely.geometry import shape
            feature = json.loads((ROOT / 'public/dam-boundaries' / (boundary['id']+'.geojson')).read_text())
            area = transform(from_map, shape(feature['geometry']))
        else:
            area = transform(from_map, Point(dam['lon'], dam['lat'])).buffer(20000)
        features = []
        for i in sorted(tree.query(area, predicate='intersects')):
            name, geometry = selected[i]
            clipped = geometry.intersection(area)
            if clipped.is_empty or clipped.length < 50:
                continue
            display = transform(map_crs, clipped.simplify(30, preserve_topology=True))
            features.append(dict(type='Feature', properties={'name': name}, geometry=display.__geo_interface__))
        collection = dict(type='FeatureCollection', features=features)
        (output / (dam['id']+'.geojson')).write_text(json.dumps(collection, separators=(',', ':'))+'\n')
        sizes[dam['id']] = len(features)
    manifest = dict(source='Watercourse identification map — watercourses',
                    sourceFile=source.name, sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    sourceCRS=meta['crs'], sourceFeatures=len(records),
                    attribution='© The State of Queensland 2025', licence='CC BY 4.0',
                    selection='Named rivers; named creeks with at least 10 km combined mapped length by exact name. Unnamed tributaries, drains and gullies excluded. No stream-order classification supplied.',
                    displaySimplificationMetres=30, damFeatureCounts=sizes)
    (ROOT / 'docs/dams/watercourses-source.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps(dict(sourceFeatures=len(records), selectedSegments=len(selected), outputDamFiles=len(sizes))))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    build(parser.parse_args().source)
