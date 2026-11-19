const {test,expect}=require('@playwright/test'),fs=require('node:fs');
const basin='brisbane-bremer-pine-caboolture';
async function fixtures(page,path='/history'){
 const file=path==='/water-history'?'water-history':'map-context',source=fs.readFileSync(`tests/browser/${file}.spec.js`,'utf8');
 if(file==='water-history')await new Function('page',source.slice(source.indexOf('const basin='),source.indexOf("test('saved water"))+'return mock(page);')(page);
 else await new Function('page','fs',source.slice(source.indexOf('const basin='),source.indexOf("test('geographic"))+'return mockRain(page);')(page,fs);
 await page.route('**/map-context/index.json',r=>r.fulfill({json:{schemaVersion:2,entries:[]}}));
}
test('summary gauge link focuses once without opening details or fetching a series',async({page})=>{
 await fixtures(page);let reads=0;page.on('request',r=>{if(r.url().includes('/series?'))reads++;});await page.goto('/history?basin='+basin+'&gauge=a');await expect(page.locator('.station')).toHaveCount(1);await expect(page.locator('.gauge-detail-panel')).toBeHidden();expect(reads).toBe(0);
 expect(await page.evaluate(()=>map.getZoom())).toBe(12);expect(await page.evaluate(()=>map.distance(map.getCenter(),[-27.5,153]))).toBeLessThan(10);
 await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();expect(reads).toBe(0);expect(await page.evaluate(()=>map.getZoom())).toBe(12);await expect(page.locator('.station')).toHaveAttribute('href',/\/gauge\?/);
});

test('comparison views use identical frames with desktop gestures enabled',async({page})=>{
 const boxes=[];for(const path of ['/history','/point-ifd','/water-history']){await fixtures(page,path);await page.goto(path+'?basin='+basin+'&view=keep&mapLat=-27.5&mapLng=153&mapZoom=10');await expect(page.locator('.station')).not.toHaveCount(0);boxes.push({map:await page.locator('#map').boundingBox(),rail:await page.locator('.map-legend-rail').boundingBox()});expect(await page.evaluate(()=>map.dragging.enabled()&&map.scrollWheelZoom.enabled())).toBe(true);}
 for(const b of boxes){expect(b.rail.width).toBe(184);expect(Math.abs(b.map.width-boxes[0].map.width)).toBeLessThan(2);expect(Math.abs(b.map.height-boxes[0].map.height)).toBeLessThan(2);expect(Math.abs(b.map.y-boxes[0].map.y)).toBeLessThan(2);}
 await expect(page.getByRole('button',{name:'Move map',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Lock map',exact:true})).toHaveCount(0);
});


test('phone lite map leaves gauge search below the map without shortcut or layer buttons',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixtures(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await expect(page.locator('#fit')).toBeHidden();await expect(page.getByRole('link',{name:'Jump to station search and gauges'})).toBeHidden();await expect(page.locator('.map-context-control')).toBeHidden();
 const mapBox=await page.locator('#map').boundingBox(),listBox=await page.locator('.sidebar').boundingBox();expect(listBox.y).toBeGreaterThanOrEqual(mapBox.y+mapBox.height);await page.locator('#search').scrollIntoViewIfNeeded();await expect(page.locator('#search')).toBeInViewport();await expect(page.locator('.station')).toBeVisible();
});

for(const phone of [false,true])test(`expanded map keeps its legend (${phone?'phone':'desktop'})`,async({page})=>{
 if(phone)await page.setViewportSize({width:390,height:844});await fixtures(page);await page.goto('/history?basin='+basin);await expect(page.locator('.station')).toHaveCount(1);await page.getByRole('button',{name:'Expand map',exact:true}).click();await expect(page.locator('.map-expanded .map-legend')).toBeVisible();
 if(!phone){await expect(page.locator('.map-expanded .map-legend-rail')).toBeVisible();expect((await page.locator('.map-expanded .map-legend-rail').boundingBox()).width).toBe(184);}else{await page.locator('.map-legend>summary').click();await expect(page.locator('#legend')).toBeVisible();}
 if(!phone){await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-expanded .map-legend')).toBeVisible();}
 await page.getByRole('button',{name:'Exit full map',exact:true}).click();if(!phone)await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.map-frame .map-wrap')).toBeVisible();if(!phone)await expect(page.locator('.map-frame>.map-legend-rail')).toBeVisible();
});
