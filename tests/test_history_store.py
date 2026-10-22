import csv
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from collector import ingest, export_csv, collect
from history_store import Store
from rainfall import parse

class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.store = Store(':memory:')

    def tearDown(self):
        self.store.close()

    def count(self, table):
        return self.store.execute(f'SELECT COUNT(*) AS n FROM {table}').fetchone()['n']

    def observation(self, capture, value, issue, duration=900):
        sid, _ = self.store.snapshot(capture.encode(), 'test', 'rain-15m', issue)
        return self.store.observation(sid, 'bom:012345', 'rainfall', '2026-10-22T00:00:00Z',
            duration, value, 'rain-15m', issue)

    def test_dedup_revisions_and_out_of_order_imports(self):
        self.observation('a', 2, '2026-10-22T00:01:00Z')
        self.observation('b', 3, '2026-10-22T00:02:00Z')
        self.observation('c', 3, '2026-10-22T00:04:00Z')
        self.observation('older-correction', 9, '2026-10-22T00:03:00Z')
        self.assertEqual(self.count('observations'), 1)
        self.assertEqual(self.count('revisions'), 2)
        row = self.store.execute('SELECT * FROM observations').fetchone()
        self.assertEqual(row['value'], 3)
        self.assertEqual(row['issued_at'], '2026-10-22T00:04:00+00:00')

    def test_missing_zero_and_distinct_resolutions_in_export(self):
        self.observation('missing', None, '2026-10-22T00:01:00Z')
        self.observation('hourly', 0, '2026-10-22T00:01:00Z', 3600)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rain.csv'; export_csv(self.store, path)
            with path.open() as capture:
                rows = list(csv.DictReader(capture))
        self.assertEqual(len(rows), 2)
        self.assertEqual({r['duration_seconds']: r['value'] for r in rows}, {'900': '', '3600': '0.0'})

    def test_real_bulletin_is_idempotent_and_native(self):
        raw = Path('tests/fixtures/bulletin.html').read_bytes()
        count = ingest(self.store, raw, 'test.html')
        self.assertEqual(count, 321 * 8)
        self.assertEqual(ingest(self.store, raw, 'test.html'), 0)
        self.assertEqual(self.count('snapshots'), 1)
        self.assertEqual(self.count('observations'), count)
        self.assertEqual(self.store.execute('SELECT MIN(duration_seconds) AS n FROM observations').fetchone()['n'], 10800)
        self.assertTrue(self.store.execute("SELECT id FROM observations WHERE station='bom:540668'").fetchone())

    def test_network_failure_preserves_existing_data_and_reports_each_source(self):
        self.observation('existing', 2, '2026-10-22T00:01:00Z')
        self.store.db.commit()
        with patch('collector.fetch', side_effect=OSError('offline')), patch('collector.time.sleep'):
            _, errors = collect(self.store)
        self.assertEqual(len(errors), 4)
        self.assertEqual(self.count('observations'), 1)
        self.assertEqual(self.count('source_status'), 4)

    def test_hourly_heading_spacing_is_not_accepted_as_three_hour(self):
        raw = Path('tests/fixtures/bulletin.html').read_text()
        with self.assertRaises(ValueError):
            parse(raw.replace('3 hour period ending', '1 hour period ending'), period_hours=1)

    def test_reject_malformed_source_without_storing_snapshot(self):
        with self.assertRaises(ValueError):
            ingest(self.store, b'<html>source unavailable</html>', 'test.html')
        self.assertEqual(self.count('snapshots'), 0)

    def test_complete_collection_skips_known_ftp_files_on_next_run(self):
        from test_bom_hcs import HEADER, ROWS
        issued = datetime.now(timezone.utc).isoformat()
        hcs = b'# HEADER: File Generation Date: ' + issued.encode() + b'\n' + HEADER + ROWS.replace(b'040004', b'540668')
        rain = parse(Path('tests/fixtures/bulletin.html').read_text())
        rain['issuedAt'] = issued
        hourly = json.loads(json.dumps(rain))
        for period in hourly['periods']:
            period['start'] = (datetime.fromisoformat(period['end'])-timedelta(hours=1)).isoformat()
        summary = {'issuedAt': issued, 'stations': [], 'warnings': []}
        name = 'IDQ65900_20261022002300.hcs'
        def response(url, listing=False):
            if listing: return (name+'\n').encode()
            if url.endswith('.hcs'): return hcs
            return json.dumps(hourly if 'IDQ60336' in url else summary if 'IDQ60286' in url else rain).encode()
        with patch('collector.fetch', side_effect=response) as fetch, patch('collector.time.sleep'):
            results, errors = collect(self.store)
            self.assertEqual(errors, [])
            self.assertEqual(results['rain-15m'], 2)
            self.assertEqual(fetch.call_count, 5)
            fetch.reset_mock()
            second, errors = collect(self.store)
            self.assertEqual(errors, [])
            self.assertEqual(fetch.call_count, 4)  # Listing + three web sources, no repeated FTP download.
            self.assertTrue(all(n == 0 for n in second.values()))
        self.assertEqual(self.count('source_status'), 4)

    def test_explicit_water_history_datum_and_order_retained(self):
        raw = json.dumps({'stationNumber': '012345', 'issuedAt': '2026-10-22T01:00:00+10:00',
            'datum': 'AHD', 'observations': [{'time': '2026-10-22T00:00:00+10:00', 'level': 2},
            {'time': '2026-10-22T00:00:00+10:00', 'level': 2.1}]}).encode()
        ingest(self.store, raw, 'history.json')
        self.assertEqual(self.count('revisions'), 2)
        row = self.store.execute('SELECT * FROM observations').fetchone()
        self.assertEqual(row['datum'], 'AHD')
        self.assertEqual(row['value'], 2.1)
        self.assertEqual(row['end_at'], '2026-10-21T14:00:00+00:00')

    def test_bad_old_ftp_file_does_not_block_newer_valid_observations(self):
        from test_bom_hcs import HEADER, ROWS
        issued = datetime.now(timezone.utc).isoformat()
        hcs = b'# HEADER: File Generation Date: ' + issued.encode() + b'\n' + HEADER + ROWS.replace(b'040004', b'540668')
        older, newer = 'IDQ65900_20261022002300.hcs', 'IDQ65900_20261022003800.hcs'
        def response(url, listing=False):
            if listing: return (older+'\n'+newer+'\n').encode()
            if url.endswith(older): return b'Unexpected new source format'
            if url.endswith(newer): return hcs
            raise OSError('offline')
        with patch('collector.fetch', side_effect=response), patch('collector.time.sleep'):
            results, errors = collect(self.store)
        self.assertEqual(results['rain-15m'], 2)
        self.assertEqual(len(errors), 4)
        self.assertEqual(self.count('observations'), 2)
        self.assertEqual(self.store.execute("SELECT status FROM source_status WHERE source='rain-15m'").fetchone()['status'], 'failed')

if __name__ == '__main__':
    unittest.main()
