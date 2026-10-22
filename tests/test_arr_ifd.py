import copy
import json
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError
from arr_ifd import normalize,import_result,location_key
from tools.collect_arr_pilot import collect

ROOT=Path('data/ifd')
INDEX=json.loads((ROOT/'index.json').read_text())
ENTRY=INDEX['locations']['-27.736111,152.766667']
RAW=(ROOT/'raw'/ENTRY['file']).read_bytes()

class ArrIFDTests(unittest.TestCase):
    def test_uploaded_result_has_exact_coordinate_and_all_twelve_2030_tables(self):
        data=normalize(json.loads(RAW),-27.736111,152.766667)
        self.assertEqual(len(data['datasets']),12)
        self.assertEqual({d['scenario'] for d in data['datasets']},{'SSP1','SSP2','SSP3','SSP5'})
        self.assertEqual(len({d['family'] for d in data['datasets']}),3)
        table=next(d for d in data['datasets'] if d['name']=='BoM IFD Depths (2030 Baseline - SSP1)')
        self.assertEqual(next(p for p in table['points'] if p['minutes']==180)['depths'][table['aeps'].index(1)],138)
        self.assertNotIn('defaultDataset',data)
    def test_wrong_coordinate_and_invalid_cells_are_rejected(self):
        data=json.loads(RAW)
        with self.assertRaises(ValueError):normalize(data,-27.0,153.0)
        with self.assertRaises(ValueError):normalize(data,float('nan'),153.0)
        name=next(k for k in data['layers']['CCAdjIFDDatasets'] if '2030' in k)
        data['layers']['CCAdjIFDDatasets'][name]['data'][0][0]=None
        with self.assertRaises(ValueError):normalize(data,-27.736111,152.766667)
    def test_manual_import_preserves_source_and_does_not_claim_a_fetch_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=import_result(RAW,-27.736111,152.766667,tmp)
            self.assertIsNone(data['fetchedAt'])
            index=json.loads((Path(tmp)/'index.json').read_text())
            entry=index['locations'][location_key(-27.736111,152.766667)]
            self.assertEqual((Path(tmp)/'raw'/entry['file']).read_bytes(),RAW)
    def test_collection_is_capped_serial_and_cached_without_repeating_downloads(self):
        template=json.loads(RAW);targets=[{'lat':-27.7-i*.001,'lon':152.7} for i in range(7)]
        calls=[];pauses=[]
        def fetch(url):
            from urllib.parse import parse_qs,urlsplit
            calls.append(url);query=parse_qs(urlsplit(url).query)
            data=copy.deepcopy(template);data['input_data']['Latitude']=float(query['lat_coord'][0]);data['input_data']['Longitude']=float(query['lon_coord'][0])
            return json.dumps(data).encode()
        with tempfile.TemporaryDirectory() as tmp:
            result=collect(targets,tmp,5,30,fetch,pauses.append)
            self.assertEqual(result['imported'],5);self.assertEqual(len(calls),5);self.assertEqual(pauses,[30]*4)
            result=collect(targets[:5],tmp,5,30,fetch,pauses.append)
            self.assertEqual(result['attempted'],0);self.assertEqual(result['skippedCached'],5);self.assertEqual(len(calls),5)
    def test_refusal_stops_without_retry_and_produces_report(self):
        calls=[]
        def refused(url):
            calls.append(url);raise HTTPError(url,429,'Too many requests',{'Retry-After':'600'},None)
        with tempfile.TemporaryDirectory() as tmp:
            result=collect([{'lat':-27.7,'lon':152.7}]*3,tmp,5,30,refused)
            self.assertEqual(result['status'],'stopped');self.assertEqual(result['attempted'],1);self.assertEqual(len(calls),1)
            self.assertEqual(result['retryAfter'],'600');self.assertTrue((Path(tmp)/'pilot-report.json').exists())
        with self.assertRaises(ValueError):collect([],'.cache/unused',6)
        with self.assertRaises(ValueError):collect([],'.cache/unused',1,0)
