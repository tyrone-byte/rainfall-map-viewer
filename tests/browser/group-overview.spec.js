const {test,expect}=require('@playwright/test');
const bris='brisbane-bremer-pine-caboolture',gold='gold-coast-logan',last='2026-10-22T00:00:00Z';
async function mock(page){
 const calls=[];const groups=[{id:bris,label:'Brisbane group',gaugeCount:2},{id:gold,label:'Gold Coast group',gaugeCount:2}];
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups}}));
 await page.route('**/api/archive-rainfall/group-stats',r=>r.fulfill({json:{available:false}}));
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-20T00:00:00Z',lastEnd:last}}));
 const navigation=[{id:bris,anchor:[-27.4,153],mappedGaugeCount:2,bounds:[152.7,-27.7,153.2,-27.1],footprint:[[152.7,-27.7],[153.2,-27.7],[153.2,-27.1],[152.7,-27.1]]},{id:gold,anchor:[-28.1,153.35],mappedGaugeCount:2,bounds:[153.1,-28.4,153.6,-27.6],footprint:[[153.1,-28.4],[153.6,-28.4],[153.6,-27.6],[153.1,-27.6]]}];
 await page.route('**/gauge-group-overview.json',r=>r.fulfill({json:{schemaVersion:1,rain:navigation,water:navigation}}));
 function stations(basin){const values=basin===bris?[['a','Alpha gauge','North',-27.4,153],['b','Beta gauge','South',-27.65,153.1]]:[['c','Coast gauge','Coast',-28.1,153.3],['d','Coast south','Coast',-28.2,153.4]];return values.map(([id,name,group,lat,lon])=>({id,name,group,basinId:basin,stationNumber:id,coordinates:{lat,lon},depth:96,complete:true,validBlocks:96,expectedBlocks:96}));}
 await page.route('**/api/archive-rainfall/frame?*',r=>{const q=new URL(r.request().url()).searchParams,basin=q.get('basin');calls.push(basin);return r.fulfill({json:{available:true,end:last,start:'2026-10-21T00:00:00Z',minutes:Number(q.get('minutes')),stations:[...stations(basin),...stations(basin===bris?gold:bris)]}});});
 await page.route('**/api/archive-rainfall/series?*',r=>{const id=new URL(r.request().url()).searchParams.get('gauge'),station=[...stations(bris),...stations(gold)].find(s=>s.id===id);return r.fulfill({json:{available:true,end:last,periodMinutes:15,periods:Array.from({length:96},(_,i)=>({start:new Date(Date.parse(last)-(96-i)*900000).toISOString(),end:new Date(Date.parse(last)-(95-i)*900000).toISOString()})),stations:[{...station,values:Array(96).fill(1)}]}});});
 await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-20T00:00:00Z',lastEnd:last}}));
 await page.route('**/api/archive-water/frame?*',r=>{const q=new URL(r.request().url()).searchParams,basin=q.get('basin');calls.push(basin);return r.fulfill({json:{available:true,start:'2026-10-21T00:00:00Z',end:last,minutes:Number(q.get('minutes')),stations:[...stations(basin),...stations(basin===bris?gold:bris)].map(s=>({...s,level:1,datum:'AHD',direction:'rising',levelChange:.1,ageMinutes:0,observedAt:last,status:'current'}))}});});
 await page.route('**/api/archive-water/series?*',r=>r.fulfill({json:{available:true,start:'2026-10-21T00:00:00Z',end:last,observations:[{time:'2026-10-21T23:00:00Z',level:.9,datum:'AHD'},{time:last,level:1,datum:'AHD'}]}}));
 await page.route('**/reference/local-ifd-index.json',r=>r.fulfill({json:{schemaVersion:1,locations:{}}}));
 await page.route('**/api/archive-rainfall/group-series?*',r=>{const basin=new URL(r.request().url()).searchParams.get('basin');return r.fulfill({json:{available:true,end:last,periodMinutes:15,periods:Array.from({length:96},(_,i)=>({start:new Date(Date.parse(last)-(96-i)*900000).toISOString(),end:new Date(Date.parse(last)-(95-i)*900000).toISOString()})),stations:stations(basin).map(s=>({...s,values:Array(96).fill(1)}))}});});
 return calls;
}
async function pointMap(page,lat,lon,click=false){const point=await page.evaluate(({lat,lon})=>{const p=map.latLngToContainerPoint([lat,lon]),r=document.getElementById('map').getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};},{lat,lon});await page.mouse.move(point.x,point.y);if(click)await page.mouse.click(point.x,point.y);}
async function clickMap(page,lat,lon){await pointMap(page,lat,lon,true);}
test('overview labels and unambiguous map areas open a group and refit its gauges',async({page})=>{
 const calls=await mock(page);await page.goto('/history');await expect(page.locator('#mapGroup option')).toHaveCount(3);await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));
 await expect(page.locator('[data-group-overview]')).toHaveCount(0);await pointMap(page,-27.15,152.8);await expect(page.locator('[data-group-overview]')).toHaveText('Brisbane group');await page.mouse.move(0,0);await expect(page.locator('[data-group-overview]')).toHaveCount(0);await clickMap(page,-27.15,152.8);await expect(page.locator('#basinTitle')).toHaveText('Brisbane group');await expect(page.locator('.station')).toHaveCount(2);
 expect(await page.evaluate(()=>[...markers.values()].every(m=>map.getBounds().contains(m.getLatLng())))).toBe(true);
 await expect(page.locator('[data-group-overview]')).toHaveCount(0);
 await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));await expect(page.locator('[data-group-overview]')).toHaveCount(0);
 expect(await page.evaluate(()=>map.groupOverview.broadView)).toBe(true);await clickMap(page,-28.3,153.5);await expect(page.locator('#basinTitle')).toHaveText('Gold Coast group');await expect.poll(()=>calls.at(-1)).toBe(gold);await expect(page.locator('.group-choice-popup')).toHaveCount(0);
 expect(await page.evaluate(()=>[...markers.keys()].sort())).toEqual(['c','d']);
 await page.evaluate(()=>map.setView([-20,145],6,{animate:false}));await page.locator('#mapGroup').selectOption(gold);await expect(page.locator('#basinTitle')).toHaveText('Gold Coast group');await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeLessThan(-28);
 await page.locator('.page-tabs [aria-current="page"]').click();await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));await expect(page.locator('[data-group-overview]')).toHaveCount(0);await clickMap(page,-27.15,152.8);await expect(page.locator('#basinTitle')).toHaveText('Brisbane group');await expect.poll(()=>calls.at(-1)).toBe(bris);
});
test('overlapping group footprints offer a choice instead of guessing',async({page})=>{
 const calls=await mock(page);await page.goto('/history');await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));await expect(page.locator('[data-group-overview]')).toHaveCount(0);await pointMap(page,-27.65,153.15);await expect(page.locator('[data-group-overview]')).toHaveCount(2);await clickMap(page,-27.65,153.15);
 await expect(page.locator('.group-choice-popup')).toContainText('Choose a gauge group');expect(calls).toHaveLength(0);await page.getByRole('button',{name:'Gold Coast group',exact:true}).click();await expect(page.locator('#basinTitle')).toHaveText('Gold Coast group');
});
for(const mobile of [false,true])test(`gauge click reveals totals and subgroup selection refits (${mobile?'phone':'desktop'})`,async({page})=>{
 if(mobile)await page.setViewportSize({width:390,height:844});const calls=await mock(page);await page.goto('/history?basin='+bris);await expect(page.locator('.station')).toHaveCount(2);
 await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));await expect(page.locator('[data-group-overview]')).toHaveCount(0);
 if(mobile)await page.getByRole('button',{name:'Expand map',exact:true}).click();
 await page.locator('.leaflet-overlay-pane path.leaflet-interactive').first().click();await expect(page.locator('#hyetograph')).toBeVisible();await expect(page.locator('.metrics')).toBeInViewport();expect(calls).toHaveLength(1);await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('#group').selectOption('South');await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(-27.65,4);await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBe(12);expect(await page.evaluate(()=>markers.size)).toBe(1);
});

test('water-level group labels load and refit water gauges, then reveal their chart',async({page})=>{
 await mock(page);await page.goto('/water-history');await page.evaluate(()=>map.setView([-27.6,153.1],8,{animate:false}));await expect(page.locator('[data-group-overview]')).toHaveCount(0);await pointMap(page,-28.3,153.5);await expect(page.locator('[data-group-overview]')).toHaveText('Gold Coast group');
 await clickMap(page,-28.3,153.5);await expect(page.locator('#basinTitle')).toHaveText('Gold Coast group');await expect(page.locator('.station')).toHaveCount(2);await expect(page.locator('[data-group-overview]')).toHaveCount(0);
 await page.locator('#mapGroup').selectOption(bris);await expect(page.locator('#basinTitle')).toHaveText('Brisbane group');await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeGreaterThan(-28);
 await page.locator('[data-gauge="water:a"]').click();await expect(page.locator('#waterHistoryChart')).toBeInViewport();
});

test('switching water, point IFD and rainfall retains the selected group and viewport',async({page})=>{
 await mock(page);await page.goto('/water-history?basin='+bris);await expect(page.locator('.station')).toHaveCount(2);await page.evaluate(()=>map.setView([-27.5,153.05],10,{animate:false}));
 await page.getByRole('link',{name:'Point Rainfall IFD',exact:true}).click();await expect(page.locator('.station')).toHaveCount(2);await expect(page.locator('#mapGroup')).toHaveValue(bris);expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.project(map.getCenter()).distanceTo(map.project([-27.5,153.05])))).toBeLessThan(1);
 await page.getByRole('link',{name:'Water levels',exact:true}).click();await expect(page.locator('.station')).toHaveCount(2);await expect(page.locator('#mapGroup')).toHaveValue(bris);expect(await page.evaluate(()=>map.getZoom())).toBe(10);
 await page.locator('#mapGroup').selectOption(gold);await expect(page.locator('#basinTitle')).toHaveText('Gold Coast group');await expect.poll(()=>page.evaluate(()=>map.getCenter().lat)).toBeLessThan(-28);
 await page.getByRole('link',{name:'Rainfall',exact:true}).click();await expect(page.locator('.station')).toHaveCount(2);await expect(page.locator('#mapGroup')).toHaveValue(gold);expect(await page.evaluate(()=>map.getCenter().lat)).toBeLessThan(-28);
});
