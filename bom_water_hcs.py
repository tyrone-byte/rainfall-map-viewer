"""Validated instantaneous BoM river heights; no timestamp alignment or interpolation."""
import csv
import io
import math
import re
from datetime import datetime,timezone
from bom_hcs import FIELDS

def parse_water_hcs(raw):
    headers={};lines=[]
    for line in raw.decode('utf-8-sig').splitlines():
        if line.startswith('# HEADER: '):
            k,sep,v=line.removeprefix('# HEADER: ').partition(': ')
            if sep:headers[k]=v
        elif line and not line.startswith('#'):lines.append(line)
    if headers.get('File Format')!='BOM-HCS' or headers.get('File Format Version')!='2.0':raise ValueError('Unknown water HCS format.')
    if [f.strip() for f in headers.get('Data Fields','').split(',')]!=FIELDS:raise ValueError('Water HCS columns changed.')
    if headers.get('Local ObsTime Offset')!='0':raise ValueError('Unknown water time offset.')
    issued=datetime.fromisoformat(headers.get('File Generation Date','').replace('Z','+00:00'))
    if issued.utcoffset() is None:raise ValueError('Water issue timezone missing.')
    observations=[]
    for values in csv.reader(io.StringIO('\n'.join(lines))):
        if len(values)!=len(FIELDS):raise ValueError('Malformed water HCS row.')
        r=dict(zip(FIELDS,values))
        if (r['SensorType'],r['SensorDataType'],r['SiteIdType'],r['Unit'])!=('WL','1','SR','metres'):raise ValueError('Unknown water measurement definition.')
        if not re.fullmatch(r'\d{6}',r['SiteId']):raise ValueError('Invalid water station ID.')
        if r['SensorParam1'] not in ('AHD','LGH') or r['SensorParam2']:raise ValueError('Unverified water datum or sensor parameter.')
        stamp=datetime.fromisoformat(r['ObservationTimestamp'].replace('Z','+00:00'))
        if stamp.utcoffset() is None:raise ValueError('Water observation timezone missing.')
        if stamp>issued:raise ValueError('Water observation follows file generation time.')
        value=None
        if r['RealValue'] not in ('','-','--','NA','N/A'):
            value=float(r['RealValue'])
            if not math.isfinite(value):raise ValueError('Nonfinite water level.')
        observations.append({'stationId':r['SiteId'],'time':stamp.astimezone(timezone.utc).isoformat(),'value':value,
            'datum':r['SensorParam1'],'quality':r['Quality'],'comment':r['Comment']})
    if headers.get('Number of Records')!=str(len(observations)):raise ValueError('Water record count mismatch.')
    if not observations or not any(o['value'] is not None for o in observations):raise ValueError('No numeric water observations in source.')
    return {'issuedAt':issued.astimezone(timezone.utc).isoformat(),'observations':observations,'headers':headers}
