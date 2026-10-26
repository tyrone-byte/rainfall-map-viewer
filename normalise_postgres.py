"""Compact typed PostgreSQL readings, with a compatibility view for existing readers."""
import json
from history_store import utc

def active(store):
    return store.postgres and bool(store.execute("SELECT to_regclass('history_readings') AS relation").fetchone()['relation'])

def normalise(store,progress=lambda *args,**kwargs:None):
    if not store.postgres or active(store):return
    store.execute('''CREATE TABLE history_gauges (id SERIAL PRIMARY KEY, station TEXT UNIQUE NOT NULL)''')
    store.execute('''CREATE TABLE history_datums (id SMALLSERIAL PRIMARY KEY, datum TEXT UNIQUE NOT NULL)''')
    store.execute('''CREATE TABLE history_feeds (id SMALLSERIAL PRIMARY KEY, snapshot_id TEXT UNIQUE NOT NULL)''')
    store.execute('''CREATE TABLE history_kinds (id SMALLINT PRIMARY KEY, kind TEXT UNIQUE NOT NULL,
        metric TEXT NOT NULL,duration_seconds SMALLINT NOT NULL)''')
    store.execute("INSERT INTO history_kinds VALUES (1,'rain-15m','rainfall',900),(2,'water-summary','water-level',0)")
    store.execute('INSERT INTO history_gauges(station) SELECT DISTINCT station FROM observations ORDER BY station')
    store.execute('INSERT INTO history_datums(datum) SELECT DISTINCT datum FROM observations ORDER BY datum')
    store.execute('INSERT INTO history_feeds(snapshot_id) SELECT DISTINCT m.target_id FROM observations o JOIN cleanup_sources m ON m.source_id=o.snapshot_id AND m.kind=o.kind ORDER BY m.target_id')
    store.execute('''CREATE TABLE history_readings (
        id BIGSERIAL PRIMARY KEY, gauge_id INTEGER NOT NULL, kind_id SMALLINT NOT NULL,
        end_at TIMESTAMPTZ NOT NULL, datum_id SMALLINT NOT NULL, value DOUBLE PRECISION,
        quality TEXT, issued_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL,
        feed_id SMALLINT NOT NULL, qa_metadata TEXT NOT NULL,
        UNIQUE(gauge_id,kind_id,end_at,datum_id))''')
    progress('copying_readings_into_compact_tables')
    total=store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n']
    after='';copied=0
    while True:
        bounds=list(store.execute('SELECT id FROM observations WHERE id>? ORDER BY id LIMIT 5000',(after,)))
        if not bounds:break
        upper=bounds[-1]['id']
        store.execute("""INSERT INTO history_readings(gauge_id,kind_id,end_at,datum_id,value,quality,issued_at,received_at,feed_id,qa_metadata)
            SELECT g.id,k.id,o.end_at::timestamptz,d.id,o.value,o.quality,o.issued_at::timestamptz,
                COALESCE(NULLIF(o.received_at,''),m.fetched_at,o.issued_at)::timestamptz,f.id,
                (CASE WHEN COALESCE(o.payload::jsonb->'metadata'->>'comment','')=''
                    THEN COALESCE(o.payload::jsonb->'metadata','{}'::jsonb)-'name'-'group'-'qualityMeaning'-'comment'
                    ELSE COALESCE(o.payload::jsonb->'metadata','{}'::jsonb)-'name'-'group'-'qualityMeaning' END)::text
            FROM observations o JOIN cleanup_sources m ON m.source_id=o.snapshot_id AND m.kind=o.kind
            JOIN history_gauges g ON g.station=o.station
            JOIN history_kinds k ON k.kind=o.kind JOIN history_datums d ON d.datum=o.datum
            JOIN history_feeds f ON f.snapshot_id=m.target_id WHERE o.id>? AND o.id<=? ORDER BY o.id""",(after,upper))
        copied+=len(bounds);after=upper
        progress('copying_readings_into_compact_tables',rows_done=copied,rows_total=total)
    progress('validating_compact_references')
    store.execute('''ALTER TABLE history_readings
        ADD CONSTRAINT history_gauge_ref FOREIGN KEY(gauge_id) REFERENCES history_gauges(id),
        ADD CONSTRAINT history_kind_ref FOREIGN KEY(kind_id) REFERENCES history_kinds(id),
        ADD CONSTRAINT history_datum_ref FOREIGN KEY(datum_id) REFERENCES history_datums(id),
        ADD CONSTRAINT history_feed_ref FOREIGN KEY(feed_id) REFERENCES history_feeds(id)''')
    progress('indexing_compact_readings')
    store.execute('CREATE INDEX history_period_lookup ON history_readings(kind_id,end_at,gauge_id)')
    progress('relinking_correction_history')
    # Retain correction linkage after replacing large hash keys with numeric row IDs.
    store.execute('''UPDATE revisions rev SET observation_id=r.id::text FROM observations o
        JOIN history_gauges g ON g.station=o.station JOIN history_kinds k ON k.kind=o.kind
        JOIN history_datums d ON d.datum=o.datum
        JOIN history_readings r ON r.gauge_id=g.id AND r.kind_id=k.id AND r.datum_id=d.id AND r.end_at=o.end_at::timestamptz
        WHERE rev.observation_id=o.id''')
    progress('activating_compact_history')
    store.execute('ALTER TABLE observations RENAME TO history_legacy_readings')
    store.execute('''CREATE VIEW observations AS SELECT r.id::text AS id,g.station,k.metric,
        r.end_at,k.duration_seconds,d.datum,r.value,r.quality,k.kind,r.issued_at,f.snapshot_id,
        jsonb_build_object('metadata',r.qa_metadata::jsonb)::text AS payload,r.received_at
        FROM history_readings r JOIN history_gauges g ON g.id=r.gauge_id
        JOIN history_kinds k ON k.id=r.kind_id JOIN history_datums d ON d.id=r.datum_id
        JOIN history_feeds f ON f.id=r.feed_id''')

def finish(store):
    if store.postgres:
        store.execute('DROP TABLE IF EXISTS history_legacy_readings')
        store.execute('DELETE FROM snapshots WHERE id NOT IN (SELECT snapshot_id FROM observations UNION SELECT snapshot_id FROM revisions)')
        store.execute('DROP TABLE IF EXISTS cleanup_sources')

def dimension(store,table,column,value):
    cache=getattr(store,'_dimension_cache',None)
    if cache is None:store._dimension_cache={};cache=store._dimension_cache
    key=(table,value)
    if key not in cache:
        # table/column names are constants supplied only by this module.
        row=store.execute(f'SELECT id FROM {table} WHERE {column}=?',(value,)).fetchone()
        if not row:
            row=store.execute(f'INSERT INTO {table}({column}) VALUES(?) ON CONFLICT({column}) DO UPDATE SET {column}=excluded.{column} RETURNING id',(value,)).fetchone()
        cache[key]=row['id']
    return cache[key]

def save(store,snapshot,station,end,value,kind,issued,datum,quality,metadata,received):
    gauge=dimension(store,'history_gauges','station',station)
    reference=dimension(store,'history_datums','datum',datum)
    feed=dimension(store,'history_feeds','snapshot_id',snapshot)
    store.execute('''INSERT INTO history_readings(gauge_id,kind_id,end_at,datum_id,value,quality,issued_at,received_at,feed_id,qa_metadata)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(gauge_id,kind_id,end_at,datum_id) DO UPDATE SET
        value=excluded.value,quality=excluded.quality,issued_at=excluded.issued_at,feed_id=excluded.feed_id,qa_metadata=excluded.qa_metadata''',
        (gauge,1 if kind=='rain-15m' else 2,end,reference,value,quality,issued,received,feed,
         json.dumps(metadata,separators=(',',':'),sort_keys=True)))
