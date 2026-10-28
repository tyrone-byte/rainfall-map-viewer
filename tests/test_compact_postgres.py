"""Optional real PostgreSQL migration check; creates its own disposable local test DB."""
import json
import os
import unittest
import uuid
from unittest.mock import patch
from urllib.parse import urlsplit,urlunsplit

from history_store import Store
from compact_history import migrate,reclaim_space
import archive_service as api

@unittest.skipUnless(os.environ.get('TEST_POSTGRES_URL'),'Set TEST_POSTGRES_URL to an isolated local PostgreSQL server.')
class TypedPostgresTests(unittest.TestCase):
    def test_migration_reopen_real_writes_and_legacy_readers(self):
        import psycopg
        from psycopg import sql
        from test_bom_hcs import HEADER,ROWS
        parsed=urlsplit(os.environ['TEST_POSTGRES_URL'])
        self.assertIn(parsed.hostname,('localhost','127.0.0.1'),'Integration test only accepts local test servers.')
        name='rainfall_archive_test_'+uuid.uuid4().hex
        admin=psycopg.connect(os.environ['TEST_POSTGRES_URL'],autocommit=True)
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        url=urlunsplit(parsed._replace(path='/'+name))
        store=None
        try:
            store=Store(url);issued='2026-10-22T01:00:00+00:00'
            raw=b'# HEADER: File Generation Date: '+issued.encode()+b'\n'+HEADER+ROWS
            snap,_=store.snapshot(raw,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_test.hcs','rain-15m',issued)
            store.observation(snap,'bom:540668','rainfall',issued,900,0,'rain-15m',issued,quality='3')
            water,_=store.snapshot(b'water fixture','https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60286.html','water-summary',issued)
            store.observation(water,'bom:540111','water-level',issued,0,-0.2,'water-summary',issued,datum='AHD',metadata={'name':'Mitchelton','group':'Brisbane','timeBasis':'Inferred'})
            store.observation(water,'bom:540668','rainfall',issued,10800,99,'rain-3h',issued)
            for hour,value in ((2,1),(3,0)):
                later=f'2026-10-22T0{hour}:00:00+00:00'
                corrected,_=store.snapshot(raw.replace(issued.encode(),later.encode()),f'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_correction_{hour}.hcs','rain-15m',later)
                store.observation(corrected,'bom:540668','rainfall',issued,900,value,'rain-15m',later,quality='3')
            store.db.commit();store.close();store=Store(url,compact=True)
            cleanup=migrate(store)
            self.assertEqual(cleanup['original_verified']['records'],2)
            self.assertEqual(cleanup['recovered_statewide_readings'],2)
            self.assertEqual(cleanup['retained']['records'],4)
            old_states=[json.loads(r['payload']) for r in store.execute('SELECT payload FROM revisions ORDER BY archived_at')]
            self.assertEqual([r['value'] for r in old_states],[0,1])
            self.assertTrue(all(r.get('source_product')=='IDQ65900' for r in old_states))
            reclaim_space(store);store.close();store=Store(url)
            self.assertTrue(store.normalised)
            snap,_=store.snapshot(b'new update','ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900_new.hcs','rain-15m','2026-10-22T04:00:00Z')
            self.assertFalse(store.observation(snap,'bom:540668','rainfall',issued,900,0,'rain-15m','2026-10-22T04:00:00Z',quality='3'))
            self.assertTrue(store.observation(snap,'bom:540668','rainfall',issued,900,2,'rain-15m','2026-10-22T04:00:00Z',quality='3'))
            self.assertFalse(store.observation(snap,'bom:540668','rainfall',issued,900,9,'rain-15m','2026-10-22T03:30:00Z',quality='3'))
            store.db.commit()
            self.assertTrue(store.observation(snap,'bom:999997','rainfall',issued,900,1,'rain-15m','2026-10-22T04:00:00Z'))
            store.rollback()
            self.assertTrue(store.observation(snap,'bom:999997','rainfall',issued,900,1,'rain-15m','2026-10-22T04:00:00Z'))
            store.db.commit()
            with patch.dict(os.environ,{'HISTORY_DATABASE_URL':url}):
                api.CACHE.clear();extent=api.rainfall_extent();self.assertEqual(extent['lastEnd'],issued)
                frame=api.rainfall_frame(issued,15);self.assertTrue(frame['available'])
                basin=api.rainfall_frame(issued,15,'brisbane-bremer-pine-caboolture');self.assertTrue(basin['available'])
                self.assertTrue(all(s['basinId']=='brisbane-bremer-pine-caboolture' for s in basin['stations']))
                series=api.rainfall_series('Ipswich/Brisbane Creeks:goolman:1',issued)
                self.assertTrue(series['available']);self.assertEqual(series['stations'][0]['values'][-1],2)
                goolman=next(s for s in frame['stations'] if s['stationNumber']=='540668');self.assertEqual(goolman['depth'],2)
                water_extent=api.water_extent();self.assertEqual(water_extent['lastEnd'],issued)
                water_frame=api.water_frame(issued,1440,'brisbane-bremer-pine-caboolture')
                river=next(g for g in water_frame['stations'] if g['id']=='540111')
                self.assertEqual(river['level'],-0.2);self.assertEqual(river['datum'],'AHD')
                water_series=api.water_series('540111',issued,1440)
                self.assertEqual(water_series['observations'][0]['level'],-0.2)
                stats=api.rainfall_group_stats();self.assertTrue(stats['available'])
                self.assertTrue(all(g['completeGauges']==0 for g in stats['groups']))
                status=api.archive_status();self.assertTrue(status['available'])
                level=next(r for r in status['rows'] if r['kind']=='water-summary')
                self.assertEqual(json.loads(level['payload'])['metadata']['name'],'Mitchelton')
            from collector import ingest_water_ftp
            from water_ftp_cutover import cutover
            raw_water=__import__('pathlib').Path('tests/fixtures/water-ftp.hcs').read_bytes()
            rain_before=store.execute('SELECT COUNT(*) AS n FROM history_readings WHERE kind_id=1').fetchone()['n']
            self.assertEqual(ingest_water_ftp(store,raw_water,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65911_test.hcs'),10)
            self.assertEqual(ingest_water_ftp(store,raw_water,'ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65910_test.hcs'),0)
            switched=cutover(store)
            self.assertEqual(switched['removedWebWaterReadings'],1)
            self.assertEqual(switched['retainedNumericFTPReadings'],10)
            self.assertEqual(store.execute('SELECT COUNT(*) AS n FROM history_readings WHERE kind_id=1').fetchone()['n'],rain_before)
            with patch.dict(os.environ,{'HISTORY_DATABASE_URL':url}):
                api.CACHE.clear()
                actual=api.water_series('040835',minutes=1440)
                self.assertEqual([r['level'] for r in actual['observations']],[2.561,2.552,2.549])
                water_frame=api.water_frame(minutes=10080,basin='brisbane-bremer-pine-caboolture')
                moving=next(g for g in water_frame['stations'] if g['id']=='040835')
                self.assertEqual(moving['direction'],'falling')
                self.assertAlmostEqual(moving['ratePerHour'],-.0096)
            from datetime import datetime,timedelta
            end_time=datetime.fromisoformat(issued)
            for i in range(1,672):
                store.observation(snap,'bom:540668','rainfall',(end_time-timedelta(minutes=15*i)).isoformat(),900,.1,'rain-15m','2026-10-22T04:00:00Z')
            store.db.commit()
            with patch.dict(os.environ,{'HISTORY_DATABASE_URL':url}):
                api.CACHE.clear();week=api.rainfall_frame(issued,10080,'brisbane-bremer-pine-caboolture')
                gauge=next(g for g in week['stations'] if g['stationNumber']=='540668')
                self.assertEqual(gauge['depth'],69.1);self.assertEqual(gauge['validBlocks'],672)
                self.assertEqual(len(api.rainfall_series('Ipswich/Brisbane Creeks:goolman:1',issued,10080)['periods']),672)


        finally:
            if store:store.close()
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)));admin.close();api.CACHE.clear()
