import base64
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import collector
from collector import ingest
from event_recovery import recover_event, seal, unpack
from history_store import Store
from rainfall import parse, SOURCE

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'package.json'
        self.key=os.urandom(32)
        self.encoded=base64.b64encode(self.key).decode()
        raw=Path('tests/fixtures/bulletin.html').read_bytes()
        data=parse(raw.decode())
        self.last=data['periods'][-1]['end']
        capture={'raw':base64.b64encode(raw).decode(),'source':SOURCE,'kind':'rain-3h',
            'sha256':hashlib.sha256(raw).hexdigest(),'issuedAt':data['issuedAt'],
            'fetchedAt':'2026-10-22T00:00:00+00:00'}
        self.payload={'schemaVersion':1,'captures':[capture]}
        self.path.write_text(json.dumps(seal(self.payload,self.key)))
        self.store=Store(':memory:')

    def tearDown(self):
        self.store.close();self.temp.cleanup()

    def test_recovery_is_idempotent_and_does_not_refresh_source_health(self):
        self.store.status('rain-3h','2026-10-22T06:00:00+00:00','ok',{'live':True})
        self.store.db.commit()
        before=dict(self.store.execute('SELECT * FROM source_status').fetchone())
        result=recover_event(self.store,ingest,self.path,self.encoded)
        self.assertEqual(result['status'],'imported')
        self.assertEqual(result['captures'],1)
        self.assertEqual(result['newOrChangedObservations'],321*8)
        self.assertEqual(sum(row['records'] for row in result['storedCoverage']),321*8)
        self.assertEqual(dict(self.store.execute('SELECT * FROM source_status').fetchone()),before)
        second=recover_event(self.store,ingest,self.path,self.encoded)
        self.assertEqual(second['status'],'already-imported')
        self.assertEqual(second['newOrChangedObservations'],0)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM event_imports').fetchone()['n'],1)

    def test_historical_capture_cannot_replace_a_newer_source_revision(self):
        sid,_=self.store.snapshot(b'newer test-only source',SOURCE,'rain-3h','2026-10-22T06:00:00+00:00')
        self.store.observation(sid,'bom:540668','rainfall',self.last,10800,99,
            'rain-3h','2026-10-22T06:00:00+00:00')
        self.store.db.commit()
        recover_event(self.store,ingest,self.path,self.encoded)
        row=self.store.execute("SELECT value FROM observations WHERE station='bom:540668' AND end_at=?",
                               ('2026-10-21T20:00:00+00:00',)).fetchone()
        self.assertEqual(row['value'],99)

    def test_wrong_key_modified_package_and_invalid_source_never_import(self):
        with self.assertRaises(Exception):
            recover_event(self.store,ingest,self.path,base64.b64encode(os.urandom(32)).decode())
        envelope=json.loads(self.path.read_text())
        encrypted=bytearray(base64.b64decode(envelope['encrypted']));encrypted[10]^=1
        envelope['encrypted']=base64.b64encode(encrypted).decode();self.path.write_text(json.dumps(envelope))
        with self.assertRaises(Exception):recover_event(self.store,ingest,self.path,self.encoded)
        original_hash=self.payload['captures'][0]['sha256']
        self.payload['captures'][0]['sha256']='0'*64
        with self.assertRaises(ValueError):
            unpack(json.dumps(seal(self.payload,self.key)).encode(),self.key)
        self.payload['captures'][0]['sha256']=original_hash
        self.payload['captures'][0]['source']='https://untrusted.example/data'
        with self.assertRaises(ValueError):
            unpack(json.dumps(seal(self.payload,self.key)).encode(),self.key)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],0)

    def test_obsolete_event_key_does_not_reactivate_imports_in_compact_collector(self):
        database=Path(self.temp.name)/'collector.sqlite'
        def collect(store):
            store.status('rain-15m','2026-10-22T06:00:00+00:00','ok',{'test':True})
            store.db.commit()
            return {},[]
        with patch.dict(os.environ,{'EVENT_IMPORT_KEY':'private test key'}), \
             patch('sys.argv',['collector.py','--database',str(database),'--once']), \
             patch('event_recovery.recover_event',side_effect=ValueError('invalid key')) as old_import, \
             patch('collector.collect',side_effect=collect) as live,patch('builtins.print') as output:
            self.assertEqual(collector.main(),0)
            live.assert_called_once();old_import.assert_not_called()
            self.assertNotIn('private test key',str(output.call_args_list))
        store=Store(str(database))
        try:
            self.assertEqual(store.execute('SELECT status FROM source_status').fetchone()['status'],'ok')
            self.assertEqual(store.execute('SELECT status FROM runs').fetchone()['status'],'ok')
        finally:store.close()

if __name__=='__main__':unittest.main()
