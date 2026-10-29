const {test,expect}=require('@playwright/test');
const end='2026-10-29T00:00:00Z',coords={lat:-27.4,lon:152.6},basinId='brisbane-bremer-pine-caboolture';
const gauge={id:'540177',name:'Water at dam TW',basinId,coordinates:coords,level:2.5,datum:'LGH',direction:'rising'};
async function mock(page){
 const dam={id:'wivenhoe',name:'Wivenhoe Dam',owner:'Seqwater',lat:-27.39306,lon:152.60417,catchmentAreaHa:702000,surfaceAreaFSL:10750,surfaceAreaUnit:'ha',fullSupplyVolume:1165238,fullSupplyVolumeUnit:'ML',catchmentBoundary:null,nearestRainGauge:{id:'rain-a',name:'Nearest rainfall station',basinId,distanceKm:1.25},nearestWaterGauge:{id:gauge.id,basinId,name:gauge.name,distanceKm:.8}};
 await page.route('**/dams-catalogue.json',r=>r.fulfill({json:{dams:[dam,{...dam,id:'other',name:'Other Dam',owner:'Sunwater'}],rain:[{id:'rain-a',name:'Nearest rainfall station',basinId,coordinates:coords}],water:[gauge,{...gauge,id:'inside-water',name:'Other water inside area',coordinates:{lat:-27.42,lon:152.62}}]}}));
 await page.route('**/dam-boundaries.json',r=>r.fulfill({json:{dams:{wivenhoe:{id:'test-boundary',title:'Central Brisbane River',waterplan:'Moreton',gauges:{rain:['rain-a'],water:['540177','inside-water']}},other:null}}}));
 await page.route('**/dam-boundaries/test-boundary.geojson',r=>r.fulfill({json:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[152.5,-27.5],[152.7,-27.5],[152.7,-27.3],[152.5,-27.3],[152.5,-27.5]]]}}}));
 await page.route('**/dam-watercourses/*.geojson',r=>r.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Brisbane River'},geometry:{type:'LineString',coordinates:[[152.55,-27.45],[152.65,-27.35]]}}]}}));
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-28T00:00:00Z',lastEnd:end}}));
 await page.route('**/api/archive-rainfall/frame?*',r=>r.fulfill({json:{available:true,stations:[{id:'rain-a',name:'Nearest rainfall station',basinId,coordinates:coords,depth:12.5},{id:'outside-rain',name:'Outside rain',basinId,coordinates:coords,depth:100}]}}));
 await page.route('**/api/archive-rainfall/series?*',r=>{const u=new URL(r.request().url()),last=u.searchParams.get('end'),count=Math.max(96,Number(u.searchParams.get('minutes'))/15),base=Date.parse(last),periods=Array.from({length:count},(_,i)=>({start:new Date(base-(count-i)*900000).toISOString(),end:new Date(base-(count-i-1)*900000).toISOString()}));return r.fulfill({json:{available:true,end:last,periodMinutes:15,periods,stations:[{values:Array.from({length:count},(_,i)=>i===count-1?12.5:0)}]}});});
 await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,lastEnd:end}}));
 await page.route('**/api/archive-water/frame?*',r=>r.fulfill({json:{available:true,stations:[gauge,{...gauge,id:'other-gauge',name:'Unrelated gauge'},{...gauge,id:'inside-water',name:'Other water inside area',coordinates:{lat:-27.42,lon:152.62}}]}}));
 await page.route('**/api/archive-water/series?*',r=>r.fulfill({json:{available:true,start:'2026-10-28T00:00:00Z',end,observations:[{time:'2026-10-28T23:00:00Z',level:2.4,datum:'LGH'},{time:end,level:2.5,datum:'LGH'}]}}));
 await page.route('**/api/archive-water/links?*',r=>r.fulfill({json:{available:true,plotPath:'/fwo/IDQ65389/IDQ65389.540177.plt.shtml',historyPath:'/fwo/IDQ65389/IDQ65389.540177.tbl.shtml'}}));
}
test('dam facts, default water hydrograph, closest rain card, BoM plot and named streams',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mock(page);let rainQueries=0;page.on('request',r=>{if(r.url().includes('/api/archive-rainfall/'))rainQueries++;});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');
 await expect(page.locator('#damInfo')).toContainText('Seqwater');for(const label of ['Assumed surface area at full supply','Assumed full supply volume','Assumed catchment area'])await expect(page.locator('#damInfo')).toContainText(label);await expect(page.locator('#damInfo')).not.toContainText('Supplied');await expect(page.locator('#damInfo')).toContainText('10,750 ha');await expect(page.locator('#damInfo')).toContainText('1,165,238 ML');await expect(page.locator('#damInfo')).toContainText('Central Brisbane River');await expect(page.locator('#damInfo')).toContainText('Moreton');
 await expect(page.locator('#gaugeNote')).toContainText('0.80 km');await expect(page.locator('#gaugeNote')).toContainText('not verified');
 await expect(page.locator('#plot canvas').first()).toBeVisible();await expect(page.locator('#gauges')).toContainText('Nearest rainfall station');await expect(page.locator('#gauges')).toContainText('1.25 km');await expect(page.locator('#gauges a')).toHaveAttribute('href',/history\?basin=.*gauge=rain-a/);await expect(page.locator('#gauges')).not.toContainText('Unrelated gauge');await expect(page.locator('.dam-square')).toHaveCount(2);await expect(page.getByRole('link',{name:'Open BoM plot'})).toHaveAttribute('href','https://reg.bom.gov.au/fwo/IDQ65389/IDQ65389.540177.plt.shtml');
 await expect(page.locator('#streamStatus')).toContainText('1 mapped');await page.locator('#streams').uncheck();await page.locator('#streams').check();expect(rainQueries).toBeGreaterThan(0);expect(errors).toEqual([]);
});
test('nearest gauge remains available without a matching boundary',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('other');await expect(page.locator('#boundaryNote')).toContainText('No containing water-plan');await expect(page.locator('#plot canvas').first()).toBeVisible();await expect(page.locator('#gauges')).toContainText('Nearest rainfall station');await expect(page.locator('#gauges')).toContainText('1.25 km');await expect(page.locator('#gauges a')).toHaveAttribute('href',/history\?basin=.*gauge=rain-a/);
});
test('observation failure preserves dam facts and geographic context',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/frame?*',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('Some observations could not be loaded');await expect(page.locator('#damInfo')).toContainText('1,165,238 ML');await expect(page.locator('#streamStatus')).toContainText('1 mapped');await expect(page.locator('#map')).toBeVisible();
});
test('phone order and desktop scrolling keep chart and gauge accessible',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();await page.locator('#map').scrollIntoViewIfNeeded();const box=await page.locator('#map').boundingBox(),before=await page.evaluate(()=>scrollY);await page.mouse.move(box.x+box.width/2,Math.max(10,Math.min(box.y+box.height/2,900)));await page.mouse.wheel(0,700);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);await page.locator('footer').scrollIntoViewIfNeeded();await expect(page.locator('footer')).toBeInViewport();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const positions=await page.evaluate(()=>['.dam-controls','#map','#plot','#gaugeList'].map(s=>document.querySelector(s).getBoundingClientRect().top));expect(positions).toEqual([...positions].sort((a,b)=>a-b));
});
test('time controls preserve the default water gauge',async({page})=>{
 await mock(page);const requests=[];page.on('request',r=>{if(r.url().includes('/series?'))requests.push(new URL(r.url()));});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();await page.locator('#duration').selectOption('180');await expect(page.locator('#status')).toContainText('3 hours');await page.locator('#previous').click();await expect(page.locator('#ending')).toHaveValue('2026-10-29T07:00');await expect(page.locator('#plot canvas').first()).toBeVisible();const latest=requests.at(-1);expect(latest.searchParams.get('gauge')).toBe('540177');expect(latest.searchParams.get('end')).toBe('2026-10-28T21:00:00.000Z');expect(latest.searchParams.get('minutes')).toBe('180');
});
test('missing watercourses and boundary index do not prevent gauge loading',async({page})=>{
 await mock(page);await page.route('**/dam-boundaries.json',r=>r.fulfill({status:503,body:'unavailable'}));await page.route('**/dam-watercourses/*.geojson',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();await expect(page.locator('#boundaryNote')).toContainText('could not be loaded');await expect(page.locator('#streamStatus')).toContainText('could not be loaded');
});
test('shipped dam facts and nearest gauges are complete; stream selection omits unnamed drainage',async({request})=>{
 const data=await(await request.get('/dams-catalogue.json')).json();expect(data.dams).toHaveLength(49);for(const dam of data.dams){expect(dam.nearestWaterGauge.distanceKm).toBeGreaterThanOrEqual(0);expect(data.water.some(g=>g.id===dam.nearestWaterGauge.id)).toBe(true);expect(dam.surfaceAreaUnit).toBe('ha');expect(dam.fullSupplyVolumeUnit).toBe('ML');expect(dam.nearestRainGauge.distanceKm).toBeGreaterThanOrEqual(0);expect(data.rain.some(g=>g.id===dam.nearestRainGauge.id)).toBe(true);}
 const dam=data.dams.find(d=>d.name==='Wivenhoe Dam');expect(dam.surfaceAreaFSL).toBe(10750);expect(dam.fullSupplyVolume).toBe(1165238);expect(dam.nearestWaterGauge.id).toBe('540177');
 const streams=await(await request.get('/dam-watercourses/wivenhoe-dam.geojson')).json();expect(streams.features.length).toBeGreaterThan(0);expect(streams.features.every(f=>!/unnamed|drain|gully|tributary/i.test(f.properties.name))).toBe(true);
 const bounds=await(await request.get('/dam-boundaries.json')).json();expect(Object.values(bounds.dams).filter(Boolean)).toHaveLength(46);
});
test('mismatched or unsafe BoM links are not presented as the selected station',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/links?*',r=>r.fulfill({json:{available:true,plotPath:'/fwo/IDQ65389/IDQ65389.999999.plt.shtml',historyPath:'javascript:alert(1)'}}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();await expect(page.getByRole('link',{name:'Open BoM plot'})).toHaveCount(0);
});
test('waterway labels appear when zoomed in, deduplicate names and follow layer visibility',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#streamStatus')).toContainText('1 mapped');
 for(let i=0;i<4;i++){await page.locator('.leaflet-control-zoom-out').click();await page.waitForTimeout(300);}
 await expect(page.locator('.waterway-label')).toHaveCount(0);
 for(let i=0;i<5;i++){await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(300);}
 await expect(page.locator('.waterway-label')).toHaveCount(0);await expect(page.locator('.dam-name-label').first()).toBeVisible();await expect(page.locator('.dam-name-label').first()).toHaveCSS('color','rgb(74, 74, 74)');
 for(let i=0;i<2;i++){await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(300);}
 await expect(page.locator('.waterway-label')).toHaveCount(1);await expect(page.locator('.waterway-label')).toHaveText('Brisbane River');await expect(page.locator('.waterway-label')).toHaveCSS('color','rgb(36, 92, 131)');expect(await page.locator('.waterway-label').evaluate(n=>getComputedStyle(n).transform)).not.toBe('none');
 await page.locator('#streams').uncheck();await expect(page.locator('.waterway-label')).toHaveCount(0);await page.locator('#streams').check();await expect(page.locator('.waterway-label')).toHaveCount(1);
});
test('rainfall navigation rounds water time down to a measured quarter-hour',async({page})=>{
 await mock(page);await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,lastEnd:'2026-10-29T00:17:00Z'}}));await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();const link=new URL(await page.locator('#gauges a').getAttribute('href'),'http://localhost');expect(link.searchParams.get('end')).toBe('2026-10-29T00:15:00.000Z');await expect(page.locator('#gauges')).not.toContainText(gauge.name);
});
test('area gauges are clickable map points without a gauge list; selected rain persists across time changes',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot h2').first()).toHaveText('Water at dam TW');await expect(page.locator('#plot canvas').first()).toBeVisible();
 await expect(page.locator('[data-gauge="rain:rain-a"]')).toHaveCount(1);await expect(page.locator('[data-gauge="water:inside-water"]')).toHaveCount(1);await expect(page.locator('[data-gauge="rain:outside-rain"]')).toHaveCount(0);await expect(page.locator('[data-gauge="water:other-gauge"]')).toHaveCount(0);
 await page.locator('#showWater').uncheck();await page.locator('[data-gauge="rain:rain-a"]').click({force:true});await expect(page.locator('#plot h2').first()).toHaveText('Nearest rainfall station');await expect(page.locator('#plot canvas').first()).toHaveAttribute('aria-label',/saved rainfall/);
 await page.locator('#duration').selectOption('180');await expect(page.locator('#plot canvas').first()).toBeVisible();await expect(page.locator('#plot h2').first()).toHaveText('Nearest rainfall station');
 await page.locator('#showWater').check();await page.locator('[data-gauge="water:inside-water"]').click({force:true});await expect(page.locator('#plot h2').first()).toHaveText('Other water inside area');await expect(page.locator('#plot canvas').first()).toHaveAttribute('aria-label',/saved water levels/);
 await expect(page.locator('#gauges')).not.toContainText('Other water inside area');await expect(page.locator('#gauges')).not.toContainText('TW');await expect(page.locator('#gauges button')).toHaveCount(0);
});
test('zoom buttons and off-centre double click stay centred on the selected dam',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();
 const view=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('rainfall-atlas.map-view.v1')));
 const centered=async()=>{const saved=await view();expect(saved.lat).toBeCloseTo(-27.39306,5);expect(saved.lng).toBeCloseTo(152.60417,5);};
 await centered();await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(300);await centered();await page.locator('.leaflet-control-zoom-out').click();await page.waitForTimeout(300);await centered();
 await page.locator('#map').scrollIntoViewIfNeeded();const box=await page.locator('#map').boundingBox();await page.mouse.dblclick(box.x+box.width*.7,box.y+box.height*.35);await page.waitForTimeout(300);await centered();
 // Deliberate panning remains available, but the next zoom returns to the dam.
 await page.mouse.move(box.x+box.width*.65,box.y+box.height*.7);await page.mouse.down();await page.mouse.move(box.x+box.width*.65+80,box.y+box.height*.7+40,{steps:10});await page.mouse.up();await page.waitForTimeout(300);
 await page.locator('.leaflet-control-zoom-in').click();await page.waitForTimeout(300);await centered();
});
test('Somerset adjustment is traceable and selects the Stanley River context',async({request})=>{
 const data=await(await request.get('/dams-catalogue.json')).json(),dam=data.dams.find(d=>d.id==='somerset-dam');
 expect(dam.originalCoordinates).toEqual({lat:-27.11556,lon:152.55667});expect(dam.locationAdjustment.distanceMetres).toBeLessThan(35);expect(dam.nearestWaterGauge.id).toBe('040820');
 const boundaries=await(await request.get('/dam-boundaries.json')).json();expect(boundaries.dams['somerset-dam'].title).toBe('Stanley River');expect(boundaries.dams['wivenhoe-dam'].title).toBe('Central Brisbane River');
 const streams=await(await request.get('/dam-watercourses/somerset-dam.geojson')).json();expect(streams.features.some(f=>f.properties.name==='Stanley River')).toBe(true);
});
test.describe('dam phone zoom',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 test('off-centre touch pinch finishes centred on the dam',async({page})=>{
  await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#plot canvas').first()).toBeVisible();await page.locator('#map').scrollIntoViewIfNeeded();
  const view=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('rainfall-atlas.map-view.v1'))),before=await view(),box=await page.locator('#map').boundingBox(),x=box.x+box.width*.65,y=box.y+box.height*.45;
  const client=await page.context().newCDPSession(page);await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
  for(const spread of [35,45,55]){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-spread,y,id:1},{x:x+spread,y,id:2}]});await page.waitForTimeout(30);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>(await view()).zoom).toBeGreaterThan(before.zoom);await page.waitForTimeout(300);
  const after=await view();expect(after.lat).toBeCloseTo(-27.39306,5);expect(after.lng).toBeCloseTo(152.60417,5);
 });
});
