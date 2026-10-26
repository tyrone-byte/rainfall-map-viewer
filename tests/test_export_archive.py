import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from history_store import Store
from tools.export_archive import export_archive,verify_archive,month_bounds

class ArchiveExportTests(unittest.TestCase):
    def test_read_only_round_trip_preserves_missing_zero_qa_estimates_and_datum(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'source.sqlite';output=Path(tmp)/'sample.zip';store=Store(str(path))
            snap,_=store.snapshot(b'fixture source','fixture','fixture','2026-10-22T00:00:00+00:00')
            for time,value,meta in [('2026-10-21T23:15:00+00:00',0,{}),('2026-10-21T23:30:00+00:00',None,{}),('2026-10-21T23:45:00+00:00',2,{'estimated':True,'parentObservation':'test-parent'})]:
                store.observation(snap,'bom:540668','rainfall',time,900,value,'rain-15m','2026-10-22T00:00:00+00:00',quality='3',metadata=meta)
            store.observation(snap,'bom:540111','water-level','2026-10-21T23:00:00+00:00',0,-0.1,'water-summary','2026-10-22T00:00:00+00:00',datum='AHD')
            store.db.commit();store.close()
            before=hashlib.sha256(path.read_bytes()).hexdigest()
            report=export_archive('sqlite:///'+str(path),'2026-10',output,True)
            self.assertTrue(report['verified']);self.assertEqual(report['observation_records'],4)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
            with zipfile.ZipFile(output) as archive:
                index=json.loads(archive.read('index.json'));text=''.join(archive.read(f['path']).decode() for f in index['files'] if f['type']=='observations')
                self.assertIn('estimated_uniform_3h',text);self.assertIn('test-parent',text);self.assertIn('AHD',text)
                self.assertFalse(any('snapshot' in n for n in archive.namelist()))
                members={n:archive.read(n) for n in archive.namelist()}
            target=next(f['path'] for f in index['files'] if f['type']=='observations')
            members[target]+=b'corrupt'
            with zipfile.ZipFile(output,'w') as archive:
                for name,content in members.items():archive.writestr(name,content)
            with self.assertRaisesRegex(ValueError,'Checksum'):verify_archive(output)

    def test_months_use_brisbane_calendar_boundaries(self):
        self.assertEqual(month_bounds('2026-10'),('2026-09-30T14:00:00+00:00','2026-10-31T14:00:00+00:00'))
        self.assertEqual(month_bounds('2026-12')[1],'2026-12-31T14:00:00+00:00')
