const {test,expect}=require('@playwright/test');
const last='2026-10-22T00:00:00Z',basin='brisbane-bremer-pine-caboolture',spikeEnd=new Date(Date.parse(last)-(96-21)*900000).toISOString();
async function mock(page,{missing=false}={}){
 const requests=[],outside=[];
 page.on('request',r=>{if(r.url().includes('data.arr-software.org'))outside.push(r.url());});
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:[{id:basin,label:'Test basin',gaugeCount:3}]}}));
 await page.route('**/api/archive-rainfall/group-stats',r=>r.fulfill({json:{available:false}}));
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-20T00:00:00Z',lastEnd:last}}));
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({json:{schemaVersion:1,locations:{'-27.000000,152.000000':{file:'test-region.json'}},regionalAssignments:{'-27.736100,152.766800':'-27.000000,152.000000','-27.500000,153.000000':'-27.000000,152.000000'}}}));
 await page.route('**/reference/local-ifd/test-region.json',r=>r.fulfill({json:{locationKey:'-27.000000,152.000000',coordinates:{lat:-27,lon:152},referenceType:'regional-centroid',region:{name:'Test region'},datahubVersion:'test',attribution:'Test fixture',datasets:[{name:'Default Current (2030) Baseline',aeps:[50,20,10,5,2,1,.1],points:[{minutes:15,depths:[10,15,20,25,30,40,80]},{minutes:60,depths:[20,30,40,50,60,80,160]},{minutes:1440,depths:[40,60,80,100,120,160,320]}]}]}}));
 await page.route('**/api/archive-rainfall/group-series?*',r=>{
  const end=new URL(r.request().url()).searchParams.get('end');requests.push(end);
  const periods=Array.from({length:96},(_,i)=>({start:new Date(Date.parse(end)-(96-i)*900000).toISOString(),end:new Date(Date.parse(end)-(95-i)*900000).toISOString()}));
  const gauge=(id,name,coordinates,values)=>({id,name,group:'Test gauges',basinId:basin,stationNumber:id,coordinates,values});
  const values=periods.map(p=>missing?null:Date.parse(p.end)===Date.parse(spikeEnd)?40:.05);
  return r.fulfill({json:{available:true,start:periods[0].start,end,periodMinutes:15,periods,stations:[gauge('a','Alpha gauge',{lat:-27.7361,lon:152.7668},values),gauge('b','Beta gauge',{lat:-27.5,lon:153},periods.map(()=>1)),gauge('c','No default gauge',{lat:-27,lon:150},periods.map(()=>1))]}});
 });
 return {requests,outside};
}
test('map defaults to rarest duration; hover and use-window expose the controlling interval',async({page})=>{
 const {outside}=await mock(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/point-ifd?basin='+basin);await expect(page.locator('#count')).toContainText('3 gauges');
 await expect(page.locator('h1')).toHaveText('Point Rainfall IFD');await expect(page.locator('#mapIfdMode')).toHaveValue('wettest');await expect(page.locator('#accumulation')).toBeDisabled();
 expect(await page.evaluate(()=>frame.stations.find(s=>s.id==='a').pointIFD.minutes)).toBe(15);
 expect(await page.evaluate(()=>markers.get('a').options.fillColor)).toBe('#c9414a');
 await page.evaluate(()=>markers.get('a').openTooltip());await expect(page.locator('.point-ifd-tooltip')).toContainText('≈1% AEP');await expect(page.locator('.point-ifd-tooltip')).toContainText('15 minutes · 40.0 mm');expect(await page.locator('.point-ifd-tooltip').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(250);
 await page.locator('.station').filter({hasText:'Alpha gauge'}).click();
 await expect(page.locator('#hyetograph')).toBeVisible();await expect(page.locator('#ifdChart')).toBeVisible();await expect(page.locator('#ifdMode')).toHaveValue('wettest');
 expect(await page.locator('#detail').evaluate(el=>el.getBoundingClientRect().top>document.querySelector('#map').getBoundingClientRect().top)).toBe(true);
 await page.locator('#useIfdWindow').click();
 await expect(page.locator('#mapIfdMode')).toHaveValue('latest');await expect(page.locator('#accumulation')).toHaveValue('15');await expect(page.locator('#accumulation')).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>frame.end)).toBe(spikeEnd);
 expect(await page.evaluate(()=>frame.stations.find(s=>s.id==='a').pointIFD.aep)).toBe(1);
 await page.locator('#accumulation').selectOption('60');await expect.poll(()=>page.evaluate(()=>frame.stations.find(s=>s.id==='a').pointIFD.minutes)).toBe(60);
 expect(await page.evaluate(()=>frame.stations.find(s=>s.id==='a').pointIFD.aep)).toBeGreaterThan(1);
 await expect(page).toHaveURL(/mode=latest/);expect(outside).toEqual([]);expect(errors).toEqual([]);
});
test('unassigned and missing readings stay grey; mobile plots remain below the map',async({page})=>{
 await mock(page,{missing:true});await page.setViewportSize({width:390,height:844});await page.goto('/point-ifd?basin='+basin);
 await expect(page.locator('#count')).toContainText('3 gauges');
 expect(await page.evaluate(()=>markers.get('a').options.fillColor)).toBe('#88969c');expect(await page.evaluate(()=>markers.get('c').options.fillColor)).toBe('#88969c');
 await page.locator('.station').filter({hasText:'No default gauge'}).click();await expect(page.locator('#ifdComparison')).toContainText('No assigned default 2030 IFD');await expect(page.locator('#ifdChart')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('missing reference index cannot generate fallback point AEP colours',async({page})=>{
 await mock(page);await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
 await page.goto('/point-ifd?basin='+basin);await expect(page.locator('#notice')).toContainText('Saved IFD assignments unavailable');await expect(page.locator('.station')).toHaveCount(0);
});
