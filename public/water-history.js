'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const observationDate=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const localInput=iso=>new Date(Date.parse(iso)+36000000).toISOString().slice(0,16);
const duration=m=>m>=2880?`${m/1440} days`:m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
const level=v=>v===null?'No reading':`${v.toFixed(2)} m`;
const colours={current:'#36a48c',suspect:'#e9b43d',out:'#88969c',missing:'#88969c'};
const params=new URLSearchParams(location.search);
if(['trend','rate','age'].includes(params.get('colours')))$('colourMode').value=params.get('colours');
if(['15','30','60','180'].includes(params.get('comparison')))$('comparison').value=params.get('comparison');
let showRecordedPoints=false;
let basin=null,groups=[],extent=null,frame=null,selected=null,chart=null,end=params.get('end'),follow=!end,version=0,detailVersion=0,controller,detailController,fitPending=true,refreshVersion=0;
if(['15','30','60','180','360','720','1440','2880','4320','10080'].includes(params.get('minutes')))$('accumulation').value=params.get('minutes');
$('ending').step='60';
const map=L.map('map',{scrollWheelZoom:false,dragging:!L.Browser.mobile,tapHold:false}).setView([-27.25,152.75],9);SharedMapView.attach(map);MobileViewer.attach(map);
MapBackgrounds.attach(map,$('background'));
const layer=L.layerGroup().addTo(map),markers=new Map();
function notice(text){$('notice').hidden=!text;$('notice').textContent=text||'';}
function saveURL(){const q=new URLSearchParams({basin,minutes:$('accumulation').value,colours:$('colourMode').value,comparison:$('comparison').value});if(!follow)q.set('end',end);if(selected)q.set('gauge',selected);history.replaceState(null,'',`/water-history?${q}`);}
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
 $('freshness').className='badge'+(stale?' stale':'');$('freshness').textContent=stale?'● Saved data stale / check collector':follow?'● Latest saved observations':'● Selected time';
}
function clearDetail(){detailVersion++;detailController?.abort();selected=null;chart?.destroy();chart=null;$('detail').replaceChildren(node('p','Select a water-level gauge to see its saved hydrograph.','empty'));}
function draw(){
 if(!frame)return;
 const term=$('search').value.trim().toLowerCase(),group=$('group').value;
 const rows=frame.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)).sort((a,b)=>a.name.localeCompare(b.name));
 const scroll=document.querySelector('.sidebar').scrollTop;layer.clearLayers();markers.clear();$('stations').replaceChildren();
 for(const s of rows){
  const button=node('button',undefined,'station'+(s.id===selected?' active':'')),dot=node('i',undefined,'dot');dot.style.background=pointColour(s);
  button.append(dot,node('span',level(s.level),'reading'),document.createTextNode(s.name),node('small',`${s.group} · ${s.datum}`),node('small',s.observedAt?`${date(s.observedAt)} AEST · ${s.status==='current'?'under 60 min old':s.status==='suspect'?'60 min–6 h old':s.status==='out'?'6+ h old':'missing level'}`:'No observation in this window'));
  if(!s.coordinates)button.append(node('span','Location unresolved · not plotted','unmapped'));
  button.onclick=()=>choose(s.id,true,true);$('stations').append(button);
  if(s.coordinates){const marker=L.circleMarker([s.coordinates.lat,s.coordinates.lon],{radius:selected===s.id?10:7,color:'#fff',weight:2,fillColor:pointColour(s),fillOpacity:.94}).addTo(layer);const tooltip=node('div',undefined,'gauge-tooltip');tooltip.append(node('strong',s.name),node('div',s.level===null?'No reading':`${level(s.level)} ${s.datum}`));marker.bindTooltip(tooltip);marker.on('click',()=>choose(s.id,false,true));markers.set(s.id,marker);}
 }
 document.querySelector('.sidebar').scrollTop=scroll;$('count').textContent=`${rows.length} gauges · ${markers.size} mapped · ${rows.filter(s=>s.level!==null).length} with readings`;
 if(selected&&!rows.some(s=>s.id===selected))clearDetail();
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12,animate:false});}
function appendBomLinks(host,station){
 const links=node('div',undefined,'bom-check-links');
 function populate(source){
  links.replaceChildren();
  for(const [path,label] of [[source.plotPath,'Open BoM plot'],[source.historyPath,'Open BoM observation table']]){
   if(!path||!/^\/fwo\/IDQ\d+\/IDQ\d+\.\d{6}\.(?:plt|tbl)\.shtml$/.test(path)||!path.includes(`.${station.id}.`))continue;
   const link=node('a',label);link.href='https://reg.bom.gov.au'+path;link.target='_blank';link.rel='noopener';links.append(link);
  }
  if(station.membershipSource){const link=node('a','Open BoM group bulletin');link.href=station.membershipSource;link.target='_blank';link.rel='noopener';links.append(link);}
 }
 populate(station);
 host.append(links);
 links.title='BoM shows its current available record, which may cover different dates from your selection.';
 if(!station.plotPath&&station.membershipSource){
  fetch(`/api/archive-water/links?gauge=${encodeURIComponent(station.id)}&basin=${encodeURIComponent(station.basinId)}`,{cache:'no-store'})
   .then(response=>response.ok?response.json():null).then(result=>{if(result?.available&&links.isConnected)populate(result);}).catch(()=>{});
 }
}
async function choose(id,pan=false,reveal=false){
 const station=frame?.stations.find(s=>s.id===id);if(!station)return;selected=id;draw();saveURL();if(reveal)MobileViewer.showPlot();
 if(pan&&station.coordinates)map.setView([station.coordinates.lat,station.coordinates.lon],12);
 const token=++detailVersion,frameVersion=version;detailController?.abort();detailController=new AbortController();
 try{
  const response=await fetch(`/api/archive-water/series?gauge=${encodeURIComponent(id)}&end=${encodeURIComponent(frame.end)}&minutes=${frame.minutes}`,{signal:detailController.signal,cache:'no-store'});
  if(!response.ok)throw new Error();const result=await response.json();if(token!==detailVersion||frameVersion!==version)return;if(!result.available)throw new Error();
  chart?.destroy();chart=null;const host=$('detail');host.replaceChildren(node('span',station.group.toUpperCase(),'eyebrow'),node('h2',station.name),node('h3',`${level(station.level)} · ${station.datum}`),node('p',`Last observation: ${station.observedAt?date(station.observedAt)+' AEST':'none in this window'}`,'muted'));
  appendBomLinks(host,station);
  if(!result.observations.length){host.append(node('p','No saved observations in this window.'));if(reveal)MobileViewer.showPlot(host);return;}
  const plotControls=node('div',undefined,'water-plot-controls'),pointsLabel=node('label'),points=node('input');points.type='checkbox';points.id='showRecordedPoints';points.checked=showRecordedPoints;pointsLabel.append(points,document.createTextNode('Show recorded points'));plotControls.append(pointsLabel);host.append(plotControls);
  points.onchange=()=>{showRecordedPoints=points.checked;if(chart){for(const dataset of chart.data.datasets)dataset.pointRadius=showRecordedPoints?3:0;chart.update('none');}};
  const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.id='waterHistoryChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${station.name}: saved water levels over the selected duration`);wrap.append(canvas);host.append(wrap);
  const datums=[...new Set(result.observations.map(o=>o.datum))];
  const datasets=datums.map((datum,index)=>({label:`Gauge height · m ${datum}`,data:result.observations.map(o=>({x:Date.parse(o.time),y:o.datum===datum?o.level:null})),borderColor:['#228d85','#7350a0','#b06c28'][index%3],borderWidth:2,pointRadius:showRecordedPoints?3:0,pointHitRadius:7,spanGaps:false,tension:0,segment:{borderDash:ctx=>ctx.p1.parsed.x-ctx.p0.parsed.x>3600000?[6,5]:undefined}}));
  chart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{tooltip:{callbacks:{title:items=>observationDate(items[0].parsed.x)+' AEST'}}},scales:{x:{type:'linear',min:Date.parse(result.start),max:Date.parse(result.end),ticks:{maxTicksLimit:8,callback:value=>date(value)},title:{display:true,text:'Observation time · Brisbane AEST'}},y:{title:{display:true,text:'Gauge height · metres (see datum in legend)'}}}}});
  const notes=node('details',undefined,'plot-notes');notes.append(node('summary','Data notes'));
  notes.append(node('p',`${result.observations.length} saved readings · ${date(result.start)} – ${date(result.end)} AEST. Lines connect recorded values; dashed segments indicate gaps over 60 minutes, not a communications fault. Missing values and datum changes break the line. No readings are created or accumulated. AHD and local gauge heights are not interchangeable.`,'muted'));
  if(Number.isFinite(station.ratePerHour))notes.append(node('p',`Measured comparison: ${observationDate(station.movementStartAt)} – ${observationDate(station.movementEndAt)} AEST · ${station.levelChange.toFixed(3)} m · ${station.ratePerHour.toFixed(3)} m/h. No tidal adjustment.`,'muted'));
  host.append(notes);if(reveal)MobileViewer.showPlot(host);
 }catch(error){if(error.name!=='AbortError'&&token===detailVersion){chart?.destroy();chart=null;$('detail').replaceChildren(node('h2',station.name),node('p','Could not load saved water levels. Please try again.'));appendBomLinks($('detail'),station);if(reveal)MobileViewer.showPlot($('detail'));}}
}
async function loadFrame(){
 if(!basin||!extent?.lastEnd)return;const token=++version;detailVersion++;detailController?.abort();controller?.abort();controller=new AbortController();$('loading').textContent='Loading selection…';
 try{
  const response=await fetch(`/api/archive-water/frame?basin=${encodeURIComponent(basin)}&end=${encodeURIComponent(end)}&minutes=${$('accumulation').value}&comparison=${$('comparison').value}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token!==version)return;if(!result.available)throw new Error();
  frame=result;legend();const group=$('group').value;$('group').replaceChildren(new Option('All catchments in this group',''),...[...new Set(frame.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=group;
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
 }catch(_){if(token===refreshVersion){notice('Could not read saved water-level data. Please try Refresh saved data.');$('freshness').textContent='● Archive unavailable';}}
 finally{if(token===refreshVersion)$('refresh').disabled=false;}
}
async function openBasin(id,gauge=null){
 const group=groups.find(g=>g.id===id);if(!group)return;version++;refreshVersion++;controller?.abort();clearDetail();basin=id;selected=gauge;frame=null;layer.clearLayers();markers.clear();$('stations').replaceChildren();$('search').value='';$('group').replaceChildren(new Option('All catchments in this group',''));document.querySelector('.sidebar').scrollTop=0;document.querySelector('.workspace').scrollTop=0;fitPending=true;
 $('groupPicker').hidden=true;$('historyWorkspace').hidden=false;$('basinTitle').textContent=group.label;$('period').textContent='Loading saved water levels';map.invalidateSize();await refresh();
}
$('changeBasin').onclick=()=>{version++;refreshVersion++;controller?.abort();clearDetail();basin=null;frame=null;layer.clearLayers();markers.clear();$('historyWorkspace').hidden=true;$('groupPicker').hidden=false;$('freshness').textContent='Choose a water-level group';$('refresh').disabled=true;loadRainfallPriority();notice('');history.replaceState(null,'','/water-history');};
function selectTime(time){end=time;follow=false;controls();loadFrame();}
$('ending').onchange=()=>{const time=Date.parse($('ending').value+'+10:00');if(!Number.isFinite(time)||time<Date.parse(extent.firstEnd)||time>Date.parse(extent.lastEnd)){notice('Choose an ending time within the saved range, in Brisbane time.');return;}selectTime(new Date(time).toISOString());};
$('previous').onclick=()=>selectTime(new Date(Date.parse(end)-Number($('accumulation').value)*60000).toISOString());$('next').onclick=()=>selectTime(new Date(Date.parse(end)+Number($('accumulation').value)*60000).toISOString());
$('latest').onclick=()=>{follow=true;end=extent.lastEnd;controls();loadFrame();};$('accumulation').onchange=()=>{controls();loadFrame();};$('refresh').onclick=refresh;$('fit').onclick=fit;
for(const id of ['search','group'])$(id).addEventListener(id==='search'?'input':'change',()=>{draw();saveURL();});
function pointColour(station){
 const mode=$('colourMode').value;if(mode==='age')return colours[station.status];
 if(!Number.isFinite(station.ratePerHour))return '#88969c';
 if(station.direction==='falling')return '#2c64cc';
 if(station.direction==='steady')return '#36a48c';
 if(mode==='trend')return '#d94843';
 const rate=station.ratePerHour;return rate<=.1?'#36a46d':rate<=.3?'#e9c345':rate<=.6?'#ed8b36':'#d94843';
}
function legend(){
 const comparison=frame?.comparisonMinutes||Number($('comparison').value),mode=$('colourMode').value;$('comparison').disabled=mode==='age';
 $('legendTitle').textContent=mode==='age'?'Observation age at selected ending time':`${mode==='trend'?'Measured level change':'Rate of rise / fall'} · ${duration(comparison)} comparison`;
 const entries=mode==='age'?[['#36a48c','Under 60 min'],['#e9b43d','60 min–6 h'],['#88969c','6+ h / missing']]:mode==='trend'?[['#d94843','Rising'],['#2c64cc','Falling'],['#36a48c','Steady'],['#88969c','Insufficient data']]:[['#36a46d','Rise ≤0.10 m/h'],['#e9c345','>0.10–0.30'],['#ed8b36','>0.30–0.60'],['#d94843','>0.60 m/h'],['#2c64cc','Falling'],['#36a48c','Steady'],['#88969c','Insufficient data']];
 $('legend').replaceChildren(...entries.map(([colour,label])=>{const entry=node('span'),dot=node('i',undefined,'dot');dot.style.background=colour;entry.append(dot,label);return entry;}));
}
$('colourMode').onchange=()=>{legend();draw();if(frame)saveURL();};
$('comparison').onchange=()=>{legend();if(basin)loadFrame();};
legend();
(async()=>{try{const response=await fetch('/api/archive-rainfall/groups');if(!response.ok)throw new Error();groups=(await response.json()).groups;$('basinGroups').replaceChildren(...groups.map(g=>{const button=node('button',undefined,'basin-choice');button.dataset.basin=g.id;button.append(node('strong',g.label),node('span','→'));button.onclick=()=>openBasin(g.id);return button;}));loadRainfallPriority();if(groups.some(g=>g.id===params.get('basin')))openBasin(params.get('basin'),params.get('gauge'));}catch(_){$('basinGroups').textContent='Could not load groups. Please refresh.';}})();
setInterval(refresh,60000);

async function loadRainfallPriority(){
 try{
  const response=await fetch('/api/archive-rainfall/group-stats',{cache:'no-store'});if(!response.ok)throw new Error();
  const result=await response.json();if(!result.available||!result.groups)throw new Error();
  RainfallGroupPriority.apply($('basinGroups'),result.groups);
  $('groupPriorityStatus').textContent=`Groups prioritised by the latest saved 24-hour rainfall: highest gauge total, then wet-gauge coverage · ending ${date(result.end)} AEST.`;
 }catch(_){window.RainfallGroupPriority?.apply($('basinGroups'),[]);$('groupPriorityStatus').textContent='Rainfall priority unavailable · groups are listed in BoM order.';}
}
