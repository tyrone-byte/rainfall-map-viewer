'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const localInput=iso=>new Date(Date.parse(iso)+36000000).toISOString().slice(0,16);
const duration=m=>m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
const level=v=>v===null?'No reading':`${v.toFixed(2)} m`;
const colours={current:'#36a48c',suspect:'#e9b43d',out:'#88969c',missing:'#88969c'};
const params=new URLSearchParams(location.search);
let basin=null,groups=[],extent=null,frame=null,selected=null,chart=null,end=params.get('end'),follow=!end,version=0,detailVersion=0,controller,detailController,fitPending=true,refreshVersion=0;
if(['15','30','60','180','360','720','1440'].includes(params.get('minutes')))$('accumulation').value=params.get('minutes');
$('ending').step='60';
const map=L.map('map').setView([-27.25,152.75],9);SharedMapView.attach(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap contributors'}).on('tileerror',()=>{$('tileStatus').hidden=false;}).addTo(map);
const layer=L.layerGroup().addTo(map),markers=new Map();
function notice(text){$('notice').hidden=!text;$('notice').textContent=text||'';}
function saveURL(){const q=new URLSearchParams({basin,minutes:$('accumulation').value});if(!follow)q.set('end',end);if(selected)q.set('gauge',selected);history.replaceState(null,'',`/water-history?${q}`);}
function controls(){
 if(!extent?.lastEnd)return;
 const minutes=Number($('accumulation').value),time=Date.parse(end);
 for(const id of ['ending','accumulation','latest'])$(id).disabled=false;
 $('ending').min=localInput(extent.firstEnd);$('ending').max=localInput(extent.lastEnd);$('ending').value=localInput(end);
 $('timeLabel').textContent=`${date(new Date(time-minutes*60000).toISOString())} – ${date(end)} AEST`;
 $('previous').textContent=`← ${duration(minutes)}`;$('next').textContent=`${duration(minutes)} →`;
 $('previous').disabled=time-minutes*60000<Date.parse(extent.firstEnd);$('next').disabled=time+minutes*60000>Date.parse(extent.lastEnd);
 $('latest').setAttribute('aria-pressed',String(follow));
 $('newest').textContent=`Newest saved observation: ${date(extent.lastEnd)} AEST`;
 const stale=Date.now()-Date.parse(extent.lastEnd)>3600000||extent.source?.status!=='ok'||!extent.source?.checked_at||Date.now()-Date.parse(extent.source.checked_at)>1800000;
 $('freshness').className='badge'+(stale?' stale':'');$('freshness').textContent=stale?'● Saved data stale / check collector':follow?'● Latest saved observations':'● Historical selection';
}
function clearDetail(){detailVersion++;detailController?.abort();selected=null;chart?.destroy();chart=null;$('detail').replaceChildren(node('p','Select a water-level gauge to see its saved hydrograph.','empty'));}
function draw(){
 if(!frame)return;
 const term=$('search').value.trim().toLowerCase(),group=$('group').value;
 const rows=frame.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)).sort((a,b)=>a.name.localeCompare(b.name));
 const scroll=document.querySelector('.sidebar').scrollTop;layer.clearLayers();markers.clear();$('stations').replaceChildren();
 for(const s of rows){
  const button=node('button',undefined,'station'+(s.id===selected?' active':'')),dot=node('i',undefined,'dot');dot.style.background=colours[s.status];
  button.append(dot,node('span',level(s.level),'reading'),document.createTextNode(s.name),node('small',`${s.group} · ${s.datum}`),node('small',s.observedAt?`${date(s.observedAt)} AEST · ${s.status==='current'?'under 60 min old':s.status==='suspect'?'60 min–6 h old':s.status==='out'?'6+ h old':'missing level'}`:'No observation in this window'));
  if(!s.coordinates)button.append(node('span','Location unresolved · not plotted','unmapped'));
  button.onclick=()=>choose(s.id,true);$('stations').append(button);
  if(s.coordinates){const marker=L.circleMarker([s.coordinates.lat,s.coordinates.lon],{radius:selected===s.id?10:7,color:'#fff',weight:2,fillColor:colours[s.status],fillOpacity:.94}).addTo(layer);marker.bindTooltip(node('span',`${s.name} · ${level(s.level)} ${s.datum}`));marker.on('click',()=>choose(s.id,false));markers.set(s.id,marker);}
 }
 document.querySelector('.sidebar').scrollTop=scroll;$('count').textContent=`${rows.length} gauges · ${markers.size} mapped · ${rows.filter(s=>s.level!==null).length} with readings`;
 if(selected&&!rows.some(s=>s.id===selected))clearDetail();
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12,animate:false});}
async function choose(id,pan=false){
 const station=frame?.stations.find(s=>s.id===id);if(!station)return;selected=id;draw();saveURL();
 if(pan&&station.coordinates)map.setView([station.coordinates.lat,station.coordinates.lon],12);
 const token=++detailVersion,frameVersion=version;detailController?.abort();detailController=new AbortController();
 try{
  const response=await fetch(`/api/archive-water/series?gauge=${encodeURIComponent(id)}&end=${encodeURIComponent(frame.end)}&minutes=${frame.minutes}`,{signal:detailController.signal,cache:'no-store'});
  if(!response.ok)throw new Error();const result=await response.json();if(token!==detailVersion||frameVersion!==version)return;if(!result.available)throw new Error();
  chart?.destroy();chart=null;const host=$('detail');host.replaceChildren(node('span',station.group.toUpperCase(),'eyebrow'),node('h2',station.name),node('h3',`${level(station.level)} · ${station.datum}`),node('p',`Last observation in selected window: ${station.observedAt?date(station.observedAt)+' AEST':'none'}`,'muted'),node('p',`${date(result.start)} – ${date(result.end)} AEST · ${result.observations.length} saved readings. Actual observation times; no interpolation or accumulation. Heights use each gauge’s own datum.`,'history-coverage'));
  if(!result.observations.length){host.append(node('p','No saved observations in this window.'));return;}
  const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.id='waterHistoryChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${station.name}: saved water levels over the selected duration`);wrap.append(canvas);host.append(wrap);
  const datums=[...new Set(result.observations.map(o=>o.datum))];
  const datasets=datums.map((datum,index)=>({label:`Gauge height · m ${datum}`,data:result.observations.map(o=>({x:Date.parse(o.time),y:o.datum===datum?o.level:null})),borderColor:['#228d85','#7350a0','#b06c28'][index%3],borderWidth:2,pointRadius:result.observations.length<30?3:0,pointHitRadius:7,spanGaps:false,tension:0,segment:{borderColor:ctx=>ctx.p1.parsed.x-ctx.p0.parsed.x>3600000?'transparent':undefined}}));
  chart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{tooltip:{callbacks:{title:items=>date(items[0].parsed.x)+' AEST'}}},scales:{x:{type:'linear',min:Date.parse(result.start),max:Date.parse(result.end),ticks:{maxTicksLimit:8,callback:value=>date(value)},title:{display:true,text:'Observation time · Brisbane AEST'}},y:{title:{display:true,text:'Gauge height · metres (see datum in legend)'}}}}});
  host.append(node('p','Missing levels and gaps longer than 60 minutes break the line. Age flags are measured relative to your selected ending time, not today. AHD and local gauge heights are not interchangeable.','muted'));
 }catch(error){if(error.name!=='AbortError'&&token===detailVersion){chart?.destroy();chart=null;$('detail').replaceChildren(node('h2',station.name),node('p','Could not load saved water levels. Please try again.'));}}
}
async function loadFrame(){
 if(!basin||!extent?.lastEnd)return;const token=++version;detailVersion++;detailController?.abort();controller?.abort();controller=new AbortController();$('loading').textContent='Loading selection…';
 try{
  const response=await fetch(`/api/archive-water/frame?basin=${encodeURIComponent(basin)}&end=${encodeURIComponent(end)}&minutes=${$('accumulation').value}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token!==version)return;if(!result.available)throw new Error();
  frame=result;const group=$('group').value;$('group').replaceChildren(new Option('All catchments in this group',''),...[...new Set(frame.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=group;
  $('period').textContent=`${duration(frame.minutes)} · ${date(frame.start)} – ${date(frame.end)} AEST`;draw();if(fitPending){fit();fitPending=false;}if(selected)choose(selected);saveURL();notice('');
 }catch(error){if(error.name!=='AbortError'&&token===version)notice('Could not load this saved selection. Any displayed map retains its earlier labelled time window.');}
 finally{if(token===version)$('loading').textContent='';}
}
async function refresh(){
 if(!basin)return;const token=++refreshVersion;$('refresh').disabled=true;
 try{
  const response=await fetch('/api/archive-water/extent',{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token!==refreshVersion)return;
  if(!result.available||!result.lastEnd)throw new Error();extent=result;
  if(follow||!end||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(extent.firstEnd)||Date.parse(end)>Date.parse(extent.lastEnd)){end=extent.lastEnd;follow=true;}
  controls();await loadFrame();
 }catch(_){if(token===refreshVersion){notice('Could not read saved water-level history. Please try Refresh saved data.');$('freshness').textContent='● Archive unavailable';}}
 finally{if(token===refreshVersion)$('refresh').disabled=false;}
}
async function openBasin(id,gauge=null){
 const group=groups.find(g=>g.id===id);if(!group)return;version++;refreshVersion++;controller?.abort();clearDetail();basin=id;selected=gauge;frame=null;layer.clearLayers();markers.clear();$('stations').replaceChildren();$('search').value='';$('group').replaceChildren(new Option('All catchments in this group',''));document.querySelector('.sidebar').scrollTop=0;document.querySelector('.workspace').scrollTop=0;fitPending=true;
 $('groupPicker').hidden=true;$('historyWorkspace').hidden=false;$('basinTitle').textContent=group.label;$('period').textContent='Loading saved water levels';map.invalidateSize();await refresh();
}
$('changeBasin').onclick=()=>{version++;refreshVersion++;controller?.abort();clearDetail();basin=null;frame=null;layer.clearLayers();markers.clear();$('historyWorkspace').hidden=true;$('groupPicker').hidden=false;$('freshness').textContent='Choose a water-level group';$('refresh').disabled=true;notice('');history.replaceState(null,'','/water-history');};
function selectTime(time){end=time;follow=false;controls();loadFrame();}
$('ending').onchange=()=>{const time=Date.parse($('ending').value+'+10:00');if(!Number.isFinite(time)||time<Date.parse(extent.firstEnd)||time>Date.parse(extent.lastEnd)){notice('Choose an ending time within the saved range, in Brisbane time.');return;}selectTime(new Date(time).toISOString());};
$('previous').onclick=()=>selectTime(new Date(Date.parse(end)-Number($('accumulation').value)*60000).toISOString());$('next').onclick=()=>selectTime(new Date(Date.parse(end)+Number($('accumulation').value)*60000).toISOString());
$('latest').onclick=()=>{follow=true;end=extent.lastEnd;controls();loadFrame();};$('accumulation').onchange=()=>{controls();loadFrame();};$('refresh').onclick=refresh;$('fit').onclick=fit;
for(const id of ['search','group'])$(id).addEventListener(id==='search'?'input':'change',()=>{draw();saveURL();});
for(const [colour,label] of [['#36a48c','Under 60 min'],['#e9b43d','60 min–6 h'],['#88969c','6+ h / missing']]){const entry=node('span'),dot=node('i',undefined,'dot');dot.style.background=colour;entry.append(dot,label);$('legend').append(entry);}
(async()=>{try{const response=await fetch('/api/archive-rainfall/groups');if(!response.ok)throw new Error();groups=(await response.json()).groups;$('basinGroups').replaceChildren(...groups.map(g=>{const button=node('button',undefined,'basin-choice');button.dataset.basin=g.id;button.append(node('strong',g.label),node('span','→'));button.onclick=()=>openBasin(g.id);return button;}));if(groups.some(g=>g.id===params.get('basin')))openBasin(params.get('basin'),params.get('gauge'));}catch(_){$('basinGroups').textContent='Could not load groups. Please refresh.';}})();
setInterval(refresh,60000);
