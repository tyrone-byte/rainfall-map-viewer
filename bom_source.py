"""Bounded source reads shared by the collector and one-off recovery tool."""
import subprocess

BASE = 'ftp://ftp.bom.gov.au/anon/gen/fwo/'
PRODUCTS = ('IDQ60348', 'IDQ60336', 'IDQ60286')

def fetch(url, listing=False):
    command = ['curl', '--fail', '--silent', '--show-error', '--connect-timeout', '15',
               '--max-time', '45', '--max-filesize', '4000000' if listing else '20000000', '--retry', '0']
    if listing:
        command.append('--list-only')
    return subprocess.run(command + [url], capture_output=True, check=True).stdout
