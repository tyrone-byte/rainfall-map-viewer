'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const time=iso=>iso?new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' AEST':'Unavailable';
const duration=m=>m<60?`${m} min`:`${m/60} h`;
const map=L.map('map',{scrollWheelZoom:true}).setView([-22.5,145.5],5),pins=L.featureGroup().addTo(map);MapBackgrounds.attach(map,$('background'));
let data=null,point=null,pointError=null,version=0,controller,pointCache=null;
const unique=(rows,key)=>[...new Map((rows||[]).map(s=>[key(s),s])).values()];
const rainKey=s=>s.stationNumber||s.id;
function link(s,kind,end){const q=new URLSearchParams({basin:s.basinId,gauge:s.id,end,minutes:kind==='rain'?data.minutes:1440});if(kind==='ifd')q.set('mode','wettest');return `${kind==='ifd'?'/point-ifd':'/history'}?${q}`;}
const stale=result=>!!result?.end&&(Date.now()-Date.parse(result.end)>3600000||result.extent?.source?.status!=='ok'||!result.extent?.source?.checked_at||Date.now()-Date.parse(result.extent.source.checked_at)>1800000);
function feed(id,result){const target=$(id);target.classList.remove('stale');if(!result?.available||!result.end){target.textContent='Saved feed unavailable';return;}const isStale=stale(result);target.textContent=`${time(result.start)} – ${time(result.end)}${isStale?' · STALE / check collector':''}`;target.classList.toggle('stale',isStale);}
function addStat(value,label,note){const box=el('a');box.href='#'+(label.includes('point AEP')?'aepHeading':'rainHeading');box.className='summary-stat';box.append(el('strong',value),el('span',label),el('small',note));$('headline').append(box);}
function row(host,s,kind,headline,detail,end){const a=el('a');a.className='summary-row';a.href=link(s,kind,end);a.append(el('strong',s.name),el('b',headline),el('small',detail),el('small',`${s.group||s.basinId} · Explore gauge →`));$(host).append(a);}
function marker(s,kind,title,detail,end,colour){if(!s.coordinates)return;const at=[s.coordinates.lat,s.coordinates.lon],popup=el('div');popup.append(el('strong',s.name),el('p',title),el('small',detail));const a=el('a','Explore gauge →');a.href=link(s,kind,end);popup.append(a);const m=L.circleMarker(at,{radius:7,color:'#fff',weight:1.5,fillColor:colour,fillOpacity:.95});m.addTo(pins).bindTooltip(`${s.name} · ${title} · ${duration(kind==='ifd'?s.pointIFD.minutes:data.minutes)}`,{className:'compact-gauge-tooltip'}).bindPopup(popup);}
function empty(id,message){$(id).append(el('p',message));}
function fit(){if(pins.getLayers().length)map.fitBounds(pins.getBounds().pad(.15),{maxZoom:11,animate:false});}
function render(refit=false){
 if(!data)return;for(const id of ['headline','rainList','aepList'])$(id).replaceChildren();pins.clearLayers();
 const rain=unique(data.rainfall?.stations,rainKey),aeps=unique(point?.stations,rainKey),byRain=new Map(aeps.map(s=>[rainKey(s),s]));
 const complete=rain.filter(s=>s.complete&&Number.isFinite(s.depth)),assessed=aeps.filter(s=>Number.isFinite(s.pointIFD?.aep));
 const wet=complete.filter(s=>s.depth>=Number($('rainLimit').value)).sort((a,b)=>b.depth-a.depth);
 const rare=assessed.filter(s=>s.pointIFD.aep<=Number($('aepLimit').value)&&s.pointIFD.bound!=='above').sort((a,b)=>a.pointIFD.aep-b.pointIFD.aep||b.pointIFD.ratio-a.pointIFD.ratio);
 addStat(data.rainfall?.available&&complete.length?wet.length:'—',`gauges ≥ ${$('rainLimit').value} mm`,`${data.minutes/1440} day${data.minutes===1440?'':'s'} · ${complete.length} complete totals${stale(data.rainfall)?' · STALE':''}`);
 addStat(point&&assessed.length?rare.length:'—',`gauges ≤ ${$('aepLimit').value}% point AEP`,'Latest saved 24 hours · all durations'+(stale(data.pointRainfall)?' · STALE':''));
 feed('rainTime',data.rainfall);feed('aepTime',data.pointRainfall);
 $('rainCoverage').textContent=`Rainfall: ${complete.length} complete totals out of ${rain.length} distinct catalogue gauges. Incomplete totals are excluded, not filled with zeros.`;
 $('aepCoverage').textContent=pointError?`Point AEP unavailable: ${pointError}`:`Point AEP: ${assessed.length} assessed, ${aeps.length-assessed.length} unavailable. ${assessed.filter(s=>s.pointIFD.partial).length} have incomplete 24-hour coverage; only complete subwindows are compared.`;
 for(const s of wet.slice(0,10)){const p=byRain.get(rainKey(s)),aep=p?PointRainfallIFD.label(p.pointIFD):'AEP unavailable';row('rainList',s,'rain',`${s.depth.toFixed(1)} mm`,`${data.minutes/1440} day total · ${aep} (latest 24 h)`,data.rainfall.end);}
 for(const s of rare.slice(0,10)){const p=s.pointIFD;row('aepList',s,'ifd',PointRainfallIFD.label(p),`${duration(p.minutes)} · ${p.depth.toFixed(1)} mm · ending ${time(p.end)}${p.partial?' · incomplete 24 h coverage':''} · ${s.ifdRegion}`,data.pointRainfall.end);}
 if(!wet.length)empty('rainList',data.rainfall?.available?(complete.length?'No complete saved total meets the selected display threshold.':'No complete rainfall totals available for this window.'):'Rainfall totals unavailable.');
 if(!rare.length)empty('aepList',point?(assessed.length?'No assessed gauge meets the selected AEP threshold.':'No gauge could be assessed for point AEP.'):'Point AEP assessment unavailable.');
 for(const [id,rows] of [['rainList',wet],['aepList',rare]])if(rows.length>10)$(id).append(el('small',`Showing the top 10 of ${rows.length} flagged gauges; all located flags appear on the map.`));
 const flagged=new Map(wet.map(s=>[rainKey(s),{s,kind:'rain'}]));for(const s of rare)flagged.set(rainKey(s),{s,kind:'ifd'});
 for(const {s,kind} of flagged.values()){const p=byRain.get(rainKey(s))?.pointIFD;marker(s,kind,kind==='rain'?`${s.depth.toFixed(1)} mm`:PointRainfallIFD.label(p),p?`${duration(p.minutes)} · ${p.depth.toFixed(1)} mm · ${PointRainfallIFD.label(p)}`:'Point AEP unavailable',kind==='rain'?data.rainfall.end:data.pointRainfall.end,Number.isFinite(p?.aep)?PointRainfallIFD.colour(p):'#2779b4');}
 if(refit)fit();$('loadStatus').textContent=`Saved summary loaded · ${time(data.generatedAt)}. Flags are screening aids; follow a gauge to investigate.`;
}
function preparePoint(result,signal){
 return new Promise((resolve,reject)=>{
  const worker=new Worker('/storm-ifd-worker.js?v=1');
  const timer=setTimeout(()=>done(new Error('Point AEP calculation timed out; rainfall totals remain available.')),45000);
  function done(error,value){clearTimeout(timer);worker.terminate();signal.removeEventListener('abort',abort);error?reject(error):resolve(value);}
  function abort(){done(new DOMException('Cancelled','AbortError'));}
  signal.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>done(event.data.error?new Error(event.data.error):null,event.data.result);
  worker.onerror=()=>done(new Error('Background point AEP assessment unavailable'));
  if(signal.aborted){abort();return;}worker.postMessage(result);
 });
}
async function fetchSummary(signal){
 const request=new AbortController();let timedOut=false;
 const abort=()=>request.abort();signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>{timedOut=true;request.abort();},20000);
 try{
  if(signal.aborted)request.abort();
  const response=await fetch('/api/storm-summary?minutes='+$('lookback').value,{signal:request.signal,cache:'no-store'});
  if(!response.ok)throw new Error('Summary request failed');
  return await response.json();
 }catch(error){if(timedOut)throw new Error('Saved rainfall query timed out. Please retry.');throw error;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
async function load(){
 const run=++version;controller?.abort();controller=new AbortController();
 $('refresh').disabled=true;$('loadStatus').textContent='Loading saved rainfall summary…';
 try{
  const result=await fetchSummary(controller.signal);if(run!==version)return;
  data=result;point=null;pointError=null;render(true);
  if(data.pointRainfall?.available&&data.pointRainfall.periods?.length){
   const signature=JSON.stringify(data.pointRainfall);
   if(pointCache?.signature===signature)point=pointCache.result;
   else{
    $('loadStatus').textContent='Rainfall totals loaded. Assessing point rainfall AEPs in the background…';
    try{
     const prepared=await preparePoint(data.pointRainfall,controller.signal);if(run!==version)return;
     point=prepared;pointCache={signature,result:prepared};
    }catch(error){if(run!==version)return;pointError=error.message;}
   }
  }else pointError='Saved quarter-hour rainfall unavailable';
  render(true);
 }catch(error){
  if(error.name!=='AbortError'&&run===version){
   data=null;point=null;pins.clearLayers();for(const id of ['headline','rainList','aepList'])$(id).replaceChildren();
   $('loadStatus').textContent=error.message.includes('timed out')?error.message:'Could not load the storm summary. Please retry; no current assessment is available.';
   for(const id of ['rainTime','aepTime','rainCoverage','aepCoverage'])$(id).textContent='Unavailable';
  }
 }finally{if(run===version)$('refresh').disabled=false;}
}
$('refresh').onclick=load;$('lookback').onchange=load;$('rainLimit').onchange=()=>render(true);$('aepLimit').onchange=()=>render(true);$('fit').onclick=fit;load();
