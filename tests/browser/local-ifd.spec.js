const {test,expect}=require('@playwright/test');
test('Goolman local reference requires explicit scenario and uses its own depths',async({page})=>{
 const arr=[];page.on('request',r=>{if(r.url().includes('data.arr-software.org'))arr.push(r.url());});
 await page.goto('/');await page.locator('#search').fill('Goolman');await page.locator('.station').click();
 await expect(page.locator('#ifdDataset')).toBeVisible();
 await expect(page.locator('#ifdDataset option')).toHaveCount(13);
 await expect(page.locator('#ifdDataset')).toHaveValue('');await expect(page.locator('#ifdChart')).toHaveCount(0);
 await page.locator('#ifdDataset').selectOption('BoM IFD Depths (2030 Baseline - SSP1)');
 await expect(page.locator('#ifdChart')).toBeVisible();
 const depth=()=>page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets.find(d=>d.label==='1% AEP reference').data.find(p=>p.x===180).y);
 expect(await depth()).toBe(138);
 await page.locator('#ifdDataset').selectOption('LIMB 2020 IFD Depths - High Resolution (2030 Baseline - SSP5)');
 expect(await depth()).toBe(145.1);
 await page.locator('#ifdMode').selectOption('wettest');expect(await depth()).toBe(145.1);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(arr).toEqual([]);
});
test('local file failure never silently substitutes Brisbane for a known local dataset',async({page})=>{
 await page.route('**/reference/local-ifd/*.json',r=>r.fulfill({status:503,json:{error:'Unavailable'}}));
 await page.goto('/');await page.locator('#search').fill('Goolman');await page.locator('.station').click();
 await expect(page.locator('#ifdComparison')).toContainText('No regional table has been substituted');
 await expect(page.locator('#ifdChart')).toHaveCount(0);await expect(page.locator('#hyetograph')).toBeVisible();
});
