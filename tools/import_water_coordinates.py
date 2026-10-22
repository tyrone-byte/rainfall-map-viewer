"""Import official section3 river catalogue by station number, without name matching."""
import json
import re
import sys
from pathlib import Path

def dms(raw):
    digits=raw[:-1]
    return round((int(digits[:-4])+int(digits[-4:-2])/60+int(digits[-2:])/3600)*(-1 if raw[-1] in 'SW' else 1),6)

def import_catalogue(path):
    records={}
    for line in Path(path).read_text().splitlines():
        match=re.search(r'(\d{6}[NS])\s+(\d{7}[EW])',line)
        if not match or not re.match(r'\s+\d{6}\s',line):continue
        station=line[1:7]
        entry={'stationNumber':station,'catalogueName':line[16:46].strip(),'lat':dms(match[1]),'lon':dms(match[2]),
               'source':'https://reg.bom.gov.au/qld/flood/networks/section3.shtml','catalogueDate':'2022-01-05','method':'Exact BoM station number'}
        records.setdefault(station,[]).append(entry)
    if not records:raise ValueError('No station coordinates recognised.')
    return {sid:entries[0] for sid,entries in records.items() if all(e['lat']==entries[0]['lat'] and e['lon']==entries[0]['lon'] for e in entries)}

if __name__=='__main__':
    result=import_catalogue(sys.argv[1]);Path('data/water-stations.json').write_text(json.dumps(result,indent=2)+'\n');print(f'Imported {len(result)} river station coordinates')
