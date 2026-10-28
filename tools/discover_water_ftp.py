"""Read-only BoM water FTP pilot: one listing, at most one file per product.
Does not connect to the history database, modify collection, or infer datums.
"""
import csv
import io
import json
import re
import subprocess
import time
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path

BASE='ftp://ftp.bom.gov.au/anon/gen/fwo/'
PRODUCTS={'IDQ65910':'River height most recent observations for QLD',
          'IDQ65911':'River height last 3-hour observations for QLD'}
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.cache/water-ftp-discovery'


def analyse(raw,station='040835'):
    text=raw.decode('utf-8-sig');headers={};lines=[]
    for line in text.splitlines():
        if line.startswith('# HEADER: '):
            key,separator,value=line.removeprefix('# HEADER: ').partition(': ')
            if separator:headers[key]=value
        elif line and not line.startswith('#'):lines.append(line)
    fields=[f.strip() for f in headers.get('Data Fields','').split(',')]
    if headers.get('File Format')!='BOM-HCS' or headers.get('File Format Version')!='2.0':
        return {'formatValidated':False,'reason':'Not verified BOM-HCS 2.0; raw sample retained for review.'}
    if not {'SiteId','ObservationTimestamp','RealValue','Unit'}.issubset(fields) or len(fields)!=len(set(fields)):
        return {'formatValidated':False,'reason':'Unexpected water fields; raw sample retained for review.','fields':fields}
    rows=[]
    for cells in csv.reader(io.StringIO('\n'.join(lines))):
        if len(cells)!=len(fields):raise ValueError('HCS row/column mismatch.')
        rows.append(dict(zip(fields,cells)))
    if headers.get('Number of Records')!=str(len(rows)):raise ValueError('HCS record count mismatch.')
    selected=[r for r in rows if r['SiteId']==station]
    times=[]
    for row in selected:
        parsed=datetime.fromisoformat(row['ObservationTimestamp'].replace('Z','+00:00'))
        if parsed.utcoffset() is None:raise ValueError('Observation timezone unspecified; no timestamp guessed.')
        times.append(parsed.astimezone(timezone.utc))
    times=sorted(set(times))
    gaps=[(b-a).total_seconds()/60 for a,b in zip(times,times[1:])]
    return {'formatValidated':True,'headers':headers,'recordCount':len(rows),
        'stationCount':len({r['SiteId'] for r in rows}),
        'units':dict(Counter(r['Unit'] for r in rows)),
        'sensorTypes':dict(Counter(r.get('SensorType','Not supplied') for r in rows)),
        'sensorDataTypes':dict(Counter(r.get('SensorDataType','Not supplied') for r in rows)),
        'mulgowieStationId':station,'mulgowieRecords':len(selected),
        'mulgowieDistinctTimes':len(times),'mulgowieFirstUTC':times[0].isoformat() if times else None,
        'mulgowieLastUTC':times[-1].isoformat() if times else None,
        'mulgowieGapMinutes':gaps,'mulgowieRows':selected,
        'datumHandling':'Not yet verified. Do not infer datum from sensor parameters or units.',
        'note':'Raw observations only; no interpolation, resampling or database writes.'}


def fetch(url,listing=False):
    command=['curl','--fail','--silent','--show-error','--ftp-pasv','--connect-timeout','15',
             '--max-time','45','--max-filesize','4000000' if listing else '20000000','--retry','0']
    if listing:command.append('--list-only')
    return subprocess.run(command+[url],capture_output=True,check=True).stdout


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    report={'startedUTC':datetime.now(timezone.utc).isoformat(),'source':BASE,
        'catalogueSource':'https://www.bom.gov.au/catalogue/data/SMSRPR09.json',
        'status':'checking','products':{},'databaseWrites':False}
    try:
        names=fetch(BASE,listing=True).decode('utf-8').splitlines()
        for product,description in PRODUCTS.items():
            item={'description':description,'status':'checking'};report['products'][product]=item
            matches=sorted({name.strip() for name in names if re.fullmatch(product+r'[A-Za-z0-9_.-]*\.(?:hcs|csv|txt)',name.strip(),re.I)})
            item['matchingFiles']=matches
            hcs=[n for n in matches if n.lower().endswith('.hcs')]
            if not hcs:
                item.update(status='no-hcs-sample',message='No HCS filename found; no guessed URL requested.');continue
            filename=hcs[-1];time.sleep(2)
            try:
                raw=fetch(BASE+filename);(OUT/filename).write_bytes(raw)
                result=analyse(raw);item.update(filename=filename,bytes=len(raw),**result)
                item['status']='sampled' if result['formatValidated'] else 'needs-format-review'
            except (subprocess.SubprocessError,ValueError,UnicodeError,OSError) as error:
                item.update(status='failed',errorType=type(error).__name__)
        report['status']='sampled' if any(p['status']=='sampled' for p in report['products'].values()) else 'not-validated'
    except (subprocess.SubprocessError,UnicodeError,OSError) as error:
        report.update(status='directory-unreachable',errorType=type(error).__name__)
    report['completedUTC']=datetime.now(timezone.utc).isoformat()
    (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return 0 if report['status']=='sampled' else 1

if __name__=='__main__':raise SystemExit(main())
