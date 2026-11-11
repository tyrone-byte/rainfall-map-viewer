"""Explicit regional ARR collection; never called by the viewer.
GIS preparation requires pyshp, shapely and pyproj. Collection uses stdlib only.
"""
import argparse
import csv
import hashlib
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
TABLE = 'Default Current (2030) Baseline'


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


def normalize(payload, lat, lon):
    def number(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    position = payload.get('input_data', {})
    for field, expected in [('Latitude', lat), ('Longitude', lon)]:
        actual = position.get(field)
        if not number(actual) or abs(actual - expected) > 1e-6:
            raise ValueError('Returned centroid mismatch: ' + field)
    table = payload.get('layers', {}).get('RecIFD', {}).get(TABLE)
    if not isinstance(table, dict):
        raise ValueError('Default current 2030 table missing')
    durations, aeps, rows = (table.get(k, []) for k in ('index', 'columns', 'data'))
    if not durations or any(not number(v) or v <= 0 for v in durations) or any(b <= a for a, b in zip(durations, durations[1:])):
        raise ValueError('Invalid duration axis')
    if not aeps or any(not number(v) or not 0 < v <= 100 for v in aeps) or len(set(aeps)) != len(aeps) or not {50, 20, 10, 5, 2, 1, .1}.issubset(aeps):
        raise ValueError('Invalid AEP axis')
    if len(rows) != len(durations) or any(len(row) != len(aeps) or any(not number(v) or v < 0 for v in row) for row in rows):
        raise ValueError('Invalid rainfall depths')
    return {'name': TABLE, 'family': 'ARR regional default', 'scenario': 'Default current', 'horizon': 2030,
            'units': 'mm', 'aeps': aeps, 'points': [{'minutes': m, 'depths': row} for m, row in zip(durations, rows)]}


def prepare(source, output):
    import shapefile
    from pyproj import CRS, Transformer
    from shapely.geometry import shape, Point, mapping
    from shapely.ops import transform
    source = Path(source)
    crs = CRS.from_wkt(source.with_suffix('.prj').read_text())
    # Area-weighted centroid in GDA2020 / Australian Albers, not angular degrees.
    project = Transformer.from_crs(crs, 'EPSG:9473', always_xy=True).transform
    geographic = Transformer.from_crs('EPSG:9473', 'EPSG:4326', always_xy=True).transform
    source_to_geo = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True).transform
    regions, geometries, features = [], [], []
    for item in shapefile.Reader(str(source)).iterShapeRecords():
        record = item.record.as_dict()
        geometry = shape(item.shape.__geo_interface__)
        if not geometry.is_valid or geometry.is_empty:
            raise ValueError('Invalid input polygon: ' + record['lga'])
        projected = transform(project, geometry)
        centroid = transform(geographic, projected.centroid)
        boundary = transform(source_to_geo, geometry)
        region = {'id': 'lga-' + record['lga_code'], 'name': record['lga'],
                  'lat': round(centroid.y, 6), 'lon': round(centroid.x, 6),
                  'centroidWithinRegion': boundary.covers(centroid)}
        regions.append(region); geometries.append(boundary)
        features.append({'type': 'Feature', 'properties': region, 'geometry': mapping(boundary)})
    if len({r['id'] for r in regions}) != len(regions):
        raise ValueError('Duplicate region IDs')
    stations = json.loads((ROOT / 'data/rainfall-groups.json').read_text())['stations']
    assignments, counts = [], {r['id']: 0 for r in regions}
    for station in stations:
        c = station.get('coordinates')
        hits = [r['id'] for r, g in zip(regions, geometries) if g.covers(Point(c['lon'], c['lat']))] if c else []
        row = {'id': station['id'], 'name': station['name'], 'stationNumber': station.get('stationNumber'),
               'locationKey': f"{c['lat']:.6f},{c['lon']:.6f}" if c else None,
               'regionIds': hits, 'status': 'assigned' if len(hits) == 1 else 'overlap' if hits else 'outside' if c else 'no-coordinates'}
        assignments.append(row)
        if len(hits) == 1: counts[hits[0]] += 1
    for r in regions: r['gaugeMembershipCount'] = counts[r['id']]
    files = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(source.parent.glob(source.stem + '.*'))}
    plan = {'schemaVersion': 1, 'source': 'User supplied initial_IFD_regions.zip', 'sourceFilesSHA256': files,
            'sourceCRS': crs.to_wkt(), 'centroidCRS': 'EPSG:9473',
            'method': 'Area-weighted polygon centroid in GDA2020 / Australian Albers; transformed to WGS84; covers point-in-polygon including boundaries. Ambiguous matches not assigned.',
            'regions': regions, 'gauges': assignments,
            'summary': {status: sum(a['status'] == status for a in assignments) for status in ['assigned', 'outside', 'no-coordinates', 'overlap']}}
    write(output / 'regions.json', plan)
    write(output / 'regions.geojson', {'type': 'FeatureCollection', 'features': features})
    with (output / 'gauge-assignments.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'name', 'stationNumber', 'locationKey', 'regionIds', 'status'])
        writer.writeheader(); writer.writerows({**a, 'regionIds': ';'.join(a['regionIds'])} for a in assignments)
    print(json.dumps({'regions': regions, 'summary': plan['summary']}, indent=2))


def collect(output, delay=10):
    if delay < 10: raise ValueError('At least 10 seconds between downloads required')
    plan = json.loads((output / 'regions.json').read_text())
    report = {'status': 'running', 'delaySeconds': delay, 'results': []}
    fetched = False
    for region in plan['regions']:
        cache = output / 'raw' / (region['id'] + '.json')
        lat, lon = region['lat'], region['lon']
        url = 'https://data.arr-software.org/?' + urlencode({'lat_coord': lat, 'lon_coord': lon, 'type': 'json', 'BoMIFD': 1})
        result = {'regionId': region['id'], 'name': region['name'], 'url': url}
        report['results'].append(result)
        try:
            if cache.exists():
                raw = cache.read_bytes()
                receipt = json.loads(cache.with_suffix('.receipt.json').read_text())
                if receipt['sha256'] != hashlib.sha256(raw).hexdigest(): raise ValueError('Cached checksum mismatch')
            else:
                if fetched: time.sleep(delay)
                fetched = True
                print('Downloading ' + region['name'], flush=True)
                started = time.monotonic()
                with urlopen(Request(url, headers={'Accept': 'application/json', 'User-Agent': 'RainfallMapViewer/1.0 (manual regional default-2030 collection)'}), timeout=60) as response:
                    raw = response.read(10_000_001)
                    result['httpStatus'] = response.status
                if len(raw) > 10_000_000: raise ValueError('Response exceeds 10 MB')
                normalize(json.loads(raw), lat, lon)
                cache.parent.mkdir(parents=True, exist_ok=True); cache.write_bytes(raw)
                receipt = {'fetchedAt': datetime.now(timezone.utc).isoformat(), 'sha256': hashlib.sha256(raw).hexdigest()}
                write(cache.with_suffix('.receipt.json'), receipt)
                result['elapsedSeconds'] = round(time.monotonic() - started, 3)
            payload = json.loads(raw)
            dataset = normalize(payload, lat, lon)
            key = f'{lat:.6f},{lon:.6f}'
            data = {'schemaVersion': 1, 'locationKey': key, 'coordinates': {'lat': lat, 'lon': lon},
                    'referenceType': 'regional-centroid', 'region': region, 'source': url,
                    'datahubVersion': payload.get('datahub_version'), 'datasets': [dataset],
                    'rawSha256': receipt['sha256'], 'fetchedAt': receipt['fetchedAt'],
                    'attribution': 'ARR Data Hub default current (2030) baseline; regional centroid reference, not gauge-specific design rainfall.'}
            write(output / 'locations' / (region['id'] + '.json'), data)
            result.update(status='passed', durations=len(dataset['points']), probabilities=len(dataset['aeps']))
        except Exception as error:
            result.update(status='failed', error=f'{type(error).__name__}: {error}')
            if isinstance(error, HTTPError): result['retryAfter'] = error.headers.get('Retry-After')
            report['status'] = 'stopped'; write(output / 'collection-report.json', report)
            raise
        write(output / 'collection-report.json', report)
        print(region['name'] + ': validated', flush=True)
    report['status'] = 'completed'; write(output / 'collection-report.json', report)
    # Publish assignments only when every region has a valid saved dataset.
    index_path = ROOT / 'data/ifd/index.json'
    index = json.loads(index_path.read_text())
    assignments = {}
    for region in plan['regions']:
        file = region['id'] + '.json'
        data = json.loads((output / 'locations' / file).read_text())
        write(ROOT / 'data/ifd/locations' / file, data)
        index['locations'][data['locationKey']] = {'file': file, 'lat': region['lat'], 'lon': region['lon'], 'datasetCount': 1}
    for gauge in plan['gauges']:
        if gauge['status'] != 'assigned': continue
        region = next(r for r in plan['regions'] if r['id'] == gauge['regionIds'][0])
        assignments[gauge['locationKey']] = f"{region['lat']:.6f},{region['lon']:.6f}"
    index['regionalAssignments'] = assignments
    write(index_path, index)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'data/ifd/regions')
    parser.add_argument('--collect', action='store_true')
    args = parser.parse_args()
    if args.source: prepare(args.source, args.output)
    if args.collect: collect(args.output)
