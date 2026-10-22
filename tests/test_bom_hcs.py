import unittest
from bom_hcs import parse_hcs
HEADER=b'''# HEADER: File Format: BOM-HCS
# HEADER: File Format Version: 2.0
# HEADER: Number of Records: 2
# HEADER: Local ObsTime Offset: 0
# HEADER: Data Fields: IndexNo, SensorType, SensorDataType, SiteIdType, SiteId, ObservationTimestamp, RealValue, Unit, SensorParam1, SensorParam2, Quality, Comment
'''
ROWS=b'''1,"RN",6,"SR","040004","2026-10-22T00:00:00Z",0,"mm","",900,3,""
2,"RN",6,"SR","040004","2026-10-22T00:15:00Z",,"mm","",900,3,""
'''
class HCSTests(unittest.TestCase):
    def test_zero_missing_id_and_quality_preserved(self):
        p=parse_hcs(HEADER+ROWS)['observations'];self.assertEqual(p[0]['stationId'],'040004');self.assertEqual(p[0]['value'],0);self.assertIsNone(p[1]['value']);self.assertEqual(p[0]['quality'],'3');self.assertEqual(p[0]['time'],'2026-10-22T00:00:00+00:00')
    def test_changed_schema_units_period_or_count_fail(self):
        for before,after in [(b'2.0',b'3.0'),(b'900',b'600'),(b'"mm"',b'"cm"'),(b'Records: 2',b'Records: 3')]:
            with self.assertRaises(ValueError):parse_hcs((HEADER+ROWS).replace(before,after))
    def test_unknown_value_and_missing_timezone_fail(self):
        with self.assertRaises(ValueError):parse_hcs(HEADER+ROWS.replace(b',0,"mm"',b',-9999,"mm"'))
        with self.assertRaises(ValueError):parse_hcs((HEADER+ROWS).replace(b'00:00:00Z',b'00:00:00'))
