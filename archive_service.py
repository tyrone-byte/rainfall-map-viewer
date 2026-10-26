"""Read-only archive access, observation-age report and complete quarter-hour sums."""
import json
import math
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCK = threading.Lock()
CACHE = {}

def date(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.utcoffset() is None:
        raise ValueError('Timestamp requires a timezone.')
    return parsed.astimezone(timezone.utc)

def connect(url):
    if url.startswith(('postgres://', 'postgresql://')):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(url, row_factory=dict_row, connect_timeout=5,
            options='-c default_transaction_read_only=on -c statement_timeout=8000')
    path = Path(url.removeprefix('sqlite:///')).resolve()
    connection = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=5)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA query_only=ON')
    return connection

def query(db, sql, args=()):
    if not isinstance(db, sqlite3.Connection):
        sql = sql.replace('?', '%s')
    return [{key:value.isoformat() if isinstance(value,datetime) else value for key,value in dict(row).items()} for row in db.execute(sql,args)]

def has_table(db,name):
    if isinstance(db,sqlite3.Connection):
        return bool(query(db,"SELECT name FROM sqlite_master WHERE type='table' AND name=?",(name,)))
    return bool(query(db,'SELECT to_regclass(?) AS relation',(name,))[0]['relation'])

def read_archive(key, reader):
    url = os.environ.get('HISTORY_DATABASE_URL') or os.environ.get('DATABASE_URL')
    if not url:
        return {'available': False, 'reason': 'not-connected'}
    with LOCK:
        cached = CACHE.get(key)
        if cached and cached[0] == url and time.monotonic()-cached[1] < 60:
            return cached[2]
        try:
            db = connect(url)
            try:
                result = {'available': True, **reader(db)}
            finally:
                db.close()
        except Exception:
            # A connection failure must never expose a database URL or password.
            result = {'available': False, 'reason': 'unavailable'}
        CACHE[key] = (url, time.monotonic(), result)
        if len(CACHE) > 128:
            oldest = min(CACHE, key=lambda item:CACHE[item][1])
            del CACHE[oldest]
        return result

ACCUMULATION_MINUTES = (15,30,60,180,360,720,1440)

def rainfall_extent():
    def read(db):
        extent = query(db, '''SELECT MIN(end_at) AS first, MAX(end_at) AS last FROM observations
            WHERE kind='rain-15m' AND duration_seconds=900''')[0]
        sources = query(db, "SELECT checked_at,issued_at,status FROM source_status WHERE source='rain-15m'")
        return {'firstEnd':extent['first'], 'lastEnd':extent['last'],
                'source':sources[0] if sources else None}
    return read_archive('rainfall-extent',read)

def selected_end(requested, extent):
    if not extent.get('lastEnd'):
        return None
    end = date(requested or extent['lastEnd'])
    if end.second or end.microsecond or end.minute % 15:
        raise ValueError('Choose an ending time on a 15-minute boundary.')
    if not date(extent['firstEnd']) <= end <= date(extent['lastEnd']):
        raise ValueError('The selected time is outside the saved quarter-hour archive.')
    return end.isoformat()

def rainfall_inventory():
    gauges = json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']
    catalogue = json.loads((ROOT/'data/stations.json').read_text())
    from rainfall import key
    result=[]
    for gauge in gauges:
        sid = gauge['live_map_station_id']
        coordinates = None
        if sid and gauge['live_map_lat'] and gauge['live_map_lon']:
            lat,lon=float(gauge['live_map_lat']),float(gauge['live_map_lon'])
            if -29<=lat<=-25 and 151<=lon<=154:
                coordinates={'lat':lat,'lon':lon,'stationNumber':sid,
                    'source':'https://reg.bom.gov.au/qld/flood/brisbane.shtml'}
        # Saved IFD references may use the older catalogue point for the same ID.
        reference=catalogue.get(key(gauge['gauge']))
        ifd_key = f"{reference['lat']:.6f},{reference['lon']:.6f}" if reference and sid and reference.get('stationNumber')==sid else None
        result.append({'id':gauge['gauge_row_id'],'name':gauge['gauge'],'group':gauge['group'],
            'stationNumber':sid or None,'coordinates':coordinates,'ifdLocationKey':ifd_key})
    return result

def rainfall_frame(requested=None, minutes=180):
    if minutes not in ACCUMULATION_MINUTES:
        raise ValueError('Unsupported accumulation period.')
    extent=rainfall_extent()
    if not extent['available']:return extent
    end=selected_end(requested,extent)
    if end is None:return {'available':True, 'reason':'no-observations', 'stations':[]}
    def read(db):
        start=(date(end)-timedelta(minutes=minutes)).isoformat()
        rows=query(db, '''SELECT station,end_at,value FROM observations WHERE kind='rain-15m'
            AND duration_seconds=900 AND end_at>? AND end_at<=? ORDER BY station,end_at''',(start,end))
        grouped={}
        for row in rows:grouped.setdefault(row['station'],[]).append(row)
        totals={}
        stations=[]
        for gauge in rainfall_inventory():
            sid=gauge['stationNumber']
            if sid not in totals:
                totals[sid]=aggregate(grouped.get('bom:'+sid,[]) if sid else [],end,minutes)
            stations.append({**gauge,**totals[sid],
                'coverageStatus':'identity-unresolved' if not sid else 'complete' if totals[sid]['complete'] else 'incomplete'})
        return {'start':start,'end':end,'minutes':minutes,'stations':stations}
    result=read_archive(f'rainfall-frame:{end}:{minutes}',read)
    return {**result,'extent':extent}

def rainfall_series(gauge_id,requested=None):
    gauge=next((g for g in rainfall_inventory() if g['id']==gauge_id),None)
    if gauge is None or not gauge['stationNumber']:
        return {'available':False,'reason':'identity-unresolved'}
    extent=rainfall_extent()
    if not extent['available']:return extent
    end=selected_end(requested,extent)
    if end is None:return {'available':True,'reason':'no-observations','periods':[]}
    def read(db):
        end_date=date(end);start=end_date-timedelta(hours=24)
        rows=query(db, '''SELECT end_at,value FROM observations WHERE station=? AND kind='rain-15m'
            AND duration_seconds=900 AND end_at>? AND end_at<=? ORDER BY end_at''',
            ('bom:'+gauge['stationNumber'],start.isoformat(),end))
        by_end={}
        for row in rows:
            time_value=date(row['end_at'])
            if time_value in by_end:raise ValueError('Duplicate quarter-hours require investigation.')
            by_end[time_value]=row['value']
        periods=[{'start':(start+timedelta(minutes=15*i)).isoformat(),
                  'end':(start+timedelta(minutes=15*(i+1))).isoformat()} for i in range(96)]
        values=[by_end.get(date(period['end'])) for period in periods]
        return {'end':end,'periodMinutes':15,'periods':periods,'stations':[{**gauge,'values':values}]}
    return read_archive(f'rainfall-series:{gauge_id}:{end}',read)

def archive_status():
    def read(db):
        if has_table(db,'history_readings'):
            rows=query(db,"""SELECT g.station,k.kind,r.end_at,r.value,
                jsonb_build_object('metadata',r.qa_metadata::jsonb)::text AS payload,good.last_valid
                FROM history_gauges g CROSS JOIN history_kinds k
                JOIN LATERAL (SELECT * FROM history_readings WHERE gauge_id=g.id AND kind_id=k.id
                    ORDER BY end_at DESC,issued_at DESC,id DESC LIMIT 1) r ON true
                LEFT JOIN LATERAL (SELECT end_at AS last_valid FROM history_readings
                    WHERE gauge_id=g.id AND kind_id=k.id AND value IS NOT NULL ORDER BY end_at DESC LIMIT 1) good ON true""")
        else:
            rows = query(db, '''SELECT * FROM (
                SELECT station, kind, end_at, value, payload,
                    MAX(CASE WHEN value IS NOT NULL THEN end_at END) OVER (PARTITION BY station,kind) AS last_valid,
                    ROW_NUMBER() OVER (PARTITION BY station,kind ORDER BY end_at DESC,issued_at DESC,id DESC) AS position
                FROM observations WHERE kind IN ('rain-15m','water-summary')
            ) ranked WHERE position=1''')
        if has_table(db,'stations'):
            registry={s['station']:s for s in query(db,'SELECT station,name,station_group,metadata FROM stations')}
            for row in rows:
                station=registry.get(row['station'])
                if station:
                    payload=json.loads(row['payload']);payload.setdefault('metadata',{}).update(name=station['name'],group=station['station_group'],stationType=json.loads(station['metadata']).get('stationType','Not supplied'))
                    row['payload']=json.dumps(payload)
        return {'rows': rows, 'sources': query(db, 'SELECT source,checked_at,issued_at,status FROM source_status'),
                'runs': query(db, 'SELECT started_at,finished_at,status FROM runs ORDER BY started_at DESC LIMIT 1')}
    return read_archive('status', read)

def classify(last_valid, latest_missing, source_ok, current, suspect=60, out=360):
    if not source_ok:
        return 'unverified', 'Collection/source is stale or unavailable; gauge condition cannot be confirmed.'
    if not last_valid:
        return 'no-data', 'No valid observation available; outage duration is unknown.'
    age = (current-date(last_valid)).total_seconds()/60
    if age < -5:
        return 'suspect', 'Observation timestamp is in the future; check source time.'
    if age >= out:
        return 'out', 'No recent valid observation. Age-based flag; equipment failure is not confirmed.'
    if age >= suspect or latest_missing:
        return 'suspect', 'Latest observation is missing.' if latest_missing else 'No recent valid observation.'
    return 'current', 'Recent valid observation. Changes in value do not trigger flags.'

def report(archive, bulletin=None, current=None, suspect=60, out=360):
    current = current or datetime.now(timezone.utc)
    sources = {s['source']: s for s in archive.get('sources', [])}
    indexed = {(r['station'],r['kind']): r for r in archive.get('rows', [])}
    rows = []
    def fresh(source):
        try:
            return source and source['status']=='ok' and 0 <= (current-date(source['checked_at'])).total_seconds() < 1800 and -300 <= (current-date(source['issued_at'])).total_seconds() < 3600
        except (TypeError, ValueError, KeyError):
            return False
    def add(identity, name, group, kind, record=None, identity_known=True, station_type='Not supplied'):
        source = sources.get(kind)
        valid = record.get('last_valid') if record else None
        last = record.get('end_at') if record else None
        missing = record is not None and record.get('value') is None
        source_ok = fresh(source)
        status, reason = classify(valid, missing, source_ok, current, suspect, out)
        if not identity_known:
            status, reason = 'unresolved', 'Station identity is unresolved; no 15-minute archive match is assigned.'
        age = max(0, round((current-date(valid)).total_seconds()/60, 1)) if valid else None
        rows.append({'station': identity, 'name': name, 'group': group, 'kind': kind,
            'stationType': station_type, 'lastValidAt': valid, 'lastReportedAt': last,
            'lastCheckedAt': source.get('checked_at') if source else None,
            'latestMissing': missing, 'ageMinutes': age, 'status': status, 'reason': reason})
    gauges = json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']
    for gauge in gauges:
        sid = gauge['live_map_station_id']
        identity = 'bom:'+sid if sid else 'bulletin:'+gauge['gauge_row_id']
        add(identity, gauge['gauge'], gauge['group'], 'rain-15m', indexed.get((identity,'rain-15m')), bool(sid))
    water_rows = {r['station']: r for r in archive.get('rows', []) if r['kind']=='water-summary'}
    inventory = {}
    for identity, record in water_rows.items():
        metadata = json.loads(record['payload']).get('metadata', {})
        inventory[identity] = {'name': metadata.get('name', identity), 'group': metadata.get('group', 'Not supplied'),'stationType':metadata.get('stationType','Not supplied')}
    if bulletin:
        for station in bulletin['stations']:
            identity = 'bom:'+station['stationNumber'] if station['stationNumber'] else station['id']
            inventory[identity] = station
            if not archive['available']:
                valid = station['observedAt'] if station['level'] is not None else None
                water_rows[identity] = {'last_valid': valid, 'end_at': station['observedAt'], 'value': station['level']}
        if not archive['available']:
            sources['water-summary'] = {'status': 'failed' if bulletin.get('refreshError') else 'ok',
                'checked_at': bulletin.get('fetchedAt'), 'issued_at': bulletin['issuedAt']}
    for identity, station in inventory.items():
        add(identity, station['name'], station['group'], 'water-summary', water_rows.get(identity),
            station_type=station.get('stationType','Not supplied'))
    return {'generatedAt': current.isoformat(), 'archiveAvailable': archive['available'],
            'archiveReason': archive.get('reason'), 'waterBasis': 'archive' if archive['available'] else 'live-summary',
            'sources': list(sources.values()), 'collectorRun': next(iter(archive.get('runs', [])), None),
            'thresholds': {'suspectMinutes': suspect, 'outMinutes': out}, 'rows': rows}

def aggregate(observations, end, minutes):
    end = date(end)
    if minutes <= 0 or minutes % 15:
        raise ValueError('Use whole 15-minute blocks.')
    by_end = {}
    for row in observations:
        timestamp = date(row['end_at'])
        if timestamp in by_end:
            raise ValueError('Duplicate quarter-hour observations need investigation.')
        by_end[timestamp] = row['value']
    required = [end-timedelta(minutes=15*i) for i in range(minutes//15)]
    values = [by_end.get(timestamp) for timestamp in required]
    present = [value for value in values if value is not None and math.isfinite(value) and value >= 0]
    complete = len(present)==len(required)
    depth = float(sum((Decimal(str(value)) for value in present), Decimal(0))) if complete else None
    return {'minutes': minutes, 'start': (end-timedelta(minutes=minutes)).isoformat(), 'end': end.isoformat(),
            'depth': depth, 'complete': complete, 'expectedBlocks': len(required), 'validBlocks': len(present)}

def rainfall_history(gauge_id):
    gauges = json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']
    gauge = next((g for g in gauges if g['gauge_row_id']==gauge_id), None)
    if not gauge or not gauge['live_map_station_id']:
        return {'available': False, 'reason': 'identity-unresolved'}
    station = 'bom:'+gauge['live_map_station_id']
    def read(db):
        last = query(db, "SELECT MAX(end_at) AS end FROM observations WHERE kind='rain-15m'")[0]['end']
        if not last:
            return {'reason': 'no-observations', 'totals': [], 'qa': []}
        start = (date(last)-timedelta(hours=24)).isoformat()
        rows = query(db, '''SELECT end_at,value FROM observations WHERE station=? AND kind='rain-15m'
                           AND duration_seconds=900 AND end_at>? AND end_at<=? ORDER BY end_at''', (station,start,last))
        totals = [aggregate(rows,last,m) for m in [15,30,60,180,360,720,1440]]
        reference = query(db, '''SELECT kind,end_at,value,duration_seconds FROM observations WHERE station=?
            AND kind IN ('rain-1h','rain-3h') AND end_at>? AND end_at<=? ORDER BY end_at DESC''', (station,start,last))
        qa = []
        # Compare the latest aligned reference block of each native duration.
        for kind in ('rain-1h','rain-3h'):
            r = next((r for r in reference if r['kind']==kind), None)
            if not r:
                continue
            total = aggregate(rows,r['end_at'],r['duration_seconds']//60)
            difference = round(total['depth']-r['value'], 3) if total['complete'] and r['value'] is not None else None
            qa.append({**total, 'referenceKind': kind, 'referenceDepth': r['value'], 'difference': difference,
                'assessment': 'incomplete' if not total['complete'] else 'reference-missing' if r['value'] is None else
                    'match' if abs(difference)<=0.1 else 'difference'})
        return {'station': station, 'end': last, 'totals': totals, 'qa': qa}
    return read_archive('rainfall:'+station, read)
