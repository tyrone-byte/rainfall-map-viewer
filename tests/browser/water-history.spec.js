const {test,expect}=require('@playwright/test');
const basin='brisbane-bremer-pine-caboolture',end='2026-10-26T02:00:00+00:00';
async function mock(page){
 const requests=[];
 await page.route('**/api/archive-rainfall/groups',r=>r.fulfill({json:{groups:[{id:basin,label:'Brisbane basin',gaugeCount:2}]}}));
 await page.route('**/api/archive-water/extent',r=>r.fulfill({json:{available:true,firstEnd:'2026-10-25T00:00:00+00:00',lastEnd:end,source:{status:'ok',checked_at:end}}}));
 await page.route('**/api/archive-water/frame?*',r=>{
  const q=new URL(r.request().url()).searchParams,minutes=Number(q.get('minutes')),ending=q.get('end');requests.push({minutes,end:ending,comparison:Number(q.get('comparison')||60)});
  return r.fulfill({json:{available:true,end:ending,start:new Date(Date.parse(ending)-minutes*60000).toISOString(),minutes,comparisonMinutes:Number(q.get('comparison')||60),stations:[{id:'540111',historyPath:'/fwo/IDQ65389/IDQ65389.540111.tbl.shtml',plotPath:'/fwo/IDQ65389/IDQ65389.540111.plt.shtml',membershipSource:'https://reg.bom.gov.au/cgi-bin/wrap_fwo.pl?IDQ60286.html',name:'Test river',group:'Brisbane',basinId:basin,coordinates:{lat:-27.4,lon:153},direction:'rising',ratePerHour:.4,levelChange:.4,movementStartAt:new Date(Date.parse(ending)-3600000).toISOString(),movementEndAt:ending,level:0,datum:'AHD',observedAt:ending,ageMinutes:0,status:'current'},{id:'540112',name:'No readings',group:'Brisbane',basinId:basin,coordinates:null,level:null,datum:'Unspecified',observedAt:null,ageMinutes:null,status:'missing'}]}});
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
 await expect(page.getByRole('link',{name:'Open BoM plot',exact:true})).toHaveAttribute('href','https://reg.bom.gov.au/fwo/IDQ65389/IDQ65389.540111.plt.shtml');
 await expect(page.getByRole('link',{name:'Open BoM observation table',exact:true})).toHaveAttribute('target','_blank');
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

test('water plots default to lines, distinguish long gaps and retain point preference across time changes',async({page})=>{
 await mock(page);
 await page.route('**/api/archive-water/series?*',r=>{
  const q=new URL(r.request().url()).searchParams,ending=q.get('end'),base=Date.parse(ending);
  const values=[{time:new Date(base-3*3600000).toISOString(),level:1,datum:'AHD'},{time:new Date(base-2.5*3600000).toISOString(),level:2,datum:'AHD'},{time:new Date(base-.5*3600000).toISOString(),level:3,datum:'AHD'},{time:new Date(base-.25*3600000).toISOString(),level:null,datum:'AHD'},{time:ending,level:4,datum:'LGH'}];
  return r.fulfill({json:{available:true,end:ending,start:new Date(base-24*3600000).toISOString(),minutes:Number(q.get('minutes')),observations:values}});
 });
 await page.goto('/water-history?basin='+basin);await expect(page.locator('#count')).toContainText('2 gauges');
 await page.locator('.station').filter({hasText:'Test river'}).click();
 const toggle=page.getByLabel('Show recorded points');await expect(toggle).toBeVisible();await expect(toggle).not.toBeChecked();
 const initial=await page.locator('#waterHistoryChart').evaluate(c=>{
  const dataset=Chart.getChart(c).data.datasets[0],dash=dataset.segment.borderDash;
  return {radius:dataset.pointRadius,short:dash({p0:{parsed:{x:0}},p1:{parsed:{x:1800000}}})||[],long:dash({p0:{parsed:{x:0}},p1:{parsed:{x:7200000}}}),gaps:dataset.spanGaps,values:dataset.data.map(p=>p.y)};
 });
 expect(initial).toEqual({radius:0,short:[],long:[6,5],gaps:false,values:[1,2,3,null,null]});
 await toggle.check();expect(await page.locator('#waterHistoryChart').evaluate(c=>Chart.getChart(c).data.datasets.every(d=>d.pointRadius===3))).toBe(true);
 await page.locator('#accumulation').selectOption('180');await expect(page.locator('#period')).toContainText('3 hours');
 await expect(toggle).toBeChecked();await expect.poll(()=>page.locator('#waterHistoryChart').evaluate(c=>Chart.getChart(c)?.data.datasets[0].pointRadius)).toBe(3);
 await toggle.uncheck();expect(await page.locator('#waterHistoryChart').evaluate(c=>Chart.getChart(c).data.datasets[0].pointRadius)).toBe(0);
});

test('map controls change water colours, comparison, background and seven-day duration without moving the map',async({page})=>{
 const requests=await mock(page);await page.goto('/water-history?basin='+basin);await expect(page.locator('#count')).toContainText('2 gauges');
 await page.evaluate(()=>map.setView([-27.2,152.9],10,{animate:false}));
 expect(await page.evaluate(()=>markers.get('540111').options.fillColor)).toBe('#d94843');
 await page.locator('#colourMode').selectOption('rate');expect(await page.evaluate(()=>markers.get('540111').options.fillColor)).toBe('#ed8b36');
 await page.locator('#colourMode').selectOption('age');expect(await page.evaluate(()=>markers.get('540111').options.fillColor)).toBe('#36a48c');await expect(page.locator('#comparison')).toBeDisabled();
 await page.locator('#colourMode').selectOption('trend');await page.locator('#comparison').selectOption('15');await expect.poll(()=>requests.at(-1).comparison).toBe(15);
 await page.locator('#background').selectOption('grey');expect(await page.evaluate(()=>{const urls=[];map.eachLayer(l=>{if(l._url)urls.push(l._url);});return urls;})).toEqual([expect.stringContaining('openstreetmap')]);
 await page.locator('#background').selectOption('hybrid');const urls=await page.evaluate(()=>{const urls=[];map.eachLayer(l=>{if(l._url)urls.push(l._url);});return urls;});expect(urls).toHaveLength(2);expect(urls[0]).toContain('World_Imagery');
 const opacity=await page.evaluate(()=>{const result=[];map.eachLayer(l=>{if(l._url)result.push(l.options.opacity);});return result;});expect(opacity).toEqual([.7,.7]);
 expect(await page.evaluate(()=>map.getZoom())).toBe(10);expect(await page.evaluate(()=>map.getCenter().lat)).toBeCloseTo(-27.2,5);
 await page.locator('#accumulation').selectOption('10080');await expect(page.locator('#period')).toContainText('7 days');
 await page.locator('.station').filter({hasText:'Test river'}).click();await expect(page.locator('#waterHistoryChart')).toBeVisible();
 expect(await page.locator('#waterHistoryChart').evaluate(c=>Chart.getChart(c).options.scales.x.max-Chart.getChart(c).options.scales.x.min)).toBe(7*86400000);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('short labels, compact hover and page scrolling over the map keep plots accessible',async({page})=>{
 await mock(page);await page.goto('/water-history?basin='+basin);await expect(page.locator('#count')).toContainText('2 gauges');
 await expect(page.locator('h1')).toContainText('Water levels');await expect(page.getByRole('link',{name:'Rainfall',exact:true})).toBeVisible();
 const content=await page.evaluate(()=>markers.get('540111').getTooltip().getContent().textContent);
 expect(content).toContain('0.00 m AHD');expect(content).not.toContain('Rising');expect(content).not.toContain('m/h');expect(content).not.toContain('AEST');expect(content).not.toContain('tidal');
 const alignment=await page.evaluate(()=>{const marker=markers.get('540111');marker.openTooltip();const el=marker.getTooltip().getContent(),name=el.querySelector('strong').getBoundingClientRect(),value=el.querySelector('div').getBoundingClientRect();return {nameTop:name.top,valueTop:value.top,height:el.getBoundingClientRect().height};});
 expect(Math.abs(alignment.nameTop-alignment.valueTop)).toBeLessThan(1);expect(alignment.height).toBeLessThan(25);
 await page.locator('.station').filter({hasText:'Test river'}).click();await expect(page.locator('#waterHistoryChart')).toBeVisible();
 await expect(page.locator('.history-coverage,.movement-summary')).toHaveCount(0);await expect(page.locator('.plot-notes')).not.toHaveAttribute('open','');
 await page.locator('#map').hover();const zoom=await page.evaluate(()=>map.getZoom());const before=await page.locator('.workspace').evaluate(el=>el.scrollTop);
 await page.mouse.wheel(0,400);await expect.poll(()=>page.locator('.workspace').evaluate(el=>el.scrollTop)).toBeGreaterThan(before);
 expect(await page.evaluate(()=>map.getZoom())).toBe(zoom);
 await page.locator('.leaflet-control-zoom-in').click();await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBe(zoom+1);
 await page.locator('#background').selectOption('grey');expect(await page.locator('.map-grey-tiles').evaluate(el=>getComputedStyle(el).filter)).toBe('grayscale(1)');
});

test.describe('phone navigation',()=>{
 test.use({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
 test('one-finger page scroll works over the map unless Move map is explicitly enabled',async({page})=>{
  await mock(page);await page.goto('/water-history?basin='+basin);await expect(page.locator('#count')).toContainText('2 gauges');
  await page.locator('.station').filter({hasText:'Test river'}).click();await expect(page.locator('#waterHistoryChart')).toBeVisible();
  expect(await page.evaluate(()=>map.dragging.enabled())).toBe(false);expect(await page.evaluate(()=>map.touchZoom.enabled())).toBe(true);
  await page.locator('#map').scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY),box=await page.locator('#map').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*25}]});await page.waitForTimeout(20);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before);
  await page.getByRole('button',{name:'Move map',exact:true}).click();expect(await page.evaluate(()=>map.dragging.enabled())).toBe(true);
  await page.getByRole('button',{name:'Finish moving',exact:true}).click();expect(await page.evaluate(()=>map.dragging.enabled())).toBe(false);
  await page.locator('#map').scrollIntoViewIfNeeded();const pinchBox=await page.locator('#map').boundingBox(),px=pinchBox.x+pinchBox.width/2,py=pinchBox.y+pinchBox.height/2,zoom=await page.evaluate(()=>map.getZoom());
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px-30,y:py,id:1},{x:px+30,y:py,id:2}]});
  for(const spread of [40,50,60]){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px-spread,y:py,id:1},{x:px+spread,y:py,id:2}]});await page.waitForTimeout(30);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>page.evaluate(()=>map.getZoom())).toBeGreaterThan(zoom);

 });
});
