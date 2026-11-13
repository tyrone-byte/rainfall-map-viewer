"""Published gauge metadata and provisional dam crests; never writes observations."""
import csv
import hashlib
import io
import json
import math
import re
import sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parent
KINDS={'minor','moderate','major','spillway'}

def finite(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def validate(record):
    if not re.fullmatch(r'\d{6}',record.get('stationId','')) or record.get('kind') not in KINDS or not finite(record.get('level')):
        raise ValueError('Invalid gauge reference identity, kind or level')
    if record.get('datum') not in ('AHD','LGH',None):raise ValueError('Unknown reference datum')
    if not record.get('source') or not record.get('retrievedAt'):raise ValueError('Reference provenance required')
    return record

def datum_compatible(record,datum):
    return datum in ('AHD','LGH') and (record.get('datum')==datum or (
        record.get('datum') is None and record.get('datumBasis')=='same-station-observation'
        and record.get('datumVerified') is True))

def ensure_table(db):
    db.execute('''CREATE TABLE IF NOT EXISTS gauge_reference_levels (
        id TEXT PRIMARY KEY, station TEXT NOT NULL, kind TEXT NOT NULL,
        datum TEXT, level DOUBLE PRECISION NOT NULL, source TEXT NOT NULL,
        retrieved_at TEXT NOT NULL, record TEXT NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS gauge_reference_station ON gauge_reference_levels(station,retrieved_at)')

def save_records(db,records):
    # Explicit import only, with append-only versions and idempotent repeated imports.
    for record in records:
        validate(record)
        raw=json.dumps(record,sort_keys=True,allow_nan=False)
        identity=hashlib.sha256(raw.encode()).hexdigest()
        sql='INSERT INTO gauge_reference_levels VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING'
        if not isinstance(db,sqlite3.Connection):sql=sql.replace('?','%s')
        db.execute(sql,(identity,record['stationId'],record['kind'],record.get('datum'),record['level'],record['source'],record['retrievedAt'],raw))
    db.commit()

def published(gauge_id,db=None):
    records=json.loads((ROOT/'data/water-reference-levels.json').read_text())['records']
    records=[r for r in records if r['stationId']==gauge_id]
    if db is not None:
        import archive_service as archive
        if archive.has_table(db,'gauge_reference_levels'):
            records.extend(json.loads(r['record']) for r in archive.query(db,'SELECT record FROM gauge_reference_levels WHERE station=? ORDER BY retrieved_at',(gauge_id,)))
    latest={}
    for record in sorted(records,key=lambda r:r['retrievedAt']):
        if record.get('damId'):continue
        validate(record);latest[(record['kind'],record.get('datum'))]=record
    return list(latest.values())

def for_gauge(gauge_id,db=None):
    records=published(gauge_id,db)
    associations=json.loads((ROOT/'data/dams/storage-gauge-associations.json').read_text())
    crests=json.loads((ROOT/'data/dams/spillway-crests.json').read_text())
    for dam,association in associations.items():
        if association['stationId']!=gauge_id or dam not in crests:continue
        crest=crests[dam]
        records.append({'stationId':gauge_id,'kind':'spillway','level':crest['level'],'datum':crest['datum'],
                        'source':crest['source'],'damId':dam,'provisional':True,
                        'note':'Provisional dam/gauge association; verify crest and gauge datums'})
    return records

def comparison(crest,reading):
    if not reading or not finite(reading.get('value')):return {'state':'unknown','reason':'No reading','difference':None,'over10m':None}
    difference=reading['value']-crest['level']
    over=abs(difference)>10
    # Raw differences are diagnostic even with incompatible datums; never imply a conversion.
    compatible=reading.get('datum')=='AHD' and crest.get('datum') in (None,'AHD')
    reason='Datum mismatch / unverified local datum' if not compatible else 'Difference exceeds 10 m — review required' if over else 'Provisional numeric comparison; verify association and datum'
    return {'state':'unknown' if not compatible or over else 'above' if difference>0 else 'below' if difference<0 else 'at',
            'reason':reason,'difference':round(difference,4),'over10m':over}

def latest_water_rows(db,station_ids,end):
    import archive_service as archive
    ids=sorted(station_ids)
    if not ids:return []
    if archive.has_table(db,'history_readings'):
        placeholders=','.join('?' for _ in ids)
        return archive.query(db,"""SELECT g.station,r.end_at,d.datum,r.value
            FROM history_gauges g CROSS JOIN LATERAL (
              SELECT end_at,datum_id,value FROM history_readings
              WHERE gauge_id=g.id AND kind_id=(SELECT id FROM history_kinds WHERE kind='water-summary')
              AND end_at<=? ORDER BY end_at DESC,issued_at DESC,id DESC LIMIT 1
            ) r JOIN history_datums d ON d.id=r.datum_id
            WHERE g.station IN ("""+placeholders+')',(end,*ids))
    rows=[]
    for station in ids:
        rows.extend(archive.query(db,"""SELECT station,end_at,datum,value FROM observations
            WHERE station=? AND kind='water-summary' AND end_at<=?
            ORDER BY end_at DESC,issued_at DESC,id DESC LIMIT 1""",(station,end)))
    return rows

def review():
    import archive_service as archive
    dams=json.loads((ROOT/'public/dams-catalogue.json').read_text())['dams']
    ids={'bom:'+d['storageWaterGauge']['id'] for d in dams if d.get('storageWaterGauge')}
    now=archive.datetime.now(archive.timezone.utc).isoformat()
    result=archive.read_archive('dam-spillway-review',lambda db:{'readings':latest_water_rows(db,ids,now)})
    readings={r['station']:r for r in result.get('readings',[])}
    rows=[]
    for dam in dams:
        gauge=dam.get('storageWaterGauge');crest=dam.get('spillwayCrest');reading=readings.get('bom:'+gauge['id']) if gauge else None
        check=comparison(crest,reading) if crest else {'difference':None,'over10m':None,'reason':'No crest'}
        rows.append({'dam':dam['name'],'gauge_id':gauge['id'] if gauge else '', 'gauge_name':gauge['name'] if gauge else '',
                     'association':'Provisional test' if gauge else 'Unresolved','crest_m':crest['level'] if crest else '',
                     'crest_datum':crest.get('datum') or 'UNVERIFIED' if crest else '',
                     'latest_level_m':reading['value'] if reading else '', 'reading_datum':reading['datum'] if reading else '',
                     'observed_at':reading['end_at'] if reading else '', 'raw_difference_m':check['difference'], 'comparison_state':check.get('state','unknown'),
                     'over_10m':check['over10m'], 'review_reason':'Unresolved storage gauge' if not gauge else check['reason'] if result.get('available') else 'History database '+result.get('reason','unavailable')})
    return rows

def review_csv():
    rows=review();out=io.StringIO();writer=csv.DictWriter(out,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows);return out.getvalue()
