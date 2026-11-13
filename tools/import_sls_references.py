"""Import the supplied QLD SLS v3.7 by station ID and PDF column coordinates.

Requires Poppler's pdftotext for an explicit offline import, not at runtime.
The source does not name per-station AHD/LGH datums. The user explicitly
confirmed that classifications share each matched station observation datum.
"""
import argparse
from collections import defaultdict
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
KINDS=('minor','moderate','major')
SOURCE=ROOT/'public/reference/QLD_SLS_v3.7.pdf'
EXPECTED_SHA='a0107ae70d177bd69499ed15349826d57bf003be338821b3aa9a5ba8f82fca9f'


def extract(xml):
    rows=[]
    for page_number,page in enumerate(ET.fromstring(xml).findall('.//{*}page'),1):
        # Schedules 2 and 3 only. Other schedules contain unrelated station lists.
        if not 19<=page_number<=59:continue
        words=[]
        for word in page.findall('.//{*}word'):
            item={'text':word.text or '',**{k:float(v) for k,v in word.attrib.items()}}
            item['x']=(item['xMin']+item['xMax'])/2;item['y']=(item['yMin']+item['yMax'])/2
            words.append(item)
        ids=[w for w in words if re.fullmatch(r'\d{6}',w['text']) and w['x']<100]
        if not ids:continue
        centers=[]
        for kind in KINDS:
            headers=[w for w in words if w['text']==kind.title() and w['y']<150]
            if not headers:raise ValueError(f'Missing classification header on page {page_number}')
            # Body prediction cells also say Moderate. Choose by topmost y, not XML order.
            centers.append(min(headers,key=lambda w:w['y'])['x'])
        if not centers[0]<centers[1]<centers[2]:raise ValueError('Invalid classification column order')
        edges=[centers[0]-(centers[1]-centers[0])/2,(centers[0]+centers[1])/2,
               (centers[1]+centers[2])/2,centers[2]+(centers[2]-centers[1])/2]
        for identity in ids:
            values={};raw={}
            for i,kind in enumerate(KINDS):
                cell=''.join(w['text'] for w in sorted(words,key=lambda w:w['x']) if abs(w['y']-identity['y'])<3 and edges[i]<=w['x']<edges[i+1])
                raw[kind]=cell
                if cell in ('','N/A'):values[kind]=None
                elif re.fullmatch(r'-?\d+(?:\.\d+)?',cell):values[kind]=float(cell)
                else:raise ValueError(f'Unrecognised {kind} cell at {identity["text"]}, page {page_number}: {cell!r}')
            ordered=[v for v in values.values() if v is not None]
            if any(b<a for a,b in zip(ordered,ordered[1:])):raise ValueError('Descending source flood heights')
            rows.append({'stationId':identity['text'],'page':page_number,'schedule':2 if page_number<=30 else 3,'levels':values,'rawCells':raw})
    if not rows:raise ValueError('No SLS flood classification rows found')
    return rows


def build(source=SOURCE,retrieved=None):
    sha=hashlib.sha256(source.read_bytes()).hexdigest()
    # Fixed page ranges/layout are verified for this supplied edition only.
    if sha!=EXPECTED_SHA:raise ValueError('Source is not the verified supplied SLS v3.7 PDF')
    with tempfile.TemporaryDirectory() as directory:
        target=Path(directory)/'bbox.html'
        subprocess.run(['pdftotext','-bbox-layout',str(source),str(target)],check=True)
        rows=extract(target.read_text())
    if len(rows)!=1073:raise ValueError('Unexpected source row count; review the PDF extraction')
    catalogue=json.loads((ROOT/'data/water-groups.json').read_text())['stations']
    inventory={s['id']:s for s in catalogue};by_id=defaultdict(list)
    for row in rows:by_id[row['stationId']].append(row)
    records=[];unmatched=[];matched=[]
    timestamp=retrieved or datetime.now(timezone.utc).isoformat()
    for sid,entries in sorted(by_id.items()):
        if any(r['levels']!=entries[0]['levels'] for r in entries):raise ValueError(f'Conflicting source definitions for {sid}')
        if sid not in inventory:unmatched.append(sid);continue
        matched.append(sid);row=entries[0]
        for kind,level in row['levels'].items():
            if level is None:continue
            records.append({'stationId':sid,'kind':kind,'level':level,'datum':None,
                'datumStatus':'same as matched station observations; user confirmed',
                'datumBasis':'same-station-observation','datumVerified':True,
                'undefinedKinds':[k for k,v in row['rawCells'].items() if v=='N/A'],
                'missingKinds':[k for k,v in row['rawCells'].items() if v==''],
                'source':f'/reference/QLD_SLS_v3.7.pdf#page={row["page"]}',
                'sourceTitle':'BoM Service Level Specification for Flood Forecasting and Warning Services for Queensland',
                'sourceVersion':'3.7','sourceEdition':'December 2025','sourcePages':[r['page'] for r in entries],
                'sourceSchedule':row['schedule'],'sourceSha256':sha,'retrievedAt':timestamp,'provisional':False,
                'note':'Published classification height in metres. User confirmed compatibility with the same station observation datum; no datum conversion applied.'})
    report={'sourceFile':SOURCE.name,'sourceSha256':sha,'sourceVersion':'3.7','sourceEdition':'December 2025',
        'importedAt':timestamp,'sourceRows':len(rows),'distinctSourceStations':len(by_id),
        'matchedStations':len(matched),'records':len(records),'matchedStationIds':matched,'unmatchedSourceStationIds':unmatched,
        'catalogueStationsWithoutSLS':sorted(set(inventory)-set(matched)),
        'duplicateDefinitions':[{'stationId':sid,'pages':[r['page'] for r in entries]} for sid,entries in by_id.items() if len(entries)>1],
        'datumPolicy':'Source tables do not name AHD/LGH per station. User explicitly confirmed the classifications share the observation datum at each exact matched station. datum=null preserves the source; datumBasis=same-station-observation and datumVerified=true permit same-station comparison without a conversion.',
        'rows':rows}
    return records,report


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,default=SOURCE);args=parser.parse_args()
    records,report=build(args.source)
    target=ROOT/'data/water-reference-levels.json'
    existing=json.loads(target.read_text())['records']
    # Replace this edition's import only; preserve other independently verified sources.
    existing=[r for r in existing if r.get('sourceSha256')!=report['sourceSha256']]
    target.write_text('{\n  "records": [\n'+',\n'.join('    '+json.dumps(r,separators=(',',':')) for r in existing+records)+'\n  ]\n}\n')
    (ROOT/'docs/flood/sls-import-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['sourceRows','distinctSourceStations','matchedStations','records']}))

if __name__=='__main__':main()
