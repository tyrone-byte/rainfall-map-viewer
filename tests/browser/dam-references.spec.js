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

test('on-map legend covers dam, rainfall, water and contextual layers and collapses without moving the map',async({page})=>{
 await page.goto('/dams');const legend=page.getByLabel('Map legend',{exact:true});
 await expect(page.locator('#map .dam-map-legend')).toHaveCount(1);
 for(const text of ['Dams · provisional crest comparison','At / below listed crest','Above listed crest','Unresolved / missing / stale / review','Selected dam','Rainfall · selected duration (mm)','≤5','>5–30','>30–80','>80','Incomplete / missing','Water levels · 60-minute change','Rising','Falling','Steady','Insufficient data','Named watercourses','Water-plan boundary'])await expect(legend).toContainText(text);
 const mapBox=await page.locator('#map').boundingBox(),legendBox=await legend.boundingBox();
 expect(legendBox.x).toBeGreaterThanOrEqual(mapBox.x);expect(legendBox.y).toBeGreaterThanOrEqual(mapBox.y);expect(legendBox.x+legendBox.width).toBeLessThanOrEqual(mapBox.x+mapBox.width);expect(legendBox.y+legendBox.height).toBeLessThanOrEqual(mapBox.y+mapBox.height);
 const boundsBefore=await page.locator('.leaflet-map-pane').getAttribute('style');
 await legend.locator('summary').click();await expect(legend).not.toHaveAttribute('open','');
 await legend.locator('summary').click();await expect(legend).toHaveAttribute('open','');
 expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(boundsBefore);
});

test('phone legend starts compact and expands within the map without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/dams');
 const legend=page.getByLabel('Map legend',{exact:true});await expect(legend).not.toHaveAttribute('open','');
 await legend.locator('summary').click();await expect(legend).toHaveAttribute('open','');
 const mapBox=await page.locator('#map').boundingBox(),legendBox=await legend.boundingBox();
 expect(legendBox.x).toBeGreaterThanOrEqual(mapBox.x);expect(legendBox.x+legendBox.width).toBeLessThanOrEqual(mapBox.x+mapBox.width);expect(legendBox.y).toBeGreaterThanOrEqual(mapBox.y);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('SLS references use only the confirmed same-station datum basis',async({page})=>{
 const records=require('../../data/water-reference-levels.json').records.filter(r=>r.stationId==='540111');await page.goto('/water-history');
 const result=await page.evaluate(records=>{
  const host=document.createElement('div');host.style='width:800px;height:600px';document.body.append(host);
  const start='2026-11-14T00:00:00Z',end='2026-11-14T01:00:00Z',station={id:'540111',name:'SLS test gauge',level:35,datum:'AHD',observedAt:end};
  function plot(datum,references){const chart=GaugePlots.water(host,station,{start,end,observations:[{time:start,level:34,datum},{time:end,level:35,datum}],references});const lines=chart.data.datasets.filter(d=>d.referenceKind).map(d=>({label:d.label,level:d.data[0].y}));chart.destroy();return lines;}
  return {valid:plot('AHD',records),unverified:plot('AHD',records.map(r=>({...r,datumVerified:false}))),unspecified:plot(null,records)};
 },records);
 expect(result.valid.map(r=>r.level)).toEqual([33.5,35,36]);expect(result.valid.every(r=>r.label.includes('AHD'))).toBe(true);expect(result.unverified).toEqual([]);expect(result.unspecified).toEqual([]);
});
