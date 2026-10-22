import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import archive_service as service
from history_store import Store

NOW = datetime(2026,10,22,6,0,tzinfo=timezone.utc)

class ArchiveReportTests(unittest.TestCase):
    def test_age_boundaries_missing_zero_and_collection_failure(self):
        def at(minutes): return (NOW-timedelta(minutes=minutes)).isoformat()
        for minutes, status in [(59,'current'),(60,'suspect'),(359,'suspect'),(360,'out')]:
            self.assertEqual(service.classify(at(minutes),False,True,NOW)[0],status)
        self.assertEqual(service.classify(at(5),True,True,NOW)[0],'suspect')
        self.assertEqual(service.classify(None,True,True,NOW)[0],'no-data')
        self.assertEqual(service.classify(at(700),False,False,NOW)[0],'unverified')
        self.assertEqual(service.classify(at(-10),False,True,NOW)[0],'suspect')

    def test_report_uses_observation_age_not_recent_download_or_change_size(self):
        checked=NOW.isoformat();old=(NOW-timedelta(hours=7)).isoformat()
        archive={'available':True,'rows':[{'station':'bom:540668','kind':'rain-15m',
            'end_at':old,'last_valid':old,'value':0,'payload':'{}'}],
            'sources':[{'source':'rain-15m','checked_at':checked,'issued_at':checked,'status':'ok'}], 'runs':[]}
        result=service.report(archive,current=NOW)
        station=next(r for r in result['rows'] if r['station']=='bom:540668')
        self.assertEqual(station['status'],'out')
        self.assertEqual(station['ageMinutes'],420)
        self.assertEqual(station['lastCheckedAt'],checked)
        archive['sources'][0]['status']='failed'
        self.assertEqual(next(r for r in service.report(archive,current=NOW)['rows'] if r['station']=='bom:540668')['status'],'unverified')

    def test_complete_quarters_only_no_missing_zero_or_partial_totals(self):
        rows=[{'end_at':(NOW-timedelta(minutes=15*i)).isoformat(),'value':0.1} for i in range(4)]
        self.assertEqual(service.aggregate(rows,NOW.isoformat(),60)['depth'],0.4)
        rows[0]['value']=0
        self.assertEqual(service.aggregate(rows,NOW.isoformat(),60)['depth'],0.3)
        rows[0]['value']=None
        missing=service.aggregate(rows,NOW.isoformat(),60)
        self.assertIsNone(missing['depth']);self.assertEqual(missing['validBlocks'],3)
        self.assertIsNone(service.aggregate(rows[1:],NOW.isoformat(),60)['depth'])
        # A neighbouring interval cannot replace the required latest quarter.
        rows[0]={'end_at':(NOW-timedelta(minutes=60)).isoformat(),'value':10}
        self.assertIsNone(service.aggregate(rows,NOW.isoformat(),60)['depth'])
        with self.assertRaises(ValueError): service.aggregate(rows+rows,NOW.isoformat(),60)

    def test_read_only_db_totals_and_aligned_qa_never_fill_from_bulletins(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'archive.sqlite';store=Store(str(path))
            sid,_=store.snapshot(b'test-only', 'fixture','fixture',NOW.isoformat())
            for i in range(4):
                end=(NOW-timedelta(minutes=15*i)).isoformat()
                store.observation(sid,'bom:540668','rainfall',end,900,0.1,'rain-15m',NOW.isoformat())
            for duration,kind,value in [(3600,'rain-1h',0.4),(10800,'rain-3h',5)]:
                store.observation(sid,'bom:540668','rainfall',NOW.isoformat(),duration,value,kind,NOW.isoformat())
            store.db.commit();store.close()
            service.CACHE.clear()
            with patch.dict(os.environ,{'HISTORY_DATABASE_URL':'sqlite:///'+str(path)}):
                result=service.rainfall_history('Ipswich/Brisbane Creeks:goolman:1')
                self.assertTrue(result['available'])
                self.assertEqual(next(r for r in result['totals'] if r['minutes']==60)['depth'],0.4)
                self.assertIsNone(next(r for r in result['totals'] if r['minutes']==180)['depth'])
                self.assertEqual(result['qa'][0]['assessment'],'match')
                self.assertEqual(result['qa'][1]['assessment'],'incomplete')
                archive=service.archive_status()
                self.assertEqual(len(archive['rows']),1)
            connection=service.connect('sqlite:///'+str(path))
            try:
                with self.assertRaises(Exception):connection.execute('DELETE FROM observations')
            finally:connection.close()

    def test_missing_connection_does_not_create_a_database_or_expose_credentials(self):
        service.CACHE.clear()
        with patch.dict(os.environ,{},clear=True):
            self.assertEqual(service.archive_status()['reason'],'not-connected')
        with patch.dict(os.environ,{'HISTORY_DATABASE_URL':'postgresql://private:secret@unreachable/db'}),patch('archive_service.connect',side_effect=OSError('private secret')):
            result=service.archive_status()
            self.assertFalse(result['available']);self.assertNotIn('secret',json.dumps(result))

    def test_live_water_fallback_does_not_claim_archive_or_collector_health(self):
        bulletin={'issuedAt':NOW.isoformat(),'fetchedAt':NOW.isoformat(),'stations':[
            {'stationNumber':'540111','id':'540111','name':'Test gauge','group':'Test group',
             'observedAt':NOW.isoformat(),'level':0,'stationType':'Automatic'}]}
        result=service.report({'available':False,'reason':'not-connected'},bulletin,current=NOW)
        row=next(r for r in result['rows'] if r['kind']=='water-summary')
        self.assertEqual(row['status'],'current')
        self.assertFalse(result['archiveAvailable']);self.assertIsNone(result['collectorRun'])
        self.assertEqual(result['waterBasis'],'live-summary')

if __name__=='__main__':unittest.main()
