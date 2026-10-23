import os
import tempfile
import unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch

import archive_service as api
from history_store import Store

END=datetime(2026,10,22,2,30,tzinfo=timezone.utc)
GOOLMAN='Ipswich/Brisbane Creeks:goolman:1'

class HistoricalRainTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'history.sqlite'
        self.store=Store(str(self.path));snapshot,_=self.store.snapshot(b'test-only periods','fixture','fixture',END.isoformat())
        for i,value in enumerate([0,2,3,4]):
            self.store.observation(snapshot,'bom:540668','rainfall',(END-timedelta(minutes=15*i)).isoformat(),900,value,'rain-15m',END.isoformat())
        # Coarse values must never fill missing quarters or enter map sums.
        self.store.observation(snapshot,'bom:540668','rainfall',END.isoformat(),10800,999,'rain-3h',END.isoformat())
        self.store.status('rain-15m',END.isoformat(),'ok',{})
        self.store.db.commit();api.CACHE.clear()
        self.env=patch.dict(os.environ,{'HISTORY_DATABASE_URL':'sqlite:///'+str(self.path)});self.env.start()

    def tearDown(self):
        self.env.stop();self.store.close();self.temp.cleanup();api.CACHE.clear()

    def test_extent_and_rolling_totals_use_only_quarters(self):
        extent=api.rainfall_extent()
        self.assertEqual(extent['lastEnd'],END.isoformat())
        frame=api.rainfall_frame(minutes=60)
        station=next(s for s in frame['stations'] if s['id']==GOOLMAN)
        self.assertEqual(station['depth'],9)
        self.assertEqual(station['validBlocks'],4)
        self.assertEqual(station['coordinates']['stationNumber'],'540668')
        self.assertEqual(station['ifdLocationKey'],'-27.736111,152.766667')
        longer=next(s for s in api.rainfall_frame(minutes=180)['stations'] if s['id']==GOOLMAN)
        self.assertIsNone(longer['depth']);self.assertEqual(longer['coverageStatus'],'incomplete')
        earlier=next(s for s in api.rainfall_frame((END-timedelta(minutes=15)).isoformat(),30)['stations'] if s['id']==GOOLMAN)
        self.assertEqual(earlier['depth'],5)

    def test_native_series_fills_only_missing_slots_with_null_not_estimates(self):
        data=api.rainfall_series(GOOLMAN)
        self.assertEqual(len(data['periods']),96)
        self.assertEqual(data['periodMinutes'],15)
        self.assertEqual(data['stations'][0]['values'][-4:],[4,3,2,0])
        self.assertTrue(all(v is None for v in data['stations'][0]['values'][:-4]))
        earlier=api.rainfall_series(GOOLMAN,(END-timedelta(minutes=15)).isoformat())
        self.assertEqual(earlier['stations'][0]['values'][-1],2)
        self.assertNotIn(999,earlier['stations'][0]['values'])

    def test_invalid_windows_rejected_and_missing_identity_not_guessed(self):
        for end,minutes in [(END+timedelta(minutes=15),15),(END-timedelta(hours=6),60),(END-timedelta(minutes=1),60)]:
            with self.assertRaises(ValueError):api.rainfall_frame(end.isoformat(),minutes)
        with self.assertRaises(ValueError):api.rainfall_frame(minutes=10)
        with self.assertRaises(ValueError):api.rainfall_series(GOOLMAN,'2026-10-22T02:30:00')
        self.assertEqual(api.rainfall_series('not-a-station')['reason'],'identity-unresolved')
        unresolved=next(s for s in api.rainfall_frame()['stations'] if s['stationNumber'] is None)
        self.assertIsNone(unresolved['coordinates']);self.assertIsNone(unresolved['depth'])

    def test_queries_are_read_only_and_absent_connection_is_explicit(self):
        before=self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n']
        api.rainfall_frame();api.rainfall_series(GOOLMAN)
        self.assertEqual(self.store.execute('SELECT COUNT(*) AS n FROM observations').fetchone()['n'],before)
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(api.rainfall_frame()['reason'],'not-connected')

if __name__=='__main__':unittest.main()
