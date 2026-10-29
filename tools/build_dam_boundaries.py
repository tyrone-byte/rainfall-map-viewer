"""Prepare water-plan context and exact source-polygon gauge membership.

Offline preparation only: pip install pyogrio shapely pyproj.
These packages are not needed by Render or the collector.
"""
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path

import pyogrio.raw
from pyproj import Transformer
from shapely import Point, from_wkb
from shapely.ops import transform

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/dams/water-plan-source.zip'
OUTPUT = ROOT / 'public/dam-boundaries'


def build():
    catalogue = json.loads((ROOT / 'public/dams-catalogue.json').read_text())
    with tempfile.TemporaryDirectory() as temporary:
        with zipfile.ZipFile(SOURCE) as archive:
            archive.extractall(temporary)
        gdb = next(Path(temporary).glob('*/data.gdb'))
        meta, fids, geometries, columns = pyogrio.raw.read(gdb, return_fids=True)
    records = [dict(zip(meta['fields'], values)) for values in zip(*columns)]
    geometries = from_wkb(geometries)
    if any(not g.is_valid or g.is_empty for g in geometries):
        raise ValueError('Invalid or empty source polygon')
    to_source = Transformer.from_crs(4326, meta['crs'], always_xy=True).transform
    to_metric = Transformer.from_crs(meta['crs'], 3577, always_xy=True).transform
    to_map = Transformer.from_crs(3577, 4326, always_xy=True).transform
    OUTPUT.mkdir(exist_ok=True)
    index = dict(source='Water plan catchments - Queensland', sourceCRS=meta['crs'],
                 sourceSHA256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                 licence='CC BY 4.0', attribution='© The State of Queensland 2025',
                 sourceFeatures=len(records), displaySimplificationMetres=40,
                 membership='Original unsimplified polygon covers point; not upstream drainage membership',
                 dams={})
    written = set()
    report = []
    for dam in catalogue['dams']:
        point = Point(to_source(dam['lon'], dam['lat']))
        matches = [i for i, g in enumerate(geometries)
                   if records[i]['status'] == 'Current' and g.covers(point)]
        matches.sort(key=lambda i: (records[i]['feature'] != 'Subcatchment Area',
                                   transform(to_metric, geometries[i]).area, int(fids[i])))
        if not matches:
            index['dams'][dam['id']] = None
            report.append({'dam': dam['name'], 'boundary': None})
            continue
        i = matches[0]
        key = 'water-plan-' + str(int(fids[i]))
        record = records[i]
        membership = {}
        for kind in ('rain', 'water'):
            membership[kind] = sorted({g['id'] for g in catalogue[kind]
                if geometries[i].covers(Point(to_source(g['coordinates']['lon'], g['coordinates']['lat'])))})
        properties = {k: record[k] for k in ('title', 'feature', 'waterplan', 'loc_desc', 'status')}
        index['dams'][dam['id']] = dict(id=key, **properties, gauges=membership)
        if key not in written:
            # Simplification affects display only, never the membership calculation.
            display = transform(to_map, transform(to_metric, geometries[i]).simplify(40, preserve_topology=True))
            feature = dict(type='Feature', properties=properties, geometry=display.__geo_interface__)
            (OUTPUT / (key + '.geojson')).write_text(json.dumps(feature, separators=(',', ':')) + '\n')
            written.add(key)
        report.append(dict(dam=dam['name'], boundary=record['title'], plan=record['waterplan'],
                           containingFeatures=len(matches), rainGauges=len(membership['rain']), waterGauges=len(membership['water'])))
    (ROOT / 'public/dam-boundaries.json').write_text(json.dumps(index, separators=(',', ':')) + '\n')
    (ROOT / 'docs/dams/boundary-matches.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(dict(sourceFeatures=len(records), matched=sum(v is not None for v in index['dams'].values()),
                          dams=len(index['dams']), displayPolygons=len(written))))


if __name__ == '__main__':
    build()
