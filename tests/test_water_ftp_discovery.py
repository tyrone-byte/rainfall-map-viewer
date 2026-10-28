import unittest
from tools.discover_water_ftp import analyse

# Synthetic parser checks only; never used as observations in the viewer.
FIELDS='IndexNo,SensorType,SensorDataType,SiteIdType,SiteId,ObservationTimestamp,RealValue,Unit,SensorParam1,SensorParam2,Quality,Comment'
def sample(rows):
    header=f'# HEADER: File Format: BOM-HCS\n# HEADER: File Format Version: 2.0\n# HEADER: Data Fields: {FIELDS}\n# HEADER: Number of Records: {len(rows)}\n'
    return (header+'\n'.join(rows)).encode()
class WaterFTPDiscoveryTests(unittest.TestCase):
    def test_station_id_times_values_and_unknown_datum_are_preserved(self):
        rows=['1,UNKNOWN,UNKNOWN,SR,040835,2026-10-28T01:00:00Z,-0.3,m,unspecified,unspecified,3,',
              '2,UNKNOWN,UNKNOWN,SR,040835,2026-10-28T01:10:00Z,0,m,unspecified,unspecified,3,',
              '3,UNKNOWN,UNKNOWN,SR,540723,2026-10-28T01:10:00Z,9,m,unspecified,unspecified,3,']
        result=analyse(sample(rows))
        self.assertTrue(result['formatValidated']);self.assertEqual(result['stationCount'],2)
        self.assertEqual(result['mulgowieRecords'],2);self.assertEqual(result['mulgowieGapMinutes'],[10])
        self.assertEqual(result['mulgowieRows'][0]['RealValue'],'-0.3')
        self.assertEqual(result['mulgowieRows'][1]['RealValue'],'0')
        self.assertIn('Not yet verified',result['datumHandling'])
    def test_invalid_sources_and_unstated_timezone_are_not_guessed(self):
        self.assertFalse(analyse(b'<html>Access denied</html>')['formatValidated'])
        with self.assertRaises(ValueError):analyse(sample(['1,X,X,SR,040835,2026-10-28T01:00:00,1,m,,,3,']))
        with self.assertRaises(ValueError):analyse(sample(['1,X']))
