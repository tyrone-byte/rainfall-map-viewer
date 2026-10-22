'use strict';
const $=id=>document.getElementById(id);
const colours={below:'#36a48c',minor:'#e1b43c',moderate:'#eb8635',major:'#cf4547',unknown:'#88969c'};
const rank={major:4,moderate:3,minor:2,below:1,unknown:0};
const labels={below:'Below flood level',minor:'Minor',moderate:'Moderate',major:'Major',unknown:'Not supplied / missing'};
let data,selected,historyData,chart,requestId=0,rangeHours=72;
const markers=new Map(),map=L.map('map').setView([-27.25,152.75],9),layer=L.layerGroup().addTo(map);
let initialMapFitPending=!SharedMapView.attach(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>{$('tileStatus').hidden=false;}).addTo(map);
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const date=iso=>iso?new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}):'Time not supplied';
const metres=value=>value===null?'Missing':`${value.toFixed(2)} m`;
const status=s=>s.level===null?'unknown':s.classification;
const old=s=>s.observedAt&&(Date.now()-Date.parse(s.observedAt)>3*3600000);
function destroy(){if(chart)chart.destroy();chart=null;}
function draw(){
 if(!data)return;
 const term=$('search').value.trim().toLowerCase(),group=$('group').value,filter=$('statusFilter').value,tendency=$('tendencyFilter').value;
 const stations=data.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)&&(filter==='all'||status(s)===filter)&&(tendency==='all'||s.tendency.toLowerCase().includes(tendency))).sort((a,b)=>rank[status(b)]-rank[status(a)]||a.name.localeCompare(b.name));
 layer.clearLayers();markers.clear();$('stations').replaceChildren();let mapped=0;
 for(const s of stations){
  const button=node('button',undefined,'station'+(s.id===selected?' active':'')),dot=node('i',undefined,'dot');dot.style.background=colours[status(s)];
  button.append(dot,node('span',metres(s.level),'reading'),document.createTextNode(s.name),node('small',`${s.datum} · ${s.tendency} · ${s.classificationText}`),node('small',`${s.reportedTime||'Time not supplied'} AEST${old(s)?' · observation over 3h old':''}`));
  if(!s.coordinates)button.append(node('span','Location unresolved · not plotted','unmapped'));
  button.onclick=()=>choose(s.id,true);$('stations').append(button);
  if(s.coordinates){mapped++;const marker=L.circleMarker([s.coordinates.lat,s.coordinates.lon],{radius:selected===s.id?10:7,color:selected===s.id?'#143f45':'#fff',weight:2,fillColor:colours[status(s)],fillOpacity:old(s)?.5:.94}).addTo(layer);marker.bindTooltip(node('span',`${s.name} · ${metres(s.level)} ${s.datum} · ${s.reportedTime} AEST${old(s)?' · older observation':''}`));marker.on('click',()=>choose(s.id,false));markers.set(s.id,marker);}
 }
 $('count').textContent=`${stations.length} gauges · ${mapped} mapped · ${stations.length-mapped} unresolved`;
 if(!stations.length)$('stations').append(node('p','No gauges match these filters.','filters muted'));
 if(selected&&!stations.some(s=>s.id===selected)){selected=null;historyData=null;requestId++;destroy();$('detail').replaceChildren(node('p','The selected gauge is outside these filters. Select another gauge.','muted'));}
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12});}
function freshness(){
 if(!data)return;const age=(Date.now()-Date.parse(data.issuedAt))/3600000,stale=age>3||age<-.1||!!data.refreshError;
 $('freshness').className='badge'+(stale?' stale':'');$('freshness').textContent=stale?'● Stale / check source':`● Bulletin ${Math.max(0,Math.round(age*60))} min old`;
 $('issued').textContent=`BoM issued ${date(data.issuedAt)} AEST`;
}
async function choose(id,pan,refresh=false){
 selected=id;historyData=null;const token=++requestId,s=data.stations.find(s=>s.id===id);if(!s)return;draw();destroy();
 if(pan&&s.coordinates)map.setView([s.coordinates.lat,s.coordinates.lon],12);
 const detail=$('detail');detail.className='detail water-level-detail';detail.replaceChildren();const top=node('div',undefined,'detail-top'),title=node('div');title.append(node('span',s.group.toUpperCase(),'eyebrow'),node('h2',s.name));top.append(title);detail.append(top);
 const metrics=node('div',undefined,'metrics');
 for(const [value,label] of [[`${metres(s.level)} ${s.datum}`,'Bulletin gauge height'],[s.tendency,'BoM reported tendency'],[s.classificationText,'BoM flood classification']]){const metric=node('div',undefined,'metric');metric.append(node('strong',value),node('span',label));metrics.append(metric);}detail.append(metrics);
 detail.append(node('p',`Bulletin observation: ${s.reportedTime||'Not supplied'} AEST · ${s.stationType} · BoM station ${s.stationNumber||'identifier unavailable'}`,'muted'));
 if(old(s))detail.append(node('p','This gauge observation is over 3 hours old. The bulletin issue time does not establish gauge freshness.','unmapped'));
 detail.append(node('p',s.datum==='AHD'?'AHD: height relative to Australian Height Datum. This is not water depth above the river bed.':s.datum==='LGH'?'LGH: local gauge height relative to this station’s reference zero. It is not comparable to heights at other gauges.':'Gauge datum unspecified.','muted'));
 if(s.crossing)detail.append(node('p',`BoM crossing information (source text): ${s.crossing}`,'muted'));
 if(!s.coordinates)detail.append(node('p','Coordinates unresolved. This gauge is not plotted on the map.','unmapped'));
 const body=node('section');body.id='history';body.append(node('p','Loading official gauge history…','history-message'));detail.append(body);
 if(s.historyPath){const link=node('a','Open the official BoM gauge table');link.href='https://reg.bom.gov.au'+s.historyPath;link.target='_blank';link.rel='noopener';detail.append(link);}
 try{
  if(!s.historyPath)throw new Error('BoM has not supplied a history table for this gauge.');
  const response=await fetch(`/api/water/${encodeURIComponent(s.id)}${refresh?'?refresh=1':''}`),result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load gauge history.');
  if(token!==requestId)return;historyData=result;renderHistory(s);
 }catch(error){if(token!==requestId)return;body.replaceChildren(node('p',`${error.message} No history plot is available; the bulletin reading above is retained.`,'history-message'));}
}
function renderHistory(s){
 destroy();const host=$('history');host.replaceChildren();const h=historyData;
 host.append(node('h2','Recent water-level hydrograph'));
 if(h.refreshError||h.summaryRefreshError)host.append(node('p',`${h.refreshError||h.summaryRefreshError} Showing last successfully fetched data.`,'unmapped'));
 for(const warning of h.warnings)host.append(node('p',warning,'unmapped'));
 const end=Date.parse(h.observations.at(-1).time),cutoff=end-rangeHours*3600000;
 const observations=h.observations.filter(o=>Date.parse(o.time)>=cutoff),latest=h.observations.at(-1);
 host.append(node('p',`History latest: ${metres(latest.level)} ${h.datum} at ${date(latest.time)} AEST. History issued ${date(h.issuedAt)} AEST.`,'muted'));
 if(Date.now()-end>3*3600000)host.append(node('p','Latest history observation is over 3 hours old.','unmapped'));
 const controls=node('div',undefined,'water-controls'),label=node('label','History window (ending at latest report)'),select=node('select');select.id='historyRange';select.append(...[3,6,12,24,72,168].map(hours=>new Option(hours===168?'7 days':`${hours} hours`,String(hours))));select.value=String(rangeHours);select.onchange=()=>{rangeHours=Number(select.value);renderHistory(s);};label.append(select);controls.append(label);host.append(controls);
 const thresholds=node('div',undefined,'water-thresholds');for(const t of h.thresholds){const n=node('span',`${t.name}: ${metres(t.level)} ${t.datum}`);n.style.color=colours[t.name.toLowerCase()];thresholds.append(n);}host.append(thresholds);
 if(!h.thresholds.length)host.append(node('p','No matching-datum BoM flood classification levels supplied for this gauge.','muted'));
 const wrap=node('div',undefined,'water-chart'),canvas=node('canvas');canvas.id='waterChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${s.name}: reported water levels in metres ${h.datum} over the selected history window. Recent readings are also in the table below.`);wrap.append(canvas);host.append(wrap);
 const series=observations.map(o=>({x:Date.parse(o.time),y:o.level}));
 const datasets=[{label:`Reported water level (m ${h.datum})`,data:series,borderColor:'#228d85',backgroundColor:'#228d8518',borderWidth:2,pointRadius:observations.length<30?3:0,pointHitRadius:7,tension:0,spanGaps:false,segment:{borderColor:ctx=>ctx.p1.parsed.x-ctx.p0.parsed.x>21600000?'transparent':'#228d85'}}];
 for(const t of h.thresholds)datasets.push({label:`${t.name} · BoM`,data:[{x:Math.max(cutoff,series[0].x),y:t.level},{x:end,y:t.level}],borderColor:colours[t.name.toLowerCase()],borderDash:[6,4],pointRadius:0,borderWidth:1.5});
 chart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{title:items=>`${date(items[0].parsed.x)} AEST`,label:context=>`${context.dataset.label}: ${metres(context.parsed.y)}`}}},scales:{x:{type:'linear',min:cutoff,max:end,ticks:{maxTicksLimit:6,callback:value=>date(value)},title:{display:true,text:'Observation time · AEST'}},y:{title:{display:true,text:`Gauge height (m ${h.datum})`}}}}});
 host.append(node('p','Actual observation times are preserved. Sampling can be irregular; missing readings and intervals over 6 hours break the line. No levels are interpolated or forecast.','muted'));
 const count=Math.min(100,observations.length);host.append(node('p',`Latest ${count} of ${observations.length} readings in this window · newest first`,'muted'));
 const tw=node('div',undefined,'table-wrap history-table'),table=node('table'),head=node('thead'),row=node('tr');row.append(node('th','Observation time (AEST)'),node('th',`Height (m ${h.datum})`));head.append(row);table.append(head);const body=node('tbody');for(const o of observations.slice(-100).reverse()){const row=node('tr');row.append(node('td',date(o.time)),node('td',metres(o.level)));body.append(row);}table.append(body);tw.append(table);host.append(tw);
 if(s.coordinates){const c=s.coordinates;host.append(node('p',`Official station-number coordinate match: ${c.stationNumber} · ${c.catalogueName} · ${c.lat}, ${c.lon}. Catalogue ${c.catalogueDate}.`,'detail-source'));}
}
async function load(refresh=false){
 $('refresh').disabled=true;
 try{
  const response=await fetch(`/api/water${refresh?'?refresh=1':''}`),result=await response.json();if(!response.ok)throw new Error(result.error||'Water-level bulletin unavailable.');
  data=result;const group=$('group').value;$('group').replaceChildren(new Option('All groups',''),...[...new Set(data.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=group;
  const notices=[data.refreshError?`${data.refreshError} Showing last successful bulletin.`:'',data.warnings.length?`${data.warnings.length} unrecognised levels shown as missing.`:''].filter(Boolean);$('notice').hidden=!notices.length;$('notice').textContent=notices.join(' ');
  freshness();draw();if(selected)choose(selected,false,refresh);else if(initialMapFitPending)fit();initialMapFitPending=false;
 }catch(error){if(data)data.refreshError=error.message;$('notice').hidden=false;$('notice').textContent=`${error.message} ${data?'Previously displayed readings retained.':'No water-level observations loaded.'}`;$('freshness').className='badge stale';$('freshness').textContent='● Data unavailable / refresh failed';}
 finally{$('refresh').disabled=false;}
}
for(const [id,text] of Object.entries(labels)){const span=node('span'),dot=node('i',undefined,'dot');dot.style.background=colours[id];span.append(dot,text);$('legend').append(span);}
for(const id of ['search','group','statusFilter','tendencyFilter'])$(id).addEventListener(id==='search'?'input':'change',draw);
$('refresh').onclick=()=>load(true);$('fit').onclick=fit;load();setInterval(()=>load(false),300000);setInterval(freshness,60000);
