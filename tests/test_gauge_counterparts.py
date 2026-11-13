import unittest
from unittest.mock import patch
import archive_service as api

class GaugeCounterpartTests(unittest.TestCase):
    def test_real_catalogues_match_exact_station_identity(self):
        result=api.gauge_counterparts('540111','brisbane-bremer-pine-caboolture')
        self.assertEqual(result['water']['id'],'540111')
        rain=next(s for s in api.rainfall_inventory() if s['id']==result['rain']['id'])
        self.assertEqual(rain['stationNumber'],'540111')
    def test_same_name_or_nearby_coordinates_never_create_a_match(self):
        row={'id':'other','stationNumber':'000002','name':'Same name','coordinates':{'lat':-27,'lon':153},'basinId':'group'}
        with patch('archive_service.rainfall_inventory',return_value=[row]),patch('archive_service.water_inventory',return_value=[row]):
            result=api.gauge_counterparts('000001','group')
        self.assertIsNone(result['water']);self.assertIsNone(result['rain'])
    def test_group_preference_and_leading_zeros(self):
        rows=[{'id':'one','stationNumber':'000001','basinId':'a'},{'id':'two','stationNumber':'000001','basinId':'b'}]
        with patch('archive_service.rainfall_inventory',return_value=rows),patch('archive_service.water_inventory',return_value=rows):
            result=api.gauge_counterparts('000001','b')
        self.assertEqual(result['rain']['id'],'two');self.assertEqual(result['water']['id'],'two')
        with self.assertRaises(ValueError):api.gauge_counterparts('1')
