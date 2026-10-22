const {test,expect}=require('@playwright/test');
test('live water page maps official stations and opens a real hydrograph',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.request.get('/api/water'),data=await response.json();expect(response.ok()).toBe(true);
 const station=data.stations.find(s=>s.id==='540111');expect(station.coordinates).not.toBeNull();
 await page.goto('/water');await expect(page.locator('#count')).toContainText(`${data.stations.length} gauges`);
 await expect(page.locator('.leaflet-interactive')).toHaveCount(data.stations.filter(s=>s.coordinates).length);
 await page.locator('#search').fill('Mitchelton');await page.locator('.station').click();
 await expect(page.locator('#waterChart')).toBeVisible();
 const history=await (await page.request.get('/api/water/540111')).json();
 const chart=await page.locator('#waterChart').evaluate(c=>Chart.getChart(c).data.datasets);
 expect(chart[0].data.at(-1).y).toBe(history.observations.at(-1).level);
 expect(chart[0].data.at(-1).x).toBe(Date.parse(history.observations.at(-1).time));
 expect(chart[0].label).toContain('AHD');expect(chart.length).toBe(1+history.thresholds.length);
 for(const hours of [3,6,12,24,72,168]){
  await page.locator('#historyRange').selectOption(String(hours));
  const window=await page.locator('#waterChart').evaluate(c=>{const chart=Chart.getChart(c);return {min:chart.options.scales.x.min,max:chart.options.scales.x.max,points:chart.data.datasets[0].data};});
  expect(window.max-window.min).toBe(hours*3600000);
  expect(window.max).toBe(Date.parse(history.observations.at(-1).time));
  const expected=history.observations.filter(o=>Date.parse(o.time)>=window.min).map(o=>({x:Date.parse(o.time),y:o.level}));
  expect(window.points).toEqual(expected);
 }

 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.locator('#statusFilter').selectOption('major');await expect(page.locator('#waterChart')).toHaveCount(0);
 await page.locator('#search').fill('');await page.locator('#statusFilter').selectOption('all');await page.locator('#tendencyFilter').selectOption('rising');
 const names=await page.locator('.station small').allTextContents();expect(names.some(t=>t.includes('rising'))).toBe(true);
 await page.getByRole('link',{name:'Rainfall',exact:true}).click();await expect(page.locator('h1')).toContainText('Rainfall Atlas');
 expect(errors).toEqual([]);
});
test('missing and negative levels, history failure, and mobile navigation are explicit',async({page})=>{
 const data=await (await page.request.get('/api/water')).json();const template=data.stations[0];
 data.stations=[{...template,id:'540111',name:'Missing gauge',level:null,classification:'major',coordinates:null},{...template,id:'540478',name:'Tidal gauge',level:-.3,datum:'AHD',classification:'unknown'}];
 await page.route('**/api/water',r=>r.fulfill({json:data}));
 await page.route('**/api/water/540111',r=>r.fulfill({status:503,json:{error:'History unavailable'}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/water');
 await page.locator('#statusFilter').selectOption('unknown');await expect(page.locator('.station')).toHaveCount(2);
 await page.getByRole('button',{name:/Missing gauge/}).click();await expect(page.locator('#history')).toContainText('History unavailable');
 await expect(page.locator('#detail')).toContainText('Missing');await expect(page.locator('#waterChart')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.locator('#search').fill('Tidal');await expect(page.locator('.station')).toContainText('-0.30 m');
});
test('switching stations ignores a late history response from an earlier selection',async({page})=>{
 const data=await (await page.request.get('/api/water')).json();data.stations=data.stations.slice(0,2);
 const history=await (await page.request.get('/api/water/540111')).json();
 await page.route('**/api/water',r=>r.fulfill({json:data}));
 await page.route('**/api/water/540111',async r=>{await new Promise(resolve=>setTimeout(resolve,350));await r.fulfill({json:history});});
 await page.route('**/api/water/540478',r=>r.fulfill({status:503,json:{error:'Second gauge unavailable'}}));
 await page.goto('/water');await page.getByRole('button',{name:/Mitchelton/}).click();await page.getByRole('button',{name:/Gordon Park/}).click();
 await expect(page.locator('#history')).toContainText('Second gauge unavailable');
 await page.waitForTimeout(450);await expect(page.locator('#waterChart')).toHaveCount(0);await expect(page.locator('.detail-top h2')).toContainText('Gordon Park');
});
