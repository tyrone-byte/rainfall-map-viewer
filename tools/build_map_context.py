"""Build viewport-loadable geographic context from existing supplied sources.
Offline only: pyogrio, pyproj, shapely. No network requests or source changes.
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
from shapely import from_wkb
from shapely.geometry import shape, mapping, box
from shapely.ops import transform, unary_union

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/map-context'

def write(name, value):
    path=OUT/name;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,separators=(',',':'))+'\n')

def build():
    source=ROOT/'data/dams/water-plan-source.zip'
    with tempfile.TemporaryDirectory() as temporary:
        with zipfile.ZipFile(source) as archive:
            for info in archive.infolist():
                target=(Path(temporary)/info.filename).resolve()
                if not target.is_relative_to(Path(temporary).resolve()):raise ValueError('Unsafe ZIP path')
            archive.extractall(temporary)
        gdb=next(Path(temporary).glob('*/data.gdb'))
        meta,fids,wkbs,columns=pyogrio.raw.read(gdb,return_fids=True)
    records=[dict(zip(meta['fields'],values)) for values in zip(*columns)]
    project=Transformer.from_crs(meta['crs'],3577,always_xy=True).transform
    geographic=Transformer.from_crs(3577,4326,always_xy=True).transform
    entries=[]
    for fid,wkb,record in zip(fids,wkbs,records):
        if record['status']!='Current':continue
        geometry=from_wkb(wkb)
        if not geometry.is_valid or geometry.is_empty:raise ValueError('Invalid boundary')
        geometry=transform(geographic,transform(project,geometry).simplify(40,preserve_topology=True))
        name=f'boundaries/water-plan-{int(fid)}.geojson'
        props={k:record[k] for k in ('title','feature','waterplan','status')}
        write(name,{'type':'Feature','properties':props,'geometry':mapping(geometry)})
        entries.append({'file':name,'kind':'catchments','bounds':list(geometry.bounds)})
    # Only reuse actual saved stream segments. This cannot establish statewide coverage.
    grouped=defaultdict(list);source_hashes={}
    for path in sorted((ROOT/'public/dam-watercourses').glob('*.geojson')):
        source_hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
        for f in json.loads(path.read_text())['features']:
            grouped[f['properties']['name']].append(shape(f['geometry']))
    tiles=defaultdict(list)
    for name,parts in sorted(grouped.items()):
        geometry=unary_union(parts)
        x0,y0,x1,y1=geometry.bounds
        for x in range(math.floor(x0),math.floor(x1)+1):
            for y in range(math.floor(y0),math.floor(y1)+1):
                clipped=geometry.intersection(box(x,y,x+1,y+1))
                if clipped.is_empty or clipped.geom_type not in ('LineString','MultiLineString'):continue
                tiles[(x,y)].append({'type':'Feature','properties':{'name':name},'geometry':mapping(clipped)})
    for (x,y),features in sorted(tiles.items()):
        file=f'streams/{x}_{y}.geojson'
        write(file,{'type':'FeatureCollection','features':features})
        entries.append({'file':file,'kind':'streams','bounds':[x,y,x+1,y+1]})
    write('index.json',{'schemaVersion':1,'attribution':'© The State of Queensland 2025','licence':'CC BY 4.0',
          'boundarySource':'Water plan catchments - Queensland','boundarySHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'streamSource':'Existing supplied Dams named river/larger-creek extracts; partial coverage, not a complete stream network.',
          'streamSourceSHA256':source_hashes,'boundaryMinimumZoom':9,'streamMinimumZoom':11,'labelMinimumZoom':13,
          'note':'Water-plan areas are geographic context, not verified upstream gauge catchments. Unnamed tributaries and gullies are omitted.',
          'entries':entries})
    print(json.dumps({'currentBoundaries':sum(e['kind']=='catchments' for e in entries),'streamTiles':len(tiles),'namedStreams':len(grouped)}))

if __name__=='__main__':build()
