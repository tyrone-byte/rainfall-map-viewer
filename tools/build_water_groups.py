"""Refresh water gauge membership from 12 official bulletins, metadata only."""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import water
ROOT=Path(__file__).resolve().parents[1]

def build():
    groups=json.loads((ROOT/'data/archive-basin-groups.json').read_text())['groups']
    coordinates=json.loads((ROOT/'data/water-stations.json').read_text());stations=[]
    for group in groups:
        source=f"https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?{group['water_bulletin']}.html"
        raw=subprocess.run(['curl','-fLsS','--max-time','30','--max-filesize','4000000',source],capture_output=True,check=True).stdout
        bulletin=water.summary(raw.decode('utf-8',errors='replace'),source)
        for s in bulletin['stations']:
            if not s['stationNumber']:continue
            stations.append({'id':s['stationNumber'],'stationNumber':s['stationNumber'],'name':s['name'],'group':s['group'],'basinId':group['id'],'coordinates':coordinates.get(s['stationNumber']),'membershipSource':source,'historyPath':s.get('historyPath'),'plotPath':s.get('plotPath')})
        print(group['id'],len(bulletin['stations']),flush=True)
    (ROOT/'data/water-groups.json').write_text(json.dumps({'verifiedAt':datetime.now(timezone.utc).isoformat(),'groups':groups,'stations':stations},indent=2)+'\n')
if __name__=='__main__':build()
