"""Build static dam locations and nearby-gauge identities; no network or DB writes."""
import csv
import json
import math
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
                         lon=lon, catchmentAreaHa=area, catchmentBoundary=None,
                         surfaceAreaFSL=float(row['Surface area @ FSL']) if row['Surface area @ FSL'] else None,
                         fullSupplyVolume=float(row['Full Supply Volume']) if row['Full Supply Volume'] else None,
                         surfaceAreaUnit="ha", fullSupplyVolumeUnit="ML"))
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
    def distance(dam, gauge):
        coord = gauge['coordinates']
        lat1, lat2 = math.radians(dam['lat']), math.radians(coord['lat'])
        dlat, dlon = lat2-lat1, math.radians(coord['lon']-dam['lon'])
        hav = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
        return 6371.0088 * 2 * math.asin(min(1, math.sqrt(hav)))
    for dam in dams:
        closest = min(catalogue['water'], key=lambda gauge: (distance(dam, gauge), 'TW' in gauge['name'].split(), gauge['id']))
        dam['nearestWaterGauge'] = dict(id=closest['id'], basinId=closest['basinId'],
                                       name=closest['name'], distanceKm=round(distance(dam, closest), 3),
                                       selection='Nearest mapped station; storage association not verified')
    for dam in dams:
        closest = min(catalogue['rain'], key=lambda gauge: (distance(dam, gauge), gauge['id']))
        dam['nearestRainGauge'] = dict(id=closest['id'], basinId=closest['basinId'],
                                      name=closest['name'], distanceKm=round(distance(dam, closest), 3))
    (ROOT / 'docs/dams/nearest-water-gauges.json').write_text(
        json.dumps([dict(dam=d['name'], **d['nearestWaterGauge']) for d in dams], indent=2) + '\n')
    (ROOT / 'public/dams-catalogue.json').write_text(
        json.dumps(catalogue, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    build()
