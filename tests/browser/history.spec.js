const {test,expect}=require('@playwright/test');
const first='2026-10-22T00:00:00+00:00',last='2026-10-22T01:00:00+00:00';
const metadata={available:true,firstEnd:first,lastEnd:last,source:{checked_at:last,issued_at:last,status:'ok'}};
function gauge(id,name,depth,minutes,end){return {id,name,group:'Test catchment',stationNumber:id==='a'?'540111':'540668',coordinates:{lat:-27.4,lon:153.0,source:'https://reg.bom.gov.au/qld/flood/brisbane.shtml'},ifdLocationKey:null,depth,complete:depth!==null,validBlocks:depth===null?0:minutes/15,expectedBlocks:minutes/15,start:new Date(Date.parse(end)-minutes*60000).toISOString(),end,minutes};}
async function mock(page){
 const requests=[];
 await page.route('**/api/archive-rainfall/group-stats',route=>route.fulfill({json:{available:true,end:last,groups:[{id:'brisbane-bremer-pine-caboolture',completeGauges:2,knownGauges:3,wetGauges:2,wetPercent:100,maxDepth:50,maxStation:'Alpha gauge'}]}}));
 await page.route('**/api/archive-rainfall/groups',route=>route.fulfill({json:{groups:[{id:"brisbane-bremer-pine-caboolture",label:"Brisbane basin",gaugeCount:3},{id:"gold-coast-logan",label:"Gold Coast basin",gaugeCount:1}]}}));
 await page.route('**/api/archive-rainfall/extent',route=>route.fulfill({json:metadata}));
 await page.route('**/api/archive-rainfall/frame?*',route=>{
  const url=new URL(route.request().url()),end=url.searchParams.get('end'),minutes=Number(url.searchParams.get('minutes'));requests.push({end,minutes});
  const old=Date.parse(end)<Date.parse(last);
  const stations=[gauge('a','Alpha gauge',old?40:minutes===15?2:50,minutes,end),gauge('b','Beta gauge',old?60:minutes===15?8:10,minutes,end),gauge('c','Missing gauge',null,minutes,end)];
  return route.fulfill({json:{available:true,end,start:stations[0].start,minutes,stations,extent:metadata}});
 });
 await page.route('**/api/archive-rainfall/series?*',route=>{
  const url=new URL(route.request().url()),end=url.searchParams.get('end'),id=url.searchParams.get('gauge'),base=Date.parse(end),blocks=Math.max(96,Number(url.searchParams.get('minutes')||1440)/15);
  const periods=Array.from({length:blocks},(_,i)=>({start:new Date(base-(blocks-i)*900000).toISOString(),end:new Date(base-(blocks-1-i)*900000).toISOString()}));
  const station=gauge(id,id==='a'?'Alpha gauge':'Beta gauge',1,15,end);
  return route.fulfill({json:{available:true,end,periodMinutes:15,periods,stations:[{...station,values:Array(blocks).fill(1)}]}});
 });
 return requests;
}
test('duration and ending time change totals, ranking and colours together without changing zoom',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=await mock(page);
 await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#count')).toContainText('3 gauges');
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

test('unavailable archive never falls back to unlabelled coarse values',async({page})=>{
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{available:false,reason:'not-connected'}}));
 await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#notice')).toContainText('Could not read the saved rainfall database');
 await expect(page.locator('#ending')).toBeDisabled();await expect(page.locator('.station')).toHaveCount(0);
 await expect(page.locator('#freshness')).toContainText('Archive unavailable');
});

test('late window response cannot replace a newer ending-time selection',async({page})=>{
 await mock(page);await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#count')).toContainText('3 gauges');
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
 await mock(page);await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#count')).toContainText('3 gauges');
 await page.evaluate(()=>map.setView([-27.15,152.95],10,{animate:false}));
 await page.getByRole('link',{name:'Water levels',exact:true}).click();await expect(page.locator('.basin-choice')).toHaveCount(2);
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.project(map.getCenter()).distanceTo(map.project([-27.15,152.95])))).toBeLessThan(1);
 await page.getByRole('link',{name:'Rainfall',exact:true}).click();await expect(page.locator('#groupPicker')).toBeHidden();await expect(page.locator('#mapGroup')).toHaveValue('brisbane-bremer-pine-caboolture');await expect(page.locator('.station')).toHaveCount(3);
 expect(await page.evaluate(()=>markers.size)).toBe(3);
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.project(map.getCenter()).distanceTo(map.project([-27.15,152.95])))).toBeLessThan(1);
});
test('ending picker uses Brisbane time and bookmarked selections survive reload',async({page})=>{
 const requests=await mock(page);await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#ending')).toBeEnabled();
 await page.locator('#ending').fill('2026-10-22T10:30');await page.locator('#ending').dispatchEvent('change');
 await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(first)+1800000);
 await expect(page).toHaveURL(/end=/);await page.reload();
 await expect(page.locator('#ending')).toHaveValue('2026-10-22T10:30');
 await expect(page.locator('#latest')).toHaveAttribute('aria-pressed','false');
});
test('refresh preserves a paused time while Latest follows newly collected periods',async({page})=>{
 const requests=await mock(page);await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('#count')).toContainText('3 gauges');
 await page.locator('#accumulation').selectOption('15');await expect(page.locator('#period')).toContainText('15 minutes');
 await page.locator('#previous').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-900000);
 const newer=new Date(Date.parse(last)+900000).toISOString();
 await page.route('**/api/archive-rainfall/extent',r=>r.fulfill({json:{...metadata,lastEnd:newer}}));
 await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();
 expect(Date.parse(requests.at(-1).end)).toBe(Date.parse(last)-900000);
 await page.locator('#latest').click();await expect.poll(()=>Date.parse(requests.at(-1).end)).toBe(Date.parse(newer));
});



test('gauge list and controls share a single sidebar scrollbar',async({page})=>{
 await mock(page);
 await page.route('**/api/archive-rainfall/frame?*',r=>{
  const stations=Array.from({length:50},(_,i)=>gauge('g'+i,'Gauge '+String(i).padStart(2,'0'),50-i,180,last));
  return r.fulfill({json:{available:true,end:last,start:stations[0].start,minutes:180,stations}});
 });
 await page.goto('/history?basin=brisbane-bremer-pine-caboolture&minutes=180');await expect(page.locator('.station')).toHaveCount(50);
 const state=await page.evaluate(()=>{
  const list=document.getElementById('stations'),side=document.querySelector('.sidebar');
  side.scrollTop=300;
  return {listOverflow:getComputedStyle(list).overflowY,listScroll:list.scrollTop,sideScroll:side.scrollTop,sideOverflow:side.scrollHeight>side.clientHeight};
 });
 expect(state.listOverflow).toBe('visible');expect(state.listScroll).toBe(0);
 expect(state.sideScroll).toBe(300);expect(state.sideOverflow).toBe(true);
});

test('basin list opens before any rainfall query, then selection fits gauges and returning clears them',async({page})=>{
 const requests=await mock(page);await page.goto('/history');
 await expect(page.locator('.basin-choice')).toHaveCount(2);
 await expect(page.locator('#historyWorkspace')).toBeVisible();await expect(page.locator('#map')).toBeVisible();
 expect(requests).toHaveLength(0);expect(await page.evaluate(()=>markers.size)).toBe(0);
 await page.locator('[data-basin="brisbane-bremer-pine-caboolture"]').click();
 await expect(page.locator('.station')).toHaveCount(3);
 await expect(page.locator('#basinTitle')).toHaveText('Brisbane basin');
 await expect(page).toHaveURL(/basin=brisbane-bremer-pine-caboolture/);

 await page.locator('.page-tabs [aria-current="page"]').click();await expect(page.locator('#groupPicker')).toBeVisible();await expect(page.locator('.basin-choice')).toHaveCount(2);
 expect(await page.evaluate(()=>markers.size)).toBe(0);await expect(page.locator('#hyetograph')).toHaveCount(0);
 await page.locator('[data-basin="gold-coast-logan"]').click();await expect(page.locator('#basinTitle')).toHaveText('Gold Coast basin');
 expect(await page.evaluate(()=>map.getZoom())).toBeLessThanOrEqual(12);
});

test('group rainfall summaries disclose coverage and opening a group defaults to 24 hours',async({page})=>{
 const requests=await mock(page);await page.goto('/history');
 await expect(page.locator('.basin-stats')).toContainText('Highest: 50.0 mm');
 await expect(page.locator('.basin-stats')).toContainText('2/2 complete gauges (100%)');
 await page.locator('[data-basin="brisbane-bremer-pine-caboolture"]').click();
 await expect(page.locator('#accumulation')).toHaveValue('1440');
 await expect.poll(()=>requests.at(-1)?.minutes).toBe(1440);
});


test('obsolete bulletin URLs redirect to history pages and their navigation is removed',async({page})=>{
 await mock(page);await page.goto('/');await expect(page).toHaveURL(/\/summary$/);await expect(page.locator('h1')).toHaveText('Storm summary');
 await expect(page.getByRole('link',{name:'Rainfall bulletin',exact:true})).toHaveCount(0);await expect(page.locator('.page-tabs a[href="/water"]')).toHaveCount(0);
 await page.goto('/water');await expect(page).toHaveURL(/\/water-history$/);await expect(page.locator('.basin-choice')).toHaveCount(2);
});

test('both landing pages prioritise peak gauge rainfall then wet-gauge coverage and put incomplete groups last',async({page})=>{
 await mock(page);
 const ids=['fitzroy','brisbane-bremer-pine-caboolture','gold-coast-logan','sunshine-coast-mary'];
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:ids.map(id=>({id,label:id,gaugeCount:10}))}}));
 const depths=[null,100,200,200],wet=[null,100,20,80];
 await page.route('**/api/archive-rainfall/group-stats',r=>r.fulfill({json:{available:true,end:last,groups:ids.map((id,i)=>({id,maxDepth:depths[i],wetPercent:wet[i],wetGauges:i?wet[i]/10:0,knownGauges:10,completeGauges:i?10:0,maxStation:'Test gauge'}))}}));
 for(const path of ['/history','/water-history']){
  await page.goto(path);await expect(page.locator('.basin-choice').first()).toHaveAttribute('data-basin','sunshine-coast-mary');
  expect(await page.locator('.basin-choice').evaluateAll(buttons=>buttons.map(b=>b.dataset.basin))).toEqual([ids[3],ids[2],ids[1],ids[0]]);
 }
});

test('rainfall hover keeps its name and selected rainfall depth on one horizontal line',async({page})=>{
 await mock(page);await page.goto('/history?basin=brisbane-bremer-pine-caboolture');await expect(page.locator('#count')).toContainText('3 gauges');
 const result=await page.evaluate(()=>{const marker=markers.get('a');marker.openTooltip();const el=marker.getTooltip().getContent(),name=el.querySelector('strong').getBoundingClientRect(),value=el.querySelector('div').getBoundingClientRect();return {text:el.textContent,nameTop:name.top,valueTop:value.top,height:el.getBoundingClientRect().height};});
 expect(result.text).toContain('Alpha gauge');expect(result.text).toContain('50.0 mm');expect(Math.abs(result.nameTop-result.valueTop)).toBeLessThan(1);expect(result.height).toBeLessThan(25);
});

test('phone layout places collapsed controls on the map, with gauges below and no duplicate controls',async({page})=>{
 await mock(page);await page.setViewportSize({width:390,height:844});await page.goto('/history?basin=brisbane-bremer-pine-caboolture');await expect(page.locator('#count')).toContainText('3 gauges');
 expect(await page.locator('main').evaluate(el=>[...el.children].map(child=>child.classList.contains('mobile-controls')?'controls':child.classList.contains('workspace')?'plots':'gauges'))).toEqual(['plots','gauges']);
 await expect(page.locator('#accumulation')).toHaveCount(1);await expect(page.getByRole('link',{name:'Jump to station search and gauges'})).toBeHidden();

 await expect(page.locator('.station').first()).toHaveAttribute('target','_self');
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.sidebar>.time-controls')).toHaveCount(1);await expect(page.locator('#accumulation')).toHaveCount(1);
 await page.locator('#accumulation').selectOption('60');await expect(page.locator('#period')).toContainText('1 hour');
});
