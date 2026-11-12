"""Build viewport-loaded map context from supplied sources; no network requests.
Offline dependencies: pyogrio, pyproj, shapely. Shared boundaries are drawn once.
"""
import hashlib
import json
import math
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path
import pyogrio.raw
from pyproj import Transformer
from shapely import from_wkb, set_precision
from shapely.geometry import mapping, shape, box, LineString, MultiLineString
from shapely.ops import transform, unary_union, linemerge

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/map-context'


def write(name,value):
    path=OUT/name;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,separators=(',',':'))+'\n')


def line_parts(geometry):
    """Keep linework from mixed intersections, ignoring point-only contacts."""
    if geometry.is_empty:return []
    if geometry.geom_type=='LineString':return [geometry] if geometry.length else []
    if hasattr(geometry,'geoms'):
        return [line for part in geometry.geoms for line in line_parts(part)]
    return []


def merge_lines(geometry):
    parts=line_parts(geometry)
    if not parts:return MultiLineString([])
    noded=unary_union(parts)
    if noded.geom_type=='LineString':return noded
    return linemerge(MultiLineString([list(p.coords) for p in line_parts(noded)]))


def boundary_networks(major,minor):
    """Node/dissolve original metric edges before any display simplification.
    A 1 m precision grid stabilises shared coordinates. Major outlines take
    precedence where catchment and subcatchment edges coincide.
    """
    def edges(polygons):
        return merge_lines(unary_union([set_precision(g,1).boundary for g in polygons]))
    primary=edges(major)
    secondary=merge_lines(edges(minor).difference(primary))
    # Simplify unique arcs, preserving junction endpoints rather than separately
    # simplifying neighbouring polygon rings and then drawing them twice.
    primary=merge_lines(primary.simplify(40,preserve_topology=True))
    secondary=merge_lines(secondary.simplify(40,preserve_topology=True).difference(primary))
    return primary,secondary


def tile_lines(geometry,exclusive_edges=False):
    tiles={}
    if geometry.is_empty:return tiles
    x0,y0,x1,y1=geometry.bounds
    for x in range(math.floor(x0),math.floor(x1)+1):
        for y in range(math.floor(y0),math.floor(y1)+1):
            clipped=geometry.intersection(box(x,y,x+1,y+1))
            if exclusive_edges:
                # Half-open ownership prevents duplicate strokes on tile seams.
                clipped=clipped.difference(MultiLineString([[(x+1,y),(x+1,y+1)],[(x,y+1),(x+1,y+1)]]))
            merged=merge_lines(clipped)
            if not merged.is_empty:tiles[(x,y)]=merged
    return tiles


def build():
    source=ROOT/'data/dams/water-plan-source.zip'
    with tempfile.TemporaryDirectory() as temporary:
        with zipfile.ZipFile(source) as archive:
            for info in archive.infolist():
                if not (Path(temporary)/info.filename).resolve().is_relative_to(Path(temporary).resolve()):raise ValueError('Unsafe ZIP path')
            archive.extractall(temporary)
        gdb=next(Path(temporary).glob('*/data.gdb'))
        meta,fids,wkbs,columns=pyogrio.raw.read(gdb,return_fids=True)
    records=[dict(zip(meta['fields'],values)) for values in zip(*columns)]
    project=Transformer.from_crs(meta['crs'],3577,always_xy=True).transform
    geographic=Transformer.from_crs(3577,4326,always_xy=True).transform
    entries=[];polygons={'catchments':[],'subcatchments':[]};counts={'catchments':0,'subcatchments':0};plans=defaultdict(list)
    for fid,wkb,record in zip(fids,wkbs,records):
        if record['status']!='Current':continue
        geometry=from_wkb(wkb)
        if not geometry.is_valid or geometry.is_empty:raise ValueError('Invalid boundary')
        level='subcatchments' if record['feature']=='Subcatchment Area' else 'catchments'
        metric=transform(project,geometry);polygons[level].append(metric);plans[record['waterplan']].append(metric);counts[level]+=1
        display=transform(geographic,metric.simplify(40,preserve_topology=True))
        name=f'boundaries/water-plan-{int(fid)}.geojson'
        props={k:record[k] for k in ('title','feature','waterplan','status')}
        props['level']=level
        # These polygons are hover/highlight areas only. Their edges are not drawn.
        write(name,{'type':'Feature','properties':props,'geometry':mapping(display)})
        entries.append({'file':name,'kind':'areas','level':level,'minimumZoom':12 if level=='subcatchments' else 9,'bounds':list(display.bounds)})
    # The extract omits parent Catchment Area records in several water plans.
    # Retain their low-zoom geographic extent without inventing a drainage basin.
    for plan,parts in sorted(plans.items()):
        metric=unary_union(parts);polygons['catchments'].append(metric)
        display=transform(geographic,metric.simplify(40,preserve_topology=True))
        name='boundaries/overview-'+hashlib.sha256(plan.encode()).hexdigest()[:12]+'.geojson'
        write(name,{'type':'Feature','properties':{'title':plan,'waterplan':plan,'feature':'Water-plan overview (derived from supplied areas)','level':'catchments','derived':True},'geometry':mapping(display)})
        entries.append({'file':name,'kind':'areas','level':'catchments','derived':True,'minimumZoom':9,'bounds':list(display.bounds)})
    primary,secondary=boundary_networks(polygons['catchments'],polygons['subcatchments'])
    primary=merge_lines(transform(geographic,primary))
    secondary=merge_lines(transform(geographic,secondary).difference(primary))
    for level,geometry in [('catchments',primary),('subcatchments',secondary)]:
        for (x,y),line in sorted(tile_lines(geometry,exclusive_edges=True).items()):
            name=f'outlines/{level}/{x}_{y}.geojson'
            write(name,{'type':'Feature','properties':{'level':level},'geometry':mapping(line)})
            entries.append({'file':name,'kind':level,'minimumZoom':12 if level=='subcatchments' else 9,'bounds':list(line.bounds)})
    grouped=defaultdict(list);source_hashes={};input_parts=0
    for path in sorted((ROOT/'public/dam-watercourses').glob('*.geojson')):
        source_hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
        for feature in json.loads(path.read_text())['features']:
            geometry=shape(feature['geometry']);input_parts+=len(line_parts(geometry))
            grouped[feature['properties']['name']].append(geometry)
    tiles=defaultdict(list);merged_parts=0
    for name,parts in sorted(grouped.items()):
        geometry=merge_lines(unary_union(parts));merged_parts+=len(line_parts(geometry))
        for (x,y),clipped in tile_lines(geometry).items():
            tiles[(x,y)].append({'type':'Feature','properties':{'name':name},'geometry':mapping(clipped)})
    for (x,y),features in sorted(tiles.items()):
        file=f'streams/{x}_{y}.geojson';write(file,{'type':'FeatureCollection','features':features})
        entries.append({'file':file,'kind':'streams','minimumZoom':11,'bounds':[x,y,x+1,y+1]})
    manifest={'schemaVersion':2,'attribution':'© The State of Queensland 2025','licence':'CC BY 4.0',
              'boundarySource':'Water plan catchments - Queensland','boundarySHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
              'boundaryCounts':counts,'waterPlanOverviewCount':len(plans),'overviewMethod':'Union of supplied source areas by waterplan; geographic overview only, not newly delineated drainage catchments.','boundaryRendering':'Unique noded edges on a 1 m metric grid, simplified 40 m after dissolving. Shared major/minor edges belong to the major layer. Polygon files supply hover areas only.',
              'streamSource':'Existing supplied Dams named river/larger-creek extracts; partial coverage, not a complete stream network.',
              'streamSourceSHA256':source_hashes,'streamContinuity':'Exact touching segments dissolved and line-merged by name; mixed-intersection linework retained. No endpoint snapping, buffering, bridging or inferred connections.',
              'streamPartsBeforeDissolving':input_parts,'streamPartsAfterMerging':merged_parts,
              'boundaryMinimumZoom':9,'subcatchmentMinimumZoom':12,'streamMinimumZoom':11,'labelMinimumZoom':13,
              'note':'Water-plan areas are context, not verified upstream gauge catchments. Only supplied creek subcatchments are shown. Stream coverage is partial.',
              'entries':entries}
    write('index.json',manifest)
    # Remove only obsolete generated assets, never original Dams inputs.
    wanted={entry['file'] for entry in entries}
    for directory in ['boundaries','outlines','streams']:
        for path in (OUT/directory).rglob('*.geojson'):
            if path.relative_to(OUT).as_posix() not in wanted:path.unlink()
    print(json.dumps({'boundaryCounts':counts,'outlineTiles':sum(e['kind'] in counts for e in entries),'streamTiles':len(tiles),'names':len(grouped),'inputStreamParts':input_parts,'mergedStreamParts':merged_parts}))

if __name__=='__main__':build()
