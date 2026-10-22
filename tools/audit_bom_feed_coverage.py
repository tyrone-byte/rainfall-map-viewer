"""Offline audit of captured official BoM products; makes no network requests."""
import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter,defaultdict
from html.parser import HTMLParser
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from rainfall import key,Tables

class RainMap(HTMLParser):
    def __init__(self):
        super().__init__();self.stations=defaultdict(dict)
    def handle_starttag(self,tag,attrs):
        if tag!='area':return
        match=re.search(r'PopupRain\("([^"]*)",\s*\'(\d{6})\',\s*\'(-?[\d.]+)\',\s*\'(-?[\d.]+)\'',dict(attrs).get('onmouseover',''))
        if match:self.stations[key(match[1])][match[2]]={'name':match[1],'id':match[2],'lat':float(match[3]),'lon':float(match[4])}

def audit(rainfall,coordinates,xml,map_html,hourly_html):
    root=ET.fromstring(xml);aws={s.get('bom-id'):s for s in root.findall('.//station')}
    stations=RainMap();stations.feed(map_html)
    hourly=Tables();hourly.feed(hourly_html);available=Counter()
    for table in hourly.tables:
        if not any('1 hour period ending' in ' '.join(row) for row in table):continue
        group=None
        for row in table:
            if len(row)==1:group=row[0]
            elif len(row)==9 and group:available[(group,row[0])]+=1
    rows=[]
    for station in rainfall['stations']:
        name=station['name'];candidates=stations.stations.get(key(name),{})
        point=next(iter(candidates.values())) if len(candidates)==1 and not station['ambiguousName'] else None
        weather=aws.get(point['id']) if point else None
        old=coordinates.get(key(name))
        elements={element.get('type'):element for element in weather.findall('.//element')} if weather is not None else {}
        counter=elements.get('rainfall');ten=elements.get('rain_ten')
        identity=(station['group'],name);has_hour=available[identity]>0
        if has_hour:available[identity]-=1
        rows.append({'gauge':name,'group':station['group'],'gauge_row_id':station['id'],
                     'coverage':'same_station_id' if weather is not None else 'not_in_checked_weather_product' if point else 'identity_unresolved',
                     'live_map_station_id':point['id'] if point else '',
                     'live_map_lat':point['lat'] if point else '', 'live_map_lon':point['lon'] if point else '',
                     'weather_station_name':weather.get('stn-name') if weather is not None else '',
                     'weather_wmo':weather.get('wmo-id') if weather is not None else '',
                     'weather_observation_time':weather.find('period').get('time-local') if weather is not None else '',
                     'rain_ten_present':ten is not None,'rain_ten_value':ten.text if ten is not None else '',
                     'cumulative_rainfall_present':counter is not None,
                     'cumulative_counter_start':counter.get('start-time-local','') if counter is not None else '',
                     'cumulative_counter_end':counter.get('end-time-local','') if counter is not None else '',
                     'hourly_bulletin_row_present':has_hour,
                     'historic_catalogue_station_id':old['stationNumber'] if old else '',
                     'historic_live_id_difference':bool(old and point and old['stationNumber']!=point['id'])})
    counts=Counter(r['coverage'] for r in rows)
    return {'rainfallIssue':rainfall['issuedAt'],'weatherFeedIssue':root.findtext('./amoc/issue-time-local'),
            'weatherProduct':root.findtext('./amoc/identifier'),'weatherStations':len(aws),'rainfallGaugeRows':len(rows),
            'coverageCounts':dict(counts),'overlapWithTenMinuteAmount':sum(r['coverage']=='same_station_id' and r['rain_ten_present'] for r in rows),
            'weatherStationsWithTenMinuteAmount':len(root.findall('.//station/period/level/element[@type="rain_ten"]')),
            'hourlyOverlapRows':sum(r['hourly_bulletin_row_present'] for r in rows),
            'historicLiveIdDifferences':sum(r['historic_live_id_difference'] for r in rows)},rows

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--rainfall',required=True);p.add_argument('--coordinates',required=True);p.add_argument('--xml',required=True);p.add_argument('--map',required=True);p.add_argument('--hourly',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    result,rows=audit(json.loads(Path(a.rainfall).read_text()),json.loads(Path(a.coordinates).read_text()),Path(a.xml).read_bytes(),Path(a.map).read_text(),Path(a.hourly).read_text())
    out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
    with (out/'gauge-coverage.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    result['sources']={}
    for name,file in [('rainfall-bulletin',a.rainfall),('weather-feed',a.xml),('flood-map',a.map),('hourly-bulletin',a.hourly)]:
        raw=Path(file).read_bytes();result['sources'][name]={'sha256':hashlib.sha256(raw).hexdigest()}
        with gzip.open(out/(name+'.gz'),'wb') as f:f.write(raw)
    (out/'summary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
