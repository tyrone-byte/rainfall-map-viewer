import json
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server
from bom_diagnostic import Diagnostic
from bom_source import BASE

NAME = 'IDQ65900_20261022002300.hcs'
RAW = b'''# HEADER: File Format: BOM-HCS
# HEADER: File Format Version: 2.0
# HEADER: Number of Records: 1
# HEADER: Local ObsTime Offset: 0
# HEADER: Data Fields: IndexNo, SensorType, SensorDataType, SiteIdType, SiteId, ObservationTimestamp, RealValue, Unit, SensorParam1, SensorParam2, Quality, Comment
1,"RN",6,"SR","040004","2026-10-22T00:00:00Z",27.8,"mm","",900,3,"private-source-comment"
'''

class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'report.json'
        self.diagnostic = Diagnostic(self.path)

    def tearDown(self):
        if self.diagnostic.thread:
            self.diagnostic.thread.join(timeout=3)
        self.temp.cleanup()

    def test_two_requests_only_metadata_only_and_no_repeated_download(self):
        listing = (NAME+'\nIDQ65900_../../bad.hcs\nIDQ65910_other.hcs\n').encode()
        with patch('bom_diagnostic.fetch', side_effect=[listing, RAW]) as fetch:
            self.diagnostic.start()
            self.diagnostic.thread.join(timeout=3)
            self.assertFalse(self.diagnostic.thread.is_alive())
            self.diagnostic.start()
            report = self.diagnostic.get()
            self.assertEqual(report['status'], 'passed')
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(fetch.call_args_list[1].args[0], BASE+NAME)
            self.assertEqual(report['recordCount'], 1)
            self.assertEqual(report['stationCount'], 1)
            encoded = json.dumps(report)
            for private in ['27.8', '040004', 'private-source-comment', 'observations']:
                self.assertNotIn(private, encoded)
            self.assertEqual(Diagnostic(self.path).start()['status'], 'passed')
            self.assertEqual(fetch.call_count, 2)
            self.assertFalse((Path(self.temp.name) / NAME).exists())

    def test_failures_report_actual_stage_and_hide_stderr(self):
        cases = [([subprocess.CalledProcessError(6, ['curl'], stderr=b'private stderr')], 'directory', False),
                 ([(NAME+'\n').encode(), subprocess.TimeoutExpired('curl', 25)], 'download', True),
                 ([(NAME+'\n').encode(), b'unsupported source format'], 'validation', True)]
        for index, (responses, stage, directory_ok) in enumerate(cases):
            diagnostic = Diagnostic(Path(self.temp.name) / f'{index}.json')
            with patch('bom_diagnostic.fetch', side_effect=responses) as fetch:
                diagnostic.start(); diagnostic.thread.join(timeout=3)
            report = diagnostic.get()
            self.assertEqual(report['status'], 'failed')
            self.assertEqual(report['failedStage'], stage)
            self.assertEqual(report['directoryReachable'], directory_ok)
            self.assertNotIn('private stderr', json.dumps(report))
            self.assertLessEqual(fetch.call_count, 2)

    def test_no_matching_filename_downloads_nothing(self):
        with patch('bom_diagnostic.fetch', return_value=b'IDQ65910_other.hcs\n') as fetch:
            self.diagnostic.start(); self.diagnostic.thread.join(timeout=3)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(self.diagnostic.get()['status'], 'failed')
        self.assertTrue(self.diagnostic.get()['directoryReachable'])
        self.assertFalse(self.diagnostic.get()['fileDownloaded'])

    def test_parallel_starts_launch_one_test(self):
        entered, release = threading.Event(), threading.Event()
        def fetch(url, listing=False):
            entered.set(); release.wait(timeout=2)
            return (NAME+'\n').encode() if listing else RAW
        with patch('bom_diagnostic.fetch', side_effect=fetch) as download:
            self.diagnostic.start(); entered.wait(timeout=2)
            for _ in range(10):
                self.assertEqual(self.diagnostic.start()['status'], 'running')
            release.set(); self.diagnostic.thread.join(timeout=3)
            self.assertEqual(download.call_count, 2)

    def test_restart_during_test_does_not_falsely_report_success(self):
        report = self.diagnostic.get(); report['status'] = 'running'
        self.path.write_text(json.dumps(report))
        self.assertEqual(Diagnostic(self.path).start()['status'], 'interrupted')

    def test_http_get_is_read_only_and_cross_origin_post_is_rejected(self):
        httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
        base = f'http://127.0.0.1:{httpd.server_port}'
        try:
            with patch('server.diagnostic', self.diagnostic), patch('bom_diagnostic.fetch', side_effect=[(NAME+'\n').encode(), RAW]) as fetch:
                with urlopen(base+'/api/diagnostics/bom') as response:
                    self.assertEqual(json.load(response)['status'], 'not-started')
                    self.assertEqual(response.headers['Cache-Control'], 'no-store')
                self.assertEqual(fetch.call_count, 0)
                with urlopen(base+'/diagnostics/bom') as response:
                    self.assertIn('BoM connection test', response.read().decode())
                self.assertEqual(fetch.call_count, 0)
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(Request(base+'/api/diagnostics/bom', method='POST', headers={'Origin': 'https://other.example'}))
                self.assertEqual(rejected.exception.code, 403)
                with urlopen(Request(base+'/api/diagnostics/bom', method='POST', headers={'Origin': base})) as response:
                    self.assertIn(json.load(response)['status'], ['running', 'passed'])
                self.diagnostic.thread.join(timeout=3)
                with urlopen(base+'/api/diagnostics/bom') as response:
                    self.assertEqual(json.load(response)['status'], 'passed')
                self.assertEqual(fetch.call_count, 2)
        finally:
            httpd.shutdown(); httpd.server_close(); thread.join()

if __name__ == '__main__':
    unittest.main()
