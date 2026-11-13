const {test,expect}=require('@playwright/test');
const basin='brisbane-bremer-pine-caboolture',end='2026-11-13T00:00:00Z';
async function mock(page,{unassigned=false}={}){
 const periods=Array.from({length:96},(_,i)=>({start:new Date(Date.parse(end)-(96-i)*900000).toISOString(),end:new Date(Date.parse(end)-(95-i)*900000).toISOString()}));
 const station={id:'a',stationNumber:'540111',name:'Storm Creek',group:'Brisbane',basinId:basin,coordinates:{lat:-27,lon:152}};
 const extent={source:{status:'ok'}},rainfall={available:true,start:periods[0].start,end,extent,stations:[{...station,complete:true,depth:100},{...station,id:'duplicate',complete:true,depth:100},{...station,id:'bad',stationNumber:'bad',name:'Incomplete gauge',complete:false,depth:null}]};
 const pointRainfall={available:true,start:periods[0].start,end,extent,periods,stations:[{...station,values:periods.map((_,i)=>i===80?40:.1)}]};

 if(unassigned){const other={...station,id:'outside',stationNumber:'540668',name:'Outside IFD region',coordinates:{lat:-27.1,lon:152.1}};rainfall.stations.push({...other,complete:true,depth:120});pointRainfall.stations.push({...other,values:Array(96).fill(1.25)});}
 await page.route('**/api/storm-summary?*',r=>r.fulfill({json:{minutes:Number(new URL(r.request().url()).searchParams.get('minutes')),generatedAt:end,rainfall,pointRainfall}}));
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({json:{schemaVersion:1,locations:{'-27.000000,152.000000':{file:'test.json'}}}}));
 await page.route('**/reference/local-ifd/test.json',r=>r.fulfill({json:{locationKey:'-27.000000,152.000000',region:{name:'Test regional centroid'},datasets:[{name:'Default Current (2030) Baseline',aeps:[50,10,1],points:[{minutes:15,depths:[10,20,40]},{minutes:1440,depths:[40,80,160]}]}]}}));
}
test('rainfall-only summary deduplicates gauges, flags short bursts and reuses AEPs',async({page})=>{
 await mock(page);let workers=0;page.on('worker',()=>workers++);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');
 await expect(page.locator('#headline .summary-stat strong')).toHaveText(['1','1']);await expect(page.locator('#rainList .summary-row')).toHaveCount(1);
 await expect(page.locator('#aepList')).toContainText('≈1% AEP');await expect(page.locator('#aepList')).toContainText('15 min');await expect(page.locator('#waterList')).toHaveCount(0);
 await expect(page.locator('#aepList a')).toHaveAttribute('href',/\/point-ifd\?.*mode=wettest/);
 expect(await page.evaluate(()=>pins.getLayers().length)).toBe(1);await page.locator('#rainLimit').selectOption('200');await expect(page.locator('#rainList')).toContainText('No complete saved total');await expect(page.locator('#aepList .summary-row')).toHaveCount(1);
 await page.locator('#lookback').selectOption('4320');await expect(page.locator('#headline')).toContainText('3 days');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');expect(workers).toBe(1);expect(errors).toEqual([]);
 await page.screenshot({path:'/tmp/storm-summary-desktop.png',fullPage:true});
});
test('phone rainfall summary remains usable when IFD references are unavailable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({status:503}));await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');
 await expect(page.locator('#headline .summary-stat strong')).toHaveText(['1','—']);await expect(page.locator('#waterHeading')).toHaveCount(0);await expect(page.locator('#rainList .summary-row')).toHaveCount(1);await expect(page.locator('#aepList')).toContainText('assessment unavailable');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'/tmp/storm-summary-phone.png',fullPage:true});
 await page.route('**/api/storm-summary?*',r=>r.fulfill({status:503}));await page.locator('#refresh').click();await expect(page.locator('#loadStatus')).toContainText('Could not load');await expect(page.locator('#rainList .summary-row')).toHaveCount(0);expect(await page.evaluate(()=>pins.getLayers().length)).toBe(0);
});

test('an empty connected archive is unknown rather than zero significant events',async({page})=>{
 await mock(page);await page.route('**/api/storm-summary?*',r=>r.fulfill({json:{minutes:1440,generatedAt:end,rainfall:{available:true,stations:[]},pointRainfall:{available:true,stations:[],periods:[]},water:{available:true,stations:[]}}}));
 await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');await expect(page.locator('#headline .summary-stat strong')).toHaveText(['—','—']);await expect(page.locator('#rainList')).toContainText('No complete rainfall totals available');
});

test('rainfall values appear while point AEP references are still loading',async({page})=>{
 await mock(page);let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('**/reference/local-ifd-index.json',async r=>{await gate;await r.fulfill({status:503});});
 await page.goto('/summary');await expect(page.locator('#rainList .summary-row')).toHaveCount(1);await expect(page.locator('#headline .summary-stat strong').first()).toHaveText('1');await expect(page.locator('#loadStatus')).toContainText('Assessing point rainfall');
 release();await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');await expect(page.locator('#rainList .summary-row')).toHaveCount(1);
});
test('a stalled summary request times out and allows retry instead of loading forever',async({page})=>{
 await page.clock.install();await page.route('**/api/storm-summary?*',()=>{});await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Loading saved rainfall');
 await page.clock.fastForward(21000);await expect(page.locator('#loadStatus')).toContainText('timed out');await expect(page.locator('#refresh')).toBeEnabled();
});

test('rainfall flags survive AEP completion for gauges without assigned IFD references',async({page})=>{
 await mock(page,{unassigned:true});let release;const gate=new Promise(resolve=>release=resolve);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/reference/local-ifd-index.json',async r=>{await gate;await r.fulfill({json:{schemaVersion:1,locations:{'-27.000000,152.000000':{file:'test.json'}}}});});
 await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Assessing point rainfall');expect(await page.evaluate(()=>pins.getLayers().length)).toBe(2);await expect(page.locator('#rainList .summary-row')).toHaveCount(2);
 release();await expect(page.locator('#aepList')).toContainText('≈1% AEP');await expect(page.locator('#headline .summary-stat strong')).toHaveText(['2','1']);await expect(page.locator('#rainList')).toContainText('Outside IFD region');expect(await page.evaluate(()=>pins.getLayers().length)).toBe(2);expect(errors).toEqual([]);
 const mapBox=await page.locator('.summary-map-panel').boundingBox(),summaryBox=await page.locator('.summary-sections').boundingBox();expect(mapBox.x+mapBox.width).toBeLessThanOrEqual(summaryBox.x);expect((await page.locator('#map').boundingBox()).height).toBeGreaterThan(500);
 await page.locator('#refresh').click();await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');expect(await page.evaluate(()=>pins.getLayers().length)).toBe(2);
 await page.screenshot({path:'/tmp/overview-side-by-side.png',fullPage:true});
});
test('a missing regional curve cannot clear valid rainfall results',async({page})=>{
 await mock(page);await page.route('**/reference/local-ifd/test.json',r=>r.fulfill({status:503}));await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');await expect(page.locator('#headline .summary-stat strong')).toHaveText(['1','—']);await expect(page.locator('#rainList .summary-row')).toHaveCount(1);expect(await page.evaluate(()=>pins.getLayers().length)).toBe(1);
});
