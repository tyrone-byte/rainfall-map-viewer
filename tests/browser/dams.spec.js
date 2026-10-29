const {test,expect}=require('@playwright/test');
const end='2026-10-29T00:00:00Z',coords={lat:-27.4,lon:152.6},basinId='brisbane-bremer-pine-caboolture';
async function mock(page){
 const gauge={id:'r1',name:'Catchment rain',basinId,coordinates:coords};
 await page.route('**/dams-catalogue.json',r=>r.fulfill({json:{dams:[{id:'wivenhoe',name:'Wivenhoe Dam',owner:'Seqwater',lat:-27.39306,lon:152.60417,catchmentAreaHa:702000,catchmentBoundary:null},{id:'other',name:'Other Dam',owner:'Sunwater',lat:-20,lon:148,catchmentAreaHa:100}],rain:[gauge],water:[{...gauge,id:'w1',name:'Nearby river'}]}}));
 await page.route('**/dam-boundaries.json',r=>r.fulfill({json:{dams:{wivenhoe:{id:'test-boundary',title:'Central Brisbane River',waterplan:'Moreton',gauges:{rain:['r1'],water:['w1']}},other:null}}}));
 await page.route('**/dam-boundaries/test-boundary.geojson',r=>r.fulfill({json:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[152.5,-27.5],[152.7,-27.5],[152.7,-27.3],[152.5,-27.3],[152.5,-27.5]]]}}}));
 await page.route('**/api/archive-*/extent',r=>r.fulfill({json:{available:true,lastEnd:end}}));
 await page.route('**/api/archive-*/frame?*',r=>{const water=r.request().url().includes('archive-water');return r.fulfill({json:{available:true,stations:[water?{...gauge,id:'w1',name:'Nearby river',level:2.5,datum:'LGH',direction:'rising'}:{...gauge,depth:15,complete:true},{...gauge,id:'outside',name:'Outside planning boundary',depth:100,complete:true}]}});});
 await page.route('**/api/archive-*/series?*',r=>{const water=r.request().url().includes('archive-water');return r.fulfill({json:water?{available:true,observations:[{time:'2026-10-28T23:00:00Z',level:2.4,datum:'LGH'},{time:end,level:2.5,datum:'LGH'}]}:{available:true,periods:[{end}],stations:[{values:[15]}]}});});
}
test('dam owner, combined observations, independent layers and measured plots',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mock(page);await page.goto('/dams');
 await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('1 rainfall · 1 water');
 await expect(page.locator('#damInfo')).toContainText('Owner: Seqwater');await expect(page.locator('#damInfo')).toContainText('7,020 km²');
 await expect(page.locator('#boundaryNote')).toContainText('Central Brisbane River');
 await page.getByRole('button',{name:/Rain · Catchment rain/}).click();await expect(page.locator('#plot canvas')).toBeVisible();
 await expect(page.locator('#plot a')).toHaveAttribute('href',/history\?basin=.*gauge=r1/);
 await page.locator('#rain').uncheck();await expect(page.locator('#gauges button')).toHaveCount(1);
 await page.getByRole('button',{name:/Water · Nearby river/}).click();await expect(page.locator('#plot canvas')).toBeVisible();await expect(page.locator('#plot')).toContainText('LGH');
 await page.locator('#owner').selectOption('Sunwater');await expect(page.locator('#dam option')).toHaveCount(2);await expect(page.locator('#gauges button')).toHaveCount(0);expect(errors).toEqual([]);
});
test('observation failures preserve dam map and show an honest status',async({page})=>{
 await mock(page);await page.route('**/api/archive-*/frame?*',r=>r.fulfill({status:503,body:'unavailable'}));await page.goto('/dams/');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('Some observation groups could not be loaded');await expect(page.locator('#map')).toBeVisible();await expect(page.locator('#gauges')).toContainText('No matching');
});
test('phone layout puts controls, map, plot then gauges without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('1 rainfall');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const positions=await page.evaluate(()=>['.dam-controls','#map','#plot','#gaugeList'].map(s=>document.querySelector(s).getBoundingClientRect().top));expect(positions).toEqual([...positions].sort((a,b)=>a-b));
 await page.getByRole('button',{name:/Water · Nearby river/}).click();await expect(page.locator('#plot canvas')).toBeVisible();
});
test('time controls request both layers at the same AEST ending and duration',async({page})=>{
 await mock(page);const requests=[];page.on('request',r=>{if(r.url().includes('/frame?'))requests.push(new URL(r.url()));});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('1 rainfall');await page.locator('#duration').selectOption('180');await expect(page.locator('#status')).toContainText('3 hours');
 await page.locator('#previous').click();await expect(page.locator('#ending')).toHaveValue('2026-10-29T07:00');await expect(page.locator('#status')).toContainText('1 rainfall');
 const last=requests.slice(-2);expect(last).toHaveLength(2);expect(last.every(u=>u.searchParams.get('minutes')==='180'&&u.searchParams.get('end')==='2026-10-28T21:00:00.000Z')).toBe(true);
});
test('shipped catalogue retains owners, hectares and source coordinates without invented boundaries',async({request})=>{
 const response=await request.get('/dams-catalogue.json');expect(response.ok()).toBe(true);const d=await response.json();expect(d.dams).toHaveLength(49);expect(d.dams.filter(x=>x.owner==='Seqwater')).toHaveLength(25);expect(d.dams.filter(x=>x.owner==='Sunwater')).toHaveLength(24);expect(d.dams.every(x=>x.catchmentBoundary===null&&Number.isFinite(x.lat)&&Number.isFinite(x.lon))).toBe(true);expect(d.dams.find(x=>x.name==='Wivenhoe Dam').catchmentAreaHa).toBe(702000);
});
test('desktop wheel scrolling over the dam map reaches the gauge list and footer',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('1 rainfall');
 await expect(page.locator('.dam-square')).toHaveCount(1);await expect(page.locator('.dam-square')).toHaveCSS('transform','none');
 await page.locator('#map').scrollIntoViewIfNeeded();const box=await page.locator('#map').boundingBox();const before=await page.evaluate(()=>scrollY);
 await page.mouse.move(box.x+box.width/2,Math.max(10,Math.min(box.y+box.height/2,900)));await page.mouse.wheel(0,700);
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);
 await page.locator('#gaugeList').scrollIntoViewIfNeeded();await expect(page.locator('#gauges button').first()).toBeInViewport();
 await page.locator('footer').scrollIntoViewIfNeeded();await expect(page.locator('footer')).toBeInViewport();
});
test('water-plan membership excludes outside gauges and unmatched dams do not load observations',async({page})=>{
 await mock(page);await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#status')).toContainText('1 rainfall · 1 water');await expect(page.locator('#gauges')).not.toContainText('Outside planning boundary');await expect(page.locator('#map path.leaflet-interactive')).toHaveCount(1);
 await page.locator('#dam').selectOption('other');await expect(page.locator('#boundaryNote')).toContainText('No containing water-plan boundary');await expect(page.locator('#gauges button')).toHaveCount(0);await expect(page.locator('#apply')).toBeDisabled();
});
test('supplied boundaries map 46 dams while keeping true dam catchments unassigned',async({request})=>{
 const index=await (await request.get('/dam-boundaries.json')).json();expect(index.sourceFeatures).toBe(187);expect(Object.values(index.dams).filter(Boolean)).toHaveLength(46);expect(index.dams['burdekin-falls-dam']).toBeNull();expect(index.dams['ej-beardmore-dam']).toBeNull();expect(index.dams['leslie-dam']).toBeNull();expect(index.dams['wivenhoe-dam'].title).toBe('Central Brisbane River');expect(index.dams['julius-dam'].feature).toBe('Subcatchment Area');
 const feature=await (await request.get(`/dam-boundaries/${index.dams['wivenhoe-dam'].id}.geojson`)).json();expect(['Polygon','MultiPolygon']).toContain(feature.geometry.type);
});
test('missing boundary index keeps dams available without reverting to radius gauges',async({page})=>{
 await mock(page);await page.route('**/dam-boundaries.json',r=>r.fulfill({status:503,body:'unavailable'}));let frames=0;page.on('request',r=>{if(r.url().includes('/frame?'))frames++;});await page.goto('/dams');await page.locator('#dam').selectOption('wivenhoe');await expect(page.locator('#damName')).toHaveText('Wivenhoe Dam');await expect(page.locator('#boundaryNote')).toContainText('boundaries could not be loaded');await expect(page.locator('#gauges button')).toHaveCount(0);expect(frames).toBe(0);
});
