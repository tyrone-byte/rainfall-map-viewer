const {test,expect}=require('@playwright/test');
const basin='brisbane-bremer-pine-caboolture',end='2026-10-26T02:00:00+00:00';
async function mock(page){
 const requests=[];
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:[{id:basin,label:'Brisbane basin',gaugeCount:2}]}}));
 await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-25T00:00:00+00:00',lastEnd:end,source:{status:'ok',checked_at:end}}}));
 await page.route('**/api/archive-water/frame?*',r=>{
  const q=new URL(r.request().url()).searchParams,minutes=Number(q.get('minutes')),ending=q.get('end');requests.push({minutes,end:ending});
  return r.fulfill({json:{available:true,end:ending,start:new Date(Date.parse(ending)-minutes*60000).toISOString(),minutes,stations:[{id:'540111',name:'Test river',group:'Brisbane',basinId:basin,coordinates:{lat:-27.4,lon:153},level:0,datum:'AHD',observedAt:ending,ageMinutes:0,status:'current'},{id:'540112',name:'No readings',group:'Brisbane',basinId:basin,coordinates:null,level:null,datum:'Unspecified',observedAt:null,ageMinutes:null,status:'missing'}]}});
 });
 await page.route('**/api/archive-water/series?*',r=>{
  const q=new URL(r.request().url()).searchParams,minutes=Number(q.get('minutes')),ending=q.get('end'),start=new Date(Date.parse(ending)-minutes*60000).toISOString();
  return r.fulfill({json:{available:true,end:ending,start,minutes,observations:[{time:start,level:-.2,datum:'AHD'},{time:ending,level:0,datum:'AHD'}]}});
 });return requests;
}
test('saved water levels require a basin and duration bounds map, graph and time steps',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=await mock(page);
 await page.goto('/water-history');await expect(page.locator('.basin-choice')).toHaveCount(1);expect(requests).toHaveLength(0);
 await page.locator('.basin-choice').click();await expect(page.locator('#count')).toContainText('2 gauges');
 await expect(page.locator('#accumulation')).toHaveValue('1440');await expect(page.locator('.station').filter({hasText:'Test river'})).toContainText('0.00 m');
 await page.locator('.station').filter({hasText:'Test river'}).click();await expect(page.locator('#waterHistoryChart')).toBeVisible();
 await page.screenshot({path:'.cache/screenshots/water-history-preview.png',fullPage:true});
 await page.locator('#accumulation').selectOption('180');await expect(page.locator('#period')).toContainText('3 hours');
 await expect.poll(()=>page.locator('#waterHistoryChart').evaluate(c=>{const chart=Chart.getChart(c);return chart?chart.options.scales.x.max-chart.options.scales.x.min:null;})).toBe(3*3600000);
 await page.locator('#previous').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(end)-3*3600000);
 await page.locator('#latest').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(end));
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 await page.locator('#changeBasin').click();await expect(page.locator('#groupPicker')).toBeVisible();expect(await page.evaluate(()=>markers.size)).toBe(0);expect(errors).toEqual([]);
});
test('failed series cannot leave another gauge hydrograph labelled as the selected gauge',async({page})=>{
 await mock(page);await page.goto('/water-history?basin='+basin);await expect(page.locator('#count')).toContainText('2 gauges');
 await page.locator('.station').filter({hasText:'Test river'}).click();await expect(page.locator('#waterHistoryChart')).toBeVisible();
 await page.route('**/api/archive-water/series?*',r=>r.fulfill({status:503,json:{available:false}}));
 await page.locator('.station').filter({hasText:'No readings'}).click();await expect(page.locator('#detail')).toContainText('Could not load');await expect(page.locator('#waterHistoryChart')).toHaveCount(0);
});
