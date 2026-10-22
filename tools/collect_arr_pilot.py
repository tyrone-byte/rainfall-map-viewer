"""Manual, capped ARR API trial. No public viewer endpoint calls this code.
One request at a time, >=30s apart; stop on any error, no retries or bypasses.
The 30-second spacing is our conservative trial setting, not a published ARR rate limit.
"""
import argparse
import json
import sys
import time
from datetime import datetime,timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request,urlopen
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from arr_ifd import import_result,location_key,request_url

def collect(targets,root,limit=5,delay=30,fetch=None,pause=time.sleep):
    if limit not in range(1,6) or delay<30:raise ValueError('Pilot permits 1–5 requests, spaced at least 30 seconds apart.')
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    report={'status':'completed','attempted':0,'imported':0,'skippedCached':0,'results':[]}
    try:
        index=json.loads((root/'index.json').read_text()) if (root/'index.json').exists() else {'locations':{}}
        visited=set()
        for target in targets:
            lat,lon=target['lat'],target['lon'];identity=location_key(lat,lon)
            if identity in visited:continue
            visited.add(identity)
            cached=index['locations'].get(identity)
            if cached and (root/'locations'/cached['file']).is_file():
                report['skippedCached']+=1;continue
            if report['attempted']>=limit:break
            if report['attempted']:pause(delay)
            report['attempted']+=1
            url=request_url(lat,lon)
            print(f"Pilot request {report['attempted']}/{limit}: {identity}",flush=True)
            raw=(fetch or fetch_response)(url)
            data=import_result(raw,lat,lon,root,'Documented ARR API · capped manual pilot',datetime.now(timezone.utc).isoformat())
            report['imported']+=1;report['results'].append({'location':identity,'datasets':len(data['datasets'])})
    except HTTPError as error:
        report.update(status='stopped',error=f'HTTP {error.code}; collection stopped without retry.',retryAfter=error.headers.get('Retry-After'))
    except Exception as error:
        report.update(status='stopped',error=str(error))
    (root/'pilot-report.json').write_text(json.dumps(report,indent=2)+'\n')
    return report

def fetch_response(url):
    request=Request(url,headers={'Accept':'application/json','User-Agent':'RainfallMapViewer/1.0 (manual 5-request pilot; github.com/tyrone-byte/rainfall-map-viewer)'})
    with urlopen(request,timeout=60) as response:
        raw=response.read(10_000_001)
    if len(raw)>10_000_000:raise ValueError('Response exceeded pilot size limit.')
    return raw

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--targets',default='data/ifd/targets.json');p.add_argument('--output',default='data/ifd');p.add_argument('--limit',type=int,choices=range(1,6),default=5);a=p.parse_args()
    report=collect(json.loads(Path(a.targets).read_text())['locations'],a.output,a.limit)
    print(json.dumps(report,indent=2));sys.exit(0 if report['status']=='completed' else 1)
