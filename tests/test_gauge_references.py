import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gauge_references as refs
from tools.collect_water_references import parse_page

class ReferenceTests(unittest.TestCase):
    def test_published_text_has_exact_station_and_datum_and_never_derives_relative_crest(self):
        html=Path('tests/fixtures/water-history.html').read_text()
        values=parse_page(html,'540111','fixture',retrieved='2026-11-03T00:00:00+00:00')
        self.assertEqual([(r['kind'],r['level'],r['datum']) for r in values],[('minor',33.5,'AHD'),('moderate',35,'AHD'),('major',36,'AHD')])
        with self.assertRaises(ValueError):parse_page(html,'540177','fixture')
        relative='<p>Station Number: 540177</p><p>0.30 above Spillway</p>'
        self.assertEqual(parse_page(relative,'540177','fixture'),[])
        absolute=relative+'<p>Spillway crest level: 57 m AHD</p>'
        self.assertEqual(parse_page(absolute,'540177','fixture')[0]['level'],57)
        with self.assertRaises(ValueError):parse_page(absolute+'<p>Spillway: 58 m AHD</p>','540177','fixture')

    def test_versioned_reference_database_is_idempotent_and_preserves_provenance(self):
        db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;refs.ensure_table(db)
        record={'stationId':'540111','kind':'minor','level':33.5,'datum':'AHD','source':'https://reg.bom.gov.au/example','retrievedAt':'2026-11-03T00:00:00+00:00'}
        refs.save_records(db,[record,record])
        self.assertEqual(db.execute('SELECT COUNT(*) FROM gauge_reference_levels').fetchone()[0],1)
        refs.save_records(db,[{**record,'level':34,'retrievedAt':'2026-11-04T00:00:00+00:00'}])
        self.assertEqual(len(refs.published('540111',db)),1)
        self.assertEqual(refs.published('540111',db)[0]['level'],34)
        self.assertEqual(db.execute('SELECT COUNT(*) FROM gauge_reference_levels').fetchone()[0],2)
        self.assertEqual(refs.published('540177',db),[])
        db.close()

    def test_comparison_flag_boundary_datum_and_missing(self):
        crest={'level':100,'datum':None}
        def reading(level,datum='AHD'):return {'value':level,'datum':datum}
        self.assertEqual(refs.comparison(crest,reading(99))['state'],'below')
        self.assertEqual(refs.comparison(crest,reading(100))['state'],'at')
        self.assertEqual(refs.comparison(crest,reading(101))['state'],'above')
        self.assertFalse(refs.comparison(crest,reading(110))['over10m'])
        self.assertTrue(refs.comparison(crest,reading(110.01))['over10m'])
        mismatch=refs.comparison(crest,reading(5,'LGH'))
        self.assertTrue(mismatch['over10m']);self.assertEqual(mismatch['state'],'unknown')
        self.assertIsNone(refs.comparison(crest,reading(None))['over10m'])

    def test_all_dams_and_provisional_associations_have_coverage(self):
        catalogue=json.loads(Path('public/dams-catalogue.json').read_text())
        self.assertEqual(len(catalogue['dams']),49)
        associated=[d for d in catalogue['dams'] if d.get('storageWaterGauge')]
        self.assertEqual(len(associated),44)
        self.assertTrue(all(d['spillwayCrest']['level'] is not None for d in catalogue['dams']))
        for dam in associated:
            reference=next(r for r in refs.for_gauge(dam['storageWaterGauge']['id']) if r.get('damId')==dam['id'])
            self.assertEqual(reference['level'],dam['spillwayCrest']['level'])
        hinze=next(d for d in catalogue['dams'] if d['id']=='hinze-dam')
        self.assertEqual(hinze['spillwayCrest']['datum'],'AHD')
        self.assertEqual(hinze['spillwayCrest']['level'],94.5)

    def test_csv_preserves_latest_null_instead_of_falling_back_and_flags_raw_difference(self):
        import archive_service
        from history_store import Store
        with tempfile.TemporaryDirectory() as directory:
            url=str(Path(directory)/'history.sqlite');store=Store(url)
            snap,_=store.snapshot(b'csv test','test','water-summary','2026-11-01T00:00:00+00:00')
            for station,value in [('bom:540177',68),('bom:540610',None)]:
                store.observation(snap,station,'water','2026-11-01T00:00:00+00:00',0,value,'water-summary','2026-11-01T00:00:00+00:00',datum='AHD')
            store.db.commit();store.close();archive_service.CACHE.clear()
            with patch.dict('os.environ',{'HISTORY_DATABASE_URL':url}):
                rows=refs.review()
            wivenhoe=next(r for r in rows if r['dam']=='Wivenhoe Dam')
            self.assertTrue(wivenhoe['over_10m']);self.assertEqual(wivenhoe['raw_difference_m'],11)
            hinze=next(r for r in rows if r['dam']=='Hinze Dam')
            self.assertIsNone(hinze['over_10m'])
            self.assertEqual(len(rows),49)
        archive_service.CACHE.clear()
