import json
import os
import tempfile
import unittest
from datetime import datetime,timedelta,timezone
from pathlib import Path
from unittest.mock import patch
import archive_service as api
from history_store import Store

END=datetime(2026,10,26,2,0,tzinfo=timezone.utc)
BASIN='brisbane-bremer-pine-caboolture'
class WaterArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)/'history.sqlite';self.store=Store(str(self.path))
        sid,_=self.store.snapshot(b'test','fixture','water-summary',END.isoformat())
        self.water=next(s for s in api.water_inventory() if s['basinId']==BASIN)
        self.id=self.water['id']
        for age,value,datum in [(120,-0.3,'AHD'),(60,0,'AHD'),(0,None,'AHD')]:
            self.store.observation(sid,'bom:'+self.id,'water-level',(END-timedelta(minutes=age)).isoformat(),0,value,'water-summary',END.isoformat(),datum=datum)
        self.store.status('water-summary',END.isoformat(),'ok',{});self.store.db.commit();api.CACHE.clear()
        self.env=patch.dict(os.environ,{'HISTORY_DATABASE_URL':'sqlite:///'+str(self.path)});self.env.start()
    def tearDown(self):
        self.env.stop();self.store.close();self.temp.cleanup();api.CACHE.clear()
    def test_water_window_preserves_null_zero_negative_and_never_looks_ahead(self):
        self.assertEqual(api.water_extent()['lastEnd'],END.isoformat())
        end=(END-timedelta(minutes=30)).isoformat()
        frame=api.water_frame(end,60,BASIN);g=next(g for g in frame['stations'] if g['id']==self.id)
        self.assertEqual(g['level'],0);self.assertEqual(g['datum'],'AHD');self.assertEqual(g['status'],'current')
        series=api.water_series(self.id,minutes=180)
        self.assertEqual([o['level'] for o in series['observations']],[-0.3,0,None])
        latest=next(s for s in api.water_frame(minutes=15,basin=BASIN)['stations'] if s['id']==self.id)
        self.assertIsNone(latest['level']);self.assertEqual(latest['status'],'missing')
        self.assertTrue(all(s['basinId']==BASIN for s in frame['stations']))
    def test_no_carry_forward_from_outside_window_and_invalid_requests(self):
        frame=api.water_frame((END-timedelta(minutes=15)).isoformat(),15,BASIN)
        self.assertIsNone(next(g for g in frame['stations'] if g['id']==self.id)['observedAt'])
        with self.assertRaises(ValueError):api.water_frame(minutes=10,basin=BASIN)
        with self.assertRaises(ValueError):api.water_frame(basin='invented')
        with self.assertRaises(ValueError):api.water_frame((END+timedelta(minutes=1)).isoformat(),60,BASIN)
        self.assertFalse(api.water_series('not-a-gauge')['available'])
    def test_age_flags_use_selected_time_and_datum_is_retained(self):
        other=next(s for s in api.water_inventory() if s['basinId']==BASIN and s['id']!=self.id)
        sid,_=self.store.snapshot(b'age and datum','fixture','water-summary',END.isoformat())
        self.store.observation(sid,'bom:'+other['id'],'water-level',(END-timedelta(hours=6)).isoformat(),0,2,'water-summary',END.isoformat(),datum='LGH')
        self.store.observation(sid,'bom:'+self.id,'water-level',(END-timedelta(minutes=90)).isoformat(),0,1,'water-summary',END.isoformat(),datum='LGH')
        self.store.db.commit()
        frame=api.water_frame(minutes=1440,basin=BASIN)
        g=next(g for g in frame['stations'] if g['id']==other['id'])
        self.assertEqual(g['status'],'out');self.assertEqual(g['datum'],'LGH')
        series=api.water_series(self.id,minutes=180)
        self.assertEqual([o['datum'] for o in series['observations']],['AHD','LGH','AHD','AHD'])

    def test_measured_change_uses_actual_elapsed_time_and_rejects_datum_changes(self):
        def row(age,value,datum='AHD'):
            return {'end_at':(END-timedelta(minutes=age)).isoformat(),'value':value,'datum':datum}
        latest=row(0,2)
        result=api.water_movement(latest,[row(75,1.5),row(20,1.8),latest],END.isoformat(),60)
        self.assertEqual(result['direction'],'rising');self.assertEqual(result['ratePerHour'],.4)
        self.assertEqual(api.water_movement(latest,[row(90,1)],END.isoformat(),60)['direction'],'unavailable')
        self.assertEqual(api.water_movement(latest,[row(60,1),row(30,1,'LGH')],END.isoformat(),60)['direction'],'unavailable')
        self.assertEqual(api.water_movement(row(0,0),[row(60,1)],END.isoformat(),60)['direction'],'falling')
        self.assertEqual(api.water_movement(row(0,0),[row(60,0)],END.isoformat(),60)['direction'],'steady')
        self.assertEqual(api.water_movement(row(120,2),[row(180,1)],END.isoformat(),60)['direction'],'unavailable')
        self.assertEqual(api.water_movement(row(0,None),[row(60,1)],END.isoformat(),60)['direction'],'unavailable')

    def test_seven_day_water_window_preserves_full_observations(self):
        result=api.water_series(self.id,minutes=10080)
        self.assertEqual(len(result['observations']),3)
        self.assertEqual(api.date(result['end'])-api.date(result['start']),timedelta(days=7))

    def test_group_stats_deduplicate_gauges_and_exclude_incomplete_records(self):
        sid,_=self.store.snapshot(b'rain','fixture','rain-15m',END.isoformat())
        for i in range(96):
            t=(END-timedelta(minutes=i*15)).isoformat()
            self.store.observation(sid,'bom:540668','rainfall',t,900,0 if i<48 else 1,'rain-15m',END.isoformat())
        self.store.observation(sid,'bom:540111','rainfall',END.isoformat(),900,999,'rain-15m',END.isoformat())
        self.store.db.commit()
        stats=api.rainfall_group_stats();group=next(g for g in stats['groups'] if g['id']==BASIN)
        self.assertEqual(group['maxDepth'],48);self.assertEqual(group['completeGauges'],1);self.assertEqual(group['wetPercent'],100)
        self.assertEqual(group['wetGauges'],1)
