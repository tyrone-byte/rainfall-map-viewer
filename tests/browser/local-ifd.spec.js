const {test,expect}=require('@playwright/test');
async function savedGoolman(page){
 const end='2026-10-28T00:00:00Z',basin='brisbane-bremer-pine-caboolture';
 const station={id:'goolman',name:'Goolman',group:'Brisbane',basinId:basin,stationNumber:'540668',coordinates:{lat:-27.7361,lon:152.7668},ifdLocationKey:'-27.736111,152.766667',depth:96,validBlocks:96,expectedBlocks:96,complete:true};
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:[{id:basin,label:'Brisbane',gaugeCount:1}]}}));
 await page.route('**/api/archive-rainfall/group-stats',r=>r.fulfill({json:{available:false}}));
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-27T00:00:00Z',lastEnd:end}}));
 await page.route('**/api/archive-rainfall/frame?*',r=>r.fulfill({json:{available:true,start:'2026-10-27T00:00:00Z',end,minutes:1440,stations:[station]}}));
 await page.route('**/api/archive-rainfall/series?*',r=>r.fulfill({json:{available:true,periodMinutes:15,periods:Array.from({length:96},(_,i)=>({start:new Date(Date.parse(end)-(96-i)*900000).toISOString(),end:new Date(Date.parse(end)-(95-i)*900000).toISOString()})),stations:[{...station,values:Array(96).fill(1)}]}}));
 await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await page.locator('.station').click();
}

test('Goolman automatically uses the Ipswich centroid default 2030 reference',async({page})=>{
 const arr=[];page.on('request',r=>{if(r.url().includes('data.arr-software.org'))arr.push(r.url());});
 await savedGoolman(page);
 await expect(page.locator('#ifdComparison')).toContainText('Ipswich City');
 await expect(page.locator('#ifdComparison')).toContainText('Default Current (2030) Baseline');
 await expect(page.locator('#ifdComparison')).toContainText('not a gauge-specific IFD');
 await expect(page.locator('#ifdDataset')).toHaveCount(0);
 await expect(page.locator('#ifdChart')).toBeVisible();
 const reference=require('../../data/ifd/locations/lga-3960.json').datasets[0];
 const expected=reference.points.find(p=>p.minutes===180).depths[reference.aeps.indexOf(1)];
 const depth=()=>page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets.find(d=>d.label==='1% AEP reference').data.find(p=>p.x===180).y);
 expect(await depth()).toBe(expected);
 await page.locator('#ifdMode').selectOption('wettest');expect(await depth()).toBe(expected);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(arr).toEqual([]);
});
test('regional file failure never silently substitutes Brisbane',async({page})=>{
 await page.route('**/reference/local-ifd/*.json',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
 await savedGoolman(page);
 await expect(page.locator('#ifdComparison')).toContainText('No Brisbane reference has been substituted');
 await expect(page.locator('#ifdChart')).toHaveCount(0);await expect(page.locator('#hyetograph')).toBeVisible();
});
test('assignment index failure cannot silently substitute Brisbane',async({page})=>{
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
 await savedGoolman(page);
 await expect(page.locator('#ifdComparison')).toContainText('Saved IFD assignments could not be checked');
 await expect(page.locator('#ifdChart')).toHaveCount(0);
});
test('saved local references outside a regional assignment retain explicit selection',async({page})=>{
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({json:{schemaVersion:1,locations:{'-27.736111,152.766667':{file:'4a602f4a7b7e1079.json'}},regionalAssignments:{}}}));
 await savedGoolman(page);
 await expect(page.locator('#ifdDataset')).toHaveValue('');
 await expect(page.locator('#ifdChart')).toHaveCount(0);
 await page.locator('#ifdDataset').selectOption('BoM IFD Depths (2030 Baseline - SSP1)');
 await expect(page.locator('#ifdChart')).toBeVisible();
 expect(await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets.find(d=>d.label==='1% AEP reference').data.find(p=>p.x===180).y)).toBe(138);
});
