const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const basin='brisbane-bremer-pine-caboolture';
async function fixtures(page,path='/history'){
 const file=path==='/water-history'?'water-history':'map-context',source=fs.readFileSync(`tests/browser/${file}.spec.js`,'utf8');
 if(file==='water-history')await new Function('page',source.slice(source.indexOf('const basin='),source.indexOf("test('saved water"))+'return mock(page);')(page);
 else await new Function('page','fs',source.slice(source.indexOf('const basin='),source.indexOf("test('geographic"))+'return mockRain(page);')(page,fs);
 await page.route('**/map-context/index.json',r=>r.fulfill({json:{schemaVersion:2,entries:[]}}));
}
test('summary gauge link focuses once and opens non-modal details',async({page})=>{
 await fixtures(page);await page.goto('/history?basin='+basin+'&gauge=a');await expect(page.locator('#hyetograph')).toBeVisible();await expect(page.getByRole('dialog',{name:'Alpha gauge'})).toBeVisible();
 expect(await page.evaluate(()=>map.getZoom())).toBe(12);expect(await page.evaluate(()=>map.distance(map.getCenter(),[-27.5,153]))).toBeLessThan(10);
 await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();expect(await page.evaluate(()=>map.getZoom())).toBe(12);
});
for(const phone of [false,true])test(`gauge details retain map and page position (${phone?'phone':'desktop'})`,async({page})=>{
 if(phone)await page.setViewportSize({width:390,height:844});await fixtures(page);let reads=0;page.on('request',r=>{if(r.url().includes('/api/archive-rainfall/series?'))reads++;});
 await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await page.evaluate(()=>map.setView([-27.4,153.2],10,{animate:false}));
 const before=await page.evaluate(()=>({zoom:map.getZoom(),center:map.getCenter(),top:scrollY}));await (phone?page.locator('.leaflet-overlay-pane path.leaflet-interactive').first():page.locator('.station')).click();await expect(page.locator('#hyetograph')).toBeVisible();expect(await page.evaluate(()=>map.getZoom())).toBe(before.zoom);expect(await page.evaluate(()=>map.distance(map.getCenter(),[-27.4,153.2]))).toBeLessThan(10);
 await page.getByRole('button',{name:'Close details',exact:true}).click();await expect(page.locator('.gauge-detail-panel')).toBeHidden();await (phone?page.locator('.leaflet-overlay-pane path.leaflet-interactive').first():page.locator('.station')).click();await expect(page.locator('#hyetograph')).toBeVisible();expect(reads).toBe(1);await page.locator('#refresh').click();await expect.poll(()=>reads).toBe(2);await expect(page.locator('#detail')).toHaveAttribute('aria-busy','false');
 await expect(page.getByRole('link',{name:'Open in new tab',exact:true})).toHaveAttribute('href',/gauge=a/);await page.getByRole('button',{name:'Centre on gauge',exact:true}).click();expect(await page.evaluate(()=>map.getZoom())).toBe(12);
 await page.keyboard.press('Escape');await expect(page.locator('.gauge-detail-panel')).toBeHidden();
});
test('comparison views use identical map and legend frames and movement locks',async({page})=>{
 const boxes=[];for(const path of ['/history','/point-ifd','/water-history']){await fixtures(page,path);await page.goto(path+'?basin='+basin+'&view=keep&mapLat=-27.5&mapLng=153&mapZoom=10');await expect(page.locator('.station')).not.toHaveCount(0);boxes.push({map:await page.locator('#map').boundingBox(),rail:await page.locator('.map-legend-rail').boundingBox()});expect(await page.evaluate(()=>map.dragging.enabled()||map.scrollWheelZoom.enabled())).toBe(false);}
 for(const b of boxes){expect(b.rail.width).toBe(184);expect(Math.abs(b.map.width-boxes[0].map.width)).toBeLessThan(2);expect(Math.abs(b.map.height-boxes[0].map.height)).toBeLessThan(2);expect(Math.abs(b.map.y-boxes[0].map.y)).toBeLessThan(2);}
 await page.getByRole('button',{name:'Move map',exact:true}).click();expect(await page.evaluate(()=>map.dragging.enabled()&&map.scrollWheelZoom.enabled())).toBe(true);await page.getByRole('button',{name:'Lock map',exact:true}).click();expect(await page.evaluate(()=>map.dragging.enabled()||map.scrollWheelZoom.enabled())).toBe(false);
});

test('details can open in a new tab without recentering the saved map view',async({page,context})=>{
 await fixtures(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await page.evaluate(()=>map.setView([-27.4,153.2],10,{animate:false}));await page.locator('.station').click();await expect(page.locator('#hyetograph')).toBeVisible();const href=await page.getByRole('link',{name:'Open in new tab',exact:true}).getAttribute('href');
 const tab=await context.newPage();await fixtures(tab);await tab.goto(href);await expect(tab.locator('#hyetograph')).toBeVisible();await expect(tab.getByRole('dialog',{name:'Alpha gauge'})).toBeVisible();expect(await tab.evaluate(()=>map.getZoom())).toBe(10);expect(await tab.evaluate(()=>map.distance(map.getCenter(),[-27.4,153.2]))).toBeLessThan(100);await tab.close();
});

test('phone lite map leaves gauge search below the map without shortcut or layer buttons',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixtures(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await expect(page.locator('#fit')).toBeHidden();await expect(page.getByRole('link',{name:'Jump to station search and gauges'})).toBeHidden();await expect(page.locator('.map-context-control')).toBeHidden();
 const mapBox=await page.locator('#map').boundingBox(),listBox=await page.locator('.sidebar').boundingBox();expect(listBox.y).toBeGreaterThanOrEqual(mapBox.y+mapBox.height);await page.locator('#search').scrollIntoViewIfNeeded();await expect(page.locator('#search')).toBeInViewport();await expect(page.locator('.station')).toBeVisible();
});
