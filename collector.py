"""Run-once, bounded BoM collector. Schedule independently of the web viewer.

No interpolation, no cumulative-counter conversion and no fabricated observations.
"""
import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from functools import lru_cache

import rainfall
import water
from bom_hcs import parse_hcs
from bom_water_hcs import parse_water_hcs
from history_store import Store, now, utc
from bom_source import BASE, PRODUCTS, fetch

ROOT = Path(__file__).resolve().parent
CLEANUP_FAILURE='history-cleanup-paused-batched-v3'

def targets():
    rows = json.loads((ROOT / 'data/archive-stations.json').read_text())['gauges']
    return {r['gauge_row_id']: r['live_map_station_id'] for r in rows}

@lru_cache(maxsize=1)
def station_definitions():
    result={}
    path=ROOT/'data/stations.json'
    if path.exists():
        for s in json.loads(path.read_text()).values():
            result.setdefault(s['stationNumber'],{'name':s['catalogueName'],'coordinates':{'lat':s['lat'],'lon':s['lon'],'source':s['source']},'group':'','metadata':{'coordinateDate':s.get('catalogueDate','')}})
    for s in json.loads((ROOT/'data/archive-stations.json').read_text())['gauges']:
        if s['live_map_station_id']:
            result[s['live_map_station_id']]={'name':s['gauge'],'coordinates':{'lat':float(s['live_map_lat']),'lon':float(s['live_map_lon']),'source':'https://reg.bom.gov.au/qld/flood/brisbane.shtml'},'group':s['group'],'metadata':{'coordinateDate':'2026-10-22','basin_id':'brisbane-bremer-pine-caboolture'}}
    water_path=ROOT/'data/water-groups.json'
    if water_path.exists():
        for s in json.loads(water_path.read_text())['stations']:
            result.setdefault(s['id'],{})
            result[s['id']].update(name=s['name'],group=s['group'],coordinates=s['coordinates'],metadata={'basin_id':s['basinId']})
    return result

@lru_cache(maxsize=1)
def basin_definitions():
    return json.loads((ROOT/'data/archive-basin-groups.json').read_text())['groups']

def register_station(store,sid,name='',group='',source='',station_type=''):
    from compact_history import save_station
    definition=station_definitions().get(sid,{})
    old=store.execute('SELECT name,station_group,metadata FROM stations WHERE station=?',('bom:'+sid,)).fetchone()
    metadata={**definition.get('metadata',{}),**(json.loads(old['metadata']) if old else {})}
    if station_type:metadata['stationType']=station_type
    product=re.search(r'IDQ\d{5}',source)
    basins=basin_definitions()
    if product:
        basin=next((b for b in basins if b['water_bulletin']==product[0]),None)
        if basin:metadata['basin_id']=basin['id']
    save_station(store,'bom:'+sid,name or (old['name'] if old else '') or definition.get('name',''),group or (old['station_group'] if old else '') or definition.get('group',''),definition.get('coordinates'),metadata)

def ingest(store, raw, source, kind=None, update_status=True, fetched_at=None):
    """Validate a complete source before archiving its normalized observations."""
    mapping = targets()
    if kind=='water-ftp' or re.search(r'IDQ6591[01](?:_|\.)',source):
        return ingest_water_ftp(store,raw,source,update_status,fetched_at)
    if kind == 'rain-15m' or source.endswith('.hcs'):
        data = parse_hcs(raw); kind = 'rain-15m'
        issued = data['headers']['File Generation Date']
        if not data['observations'] or (not store.compact and not any(o['stationId'] in set(mapping.values()) - {''} for o in data['observations'])):
            raise ValueError('No confidently identified dashboard gauges in this rainfall source.')
    elif raw.lstrip().startswith(b'{'):
        data = json.loads(raw)
        if 'periods' in data:
            durations = {(datetime.fromisoformat(p['end'])-datetime.fromisoformat(p['start'])).total_seconds()
                         for p in data['periods']}
            if durations not in ({3600}, {10800}):
                raise ValueError('Unsupported cached rainfall period lengths.')
            kind = 'rain-1h' if durations == {3600} else 'rain-3h'
        else:
            kind = 'water-history' if 'observations' in data else 'water-summary'
        issued = data['issuedAt']
    else:
        html = raw.decode('utf-8-sig')
        if kind == 'water-summary' or 'Gauge Datum' in html:
            data = water.summary(html,source); kind = 'water-summary'
        else:
            interval = 1 if kind == 'rain-1h' or '1 hour period ending' in html.lower() else 3
            kind = f'rain-{interval}h'
            data = rainfall.parse(html, interval, source)
        issued = data['issuedAt']
    if store.compact and kind not in ('rain-15m','water-summary'):
        raise ValueError('This collector saves only quarter-hour rainfall and water summaries.')
    if store.compact and kind=='water-summary':
        from water_ftp_cutover import MARKER
        if store.execute('SELECT id FROM event_imports WHERE id=?',(MARKER,)).fetchone():
            raise ValueError('Web water imports are disabled after the FTP cutover.')
    snapshot, fresh = store.snapshot(raw, source, kind, issued, fetched_at=fetched_at)
    count = 0
    if fresh:
        if kind == 'rain-15m':
            allowed = {o['stationId'] for o in data['observations']} if store.compact else set(mapping.values()) - {''}
            known={r['station'] for r in store.execute("SELECT DISTINCT station FROM observations WHERE kind='rain-15m'")} if store.compact else set()
            registered=set()
            if store.compact:known.update('bom:'+o['stationId'] for o in data['observations'] if o['value'] is not None)
            for o in data['observations']:
                if o['stationId'] in allowed:
                    if store.compact:
                        if o['stationId'] not in registered:
                            register_station(store,o['stationId']);registered.add(o['stationId'])
                        if o['value'] is None and 'bom:'+o['stationId'] not in known:continue
                    count += store.observation(snapshot, 'bom:' + o['stationId'], 'rainfall',
                        o['time'], 900, o['value'], kind, issued, quality=o['quality'],
                        metadata={'qualityMeaning': 'Not yet verified', 'comment': o['comment']})
        elif kind in ('rain-3h', 'rain-1h'):
            for station in data['stations']:
                sid = mapping.get(station['id'])
                identity = 'bom:' + sid if sid else 'bulletin:' + station['id']
                for period, value in zip(data['periods'], station['values'], strict=True):
                    duration = int((datetime.fromisoformat(period['end']) - datetime.fromisoformat(period['start'])).total_seconds())
                    count += store.observation(snapshot, identity, 'rainfall', period['end'],
                        duration, value, kind, issued, metadata={'name': station['name'],
                        'group': station['group'], 'identityConfirmed': bool(sid),
                        'ambiguousName': station.get('ambiguousName', False)})
        elif kind == 'water-summary':
            known={r['station'] for r in store.execute("SELECT DISTINCT station FROM observations WHERE kind='water-summary'")} if store.compact else set()
            for station in data['stations']:
                if not station['stationNumber']:continue
                if store.compact:register_station(store,station['stationNumber'],station['name'],station['group'],source,station.get('stationType',''))
                if not station['observedAt']:continue
                if store.compact and station['level'] is None and 'bom:'+station['stationNumber'] not in known:continue
                count += store.observation(snapshot, 'bom:' + station['stationNumber'], 'water-level',
                    station['observedAt'], 0, station['level'], kind, issued, datum=station['datum'],
                    metadata={'name': station['name'], 'group': station['group'],
                              'timeBasis': 'Inferred from summary issue time and weekday'})
        elif kind == 'water-history':
            # Full history timestamps are explicit; retain table order for duplicate minutes.
            for ordinal, observation in enumerate(data['observations']):
                count += store.observation(snapshot, 'bom:' + data['stationNumber'], 'water-level',
                    observation['time'], 0, observation['level'], kind, issued,
                    datum=data.get('datum', 'Unspecified'), metadata={'sourceOrder': ordinal,
                    'timeBasis': 'Explicit history-table timestamp'})
    if update_status:
        store.status(kind, issued, 'ok', {'newOrChangedObservations': count,
                                         'warnings': data.get('warnings', [])})
    store.db.commit()
    return count

def ingest_water_ftp(store,raw,source,update_status=True,fetched_at=None):
    """Append every genuine available water observation at its explicit timestamp.

    Both products use the existing water series; overlaps deduplicate by station,
    timestamp and datum. Superseded summary observations are cleared by the validated one-time cutover.
    """
    parsed=parse_water_hcs(raw);issued=parsed['issuedAt']
    snapshot,fresh=store.snapshot(raw,source,'water-summary',issued,fetched_at=fetched_at)
    count=0
    if fresh:
        known={r['station'] for r in store.execute("SELECT station FROM stations")} if store.compact else set()
        registered=set()
        for o in sorted(parsed['observations'],key=lambda o:o['time']):
            station='bom:'+o['stationId']
            if o['value'] is None and station not in known:continue
            if o['stationId'] not in registered and store.compact:
                register_station(store,o['stationId']);registered.add(o['stationId']);known.add(station)
            count+=store.observation(snapshot,station,'water-level',o['time'],0,o['value'],'water-summary',issued,
                datum=o['datum'],quality=o['quality'],metadata={'timeBasis':'Explicit HCS timestamp','comment':o['comment']})
    if update_status:store.status('water-summary',issued,'ok',{'source':'water-ftp','newOrChangedObservations':count,'allAvailableObservations':True})
    store.db.commit();return count


def collect_water_ftp(store,listing):
    count=0;errors=[];issues=[]
    for product in ('IDQ65911','IDQ65910'):
        try:
            if listing is None:raise ValueError('FTP listing unavailable.')
            names=sorted({n.strip() for n in listing if re.fullmatch(product+r'_\d{14}\.hcs',n.strip())})
            if not names:raise ValueError('No water FTP files listed.')
            for name in names[-12:]:
                source=BASE+name
                if store.execute('SELECT source FROM feed_receipts WHERE source=?',(source,)).fetchone():continue
                try:count+=ingest_water_ftp(store,fetch(source),source,update_status=False)
                except Exception as error:
                    store.rollback();errors.append({'source':'water-ftp','product':product,'file':name,'error':type(error).__name__})
                time.sleep(2)
            latest=store.execute('SELECT issued_at FROM snapshots WHERE source=?',(product,)).fetchone()
            if not latest or (datetime.now(timezone.utc)-datetime.fromisoformat(latest['issued_at'])).total_seconds()>(5400 if product=='IDQ65911' else 3600):raise ValueError('Water FTP product stale or unavailable.')
            issues.append(latest['issued_at'])
        except Exception as error:
            store.rollback();errors.append({'source':'water-ftp','product':product,'error':type(error).__name__})
    if not errors and len(issues)==2:
        try:
            from water_ftp_cutover import cutover
            cutover(store)
        except Exception as error:
            store.rollback();errors.append({'source':'water-ftp','stage':'cutover','error':type(error).__name__})
    store.status('water-summary',max(issues) if issues else None,'failed' if errors else 'ok',
        {'source':'water-ftp','products':['IDQ65911','IDQ65910'],'newOrChangedObservations':count,'allAvailableObservations':True,'errors':errors})
    store.db.commit();return count,errors


def collect(store):
    results, errors = {}, []
    listing=None
    # Exact product, newest retained window only. Timestamped files are immutable.
    try:
        listing=fetch(BASE, True).decode().splitlines()
        names = sorted({n.strip() for n in listing
                        if re.fullmatch(r'IDQ65900_\d{14}\.hcs', n.strip())})
        if not names:
            raise ValueError('No supported IDQ65900 files in the FTP listing.')
        results['rain-15m'] = 0
        for name in names[-12:]:
            source = BASE + name
            if store.execute('SELECT source FROM feed_receipts WHERE source=?' if store.compact else 'SELECT id FROM snapshots WHERE source=?', (source,)).fetchone():
                continue
            try:
                results['rain-15m'] += ingest(store, fetch(source), source, 'rain-15m')
            except Exception as error:
                # A bad/expired older file must not block newer valid observations.
                store.rollback()
                errors.append({'source': 'rain-15m', 'file': name, 'error': type(error).__name__})
            time.sleep(2)
        latest = store.execute("SELECT MAX(issued_at) AS issued FROM snapshots WHERE kind='rain-15m'").fetchone()['issued']
        if not latest or (datetime.now(timezone.utc) - datetime.fromisoformat(latest)).total_seconds() > 3600:
            raise ValueError('Newest retained rainfall source is more than one hour old.')
        store.status('rain-15m', latest, 'failed' if errors else 'ok',
                     {'newOrChangedObservations': results['rain-15m'], 'errors': errors})
        store.db.commit()
    except Exception as error:
        store.rollback()
        errors.append({'source': 'rain-15m', 'error': type(error).__name__})
        store.status('rain-15m', None, 'failed', {'errorType': type(error).__name__})
        store.db.commit()
    if store.compact:
        water_count,water_errors=collect_water_ftp(store,listing)
        results['water-summary']=water_count
        errors.extend(water_errors)
        return results,errors
    products= list(zip(PRODUCTS, ('rain-3h','rain-1h','water-summary'),strict=True))
    water_issues=[];water_errors=[]
    for product, kind in products:
        source = f'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?{product}.html'
        try:
            changed=ingest(store, fetch(source), source, kind)
            results[kind]=results.get(kind,0)+changed
            latest = store.execute('SELECT MAX(issued_at) AS issued FROM snapshots WHERE kind=?', (kind,)).fetchone()['issued']
            if store.compact:
                latest=store.execute('SELECT issued_at FROM snapshots WHERE source=?',(product,)).fetchone()['issued_at']
                water_issues.append(latest)
            if (datetime.now(timezone.utc) - datetime.fromisoformat(latest)).total_seconds() > 3600:
                raise ValueError('Source bulletin is more than one hour old.')
        except Exception as error:
            store.rollback()
            errors.append({'source': kind, 'product':product, 'error': type(error).__name__})
            if store.compact:water_errors.append(product)
            store.status(kind, None, 'failed', {'errorType': type(error).__name__})
            store.db.commit()
        time.sleep(2)
    if store.compact:
        store.status('water-summary',min(water_issues) if water_issues else None,'failed' if water_errors else 'ok',{'newOrChangedObservations':results.get('water-summary',0),'failedProducts':water_errors})
        store.db.commit()
    return results, errors

def export_csv(store, path, station=None):
    sql = 'SELECT * FROM observations'
    args = ()
    if station:
        sql += ' WHERE station=?'; args = (station,)
    sql += ' ORDER BY end_at, station, metric, duration_seconds'
    with Path(path).open('w', newline='') as output:
        writer = csv.writer(output)
        writer.writerow(['station', 'metric', 'end_utc', 'duration_seconds', 'value', 'unit',
                         'datum', 'quality_code', 'source_kind', 'snapshot_id'])
        for row in store.execute(sql, args):
            writer.writerow([row['station'], row['metric'], row['end_at'], row['duration_seconds'],
                '' if row['value'] is None else row['value'], 'mm' if row['metric']=='rainfall' else 'm',
                row['datum'], row['quality'], row['kind'], row['snapshot_id']])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', default=os.environ.get('DATABASE_URL', 'sqlite:///.cache/history.sqlite'))
    parser.add_argument('--import-files', nargs='+')
    parser.add_argument('--export-csv')
    parser.add_argument('--station', help='Exact archive identity, e.g. bom:540668')
    parser.add_argument('--health', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--retry-cleanup',action='store_true',help='Explicitly retry a paused cleanup once.')
    args = parser.parse_args()
    if os.environ.get('COLLECTOR_REQUIRE_POSTGRES') == '1' and not args.database.startswith(('postgres://', 'postgresql://')):
        parser.error('A persistent PostgreSQL DATABASE_URL is required in this deployment.')
    if not any((args.import_files, args.export_csv, args.health, args.once)):
        parser.error('Choose --once, --import-files, --export-csv or --health.')
    store = Store(args.database, compact=True)
    try:
        if args.health:
            rows = list(store.execute('SELECT * FROM source_status'))
            required = {'rain-15m','water-summary'}
            healthy = required.issubset({r['source'] for r in rows}) and all(
                r['status'] == 'ok' and r['issued_at'] and
                (datetime.now(timezone.utc)-datetime.fromisoformat(r['checked_at'])).total_seconds() < 1800 and
                (datetime.now(timezone.utc)-datetime.fromisoformat(r['issued_at'])).total_seconds() < 3600
                for r in rows if r['source'] in required)
            print('Collector healthy' if healthy else 'Collector stale, failed, or not yet started')
            return 0 if healthy else 1
        if args.import_files:
            count = 0
            for name in args.import_files:
                path = Path(name)
                try:
                    count += ingest(store, path.read_bytes(), str(path), update_status=False)
                except Exception:
                    store.rollback()
                    raise
            print(f'Archived {count} new or changed observations from {len(args.import_files)} captures.')
        if args.once:
            if store.postgres:
                lock = store.execute('SELECT pg_try_advisory_lock(65900) AS acquired').fetchone()
                if not lock['acquired']:
                    print('Another collector is already active.'); return 1
            from compact_history import migrate,reclaim_space,failure_details
            if args.retry_cleanup:
                store.execute('DELETE FROM event_imports WHERE id=?',(CLEANUP_FAILURE,));store.db.commit()
            paused=store.execute('SELECT report FROM event_imports WHERE id=?',(CLEANUP_FAILURE,)).fetchone()
            cleanup_failed=False
            if paused:
                print(json.dumps({'historyCleanup':{'status':'paused','message':'Cleanup paused after an earlier error. Normal reading collection continues.','previous_error':json.loads(paused['report'])}}),flush=True)
            else:
                try:
                    print(json.dumps({'historyCleanup':{'status':'checking','message':'Verifying retained readings before cleanup.'}}),flush=True)
                    print(json.dumps({'historyCleanup':migrate(store)}),flush=True)
                except Exception as error:
                    store.rollback();cleanup_failed=True
                    details=failure_details(error)
                    store.execute('INSERT INTO event_imports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET report=excluded.report',
                        (CLEANUP_FAILURE,now(),json.dumps(details)));store.db.commit()
                    print(json.dumps({'historyCleanup':{'status':'failed',**details,'message':'Cleanup rolled back and paused. Normal reading collection will continue.'}}),flush=True)
                if not cleanup_failed:
                    try:
                        print(json.dumps({'storageCompaction':reclaim_space(store)}),flush=True)
                    except Exception as error:
                        store.rollback()
                        print(json.dumps({'storageCompaction':{'status':'deferred','error':type(error).__name__,'message':'Measurements preserved. Physical compaction will retry next run.'}}),flush=True)
            run = store.start_run()
            results, errors = collect(store)
            if cleanup_failed:errors.append({'source':'history-cleanup','error':'CleanupPaused'})
            store.finish_run(run, 'failed' if errors else 'ok',
                             {'results':results,'errors':errors})
            print(json.dumps({'newOrChangedObservations': results, 'errors': errors}))
            if errors:
                return 1
            # Optional independent dead-man monitor: alert if successful runs stop.
            # Treat the URL as a secret; never include it in logs or exceptions.
            monitor = os.environ.get('COLLECTOR_HEARTBEAT_URL')
            if monitor:
                try:
                    with urllib.request.urlopen(monitor, timeout=15) as response:
                        response.read(1024)
                except Exception:
                    print('Observations saved, but the external heartbeat check-in failed.')
                    return 1
        if args.export_csv:
            export_csv(store, args.export_csv, args.station)
        return 0
    finally:
        store.close()

if __name__ == '__main__':
    sys.exit(main())
