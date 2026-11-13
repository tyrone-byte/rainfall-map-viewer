const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function fixtures(page,path){
 if(path==='/water-history'){const s=fs.readFileSync('tests/browser/water-history.spec.js','utf8');await new Function('page',s.slice(s.indexOf('const basin='),s.indexOf("test('saved water"))+'return mock(page);')(page);}
 else if(path==='/dams'){const s=fs.readFileSync('tests/browser/dams.spec.js','utf8');await new Function('page',s.slice(s.indexOf('const end='),s.indexOf("test('dam facts"))+'return mock(page);')(page);}
 else{const s=fs.readFileSync('tests/browser/map-context.spec.js','utf8');await new Function('page','fs',s.slice(s.indexOf('const basin='),s.indexOf("test('geographic"))+'return mockRain(page);')(page,fs);}
 await page.route('**/map-context/index.json',r=>r.fulfill({json:{schemaVersion:2,entries:[{file:'test-overview.geojson',kind:'catchments',coarse:true,minimumZoom:5,maximumZoom:8,bounds:[137,-30,155,-10]}]}}));
 await page.route('**/map-context/test-overview.geojson',r=>r.fulfill({json:{type:'Feature',properties:{level:'catchments'},geometry:{type:'LineString',coordinates:[[138,-28],[145,-20],[150,-12]]}}}));
}
for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]){
 test(`entire map fits initial viewport at ${width} × ${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  for(const path of ['/history','/water-history','/point-ifd','/dams']){
   await fixtures(page,path);await page.goto(path);await expect(page.locator('#map')).toBeVisible();
   if(path!=='/dams')await expect(page.locator('#mapGroup option')).not.toHaveCount(1);else await expect(page.locator('#dam option')).toHaveCount(3);
   await expect.poll(()=>page.locator('#map').evaluate(el=>Math.round(el.getBoundingClientRect().bottom))).toBeLessThanOrEqual(height);
   const rect=await page.locator('#map').boundingBox();expect(rect.y).toBeLessThan(200);expect(rect.height).toBeGreaterThan(140);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(path!=='/dams')await expect.poll(()=>page.evaluate(()=>[...map.contextLayers.active.values()].some(a=>a.entry.coarse))).toBe(true);
  }
 });
}
test('map opens before group selection and selecting from the compact picker loads gauges',async({page})=>{
 const requests=[];await fixtures(page,'/history');page.on('request',r=>{if(r.url().includes('/api/archive-rainfall/frame'))requests.push(r.url());});await page.goto('/history');
 await expect(page.locator('#mapGroup option')).toHaveCount(2);expect(requests).toHaveLength(0);await expect(page.locator('#historyWorkspace')).toBeVisible();
 await page.locator('#mapGroup').selectOption('brisbane-bremer-pine-caboolture');await expect(page.locator('.station')).toHaveCount(1);await expect(page.locator('.map-group-selector')).toBeVisible();await expect(page.locator('#mapGroup')).toHaveValue('brisbane-bremer-pine-caboolture');
 await page.locator('.page-tabs [aria-current="page"]').click();await expect(page.locator('#mapGroup')).toBeVisible();await expect(page.locator('#map')).toBeVisible();await expect(page.locator('.station')).toHaveCount(0);
});

test('hybrid imagery and greyscale remain accessible in phone map settings',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixtures(page,'/history');await page.goto('/history');await expect(page.locator('#mapGroup option')).toHaveCount(2);
 await page.locator('.mobile-controls summary').click();await expect(page.locator('#background')).toBeVisible();
 await page.locator('#background').selectOption('hybrid');
 expect(await page.evaluate(()=>{const urls=[];map.eachLayer(l=>{if(l._url)urls.push(l._url);});return urls;})).toEqual([expect.stringContaining('World_Imagery'),expect.stringContaining('World_Boundaries_and_Places')]);
 await page.locator('#background').selectOption('grey');await expect(page.locator('.map-grey-tiles')).toHaveCount(1);
 await page.locator('.mobile-controls summary').click();await expect.poll(()=>page.locator('#map').evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(844);
});
