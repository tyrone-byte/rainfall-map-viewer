import copy
import json
import unittest
from pathlib import Path
from tools.collect_regional_ifd import normalize, TABLE

ROOT = Path(__file__).resolve().parents[1]

class RegionalIFDTests(unittest.TestCase):
    def payload(self):
        return {'input_data': {'Latitude': -27, 'Longitude': 152}, 'layers': {'RecIFD': {
            TABLE: {'index': [15, 30], 'columns': [50, 20, 10, 5, 2, 1, .1], 'data': [[1]*7, [2]*7]},
            'Default Historical (1961-1990) Baseline': {'data': 'not selected'}}}}

    def test_only_current_default_is_selected(self):
        table = normalize(self.payload(), -27, 152)
        self.assertEqual(table['name'], TABLE)
        self.assertEqual(table['points'][1]['depths'], [2]*7)

    def test_wrong_coordinate_missing_default_and_bad_depths_rejected(self):
        original = self.payload()
        for mutate in [lambda p: p['input_data'].update(Latitude=-28),
                       lambda p: p['layers']['RecIFD'].pop(TABLE),
                       lambda p: p['layers']['RecIFD'][TABLE]['data'][0].pop(),
                       lambda p: p['layers']['RecIFD'][TABLE]['data'][0].__setitem__(0, float('nan'))]:
            payload = copy.deepcopy(original); mutate(payload)
            with self.assertRaises(ValueError): normalize(payload, -27, 152)

    def test_all_region_files_and_assignments_are_consistent(self):
        plan = json.loads((ROOT/'data/ifd/regions/regions.json').read_text())
        index = json.loads((ROOT/'data/ifd/index.json').read_text())
        self.assertEqual(len(plan['regions']), 18)
        self.assertEqual(sum(plan['summary'].values()), len(plan['gauges']))
        self.assertEqual(plan['summary']['overlap'], 0)
        for region in plan['regions']:
            self.assertTrue(region['centroidWithinRegion'])
            data = json.loads((ROOT/'data/ifd/locations'/f"{region['id']}.json").read_text())
            self.assertEqual(len(data['datasets']), 1)
            self.assertEqual(data['datasets'][0]['name'], TABLE)
            self.assertEqual(data['referenceType'], 'regional-centroid')
            self.assertEqual(data['coordinates'], {'lat': region['lat'], 'lon': region['lon']})
        regions = {r['id']:r for r in plan['regions']}
        for gauge in plan['gauges']:
            if gauge['status'] == 'assigned':
                region = regions[gauge['regionIds'][0]]
                self.assertEqual(index['regionalAssignments'][gauge['locationKey']], f"{region['lat']:.6f},{region['lon']:.6f}")
            elif gauge['locationKey']:
                self.assertNotIn(gauge['locationKey'], index['regionalAssignments'])
