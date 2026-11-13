"""Build group navigation footprints from catalogue gauge coordinates only.
These convex hulls are navigation aids, not catchment or coverage boundaries.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def hull(points):
    points=sorted(set(points))
    if len(points)<3:return points
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    lower=[]
    for p in points:
        while len(lower)>1 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    upper=[]
    for p in reversed(points):
        while len(upper)>1 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    return lower[:-1]+upper[:-1]


def build():
    output={'schemaVersion':1,'method':'Convex hull of saved mapped gauge coordinates for navigation only; not hydrological boundaries or verified spatial coverage. Overlapping footprints require a user choice.','sources':{},'rain':[],'water':[]}
    for kind,file in [('rain','rainfall-groups.json'),('water','water-groups.json')]:
        source=ROOT/'data'/file;data=json.loads(source.read_text());output['sources'][file]=hashlib.sha256(source.read_bytes()).hexdigest()
        for group in data['groups']:
            coords=sorted({(s['coordinates']['lon'],s['coordinates']['lat']) for s in data['stations'] if s['basinId']==group['id'] and s.get('coordinates')})
            if not coords:continue
            if not all(math.isfinite(x) and math.isfinite(y) and -180<=x<=180 and -90<=y<=90 for x,y in coords):raise ValueError('Invalid coordinates')
            center=(sum(x for x,y in coords)/len(coords),sum(y for x,y in coords)/len(coords))
            anchor=min(coords,key=lambda p:(p[0]-center[0])**2+(p[1]-center[1])**2)
            output[kind].append({'id':group['id'],'label':group['label'],'mappedGaugeCount':len(coords),
                'anchor':[anchor[1],anchor[0]],'locations':[[y,x] for x,y in coords],'bounds':[min(x for x,y in coords),min(y for x,y in coords),max(x for x,y in coords),max(y for x,y in coords)],
                'footprint':hull(coords)})
    target=ROOT/'public/gauge-group-overview.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(output,separators=(',',':'))+'\n');temp.replace(target)
    print({kind:len(output[kind]) for kind in ['rain','water']})

if __name__=='__main__':build()
