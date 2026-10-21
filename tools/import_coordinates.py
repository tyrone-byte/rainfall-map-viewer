"""One-off official catalogue import. Never geocodes or performs fuzzy name matching.
Usage: python3 tools/import_coordinates.py catalogue.html [catalogue2.html ...]
Each file corresponds to BoM /qld/flood/networks/sectionN.shtml.
"""
import sys, re, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rainfall import key

def dms(raw):
    digits, direction = raw[:-1], raw[-1]
    return round((int(digits[:-4])+int(digits[-4:-2])/60+int(digits[-2:])/3600) * (-1 if direction in 'SW' else 1), 6)

records = {}
for file in sys.argv[1:]:
    section = {'bom-rain.html': 1, 'bom-stations.html': 2, 'bom-telemetry.html': 3}[Path(file).name]
    for line in Path(file).read_text().splitlines():
        match = re.search(r'(\d{6}[NS])\s+(\d{7}[EW])', line)
        if not match or not re.match(r'\s+\d{6}\s', line):
            continue
        name = line[8:33].strip() if section != 3 else line[16:46].strip()
        name = re.sub(r'\s+(?:ALERT(?:-P)?|TM|AL)$', '', name)
        record = {'stationNumber': line[1:7], 'catalogueName': name,
                  'lat': dms(match[1]), 'lon': dms(match[2]),
                  'source': f'https://reg.bom.gov.au/qld/flood/networks/section{section}.shtml',
                  'catalogueDate': '2022-01-05', 'method': 'Exact normalised name; telemetry suffix removed'}
        records.setdefault(key(name), []).append(record)
# Only unambiguous positions survive: multiple sensors within 150m accepted,
# otherwise leave unmatched rather than selecting a convenient coordinate.
result = {}
for name, candidates in records.items():
    first = candidates[0]
    if all(abs(c['lat']-first['lat']) < .001 and abs(c['lon']-first['lon']) < .001 for c in candidates):
        result[name] = first
Path('data/stations.json').write_text(json.dumps(result, indent=2)+'\n')
print(f'Imported {len(result)} unambiguous coordinate records')
