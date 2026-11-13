/* Local browser benchmark: saved geometry, no production database required. */
const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();await page.goto(new URL('/history',process.env.TEST_BASE_URL||'http://127.0.0.1:8000').href);await page.waitForFunction(()=>window.L);
const result=await page.evaluate(async()=>{
 const index=await (await fetch('/map-context/index.json')).json(),entry=index.entries.find(e=>e.file==='streams/152_-28.geojson'),url='/map-context/'+entry.file+'?v='+index.assetVersion;
 performance.clearResourceTimings();const first=await fetch(url),text=await first.text();await(await fetch(url)).text();const transfers=performance.getEntriesByName(new URL(url,location.href).href).map(e=>e.transferSize);
 const parsed=performance.now(),geo=JSON.parse(text),parseMs=performance.now()-parsed,results={};
 for(const type of ['svg','canvas']){const host=document.createElement('div');host.style='position:fixed;inset:0;width:800px;height:600px;background:white;z-index:9999';document.body.append(host);const m=L.map(host,{zoomControl:false,attributionControl:false}).setView([-27.5,152.5],9);const start=performance.now(),renderer=type==='svg'?L.svg():L.canvas(),layer=L.geoJSON(geo,{renderer,interactive:false}).addTo(m);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));results[type]={renderMs:Math.round((performance.now()-start)*10)/10,paths:host.querySelectorAll('path').length,canvases:host.querySelectorAll('canvas').length,features:layer.getLayers().length};m.remove();host.remove();}
 return {file:entry.file,bytes:text.length,parseMs:Math.round(parseMs*10)/10,transferBytes:transfers,cacheControl:first.headers.get('cache-control'),results};
});console.log(JSON.stringify(result,null,2));await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
