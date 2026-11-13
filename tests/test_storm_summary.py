import os
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch
import archive_service as archive
import flood_status
import gauge_references
import storm_summary
from history_store import Store

END=archive.date('2026-11-13T00:00:00Z')
SID='540111'

def references():
    return [{'stationId':SID,'kind':kind,'level':level,'datum':'AHD','provisional':False,
             'source':'Test fixture only','retrievedAt':END.isoformat()} for kind,level in [('minor',1),('moderate',2),('major',3)]]

class FloodClassificationTests(unittest.TestCase):
    def test_boundaries_and_unknowns(self):
        for value,category in [(0,'below'),(1,'minor'),(2,'moderate'),(3,'major'),(-1,'below')]:
            self.assertEqual(flood_status.classify(value,'AHD',references())['category'],category)
        for value,datum,refs in [(None,'AHD',references()),(3,'LGH',references()),(3,None,references()),(4,'AHD',[]),(2,'AHD',references()[1:]),(4,'AHD',[{**r,'provisional':True} for r in references()])]:
            self.assertEqual(flood_status.classify(value,datum,refs)['category'],'unknown')
        self.assertEqual(flood_status.classify(3,'AHD',references()[2:])['category'],'major')
        bad=references();bad[0]['level']=4
        self.assertEqual(flood_status.classify(5,'AHD',bad)['category'],'unknown')

class StormArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'history.sqlite';self.store=Store(str(self.path))
        self.env=patch.dict(os.environ,{'HISTORY_DATABASE_URL':'sqlite:///'+str(self.path)});self.env.start();archive.CACHE.clear()
        snap,_=self.store.snapshot(b'storm fixture','fixture','water-summary',END.isoformat())
        for age,value,datum in [(1500,4,'AHD'),(120,3.5,'AHD'),(60,100,'LGH'),(0,.5,'AHD')]:
            self.store.observation(snap,'bom:'+SID,'water-level',(END-timedelta(minutes=age)).isoformat(),0,value,'water-summary',END.isoformat(),datum=datum)
        self.store.db.commit();gauge_references.ensure_table(self.store.db);gauge_references.save_records(self.store.db,references())
    def tearDown(self):
        self.env.stop();self.store.close();self.temp.cleanup();archive.CACHE.clear()
    def test_peak_major_is_retained_after_falling_and_incompatible_readings_excluded(self):
        result=storm_summary.water_summary();g=next(s for s in result['stations'] if s['id']==SID)
        self.assertEqual(g['peakFlood']['category'],'major');self.assertEqual(g['peakFlood']['level'],3.5)
        self.assertEqual(g['currentFlood']['category'],'below');self.assertEqual(g['assessedSamples'],2);self.assertEqual(g['sampleCount'],3)
        self.assertTrue(all(s['peakFlood'] is None for s in result['stations'] if s['id']!=SID))
        three=storm_summary.water_summary(4320);g=next(s for s in three['stations'] if s['id']==SID)
        self.assertEqual(g['peakFlood']['level'],4)
    def test_water_map_receives_current_flood_status(self):
        g=next(s for s in archive.water_frame(basin='brisbane-bremer-pine-caboolture')['stations'] if s['id']==SID)
        self.assertEqual(g['flood']['category'],'below')
    def test_rain_overview_keeps_group_endpoint_validation_and_preserves_missing(self):
        with self.assertRaises(ValueError):archive.rainfall_group_series(None)
        snap,_=self.store.snapshot(b'rain fixture','fixture','rain-15m',END.isoformat())
        self.store.observation(snap,'bom:'+SID,'rainfall',END.isoformat(),900,0,'rain-15m',END.isoformat());self.store.db.commit();archive.CACHE.clear()
        result=archive.rainfall_group_series(None,all_groups=True)
        self.assertEqual(len(result['periods']),96)
        g=next(s for s in result['stations'] if s['stationNumber']==SID)
        self.assertEqual(g['values'][-1],0);self.assertEqual(g['values'][:-1],[None]*95)
        self.assertGreater(len({s['basinId'] for s in result['stations']}),1)
    def test_summary_combines_saved_totals_point_windows_and_flood_peaks(self):
        snap,_=self.store.snapshot(b'complete rain fixture','fixture','rain-15m',END.isoformat())
        for i in range(96):
            self.store.observation(snap,'bom:'+SID,'rainfall',(END-timedelta(minutes=15*i)).isoformat(),900,1,'rain-15m',END.isoformat())
        self.store.db.commit();archive.CACHE.clear()
        result=storm_summary.summary()
        total=next(s for s in result['rainfall']['stations'] if s['stationNumber']==SID)
        self.assertTrue(total['complete']);self.assertEqual(total['depth'],96)
        series=next(s for s in result['pointRainfall']['stations'] if s['stationNumber']==SID)
        self.assertEqual(series['values'],[1]*96)
        water=next(s for s in result['water']['stations'] if s['id']==SID)
        self.assertEqual(water['peakFlood']['category'],'major')

    def test_summary_without_database_reports_unknown_not_zero(self):
        with patch.dict(os.environ,{'HISTORY_DATABASE_URL':'','DATABASE_URL':''}):
            result=storm_summary.summary()
        self.assertFalse(result['water']['available']);self.assertFalse(result['rainfall']['available'])
        with self.assertRaises(ValueError):storm_summary.summary(60)
