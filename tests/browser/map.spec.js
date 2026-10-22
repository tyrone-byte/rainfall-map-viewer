const {test,expect}=require('@playwright/test');
test('live BoM -> map -> station -> chronological hyetograph and filters',async({page})=>{
 const live=await (await page.request.get('/api/rainfall')).json();
 const gauge=live.stations.find(s=>s.name==='Goolman');
 const latest=gauge.values.at(-1);
 const mm=v=>v===null?'Missing':`${v.toFixed(1)} mm`;
 const mapped=live.stations.filter(s=>s.coordinates).length;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.locator('#count')).toContainText(`${live.stations.length} gauges`);
 await expect(page.locator('.leaflet-interactive')).toHaveCount(mapped);
 if(process.env.REQUIRE_MAP_TILES)await expect.poll(()=>page.locator('.leaflet-tile-loaded').count()).toBeGreaterThan(0);
 await page.locator('#search').fill('Goolman');
 await expect(page.locator('.station')).toHaveCount(1);
 await page.locator('.leaflet-interactive').click();
 await expect(page.locator('.detail-top h2')).toHaveText('Goolman');
 await expect(page.locator('.metric strong').first()).toHaveText(mm(latest));
 await expect(page.locator('.metric strong').nth(1)).toHaveText(mm(gauge.values.filter(v=>v!==null).reduce((a,b)=>a+b,0)));
 await expect(page.locator('#observationTable tbody tr')).toHaveCount(8);
 await page.screenshot({path:'test-results/gauge-detail.png',fullPage:true});
 const values=await page.locator('#hyetograph').evaluate(canvas=>{const c=Chart.getChart(canvas);return {values:c.data.datasets[0].data,labels:c.data.labels};});
 expect(values.values).toEqual(gauge.values);
 const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
 expect(values.labels).toEqual(live.periods.map(p=>date(p.end)));
 await page.locator('#rainFilter').selectOption(latest!==null && latest<=5?'red':'green');await expect(page.locator('.station')).toHaveCount(0);
 await page.locator('#rainFilter').selectOption('all');await page.locator('.station').click();
 await page.locator('.settings > summary').click();await page.locator('#t1').fill('0');await page.locator('#t2').fill('0.1');await page.locator('#t3').fill('0.2');await page.getByRole('button',{name:'Apply',exact:true}).click();
 const limits=[0,.1,.2,40,50,80,130,180,200],ids=['green','yellow','orange','red','crimson','magenta','purple','indigo','blue','navy'];
 const i=limits.findIndex(v=>latest<=v);
 await page.locator('#rainFilter').selectOption(latest===null?'missing':ids[i<0?9:i]);await expect(page.locator('.station')).toHaveCount(1);
 await page.locator('#t2').fill('0.3');await page.getByRole('button',{name:'Apply',exact:true}).click();await expect(page.locator('#thresholdError')).not.toBeEmpty();
 await page.locator('#search').fill('Dayboro');await page.locator('#rainFilter').selectOption('all');
 const unresolved=page.locator('.station').filter({hasText:'Location unresolved'});expect(await unresolved.count()).toBeGreaterThan(0);
 await unresolved.first().click();await expect(page.locator('#detail .unmapped').first()).toBeVisible();
 await page.locator('#search').fill('');await page.locator('#group').selectOption('Stradbroke Islands');await expect(page.locator('#count')).toContainText('2 gauges');
 await page.screenshot({path:'test-results/rainfall-map.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('missing values remain gaps, partial totals and refresh failure are explicit',async({page})=>{
 const response=await page.request.get('/api/rainfall'),data=await response.json();
 data.stations=[{...data.stations.find(s=>s.name==='Goolman'),values:[null,0,16,0,1,0,4,null]}];data.refreshError='Source unavailable';
 await page.route('**/api/rainfall*',route=>route.fulfill({json:data}));
 await page.goto('/');await page.locator('.station').click();
 await expect(page.locator('.metric strong').first()).toHaveText('Missing');
 await expect(page.locator('.metric').nth(1)).toContainText('6/8 blocks');
 await expect(page.locator('#notice')).toContainText('last successfully fetched');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.datasets[0].data[0])).toBeNull();
 await page.route('**/api/rainfall*',route=>route.fulfill({status:503,json:{error:'BoM unreachable'}}));
 await page.locator('#refresh').click();await expect(page.locator('#notice')).toContainText('Previously displayed data');
});
test('mobile layout and first-load source failure',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/rainfall*',route=>route.fulfill({status:503,json:{error:'BoM unreachable'}}));
 await page.goto('/');await expect(page.locator('#notice')).toContainText('No rainfall observations');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('mobile with observations and chart stays within viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.locator('#search').fill('Goolman');await page.locator('.station').click();
 await expect(page.locator('#hyetograph')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/mobile.png',fullPage:true});
});

// Deliberately synthetic observations below are test-only boundary cases.
test('extended bands include exact boundaries and gauge ranking survives refresh and filters',async({page})=>{
 const data=await (await page.request.get('/api/rainfall')).json();
 const template=data.stations.find(s=>s.coordinates);
 const cases=[[null,'missing'],[0,'green'],[5,'green'],[5.1,'yellow'],[15,'yellow'],[15.1,'orange'],[30,'orange'],[30.1,'red'],[40,'red'],[40.1,'crimson'],[50,'crimson'],[50.1,'magenta'],[80,'magenta'],[80.1,'purple'],[130,'purple'],[130.1,'indigo'],[180,'indigo'],[180.1,'blue'],[200,'blue'],[200.1,'navy']];
 data.stations=cases.map(([value],i)=>({...template,id:`test-${i}`,name:`Test ${i}`,group:'Test group',values:[0,0,0,0,0,0,0,value]}));
 data.stations.push({...template,id:'tie-z',name:'Z zero',group:'Test group',values:[0,0,0,0,0,0,0,0]},{...template,id:'tie-a',name:'A zero',group:'Test group',values:[0,0,0,0,0,0,0,0]});
 data.refreshError=null;
 await page.route('**/api/rainfall*',route=>route.fulfill({json:data}));
 await page.goto('/');
 await expect(page.locator('.station')).toHaveCount(data.stations.length);
 const expected=[...data.stations].sort((a,b)=>{const av=a.values.at(-1),bv=b.values.at(-1);return av===null?1:bv===null?-1:bv-av||a.name.localeCompare(b.name);}).map(s=>s.name);
 const names=()=>page.locator('.station').evaluateAll(elements=>elements.map(el=>[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE).textContent));
 expect(await names()).toEqual(expected);
 for(const id of new Set(cases.map(c=>c[1]))){
  await page.locator('#rainFilter').selectOption(id);
  const filtered=cases.flatMap(([value,band],i)=>band===id?[`Test ${i}`]:[]);
  if(id==='green')filtered.push('A zero','Z zero');
  expect((await names()).sort()).toEqual(filtered.sort());
 }
 await page.locator('#rainFilter').selectOption('all');
 await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeEnabled();
 expect(await names()).toEqual(expected);
 await page.locator('#search').fill('Test 19');await page.locator('.station').click();
 const point=page.locator('.leaflet-interactive');await expect(point).toHaveAttribute('fill','#122e67');
 expect(await page.locator('#hyetograph').evaluate(c=>Chart.getChart(c).data.datasets[0].backgroundColor.at(-1))).toBe('#122e67');
 await page.locator('.settings > summary').click();await expect(page.locator('#thresholdInputs input')).toHaveCount(9);
 await page.locator('#t9').fill('250');await page.getByRole('button',{name:'Apply',exact:true}).click();
 await expect(point).toHaveAttribute('fill','#2c64cc');
 await expect(page.locator('#legend')).toContainText('>180–250');await expect(page.locator('#legend')).toContainText('>250');
 await page.locator('#rainFilter').selectOption('blue');await expect(page.locator('.station')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'test-results/extended-bands-mobile.png',fullPage:true});
});
