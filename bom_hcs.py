"""Defensive offline reader for BoM-HCS 2.0 source samples; no networking or storage side effects."""
import csv
import io
import math
import re
from datetime import datetime

FIELDS=['IndexNo','SensorType','SensorDataType','SiteIdType','SiteId','ObservationTimestamp','RealValue','Unit','SensorParam1','SensorParam2','Quality','Comment']

def parse_hcs(raw):
    text=raw.decode('utf-8-sig');headers={};lines=[]
    for line in text.splitlines():
        if line.startswith('# HEADER: '):
            key,separator,value=line.removeprefix('# HEADER: ').partition(': ')
            if separator:headers[key]=value
        elif line and not line.startswith('#'):lines.append(line)
    if headers.get('File Format')!='BOM-HCS' or headers.get('File Format Version')!='2.0':raise ValueError('Unsupported BoM-HCS format/version.')
    if [v.strip() for v in headers.get('Data Fields','').split(',')]!=FIELDS:raise ValueError('HCS columns changed.')
    if headers.get('Local ObsTime Offset')!='0':raise ValueError('Nonzero local observation offset requires explicit handling.')
    observations=[]
    for row in csv.reader(io.StringIO('\n'.join(lines))):
        if len(row)!=len(FIELDS):raise ValueError('Malformed HCS record.')
        r=dict(zip(FIELDS,row))
        if r['SensorType']!='RN' or r['SensorDataType']!='6' or r['SiteIdType']!='SR' or r['Unit']!='mm' or r['SensorParam2']!='900':
            raise ValueError('Unexpected rainfall measurement type, unit or interval parameter.')
        if not re.fullmatch(r'\d{6}',r['SiteId']):raise ValueError('Invalid HCS station identifier.')
        try:time=datetime.fromisoformat(r['ObservationTimestamp'].replace('Z','+00:00'))
        except ValueError as error:raise ValueError('Invalid HCS observation timestamp.') from error
        if time.utcoffset() is None:raise ValueError('HCS timestamps require an explicit timezone.')
        value=None
        if r['RealValue'] not in ('','-','--','NA','N/A'):
            try:value=float(r['RealValue'])
            except ValueError as error:raise ValueError('Unknown HCS rainfall value; definition needs investigation.') from error
            if not math.isfinite(value) or value<0:raise ValueError('Unsupported HCS negative/nonfinite rainfall value.')
        observations.append({'stationId':r['SiteId'],'time':time.isoformat(),'value':value,'unit':'mm',
                             'sensorType':r['SensorType'],'sensorDataType':r['SensorDataType'],'durationParameter':900,
                             'quality':r['Quality'],'comment':r['Comment']})
    if headers.get('Number of Records')!=str(len(observations)):raise ValueError('HCS record count differs from header.')
    return {'headers':headers,'observations':observations}
