"""Explicit, serial import of published BoM reference text. Never runs on page visits."""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from datetime import datetime,timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import gauge_references as refs
import water
import water_service


def parse_page(html,station_id,source,retrieved=None):
    doc=water.Tables();doc.feed(html)
    text=' '.join(' '.join(doc.text).split())
    identity=re.search(r'Station Number:\s*(\d{6})',text)
    if not identity or identity[1]!=station_id:raise ValueError('Reference page station identity mismatch')
    timestamp=retrieved or datetime.now(timezone.utc).isoformat()
    records=[];seen={}
    pattern=r'\b(Minor|Moderate|Major|Spillway(?:\s+crest)?(?:\s+level)?):\s*(-?\d+(?:\.\d+)?)\s*m\s*(AHD|LGH)\b'
    for match in re.finditer(pattern,text,re.I):
        kind='spillway' if match[1].lower().startswith('spillway') else match[1].lower()
        key=(kind,match[3].upper());level=float(match[2])
        if key in seen and seen[key]!=level:raise ValueError('Conflicting reference values in source page')
        if key in seen:continue
        seen[key]=level
        records.append(refs.validate({'stationId':station_id,'kind':kind,'level':level,'datum':key[1],
            'source':source,'retrievedAt':timestamp,'sourceSha256':hashlib.sha256(html.encode()).hexdigest(),'provisional':False}))
    return records


def connect(url):
    if url.startswith(('postgres://','postgresql://')):
        import psycopg
        return psycopg.connect(url,connect_timeout=15)
    path=Path(url.removeprefix('sqlite:///'));path.parent.mkdir(parents=True,exist_ok=True)
    return sqlite3.connect(path)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--station',action='append',default=[])
    parser.add_argument('--all',action='store_true',help='Use the saved viewer catalogue, bounded by --limit')
    parser.add_argument('--limit',type=int,default=20)
    parser.add_argument('--delay',type=float,default=2)
    parser.add_argument('--html',action='append',default=[],help='Import a locally supplied BoM page: STATION_ID=path')
    parser.add_argument('--seed-spillways',action='store_true')
    parser.add_argument('--database',default=os.environ.get('HISTORY_DATABASE_URL') or os.environ.get('DATABASE_URL') or str(refs.ROOT/'.cache/gauge-references.sqlite'))
    parser.add_argument('--export',type=Path,default=refs.ROOT/'data/water-reference-levels.json')
    args=parser.parse_args()
    if args.limit<1 or args.delay<2:parser.error('Positive limit and at least two seconds between live requests required')
    inventory=json.loads((refs.ROOT/'data/water-groups.json').read_text())['stations'];by_id={r['id']:r for r in inventory}
    records=[];report=[]
    for item in args.html:
        station,path=item.split('=',1)
        if station not in by_id:raise ValueError('Station not in viewer catalogue')
        records.extend(parse_page(Path(path).read_text(),station,'User-supplied BoM page: '+Path(path).name))
    selected=list(dict.fromkeys(([s['id'] for s in inventory] if args.all else args.station)))[:args.limit]
    for index,station in enumerate(selected):
        if station not in by_id:raise ValueError('Station not in viewer catalogue')
        if index:time.sleep(args.delay)
        try:
            path=by_id[station].get('historyPath')
            if not path:
                links=water_service.gauge_links(station,by_id[station]['basinId'])
                if not links.get('available'):raise ValueError('Link source unavailable or no verified link; stop for review')
                path=links.get('historyPath')
            if not path:
                report.append({'stationId':station,'status':'no supplied history link'});continue
            if not re.fullmatch(r'/fwo/IDQ\d+/IDQ\d+\.'+station+r'\.tbl\.shtml',path):raise ValueError('Unverified history URL')
            url='https://reg.bom.gov.au'+path
            response=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','25','--max-filesize','4000000',url],capture_output=True,check=True)
            found=parse_page(response.stdout.decode('utf-8'),station,url)
            records.extend(found);report.append({'stationId':station,'status':'published values found' if found else 'no explicit reference levels','count':len(found)})
        except (subprocess.SubprocessError,ValueError,OSError) as error:
            report.append({'stationId':station,'status':'stopped: source unavailable or changed','errorType':type(error).__name__})
            break  # No retries or continuing to hammer a refused source.
    if args.seed_spillways:
        for station in by_id:
            for record in refs.for_gauge(station):
                if record.get('damId'):
                    records.append({**record,'retrievedAt':datetime.now(timezone.utc).isoformat()})
    db=connect(args.database)
    try:refs.ensure_table(db);refs.save_records(db,records)
    finally:db.close()
    # Only actual published BoM values enter the portable export; provisional dam
    # crests remain in their dedicated versioned file and table rows.
    existing=json.loads(args.export.read_text())['records'] if args.export.exists() else []
    seen={json.dumps(r,sort_keys=True):r for r in existing+records if not r.get('damId')}
    args.export.parent.mkdir(parents=True,exist_ok=True)
    args.export.write_text(json.dumps({'records':list(seen.values())},indent=2)+'\n')
    print(json.dumps({'importedRecords':len(records),'collection':report},indent=2))
    return 1 if any(r['status'].startswith('stopped:') for r in report) else 0

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        print(json.dumps({'status':'failed','errorType':type(error).__name__}),file=sys.stderr)
        sys.exit(1)
