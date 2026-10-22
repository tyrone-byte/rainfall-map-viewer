const {test,expect}=require('@playwright/test');
async function ready(page){await expect(page.locator('#count')).toContainText('gauges ·');}
async function view(page){return page.evaluate(()=>({lat:map.getCenter().lat,lng:map.getCenter().lng,zoom:map.getZoom()}));}
function same(actual,expected){expect(actual.zoom).toBe(expected.zoom);expect(actual.lat).toBeCloseTo(expected.lat,5);expect(actual.lng).toBeCloseTo(expected.lng,5);}
test('pan and zoom survive both page switches, reload and data refresh; fit stays available',async({page})=>{
 await page.goto('/');await ready(page);
 await page.evaluate(()=>map.setView([-27.15,152.95],12,{animate:false}));const rainfall=await view(page);
 await page.getByRole('link',{name:'Water levels',exact:true}).click();await ready(page);same(await view(page),rainfall);
 await page.reload();await ready(page);same(await view(page),rainfall);
 await page.evaluate(()=>map.setView([-27.43,153.05],11,{animate:false}));const water=await view(page);
 await page.getByRole('link',{name:'Rainfall',exact:true}).click();await ready(page);same(await view(page),water);
 // The five-minute refresh follows load(false); it must not move the map.
 await page.evaluate(()=>load(false));same(await view(page),water);
 await page.locator('#fit').click();await expect.poll(async()=>(await view(page)).zoom).toBeLessThan(water.zoom);
 const fitted=await view(page);
 await page.getByRole('link',{name:'Water levels',exact:true}).click();await ready(page);same(await view(page),fitted);
 await page.evaluate(()=>load(false));same(await view(page),fitted);
});
test('invalid saved state and blocked browser storage do not break map startup',async({page})=>{
 await page.addInitScript(()=>{try{sessionStorage.setItem('rainfall-atlas.map-view.v1','{"lat":"bad","lng":153,"zoom":999}');}catch(_){}});
 await page.goto('/water');await ready(page);expect((await view(page)).zoom).toBeLessThanOrEqual(12);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new Error('Storage blocked');};Storage.prototype.setItem=()=>{throw new Error('Storage blocked');};});
 await page.goto('/');await ready(page);await page.getByRole('link',{name:'Water levels',exact:true}).click();await ready(page);
 expect(errors).toEqual([]);
 expect(await page.locator('.leaflet-interactive').count()).toBeGreaterThan(0);
 expect((await view(page)).zoom).toBeLessThanOrEqual(12);
});
