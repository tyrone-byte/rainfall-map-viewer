"""Private observation archive: SQLite for development, PostgreSQL for deployment.

Native periods are separate series. Source snapshots and changed observations are
retained; imports are repeatable and older captures cannot replace newer revisions.
"""
import base64
import gzip
import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

def now():
    return datetime.now(timezone.utc).isoformat()

def utc(value):
    date = value if isinstance(value,datetime) else datetime.fromisoformat(value.replace('Z', '+00:00'))
    if date.utcoffset() is None:
        raise ValueError('An explicit observation timezone is required.')
    return date.astimezone(timezone.utc).isoformat()

def packed(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)

class Store:
    def __init__(self, url, compact=False):
        self.postgres = url.startswith(('postgres://', 'postgresql://'))
        if self.postgres:
            import psycopg
            from psycopg.rows import dict_row
            self.db = psycopg.connect(url, row_factory=dict_row, connect_timeout=15)
        else:
            path = url.removeprefix('sqlite:///')
            if path != ':memory:':
                Path(path).parent.mkdir(parents=True, exist_ok=True)
            self.db = sqlite3.connect(path)
            self.db.row_factory = sqlite3.Row
        normalised=self.postgres and bool(self.db.execute("SELECT to_regclass('history_readings') AS relation").fetchone()['relation'])
        for sql in (
            '''CREATE TABLE IF NOT EXISTS snapshots (
                id TEXT PRIMARY KEY, source TEXT NOT NULL, kind TEXT NOT NULL,
                issued_at TEXT NOT NULL, fetched_at TEXT NOT NULL, raw_gzip_b64 TEXT NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS observations (
                id TEXT PRIMARY KEY, station TEXT NOT NULL, metric TEXT NOT NULL,
                end_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL, datum TEXT NOT NULL,
                value DOUBLE PRECISION, quality TEXT, kind TEXT NOT NULL, issued_at TEXT NOT NULL,
                snapshot_id TEXT NOT NULL, payload TEXT NOT NULL)''',
            '''CREATE INDEX IF NOT EXISTS observation_lookup ON observations(station, metric, end_at)''',
            '''CREATE TABLE IF NOT EXISTS revisions (
                id TEXT PRIMARY KEY, observation_id TEXT NOT NULL, snapshot_id TEXT NOT NULL,
                payload TEXT NOT NULL, archived_at TEXT NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS runs (
                id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
                status TEXT NOT NULL, details TEXT NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS source_status (
                source TEXT PRIMARY KEY, checked_at TEXT NOT NULL, issued_at TEXT,
                status TEXT NOT NULL, details TEXT NOT NULL)''',
            '''CREATE TABLE IF NOT EXISTS event_imports (
                id TEXT PRIMARY KEY, completed_at TEXT NOT NULL, report TEXT NOT NULL)''',
        ):
            if normalised and ('CREATE TABLE IF NOT EXISTS observations' in sql or 'CREATE INDEX IF NOT EXISTS observation_lookup' in sql):continue
            self.execute(sql)
        self.db.commit()
        self.normalised=normalised
        self.compact = compact or bool(self.execute("SELECT id FROM event_imports WHERE id='history-compact-v1'").fetchone())
        if self.compact:
            from compact_history import ensure_tables
            ensure_tables(self)

    def execute(self, sql, args=()):
        return self.db.execute(sql.replace('?', '%s') if self.postgres else sql, args)

    def snapshot(self, raw, source, kind, issued_at, fetched_at=None):
        if self.compact:
            from compact_history import source_receipt
            return source_receipt(self, raw, source, kind, issued_at, fetched_at)
        identity = hashlib.sha256(kind.encode() + b'\0' + raw).hexdigest()
        if self.execute('SELECT id FROM snapshots WHERE id=?', (identity,)).fetchone():
            return identity, False
        self.execute('INSERT INTO snapshots VALUES(?,?,?,?,?,?)',
                     (identity, source, kind, utc(issued_at), fetched_at or now(),
                      base64.b64encode(gzip.compress(raw, mtime=0)).decode()))
        return identity, True

    def observation(self, snapshot, station, metric, end, duration, value,
                    kind, issued, datum='', quality='', metadata=None):
        if self.compact:
            from compact_history import save_observation
            return save_observation(self, snapshot, station, metric, end, duration, value, kind, issued, datum, quality, metadata)
        end, issued = utc(end), utc(issued)
        # Feed kind distinguishes inferred summary times from exact history times.
        identity = hashlib.sha256(packed([station, metric, end, duration, datum, kind]).encode()).hexdigest()
        payload = packed({'station': station, 'metric': metric, 'end': end,
                          'durationSeconds': duration, 'datum': datum, 'value': value,
                          'quality': quality, 'sourceKind': kind, 'metadata': metadata or {}})
        previous = self.execute('SELECT payload, issued_at FROM observations WHERE id=?', (identity,)).fetchone()
        if previous:
            previous_estimated = json.loads(previous['payload']).get('metadata', {}).get('estimated', False)
            incoming_estimated = bool((metadata or {}).get('estimated'))
            if incoming_estimated and not previous_estimated:
                return False
            if previous['issued_at'] > issued and not (previous_estimated and not incoming_estimated):
                return False
            if previous['payload'] == payload:
                # Even an unchanged value establishes a newer revision boundary.
                self.execute('UPDATE observations SET issued_at=?, snapshot_id=? WHERE id=?',
                             (issued, snapshot, identity))
                return False
        revision = hashlib.sha256((identity + snapshot + payload).encode()).hexdigest()
        self.execute('INSERT INTO revisions VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
                     (revision, identity, snapshot, payload, now()))
        self.execute('''INSERT INTO observations (id,station,metric,end_at,duration_seconds,datum,value,quality,kind,issued_at,snapshot_id,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET value=excluded.value, quality=excluded.quality,
            issued_at=excluded.issued_at, snapshot_id=excluded.snapshot_id, payload=excluded.payload''',
            (identity, station, metric, end, duration, datum, value, quality, kind, issued, snapshot, payload))
        return True

    def status(self, source, issued, status, details):
        self.execute('''INSERT INTO source_status VALUES(?,?,?,?,?) ON CONFLICT(source)
            DO UPDATE SET checked_at=excluded.checked_at, issued_at=excluded.issued_at,
            status=excluded.status, details=excluded.details''',
            (source, now(), utc(issued) if issued else None, status, packed(details)))

    def start_run(self):
        identity = str(uuid.uuid4())
        self.execute('INSERT INTO runs VALUES(?,?,?,?,?)', (identity, now(), None, 'running', '{}'))
        self.db.commit()
        return identity

    def finish_run(self, identity, status, details):
        self.execute('UPDATE runs SET finished_at=?, status=?, details=? WHERE id=?',
                     (now(), status, packed(details), identity))
        self.db.commit()

    def rollback(self):
        self.db.rollback()
        self._dimension_cache={}

    def close(self):
        self.db.close()
