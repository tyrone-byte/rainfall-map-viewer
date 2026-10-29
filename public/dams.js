'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
 const date = t => new Date(t).toLocaleString('en-AU', {timeZone:'Australia/Brisbane',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
 const local = t => new Date(Date.parse(t)+36000000).toISOString().slice(0,16);
 const number = v => Number.isFinite(v) ? v.toLocaleString('en-AU') : 'Not supplied';
 const map = L.map('map', {scrollWheelZoom:false}).setView([-23,147],5);
 SharedMapView.attach(map); MapBackgrounds.attach(map,$('background'));
 const damsLayer=L.layerGroup().addTo(map), gaugeLayer=L.layerGroup().addTo(map), areaLayer=L.layerGroup().addTo(map), streamsLayer=L.layerGroup().addTo(map);
 map.attributionControl.addAttribution('Water plans / watercourses © The State of Queensland 2025 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
 let catalogue, boundaryIndex, chosen=null, nearest=null, boundary=null, row=null, chart=null, ending=null;
 let selectionVersion=0, loadVersion=0, detailVersion=0, controller, detailController;
 async function json(url,signal) {
  const response=await fetch(url,{signal}); if(!response.ok) throw Error('Request failed');
  const data=await response.json(); if(data.available===false) throw Error('Saved observations unavailable'); return data;
 }
 function clearPlot() { detailVersion++; detailController?.abort(); chart?.destroy(); chart=null; $('plot').replaceChildren(el('h2','Nearest water-level gauge'),el('p','Choose a dam to view its nearest mapped gauge.')); }
 function options() {
  const keep=$('dam').value;
  $('dam').replaceChildren(new Option('Choose a dam…',''),...catalogue.dams.filter(d=>!$('owner').value||d.owner===$('owner').value).map(d=>new Option(d.name,d.id)));
  if([...$('dam').options].some(o=>o.value===keep)) $('dam').value=keep; else reset();
 }
 function reset() {
  chosen=null; nearest=null; boundary=null; row=null; selectionVersion++; loadVersion++; controller?.abort();
  clearPlot(); gaugeLayer.clearLayers(); areaLayer.clearLayers(); streamsLayer.clearLayers(); $('gauges').replaceChildren();
  $('damName').textContent='Choose a dam to begin'; $('damInfo').replaceChildren(); $('gaugeNote').textContent='';
  $('boundaryNote').textContent='The water-plan boundary and named watercourses provide geographic context.';
  $('streamStatus').textContent=''; $('status').textContent='Choose a dam to load its nearest water-level gauge.';
  for(const id of ['apply','latest','previous','next']) $(id).disabled=true;
 }
 function fit() {
  if(!chosen) return;
  const bounds=L.featureGroup(areaLayer.getLayers()).getBounds(); bounds.extend([chosen.lat,chosen.lon]);
  if(nearest) bounds.extend([nearest.coordinates.lat,nearest.coordinates.lon]);
  map.fitBounds(bounds.pad(.08),{padding:[20,20],maxZoom:13,animate:false});
 }
 function metric(label,value) { const item=el('div'); item.append(el('dt',label),el('dd',value)); $('damInfo').append(item); }
 function selectDam(id) {
  chosen=catalogue.dams.find(d=>d.id===id); if(!chosen) {reset();return;}
  const sequence=++selectionVersion; boundary=boundaryIndex.dams[id]||null;
  nearest=catalogue.water.find(g=>g.id===chosen.nearestWaterGauge?.id&&g.basinId===chosen.nearestWaterGauge?.basinId)||null;
  $('dam').value=id; $('damName').textContent=chosen.name; $('damInfo').replaceChildren();
  metric('Owner',chosen.owner); metric('Surface area at full supply',`${number(chosen.surfaceAreaFSL)}${chosen.surfaceAreaUnit?' '+chosen.surfaceAreaUnit:''}`);
  metric('Full supply volume',`${number(chosen.fullSupplyVolume)}${chosen.fullSupplyVolumeUnit?' '+chosen.fullSupplyVolumeUnit:''}`);
  metric('Supplied catchment area',`${number(chosen.catchmentAreaHa/100)} km²`);
  metric('Water-plan subcatchment / catchment',boundary?.title||'No match in supplied extract');
  metric('Water plan',boundary?.waterplan||'Not identified');
  $('gaugeNote').textContent=nearest?`Nearest mapped gauge: ${nearest.name} · ${chosen.nearestWaterGauge.distanceKm.toFixed(2)} km from dam coordinates. Storage-level association not verified.`:'No mapped water-level gauge available.';
  $('boundaryNote').textContent=boundary?`Water-plan area: ${boundary.title} · ${boundary.waterplan}. Geographic context, not a verified upstream dam catchment.`:boundaryIndex.unavailable?'Water-plan boundaries could not be loaded. The nearest gauge remains available.':'No containing water-plan boundary in this extract. The nearest gauge remains available.';
  areaLayer.clearLayers(); streamsLayer.clearLayers(); fit();
  for(const key of ['apply','latest','previous','next']) $(key).disabled=!nearest;
  if(boundary) json(`/dam-boundaries/${boundary.id}.geojson`).then(feature=>{
   if(sequence!==selectionVersion)return;
   L.geoJSON(feature,{interactive:false,style:{color:'#446d85',weight:2,fillColor:'#709bb3',fillOpacity:.09}}).addTo(areaLayer); fit();
  }).catch(()=>{if(sequence===selectionVersion)$('boundaryNote').textContent+=' Boundary outline unavailable.';});
  $('streamStatus').textContent='Loading named watercourses…';
  json(`/dam-watercourses/${chosen.id}.geojson`).then(data=>{
   if(sequence!==selectionVersion)return;
   L.geoJSON(data,{style:{color:'#337eae',weight:2,opacity:.8},onEachFeature:(feature,layer)=>layer.bindTooltip(el('span',feature.properties.name))}).addTo(streamsLayer);
   $('streamStatus').textContent=`${data.features.length} mapped river / larger-creek sections. Unnamed tributaries and gullies omitted.`;
  }).catch(()=>{if(sequence===selectionVersion)$('streamStatus').textContent='Watercourse context could not be loaded. Gauge observations remain available.';});
  load();
 }
 function value(r) {return r.level===null?'No reading':`${r.level.toFixed(2)} m ${r.datum||''}`;}
 function draw() {
  gaugeLayer.clearLayers(); $('gauges').replaceChildren(); if(!row)return;
  const button=el('button',`■ ${row.name} · ${value(row)}`); button.onclick=()=>plot(row,true); $('gauges').append(button);
  const icon=el('div'); icon.className='dam-square'; icon.style.setProperty('--point-colour',{rising:'#d94843',falling:'#2875bb',steady:'#239b88'}[row.direction]||'#88969c');
  L.marker([row.coordinates.lat,row.coordinates.lon],{icon:L.divIcon({html:icon,className:'',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(gaugeLayer).bindTooltip(el('span',`${row.name} · ${value(row)}`)).on('click',()=>plot(row,true));
 }
 async function load() {
  if(!chosen)return; const version=++loadVersion; controller?.abort(); controller=new AbortController(); const signal=controller.signal;
  row=null;draw();clearPlot();if(!nearest){$('status').textContent='No mapped water-level gauge available.';return;}
  $('status').textContent='Loading the nearest gauge’s saved observations…';
  try {
   const extent=await json('/api/archive-water/extent',signal);if(version!==loadVersion)return;
   if(!extent.lastEnd)throw Error('No saved water observations');
   const latest=Math.floor(Date.parse(extent.lastEnd)/60000)*60000;
   const requested=$('ending').value?Date.parse($('ending').value+'+10:00'):latest;
   ending=new Date(Math.min(requested,latest)).toISOString();$('ending').value=local(ending);
   const minutes=Number($('duration').value);
   const frame=await json(`/api/archive-water/frame?basin=${encodeURIComponent(nearest.basinId)}&end=${encodeURIComponent(ending)}&minutes=${minutes}`,signal);
   if(version!==loadVersion)return;
   row=frame.stations.find(s=>s.id===nearest.id)||{...nearest,level:null,datum:'Unspecified',direction:null};draw();
   $('status').textContent=`Nearest gauge · ${minutes/60} hours ending ${date(ending)} AEST${row.observedAt?' · Last reading '+date(row.observedAt)+' AEST':''}`;
   await plot(row,false);
  }catch(error){if(version===loadVersion&&error.name!=='AbortError')$('status').textContent='Saved water observations could not be loaded. Try Update observations.';}
 }
 function appendBomLinks(host,station) {
  const links=el('div');links.className='bom-check-links';host.append(links);
  function populate(source) {
   links.replaceChildren();
   for(const [path,label] of [[source.plotPath,'Open BoM plot'],[source.historyPath,'Open BoM observation table']]) {
    if(!path||!/^\/fwo\/IDQ\d+\/IDQ\d+\.\d{6}\.(?:plt|tbl)\.shtml$/.test(path)||!path.includes(`.${station.id}.`))continue;
    const link=el('a',label);link.href='https://reg.bom.gov.au'+path;link.target='_blank';link.rel='noopener';links.append(link);
   }
   if(station.membershipSource&&/^https:\/\/(?:reg\.)?bom\.gov\.au\//.test(station.membershipSource)){const link=el('a','Open BoM group bulletin');link.href=station.membershipSource;link.target='_blank';link.rel='noopener';links.append(link);}
   if(!links.children.length)links.append(el('span','Direct BoM gauge link is not available in the catalogue.'));
  }
  populate(station);
  if(!station.plotPath)json(`/api/archive-water/links?gauge=${encodeURIComponent(station.id)}&basin=${encodeURIComponent(station.basinId)}`).then(result=>{if(links.isConnected)populate(result);}).catch(()=>{});
 }
 async function plot(station,reveal) {
  const version=++detailVersion,frameVersion=loadVersion;detailController?.abort();detailController=new AbortController();chart?.destroy();chart=null;
  $('plot').replaceChildren(el('h2',station.name),el('p',value(station)));appendBomLinks($('plot'),station);
  const full=el('a','Open full water-level viewer');full.href=`/water-history?basin=${encodeURIComponent(station.basinId)}&gauge=${encodeURIComponent(station.id)}&minutes=${$('duration').value}&end=${encodeURIComponent(ending)}`;$('plot').append(full);
  const message=el('p','Loading recorded observations…');$('plot').append(message);
  try {
   const minutes=Number($('duration').value),data=await json(`/api/archive-water/series?gauge=${encodeURIComponent(station.id)}&end=${encodeURIComponent(ending)}&minutes=${minutes}`,detailController.signal);
   if(version!==detailVersion||frameVersion!==loadVersion)return;
   const points=data.observations||[],values=[];let previous=null;
   for(const point of points){if(previous&&(Date.parse(point.time)-Date.parse(previous.time)>3600000||point.datum!==previous.datum))values.push({x:(Date.parse(point.time)+Date.parse(previous.time))/2,y:null});values.push({x:Date.parse(point.time),y:point.datum===station.datum?point.level:null});previous=point;}
   message.textContent=`Recorded water levels · ${station.datum}. Missing readings, datum changes and gaps over 60 minutes break the line.`;
   if(!values.some(p=>p.y!==null)){message.textContent='No numeric observations for this gauge and datum in the selected window.';return;}
   const host=el('div');host.className='chart';const canvas=el('canvas');canvas.setAttribute('aria-label',`${station.name} recorded water levels`);canvas.setAttribute('role','img');host.append(canvas);$('plot').append(host);
   chart=new Chart(canvas,{type:'line',data:{datasets:[{label:`Water level · m ${station.datum}`,data:values,borderColor:'#229887',pointRadius:2,spanGaps:false}]},options:{animation:false,maintainAspectRatio:false,scales:{x:{type:'linear',min:Date.parse(ending)-minutes*60000,max:Date.parse(ending),ticks:{maxTicksLimit:6,callback:t=>date(t)}}},plugins:{tooltip:{callbacks:{title:items=>date(items[0].parsed.x)+' AEST'}}}}});
   if(reveal&&matchMedia('(max-width:850px)').matches)$('plot').scrollIntoView({block:'start'});
  }catch(error){if(version===detailVersion&&error.name!=='AbortError')message.textContent='Could not load this gauge’s recorded observations. Try Update observations.';}
 }
 $('owner').onchange=options;$('dam').onchange=()=>selectDam($('dam').value);$('fit').onclick=fit;$('apply').onclick=load;$('duration').onchange=load;$('ending').onchange=load;
 $('streams').onchange=()=>{if($('streams').checked)streamsLayer.addTo(map);else map.removeLayer(streamsLayer);};
 $('latest').onclick=()=>{$('ending').value='';load();};
 for(const [id,sign] of [['previous',-1],['next',1]])$(id).onclick=()=>{if(!ending)return;$('ending').value=local(new Date(Date.parse(ending)+sign*Number($('duration').value)*60000).toISOString());load();};
 Promise.all([json('/dams-catalogue.json'),json('/dam-boundaries.json').catch(()=>({dams:{},unavailable:true}))]).then(([data,index])=>{
  catalogue=data;boundaryIndex=index;options();
  for(const dam of data.dams)L.marker([dam.lat,dam.lon]).addTo(damsLayer).bindTooltip(el('span',`${dam.name} · ${dam.owner}`)).on('click',()=>{$('owner').value='';options();selectDam(dam.id);});
  $('status').textContent=`${data.dams.length} dams and storages. Choose a dam from the list or map.`;
 }).catch(()=>{$('status').textContent='Dam catalogue could not be loaded. Please refresh.';});
})();
