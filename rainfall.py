"""Strict parser for BoM IDQ60348; missing and unknown values stay null."""
import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser

AEST = timezone(timedelta(hours=10))
SOURCE = 'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60348.html'

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.table, self.row, self.cell = [], None, None, None
        self.text = []
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.table = []
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in ('td', 'th') and self.row is not None:
            self.cell = []
    def handle_data(self, data):
        self.text.append(data)
        if self.cell is not None:
            self.cell.append(data)
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table, self.row, self.cell = None, None, None

def key(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())

def parse(html):
    doc = Tables()
    doc.feed(html)
    text = ' '.join(' '.join(doc.text).split())
    issued = re.search(r'Issued at (\d{1,2}:\d{2})\s*(AM|PM)\s+AEST\s+\w+\s+(\d{1,2}\s+\w+\s+\d{4})', text, re.I)
    if not issued:
        raise ValueError('Bulletin issue time not recognised; refusing to guess observation dates.')
    issue = datetime.strptime(' '.join(issued.groups()), '%I:%M %p %d %B %Y').replace(tzinfo=AEST)
    stations, periods, warnings = [], None, []
    seen = {}
    for table in doc.tables:
        if not any('3 hour period ending' in ' '.join(row).lower() for row in table):
            continue
        labels = next((row for row in table if len(row) == 8 and all(re.fullmatch(r'\d{1,2}\s*[AP]M', c, re.I) for c in row)), None)
        if not labels:
            raise ValueError('Rainfall column headings changed; refusing to misalign readings.')
        hours = [datetime.strptime(re.sub(r'\s', '', c.upper()), '%I%p').hour for c in labels]
        # Anchor the rightmost completed block at/before issue; walk backwards across midnight.
        end = issue.replace(hour=hours[-1], minute=0, second=0, microsecond=0)
        if end > issue:
            end -= timedelta(days=1)
        ends = [end]
        for hour in reversed(hours[:-1]):
            candidate = ends[-1].replace(hour=hour)
            if candidate >= ends[-1]:
                candidate -= timedelta(days=1)
            if ends[-1] - candidate != timedelta(hours=3):
                raise ValueError('Unexpected rainfall period spacing.')
            ends.append(candidate)
        current = [{'start': (d-timedelta(hours=3)).isoformat(), 'end': d.isoformat()} for d in reversed(ends)]
        if periods is not None and periods != current:
            raise ValueError('Inconsistent rainfall headings across tables.')
        periods = current
        group = None
        for row in table:
            if len(row) == 1 and row[0] and 'Station' not in row[0]:
                group = row[0]
            elif group and len(row) >= 2 and row[0] not in ('Station Name',):
                if row == labels or '3 hour period ending' in ' '.join(row):
                    continue
                if len(row) != 9:
                    raise ValueError(f'Unexpected column count for {row[0]}.')
                identity = group + ':' + key(row[0])
                seen[identity] = seen.get(identity, 0) + 1
                identity += ':' + str(seen[identity])
                values = []
                for raw in row[1:]:
                    if re.fullmatch(r'\d+(?:\.\d+)?', raw):
                        values.append(float(raw))
                    else:
                        values.append(None)
                        if raw not in ('', '-', '--', 'NA', 'N/A'):
                            warnings.append(f'{row[0]}: unrecognised reading {raw!r} treated as missing.')
                stations.append({'id': identity, 'name': row[0], 'group': group, 'values': values})
    if not stations or periods is None:
        raise ValueError('No rainfall stations found. BoM may have changed its format.')
    for station in stations:
        station['ambiguousName'] = seen[station['group'] + ':' + key(station['name'])] > 1
    return {'source': SOURCE, 'issuedAt': issue.isoformat(), 'periods': periods, 'stations': stations, 'warnings': warnings}
