'use strict';
const $ = id => document.getElementById(id);
const bands = [
 {id:'green',name:'Green',colour:'#36a46d'},
 {id:'yellow',name:'Yellow',colour:'#e9c345'},
 {id:'orange',name:'Orange',colour:'#ed8b36'},
 {id:'red',name:'Red',colour:'#d94843'},
 {id:'crimson',name:'Crimson',colour:'#a71930'},
 {id:'magenta',name:'Magenta',colour:'#cc358c'},
 {id:'purple',name:'Purple',colour:'#863ab5'},
 {id:'indigo',name:'Indigo',colour:'#56339c'},
 {id:'blue',name:'Blue',colour:'#2c64cc'},
 {id:'navy',name:'Navy',colour:'#122e67'}
];
const colours = {missing:'#88969c',...Object.fromEntries(bands.map(b=>[b.id,b.colour]))};
let data, chart, selected, thresholds = [5,15,30,40,50,80,130,180,200], markers = new Map();
const map = L.map('map').setView([-27.25,152.75],9);
const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
tiles.on('tileerror',()=>{ $('tileStatus').hidden=false; });
const layer = L.layerGroup().addTo(map);
const date = iso => new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const mm = value => value === null ? 'Missing' : `${value.toFixed(1)} mm`;
const band = value => {
 if(value === null)return 'missing';
 const index=thresholds.findIndex(limit=>value<=limit);
 return bands[index===-1?bands.length-1:index].id;
};
const latest = s => s.values[data.periods.length-1];
function node(tag,text,cls){const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls;return n;}
function legend(){
 const entries=[{id:'missing',name:'Grey',label:'Missing'},...bands.map((b,i)=>({...b,label:i===0?`0–${thresholds[0]}`:i===thresholds.length?`>${thresholds.at(-1)}`:`>${thresholds[i-1]}–${thresholds[i]}`}))];
 $('legend').replaceChildren(...entries.map(b=>{const n=node('span');const dot=node('i',undefined,'dot');dot.style.background=colours[b.id];n.append(dot,b.label);return n;}));
 const prior=$('rainFilter').value;
 $('rainFilter').replaceChildren(new Option('All observations','all'),...entries.map(b=>new Option(`${b.name} · ${b.label}${b.id==='missing'?'':' mm'}`,b.id)));
 $('rainFilter').value=prior||'all';
}
function thresholdInputs(){
 $('thresholdInputs').replaceChildren(...thresholds.map((limit,i)=>{
  const label=node('label',`${bands[i].name} upper limit (mm)`),input=node('input');
  input.id=`t${i+1}`;input.type='number';input.min='0';input.step='0.1';input.value=limit;input.required=true;
  label.append(input);return label;
 }));
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
 const stations=data.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)&&(filter==='all'||band(latest(s))===filter)).sort((a,b)=>{
  const av=latest(a),bv=latest(b);
  if(av===null && bv!==null)return 1;
  if(bv===null && av!==null)return -1;
  return (bv??0)-(av??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id);
 });
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
$('thresholds').onsubmit=e=>{e.preventDefault();const values=thresholds.map((_,i)=>Number($(`t${i+1}`).value));if(values.some(v=>!Number.isFinite(v)||v<0)||values.some((v,i)=>i>0&&v<=values[i-1])){$('thresholdError').textContent='Enter increasing, non-negative limits for every band.';return;}$('thresholdError').textContent='';thresholds=values;legend();draw();if(selected)choose(selected,false);};
thresholdInputs();legend();load();setInterval(()=>load(false),300000);setInterval(freshness,60000);
