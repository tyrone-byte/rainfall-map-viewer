"""Build static dam locations and nearby-gauge identities; no network or DB writes."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/dams/supplied-dam-inventory.csv'


def build():
    with SOURCE.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    dams = []
    for row in rows:
        lat = float(row['Latitude coordinate'])
        lon = float(row['Longitudinal coord'])
        area = float(row['Catchment Area'])
        if not (-30 < lat < -10 and 138 < lon < 154 and area > 0):
            raise ValueError('Check supplied location/area for ' + row['Dam Name'])
        if row['Dam Owner'] not in ('Seqwater', 'Sunwater'):
            raise ValueError('Check owner for ' + row['Dam Name'])
        dams.append(dict(id=row['Dam Name'].lower().replace(' ', '-'),
                         name=row['Dam Name'], owner=row['Dam Owner'], lat=lat,
                         lon=lon, catchmentAreaHa=area, catchmentBoundary=None))
    if len({d['id'] for d in dams}) != len(dams):
        raise ValueError('Duplicate dam identifier')
    catalogue = dict(source=str(SOURCE.relative_to(ROOT)),
                     catchmentAreaUnits='ha (user confirmed)',
                     coordinatesStatus='User supplied; coordinate datum not supplied, locations not independently verified',
                     dams=dams)
    for kind, filename in [('rain', 'rainfall-groups.json'), ('water', 'water-groups.json')]:
        stations = json.loads((ROOT / 'data' / filename).read_text())['stations']
        catalogue[kind] = [
            {**{key: row[key] for key in ('id', 'name', 'basinId')},
             'coordinates': {key: row['coordinates'][key] for key in ('lat', 'lon')}}
            for row in stations if row.get('coordinates')
        ]
    (ROOT / 'public/dams-catalogue.json').write_text(
        json.dumps(catalogue, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    build()
