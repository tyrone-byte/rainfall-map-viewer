const {test,expect}=require('@playwright/test');
const end='2026-10-29T00:00:00Z',coords={lat:-27.4,lon:152.6},basinId='brisbane-bremer-pine-caboolture';
const gauge={id:'540177',name:'Water at dam TW',basinId,coordinates:coords,level:2.5,datum:'LGH',direction:'rising'};
async function mock(page){
 const dam={id:'wivenhoe',name:'Wivenhoe Dam',owner:'Seqwater',lat:-27.39306,lon:152.60417,catchmentAreaHa:702000,surfaceAreaFSL:10750,surfaceAreaUnit:'ha',fullSupplyVolume:1165238,fullSupplyVolumeUnit:'ML',catchmentBoundary:null,nearestRainGauge:{id:'rain-a',name:'Nearest rainfall station',basinId,distanceKm:1.25},nearestWaterGauge:{id:gauge.id,basinId,name:gauge.name,distanceKm:.8}};
 await page.route('**/dams-catalogue.json',r=>r.fulfill({json:{dams:[dam,{...dam,id:'other',name:'Other Dam',owner:'Sunwater'}],rain:[{id:'rain-a',name:'Nearest rainfall station',basinId,coordinates:coords}],water:[gauge]}}));
 await page.route('**/dam-boundaries.json',r=>r.fulfill({json:{dams:{wivenhoe:{id:'test-boundary',title:'Central Brisbane River',waterplan:'Moreton'},other:null}}}));
 await page.route('**/dam-boundaries/test-boundary.geojson',r=>r.fulfill({json:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[152.5,-27.5],[152.7,-27.5],[152.7,-27.3],[152.5,-27.3],[152.5,-27.5]]]}}}));
 await page.route('**/dam-watercourses/*.geojson',r=>r.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Brisbane River'},geometry:{type:'LineString',coordinates:[[152.55,-27.45],[152.65,-27.35]]}}]}}));
 await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,lastEnd:end}}));
 await page.route('**/api/archive-water/frame?*',r=>r.fulfill({json:{available:true,stations:[gauge,{...gauge,id:'other-gauge',name:'Unrelated gauge'}]}}));
 await page.route('**/api/archive-water/series?*',r=>r.fulfill({json:{available:true,observations:[{time:'2026-10-28T23:00:00Z',level:2.4,datum:'LGH'},{time:end,level:2.5,datum:'LGH'}]}}));
 await page.route('**/api/archive-water/links?*',r=>r.fulfill({json:{available:true,plotPath:'/fwo/IDQ65389/IDQ65389.540177.plt.shtml',historyPath:'/fwo/IDQ65389/IDQ65389.540177.tbl.shtml'}}));
}
test('dam facts, nearest gauge only, automatic hydrograph, BoM plot and named streams',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mock(page);let rainQueries=0;page.on('request',r=>{if(r.url().includes('/api/archive-rainfall/'))rainQueries++;});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');
 await expect(page.locator('#damInfo')).toContainText('Seqwater');for(const label of ['Assumed surface area at full supply','Assumed full supply volume','Assumed catchment area'])await expect(page.locator('#damInfo')).toContainText(label);await expect(page.locator('#damInfo')).not.toContainText('Supplied');await expect(page.locator('#damInfo')).toContainText('10,750 ha');await expect(page.locator('#damInfo')).toContainText('1,165,238 ML');await expect(page.locator('#damInfo')).toContainText('Central Brisbane River');await expect(page.locator('#damInfo')).toContainText('Moreton');
 await expect(page.locator('#gaugeNote')).toContainText('0.80 km');await expect(page.locator('#gaugeNote')).toContainText('not verified');
 await expect(page.locator('#plot canvas')).toBeVisible();await expect(page.locator('#gauges')).toContainText('Nearest rainfall station');await expect(page.locator('#gauges')).toContainText('1.25 km');await expect(page.locator('#gauges a')).toHaveAttribute('href',/history\?basin=.*gauge=rain-a/);await expect(page.locator('#gauges')).not.toContainText('Unrelated gauge');await expect(page.locator('.dam-square')).toHaveCount(1);await expect(page.getByRole('link',{name:'Open BoM plot'})).toHaveAttribute('href','https://reg.bom.gov.au/fwo/IDQ65389/IDQ65389.540177.plt.shtml');
 await expect(page.locator('#streamStatus')).toContainText('1 mapped');await page.locator('#streams').uncheck();await page.locator('#streams').check();expect(rainQueries).toBe(0);expect(errors).toEqual([]);
});
test('nearest gauge remains available without a matching boundary',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('other');await expect(page.locator('#boundaryNote')).toContainText('No containing water-plan');await expect(page.locator('#plot canvas')).toBeVisible();await expect(page.locator('#gauges')).toContainText('Nearest rainfall station');await expect(page.locator('#gauges')).toContainText('1.25 km');await expect(page.locator('#gauges a')).toHaveAttribute('href',/history\?basin=.*gauge=rain-a/);
});
test('observation failure preserves dam facts and geographic context',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/frame?*',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('could not be loaded');await expect(page.locator('#damInfo')).toContainText('1,165,238 ML');await expect(page.locator('#streamStatus')).toContainText('1 mapped');await expect(page.locator('#map')).toBeVisible();
});
test('phone order and desktop scrolling keep chart and gauge accessible',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas')).toBeVisible();await page.locator('#map').scrollIntoViewIfNeeded();const box=await page.locator('#map').boundingBox(),before=await page.evaluate(()=>scrollY);await page.mouse.move(box.x+box.width/2,Math.max(10,Math.min(box.y+box.height/2,900)));await page.mouse.wheel(0,700);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);await page.locator('footer').scrollIntoViewIfNeeded();await expect(page.locator('footer')).toBeInViewport();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const positions=await page.evaluate(()=>['.dam-controls','#map','#plot','#gaugeList'].map(s=>document.querySelector(s).getBoundingClientRect().top));expect(positions).toEqual([...positions].sort((a,b)=>a-b));
});
test('time controls update only the selected nearest water gauge',async({page})=>{
 await mock(page);const requests=[];page.on('request',r=>{if(r.url().includes('/series?'))requests.push(new URL(r.url()));});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas')).toBeVisible();await page.locator('#duration').selectOption('180');await expect(page.locator('#status')).toContainText('3 hours');await page.locator('#previous').click();await expect(page.locator('#ending')).toHaveValue('2026-10-29T07:00');await expect(page.locator('#plot canvas')).toBeVisible();const latest=requests.at(-1);expect(latest.searchParams.get('gauge')).toBe('540177');expect(latest.searchParams.get('end')).toBe('2026-10-28T21:00:00.000Z');expect(latest.searchParams.get('minutes')).toBe('180');
});
test('missing watercourses and boundary index do not prevent gauge loading',async({page})=>{
 await mock(page);await page.route('**/dam-boundaries.json',r=>r.fulfill({status:503,body:'unavailable'}));await page.route('**/dam-watercourses/*.geojson',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas')).toBeVisible();await expect(page.locator('#boundaryNote')).toContainText('could not be loaded');await expect(page.locator('#streamStatus')).toContainText('could not be loaded');
});
test('shipped dam facts and nearest gauges are complete; stream selection omits unnamed drainage',async({request})=>{
 const data=await(await request.get('/dams-catalogue.json')).json();expect(data.dams).toHaveLength(49);for(const dam of data.dams){expect(dam.nearestWaterGauge.distanceKm).toBeGreaterThanOrEqual(0);expect(data.water.some(g=>g.id===dam.nearestWaterGauge.id)).toBe(true);expect(dam.surfaceAreaUnit).toBe('ha');expect(dam.fullSupplyVolumeUnit).toBe('ML');expect(dam.nearestRainGauge.distanceKm).toBeGreaterThanOrEqual(0);expect(data.rain.some(g=>g.id===dam.nearestRainGauge.id)).toBe(true);}
 const dam=data.dams.find(d=>d.name==='Wivenhoe Dam');expect(dam.surfaceAreaFSL).toBe(10750);expect(dam.fullSupplyVolume).toBe(1165238);expect(dam.nearestWaterGauge.id).toBe('540177');
 const streams=await(await request.get('/dam-watercourses/wivenhoe-dam.geojson')).json();expect(streams.features.length).toBeGreaterThan(0);expect(streams.features.every(f=>!/unnamed|drain|gully|tributary/i.test(f.properties.name))).toBe(true);
 const bounds=await(await request.get('/dam-boundaries.json')).json();expect(Object.values(bounds.dams).filter(Boolean)).toHaveLength(46);
});
test('mismatched or unsafe BoM links are not presented as the selected station',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/links?*',r=>r.fulfill({json:{available:true,plotPath:'/fwo/IDQ65389/IDQ65389.999999.plt.shtml',historyPath:'javascript:alert(1)'}}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas')).toBeVisible();await expect(page.getByRole('link',{name:'Open BoM plot'})).toHaveCount(0);
});
test('waterway labels appear when zoomed in, deduplicate names and follow layer visibility',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#streamStatus')).toContainText('1 mapped');
 for(let i=0;i<4;i++){await page.locator('.leaflet-control-zoom-out').click();await page.waitForTimeout(300);}
 await expect(page.locator('.waterway-label')).toHaveCount(0);
 for(let i=0;i<5;i++){await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(300);}
 await expect(page.locator('.waterway-label')).toHaveCount(1);await expect(page.locator('.waterway-label')).toHaveText('Brisbane River');
 await page.locator('#streams').uncheck();await expect(page.locator('.waterway-label')).toHaveCount(0);await page.locator('#streams').check();await expect(page.locator('.waterway-label')).toHaveCount(1);
});
test('rainfall navigation rounds water time down to a measured quarter-hour',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,lastEnd:'2026-10-29T00:17:00Z'}}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas')).toBeVisible();const link=new URL(await page.locator('#gauges a').getAttribute('href'),'http://localhost');expect(link.searchParams.get('end')).toBe('2026-10-29T00:15:00.000Z');await expect(page.locator('#gauges')).not.toContainText(gauge.name);
});
