import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from history_store import Store
from tools.export_archive import export_archive,verify_archive,month_bounds

class ArchiveExportTests(unittest.TestCase):
    def test_read_only_round_trip_preserves_missing_zero_qa_and_datum_without_estimate_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.sqlite';output=Path(tmp)/'sample.zip';store=Store(str(path))
            snap,_=store.snapshot(b'fixture source','fixture','fixture','2026-10-22T00:00:00+00:00')
            for time,value,meta in [('2026-10-21T23:15:00+00:00',0,{}),('2026-10-21T23:30:00+00:00',None,{}),('2026-10-21T23:45:00+00:00',2,{'estimated':True,'parentObservation':'test-parent'})]:
                store.observation(snap,'bom:540668','rainfall',time,900,value,'rain-15m','2026-10-22T00:00:00+00:00',quality='3',metadata=meta)
            store.observation(snap,'bom:540111','water-level','2026-10-21T23:00:00+00:00',0,-0.1,'water-summary','2026-10-22T00:00:00+00:00',datum='AHD')
            store.observation(snap,'bom:540668','rainfall','2026-10-21T23:00:00+00:00',3600,99,'rain-1h','2026-10-22T00:00:00+00:00')
            store.observation(snap,'bom:540668','rainfall','2026-10-21T23:00:00+00:00',10800,199,'rain-3h','2026-10-22T00:00:00+00:00')
            store.observation(snap,'bom:540111','water-level','2026-10-21T23:10:00+00:00',0,99,'water-history','2026-10-22T00:00:00+00:00',datum='AHD')
            store.db.commit();store.close()
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            report=export_archive('sqlite:///'+str(path),'2026-10',output,True)
            self.assertTrue(report['verified']);self.assertEqual(report['observation_records'],4)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
            with zipfile.ZipFile(output) as archive:
                index=json.loads(archive.read('index.json'));text=''.join(archive.read(f['path']).decode() for f in index['files'] if f['type']=='observations')
                self.assertNotIn('value_basis',text);self.assertNotIn('test-parent',text);self.assertIn('AHD',text)
                self.assertEqual(index['version'],2)
                self.assertIn('one-off',index['historical_note'])
                self.assertFalse(any('snapshot' in n for n in archive.namelist()))
                members={n:archive.read(n) for n in archive.namelist()}
            target=next(f['path'] for f in index['files'] if f['type']=='observations')
            members[target]+=b'corrupt'
            with zipfile.ZipFile(output,'w') as archive:
                for name,content in members.items():archive.writestr(name,content)
            with self.assertRaisesRegex(ValueError,'Checksum'):verify_archive(output)

    def test_unknown_rainfall_is_unassigned_and_water_uses_verified_source_basin(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.sqlite';output=Path(tmp)/'sample.zip';store=Store(str(path))
            issued='2026-10-22T00:00:00+00:00'
            rain,_=store.snapshot(b'fixture rain','ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_fixture.hcs','rain-15m',issued)
            level,_=store.snapshot(b'fixture water','https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60287.html','water-summary',issued)
            store.observation(rain,'bom:999999','rainfall',issued,900,0,'rain-15m',issued)
            store.observation(level,'bom:999998','water-level',issued,0,2,'water-summary',issued,datum='AHD')
            store.db.commit();store.close()
            export_archive('sqlite:///'+str(path),'2026-10',output,True)
            with zipfile.ZipFile(output) as archive:
                self.assertIn('unassigned/rainfall-15min.csv',archive.namelist())
                self.assertIn('sunshine-coast-mary/water-level.csv',archive.namelist())
                self.assertIn('IDQ60287',archive.read('sunshine-coast-mary/water-level.csv').decode())

    def test_months_use_brisbane_calendar_boundaries(self):
        self.assertEqual(month_bounds('2026-10'),('2026-09-30T14:00:00+00:00','2026-10-31T14:00:00+00:00'))
        self.assertEqual(month_bounds('2026-12')[1],'2026-12-31T14:00:00+00:00')
