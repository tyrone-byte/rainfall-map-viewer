import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
import flood_status
import gauge_references
from tools.import_sls_references import SOURCE,EXPECTED_SHA,build

class SLSReferencesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records=json.loads(Path('data/water-reference-levels.json').read_text())['records']
        cls.report=json.loads(Path('docs/flood/sls-import-report.json').read_text())
    def refs(self,sid):return [r for r in self.records if r['stationId']==sid]
    def test_exact_identity_and_published_spot_checks(self):
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),EXPECTED_SHA)
        self.assertEqual(len(self.records),2417)
        self.assertEqual(len({r['stationId'] for r in self.records}),808)
        for sid,levels in [('540111',[33.5,35,36]),('540198',[1.7,2.6,3.5]),('540610',[98.1,100.7,102.3])]:
            self.assertEqual([r['level'] for r in self.refs(sid)],levels)
        # Manual and automatic Hinze gauges are not interchangeable despite their names.
        row=next(r for r in self.report['rows'] if r['stationId']=='040847')
        self.assertEqual(list(row['levels'].values()),[3.6,6.2,7.8])
        catalogue={s['id'] for s in json.loads(Path('data/water-groups.json').read_text())['stations']}
        self.assertTrue(all(r['stationId'] in catalogue for r in self.records))
        self.assertTrue(all(re.fullmatch(r'\d{6}',r['stationId']) for r in self.records))
    def test_source_datum_stays_unspecified_but_confirmed_same_station_basis_is_explicit(self):
        self.assertTrue(all(r['datum'] is None and r['datumVerified'] and r['datumBasis']=='same-station-observation' for r in self.records))
        self.assertEqual(flood_status.classify(35,'AHD',self.refs('540111'))['category'],'moderate')
        self.assertEqual(flood_status.classify(36,'LGH',self.refs('540111'))['category'],'major')
        self.assertEqual(flood_status.classify(40,None,self.refs('540111'))['category'],'unknown')
        unverified=[{**r,'datumVerified':False} for r in self.refs('540111')]
        self.assertEqual(flood_status.classify(40,'AHD',unverified)['category'],'unknown')
        self.assertTrue(all(gauge_references.validate(r) for r in self.records))
    def test_blank_and_not_applicable_cells_are_distinct_and_never_zero(self):
        partial=next(r for r in self.report['rows'] if r['stationId']=='533207')
        self.assertIsNone(partial['levels']['minor']);self.assertEqual(partial['rawCells']['minor'],'')
        self.assertEqual([r['kind'] for r in self.refs('540357')],['minor'])
        self.assertEqual(flood_status.classify(9,'LGH',self.refs('540357'))['category'],'minor')
        self.assertEqual(flood_status.classify(8,'LGH',self.refs('540357'))['category'],'below')
        # Equal published minor and moderate thresholds mean moderate at that height.
        refs=[{'kind':k,'level':v,'datum':'AHD','provisional':False} for k,v in [('minor',8),('moderate',8),('major',12)]]
        self.assertEqual(flood_status.classify(8,'AHD',refs)['category'],'moderate')
    def test_portable_sls_activates_archive_map_and_hydrograph_without_database_import(self):
        import os
        from unittest.mock import patch
        import archive_service as archive
        from history_store import Store
        end='2026-11-14T00:00:00+00:00'
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'readings.sqlite';store=Store(str(path))
            snapshot,_=store.snapshot(b'SLS integration fixture','fixture','water-summary',end)
            store.observation(snapshot,'bom:540111','water-level',end,0,35,'water-summary',end,datum='AHD');store.db.commit();store.close()
            archive.CACHE.clear()
            try:
                with patch.dict(os.environ,{'HISTORY_DATABASE_URL':'sqlite:///'+str(path)}):
                    frame=archive.water_frame(basin='brisbane-bremer-pine-caboolture')
                    station=next(s for s in frame['stations'] if s['id']=='540111')
                    self.assertEqual(station['flood']['category'],'moderate')
                    series=archive.water_series('540111')
                    self.assertEqual([r['level'] for r in series['references'] if r['kind'] in ('minor','moderate','major')],[33.5,35,36])
            finally:archive.CACHE.clear()

    @unittest.skipUnless(shutil.which('pdftotext'),'Optional offline Poppler tool unavailable')
    def test_rebuild_and_independent_plain_text_columns_agree(self):
        records,report=build(retrieved=self.report['importedAt'])
        self.assertEqual(records,self.records);self.assertEqual(report,self.report)
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'source.txt';subprocess.run(['pdftotext','-layout',str(SOURCE),str(target)],check=True)
            pages=target.read_text().split('\f')
        checked=0
        for row in report['rows']:
            lines=[s for s in pages[row['page']-1].splitlines() if re.match(r'^\s*'+row['stationId']+r'\s',s)]
            self.assertEqual(len(lines),1)
            m=re.search(r'(?:Automatic|Manual)\s+(-?\d+(?:\.\s*\d+)?)\s+(-?\d+(?:\.\s*\d+)?)\s+(-?\d+(?:\.\s*\d+)?)\s',lines[0])
            if m:
                self.assertEqual([float(v.replace(' ','')) for v in m.groups()],list(row['levels'].values()));checked+=1
        self.assertEqual(checked,1065)
