'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const time=iso=>iso?new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' AEST':'Unavailable';
const duration=m=>m<60?`${m} min`:`${m/60} h`,floodColours={minor:'#d5ad20',moderate:'#e77f25',major:'#c73546'},rank={below:0,minor:1,moderate:2,major:3};
const map=L.map('map',{scrollWheelZoom:true}).setView([-22.5,145.5],5),pins=L.featureGroup().addTo(map);MapBackgrounds.attach(map,$('background'));
let data=null,point=null,pointError=null,version=0,controller;
const unique=(rows,key)=>[...new Map((rows||[]).map(s=>[key(s),s])).values()];
const rainKey=s=>s.stationNumber||s.id;
function link(s,kind,end){const q=new URLSearchParams({basin:s.basinId,gauge:s.id,end,minutes:kind==='water'?data.minutes:kind==='rain'?data.minutes:1440});if(kind==='ifd')q.set('mode','wettest');return `${kind==='water'?'/water-history':kind==='ifd'?'/point-ifd':'/history'}?${q}`;}
const stale=result=>!!result?.end&&(Date.now()-Date.parse(result.end)>3600000||result.extent?.source?.status!=='ok'||!result.extent?.source?.checked_at||Date.now()-Date.parse(result.extent.source.checked_at)>1800000);
function feed(id,result){const target=$(id);target.classList.remove('stale');if(!result?.available||!result.end){target.textContent='Saved feed unavailable';return;}const isStale=stale(result);target.textContent=`${time(result.start)} – ${time(result.end)}${isStale?' · STALE / check collector':''}`;target.classList.toggle('stale',isStale);}
function addStat(value,label,note){const box=el('a');box.href='#'+({rain:'rainHeading',aep:'aepHeading',flood:'waterHeading'})[label.includes('point AEP')?'aep':label.includes('major flood')?'flood':'rain'];box.className='summary-stat';box.append(el('strong',value),el('span',label),el('small',note));$('headline').append(box);}
function row(host,s,kind,headline,detail,end){const a=el('a');a.className='summary-row';a.href=link(s,kind,end);a.append(el('strong',s.name),el('b',headline),el('small',detail),el('small',`${s.group||s.basinId} · Explore gauge →`));$(host).append(a);}
function marker(s,kind,title,detail,end,colour){if(!s.coordinates)return;const at=[s.coordinates.lat,s.coordinates.lon],popup=el('div');popup.append(el('strong',s.name),el('p',title),el('small',detail));const a=el('a','Explore gauge →');a.href=link(s,kind,end);popup.append(a);const m=kind==='water'?L.marker(at,{icon:L.divIcon({className:'summary-flood-marker',html:'',iconSize:[13,13]})}):L.circleMarker(at,{radius:7,color:'#fff',weight:1.5,fillColor:colour,fillOpacity:.95});m.addTo(pins).bindTooltip(`${s.name} · ${title} · ${duration(kind==='ifd'?s.pointIFD.minutes:data.minutes)}${kind==='water'?' view':''}`,{className:'compact-gauge-tooltip'}).bindPopup(popup);if(kind==='water')m.getElement().style.background=colour;}
function empty(id,message){$(id).append(el('p',message));}
function fit(){if(pins.getLayers().length)map.fitBounds(pins.getBounds().pad(.15),{maxZoom:11,animate:false});}
function render(refit=false){
 if(!data)return;for(const id of ['headline','rainList','aepList','waterList'])$(id).replaceChildren();pins.clearLayers();
 const rain=unique(data.rainfall?.stations,rainKey),aeps=unique(point?.stations,rainKey),water=unique(data.water?.stations,s=>s.id),byRain=new Map(aeps.map(s=>[rainKey(s),s]));
 const complete=rain.filter(s=>s.complete&&Number.isFinite(s.depth)),assessed=aeps.filter(s=>Number.isFinite(s.pointIFD?.aep)),known=water.filter(s=>s.assessedSamples>0);
 const wet=complete.filter(s=>s.depth>=Number($('rainLimit').value)).sort((a,b)=>b.depth-a.depth);
 const rare=assessed.filter(s=>s.pointIFD.aep<=Number($('aepLimit').value)&&s.pointIFD.bound!=='above').sort((a,b)=>a.pointIFD.aep-b.pointIFD.aep||b.pointIFD.ratio-a.pointIFD.ratio);
 const flooded=known.filter(s=>rank[s.peakFlood?.category]>0).sort((a,b)=>rank[b.peakFlood.category]-rank[a.peakFlood.category]||Date.parse(b.peakFlood.observedAt)-Date.parse(a.peakFlood.observedAt));
 const major=flooded.filter(s=>s.peakFlood.category==='major').length;
 addStat(data.rainfall?.available&&complete.length?wet.length:'—',`gauges ≥ ${$('rainLimit').value} mm`,`${data.minutes/1440} day${data.minutes===1440?'':'s'} · ${complete.length} complete totals${stale(data.rainfall)?' · STALE':''}`);
 addStat(point&&assessed.length?rare.length:'—',`gauges ≤ ${$('aepLimit').value}% point AEP`,'Latest saved 24 hours · all durations'+(stale(data.pointRainfall)?' · STALE':''));
 addStat(data.water?.available&&known.length?major:'—','gauges reached major flood',`${known.length} assessed · ${water.length-known.length} unassessed${stale(data.water)?' · STALE':''}`);
 feed('rainTime',data.rainfall);feed('aepTime',data.pointRainfall);feed('waterTime',data.water);
 $('floodCoverage').textContent=!data.water?.available?'Water-level archive unavailable; flood status unknown.':!known.length?'Flood status unavailable: no observations could be assessed against matching published thresholds. This does not mean no flooding occurred.':`${known.length} gauges assessed for at least one reading; ${water.length-known.length} unassessed. ${known.filter(s=>s.assessedSamples<s.sampleCount).length} assessed gauges have additional readings with unknown classification. Missing observations may hide peaks.`;
 $('rainCoverage').textContent=`Rainfall: ${complete.length} complete totals out of ${rain.length} distinct catalogue gauges. Incomplete totals are excluded, not filled with zeros.`;
 $('aepCoverage').textContent=pointError?`Point AEP unavailable: ${pointError}`:`Point AEP: ${assessed.length} assessed, ${aeps.length-assessed.length} unavailable. ${assessed.filter(s=>s.pointIFD.partial).length} have incomplete 24-hour coverage; only complete subwindows are compared.`;
 for(const s of wet.slice(0,10)){const p=byRain.get(rainKey(s)),aep=p?PointRainfallIFD.label(p.pointIFD):'AEP unavailable';row('rainList',s,'rain',`${s.depth.toFixed(1)} mm`,`${data.minutes/1440} day total · ${aep} (latest 24 h)`,data.rainfall.end);}
 for(const s of rare.slice(0,10)){const p=s.pointIFD;row('aepList',s,'ifd',PointRainfallIFD.label(p),`${duration(p.minutes)} · ${p.depth.toFixed(1)} mm · ending ${time(p.end)}${p.partial?' · incomplete 24 h coverage':''} · ${s.ifdRegion}`,data.pointRainfall.end);}
 for(const s of flooded.slice(0,10)){const p=s.peakFlood;row('waterList',s,'water',`${p.category.toUpperCase()} reached`,`${p.level.toFixed(2)} m ${p.datum} at ${time(p.observedAt)} · latest: ${s.currentFlood.category==='unknown'?'unassessed':s.currentFlood.category} (${time(s.observedAt)})`,data.water.end);}
 if(!wet.length)empty('rainList',data.rainfall?.available?(complete.length?'No complete saved total meets the selected display threshold.':'No complete rainfall totals available for this window.'):'Rainfall totals unavailable.');
 if(!rare.length)empty('aepList',point?(assessed.length?'No assessed gauge meets the selected AEP threshold.':'No gauge could be assessed for point AEP.'):'Point AEP assessment unavailable.');
 if(!flooded.length)empty('waterList',known.length?'No assessed reading reached minor, moderate or major flood. Unassessed gauges remain unknown.':'Published flood levels are needed before flooding can be assessed.');
 for(const [id,rows] of [['rainList',wet],['aepList',rare],['waterList',flooded]])if(rows.length>10)$(id).append(el('small',`Showing the top 10 of ${rows.length} flagged gauges; all located flags appear on the map.`));
 const flagged=new Map(wet.map(s=>[rainKey(s),{s,kind:'rain'}]));for(const s of rare)flagged.set(rainKey(s),{s,kind:'ifd'});
 for(const {s,kind} of flagged.values()){const p=byRain.get(rainKey(s))?.pointIFD;marker(s,kind,kind==='rain'?`${s.depth.toFixed(1)} mm`:PointRainfallIFD.label(p),p?`${duration(p.minutes)} · ${p.depth.toFixed(1)} mm · ${PointRainfallIFD.label(p)}`:'Point AEP unavailable',kind==='rain'?data.rainfall.end:data.pointRainfall.end,Number.isFinite(p?.aep)?PointRainfallIFD.colour(p):'#2779b4');}
 for(const s of flooded)marker(s,'water',`${s.peakFlood.category.toUpperCase()} reached`,`${s.peakFlood.level.toFixed(2)} m ${s.peakFlood.datum} · ${time(s.peakFlood.observedAt)}`,data.water.end,floodColours[s.peakFlood.category]);
 if(refit)fit();$('loadStatus').textContent=`Saved summary loaded · ${time(data.generatedAt)}. Flags are screening aids; follow a gauge to investigate.`;
}
function preparePoint(result,signal){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('/storm-ifd-worker.js?v=1');
  function done(error,value){worker.terminate();signal.removeEventListener('abort',abort);error?reject(error):resolve(value);}
  function abort(){done(new DOMException('Cancelled','AbortError'));}
  signal.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>done(event.data.error?new Error(event.data.error):null,event.data.result);
  worker.onerror=()=>done(new Error('Background point AEP assessment unavailable'));
  if(signal.aborted){abort();return;}worker.postMessage(result);
 });
}
async function load(){const run=++version;controller?.abort();controller=new AbortController();$('refresh').disabled=true;$('loadStatus').textContent='Loading saved storm summary…';try{const r=await fetch('/api/storm-summary?minutes='+$('lookback').value,{signal:controller.signal,cache:'no-store'});if(!r.ok)throw new Error('Summary request failed');const result=await r.json();if(run!==version)return;data=result;point=null;pointError=null;render(true);$('loadStatus').textContent='Assessing point rainfall AEPs…';if(data.pointRainfall?.available&&data.pointRainfall.periods?.length){try{const prepared=await preparePoint(data.pointRainfall,controller.signal);if(run!==version)return;point=prepared;}catch(e){if(run!==version)return;pointError=e.message;}}else pointError='Saved quarter-hour rainfall unavailable';render(true);}catch(e){if(e.name!=='AbortError'&&run===version){data=null;point=null;pins.clearLayers();for(const id of ['headline','rainList','aepList','waterList'])$(id).replaceChildren();$('loadStatus').textContent='Could not load the storm summary. Please retry; no current assessment is available.';for(const id of ['rainTime','aepTime','waterTime','floodCoverage','rainCoverage','aepCoverage'])$(id).textContent='Unavailable';}}finally{if(run===version)$('refresh').disabled=false;}}
$('refresh').onclick=load;$('lookback').onchange=load;$('rainLimit').onchange=()=>render(true);$('aepLimit').onchange=()=>render(true);$('fit').onclick=fit;load();
