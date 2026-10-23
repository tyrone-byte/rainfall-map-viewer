const {test,expect}=require('@playwright/test');
const first='2026-10-22T00:00:00+00:00',last='2026-10-22T01:00:00+00:00';
const metadata={available:true,firstEnd:first,lastEnd:last,source:{checked_at:last,issued_at:last,status:'ok'}};
function gauge(id,name,depth,minutes,end){return {id,name,group:'Test catchment',stationNumber:id==='a'?'540111':'540668',coordinates:{lat:-27.4,lon:153.0,source:'https://reg.bom.gov.au/qld/flood/brisbane.shtml'},ifdLocationKey:null,depth,complete:depth!==null,validBlocks:depth===null?0:minutes/15,expectedBlocks:minutes/15,start:new Date(Date.parse(end)-minutes*60000).toISOString(),end,minutes};}
async function mock(page){
 const requests=[];
 await page.route('**/api/archive-rainfall/extent',route=>route.fulfill({json:metadata}));
 await page.route('**/api/archive-rainfall/frame?*',route=>{
  const url=new URL(route.request().url()),end=url.searchParams.get('end'),minutes=Number(url.searchParams.get('minutes'));requests.push({end,minutes});
  const old=Date.parse(end)<Date.parse(last);
  const stations=[gauge('a','Alpha gauge',old?40:minutes===15?2:50,minutes,end),gauge('b','Beta gauge',old?60:minutes===15?8:10,minutes,end),gauge('c','Missing gauge',null,minutes,end)];
  return route.fulfill({json:{available:true,end,start:stations[0].start,minutes,stations,extent:metadata}});
 });
 await page.route('**/api/archive-rainfall/series?*',route=>{
  const url=new URL(route.request().url()),end=url.searchParams.get('end'),id=url.searchParams.get('gauge'),base=Date.parse(end);
  const periods=Array.from({length:96},(_,i)=>({start:new Date(base-(96-i)*900000).toISOString(),end:new Date(base-(95-i)*900000).toISOString()}));
  const station=gauge(id,id==='a'?'Alpha gauge':'Beta gauge',1,15,end);
  return route.fulfill({json:{available:true,end,periodMinutes:15,periods,stations:[{...station,values:Array(96).fill(1)}]}});
 });
 return requests;
}
test('duration and ending time change totals, ranking and colours together without changing zoom',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=await mock(page);
 await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await expect(page.locator('.station').first()).toContainText('Alpha gauge');
 await page.evaluate(()=>map.setView([-27.2,152.9],10,{animate:false}));
 await page.locator('#accumulation').selectOption('15');
 await expect(page.locator('#period')).toContainText('15 minutes');await expect(page.locator('.station').first()).toContainText('Beta gauge');
 expect(await page.evaluate(()=>markers.get('b').options.fillColor)).toBe('#e9c345');
 await page.locator('#ending').fill('2026-10-22T10:30');await page.locator('#ending').dispatchEvent('change');
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(first)+1800000);
 await expect(page.locator('.station').first()).toContainText('Beta gauge');
 await expect(page.locator('.station').first()).toContainText('60.0 mm');
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);
 expect(await page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(-27.2,5);
 await page.locator('#latest').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last));
 await expect(page.locator('#latest')).toHaveAttribute('aria-pressed','true');
 expect(errors).toEqual([]);
});
test('chart interval groups bars independently of map totals and native IFD, with mobile layout',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mock(page);
 await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');await page.locator('.station').first().click();
 await expect(page.locator('#ifdChart')).toBeVisible();
 await expect(page.locator('input[type=range]')).toHaveCount(0);
 expect(await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets.every(d=>d.pointRadius===0))).toBe(true);
 const points=await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets[0].data);
 expect(points[0]).toEqual({x:15,y:1});expect(points.at(-1)).toEqual({x:1440,y:96});
 const period=await page.locator('#period').textContent();
 await page.locator('#chartInterval').selectOption('60');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.datasets[0].data)).toEqual(Array(3).fill(4));
 expect(await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets[0].data)).toEqual(points);
 await expect(page.locator('#period')).toHaveText(period);
 await page.locator('#accumulation').selectOption('30');await expect(page.locator('#period')).toContainText('30 minutes');
 await expect(page.locator('#chartInterval')).toHaveValue('30');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.datasets[0].data)).toEqual([2]);
 await page.setViewportSize({width:390,height:844});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 expect(errors).toEqual([]);
});
test('unavailable archive never falls back to unlabelled coarse values',async({page})=>{
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:false,reason:'not-connected'}}));
 await page.goto('/history');await expect(page.locator('#notice')).toContainText('unavailable or empty');
 await expect(page.locator('#ending')).toBeDisabled();await expect(page.locator('.station')).toHaveCount(0);
 await expect(page.locator('#freshness')).toContainText('Archive unavailable');
});
test('IFD keeps a missing quarter as a gap and map labels stay on failed window loads',async({page})=>{
 await mock(page);
 await page.route('**/api/archive-rainfall/series?*',route=>{
  const end=last,base=Date.parse(end),periods=Array.from({length:96},(_,i)=>({start:new Date(base-(96-i)*900000).toISOString(),end:new Date(base-(95-i)*900000).toISOString()}));
  const values=Array(96).fill(1);values[94]=null;
  return route.fulfill({json:{available:true,end,periodMinutes:15,periods,stations:[{...gauge('a','Alpha gauge',null,180,end),values}]}});
 });
 await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');await page.locator('.station').first().click();
 await expect(page.locator('#ifdChart')).toBeVisible();
 const points=await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets[0].data);
 expect(points[0].y).toBe(1);expect(points[1].y).toBeNull();
 await page.locator('#chartInterval').selectOption('30');expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.datasets[0].data.at(-1))).toBeNull();
 await page.locator('#accumulation').selectOption('15');await expect(page.locator('#period')).toContainText('15 minutes');
 const caption=await page.locator('#period').textContent();
 await page.route('**/api/archive-rainfall/frame?*',r=>r.fulfill({status:503,json:{error:'Test failure'}}));
 await page.locator('#previous').click();await expect(page.locator('#notice')).toContainText('earlier labelled window');
 await expect(page.locator('#period')).toHaveText(caption);
});
test('late window response cannot replace a newer ending-time selection',async({page})=>{
 await mock(page);await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await page.locator('#accumulation').selectOption('15');await expect(page.locator('#period')).toContainText('15 minutes');
 let delayed=false;
 await page.route('**/api/archive-rainfall/frame?*',async route=>{
  const url=new URL(route.request().url()),end=url.searchParams.get('end'),minutes=Number(url.searchParams.get('minutes'));
  const old=Date.parse(end)===Date.parse(last)-900000;
  if(old){delayed=true;await new Promise(resolve=>setTimeout(resolve,750));}
  const station=gauge('a',old?'Old response':'Newest selection',old?99:4,minutes,end);
  await route.fulfill({json:{available:true,end,start:station.start,minutes,stations:[station],extent:metadata}}).catch(()=>{});
 });
 await page.locator('#previous').click();await expect.poll(()=>delayed).toBe(true);
 await page.locator('#previous').click();await expect(page.locator('.station').first()).toContainText('Newest selection');
 await page.waitForTimeout(850);await expect(page.locator('.station').first()).toContainText('Newest selection');
 await expect(page.locator('#timeLabel')).toContainText('10:30');
});
test('history and water pages preserve the same geographic viewport',async({page})=>{
 await mock(page);await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await page.evaluate(()=>map.setView([-27.15,152.95],10,{animate:false}));
 await page.getByRole('link',{name:'Water levels',exact:true}).click();await expect(page.locator('#count')).toContainText('gauges ·');
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(-27.15,5);
 await page.getByRole('link',{name:'Rainfall history',exact:true}).click();await expect(page.locator('#count')).toContainText('3 gauges');
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.getCenter().lng)).toBeCloseTo(152.95,5);
});
test('ending picker uses Brisbane time and bookmarked selections survive reload',async({page})=>{
 const requests=await mock(page);await page.goto('/history');await expect(page.locator('#ending')).toBeEnabled();
 await page.locator('#ending').fill('2026-10-22T10:30');await page.locator('#ending').dispatchEvent('change');
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(first)+1800000);
 await expect(page).toHaveURL(/end=/);await page.reload();
 await expect(page.locator('#ending')).toHaveValue('2026-10-22T10:30');
 await expect(page.locator('#latest')).toHaveAttribute('aria-pressed','false');
});
test('refresh preserves a paused time while Latest follows newly collected periods',async({page})=>{
 const requests=await mock(page);await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await page.locator('#accumulation').selectOption('15');await expect(page.locator('#period')).toContainText('15 minutes');
 await page.locator('#previous').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-900000);
 const newer=new Date(Date.parse(last)+900000).toISOString();
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{...metadata,lastEnd:newer}}));
 await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();
 expect(Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-900000);
 await page.locator('#latest').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(newer));
});

test('rainfall duration bounds the chart and steps ending time while IFD retains its 24-hour search',async({page})=>{
 const requests=await mock(page);
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{...metadata,firstEnd:'2026-10-20T00:00:00Z'}}));
 await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await expect(page.getByLabel('Rainfall duration',{exact:true})).toHaveValue('180');
 await expect(page.locator('#previous')).toHaveText('← 3 hours');
 await page.locator('.station').first().click();await expect(page.locator('#ifdChart')).toBeVisible();
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.labels.length)).toBe(12);
 await expect(page.locator('#observationTable')).toHaveCount(0);
 const original=await page.locator('#ifdChart').evaluate(c=>Chart.getChart(c).data.datasets[0].data);
 await page.locator('#ifdMode').selectOption({label:'Wettest windows in preceding 24 hours'});
 await expect(page.locator('.ifd-explanation')).toContainText('24 hours preceding');
 await page.locator('#accumulation').selectOption('360');
 await expect.poll(()=>page.locator('#hyetograph').evaluate(c=>Chart.getChart(c)?.data.labels.length)).toBe(24);
 await expect.poll(()=>page.locator('#ifdChart').evaluate(c=>Chart.getChart(c)?.data.datasets[0].data)).toEqual(original);
 await expect(page.locator('#previous')).toHaveText('← 6 hours');
 await page.locator('#previous').click();
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-6*3600000);
 await expect.poll(()=>page.locator('#hyetograph').evaluate(c=>Chart.getChart(c)?.data.labels[0]||'')).toContain('23:15');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.labels.at(-1))).toContain('05:00');
 await page.locator('#chartInterval').selectOption('60');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.labels.length)).toBe(6);
 await page.locator('#next').click();
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last));
 await expect(page.locator('#chartInterval')).toHaveValue('60');
});

test('sidebar controls and right plots scroll independently and keep the plot position on updates',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=await mock(page);
 await page.goto('/history');await expect(page.locator('#count')).toContainText('3 gauges');
 await expect(page.locator('#rainFilter')).toHaveCount(0);
 await expect(page.locator('.sidebar #accumulation')).toBeVisible();
 await expect(page.locator('.sidebar #ending')).toBeVisible();
 await expect(page.locator('.sidebar #previous')).toBeVisible();
 await page.locator('.station').first().click();await expect(page.locator('#ifdChart')).toBeVisible();
 await page.locator('.workspace').evaluate(el=>el.scrollTop=700);
 const top=await page.locator('.workspace').evaluate(el=>el.scrollTop);
 expect(top).toBeGreaterThan(500);
 await page.locator('.station').filter({hasText:'Beta gauge'}).click();
 await expect(page.locator('#detail h2').first()).toHaveText('Beta gauge');
 await expect(page.locator('#detail')).toHaveAttribute('aria-busy','false');
 expect(await page.locator('.workspace').evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
 await page.locator('#accumulation').selectOption('15');
 await expect(page.locator('#period')).toContainText('15 minutes');
 await expect(page.locator('#detail')).toHaveAttribute('aria-busy','false');
 await page.locator('#previous').click();
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-900000);
 await expect(page.locator('#detail')).toHaveAttribute('aria-busy','false');
 expect(await page.locator('.workspace').evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
 expect(await page.evaluate(()=>window.scrollY)).toBe(0);
 expect(errors).toEqual([]);
});

test('gauge list and controls share a single sidebar scrollbar',async({page})=>{
 await mock(page);
 await page.route('**/api/archive-rainfall/frame?*',r=>{
  const stations=Array.from({length:50},(_,i)=>gauge('g'+i,'Gauge '+String(i).padStart(2,'0'),50-i,180,last));
  return r.fulfill({json:{available:true,end:last,start:stations[0].start,minutes:180,stations}});
 });
 await page.goto('/history');await expect(page.locator('.station')).toHaveCount(50);
 const state=await page.evaluate(()=>{
  const list=document.getElementById('stations'),side=document.querySelector('.sidebar');
  side.scrollTop=300;
  return {listOverflow:getComputedStyle(list).overflowY,listScroll:list.scrollTop,sideScroll:side.scrollTop,sideOverflow:side.scrollHeight>side.clientHeight};
 });
 expect(state.listOverflow).toBe('visible');expect(state.listScroll).toBe(0);
 expect(state.sideScroll).toBe(300);expect(state.sideOverflow).toBe(true);
});
