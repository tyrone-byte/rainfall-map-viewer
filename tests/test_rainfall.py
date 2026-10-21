import unittest
from pathlib import Path
from rainfall import parse, key
import json

FIXTURE = Path(__file__).parent / 'fixtures/bulletin.html'

class BulletinTests(unittest.TestCase):
    def test_actual_bom_capture(self):
        data = parse(FIXTURE.read_text())
        self.assertEqual(len(data['stations']), 321)
        self.assertEqual(data['issuedAt'], '2026-10-22T08:53:00+10:00')
        self.assertEqual(data['periods'][0]['end'], '2026-10-21T09:00:00+10:00')
        self.assertEqual(data['periods'][-1]['end'], '2026-10-22T06:00:00+10:00')
        gauge = next(s for s in data['stations'] if s['name']=='Goolman')
        self.assertEqual(gauge['values'], [1,0,16,0,1,0,4,19])
        dayboro = [s for s in data['stations'] if s['name']=='Dayboro']
        self.assertEqual(len(dayboro),2)
        self.assertTrue(all(s['ambiguousName'] for s in dayboro))
        self.assertNotEqual(dayboro[0]['id'],dayboro[1]['id'])
    def test_missing_is_not_zero(self):
        html=FIXTURE.read_text().replace('     0.0\n','     --\n',1)
        values=parse(html)['stations'][0]['values']
        self.assertIsNone(values[0])
        self.assertEqual(values[1],0)
    def test_unknown_reading_is_flagged(self):
        html=FIXTURE.read_text().replace('     0.0\n','     bad\n',1)
        data=parse(html)
        self.assertIsNone(data['stations'][0]['values'][0])
        self.assertTrue(data['warnings'])
    def test_reject_changed_headings(self):
        with self.assertRaises(ValueError):parse(FIXTURE.read_text().replace('9AM','10AM'))
    def test_reject_error_page(self):
        with self.assertRaises(ValueError):parse('<html>Access denied</html>')
    def test_coordinates_are_official_and_separate(self):
        coords=json.loads(Path('data/stations.json').read_text())
        c=coords[key('Goolman')]
        self.assertEqual(c['stationNumber'],'540668')
        self.assertAlmostEqual(c['lat'],-27.736111,places=6)
        self.assertAlmostEqual(c['lon'],152.766667,places=6)
        self.assertTrue(c['source'].startswith('https://reg.bom.gov.au/'))

if __name__=='__main__':unittest.main()
