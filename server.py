#!/usr/bin/env python3
"""No Python dependencies. Run: python3 server.py"""
import argparse
import json
import os
import subprocess
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from rainfall import parse, key, SOURCE
import water_service
from bom_diagnostic import diagnostic

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.cache'
LOCK = threading.Lock()

def load_data(refresh=False):
    with LOCK:
        CACHE.mkdir(exist_ok=True)
        cache = CACHE / 'bulletin.json'
        previous = None
        if cache.exists():
            try:
                previous = json.loads(cache.read_text())
            except (ValueError, OSError):
                pass
        age = (datetime.now(timezone.utc)-datetime.fromisoformat(previous['fetchedAt'])).total_seconds() if previous else float('inf')
        error = None
        if refresh or age > 300:
            try:
                result = subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error', '--max-time', '25', '--max-filesize', '4000000', SOURCE], capture_output=True, check=True)
                data = parse(result.stdout.decode('utf-8', errors='replace'))
                data['fetchedAt'] = datetime.now(timezone.utc).isoformat()
                temp = cache.with_suffix('.tmp')
                temp.write_text(json.dumps(data))
                temp.replace(cache)
                previous = data
            except (subprocess.SubprocessError, ValueError, OSError) as exc:
                error = 'Could not refresh BoM bulletin. Check internet access or source formatting.'
                print(f'BoM refresh failed: {exc}', flush=True)
        if previous is None:
            raise ValueError(error or 'No BoM data available.')
        data = json.loads(json.dumps(previous))
        coordinates = json.loads((ROOT / 'data/stations.json').read_text())
        for station in data['stations']:
            coord = coordinates.get(key(station['name']))
            if coord and not station['ambiguousName'] and -29 <= coord['lat'] <= -25 and 151 <= coord['lon'] <= 154:
                station['coordinates'] = coord
            else:
                station['coordinates'] = None
            station['coordinateStatus'] = 'Official catalogue match' if station['coordinates'] else ('Duplicate name in bulletin; identity unresolved' if station['ambiguousName'] else 'No confident coordinate match')
        data['refreshError'] = error
        data['servedAt'] = datetime.now(timezone.utc).isoformat()
        return data

class Handler(SimpleHTTPRequestHandler):
    def diagnostic_response(self, payload):
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if urlsplit(self.path).path != '/api/diagnostics/bom':
            self.send_error(404)
            return
        origin = self.headers.get('Origin')
        if origin and (urlsplit(origin).scheme not in ('http', 'https') or urlsplit(origin).netloc != self.headers.get('Host')):
            self.send_error(403)
            return
        if self.headers.get('Content-Length', '0') != '0' or self.headers.get('Transfer-Encoding'):
            self.send_error(400)
            return
        self.diagnostic_response(diagnostic.start())

    def end_headers(self):
        # Browser application files must not survive a deployment as stale code.
        # Vendor libraries remain independently cacheable.
        if urlsplit(self.path).path.startswith(('/public/','/data/ifd/')):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/diagnostics/bom':
            self.diagnostic_response(diagnostic.get())
            return
        if path == '/api/water' or path.startswith('/api/water/'):
            try:
                if path == '/api/water':
                    payload = water_service.summary('refresh=1' in self.path)
                else:
                    payload = water_service.history(path.removeprefix('/api/water/'), 'refresh=1' in self.path)
                status = 200
            except ValueError as exc:
                payload, status = {'error': str(exc)}, 503
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == '/api/rainfall':
            try:
                payload, status = load_data('refresh=1' in self.path), 200
            except ValueError as exc:
                payload, status = {'error': str(exc)}, 503
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # Expose only frontend and the two installed browser libraries.
        if path == '/reference/local-ifd-index.json':
            base, relative = ROOT/'data/ifd', 'index.json'
        elif path.startswith('/reference/local-ifd/'):
            base, relative = ROOT/'data/ifd/locations', path.removeprefix('/reference/local-ifd/')
        elif path == '/reference/brisbane-ifd-2030.csv':
            base, relative = ROOT/'data', 'brisbane-ifd-2030.csv'
        elif path.startswith('/vendor/leaflet/'):
            base, relative = ROOT/'node_modules/leaflet/dist', path.removeprefix('/vendor/leaflet/')
        elif path == '/vendor/chart.js':
            base, relative = ROOT/'node_modules/chart.js/dist', 'chart.umd.js'
        else:
            pages = {'/water': 'water.html', '/water/': 'water.html', '/diagnostics/bom': 'bom-test.html'}
            base, relative = ROOT/'public', pages.get(path, path.lstrip('/') or 'index.html')
        target = (base / relative).resolve()
        if not target.is_relative_to(base.resolve()) or not target.is_file():
            self.send_error(404)
            return
        self.path = '/' + str(target.relative_to(ROOT))
        super().do_GET()
    def translate_path(self, path):
        return str(ROOT / path.lstrip('/'))
    def list_directory(self, path):
        self.send_error(404)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8000)))
    parser.add_argument('--host', default='127.0.0.1')
    args = parser.parse_args()
    print(f'Rainfall viewer: http://{args.host}:{args.port}', flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
