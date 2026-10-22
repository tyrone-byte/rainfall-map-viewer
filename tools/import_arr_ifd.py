"""Import a downloaded JSON response; makes no network requests."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from arr_ifd import import_result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('file');p.add_argument('--lat',type=float,required=True);p.add_argument('--lon',type=float,required=True);p.add_argument('--output',default='data/ifd');a=p.parse_args()
    result=import_result(Path(a.file).read_bytes(),a.lat,a.lon,a.output)
    print(f"Imported {len(result['datasets'])} 2030 tables for {result['locationKey']}; no scenario selected automatically.")
