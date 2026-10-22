"""Import an authenticated, encrypted event package inside the collector.

Only a fixed repository-local package is accepted. Database credentials never
leave Render. The separately supplied key is not part of the repository.
"""
import base64
import gzip
import hashlib
import io
import json
import os
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from history_store import now

ROOT = Path(__file__).resolve().parent
PACKAGE = ROOT/'data/event-recovery/2026-10-22.json'
CONTEXT = b'rainfall-map-viewer:event-recovery:v1'
MAX_UNPACKED = 24_000_000
KINDS = {'rain-15m', 'rain-1h', 'rain-3h', 'water-summary', 'water-history'}

def seal(payload, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    nonce = os.urandom(12)
    packed = gzip.compress(json.dumps(payload, separators=(',', ':')).encode(), mtime=0)
    encrypted = AESGCM(key).encrypt(nonce, packed, CONTEXT)
    return {'schemaVersion': 1, 'nonce': base64.b64encode(nonce).decode(),
            'encrypted': base64.b64encode(encrypted).decode()}

def unpack(raw, key):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if len(raw) > 5_000_000:
        raise ValueError('Recovery package exceeds its size limit.')
    envelope = json.loads(raw)
    if envelope.get('schemaVersion') != 1:
        raise ValueError('Unsupported recovery package.')
    nonce = base64.b64decode(envelope['nonce'], validate=True)
    encrypted = base64.b64decode(envelope['encrypted'], validate=True)
    packed = AESGCM(key).decrypt(nonce, encrypted, CONTEXT)
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as stream:
        decoded = stream.read(MAX_UNPACKED+1)
    if len(decoded) > MAX_UNPACKED:
        raise ValueError('Unpacked recovery package exceeds its size limit.')
    payload = json.loads(decoded)
    if payload.get('schemaVersion') != 1 or not 1 <= len(payload.get('captures', [])) <= 32:
        raise ValueError('Invalid recovery capture list.')
    captures = []
    for capture in payload['captures']:
        data = base64.b64decode(capture['raw'], validate=True)
        if hashlib.sha256(data).hexdigest() != capture['sha256']:
            raise ValueError('Recovery source checksum failed.')
        url = urlsplit(capture['source'])
        if url.hostname not in {'reg.bom.gov.au', 'www.bom.gov.au', 'ftp.bom.gov.au'} or url.scheme not in {'https','ftp'} or url.username or url.password:
            raise ValueError('Unexpected recovery source provenance.')
        if capture['kind'] not in KINDS:
            raise ValueError('Unsupported recovery source kind.')
        for field in ['issuedAt', 'fetchedAt']:
            if datetime.fromisoformat(capture[field]).utcoffset() is None:
                raise ValueError('Recovery timestamps require a timezone.')
        captures.append({**capture, 'data': data})
    return sorted(captures, key=lambda c:datetime.fromisoformat(c['issuedAt']))

def recover_event(store, ingest, package=None, encoded_key=None):
    path = Path(package) if package else PACKAGE
    raw = path.read_bytes()
    identity = hashlib.sha256(raw).hexdigest()
    previous = store.execute('SELECT report FROM event_imports WHERE id=?', (identity,)).fetchone()
    if previous:
        return {'status': 'already-imported', 'package': identity,
                'newOrChangedObservations': 0, 'originalImport': json.loads(previous['report'])}
    key = base64.b64decode(encoded_key or os.environ['EVENT_IMPORT_KEY'], validate=True)
    if len(key) != 32:
        raise ValueError('Invalid recovery key length.')
    captures = unpack(raw, key)
    counts = {}
    for capture in captures:
        count = ingest(store, capture['data'], capture['source'], capture['kind'],
                       update_status=False, fetched_at=capture['fetchedAt'])
        counts[capture['kind']] = counts.get(capture['kind'], 0) + count
    report = {'status': 'imported', 'package': identity, 'captures': len(captures),
              'newOrChangedObservations': sum(counts.values()), 'bySource': counts}
    store.execute('INSERT INTO event_imports VALUES(?,?,?)', (identity, now(), json.dumps(report)))
    store.db.commit()
    return report
