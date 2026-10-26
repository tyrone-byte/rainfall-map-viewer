"""Transactional history cleanup and compact writes; never discard retained measurement history."""
import base64
import gzip
import hashlib
import json
import math
import re
from datetime import datetime,timedelta,timezone

from history_store import now,utc,packed

MIGRATION='history-compact-v1'
KEEP=('rain-15m','water-summary')

def ensure_tables(store):
    store.execute('''CREATE TABLE IF NOT EXISTS feed_receipts (
        source TEXT PRIMARY KEY, checksum TEXT NOT NULL, kind TEXT NOT NULL, issued_at TEXT NOT NULL)''')
    store.execute('''CREATE TABLE IF NOT EXISTS stations (
        station TEXT PRIMARY KEY, name TEXT NOT NULL, station_group TEXT NOT NULL,
        latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, coordinate_source TEXT NOT NULL,
        metadata TEXT NOT NULL)''')
    if store.postgres:
        columns={r['column_name'] for r in store.execute("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='observations'")}
    else:
        columns={r['name'] for r in store.execute('PRAGMA table_info(observations)')}
    if 'received_at' not in columns:
        store.execute("ALTER TABLE observations ADD COLUMN received_at TEXT NOT NULL DEFAULT ''")
    store.db.commit()

def source_key(source,kind):
    # One current source definition per product, not one stored downloaded file.
    product=re.search(r'IDQ\d{5}',source)
    return (product[0] if product else kind),hashlib.sha256(('feed:'+kind+':'+(product[0] if product else kind)).encode()).hexdigest()

def source_receipt(store,raw,source,kind,issued,fetched=None):
    issued=utc(issued);fetched=fetched or now()
    product,identity=source_key(source,kind)
    checksum=hashlib.sha256(raw).hexdigest()
    old=store.execute('SELECT checksum FROM feed_receipts WHERE source=?',(source,)).fetchone()
    fresh=not old or old['checksum']!=checksum
    previous=store.execute('SELECT issued_at FROM snapshots WHERE id=?',(identity,)).fetchone()
    if not previous or issued>=previous['issued_at']:
        store.execute('''INSERT INTO snapshots VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
            issued_at=excluded.issued_at,fetched_at=excluded.fetched_at''',
            (identity,product,kind,issued,fetched,''))
    store.execute('''INSERT INTO feed_receipts VALUES(?,?,?,?) ON CONFLICT(source) DO UPDATE SET
        checksum=excluded.checksum,issued_at=excluded.issued_at''',(source,checksum,kind,issued))
    store.execute('''DELETE FROM feed_receipts WHERE kind=? AND source NOT IN
        (SELECT source FROM feed_receipts WHERE kind=? ORDER BY issued_at DESC,source DESC LIMIT 24)''',(kind,kind))
    return identity,fresh

def save_station(store,station,name='',group='',coordinates=None,metadata=None):
    c=coordinates or {}
    old=store.execute('SELECT * FROM stations WHERE station=?',(station,)).fetchone()
    values=(name or (old['name'] if old else ''),group or (old['station_group'] if old else ''),
        c.get('lat',old['latitude'] if old else None),c.get('lon',old['longitude'] if old else None),
        c.get('source',old['coordinate_source'] if old else ''),packed(metadata or (json.loads(old['metadata']) if old else {})))
    if old and tuple(old[k] for k in ('name','station_group','latitude','longitude','coordinate_source','metadata'))==values:return
    store.execute('''INSERT INTO stations VALUES(?,?,?,?,?,?,?) ON CONFLICT(station) DO UPDATE SET
        name=excluded.name,station_group=excluded.station_group,latitude=excluded.latitude,
        longitude=excluded.longitude,coordinate_source=excluded.coordinate_source,metadata=excluded.metadata''',(station,*values))

def qa_meta(metadata):
    result=dict(metadata or {})
    for key in ('name','group','qualityMeaning'):result.pop(key,None)
    if not result.get('comment'):result.pop('comment',None)
    return result

def save_observation(store,snapshot,station,metric,end,duration,value,kind,issued,datum='',quality='',metadata=None):
    if kind not in KEEP:raise ValueError('Only quarter-hour rainfall and collected water summaries belong in the master history.')
    if (kind=='rain-15m' and (metric!='rainfall' or duration!=900)) or (kind=='water-summary' and (metric!='water-level' or duration!=0)):
        raise ValueError('Unexpected measurement definition.')
    if value is not None and (not isinstance(value,(int,float)) or not math.isfinite(value) or (metric=='rainfall' and value<0)):
        raise ValueError('Invalid measurement value.')
    metadata=dict(metadata or {})
    if metadata.get('estimated'):raise ValueError('New estimates are disabled.')
    end,issued=utc(end),utc(issued)
    identity=hashlib.sha256(packed([station,metric,end,duration,datum,kind]).encode()).hexdigest()
    previous=store.execute('SELECT * FROM observations WHERE station=? AND kind=? AND end_at=? AND datum=?',(station,kind,end,datum)).fetchone() if store.normalised else store.execute('SELECT * FROM observations WHERE id=?',(identity,)).fetchone()
    # Only QA/time-basis metadata is repeated with a measurement.
    metadata=qa_meta(metadata)
    payload=packed({'metadata':metadata})
    if previous:
        previous_meta=json.loads(previous['payload']).get('metadata',{})
        previous_estimated=bool(previous_meta.get('estimated'))
        feed=store.execute('SELECT issued_at FROM snapshots WHERE id=?',(snapshot,)).fetchone()
        boundary=max(utc(previous['issued_at']),feed['issued_at'] if feed else issued)
        if issued<boundary and not previous_estimated:return False
        if previous['value']==value and previous['quality']==quality and previous_meta==metadata:return False
        # Save the old state only when a correction actually occurs, not an initial duplicate.
        old_state=packed({'value':previous['value'],'quality':previous['quality'],
            'issued_at':utc(previous['issued_at']),'metadata':previous_meta})
        revision=hashlib.sha256((identity+old_state).encode()).hexdigest()
        store.execute('INSERT INTO revisions VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
            (revision,previous['id'],previous['snapshot_id'],old_state,now()))
    received=utc(previous['received_at']) if previous and previous['received_at'] else now()
    if store.normalised:
        from normalise_postgres import save
        save(store,snapshot,station,end,value,kind,issued,datum,quality,metadata,received)
        return True
    store.execute('''INSERT INTO observations
        (id,station,metric,end_at,duration_seconds,datum,value,quality,kind,issued_at,snapshot_id,payload,received_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,
        quality=excluded.quality,issued_at=excluded.issued_at,snapshot_id=excluded.snapshot_id,payload=excluded.payload''',
        (identity,station,metric,end,duration,datum,value,quality,kind,issued,snapshot,payload,received))
    return True

def iter_rows(store,sql):
    if store.postgres:
        import uuid
        with store.db.cursor(name='history_'+uuid.uuid4().hex) as cursor:
            cursor.execute(sql)
            yield from cursor
    else:
        yield from store.execute(sql)

def retained_fingerprint(store,original_only=False):
    digest=hashlib.sha256();count=0
    condition=" AND id IN (SELECT id FROM cleanup_original_ids)" if original_only else ""
    for r in iter_rows(store,"SELECT * FROM observations WHERE kind IN ('rain-15m','water-summary')"+condition+" ORDER BY station,kind,end_at,duration_seconds,datum"):
        r=dict(r)
        r['end_at']=utc(r['end_at']);r['issued_at']=utc(r['issued_at'])
        digest.update(packed([r[k] for k in ('station','metric','end_at','duration_seconds','datum','value','quality','kind','issued_at')]+[qa_meta(json.loads(r['payload']).get('metadata',{}))]).encode())
        count+=1
    return {'records':count,'sha256':digest.hexdigest()}

def recover_unextracted_rainfall(store):
    from bom_hcs import parse_hcs
    from collector import register_station
    known={r['id'] for r in iter_rows(store,"SELECT id FROM observations WHERE kind='rain-15m'")}
    known_stations={r['station'] for r in iter_rows(store,"SELECT DISTINCT station FROM observations WHERE kind='rain-15m'")}
    registered=set();count=0
    # Newest source wins for newly recovered observations. Existing readings never change.
    sources=iter_rows(store,"SELECT source,issued_at,fetched_at,raw_gzip_b64 FROM snapshots WHERE kind='rain-15m' AND raw_gzip_b64<>'' ORDER BY issued_at DESC,fetched_at DESC,id DESC")
    for source in sources:
        raw=gzip.decompress(base64.b64decode(source['raw_gzip_b64']))
        data=parse_hcs(raw)
        numeric_stations={'bom:'+o['stationId'] for o in data['observations'] if o['value'] is not None}
        known_stations.update(numeric_stations)
        snapshot,_=source_receipt(store,raw,source['source'],'rain-15m',source['issued_at'],source['fetched_at'])
        for o in data['observations']:
            station='bom:'+o['stationId'];end=utc(o['time'])
            identity=hashlib.sha256(packed([station,'rainfall',end,900,'','rain-15m']).encode()).hexdigest()
            if identity in known or (o['value'] is None and station not in known_stations):continue
            if station not in registered:
                register_station(store,o['stationId']);registered.add(station)
            count+=save_observation(store,snapshot,station,'rainfall',end,900,o['value'],'rain-15m',source['issued_at'],quality=o['quality'],metadata={'comment':o['comment']})
            store.execute('UPDATE observations SET received_at=? WHERE id=?',(source['fetched_at'],identity))
            known.add(identity)
    return count

def migrate(store):
    previous=store.execute('SELECT report FROM event_imports WHERE id=?',(MIGRATION,)).fetchone()
    if previous:return {'status':'already-cleaned'}
    before=retained_fingerprint(store)
    counts={r['kind']:r['n'] for r in store.execute('SELECT kind,COUNT(*) AS n FROM observations GROUP BY kind')}
    unknown=set(counts)-{'rain-15m','water-summary','rain-1h','rain-3h','water-history'}
    if unknown:raise ValueError('Unrecognised measurement series; cleanup stopped without deleting data.')
    raw_bytes=store.execute('SELECT COALESCE(SUM(LENGTH(raw_gzip_b64)),0) AS n FROM snapshots').fetchone()['n']
    # One transaction: any verification failure rolls back every destructive change.
    try:
        store.execute('CREATE TEMP TABLE cleanup_original_ids (id TEXT PRIMARY KEY)')
        store.execute("INSERT INTO cleanup_original_ids SELECT id FROM observations WHERE kind IN ('rain-15m','water-summary')")
        recovered=recover_unextracted_rainfall(store)
        store.execute("DELETE FROM observations WHERE kind NOT IN ('rain-15m','water-summary')")
        store.execute('DELETE FROM revisions WHERE NOT EXISTS (SELECT 1 FROM observations o WHERE o.id=revisions.observation_id)')
        store.execute("""DELETE FROM revisions WHERE id IN (
            SELECT ranked.id FROM (SELECT id,observation_id,payload,
                ROW_NUMBER() OVER (PARTITION BY observation_id ORDER BY archived_at DESC,id DESC) AS position
                FROM revisions) ranked JOIN observations o ON o.id=ranked.observation_id
            WHERE ranked.position=1 AND ranked.payload=o.payload)""")
        correction_rows=list(store.execute('''SELECT r.id,r.payload,s.source,o.kind,s.issued_at,s.fetched_at
            FROM revisions r JOIN observations o ON o.id=r.observation_id LEFT JOIN snapshots s ON s.id=r.snapshot_id'''))
        for correction in correction_rows:
            state=json.loads(correction['payload'])
            state.update(source_issued_at=correction['issued_at'],source_fetched_at=correction['fetched_at'],source_product=source_key(correction['source'] or '',correction['kind'] or '')[0])
            store.execute('UPDATE revisions SET payload=?,snapshot_id=? WHERE id=?',(packed(state),source_key(correction['source'] or '',correction['kind'] or '')[1],correction['id']))
        source_rows=list(store.execute("SELECT DISTINCT s.id,s.source,o.kind,s.issued_at,s.fetched_at FROM snapshots s JOIN observations o ON o.snapshot_id=s.id ORDER BY s.issued_at"))
        for src in source_rows:
            product,key=source_key(src['source'],src['kind'])
            store.execute("UPDATE observations SET snapshot_id=?,received_at=CASE WHEN received_at='' THEN ? ELSE received_at END WHERE snapshot_id=?",(key,src['fetched_at'],src['id']))
            # Only current provenance remains; raw bytes are discarded, not copied.
            store.execute('''INSERT INTO snapshots VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                issued_at=excluded.issued_at,fetched_at=excluded.fetched_at''',(key,product,src['kind'],src['issued_at'],src['fetched_at'],''))
        keys={source_key(src['source'],src['kind'])[1] for src in source_rows}
        for src in list(store.execute('SELECT id FROM snapshots')):
            if src['id'] not in keys:store.execute('DELETE FROM snapshots WHERE id=?',(src['id'],))
        # Strip duplicated scalar columns from JSON; retain all original QA metadata.
        batch=[]
        for row in iter_rows(store,'SELECT id,station,payload FROM observations'):
            meta=json.loads(row['payload']).get('metadata',{})
            if meta.get('name') or meta.get('group'):save_station(store,row['station'],meta.get('name',''),meta.get('group',''))
            batch.append((packed({'metadata':qa_meta(meta)}),row['id']))
            if len(batch)==1000:
                for payload,identity in batch:store.execute('UPDATE observations SET payload=? WHERE id=?',(payload,identity))
                batch=[]
        for payload,identity in batch:store.execute('UPDATE observations SET payload=? WHERE id=?',(payload,identity))
        from collector import register_station
        for row in iter_rows(store,'SELECT DISTINCT station FROM observations'):
            if row['station'].startswith('bom:'):register_station(store,row['station'].removeprefix('bom:'))
        after=retained_fingerprint(store,original_only=True)
        if before!=after:raise ValueError('Retained observation verification failed; cleanup cancelled.')
        store.execute("DELETE FROM source_status WHERE source IN ('rain-1h','rain-3h','water-history')")
        verified_before=retained_fingerprint(store)
        from normalise_postgres import normalise,finish
        normalise(store)
        store.normalised=store.postgres
        if retained_fingerprint(store)!=verified_before:raise ValueError('Typed reading conversion changed retained data.')
        finish(store)
        report={'original_verified':after,'recovered_statewide_readings':recovered,'retained':retained_fingerprint(store),'removed_by_kind':{k:n for k,n in counts.items() if k not in KEEP},'discarded_source_bytes':raw_bytes}
        store.execute('INSERT INTO event_imports VALUES(?,?,?)',(MIGRATION,now(),packed(report)))
        store.execute('DROP TABLE cleanup_original_ids')
        store.db.commit()
        return {'status':'cleaned',**report}
    except Exception:
        store.rollback();store.normalised=False;raise

def reclaim_space(store):
    """One-off physical compaction; PostgreSQL may briefly lock each table."""
    store.execute('DELETE FROM runs WHERE started_at<?',((datetime.now(timezone.utc)-timedelta(days=30)).isoformat(),))
    store.db.commit()
    receipt=store.execute("SELECT id FROM event_imports WHERE id='history-vacuum-v1'").fetchone()
    store.db.commit()
    if receipt:return {'status':'already-compacted'}
    if store.postgres:
        store.db.autocommit=True
        try:
            store.execute("SET lock_timeout='5s'");store.execute("SET statement_timeout='180s'")
            before=store.execute('SELECT pg_database_size(current_database()) AS n').fetchone()['n']
            for table in ('snapshots','revisions','history_readings' if store.normalised else 'observations'):
                store.execute('VACUUM (FULL, ANALYZE) '+table)
            after=store.execute('SELECT pg_database_size(current_database()) AS n').fetchone()['n']
        finally:
            store.execute("RESET lock_timeout");store.execute("RESET statement_timeout");store.db.autocommit=False
    else:
        before=store.execute('PRAGMA page_count').fetchone()[0]*store.execute('PRAGMA page_size').fetchone()[0]
        store.execute('VACUUM')
        after=store.execute('PRAGMA page_count').fetchone()[0]*store.execute('PRAGMA page_size').fetchone()[0]
    report={'status':'compacted','database_bytes_before':before,'database_bytes_after':after}
    store.execute('INSERT INTO event_imports VALUES(?,?,?)',('history-vacuum-v1',now(),packed(report)));store.db.commit()
    return report
