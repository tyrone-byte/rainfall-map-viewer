"""Refresh basin membership from 12 official bulletins; never imports rainfall values.
Run manually: python3 tools/build_rainfall_groups.py
Coordinates use the existing audited catalogue, with exact names only.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rainfall import parse, key
ROOT=Path(__file__).resolve().parents[1]

def build():
    basins=json.loads((ROOT/'data/archive-basin-groups.json').read_text())['groups']
    catalogue=json.loads((ROOT/'data/stations.json').read_text())
    original=json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']
    result=[]
    for basin in basins:
        product=basin['rainfall_bulletins'][1]
        source=f'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?{product}.html'
        raw=subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','30','--max-filesize','4000000',source],capture_output=True,check=True).stdout
        bulletin=parse(raw.decode('utf-8',errors='replace'),source=source)
        for station in bulletin['stations']:
            reference=catalogue.get(key(station['name'])) if not station.get('ambiguousName') else None
            old=next((g for g in original if basin['id']=='brisbane-bremer-pine-caboolture' and g['gauge_row_id']==station['id']),None)
            sid=(old['live_map_station_id'] or None) if old else reference['stationNumber'] if reference else None
            coordinates=None
            if old and sid and old['live_map_lat'] and old['live_map_lon']:
                coordinates={'lat':float(old['live_map_lat']),'lon':float(old['live_map_lon']),'source':'https://reg.bom.gov.au/qld/flood/brisbane.shtml'}
            elif reference and sid:
                coordinates={k:reference[k] for k in ('lat','lon','source')}
            if coordinates:coordinates['stationNumber']=sid
            ifd=f"{reference['lat']:.6f},{reference['lon']:.6f}" if reference and reference['stationNumber']==sid else None
            result.append({'id':old['gauge_row_id'] if old else basin['id']+':'+station['id'],'name':station['name'],'group':station['group'],'basinId':basin['id'],'stationNumber':sid,'coordinates':coordinates,'ifdLocationKey':ifd,'membershipSource':source})
        print(basin['id'],len(bulletin['stations']),flush=True)
    target=ROOT/'data/rainfall-groups.json'
    target.write_text(json.dumps({'verifiedAt':datetime.now(timezone.utc).isoformat(),'source':'https://www.bom.gov.au/qld/flood/rain_river.shtml','groups':basins,'stations':result},indent=2)+'\n')
    print(f'{len(result)} gauges; {sum(s["coordinates"] is not None for s in result)} audited locations')
if __name__=='__main__':build()
