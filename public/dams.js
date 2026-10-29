'use strict';
(() => {
 const $ = id => document.getElementById(id);
 const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
 const date = t => new Date(t).toLocaleString('en-AU', {timeZone:'Australia/Brisbane',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
 const local = t => new Date(Date.parse(t)+36000000).toISOString().slice(0,16);
 const number = v => Number.isFinite(v) ? v.toLocaleString('en-AU') : 'Not supplied';
 const map = L.map('map', {scrollWheelZoom:false,touchZoom:'center'}).setView([-23,147],5);
 SharedMapView.attach(map); MapBackgrounds.attach(map,$('background'));
 const damsLayer=L.layerGroup().addTo(map), gaugeLayer=L.layerGroup().addTo(map), areaLayer=L.layerGroup().addTo(map), streamsLayer=L.layerGroup().addTo(map);
 map.attributionControl.addAttribution('Water plans / watercourses © The State of Queensland 2025 · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>');
 const waterwayLabels=L.layerGroup().addTo(map),damNameLabels=L.layerGroup().addTo(map);
 let watercourseFeatures=[],stations=[],selectedGauge=null;
 let catalogue, boundaryIndex, chosen=null, nearest=null, boundary=null, row=null, chart=null, ending=null;
 let selectionVersion=0, loadVersion=0, detailVersion=0, controller, detailController;
 // Keep zoom operations anchored to the selected dam, including zoom-at-pointer.
 const originalSetView=map.setView;
 map.setView=function(center,zoom,options){
  if(chosen&&zoom!==undefined&&zoom!==this.getZoom())center=[chosen.lat,chosen.lon];
  return originalSetView.call(this,center,zoom,options);
 };
 // Touch pinch can finish through Leaflet's animation path rather than setView.
 map.on('zoomend',()=>{
  if(chosen&&map.distance(map.getCenter(),[chosen.lat,chosen.lon])>.1)
   originalSetView.call(map,[chosen.lat,chosen.lon],map.getZoom(),{animate:false,reset:true});
 });
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
  chosen=null; nearest=null; boundary=null; row=null;stations=[];selectedGauge=null; selectionVersion++; loadVersion++; controller?.abort();
  clearPlot(); gaugeLayer.clearLayers(); areaLayer.clearLayers(); streamsLayer.clearLayers();waterwayLabels.clearLayers();watercourseFeatures=[];labelWaterways(); $('gauges').replaceChildren();
  $('damName').textContent='Choose a dam to begin'; $('damInfo').replaceChildren(); $('gaugeNote').textContent='';
  $('boundaryNote').textContent='The water-plan boundary and named watercourses provide geographic context.';
  $('streamStatus').textContent=''; $('status').textContent='Choose a dam to load its nearest water-level gauge.';
  for(const id of ['apply','latest','previous','next']) $(id).disabled=true;
 }
 function fit() {
  if(!chosen)return;
  const bounds=L.featureGroup(areaLayer.getLayers()).getBounds();bounds.extend([chosen.lat,chosen.lon]);
  if(nearest)bounds.extend([nearest.coordinates.lat,nearest.coordinates.lon]);
  const center=L.latLng(chosen.lat,chosen.lon),p=map.project(center,0);
  const corners=[map.project(bounds.getSouthWest(),0),map.project(bounds.getNorthEast(),0)];
  const span=L.point(Math.max(...corners.map(c=>Math.abs(c.x-p.x))),Math.max(...corners.map(c=>Math.abs(c.y-p.y))));
  const symmetric=L.latLngBounds(map.unproject(p.subtract(span),0),map.unproject(p.add(span),0));
  const zoom=Math.min(13,map.getBoundsZoom(symmetric.pad(.08),false,L.point(40,40)));
  map.setView(center,zoom,{animate:false,reset:true});
 }
 function metric(label,value) { const item=el('div'); item.append(el('dt',label),el('dd',value)); $('damInfo').append(item); }
 function selectDam(id) {
  chosen=catalogue.dams.find(d=>d.id===id); if(!chosen) {reset();return;}
  const sequence=++selectionVersion; boundary=boundaryIndex.dams[id]||null;selectedGauge=null;
  nearest=catalogue.water.find(g=>g.id===chosen.nearestWaterGauge?.id&&g.basinId===chosen.nearestWaterGauge?.basinId)||null;
  $('dam').value=id; $('damName').textContent=chosen.name; $('damInfo').replaceChildren();
  metric('Owner',chosen.owner); metric('Assumed surface area at full supply',`${number(chosen.surfaceAreaFSL)}${chosen.surfaceAreaUnit?' '+chosen.surfaceAreaUnit:''}`);
  metric('Assumed full supply volume',`${number(chosen.fullSupplyVolume)}${chosen.fullSupplyVolumeUnit?' '+chosen.fullSupplyVolumeUnit:''}`);
  metric('Assumed catchment area',`${number(chosen.catchmentAreaHa/100)} km²`);
  metric('Water-plan subcatchment / catchment',boundary?.title||'No match in supplied extract');
  metric('Water plan',boundary?.waterplan||'Not identified');
  $('gaugeNote').textContent=nearest?`Nearest mapped gauge: ${nearest.name} · ${chosen.nearestWaterGauge.distanceKm.toFixed(2)} km from dam coordinates. Storage-level association not verified.`:'No mapped water-level gauge available.';
  $('boundaryNote').textContent=boundary?`Water-plan area: ${boundary.title} · ${boundary.waterplan}. Geographic context, not a verified upstream dam catchment.`:boundaryIndex.unavailable?'Water-plan boundaries could not be loaded. The nearest gauge remains available.':'No containing water-plan boundary in this extract. The nearest gauge remains available.';
  areaLayer.clearLayers(); streamsLayer.clearLayers();waterwayLabels.clearLayers();watercourseFeatures=[];drawRainGauge(); fit();
  for(const key of ['apply','latest','previous','next']) $(key).disabled=!nearest;
  if(boundary) json(`/dam-boundaries/${boundary.id}.geojson`).then(feature=>{
   if(sequence!==selectionVersion)return;
   L.geoJSON(feature,{interactive:false,style:{color:'#446d85',weight:2,fillColor:'#709bb3',fillOpacity:.09}}).addTo(areaLayer); fit();
  }).catch(()=>{if(sequence===selectionVersion)$('boundaryNote').textContent+=' Boundary outline unavailable.';});
  $('streamStatus').textContent='Loading named watercourses…';
  json(`/dam-watercourses/${chosen.id}.geojson`).then(data=>{
   if(sequence!==selectionVersion)return;
   watercourseFeatures=data.features;
   L.geoJSON(data,{style:{color:'#337eae',weight:2,opacity:.8},onEachFeature:(feature,layer)=>layer.bindTooltip(el('span',feature.properties.name))}).addTo(streamsLayer);
   labelWaterways();
   $('streamStatus').textContent=`${data.features.length} mapped river / larger-creek sections. Unnamed tributaries and gullies omitted.`;
  }).catch(()=>{if(sequence===selectionVersion)$('streamStatus').textContent='Watercourse context could not be loaded. Gauge observations remain available.';});
  load();
 }
 function drawRainGauge() {
  $('gauges').replaceChildren();if(!chosen)return;
  const gauge=chosen.nearestRainGauge;
  if(!gauge){$('gauges').append(el('p','No mapped rainfall gauge available.'));return;}
  $('gauges').append(el('p',`${gauge.name} · ${gauge.distanceKm.toFixed(2)} km from dam coordinates`));
  const link=el('a','Open rainfall gauge');
  const query=new URLSearchParams({basin:gauge.basinId,gauge:gauge.id,minutes:$('duration').value});
  // Water readings can fall between rainfall's measured quarter-hour boundaries.
  if(ending)query.set('end',new Date(Math.floor(Date.parse(ending)/900000)*900000).toISOString());
  link.href='/history?'+query;link.target='_blank';link.rel='noopener';$('gauges').append(link);
 }
 function labelWaterways() {
  waterwayLabels.clearLayers();damNameLabels.clearLayers();
  const zoom=map.getZoom();if(zoom<11)return;
  const size=map.getSize(),occupied=[],limit=size.x<600?6:12;
  const fits=box=>box.left>=2&&box.right<=size.x-2&&box.top>=2&&box.bottom<=size.y-2&&!occupied.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top);
  // Dam labels use the earlier zoom threshold, in neutral text beside their pins.
  const dams=[...(catalogue?.dams||[])].sort((a,b)=>(b.id===chosen?.id)-(a.id===chosen?.id));
  for(const dam of dams){
   const p=map.latLngToContainerPoint([dam.lat,dam.lon]),width=Math.min(180,dam.name.length*6.5+14);
   if(p.x<0||p.y<0||p.x>size.x||p.y>size.y)continue;
   const boxes=[{left:p.x+14,right:p.x+14+width,top:p.y-12,bottom:p.y+10},{left:p.x-width-14,right:p.x-14,top:p.y-12,bottom:p.y+10}];
   const box=boxes.find(fits);if(!box)continue;
   const text=el('span',dam.name);text.className='dam-name-label';
   L.marker(map.containerPointToLatLng([box.left,box.top]),{interactive:false,keyboard:false,zIndexOffset:-100,icon:L.divIcon({html:text,className:'dam-name-label-anchor',iconSize:[width,22],iconAnchor:[0,0]})}).addTo(damNameLabels);
   occupied.push(box);if(occupied.length>=limit)break;
  }
  // Streams need a closer view, enough visible line for the name, and a local tangent.
  if(!chosen||!$('streams').checked||zoom<13)return;
  const byName=new Map();
  for(const feature of watercourseFeatures){
   const geometry=feature.geometry;
   const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
   for(const line of lines){
    const segments=[];let length=0;
    for(let i=1;i<line.length;i++){
     const a=map.latLngToContainerPoint([line[i-1][1],line[i-1][0]]),b=map.latLngToContainerPoint([line[i][1],line[i][0]]);
     const mid=a.add(b).divideBy(2),distance=a.distanceTo(b);
     if(!distance||mid.x<10||mid.y<12||mid.x>size.x-10||mid.y>size.y-12)continue;
     segments.push({a,b,distance});length+=distance;
    }
    const name=feature.properties.name,width=Math.min(180,name.length*6.5+14);
    if(length<Math.max(80,width+16))continue;
    function along(distance){let walked=0;for(const segment of segments){if(walked+segment.distance>=distance)return segment.a.add(segment.b.subtract(segment.a).multiplyBy((distance-walked)/segment.distance));walked+=segment.distance;}return segments.at(-1).b;}
    const anchor=along(length/2),before=along(Math.max(0,length/2-35)),after=along(Math.min(length,length/2+35));
    let angle=Math.atan2(after.y-before.y,after.x-before.x)*180/Math.PI;
    if(angle>90)angle-=180;if(angle< -90)angle+=180;
    if(byName.get(name)?.length>=length)continue;
    byName.set(name,{name,length,anchor,angle,width});
   }
  }
  let count=0;
  for(const candidate of [...byName.values()].sort((a,b)=>b.length-a.length)){
   const {width,angle,anchor:p}=candidate,radians=angle*Math.PI/180;
   const w=Math.abs(width*Math.cos(radians))+Math.abs(20*Math.sin(radians)),h=Math.abs(width*Math.sin(radians))+Math.abs(20*Math.cos(radians));
   const box={left:p.x-w/2-8,right:p.x+w/2+8,top:p.y-h/2-6,bottom:p.y+h/2+6};
   if(!fits(box))continue;
   const text=el('span',candidate.name);text.className='waterway-label';text.style.transform=`rotate(${angle.toFixed(1)}deg)`;
   L.marker(map.containerPointToLatLng(p),{interactive:false,keyboard:false,zIndexOffset:-200,icon:L.divIcon({html:text,className:'waterway-label-anchor',iconSize:[width,20],iconAnchor:[width/2,10]})}).addTo(waterwayLabels);
   occupied.push(box);if(++count>=limit)break;
  }
 }
 map.on('zoomend moveend resize',labelWaterways);
 function value(r) {return r.level===null?'No reading':`${r.level.toFixed(2)} m ${r.datum||''}`;}
 function colour(station) {
  if(station.kind==='rain')return station.depth===null?'#88969c':station.depth<=5?'#36a46d':station.depth<=30?'#e9c345':station.depth<=80?'#ed8b36':'#d94843';
  return {rising:'#d94843',falling:'#2875bb',steady:'#239b88'}[station.direction]||'#88969c';
 }
 function stationValue(station){return station.kind==='rain'?(station.depth===null?'Incomplete rainfall':`${station.depth.toFixed(1)} mm`):value(station);}
 function chooseGauge(station,reveal=true){selectedGauge={id:station.id,kind:station.kind};draw();return station.kind==='rain'?plotRain(station,reveal):plot(station,reveal);}
 function draw() {
  gaugeLayer.clearLayers();drawRainGauge();
  for(const station of stations){
   if(!$(station.kind==='rain'?'showRain':'showWater').checked)continue;
   const active=selectedGauge?.id===station.id&&selectedGauge?.kind===station.kind;
   let marker;
   if(station.kind==='rain')marker=L.circleMarker([station.coordinates.lat,station.coordinates.lon],{radius:active?9:6,fillColor:colour(station),color:active?'#183f43':'#fff',weight:2,fillOpacity:.95});
   else{const icon=el('div');icon.className='dam-square'+(active?' selected':'');icon.style.setProperty('--point-colour',colour(station));
    marker=L.marker([station.coordinates.lat,station.coordinates.lon],{icon:L.divIcon({html:icon,className:'',iconSize:[14,14],iconAnchor:[7,7]})});}
   marker.addTo(gaugeLayer).bindTooltip(el('span',`${station.name} · ${stationValue(station)}`)).on('click',()=>chooseGauge(station));
   marker.getElement()?.setAttribute('data-gauge',station.kind+':'+station.id);
  }
 }
 async function load() {
  if(!chosen)return;const version=++loadVersion;controller?.abort();controller=new AbortController();const signal=controller.signal;
  stations=[];draw();clearPlot();$('status').textContent='Loading rainfall and water gauges…';
  try{
   const results=await Promise.allSettled(['water','rainfall'].map(kind=>json(`/api/archive-${kind}/extent`,signal)));
   if(version!==loadVersion)return;
   const waterExtent=results[0].status==='fulfilled'?results[0].value:null,rainExtent=results[1].status==='fulfilled'?results[1].value:null;
   const latestSource=waterExtent?.lastEnd||rainExtent?.lastEnd;if(!latestSource)throw Error();
   const latest=Math.floor(Date.parse(latestSource)/60000)*60000,requested=$('ending').value?Date.parse($('ending').value+'+10:00'):latest;
   ending=new Date(Math.min(requested,latest)).toISOString();$('ending').value=local(ending);drawRainGauge();
   const minutes=Number($('duration').value),quarter=Math.floor(Date.parse(ending)/900000)*900000;
   const rainTime=rainExtent?.lastEnd?Math.min(quarter,Date.parse(rainExtent.lastEnd)):null;
   const rainEnd=rainTime!==null&&(!rainExtent.firstEnd||rainTime>=Date.parse(rainExtent.firstEnd))?new Date(rainTime).toISOString():null;
   const requests=[],inventory=[];
   for(const kind of ['water','rain']){
    const ids=new Set(boundary?.gauges?.[kind]||[]);if(kind==='water'&&nearest)ids.add(nearest.id);
    const gauges=catalogue[kind].filter(g=>ids.has(g.id));
    const frameEnd=kind==='water'?ending:rainEnd;
    inventory.push(...gauges.map(g=>({...g,kind,frameEnd,level:null,datum:'Unspecified',direction:null,depth:null})));
    if(!(kind==='water'?waterExtent?.lastEnd:rainEnd))continue;
    for(const basin of new Set(gauges.map(g=>g.basinId)))requests.push({kind,ids,frameEnd,url:`/api/archive-${kind==='rain'?'rainfall':'water'}/frame?basin=${encodeURIComponent(basin)}&end=${encodeURIComponent(frameEnd)}&minutes=${minutes}`});
   }
   const completed=[];
   for(let i=0;i<requests.length;i+=2){completed.push(...await Promise.allSettled(requests.slice(i,i+2).map(async q=>{
    const frame=await json(q.url,signal);if(!Array.isArray(frame.stations))throw Error();return frame.stations.filter(s=>q.ids.has(s.id)).map(s=>({...s,kind:q.kind,frameEnd:frame.end||q.frameEnd}));
   })));if(version!==loadVersion)return;}
   const byId=new Map(inventory.map(g=>[g.kind+':'+g.id,g]));
   for(const result of completed)if(result.status==='fulfilled')for(const g of result.value)byId.set(g.kind+':'+g.id,g);
   stations=[...byId.values()];row=stations.find(g=>g.kind==='water'&&g.id===nearest?.id)||null;
   const selected=stations.find(g=>g.kind===selectedGauge?.kind&&g.id===selectedGauge?.id)||row;
   const failed=completed.some(r=>r.status==='rejected')||results.some(r=>r.status==='rejected');
   $('status').textContent=`${stations.filter(g=>g.kind==='rain').length} rainfall · ${stations.filter(g=>g.kind==='water').length} water gauges · ${minutes/60} hours ending ${date(ending)} AEST.${rainEnd?' Rainfall ending '+date(rainEnd)+' AEST.':''}${failed?' Some observations could not be loaded; grey points may be unavailable.':''}`;
   if(selected)await chooseGauge(selected,false);else draw();
  }catch(error){if(version===loadVersion&&error.name!=='AbortError')$('status').textContent='Saved observations could not be loaded. Try Update observations.';}
 }
 async function plotRain(station,reveal){
  const version=++detailVersion,frameVersion=loadVersion;detailController?.abort();detailController=new AbortController();chart?.destroy();chart=null;
  const minutes=Number($('duration').value),end=station.frameEnd;
  $('plot').replaceChildren(el('h2',station.name),el('p',stationValue(station)));
  const link=el('a','Open full rainfall viewer'),query=new URLSearchParams({basin:station.basinId,gauge:station.id,minutes});if(end)query.set('end',end);link.href='/history?'+query;link.target='_blank';link.rel='noopener';$('plot').append(link);
  const message=el('p',end?`Recorded 15-minute rainfall ending ${date(end)} AEST. Missing periods remain gaps.`:'No saved rainfall time range is available for this selection.');$('plot').append(message);
  if(!end)return;
  try{
   const data=await json(`/api/archive-rainfall/series?gauge=${encodeURIComponent(station.id)}&end=${encodeURIComponent(end)}&minutes=${minutes}`,detailController.signal);
   if(version!==detailVersion||frameVersion!==loadVersion)return;
   const periods=(data.periods||[]).slice(-minutes/15),depths=(data.stations?.[0]?.values||[]).slice(-minutes/15);
   if(!depths.some(d=>Number.isFinite(d))){message.textContent='No numeric rainfall observations in the selected window.';return;}
   const host=el('div');host.className='chart';const canvas=el('canvas');canvas.setAttribute('aria-label',`${station.name} recorded rainfall`);canvas.setAttribute('role','img');host.append(canvas);$('plot').append(host);
   chart=new Chart(canvas,{type:'bar',data:{datasets:[{label:'15-minute rainfall · mm',data:periods.map((p,i)=>({x:Date.parse(p.end),y:depths[i]??null})),backgroundColor:'#36a46d'}]},options:{animation:false,maintainAspectRatio:false,scales:{x:{type:'linear',min:Date.parse(end)-minutes*60000,max:Date.parse(end),ticks:{maxTicksLimit:6,callback:t=>date(t)}},y:{beginAtZero:true}},plugins:{tooltip:{callbacks:{title:items=>date(items[0].parsed.x)+' AEST'}}}}});
   if(reveal&&matchMedia('(max-width:850px)').matches)$('plot').scrollIntoView({block:'start'});
  }catch(error){if(version===detailVersion&&error.name!=='AbortError')message.textContent='Could not load this gauge’s rainfall observations. Try Update observations.';}
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
  const full=el('a','Open full water-level viewer');full.href=`/water-history?basin=${encodeURIComponent(station.basinId)}&gauge=${encodeURIComponent(station.id)}&minutes=${$('duration').value}&end=${encodeURIComponent(ending)}`;full.target='_blank';full.rel='noopener';$('plot').append(full);
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
 for(const id of ['showRain','showWater'])$(id).onchange=draw;
 $('owner').onchange=options;$('dam').onchange=()=>selectDam($('dam').value);$('fit').onclick=fit;$('apply').onclick=load;$('duration').onchange=load;$('ending').onchange=load;
 $('streams').onchange=()=>{if($('streams').checked)streamsLayer.addTo(map);else map.removeLayer(streamsLayer);labelWaterways();};
 $('latest').onclick=()=>{$('ending').value='';load();};
 for(const [id,sign] of [['previous',-1],['next',1]])$(id).onclick=()=>{if(!ending)return;$('ending').value=local(new Date(Date.parse(ending)+sign*Number($('duration').value)*60000).toISOString());load();};
 Promise.all([json('/dams-catalogue.json'),json('/dam-boundaries.json').catch(()=>({dams:{},unavailable:true}))]).then(([data,index])=>{
  catalogue=data;boundaryIndex=index;options();
  for(const dam of data.dams)L.marker([dam.lat,dam.lon]).addTo(damsLayer).bindTooltip(el('span',`${dam.name} · ${dam.owner}`)).on('click',()=>{$('owner').value='';options();selectDam(dam.id);});
  labelWaterways();
  $('status').textContent=`${data.dams.length} dams and storages. Choose a dam from the list or map.`;
 }).catch(()=>{$('status').textContent='Dam catalogue could not be loaded. Please refresh.';});
})();
