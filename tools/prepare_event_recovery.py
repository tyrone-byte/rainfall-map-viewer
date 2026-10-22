"""Build an encrypted recovery bundle from private, explicitly selected sources.

Example: python tools/prepare_event_recovery.py --recovered-zip /private/bom-storm-recovery.zip
Output key and source manifest stay in ignored .cache; no credential is printed.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import rainfall
import water
from bom_hcs import parse_hcs
from bom_source import BASE
from event_recovery import seal

ROOT = Path(__file__).resolve().parents[1]
EARLY = ROOT/'.cache/event-preservation/early-captures'

def capture(raw, source, kind, fetched_at):
    if kind=='rain-15m':
        parsed=parse_hcs(raw); issued=parsed['headers']['File Generation Date']
    elif raw.lstrip().startswith(b'{'):
        parsed=json.loads(raw); issued=parsed['issuedAt']
    else:
        parsed=water.summary(raw.decode()) if kind=='water-summary' else rainfall.parse(raw.decode(), 1 if kind=='rain-1h' else 3, source)
        issued=parsed['issuedAt']
    return {'raw':base64.b64encode(raw).decode(), 'source':source, 'kind':kind,
            'sha256':hashlib.sha256(raw).hexdigest(), 'issuedAt':issued.replace('Z','+00:00'),
            'fetchedAt':fetched_at}

def build(zip_path=None):
    sources=[('IDQ65900-sample.hcs', BASE+'IDQ65900_20261022002300.hcs', 'rain-15m'),
             ('bom-bulletin.html', rainfall.SOURCE, 'rain-3h'),
             ('rainfall-bulletin.json', rainfall.SOURCE, 'rain-3h'),
             ('bom-hourly-rain.html', 'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60336.html', 'rain-1h'),
             ('water-summary.json', water.SOURCE, 'water-summary'),
             ('water-540111.json', 'https://reg.bom.gov.au/fwo/IDQ65389/IDQ65389.540111.tbl.shtml', 'water-history'),
             ('water-540245.json', 'https://reg.bom.gov.au/fwo/IDQ65389/IDQ65389.540245.tbl.shtml', 'water-history')]
    captures=[]
    for name,source,kind in sources:
        path=EARLY/name
        if not path.is_file():
            raise ValueError('A selected early capture is missing.')
        raw=path.read_bytes()
        fetched=datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        if raw.lstrip().startswith(b'{'):
            fetched=json.loads(raw).get('fetchedAt',fetched)
        captures.append(capture(raw,source,kind,fetched))
    if zip_path:
        # Read fixed matching members only; never extract paths or execute contents.
        with zipfile.ZipFile(zip_path) as archive:
            members={Path(name).name:name for name in archive.namelist() if not name.endswith('/')}
            manifest=json.loads(archive.read(members['manifest.json']))
            for entry in manifest['files']:
                name=entry['name']
                if re.fullmatch(r'IDQ65900_\d{14}\.hcs',name): kind='rain-15m'
                elif name in {'IDQ60348.html','IDQ60336.html','IDQ60286.html'}:
                    kind={'IDQ60348.html':'rain-3h','IDQ60336.html':'rain-1h','IDQ60286.html':'water-summary'}[name]
                else: continue
                info=archive.getinfo(members[name])
                if info.file_size>20_000_000:raise ValueError('Oversized recovery source.')
                raw=archive.read(info)
                if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise ValueError('Artifact source checksum mismatch.')
                # The original recovery tool recorded request start, not per-file completion.
                captures.append(capture(raw,entry['source'],kind,manifest['startedAt']))
    unique={(c['kind'],c['sha256']):c for c in captures}
    return sorted(unique.values(),key=lambda c:c['issuedAt'])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recovered-zip', type=Path)
    args=parser.parse_args()
    captures=build(args.recovered_zip)
    private=ROOT/'.cache/event-preservation';private.mkdir(parents=True,exist_ok=True)
    key_path=private/'event-import-key.txt'
    if key_path.exists():key=base64.b64decode(key_path.read_text().strip(),validate=True)
    else:
        key=os.urandom(32)
        descriptor=os.open(key_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as output:output.write(base64.b64encode(key).decode()+'\n')
    payload={'schemaVersion':1,'captures':captures}
    envelope=seal(payload,key)
    target=ROOT/'data/event-recovery/2026-10-22.json';target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(envelope,separators=(',',':'))+'\n')
    public_manifest={'event':'2026-10-22','captures':len(captures),'includesGitHubRecovery':bool(args.recovered_zip),
        'packageSha256':hashlib.sha256(target.read_bytes()).hexdigest(),
        'sources':[{'kind':c['kind'],'source':c['source'],'issuedAt':c['issuedAt'],'sha256':c['sha256']} for c in captures]}
    (target.parent/'manifest.json').write_text(json.dumps(public_manifest,indent=2)+'\n')
    print(f'Prepared {len(captures)} encrypted captures. Import key saved privately; no key or observations printed.')

if __name__=='__main__':main()
