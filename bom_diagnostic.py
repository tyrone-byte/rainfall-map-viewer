"""One bounded, asynchronous FTP diagnostic per deployment, with metadata only.

No user-supplied URLs, retries, observations in responses, or credentials.
"""
import json
import os
import re
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path

from bom_hcs import parse_hcs
from bom_source import BASE

def now():
    return datetime.now(timezone.utc).isoformat()

def fetch(url, listing=False):
    command = ['curl', '--fail', '--silent', '--show-error', '--ftp-pasv',
               '--connect-timeout', '8', '--max-time', '20', '--retry', '0',
               '--max-filesize', '4000000' if listing else '20000000']
    if listing:
        command.append('--list-only')
    return subprocess.run(command + [url], capture_output=True, check=True, timeout=25).stdout

class Diagnostic:
    def __init__(self, cache):
        self.cache = Path(cache)
        self.lock = threading.Lock()
        self.thread = None
        commit = os.environ.get('RENDER_GIT_COMMIT', '')
        self.deployment = commit if re.fullmatch(r'[a-f0-9]{40}', commit) else 'local'
        self.state = {'status': 'not-started', 'onRender': os.environ.get('RENDER') == 'true',
                      'deployment': self.deployment, 'directoryReachable': False,
                      'fileDownloaded': False, 'formatValidated': False,
                      'message': 'Ready. No BoM requests have been made by this test.'}
        try:
            saved = json.loads(self.cache.read_text())
            if saved.get('deployment') == self.deployment:
                if saved.get('status') == 'running':
                    saved.update(status='interrupted', message='The service restarted before the test finished. This is not a successful connection test.')
                self.state = saved
        except (OSError, ValueError):
            pass

    def get(self):
        with self.lock:
            return dict(self.state)

    def save(self):
        # Failure to persist must not prevent a result being shown in memory.
        try:
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            temp = self.cache.with_suffix('.tmp')
            temp.write_text(json.dumps(self.state))
            temp.replace(self.cache)
        except OSError:
            self.state['persistenceNote'] = 'Result is available only until this process restarts.'

    def start(self):
        with self.lock:
            if self.state['status'] == 'not-started':
                self.state.update(status='running', startedAt=now(),
                                  message='Checking the BoM FTP directory…')
                self.save()
                self.thread = threading.Thread(target=self.run, daemon=True)
                self.thread.start()
            return dict(self.state)

    def update(self, **values):
        with self.lock:
            self.state.update(values)
            self.save()

    def run(self):
        stage = 'directory'
        try:
            listing = fetch(BASE, listing=True).decode('utf-8')
            names = {n.strip() for n in listing.splitlines()
                     if re.fullmatch(r'IDQ65900_\d{14}\.hcs', n.strip())}
            self.update(directoryReachable=True)
            if not names:
                self.update(status='failed', completedAt=now(),
                    message='FTP directory access worked, but no supported IDQ65900 rainfall file was listed. The filename or feed availability needs checking.')
                return
            name = max(names)
            stage = 'download'
            self.update(message='Directory reached. Downloading one rainfall file…')
            raw = fetch(BASE + name)
            self.update(fileDownloaded=True, filename=name, bytesDownloaded=len(raw))
            stage = 'validation'
            data = parse_hcs(raw)
            observations = data['observations']
            if not observations:
                raise ValueError('Empty observation file')
            ends = [datetime.fromisoformat(o['time']).astimezone(timezone.utc).isoformat() for o in observations]
            self.update(status='passed', completedAt=now(), formatValidated=True,
                recordCount=len(observations), stationCount=len({o['stationId'] for o in observations}),
                firstIntervalEndUTC=min(ends), lastIntervalEndUTC=max(ends),
                message='Passed: this service listed BoM FTP files, downloaded one rainfall file, and validated its 15-minute format. Scheduled collection and database storage are not tested.')
        except Exception as error:
            if stage == 'validation':
                message = 'FTP access and download worked, but the rainfall file did not pass format validation. The parser needs investigation before using this feed.'
            else:
                code = error.returncode if isinstance(error, subprocess.CalledProcessError) else None
                reason = {6: 'The FTP hostname could not be resolved.',
                          7: 'An FTP connection could not be established.',
                          28: 'The FTP request timed out.',
                          78: 'The selected file was unavailable.'}.get(code, 'The FTP request did not complete.')
                message = f'Failed during {stage}: {reason} This does not affect the rainfall dashboard.'
            # Never return stderr, commands, downloaded bytes or source values.
            self.update(status='failed', completedAt=now(), failedStage=stage, message=message)

diagnostic = Diagnostic(Path(__file__).resolve().parent / '.cache/bom-connection-test.json')
