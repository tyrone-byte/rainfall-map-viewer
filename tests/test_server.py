import json
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import server
from rainfall import parse

class CacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.cache=Path(self.tmp.name)
        self.patch=patch.object(server,'CACHE',self.cache)
        self.patch.start()
    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()
    def test_live_fetch_parses_and_persists(self):
        raw=Path('tests/fixtures/bulletin.html').read_bytes()
        with patch('server.subprocess.run',return_value=subprocess.CompletedProcess([],0,raw,b'')) as fetch:
            data=server.load_data()
            self.assertEqual(len(data['stations']),321)
            self.assertEqual(sum(s['coordinates'] is not None for s in data['stations']),181)
            self.assertIsNone(data['refreshError'])
            self.assertTrue((self.cache/'bulletin.json').exists())
            self.assertEqual(server.load_data()['fetchedAt'],data['fetchedAt'])
            self.assertEqual(fetch.call_count,1)
    def test_bad_refresh_preserves_last_good_readings(self):
        data=parse(Path('tests/fixtures/bulletin.html').read_text())
        data['fetchedAt']=datetime.now(timezone.utc).isoformat()
        cache=self.cache/'bulletin.json';cache.write_text(json.dumps(data));before=cache.read_bytes()
        with patch('server.subprocess.run',return_value=subprocess.CompletedProcess([],0,b'<html>Forbidden</html>',b'')):
            result=server.load_data(refresh=True)
        self.assertIsNotNone(result['refreshError'])
        self.assertEqual(result['stations'][0]['values'],data['stations'][0]['values'])
        self.assertEqual(cache.read_bytes(),before)
    def test_initial_network_failure_does_not_fabricate_data(self):
        with patch('server.subprocess.run',side_effect=subprocess.CalledProcessError(22,['curl'])):
            with self.assertRaises(ValueError):server.load_data()
        self.assertFalse((self.cache/'bulletin.json').exists())

class BrowserCacheTests(unittest.TestCase):
    def test_deployment_serves_versioned_uncached_application_files(self):
        import threading
        from urllib.request import urlopen
        httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=httpd.serve_forever,daemon=True)
        thread.start()
        try:
            base=f'http://127.0.0.1:{httpd.server_port}'
            with urlopen(base+'/') as response:
                html=response.read().decode()
                self.assertEqual(response.headers.get('Cache-Control'),'no-store')
                self.assertIn('/history.js?v=mobile-panels-8',html)
                self.assertTrue(response.url.endswith('/history'))
                self.assertNotIn('href="/water"',html)
                self.assertIn('>Water levels</a>',html)
                self.assertIn('/ifd-view.js?v=mobile-panels-8',html)
            with urlopen(base+'/history.js?v=mobile-panels-8') as response:
                self.assertEqual(response.headers.get('Cache-Control'),'no-store')
                self.assertIn('renderIfd(series)',response.read().decode())
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join()
