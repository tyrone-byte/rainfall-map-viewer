"""Fetch only BoM bulletin/history URLs; keep the last successfully parsed responses."""
import json
import re
import subprocess
import threading
from datetime import datetime,timezone
from pathlib import Path
import water

ROOT=Path(__file__).resolve().parent
CACHE=ROOT/'.cache/water'
LOCK=threading.Lock()

def cached(name,url,parser,refresh=False):
    with LOCK:
        CACHE.mkdir(parents=True,exist_ok=True)
        path=CACHE/(name+'.json');previous=None
        if path.exists():
            try:
                previous=json.loads(path.read_text())
                age=(datetime.now(timezone.utc)-datetime.fromisoformat(previous['fetchedAt'])).total_seconds()
            except (OSError,ValueError,KeyError,TypeError):previous=None
        error=None
        if refresh or previous is None or age>300:
            try:
                response=subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','25','--max-filesize','4000000',url],capture_output=True,check=True)
                data=parser(response.stdout.decode('utf-8',errors='replace'))
                data.update(source=url,fetchedAt=datetime.now(timezone.utc).isoformat())
                temp=path.with_suffix('.tmp');temp.write_text(json.dumps(data));temp.replace(path);previous=data
            except (subprocess.SubprocessError,OSError,ValueError) as exc:
                print(f'BoM water refresh failed: {exc}',flush=True)
                error='Could not refresh BoM river data. Check source access or formatting.'
        if previous is None:raise ValueError(error or 'River data unavailable.')
        result=json.loads(json.dumps(previous));result['refreshError']=error
        return result

def summary(refresh=False):
    data=cached('summary',water.SOURCE,water.summary,refresh)
    coordinates=json.loads((ROOT/'data/water-stations.json').read_text())
    for station in data['stations']:
        c=coordinates.get(station['stationNumber'])
        station['coordinates']=c if c and -29<=c['lat']<=-25 and 151<=c['lon']<=154 else None
    return data

def history(station_id,refresh=False):
    if not re.fullmatch(r'\d{6}',station_id):raise ValueError('Invalid BoM station identifier.')
    bulletin=summary()
    station=next((s for s in bulletin['stations'] if s['id']==station_id),None)
    if not station or not station['historyPath']:raise ValueError('No history link supplied for this station.')
    url='https://reg.bom.gov.au'+station['historyPath']
    data=cached(station_id,url,lambda html:water.history(html,station_id),refresh)
    data['datum']=station['datum'];data['datumSource']='Summary bulletin'
    # Thresholds from a different datum are never plotted on this gauge's series.
    if any(t['datum']!=station['datum'] for t in data['thresholds']):
        data['warnings'].append('Flood classification datum mismatch; threshold lines omitted.')
        data['thresholds']=[]
    data['summaryRefreshError']=bulletin['refreshError']
    return data
