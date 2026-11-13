const {test,expect}=require('@playwright/test');
const basin='brisbane-bremer-pine-caboolture',end='2026-11-13T00:00:00Z';
async function mock(page,{unknown=false}={}){
 const periods=Array.from({length:96},(_,i)=>({start:new Date(Date.parse(end)-(96-i)*900000).toISOString(),end:new Date(Date.parse(end)-(95-i)*900000).toISOString()}));
 const station={id:'a',stationNumber:'540111',name:'Storm Creek',group:'Brisbane',basinId:basin,coordinates:{lat:-27,lon:152}};
 const extent={source:{status:'ok'}},rainfall={available:true,start:periods[0].start,end,extent,stations:[{...station,complete:true,depth:100},{...station,id:'duplicate',complete:true,depth:100},{...station,id:'bad',stationNumber:'bad',name:'Incomplete gauge',complete:false,depth:null}]};
 const pointRainfall={available:true,start:periods[0].start,end,extent,periods,stations:[{...station,values:periods.map((_,i)=>i===80?40:.1)}]};
 const water={available:true,start:periods[0].start,end,extent,stations:[{...station,id:'540111',name:'Fallen River',level:.5,datum:'AHD',observedAt:end,currentFlood:{category:unknown?'unknown':'below'},peakFlood:unknown?null:{category:'major',level:3.5,datum:'AHD',observedAt:periods[80].end},sampleCount:96,assessedSamples:unknown?0:96}]};
 await page.route('**/api/storm-summary?*',r=>r.fulfill({json:{minutes:Number(new URL(r.request().url()).searchParams.get('minutes')),generatedAt:end,rainfall,pointRainfall,water}}));
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({json:{schemaVersion:1,locations:{'-27.000000,152.000000':{file:'test.json'}}}}));
 await page.route('**/reference/local-ifd/test.json',r=>r.fulfill({json:{locationKey:'-27.000000,152.000000',region:{name:'Test regional centroid'},datasets:[{name:'Default Current (2030) Baseline',aeps:[50,10,1],points:[{minutes:15,depths:[10,20,40]},{minutes:1440,depths:[40,80,160]}]}]}}));
}
test('summary deduplicates rainfall, flags rare short bursts and retains major flood after falling',async({page})=>{
 await mock(page);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');
 await expect(page.locator('#headline .summary-stat strong')).toHaveText(['1','1','1']);await expect(page.locator('#rainList .summary-row')).toHaveCount(1);
 await expect(page.locator('#aepList')).toContainText('≈1% AEP');await expect(page.locator('#aepList')).toContainText('15 min');await expect(page.locator('#waterList')).toContainText('MAJOR reached');await expect(page.locator('#waterList')).toContainText('latest: below');
 await expect(page.locator('#aepList a')).toHaveAttribute('href',/\/point-ifd\?.*mode=wettest/);await expect(page.locator('#waterList a')).toHaveAttribute('href',/\/water-history\?.*gauge=540111/);
 expect(await page.evaluate(()=>pins.getLayers().length)).toBe(2);await page.locator('#rainLimit').selectOption('200');await expect(page.locator('#rainList')).toContainText('No complete saved total');await expect(page.locator('#aepList .summary-row')).toHaveCount(1);
 await page.locator('#lookback').selectOption('4320');await expect(page.locator('#headline')).toContainText('3 days');expect(errors).toEqual([]);
 await page.screenshot({path:'/tmp/storm-summary-desktop.png',fullPage:true});
});
test('phone summary is usable with unknown flood thresholds and missing IFD references',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page,{unknown:true});await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({status:503}));await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');
 await expect(page.locator('#headline .summary-stat strong')).toHaveText(['1','—','—']);await expect(page.locator('#floodCoverage')).toContainText('This does not mean no flooding occurred');await expect(page.locator('#rainList .summary-row')).toHaveCount(1);await expect(page.locator('#aepList')).toContainText('assessment unavailable');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'/tmp/storm-summary-phone.png',fullPage:true});
 await page.route('**/api/storm-summary?*',r=>r.fulfill({status:503}));await page.locator('#refresh').click();await expect(page.locator('#loadStatus')).toContainText('Could not load');await expect(page.locator('#rainList .summary-row')).toHaveCount(0);expect(await page.evaluate(()=>pins.getLayers().length)).toBe(0);
});

test('an empty connected archive is unknown rather than zero significant events',async({page})=>{
 await mock(page);await page.route('**/api/storm-summary?*',r=>r.fulfill({json:{minutes:1440,generatedAt:end,rainfall:{available:true,stations:[]},pointRainfall:{available:true,stations:[],periods:[]},water:{available:true,stations:[]}}}));
 await page.goto('/summary');await expect(page.locator('#loadStatus')).toContainText('Saved summary loaded');await expect(page.locator('#headline .summary-stat strong')).toHaveText(['—','—','—']);await expect(page.locator('#rainList')).toContainText('No complete rainfall totals available');
});
