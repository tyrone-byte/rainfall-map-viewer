import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import urlopen
import context_assets
import server

class ContextAssetTests(unittest.TestCase):
    def test_geometry_changes_invalidate_the_content_version(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);folder=root/'public/map-context';folder.mkdir(parents=True)
            (folder/'index.json').write_text(json.dumps({'schemaVersion':2,'entries':[]}));geometry=folder/'test.geojson';geometry.write_text('{}')
            with patch.object(context_assets,'__file__',str(root/'context_assets.py')):
                context_assets.manifest.cache_clear();before=context_assets.manifest()['assetVersion'];geometry.write_text('{"features":[]}');context_assets.manifest.cache_clear();after=context_assets.manifest()['assetVersion'];self.assertNotEqual(before,after)
        context_assets.manifest.cache_clear()
    def test_only_current_versioned_geometry_is_immutable_observations_are_not(self):
        httpd=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);thread=threading.Thread(target=httpd.serve_forever,daemon=True);thread.start()
        try:
            base=f'http://127.0.0.1:{httpd.server_port}'
            with urlopen(base+'/map-context/index.json') as response:
                index=json.load(response);self.assertEqual(response.headers['Cache-Control'],'no-store')
            entry=index['entries'][0]
            with urlopen(base+'/map-context/'+entry['file']+'?v='+index['assetVersion']) as response:self.assertIn('immutable',response.headers['Cache-Control'])
            with urlopen(base+'/map-context/'+entry['file']+'?v=old') as response:self.assertEqual(response.headers['Cache-Control'],'no-store')
            with urlopen(base+'/api/archive-rainfall/extent') as response:self.assertEqual(response.headers['Cache-Control'],'no-store')
        finally:httpd.shutdown();httpd.server_close();thread.join()
