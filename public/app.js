'use strict';
const $ = id => document.getElementById(id);
const colours = {missing:'#88969c',green:'#36a46d',yellow:'#e9c345',orange:'#ed8b36',red:'#d94843'};
let data, chart, selected, thresholds = [5,15,30], markers = new Map();
const map = L.map('map').setView([-27.25,152.75],9);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
tiles.on('tileerror',()=>{ $('tileStatus').hidden=false; });
const layer = L.layerGroup().addTo(map);
const date = iso => new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const mm = value => value === null ? 'Missing' : `${value.toFixed(1)} mm`;
const band = value => value === null ? 'missing' : value <= thresholds[0] ? 'green' : value <= thresholds[1] ? 'yellow' : value <= thresholds[2] ? 'orange' : 'red';
const latest = s => s.values[data.periods.length-1];
function node(tag,text,cls){const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls;return n;}
function legend(){
 const labels = {missing:'Missing',green:`0–${thresholds[0]}`,yellow:`>${thresholds[0]}–${thresholds[1]}`,orange:`>${thresholds[1]}–${thresholds[2]}`,red:`>${thresholds[2]}`};
 $('legend').replaceChildren(...Object.entries(labels).map(([b,label])=>{const n=node('span');const dot=node('i',undefined,'dot');dot.style.background=colours[b];n.append(dot,label);return n;}));
 for(const b of ['missing','green','yellow','orange','red']) $('rainFilter').querySelector(`[value="${b}"]`).textContent = `${b[0].toUpperCase()+b.slice(1)} · ${labels[b]}${b==='missing'?'':' mm'}`;
}
function freshness(){
 if(!data)return;
 const age=(Date.now()-new Date(data.issuedAt))/36e5;
 const observationAge=(Date.now()-new Date(data.periods.at(-1).end))/36e5;
 const stale=age>4 || observationAge>6 || age<-.1 || !!data.refreshError;
 $('freshness').className='badge'+(stale?' stale':'');
 $('freshness').textContent=stale?'● Stale / check source':`● Bulletin ${Math.max(0,Math.round(age*60))} min old`;
 $('issued').textContent=`BoM issued ${date(data.issuedAt)} AEST`;
 $('issued').title=`Fetched ${date(data.fetchedAt)} AEST. Latest period ended ${date(data.periods.at(-1).end)} AEST.`;
}
function draw(){
 if(!data)return;
 const term=$('search').value.trim().toLowerCase(), group=$('group').value, filter=$('rainFilter').value;
 const stations=data.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)&&(filter==='all'||band(latest(s))===filter));
 layer.clearLayers(); markers.clear(); $('stations').replaceChildren();
 let mapped=0;
 for(const s of stations){
  const b=band(latest(s));
  const button=node('button',undefined,'station'+(s.id===selected?' active':''));
  const dot=node('i',undefined,'dot');dot.style.background=colours[b];
  button.append(dot,node('span',mm(latest(s)),'reading'),document.createTextNode(s.name),node('small',s.group));
  if(!s.coordinates)button.append(node('span','Location unresolved · not plotted','unmapped'));
  button.addEventListener('click',()=>choose(s.id,true));$('stations').append(button);
  if(s.coordinates){
   mapped++;
   const marker=L.circleMarker([s.coordinates.lat,s.coordinates.lon],{radius:s.id===selected?10:7,color:s.id===selected?'#123e46':'#fff',weight:2,fillColor:colours[b],fillOpacity:.94}).addTo(layer);
   marker.bindTooltip(node('span',`${s.name} · ${mm(latest(s))}`)); marker.on('click',()=>choose(s.id,false));markers.set(s.id,marker);
  }
 }
 $('count').textContent=`${stations.length} gauges · ${mapped} mapped · ${stations.length-mapped} unresolved`;
 if(!stations.length)$('stations').append(node('p','No gauges match these filters.','filters muted'));
 if(selected && !stations.some(s=>s.id===selected)){
  selected=null; if(chart)chart.destroy();chart=null;
  $('detail').replaceChildren(node('p','The selected station is outside these filters. Select another gauge.','muted'));
 }
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12});}
function choose(id,pan){
 selected=id;const s=data.stations.find(s=>s.id===id); if(!s)return;
 draw();if(pan&&s.coordinates)map.setView([s.coordinates.lat,s.coordinates.lon],12);
 if(chart){chart.destroy();chart=null;}
 const detail=$('detail');detail.replaceChildren();
 const top=node('div',undefined,'detail-top'), title=node('div');title.append(node('span',s.group.toUpperCase(),'eyebrow'),node('h2',s.name));top.append(title);
 if(!s.coordinates)top.append(node('span',s.coordinateStatus,'unmapped'));detail.append(top);
 const observed=s.values.filter(v=>v!==null), complete=observed.length===s.values.length;
 const metrics=node('div',undefined,'metrics');
 for(const [value,label] of [[mm(latest(s)),'Latest completed 3 hours'],[observed.length?mm(observed.reduce((a,b)=>a+b,0)):'Missing',`Recent ${s.values.length*3}h ${complete?'total':`partial sum · ${observed.length}/${s.values.length} blocks`}`]]){
  const metric=node('div',undefined,'metric');metric.append(node('strong',value),node('span',label));metrics.append(metric);
 }
 detail.append(metrics,node('p',`Observation window: ${date(data.periods[0].start)} – ${date(data.periods.at(-1).end)} AEST`,'muted'));
 if(!complete)detail.append(node('p','Missing blocks are gaps. The partial sum is not a complete rainfall total.','unmapped'));
 const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${s.name}: rainfall in millimetres for each chronological 3-hour block; readings are also in the table below.`);wrap.append(canvas);detail.append(wrap);
 chart=new Chart(canvas,{type:'bar',data:{labels:data.periods.map(p=>date(p.end)),datasets:[{label:'3-hour rainfall (mm)',data:s.values,backgroundColor:s.values.map(v=>colours[band(v)]),borderRadius:3}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>{const p=data.periods[items[0].dataIndex];return `${date(p.start)} – ${date(p.end)} AEST`;}}}},scales:{y:{beginAtZero:true,title:{display:true,text:'Rainfall (mm)'}},x:{title:{display:true,text:'3-hour period ending · AEST'},grid:{display:false}}}}});
 const tw=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),hr=node('tr');
 for(const h of ['3-hour period start (AEST)','Period end (AEST)','Rainfall (mm)'])hr.append(node('th',h));head.append(hr);table.append(head);
 const body=node('tbody');data.periods.forEach((p,i)=>{const r=node('tr');r.append(node('td',date(p.start)),node('td',date(p.end)),node('td',mm(s.values[i])));body.append(r);});table.append(body);tw.append(table);detail.append(tw);
 if(s.coordinates){const c=s.coordinates,p=node('p',undefined,'detail-source'),a=node('a',`BoM station ${c.stationNumber} · ${c.catalogueName}`);a.href=c.source;a.target='_blank';a.rel='noopener';p.append(a,` · ${c.lat}, ${c.lon} · catalogue ${c.catalogueDate}.`);detail.append(p);}
}
async function load(refresh=false){
 $('refresh').disabled=true;$('refresh').textContent='↻ Fetching…';
 try{
  const response=await fetch(`/api/rainfall${refresh?'?refresh=1':''}`),result=await response.json();
  if(!response.ok)throw new Error(result.error||'Could not load rainfall.');
  data=result;const prior=$('group').value;
  $('group').replaceChildren(new Option('All groups',''),...[...new Set(data.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=prior;
  $('period').textContent=`${date(data.periods.at(-1).start)} – ${date(data.periods.at(-1).end)} AEST`;
  const messages=[];if(data.refreshError)messages.push(`${data.refreshError} Showing the last successfully fetched bulletin.`);
  if(data.warnings.length)messages.push(`${data.warnings.length} unrecognised readings are shown as missing.`);
  $('notice').hidden=!messages.length;$('notice').textContent=messages.join(' ');
  freshness();draw();if(selected)choose(selected,false);else if(!refresh)fit();
 }catch(e){if(data)data.refreshError=e.message;$('notice').hidden=false;$('notice').textContent=`${e.message} ${data?'Previously displayed data is retained.':'No rainfall observations have been loaded.'}`;$('freshness').className='badge stale';$('freshness').textContent='● Data unavailable / refresh failed';}
 finally{$('refresh').disabled=false;$('refresh').textContent='↻ Refresh bulletin';}
}
for(const id of ['search','group','rainFilter'])$(id).addEventListener(id==='search'?'input':'change',draw);
$('refresh').onclick=()=>load(true);$('fit').onclick=fit;
$('thresholds').onsubmit=e=>{e.preventDefault();const values=['t1','t2','t3'].map(id=>Number($(id).value));if(values.some(v=>!Number.isFinite(v)||v<0)||!(values[0]<values[1]&&values[1]<values[2])){$('thresholdError').textContent='Enter three increasing, non-negative limits.';return;}$('thresholdError').textContent='';thresholds=values;legend();draw();if(selected)choose(selected,false);};
legend();load();setInterval(()=>load(false),300000);setInterval(freshness,60000);
