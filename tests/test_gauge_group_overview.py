import hashlib
import json
import unittest
from pathlib import Path
from tools.build_gauge_group_overview import hull
ROOT=Path(__file__).resolve().parents[1]

class GaugeGroupOverviewTests(unittest.TestCase):
    def test_hull_removes_duplicates_and_interior_points(self):
        self.assertEqual(hull([(0,0),(1,0),(1,1),(0,1),(.5,.5),(0,0)]),[(0,0),(1,0),(1,1),(0,1)])
        self.assertEqual(hull([(0,0),(1,1)]),[(0,0),(1,1)])

    def test_saved_navigation_uses_only_each_groups_actual_coordinates(self):
        result=json.loads((ROOT/'public/gauge-group-overview.json').read_text())
        self.assertEqual(result['schemaVersion'],1)
        for kind,file in [('rain','rainfall-groups.json'),('water','water-groups.json')]:
            source=ROOT/'data'/file;data=json.loads(source.read_text())
            self.assertEqual(result['sources'][file],hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(len(result[kind]),12)
            for group in result[kind]:
                points={(s['coordinates']['lon'],s['coordinates']['lat']) for s in data['stations'] if s['basinId']==group['id'] and s.get('coordinates')}
                self.assertEqual(group['mappedGaugeCount'],len(points))
                self.assertIn(tuple(reversed(group['anchor'])),points)
                self.assertEqual({tuple(reversed(p)) for p in group['locations']},points)
                self.assertTrue({tuple(p) for p in group['footprint']}.issubset(points))
                w,s,e,n=group['bounds'];self.assertTrue(all(w<=x<=e and s<=y<=n for x,y in points))
