"""Validate and import documented ARR Data Hub coordinate-query results."""
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

REQUIRED_AEPS={50,20,10,5,2,1,.1}

def location_key(lat,lon):
    return f'{lat:.6f},{lon:.6f}'

def request_url(lat,lon):
    return 'https://data.arr-software.org/?'+urlencode({'lat_coord':lat,'lon_coord':lon,'type':'json','CCAdjIFDDatasets':1})

def numeric(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def normalize(payload,lat,lon):
    if not numeric(lat) or not numeric(lon) or not -90<=lat<=90 or not -180<=lon<=180:
        raise ValueError('Invalid requested coordinates.')
    position=payload.get('input_data',{})
    for field,expected in [('Latitude',lat),('Longitude',lon)]:
        actual=position.get(field)
        if not numeric(actual) or abs(actual-expected)>1e-6:
            raise ValueError(f'ARR {field} does not match the requested gauge coordinate.')
    layer=payload.get('layers',{}).get('CCAdjIFDDatasets',{})
    if not isinstance(layer,dict):raise ValueError('Climate-adjusted IFD layer not recognised.')
    datasets=[]
    for name,table in layer.items():
        match=re.fullmatch(r'(.+) \(2030 Baseline - (SSP[1235])\)',name)
        if not match:continue
        aeps=table.get('columns',[]);durations=table.get('index',[]);rows=table.get('data',[])
        if not aeps or any(not numeric(v) or not 0<v<=100 for v in aeps) or len(set(aeps))!=len(aeps) or not REQUIRED_AEPS.issubset(aeps):
            raise ValueError(f'Invalid AEP columns: {name}')
        if not durations or any(not numeric(v) or v<=0 for v in durations) or any(b<=a for a,b in zip(durations,durations[1:])):
            raise ValueError(f'Invalid duration axis: {name}')
        if len(rows)!=len(durations) or any(len(row)!=len(aeps) or any(not numeric(v) or v<0 for v in row) for row in rows):
            raise ValueError(f'Invalid rainfall depths: {name}')
        datasets.append({'name':name,'family':match[1],'scenario':match[2],'horizon':2030,'units':'mm',
                         'aeps':aeps,'points':[{'minutes':duration,'depths':row} for duration,row in zip(durations,rows)]})
    if not datasets:raise ValueError('No valid 2030 climate-adjusted IFD tables supplied.')
    return {'schemaVersion':1,'coordinates':{'lat':lat,'lon':lon},'locationKey':location_key(lat,lon),
            'datahubVersion':payload.get('datahub_version'),'source':request_url(lat,lon),
            'datasets':datasets,'attribution':'ARR Data Hub; design rainfall depth datasets as labelled by source.'}

def import_result(raw,lat,lon,output_root,acquisition='Manual upload',fetched_at=None):
    data=normalize(json.loads(raw),lat,lon)
    digest=hashlib.sha256(raw).hexdigest();name=hashlib.sha256(data['locationKey'].encode()).hexdigest()[:16]
    root=Path(output_root);(root/'locations').mkdir(parents=True,exist_ok=True);(root/'raw').mkdir(exist_ok=True)
    data.update(rawSha256=digest,importedAt=datetime.now(timezone.utc).isoformat(),fetchedAt=fetched_at,acquisition=acquisition)
    # Keep the original response for traceability, including the other horizons.
    (root/'raw'/f'{name}.json').write_bytes(raw)
    target=root/'locations'/f'{name}.json';temp=target.with_suffix('.tmp');temp.write_text(json.dumps(data,indent=2)+'\n');temp.replace(target)
    index_file=root/'index.json';index=json.loads(index_file.read_text()) if index_file.exists() else {'schemaVersion':1,'locations':{}}
    index['locations'][data['locationKey']]={'file':name+'.json','lat':lat,'lon':lon,'datasetCount':len(data['datasets'])}
    temp=index_file.with_suffix('.tmp');temp.write_text(json.dumps(index,indent=2)+'\n');temp.replace(index_file)
    return data
