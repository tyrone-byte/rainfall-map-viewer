import hashlib
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime,timedelta,timezone

from history_store import Store
from compact_history import migrate,reclaim_space,retained_fingerprint
from collector import ingest,collect
import archive_service as api
from tools.export_archive import export_archive

class CompactHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'history.sqlite'
        self.store=Store(str(self.path))
    def tearDown(self):
        self.store.close();self.temp.cleanup();api.CACHE.clear()
    def enable(self):
        self.store.close();self.store=Store(str(self.path),compact=True)
    def seed(self):
        issued='2026-10-22T01:00:00+00:00'
        from test_bom_hcs import HEADER,ROWS
        raw=b'# HEADER: File Generation Date: '+issued.encode()+b'\n'+HEADER.replace(b'Records: 2',b'Records: 1')+ROWS.splitlines(keepends=True)[0].replace(b'040004',b'540668').replace(b'00:00:00Z',b'01:00:00Z')
        rain,_=self.store.snapshot(raw,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_20261022010000.hcs','rain-15m',issued)
        self.store.observation(rain,'bom:540668','rainfall',issued,900,0,'rain-15m',issued,quality='3',metadata={'comment':'QA note','qualityMeaning':'Not yet verified'})
        water,_=self.store.snapshot(b'old water raw'*1000,'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60286.html','water-summary',issued)
        self.store.observation(water,'bom:540111','water-level',issued,0,-0.2,'water-summary',issued,datum='AHD',metadata={'name':'Mitchelton','group':'Ipswich','timeBasis':'Inferred'})
        for kind,duration in [('rain-1h',3600),('rain-3h',10800),('water-history',0)]:
            self.store.observation(rain,'bom:540668','rainfall',issued,duration,99,kind,issued)
        self.store.db.commit()
    def test_transactional_cleanup_preserves_values_qa_registry_and_reader(self):
        self.seed();before=retained_fingerprint(self.store);self.enable()
        report=migrate(self.store)
        self.assertEqual(before,retained_fingerprint(self.store));self.assertEqual(report['retained']['records'],2)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM revisions').fetchone()['n'],0)
        self.assertEqual(self.store.execute('SELECT SUM(LENGTH(raw_gzip_b64)) AS n FROM snapshots').fetchone()['n'],0)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM snapshots').fetchone()['n'],2)
        self.assertEqual(migrate(self.store)['status'],'already-cleaned')
        self.assertTrue(self.store.execute("SELECT latitude FROM stations WHERE station='bom:540668'").fetchone()['latitude'])
        with patch.dict('os.environ',{'HISTORY_DATABASE_URL':'sqlite:///'+str(self.path)}):
            status=api.archive_status()
            row=next(r for r in status['rows'] if r['kind']=='water-summary')
            self.assertEqual(json.loads(row['payload'])['metadata']['name'],'Mitchelton')
        self.assertEqual(export_archive('sqlite:///'+str(self.path),'2026-10',Path(self.temp.name)/'sample.zip')['observation_records'],2)
        self.assertEqual(reclaim_space(self.store)['status'],'compacted')
        self.assertEqual(reclaim_space(self.store)['status'],'already-compacted')
    def test_existing_one_off_estimates_keep_their_parent_source_provenance(self):
        issue='2026-10-22T01:00:00+00:00'
        source,_=self.store.snapshot(b'original coarse event','https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60348.html','rain-3h',issue)
        self.store.observation(source,'bom:540668','rainfall',issue,900,2,'rain-15m',issue,quality='ESTIMATED_UNIFORM_3H',metadata={'estimated':True,'parentDepth':24})
        self.store.db.commit();self.enable();migrate(self.store)
        row=self.store.execute('SELECT o.received_at,s.source FROM observations o JOIN snapshots s ON s.id=o.snapshot_id').fetchone()
        self.assertTrue(row['received_at']);self.assertEqual(row['source'],'IDQ60348')
        self.assertEqual(json.loads(self.store.execute('SELECT payload FROM observations').fetchone()['payload'])['metadata']['parentDepth'],24)

    def test_recover_unextracted_statewide_readings_before_discarding_sources(self):
        from test_bom_hcs import HEADER,ROWS
        issue='2026-10-22T01:00:00+00:00'
        raw=b'# HEADER: File Generation Date: '+issue.encode()+b'\n'+HEADER.replace(b'Records: 2',b'Records: 3')+ROWS+ROWS.splitlines(keepends=True)[0].replace(b'040004',b'540668')
        snapshot,_=self.store.snapshot(raw,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_test.hcs','rain-15m',issue,fetched_at=issue)
        self.store.observation(snapshot,'bom:540668','rainfall','2026-10-22T00:00:00Z',900,7,'rain-15m',issue,quality='3')
        self.store.db.commit();self.enable();report=migrate(self.store)
        self.assertEqual(report['recovered_statewide_readings'],2)
        self.assertEqual(report['retained']['records'],3)
        self.assertEqual(self.store.execute("SELECT value FROM observations WHERE station='bom:540668'").fetchone()['value'],7)
        rows=list(self.store.execute("SELECT value,received_at FROM observations WHERE station='bom:040004' ORDER BY end_at"))
        self.assertEqual([r['value'] for r in rows],[0,None])
        self.assertTrue(all(r['received_at']==issue for r in rows))
        self.assertEqual(self.store.execute('SELECT SUM(LENGTH(raw_gzip_b64)) AS n FROM snapshots').fetchone()['n'],0)

    def test_cleanup_keeps_a_correction_that_later_returns_to_the_original_value(self):
        from test_bom_hcs import HEADER,ROWS
        for i,value in enumerate((1,2,1),1):
            issue=f'2026-10-22T0{i}:00:00+00:00'
            raw=b'# HEADER: File Generation Date: '+issue.encode()+b'\n'+HEADER+ROWS.replace(b'040004',b'540668')
            snap,_=self.store.snapshot(raw,f'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_{i}.hcs','rain-15m',issue)
            self.store.observation(snap,'bom:540668','rainfall','2026-10-22T00:00:00Z',900,value,'rain-15m',issue)
        self.store.db.commit();self.enable();migrate(self.store)
        states=[json.loads(r['payload'])['value'] for r in self.store.execute('SELECT payload FROM revisions ORDER BY archived_at')]
        self.assertEqual(states,[1,2])

    def test_cleanup_failure_pauses_retries_but_new_readings_keep_collecting(self):
        import collector
        class QueryCanceled(Exception):sqlstate='57014'
        database=Path(self.temp.name)/'paused.sqlite'
        def current_readings(store):
            issued='2026-10-26T01:00:00+00:00'
            snap,_=store.snapshot(b'fixture live values','ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_live.hcs','rain-15m',issued)
            changed=store.observation(snap,'bom:540668','rainfall',issued,900,2,'rain-15m',issued)
            store.db.commit();return {'rain-15m':int(changed)},[]
        args=['collector.py','--database',str(database),'--once']
        with patch('sys.argv',args),patch('compact_history.migrate',side_effect=QueryCanceled('do not log private connection data')) as cleanup,patch('collector.collect',side_effect=current_readings),patch('builtins.print') as output:
            self.assertEqual(collector.main(),1)
            self.assertEqual(collector.main(),0)
            cleanup.assert_called_once()
            text=str(output.call_args_list)
            self.assertIn('57014',text);self.assertIn('paused',text)
            self.assertNotIn('private connection data',text)
        verify=Store(str(database))
        self.assertEqual(verify.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],1)
        verify.close()

    def test_paused_cleanup_does_not_turn_old_description_fields_into_corrections(self):
        self.seed();self.enable()
        source,_=self.store.snapshot(b'current rain','ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_current.hcs','rain-15m','2026-10-22T02:00:00Z')
        before=self.store.execute('SELECT COUNT(*) AS n FROM revisions').fetchone()['n']
        self.assertFalse(self.store.observation(source,'bom:540668','rainfall','2026-10-22T01:00:00Z',900,0,'rain-15m','2026-10-22T02:00:00Z',quality='3',metadata={'comment':'QA note'}))
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM revisions').fetchone()['n'],before)

    def test_streamed_fingerprint_is_order_independent_and_detects_value_and_qa_changes(self):
        import compact_history
        self.seed();original=retained_fingerprint(self.store)
        iterator=compact_history.iter_rows
        with patch('compact_history.iter_rows',side_effect=lambda store,sql:reversed(list(iterator(store,sql)))):
            self.assertEqual(retained_fingerprint(self.store),original)
        self.store.execute("UPDATE observations SET value=1 WHERE kind='rain-15m'")
        changed=retained_fingerprint(self.store)
        self.assertNotEqual(changed['sha256'],original['sha256'])
        self.store.execute("UPDATE observations SET quality='9' WHERE kind='rain-15m'")
        self.assertNotEqual(retained_fingerprint(self.store)['sha256'],changed['sha256'])

    def test_failed_verification_rolls_back_cleanup(self):
        self.seed();self.enable();before=retained_fingerprint(self.store)
        with patch('compact_history.retained_fingerprint',side_effect=[before,{'records':999,'sha256':'invalid'}]):
            with self.assertRaises(ValueError):migrate(self.store)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],5)
        self.assertGreater(self.store.execute('SELECT SUM(LENGTH(raw_gzip_b64)) AS n FROM snapshots').fetchone()['n'],0)
        self.assertIsNone(self.store.execute("SELECT id FROM event_imports WHERE id='history-compact-v1'").fetchone())
    def test_unchanged_observations_do_not_rewrite_and_corrections_are_retained(self):
        self.enable();migrate(self.store)
        def observation(raw,value,issue):
            source,_=self.store.snapshot(raw,b'url'.decode(),'rain-15m',issue)
            before=self.store.db.total_changes
            changed=self.store.observation(source,'bom:540668','rainfall','2026-10-22T00:00:00Z',900,value,'rain-15m',issue,quality='3')
            return changed,self.store.db.total_changes-before
        self.assertTrue(observation(b'a',2,'2026-10-22T00:01:00Z')[0])
        self.assertTrue(observation(b'b',3,'2026-10-22T00:02:00Z')[0])
        self.assertEqual(observation(b'c',3,'2026-10-22T00:04:00Z'),(False,0))
        self.assertEqual(observation(b'd',9,'2026-10-22T00:03:00Z'),(False,0))
        self.assertEqual(self.store.execute('SELECT value FROM observations').fetchone()['value'],3)
        revisions=list(self.store.execute('SELECT payload FROM revisions'))
        self.assertEqual(len(revisions),1);self.assertEqual(json.loads(revisions[0]['payload'])['value'],2)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM snapshots').fetchone()['n'],1)
    def test_statewide_rainfall_and_bounded_receipts_without_raw_files(self):
        from test_bom_hcs import HEADER,ROWS
        self.enable();migrate(self.store)
        hcs=b'# HEADER: File Generation Date: 2026-10-22T00:00:00Z\n'+HEADER+ROWS
        # Fixture station is outside the existing dashboard registry.
        self.assertEqual(ingest(self.store,hcs,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_test.hcs','rain-15m'),2)
        self.assertTrue(self.store.execute("SELECT value FROM observations WHERE station='bom:040004'").fetchone())
        for i in range(40):
            issued=(datetime(2026,10,22,tzinfo=timezone.utc)+timedelta(minutes=i)).isoformat()
            self.store.snapshot(str(i).encode(),f'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_{i}.hcs','rain-15m',issued)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM snapshots').fetchone()['n'],1)
        self.assertLessEqual(self.store.execute('SELECT COUNT(*) AS n FROM feed_receipts').fetchone()['n'],24)
        with self.assertRaises(ValueError):self.store.observation('s','bom:test','rainfall',issued,900,3,'rain-15m',issued,metadata={'estimated':True})
    def test_compact_collector_only_polls_rainfall_and_twelve_water_summaries(self):
        from test_bom_hcs import HEADER,ROWS
        self.enable();migrate(self.store)
        issued=datetime.now(timezone.utc).isoformat()
        hcs=b'# HEADER: File Generation Date: '+issued.encode()+b'\n'+HEADER+ROWS
        name='IDQ65900_20261022002300.hcs'
        def response(url,listing=False):
            if listing:return (name+'\n').encode()
            if url.endswith('.hcs'):return hcs
            return json.dumps({'issuedAt':issued,'stations':[],'warnings':[]}).encode()
        with patch('collector.fetch',side_effect=response) as fetch,patch('collector.time.sleep'):
            results,errors=collect(self.store)
            self.assertEqual(errors,[]);self.assertEqual(set(results),{'rain-15m','water-summary'})
            self.assertEqual(fetch.call_count,14)
            self.assertFalse(any('IDQ603' in c.args[0] for c in fetch.call_args_list))
            fetch.reset_mock();collect(self.store);self.assertEqual(fetch.call_count,13)
