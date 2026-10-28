import json
import unittest
from pathlib import Path
import water
from unittest.mock import patch
import tempfile
import subprocess
import water_service

class WaterParserTests(unittest.TestCase):
    def test_real_summary_and_exact_station_identity(self):
        data=water.summary(Path('tests/fixtures/water-summary.html').read_text())
        self.assertEqual(len(data['stations']),233)
        station=data['stations'][0]
        self.assertEqual(station['stationNumber'],'540111');self.assertEqual(station['level'],31.66)
        self.assertEqual(station['datum'],'AHD');self.assertEqual(station['classification'],'below')
        self.assertEqual(station['observedAt'],'2026-10-22T10:14:00+10:00')
        mulgowie=next(s for s in data['stations'] if s['stationNumber']=='040835')
        self.assertEqual(mulgowie['plotPath'],'/fwo/IDQ65389/IDQ65389.040835.plt.shtml')
        self.assertEqual(mulgowie['historyPath'],'/fwo/IDQ65389/IDQ65389.040835.tbl.shtml')
        coords=json.loads(Path('data/water-stations.json').read_text());self.assertIn(station['id'],coords)
    def test_missing_and_negative_levels(self):
        html=Path('tests/fixtures/water-summary.html').read_text()
        self.assertIsNone(water.summary(html.replace('31.66','--',1))['stations'][0]['level'])
        self.assertEqual(water.summary(html.replace('31.66','-0.30',1))['stations'][0]['level'],-.3)
    def test_history_preserves_real_timestamps_and_duplicate_minutes(self):
        data=water.history(Path('tests/fixtures/water-history.html').read_text(),'540111')
        self.assertEqual(len(data['observations']),252)
        self.assertEqual(data['thresholds'][0],{'name':'Minor','level':33.5,'datum':'AHD'})
        self.assertEqual(data['observations'][-1],{'time':'2026-10-22T10:14:00+10:00','level':31.66})
        self.assertGreater(len(data['observations']),len({o['time'] for o in data['observations']}))
    def test_rejects_wrong_station_and_changed_headers(self):
        with self.assertRaises(ValueError):water.history(Path('tests/fixtures/water-history.html').read_text(),'000000')
        with self.assertRaises(ValueError):water.summary('<html>Access denied</html>')
        with self.assertRaises(ValueError):water.summary(Path('tests/fixtures/water-summary.html').read_text().replace('Height (m)','Changed'))
    def test_failed_refresh_preserves_genuine_cached_history(self):
        with tempfile.TemporaryDirectory() as tmp,patch.object(water_service,'CACHE',Path(tmp)):
            raw=Path('tests/fixtures/water-history.html').read_bytes()
            with patch('water_service.subprocess.run',return_value=subprocess.CompletedProcess([],0,raw,b'')):
                first=water_service.cached('540111','https://reg.bom.gov.au/test',lambda html:water.history(html,'540111'))
            with patch('water_service.subprocess.run',side_effect=subprocess.CalledProcessError(22,['curl'])):
                old=water_service.cached('540111','https://reg.bom.gov.au/test',lambda html:water.history(html,'540111'),True)
            self.assertIsNotNone(old['refreshError']);self.assertEqual(first['observations'],old['observations'])
    def test_history_url_input_cannot_target_arbitrary_sites(self):
        with self.assertRaises(ValueError):water_service.history('https://example.com')

    def test_thresholds_with_a_different_datum_are_never_used(self):
        bulletin=water.summary(Path('tests/fixtures/water-summary.html').read_text())
        bulletin['refreshError']=None
        data=water.history(Path('tests/fixtures/water-history.html').read_text(),'540111')
        for threshold in data['thresholds']:threshold['datum']='LGH'
        data['refreshError']=None
        with patch('water_service.cached',side_effect=[bulletin,data]):
            result=water_service.history('540111')
        self.assertEqual(result['thresholds'],[])
        self.assertTrue(any('datum mismatch' in warning for warning in result['warnings']))
