"""Bounded read-only FTP sample: optional one directory listing plus one download. No retries.
Raw data is saved as an authenticated GitHub artifact, not committed or published to the viewer.
"""
import csv
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime,timezone
from pathlib import Path

BASE='ftp://ftp.bom.gov.au/anon/gen/fwo/'
SOURCE=BASE+'IDQ65900.csv'

def annotation(kind,message):
    escaped=str(message).replace('%','%25').replace('\r','%0D').replace('\n','%0A')
    print(f'::{kind}::{escaped}',flush=True)

def main(discover=False):
    root=Path('.cache/bom-idq65900-sample');root.mkdir(parents=True,exist_ok=True)
    path=root/'IDQ65900.csv'
    # Remove only this job's previous sample, so a failed retry cannot look successful.
    if path.exists():path.unlink()
    report={'source':SOURCE,'requestedAt':datetime.now(timezone.utc).isoformat(),'requests':1,'status':'not-retrieved'}
    source=SOURCE
    if discover:
        report['requests']=1
        listing=subprocess.run(['curl','--fail','--silent','--show-error','--ftp-pasv','--list-only','--connect-timeout','20','--max-time','90','--max-filesize','4000000','--retry','0',BASE],capture_output=True,text=True)
        report['listingExitCode']=listing.returncode
        if listing.returncode:
            report['error']=listing.stderr.strip()
            (root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
            annotation('error',f'FTP listing failed: {report["error"]}')
            return 1
        # List only metadata. Download at most one safe basename of this exact product.
        names=sorted({name.strip() for name in listing.stdout.splitlines() if name.strip().startswith('IDQ65900')})
        report['matchingNames']=names[:100]
        report['matchingNameCount']=len(names)
        annotation('notice','IDQ65900 listing: '+(str(len(names))+' matches; '+', '.join(names[:15]) if names else 'no matching published filenames'))
        supported=[name for name in names if re.fullmatch(r'IDQ65900[A-Za-z0-9_.-]*\.(?:csv|txt|hcs)',name,re.I)]
        supported.sort(reverse=True)
        supported.sort(key=lambda n:{'csv':0,'txt':1,'hcs':2}[n.rsplit('.',1)[1].lower()])
        if not supported:
            report['error']='No supported IDQ65900 sample filename is listed in this FTP directory.'
            (root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
            annotation('error',report['error'])
            return 1
        name=supported[0];source=BASE+name;path=root/name
        report.update(source=source,requests=2)
    response=subprocess.run(['curl','--fail','--silent','--show-error','--ftp-pasv','--connect-timeout','20','--max-time','90','--max-filesize','20000000','--retry','0',source,'-o',str(path)],capture_output=True,text=True)
    report['curlExitCode']=response.returncode
    if response.returncode:
        # Retain error information, but never mistake a partial response for a usable sample.
        report['error']=response.stderr.strip()
        if path.exists():path.rename(root/'incomplete-download.bin')
    elif not path.exists() or not path.stat().st_size:
        report['error']='The server returned an empty sample.'
    else:
        raw=path.read_bytes();report.update(status='retrieved',bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),retrievedAt=datetime.now(timezone.utc).isoformat())
        try:text=raw.decode('utf-8-sig');report['decodedAs']='UTF-8'
        except UnicodeDecodeError:text=raw.decode('latin-1');report['decodedAs']='Latin-1'
        report['lineCount']=len(text.splitlines())
        # A preview stays in the artifact; observations are never printed into public logs.
        (root/'preview.txt').write_text('\n'.join(text.splitlines()[:40])+'\n')
        try:
            dialect=csv.Sniffer().sniff(text[:65536]);report['candidateDelimiter']=dialect.delimiter
        except csv.Error:report['candidateDelimiter']=None
        report['interpretation']='Unvalidated source sample: accumulation meaning, station coverage and missing-value codes still require inspection.'
    (root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f"IDQ65900 single-request result: {report['status']}; curl exit {response.returncode}. See the artifact report for details.")
    annotation('notice' if report['status']=='retrieved' else 'error',f"IDQ65900: {report['status']}; "+(f"{report.get('bytes',0)} bytes; source {source}" if report['status']=='retrieved' else report.get('error','Unknown error')))
    return 0 if report['status']=='retrieved' else 1

if __name__=='__main__':sys.exit(main('--discover' in sys.argv[1:]))
