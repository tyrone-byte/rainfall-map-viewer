"""BoM river summary and observation tables. Never substitute missing heights with zero."""
import re
from datetime import datetime, timedelta
from rainfall import Tables, AEST

SOURCE = 'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60286.html'

class LinkedTables(Tables):
    def __init__(self):
        super().__init__()
        self.row_links = {}
        self.current_links = []
    def handle_starttag(self, tag, attrs):
        super().handle_starttag(tag, attrs)
        if tag == 'tr':
            self.current_links = []
        elif tag == 'a' and self.row is not None:
            self.current_links.extend(v for k,v in attrs if k=='href')
    def handle_endtag(self, tag):
        if tag=='tr' and self.row is not None:
            self.row_links[id(self.row)] = self.current_links[:]
        super().handle_endtag(tag)

def issue_time(doc):
    text=' '.join(' '.join(doc.text).split())
    m=re.search(r'Issued at (\d{1,2}:\d{2})\s*(AM|PM)\s+AEST\s+\w+\s+(\d{1,2}\s+\w+\s+\d{4})',text,re.I)
    if not m:
        raise ValueError('BoM river issue time not recognised.')
    return datetime.strptime(' '.join(m.groups()),'%I:%M %p %d %B %Y').replace(tzinfo=AEST),text

def number(raw):
    return float(raw) if re.fullmatch(r'-?\d+(?:\.\d+)?',raw) else None

def summary(html,source=SOURCE):
    doc=LinkedTables();doc.feed(html)
    issue,_=issue_time(doc)
    stations=[];warnings=[];seen=set()
    for table in doc.tables:
        if not any('Gauge Datum' in row and 'Height (m)' in row for row in table):
            continue
        group=None
        for row in table:
            if len(row)==1:
                group=row[0];continue
            if row and row[0]=='Station Name':
                continue
            if not group:
                continue
            if len(row)!=9:
                raise ValueError('River bulletin columns changed; refusing to misalign readings.')
            paths=[p for p in doc.row_links.get(id(row),[]) if re.fullmatch(r'/fwo/IDQ\d+/IDQ\d+\.\d{6}\.tbl\.shtml',p)]
            path=paths[0] if len(paths)==1 else None
            station_id=re.search(r'\.(\d{6})\.tbl',path)[1] if path else None
            identity=station_id or f'unlinked-{len(stations)}'
            if identity in seen:
                raise ValueError('Duplicate river station identifier.')
            seen.add(identity)
            raw_time=row[2];observed=None
            match=re.fullmatch(r'(\d{1,2})\.(\d{2})(AM|PM)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)',raw_time,re.I)
            if match:
                clock=datetime.strptime(''.join(match.groups()[:3]),'%I%M%p')
                for days in range(8):
                    candidate=(issue-timedelta(days=days)).replace(hour=clock.hour,minute=clock.minute,second=0,microsecond=0)
                    if candidate.strftime('%a').lower()==match[4].lower() and candidate<=issue:
                        observed=candidate.isoformat();break
            level=number(row[3])
            if row[3] and level is None:warnings.append(f'{row[0]}: unknown level shown as missing.')
            classification={'below flood level':'below','minor':'minor','moderate':'moderate','major':'major'}.get(row[7].lower(),'unknown')
            stations.append({'id':identity,'stationNumber':station_id,'name':row[0],'group':group,'stationType':row[1],
                             'observedAt':observed,'reportedTime':raw_time,'level':level,'datum':row[4] or 'Unspecified',
                             'tendency':row[5] or 'Not supplied','crossing':row[6] or None,
                             'classification':classification,'classificationText':row[7] or 'Not supplied','historyPath':path})
    if not stations:raise ValueError('No river stations found in BoM bulletin.')
    return {'source':source,'issuedAt':issue.isoformat(),'stations':stations,'warnings':warnings,
            'timeNote':'Summary dates inferred from issue time and weekday within the preceding seven days; full timestamps are supplied by gauge history tables.'}

def history(html,station_id):
    doc=Tables();doc.feed(html)
    issue,text=issue_time(doc)
    identity=re.search(r'Station Number:\s*(\d{6})',text)
    if not identity or identity[1]!=station_id:
        raise ValueError('BoM history station number does not match the selected gauge.')
    observations=[];warnings=[]
    for table in doc.tables:
        if not any(len(row)==2 and 'Date/Time' in row[0] and 'Water Level' in row[1] for row in table):continue
        for row in table[1:]:
            if len(row)!=2:raise ValueError('River history columns changed.')
            try:timestamp=datetime.strptime(row[0],'%d/%m/%Y %H:%M').replace(tzinfo=AEST)
            except ValueError as exc:raise ValueError('Unrecognised river observation timestamp.') from exc
            value=number(row[1])
            if row[1] and value is None:warnings.append(f'Unrecognised height at {row[0]} shown as missing.')
            observations.append({'time':timestamp.isoformat(),'level':value})
    if not observations:raise ValueError('No river level history observations found.')
    # Multiple readings at the same minute are preserved in source order, never averaged.
    observations.sort(key=lambda o:o['time'])
    thresholds=[]
    for match in re.finditer(r'(Minor|Moderate|Major):\s*(-?\d+(?:\.\d+)?)\s*m\s*(AHD|LGH)',text,re.I):
        thresholds.append({'name':match[1].capitalize(),'level':float(match[2]),'datum':match[3].upper()})
    return {'stationNumber':station_id,'issuedAt':issue.isoformat(),'observations':observations,'thresholds':thresholds,'warnings':warnings}
