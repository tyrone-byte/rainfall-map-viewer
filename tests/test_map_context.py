import json
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/'public'

class MapContextDataTests(unittest.TestCase):
    def test_manifest_has_valid_local_files_and_preserves_dam_boundary_coverage(self):
        manifest=json.loads((ROOT/'map-context/index.json').read_text())
        self.assertEqual(manifest['schemaVersion'],1)
        self.assertIn('partial',manifest['streamSource'])
        entries=manifest['entries'];files={e['file'] for e in entries}
        self.assertEqual(len(files),len(entries))
        self.assertEqual(sum(e['kind']=='catchments' for e in entries),187)
        self.assertTrue({f'boundaries/{p.name}' for p in (ROOT/'dam-boundaries').glob('*.geojson')}.issubset(files))
        for entry in entries:
            file=(ROOT/'map-context'/entry['file']).resolve()
            self.assertTrue(file.is_relative_to((ROOT/'map-context').resolve()))
            geo=json.loads(file.read_text());west,south,east,north=entry['bounds']
            self.assertTrue(-180<=west<east<=180)
            self.assertTrue(-90<=south<north<=90)
            features=geo['features'] if geo['type']=='FeatureCollection' else [geo]
            self.assertTrue(features)
            def coordinates(items):
                if len(items)>=2 and isinstance(items[0],(int,float)):
                    yield items
                else:
                    for child in items:yield from coordinates(child)
            for feature in features:
                self.assertTrue(feature['properties'].get('name') or feature['properties'].get('title'))
                for lon,lat,*rest in coordinates(feature['geometry']['coordinates']):
                    self.assertTrue(west-1e-8<=lon<=east+1e-8)
                    self.assertTrue(south-1e-8<=lat<=north+1e-8)
