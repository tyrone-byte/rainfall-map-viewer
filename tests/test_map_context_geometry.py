"""Offline builder checks; GIS packages are not server runtime dependencies."""
import importlib.util
import unittest

GIS=all(importlib.util.find_spec(m) for m in ['shapely','pyproj','pyogrio'])

@unittest.skipUnless(GIS,'Optional GIS builder dependencies not installed')
class MapContextGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from tools import build_map_context
        cls.builder=build_map_context

    def test_shared_boundary_is_drawn_once_and_major_edges_win(self):
        from shapely.geometry import box
        major,minor=self.builder.boundary_networks([box(0,0,1000,1000),box(1000,0,2000,1000)],
            [box(0,0,500,1000),box(500,0,1000,1000)])
        self.assertAlmostEqual(major.length,7000)
        self.assertAlmostEqual(minor.length,1000)
        self.assertAlmostEqual(major.intersection(minor).length,0)
        self.assertAlmostEqual(major.union(minor).length,major.length+minor.length)

    def test_mixed_intersections_retain_lines_and_exact_connections_merge(self):
        from shapely.geometry import GeometryCollection,LineString,Point
        geometry=GeometryCollection([LineString([(0,0),(1,0)]),Point(1,1)])
        self.assertEqual(len(self.builder.line_parts(geometry)),1)
        merged=self.builder.merge_lines(GeometryCollection([geometry,LineString([(1,0),(2,0)])]))
        self.assertEqual(merged.geom_type,'LineString')
        self.assertAlmostEqual(merged.length,2)

    def test_stream_gaps_are_not_snapped_or_bridged(self):
        from shapely.geometry import MultiLineString
        source=MultiLineString([[(0,0),(1,0)],[(1.1,0),(2.1,0)]])
        result=self.builder.merge_lines(source)
        self.assertEqual(result.geom_type,'MultiLineString')
        self.assertAlmostEqual(result.length,source.length)
        self.assertTrue(result.equals(source))

    def test_tile_edge_ownership_cannot_double_stroke_a_boundary(self):
        from shapely.geometry import MultiLineString
        geometry=MultiLineString([[(152.5,-27.5),(153,-27.5)],[(153,-27.9),(153,-27.1)]])
        tiles=self.builder.tile_lines(geometry,exclusive_edges=True)
        self.assertAlmostEqual(sum(g.length for g in tiles.values()),geometry.length)
        self.assertAlmostEqual(tiles[(152,-28)].intersection(tiles[(153,-28)]).length,0)

    def test_generated_outline_tiles_have_no_duplicate_strokes(self):
        import json
        from shapely.geometry import shape
        from shapely.ops import unary_union
        root=self.builder.OUT
        manifest=json.loads((root/'index.json').read_text())
        networks={}
        for kind in ['catchments','subcatchments']:
            parts=[shape(json.loads((root/e['file']).read_text())['geometry']) for e in manifest['entries'] if e['kind']==kind]
            network=unary_union(parts)
            self.assertAlmostEqual(sum(g.length for g in parts),network.length,places=8)
            networks[kind]=network
        # Geographic tile intersections introduce sub-millimetre aggregate
        # floating-point slivers. Tolerance is about 1 cm over the whole state.
        self.assertLess(networks['catchments'].intersection(networks['subcatchments']).length,1e-7)
