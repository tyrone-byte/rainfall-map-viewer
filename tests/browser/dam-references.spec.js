const {test,expect}=require('@playwright/test');

test('dam wall symbols and legend distinguish below, above and unresolved test states',async({page})=>{
 await page.route('**/api/dam-levels',route=>route.fulfill({json:{rows:[
  {dam:'Wivenhoe Dam',gauge_id:'540177',latest_level_m:56,reading_datum:'AHD',observed_at:new Date().toISOString()},
  {dam:'Hinze Dam',gauge_id:'540610',latest_level_m:95,reading_datum:'AHD',observed_at:new Date().toISOString()}
 ]}}));
 await page.goto('/dams');
 await expect(page.locator('[data-dam="wivenhoe-dam"] .dam-symbol')).toHaveAttribute('data-state','below');
 await expect(page.locator('[data-dam="hinze-dam"] .dam-symbol')).toHaveAttribute('data-state','above');
 for(const id of ['bromelton-off-stream-storage','isis-balancing-storage','moura-offstream-storage','west-barron-balancing-storage','woongarra-balancing-storage'])await expect(page.locator(`[data-dam="${id}"] .dam-symbol`)).toHaveAttribute('data-state','unknown');
 await expect(page.getByLabel('Dam symbol legend')).toContainText('Above listed crest');
 await expect(page.getByRole('link',{name:'Download crest-check CSV'})).toHaveAttribute('href','/api/dam-spillway-review.csv');
 const states=await page.evaluate(()=>{
  const dam={storageWaterGauge:{id:'540177'},spillwayCrest:{level:57,datum:null}};
  return [DamMarker.state(dam,{level:57,datum:'AHD'}),DamMarker.state(dam,{level:3,datum:'LGH'}),DamMarker.state(dam,{level:68,datum:'AHD'}),DamMarker.state(dam,{level:56,datum:'AHD',ageMinutes:61})];
 });
 expect(states).toEqual(['at','unknown','unknown','unknown']);
});

test('shared hydrograph draws compatible published thresholds and provisional spillway only',async({page})=>{
 await page.goto('/water-history');
 const result=await page.evaluate(()=>{
  const host=document.createElement('div');host.style='width:800px;height:600px';document.body.append(host);
  const start='2026-11-03T00:00:00Z',end='2026-11-03T01:00:00Z';
  const series={start,end,observations:[{time:start,level:94,datum:'AHD'},{time:end,level:95,datum:'AHD'}],references:[
   {kind:'minor',level:96,datum:'AHD',source:'BoM test source'},
   {kind:'moderate',level:97,datum:'AHD',source:'BoM test source'},
   {kind:'major',level:98,datum:'AHD',source:'BoM test source'},
   {kind:'spillway',level:94.5,datum:'AHD',provisional:true,source:'User supplied'},
   {kind:'minor',level:3,datum:'LGH',source:'Wrong datum'}
  ]};
  const chart=GaugePlots.water(host,{id:'540610',name:'Test lake',level:95,datum:'AHD',observedAt:end},series);
  host.querySelector('#showRecordedPoints').click();
  return {references:chart.data.datasets.filter(d=>d.referenceKind).map(d=>({kind:d.referenceKind,radius:d.pointRadius,label:d.label})),notes:host.textContent};
 });
 expect(result.references.map(r=>r.kind)).toEqual(['minor','moderate','major','spillway']);
 expect(result.references.every(r=>r.radius===0)).toBe(true);
 expect(result.references[3].label).toContain('PROVISIONAL TEST');
 expect(result.notes).toContain('reference omitted because datum compatibility is unverified');
});

test('crest CSV has all dams and never manufactures zero readings when database is absent',async({request})=>{
 const response=await request.get('/api/dam-spillway-review.csv');expect(response.ok()).toBe(true);
 expect(response.headers()['content-type']).toContain('text/csv');
 const csv=await response.text();expect(csv).toContain('over_10m');expect(csv.trim().split('\n')).toHaveLength(50);expect(csv).toContain('Hinze Dam');
});
