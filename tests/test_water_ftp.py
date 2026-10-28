import json
import tempfile
import unittest
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch

from bom_water_hcs import parse_water_hcs
from collector import ingest_water_ftp,collect_water_ftp
from history_store import Store
from water_ftp_cutover import cutover,MARKER
import archive_service as api

RAW=Path('tests/fixtures/water-ftp.hcs').read_bytes()
HISTORY='ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65911_20261028030800.hcs'
LATEST='ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65910_20261028035300.hcs'
class WaterFTPTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'history.sqlite';self.store=Store(str(self.path),compact=True)
    def tearDown(self):
        self.store.close();self.temp.cleanup();api.CACHE.clear()
    def test_real_samples_keep_every_timestamp_and_deduplicate_both_products(self):
        parsed=parse_water_hcs(RAW)
        self.assertEqual(ingest_water_ftp(self.store,RAW,HISTORY),10)
        self.assertEqual(ingest_water_ftp(self.store,RAW,LATEST),0)
        self.assertEqual(ingest_water_ftp(self.store,RAW,HISTORY),0)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],10)
        mul=list(self.store.execute("SELECT end_at,value,datum,quality FROM observations WHERE station='bom:040835' ORDER BY end_at"))
        self.assertEqual([r['value'] for r in mul],[2.561,2.552,2.549]);self.assertTrue(all(r['datum']=='LGH' and r['quality']=='1' for r in mul))
        rows=list(self.store.execute('SELECT raw_gzip_b64 FROM snapshots'));self.assertTrue(all(r['raw_gzip_b64']=='' for r in rows))
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM revisions').fetchone()['n'],0)
        self.assertEqual(sum(o['stationId']!='040835' for o in parsed['observations']),7)
    def test_corrections_replace_only_same_point_and_seconds_are_not_rounded(self):
        ingest_water_ftp(self.store,RAW,HISTORY)
        corrected=RAW.replace(b'2026-10-28T03:08:14Z',b'2026-10-28T03:18:14Z').replace(b'2.561',b'2.565')
        self.assertEqual(ingest_water_ftp(self.store,corrected,HISTORY.replace('030800','031800')),1)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],10)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM revisions').fetchone()['n'],1)
        self.assertEqual(ingest_water_ftp(self.store,RAW,HISTORY.replace('030800','030801')),0)
        value=self.store.execute("SELECT value FROM observations WHERE station='bom:040835' ORDER BY end_at LIMIT 1").fetchone()['value']
        self.assertEqual(value,2.565)
        second=parse_water_hcs(RAW.replace(b'2026-10-28T01:00:00Z',b'2026-10-28T01:00:37Z'))
        self.assertEqual(next(o['time'] for o in second['observations'] if o['stationId']=='040835'),'2026-10-28T01:00:37+00:00')
        self.assertEqual(parse_water_hcs(RAW.replace(b'2.561',b'-0.30'))['observations'][0]['value'],-.3)

    def test_reject_unverified_datum_unit_timezone_and_invalid_values(self):
        for altered in [RAW.replace(b'"LGH"',b'"UNKNOWN"'),RAW.replace(b'"metres"',b'"mm"'),RAW.replace(b'Local ObsTime Offset: 0',b'Local ObsTime Offset: 10'),RAW.replace(b'2.561',b'NaN')]:
            with self.assertRaises(ValueError):parse_water_hcs(altered)
    def test_cutover_removes_only_old_water_after_both_products_exist(self):
        snapshot,_=self.store.snapshot(b'old web','IDQ60286','water-summary','2026-10-22T00:00:00Z')
        self.store.observation(snapshot,'bom:040835','water-level','2026-10-22T00:00:00Z',0,1.39,'water-summary','2026-10-22T00:00:00Z',datum='LGH')
        rain,_=self.store.snapshot(b'rain','IDQ65900','rain-15m','2026-10-22T00:00:00Z')
        self.store.observation(rain,'bom:040835','rainfall','2026-10-22T00:00:00Z',900,4,'rain-15m','2026-10-22T00:00:00Z');self.store.db.commit()
        ingest_water_ftp(self.store,RAW,HISTORY)
        with self.assertRaises(ValueError):cutover(self.store)
        self.store.rollback();self.assertEqual(self.store.execute("SELECT COUNT(*) AS n FROM observations WHERE kind='water-summary'").fetchone()['n'],11)
        ingest_water_ftp(self.store,RAW,LATEST)
        report=cutover(self.store);self.assertEqual(report['removedWebWaterReadings'],1)
        self.assertEqual(report['retainedNumericFTPReadings'],10)
        self.assertEqual(self.store.execute("SELECT value FROM observations WHERE kind='rain-15m'").fetchone()['value'],4)
        self.assertEqual(cutover(self.store)['status'],'already-switched')
        self.assertTrue(self.store.execute('SELECT station FROM stations').fetchone())
    def test_missing_product_or_fetch_error_does_not_trigger_cutover(self):
        with patch('collector.fetch',side_effect=RuntimeError('network down')),patch('collector.time.sleep'):
            count,errors=collect_water_ftp(self.store,['IDQ65911_20261028030800.hcs'])
        self.assertEqual(count,0);self.assertTrue(errors)
        self.assertIsNone(self.store.execute('SELECT id FROM event_imports WHERE id=?',(MARKER,)).fetchone())
