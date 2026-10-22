"""One read-only request for the published FTP product. No retry or scheduled collector.
Raw data is saved as an authenticated GitHub artifact, not committed or published to the viewer.
"""
import csv
import hashlib
import json
import subprocess
import sys
from datetime import datetime,timezone
from pathlib import Path

SOURCE='ftp://ftp.bom.gov.au/anon/gen/fwo/IDQ65900.csv'

def main():
    root=Path('.cache/bom-idq65900-sample');root.mkdir(parents=True,exist_ok=True)
    path=root/'IDQ65900.csv'
    # Remove only this job's previous sample, so a failed retry cannot look successful.
    if path.exists():path.unlink()
    report={'source':SOURCE,'requestedAt':datetime.now(timezone.utc).isoformat(),'requests':1,'status':'not-retrieved'}
    response=subprocess.run(['curl','--fail','--silent','--show-error','--ftp-pasv','--connect-timeout','20','--max-time','90','--max-filesize','20000000','--retry','0',SOURCE,'-o',str(path)],capture_output=True,text=True)
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
    return 0 if report['status']=='retrieved' else 1

if __name__=='__main__':sys.exit(main())
