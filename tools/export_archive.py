"""Read-only, indexed monthly CSV archive. No source files or database credentials exported."""
import argparse
import csv
import hashlib
import io
import json
import math
import os
import sys
import zipfile
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from archive_service import connect

FIELDS = ['station_id','measurement','observed_end_utc','period_seconds','value','unit','datum',
          'source_product','source_quality','source_issued_utc','source_fetched_utc','value_basis','qa_metadata']
PRODUCTS={'rain-15m':'IDQ65900','rain-1h':'IDQ60336','rain-3h':'IDQ60348','water-summary':'IDQ60286','water-history':'IDQ65389'}

def month_bounds(month):
    start=datetime.strptime(month,'%Y-%m').replace(tzinfo=timezone(timedelta(hours=10)))
    end=start.replace(year=start.year+1,month=1) if start.month==12 else start.replace(month=start.month+1)
    return start.astimezone(timezone.utc).isoformat(),end.astimezone(timezone.utc).isoformat()

def station_catalogue():
    result={}
    for s in json.loads((ROOT/'data/stations.json').read_text()).values():
        result.setdefault('bom:'+s['stationNumber'],{'station_id':'bom:'+s['stationNumber'],
            'name':s['catalogueName'],'latitude':s['lat'],'longitude':s['lon'],
            'coordinate_source':s['source'],'coordinate_date':s.get('catalogueDate',''),'group':''})
    for s in json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']:
        if s['live_map_station_id']:
            sid='bom:'+s['live_map_station_id']
            result[sid]={'station_id':sid,'name':s['gauge'],'latitude':s['live_map_lat'] or '',
                'longitude':s['live_map_lon'] or '', 'coordinate_source':'https://reg.bom.gov.au/qld/flood/brisbane.shtml',
                'coordinate_date':'2026-10-22','group':s['group']}
    return result

def cell(station):
    if station['latitude']=='' or station['longitude']=='':return 'unlocated'
    return f"lat_{math.floor(float(station['latitude']))}_lon_{math.floor(float(station['longitude']))}"

def csv_bytes(rows,fields):
    stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fieldnames=fields)
    writer.writeheader();writer.writerows(rows)
    return stream.getvalue().encode('utf-8')

def export_archive(url,month,destination,sample=False):
    start,end=month_bounds(month)
    db=connect(url)
    try:
        sql='''SELECT o.*,s.fetched_at FROM observations o LEFT JOIN snapshots s ON s.id=o.snapshot_id
               WHERE o.end_at>=? AND o.end_at<? ORDER BY o.station,o.end_at,o.kind'''
        if not url.startswith('sqlite:'):sql=sql.replace('?','%s')
        cursor=db.execute(sql,(start,end))
        catalogue=station_catalogue();groups={};stations={}
        while batch:=cursor.fetchmany(1000):
            for raw in batch:
                row=dict(raw);sid=row['station'];payload=json.loads(row['payload']);meta=payload.get('metadata',{})
                station=catalogue.get(sid,{'station_id':sid,'name':meta.get('name',''),
                    'latitude':'','longitude':'','coordinate_source':'','coordinate_date':'','group':meta.get('group','')})
                stations[sid]=station
                partition=f"observations/{row['kind']}/{cell(station)}.csv"
                groups.setdefault(partition,[]).append(dict(zip(FIELDS,[sid,row['metric'],row['end_at'],
                    row['duration_seconds'],'' if row['value'] is None else row['value'],
                    'mm' if row['metric']=='rainfall' else 'm',row['datum'],PRODUCTS.get(row['kind'],row['kind']),
                    row['quality'],row['issued_at'],row['fetched_at'] or '',
                    'estimated_uniform_3h' if meta.get('estimated') else 'observed',
                    json.dumps(meta,separators=(',',':'),sort_keys=True)])))
    finally:db.close()
    index={'format':'rainfall-map-archive','version':1,'month':month,'calendar_timezone':'Australia/Brisbane',
        'month_start_utc_inclusive':start,'month_end_utc_exclusive':end,
        'created_utc':datetime.now(timezone.utc).isoformat(),'sample':sample,
        'coverage_note':'Partial preserved event data; not a full month or a live production export.' if sample else 'Contains available records only; missing intervals are not filled.',
        'partitioning':'One-degree coordinate cells, separate measurement source kinds. Unresolved locations retained in unlocated.',
        'timestamp_note':'source_fetched_utc refers to the associated source snapshot, not necessarily first receipt of an observation.',
        'files':[]}
    with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        def add(name,content,info):
            archive.writestr(name,content)
            index['files'].append({'path':name,'sha256':hashlib.sha256(content).hexdigest(),'uncompressed_bytes':len(content),**info})
        for name,rows in sorted(groups.items()):
            numeric=[r for r in rows if r['value']!='']
            add(name,csv_bytes(rows,FIELDS),{'type':'observations','records':len(rows),'numeric_records':len(numeric),
                'missing_records':len(rows)-len(numeric),'station_ids':sorted({r['station_id'] for r in rows}),
                'first_end_utc':min(r['observed_end_utc'] for r in rows),'last_end_utc':max(r['observed_end_utc'] for r in rows),
                'decimal_value_sum':str(sum((Decimal(str(r['value'])) for r in numeric),Decimal(0)))})
        station_fields=['station_id','name','latitude','longitude','coordinate_source','coordinate_date','group']
        add('stations.csv',csv_bytes([stations[s] for s in sorted(stations)],station_fields),{'type':'stations','records':len(stations)})
        archive.writestr('index.json',json.dumps(index,indent=2))
        archive.writestr('READ-ME.txt',f'''LOCAL ARCHIVE FORMAT SAMPLE\nMonth: {month} (Brisbane calendar)\n{index['coverage_note']}\n\nUnzip this file locally. Open stations.csv or any observations CSV in Excel.\nindex.json lists each file's station IDs, time coverage, record count and checksum.\nStation IDs are text: retain leading zeros after bom:.\nBlank values mean missing; zeros are measurements. Estimated values are labelled.\nRainfall values are period depths, not intensities. Water levels are instantaneous\nand require their datum. Different source kinds can overlap; do not sum them together.\nNo raw downloaded BoM files, credentials or database connection details are included.\nA local multi-month archive viewer and automatic monthly exports are not yet enabled.\n''')
    report=verify_archive(destination)
    return {'archive':str(destination),'compressed_bytes':Path(destination).stat().st_size,**report}

def verify_archive(path):
    records=0
    with zipfile.ZipFile(path) as archive:
        index=json.loads(archive.read('index.json'))
        if index.get('format')!='rainfall-map-archive' or index.get('version')!=1:raise ValueError('Unknown archive format.')
        seen=set()
        for item in index['files']:
            content=archive.read(item['path'])
            if hashlib.sha256(content).hexdigest()!=item['sha256']:raise ValueError('Checksum mismatch.')
            rows=list(csv.DictReader(io.StringIO(content.decode('utf-8'))))
            if len(rows)!=item['records']:raise ValueError('Record count mismatch.')
            if item['type']=='observations':
                numeric=[r for r in rows if r['value']!='']
                if len(numeric)!=item['numeric_records']:raise ValueError('Numeric count mismatch.')
                if str(sum((Decimal(r['value']) for r in numeric),Decimal(0)))!=item['decimal_value_sum']:raise ValueError('Value sum mismatch.')
                for row in rows:
                    key=tuple(row[f] for f in ['station_id','measurement','observed_end_utc','period_seconds','datum','source_product'])
                    if key in seen:raise ValueError('Duplicate observation identity.')
                    seen.add(key)
                records+=len(rows)
    return {'verified':True,'observation_records':records,'stations':next(f['records'] for f in index['files'] if f['type']=='stations'),
        'observation_files':sum(f['type']=='observations' for f in index['files'])}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--month',required=True);parser.add_argument('--output',required=True)
    parser.add_argument('--database',default=os.environ.get('HISTORY_DATABASE_URL') or os.environ.get('DATABASE_URL'))
    parser.add_argument('--sample',action='store_true')
    args=parser.parse_args()
    if not args.database:parser.error('A database is required.')
    print(json.dumps(export_archive(args.database,args.month,args.output,args.sample),indent=2))
