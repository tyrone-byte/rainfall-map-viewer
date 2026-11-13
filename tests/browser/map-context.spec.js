const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const basin='brisbane-bremer-pine-caboolture';
async function mockRain(page){
 const source=fs.readFileSync('tests/browser/point-ifd.spec.js','utf8'),helpers=source.slice(source.indexOf('const last='),source.indexOf("test('map defaults"));
 await new Function('page',helpers+'return mock(page);')(page);
 // The rainfall page uses totals/series, while the Point IFD page uses group-series.
 const end='2026-10-22T00:00:00Z',station={id:'a',name:'Alpha gauge',group:'Test',basinId:basin,stationNumber:'a',coordinates:{lat:-27.5,lon:153},depth:10,complete:true,validBlocks:96,expectedBlocks:96};
 await page.route('**/api/archive-rainfall/frame?*',r=>{const q=new URL(r.request().url()).searchParams;return r.fulfill({json:{available:true,end:q.get('end'),start:new Date(Date.parse(q.get('end'))-Number(q.get('minutes'))*60000).toISOString(),minutes:Number(q.get('minutes')),stations:[station]}});});
 await page.route('**/api/archive-rainfall/series?*',r=>r.fulfill({json:{available:true,end,periodMinutes:15,periods:Array.from({length:96},(_,i)=>({start:new Date(Date.parse(end)-(96-i)*900000).toISOString(),end:new Date(Date.parse(end)-(95-i)*900000).toISOString()})),stations:[{...station,values:Array(96).fill(1)}]}}));
}
async function context(page,{failure=false}={}){
 const calls=[];await page.route('**/map-context/**',r=>{
  const path=new URL(r.request().url()).pathname;calls.push(path);
  if(path.endsWith('index.json'))return r.fulfill({json:{schemaVersion:2,entries:[{file:'near-boundary.geojson',kind:'catchments',bounds:[152,-28,154,-27]},{file:'near-stream.geojson',kind:'streams',bounds:[152,-28,154,-27]},{file:'near-sub.geojson',kind:'subcatchments',minimumZoom:9,bounds:[152,-28,154,-27]},{file:'near-area.geojson',kind:'areas',level:'subcatchments',minimumZoom:9,bounds:[152,-28,154,-27]},{file:'far-boundary.geojson',kind:'catchments',bounds:[140,-20,141,-19]}]}});
  if(failure)return r.fulfill({status:503,json:{error:'Unavailable'}});
  return r.fulfill({json:path.includes('sub')?{type:'Feature',properties:{level:'subcatchments'},geometry:{type:'LineString',coordinates:[[153,-27.7],[153,-27.3]]}}:path.includes('stream')?{type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Test River'},geometry:{type:'LineString',coordinates:[[152.95,-27.5],[153,-27.5],[153.05,-27.5]]}}]}:{type:'Feature',properties:{title:'Test creek catchment',feature:'Subcatchment Area',waterplan:'Test plan'},geometry:path.includes('area')?{type:'Polygon',coordinates:[[[152.8,-27.7],[153.2,-27.7],[153.2,-27.3],[152.8,-27.3],[152.8,-27.7]]]}:{type:'LineString',coordinates:[[152.8,-27.7],[153.2,-27.7],[153.2,-27.3],[152.8,-27.3],[152.8,-27.7]]}}});
 });return calls;
}
test('geographic context follows viewport, zoom and toggles without covering gauges',async({page})=>{
 await mockRain(page);const calls=await context(page);await page.goto('/history?basin='+basin);await expect(page.locator('#count')).toContainText('1 gauges');
 await page.evaluate(()=>map.setView([-27.5,153],4,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(0);
 await page.waitForTimeout(200);const before=calls.length;await page.waitForTimeout(200);expect(calls.length).toBe(before);
 await page.evaluate(()=>map.setView([-27.5,153],10,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(1);
 await page.evaluate(()=>map.setZoom(11,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
 await page.evaluate(()=>map.setZoom(12,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
 expect(await page.evaluate(()=>[...map.contextLayers.active.values()].find(a=>a.entry.kind==='catchments').layer.getLayers()[0].options.dashArray)).toBeNull();
 expect(await page.evaluate(()=>[...map.contextLayers.active.values()].find(a=>a.entry.kind==='subcatchments').layer.getLayers()[0].options.dashArray)).toBe('6 5');
 expect(await page.evaluate(()=>[...map.contextLayers.active.values()].find(a=>a.entry.kind==='areas').layer.getLayers()[0].options.stroke)).toBe(false);
 expect(await page.evaluate(()=>[...map.contextLayers.active.values()].every(a=>a.layer.getLayers().every(l=>l.options.interactive===false&&!l.getTooltip())))).toBe(true);
 expect(await page.evaluate(()=>getComputedStyle(map.getPane('contextAreas')).pointerEvents)).toBe('none');
 expect(await page.evaluate(()=>[...map.contextLayers.active.values()].find(a=>a.entry.kind==='areas').layer.getLayers()[0].options.fillOpacity)).toBeGreaterThan(0);
 expect(calls.some(p=>p.includes('far-boundary'))).toBe(false);expect(await page.evaluate(()=>Number(map.getPane('contextStreams').style.zIndex))).toBeLessThan(400);
 await page.evaluate(()=>map.setZoom(13,{animate:false}));await expect(page.locator('.context-stream-label')).toHaveText('Test River');
 await page.locator('.map-context-control summary').click();await expect(page.locator('#contextAreaFills')).toHaveCount(0);await page.locator('#contextSubcatchments').uncheck();await page.locator('#contextStreams').uncheck();await expect(page.locator('.context-stream-label')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(1);
 await page.locator('#contextCatchments').uncheck();await expect(page.locator('#contextSubcatchments')).not.toBeChecked();await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(0);
 await page.locator('#contextSubcatchments').check();await expect(page.locator('#contextCatchments')).toBeChecked();await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(3);
 await expect(page.locator('.station')).toHaveCount(1);
});
test('context failures leave observations interactive and provide an explicit retry',async({page})=>{
 await mockRain(page);await context(page,{failure:true});await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);
 await page.evaluate(()=>map.setView([-27.5,153],12,{animate:false}));await page.locator('.map-context-control summary').click();await expect(page.getByRole('button',{name:'Retry context layers'})).toBeVisible();
 await page.locator('.station').click();await expect(page.locator('#hyetograph')).toBeVisible();
});
test('mobile map is prominent, controls/legend collapse, and expanded view exits accessibly',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mockRain(page);await context(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);
 await expect(page.locator('#changeBasin')).toHaveCount(0);await expect(page.locator('.mobile-controls')).not.toHaveAttribute('open','');await expect(page.locator('.map-legend')).not.toHaveAttribute('open','');
 const mapBox=await page.locator('#map').boundingBox();expect(mapBox.height).toBeGreaterThan(500);expect(mapBox.y).toBeLessThan(320);
 await page.locator('.mobile-controls summary').click();await expect(page.locator('#accumulation')).toBeVisible();await expect(page.locator('#background')).toBeVisible();await page.locator('#background').selectOption('grey');await page.locator('.mobile-controls summary').click();
 await page.getByRole('button',{name:'Expand map',exact:true}).click();await expect(page.getByRole('dialog',{name:'Expanded gauge map'})).toBeVisible();await expect(page.locator('.expanded-map-caption')).toContainText('24 hours');expect((await page.locator('#map').boundingBox()).height).toBeGreaterThan(800);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Expand map',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.locator('.page-tabs [aria-current="page"]').click();await expect(page.locator('#groupPicker')).toBeVisible();await expect(page.locator('.station')).toHaveCount(0);
});
test('mouse wheel zooms over passive context while gauge clicks still open plots',async({page})=>{
 await mockRain(page);await context(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);
 await page.evaluate(()=>map.setView([-27.5,153],12,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
 const box=await page.locator('#map').boundingBox(),point=await page.evaluate(()=>{const p=map.latLngToContainerPoint([-27.51,153.01]);return {x:p.x,y:p.y};});
 await page.mouse.move(box.x+point.x,box.y+point.y);await page.mouse.click(box.x+point.x,box.y+point.y);
 expect(await page.evaluate(()=>selected)).toBeNull();await expect(page.locator('.leaflet-tooltip')).toHaveCount(0);
 await page.mouse.wheel(0,-120);await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBeGreaterThan(12);
 await page.locator('.leaflet-overlay-pane path.leaflet-interactive').first().click();await expect(page.locator('#hyetograph')).toBeVisible();
});

test('half a neighbouring group hides linked details, and zooming back restores them',async({page})=>{
 await mockRain(page);await context(page);
 const other='gold-coast-logan';
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:[{id:basin,label:'Brisbane group'},{id:other,label:'Gold Coast group'}]}}));
 await page.route('**/gauge-group-overview.json',r=>r.fulfill({json:{schemaVersion:1,rain:[{id:basin,anchor:[-27.5,153],locations:[[-27.5,153]],bounds:[152.9,-27.6,153.1,-27.4],footprint:[[152.9,-27.6],[153.1,-27.6],[153.1,-27.4],[152.9,-27.4]]},{id:other,anchor:[-27.5,153.05],locations:[[-27.5,153.05],[-27.5,153.20],[-27.5,155],[-27.5,156]],bounds:[153,-27.6,156,-27.4],footprint:[[153,-27.6],[156,-27.6],[156,-27.4],[153,-27.4]]}]}}));
 await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);
 await page.evaluate(()=>map.setView([-27.5,153],12,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.groupOverview.broadView)).toBe(false);await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
 await page.locator('.map-context-control summary').click();await page.locator('#contextSubcatchments').uncheck();await expect.poll(()=>page.evaluate(()=>[...map.contextLayers.active.values()].filter(a=>a.entry.kind==='subcatchments'||a.entry.level==='subcatchments').length)).toBe(0);await page.locator('#contextSubcatchments').check();await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
 await page.evaluate(()=>map.setZoom(11,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.groupOverview.broadView)).toBe(true);await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(1);await expect(page.locator('#contextSubcatchments')).toBeChecked();await expect(page.locator('#contextStreams')).toBeChecked();
 await page.evaluate(()=>map.setZoom(12,{animate:false}));await expect.poll(()=>page.evaluate(()=>map.groupOverview.broadView)).toBe(false);await expect.poll(()=>page.evaluate(()=>map.contextLayers.active.size)).toBe(4);
});
