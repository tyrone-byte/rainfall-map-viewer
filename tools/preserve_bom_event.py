"""Bounded one-off recovery of retained rainfall files and current web tables.

Raw observations belong in private storage/artifacts, never public Git history.
"""
import hashlib
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from bom_hcs import parse_hcs

BASE = 'ftp://ftp.bom.gov.au/anon/gen/fwo/'
PRODUCTS = ('IDQ60348', 'IDQ60336', 'IDQ60286')

def fetch(url, listing=False):
    command = ['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '15',
               '--max-time', '45', '--max-filesize', '20000000', '--retry', '0']
    if listing:
        command.append('--list-only')
    return subprocess.run(command + [url], capture_output=True, check=True).stdout

def main():
    root = Path('.cache/event-preservation/recovered'); root.mkdir(parents=True, exist_ok=True)
    report = {'startedAt': datetime.now(timezone.utc).isoformat(), 'files': [], 'errors': []}
    try:
        names = sorted({n.strip() for n in fetch(BASE, True).decode().splitlines()
                        if re.fullmatch(r'IDQ65900_\d{14}\.hcs', n.strip())})
        # Exact product only; at most twelve sequential downloads, with a pause.
        for name in names[-12:]:
            try:
                raw = fetch(BASE + name)
                parsed = parse_hcs(raw)
                times = [o['time'] for o in parsed['observations']]
                (root / name).write_bytes(raw)
                report['files'].append({'name': name, 'source': BASE + name,
                    'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw),
                    'firstEndUTC': min(times), 'lastEndUTC': max(times),
                    'records': len(times)})
            except Exception as error:
                report['errors'].append({'name': name, 'error': str(error)})
            time.sleep(2)
    except Exception as error:
        report['errors'].append({'source': BASE, 'error': str(error)})
    for product in PRODUCTS:
        url = f'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?{product}.html'
        try:
            raw = fetch(url); name = product + '.html'; (root / name).write_bytes(raw)
            report['files'].append({'name': name, 'source': url,
                'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)})
        except Exception as error:
            report['errors'].append({'source': url, 'error': str(error)})
        time.sleep(2)
    (root / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
    hcs = [f for f in report['files'] if f['name'].endswith('.hcs')]
    if hcs:
        print(f"::notice::Saved {len(hcs)} rainfall files; interval ends {min(f['firstEndUTC'] for f in hcs)} to {max(f['lastEndUTC'] for f in hcs)}. Raw data is in the authenticated artifact.")
    print(f"Preserved {len(report['files'])} source files; {len(report['errors'])} errors.")
    return 1 if report['errors'] else 0

if __name__ == '__main__':
    sys.exit(main())
