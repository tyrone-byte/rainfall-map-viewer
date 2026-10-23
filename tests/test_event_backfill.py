import tempfile
import unittest
from pathlib import Path
from event_backfill import backfill_event
from history_store import Store

class EventBackfillTests(unittest.TestCase):
    def test_estimates_are_idempotent_preserve_observations_and_are_replaced_by_real_data(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Store(str(Path(folder)/'archive.sqlite'))
            try:
                issued='2026-10-22T00:00:00+00:00'
                snapshot,_=store.snapshot(b'coarse test','fixture','rain-3h',issued)
                store.observation(snapshot,'bom:test','rainfall','2026-10-21T20:00:00+00:00',10800,120,'rain-3h',issued)
                store.observation(snapshot,'bom:missing','rainfall','2026-10-21T20:00:00+00:00',10800,None,'rain-3h',issued)
                store.observation(snapshot,'bom:test','rainfall','2026-10-21T19:00:00+00:00',900,7,'rain-15m',issued)
                store.db.commit()
                result=backfill_event(store)
                self.assertEqual(result['inserted'],11)
                rows=list(store.execute("SELECT * FROM observations WHERE kind='rain-15m' ORDER BY end_at"))
                self.assertEqual(len(rows),12)
                self.assertEqual(sum(r['value'] for r in rows),117)
                self.assertEqual(sum(r['quality']=='ESTIMATED_UNIFORM_3H' for r in rows),11)
                self.assertEqual(backfill_event(store)['inserted'],0)
                # A real observation supersedes an estimate even with an older bulletin issue.
                store.observation(snapshot,'bom:test','rainfall','2026-10-21T18:00:00+00:00',900,3,'rain-15m','2026-10-21T23:00:00+00:00')
                value=store.execute("SELECT value FROM observations WHERE kind='rain-15m' AND end_at=?",('2026-10-21T18:00:00+00:00',)).fetchone()['value']
                self.assertEqual(value,3)
            finally:
                store.close()
