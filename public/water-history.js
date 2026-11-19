'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const localInput=iso=>new Date(Date.parse(iso)+36000000).toISOString().slice(0,16);
const duration=m=>m>=2880?`${m/1440} days`:m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
const level=v=>v===null?'No reading':`${v.toFixed(2)} m`;
const params=new URLSearchParams(location.search);
if(['trend','rate','age','flood'].includes(params.get('colours')))$('colourMode').value=params.get('colours');

if(['15','30','60','180'].includes(params.get('comparison')))$('comparison').value=params.get('comparison');
let showRecordedPoints=false;
let basin=null,groups=[],extent=null,frame=null,selected=null,end=params.get('end'),follow=!end,version=0,controller,fitPending=true,refreshVersion=0,focusPending=false;
if(['15','30','60','180','360','720','1440','2880','4320','10080'].includes(params.get('minutes')))$('accumulation').value=params.get('minutes');
$('ending').step='60';
const map=L.map('map',{scrollWheelZoom:true,dragging:!L.Browser.mobile,tapHold:false}).setView([-22.5,145.5],5);SharedMapView.attach(map);MobileViewer.attach(map);
MapBackgrounds.attach(map,$('background'));MapContext.attach(map);
const waterRenderer=L.svg({padding:.5});
const layer=L.layerGroup().addTo(map),markers=new Map();
function notice(text){$('notice').hidden=!text;$('notice').textContent=text||'';}
function saveURL(){const q=new URLSearchParams({basin,minutes:$('accumulation').value,colours:$('colourMode').value,comparison:$('comparison').value});if(!follow)q.set('end',end);if(selected)q.set('gauge',selected);history.replaceState(null,'',`/water-history?${q}`);map.selectionEnd=frame?.end||end;map.shareViewLinks?.();}
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
function clearDetail(){selected=null;}
function gaugeSelection(){return {view:'water',end:frame.end,minutes:frame.minutes};}
function draw(){
 if(!frame)return;
 const term=$('search').value.trim().toLowerCase(),group=$('group').value;
 const rows=frame.stations.filter(s=>(!s.basinId||s.basinId===basin)&&(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)).sort((a,b)=>a.name.localeCompare(b.name));
 const scroll=document.querySelector('.sidebar').scrollTop;layer.clearLayers();markers.clear();$('stations').replaceChildren();
 for(const s of rows){
  const button=GaugeNavigation.link(map,s,gaugeSelection()),dot=node('i',undefined,'dot');dot.style.background=pointColour(s);
  button.className='station'+(s.id===selected?' active':'');button.append(dot,node('span',level(s.level),'reading'),document.createTextNode(s.name),node('small',`${s.group} · ${s.datum}`),node('small',s.observedAt?`${date(s.observedAt)} AEST · ${s.status==='current'?'under 60 min old':s.status==='suspect'?'60 min–6 h old':s.status==='out'?'6+ h old':'missing level'}`:'No observation in this window'));
  button.append(node('small',s.flood?.category&&s.flood.category!=='unknown'?(s.flood.category==='below'?'Below minor flood':s.flood.category+' flood'):'Flood thresholds / classification unavailable'));
  if(!s.coordinates)button.append(node('span','Location unresolved · not plotted','unmapped'));
  $('stations').append(button);
  if(s.coordinates){const marker=WaterGaugeMarker.create([s.coordinates.lat,s.coordinates.lon],{...WaterGaugeStatus.classify(s,$('colourMode').value),id:s.id,selected:selected===s.id,renderer:waterRenderer}).addTo(layer);const tooltip=node('div',undefined,'gauge-tooltip');tooltip.append(node('strong',s.name),node('div',`${s.level===null?'No reading':`${level(s.level)} ${s.datum}`} · ${duration(frame.minutes)} view`));marker.bindTooltip(tooltip);marker.on('click',()=>GaugeNavigation.open(map,s,gaugeSelection()));markers.set(s.id,marker);}
 }
 document.querySelector('.sidebar').scrollTop=scroll;$('count').textContent=`${rows.length} gauges · ${markers.size} mapped · ${rows.filter(s=>s.level!==null).length} with readings`;
 if(selected&&!rows.some(s=>s.id===selected))clearDetail();
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12,animate:false});}
async function loadFrame(){
 if(!basin||!extent?.lastEnd)return;const token=++version;controller?.abort();controller=new AbortController();$('loading').textContent='Loading selection…';
 try{
  const response=await fetch(`/api/archive-water/frame?basin=${encodeURIComponent(basin)}&end=${encodeURIComponent(end)}&minutes=${$('accumulation').value}&comparison=${$('comparison').value}`,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token!==version)return;if(!result.available)throw new Error();
  frame=result;legend();const group=$('group').value;$('group').replaceChildren(new Option('All catchments in this group',''),...[...new Set(frame.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=group;
  $('period').textContent=`${duration(frame.minutes)} · ${date(frame.start)} – ${date(frame.end)} AEST`;draw();if(focusPending){const gauge=frame.stations.find(s=>s.id===selected);if(gauge?.coordinates)map.setView([gauge.coordinates.lat,gauge.coordinates.lon],12,{animate:false});else fit();focusPending=false;fitPending=false;}else if(fitPending){fit();fitPending=false;}saveURL();notice('');
 }catch(error){if(error.name!=='AbortError'&&token===version)notice('Could not load this saved selection. Any displayed map retains its earlier labelled time window.');}
 finally{if(token===version)$('loading').textContent='';}
}
async function refresh(){
 ViewerData.clear();
 if(!basin)return;const token=++refreshVersion;$('refresh').disabled=true;
 try{
  const response=await fetch('/api/archive-water/extent',{cache:'no-store'});if(!response.ok)throw new Error();const result=await response.json();if(token!==refreshVersion)return;
  if(!result.available||!result.lastEnd)throw new Error();extent=result;
  if(follow||!end||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(extent.firstEnd)||Date.parse(end)>Date.parse(extent.lastEnd)){end=extent.lastEnd;follow=true;}
  controls();await loadFrame();
 }catch(_){if(token===refreshVersion){notice('Could not read saved water-level data. Please try Refresh saved data.');$('freshness').textContent='● Archive unavailable';}}
 finally{if(token===refreshVersion)$('refresh').disabled=false;}
}
async function openBasin(id,gauge=null,preserveView=false){
 const group=groups.find(g=>g.id===id);if(!group)return;version++;refreshVersion++;controller?.abort();clearDetail();basin=id;selected=gauge;frame=null;layer.clearLayers();markers.clear();$('stations').replaceChildren();$('search').value='';$('group').replaceChildren(new Option('All catchments in this group',''));document.querySelector('.sidebar').scrollTop=0;document.querySelector('.workspace').scrollTop=0;fitPending=!preserveView&&!gauge;focusPending=!!gauge&&!preserveView;
 MobileViewer.setGroup(id);MobileViewer.showMap();$('groupPicker').hidden=true;$('historyWorkspace').hidden=false;$('basinTitle').textContent=group.label;$('period').textContent='Loading saved water levels';map.invalidateSize();await refresh();
}
document.querySelector('.page-tabs [aria-current="page"]').onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();version++;refreshVersion++;controller?.abort();clearDetail();basin=null;frame=null;layer.clearLayers();markers.clear();MobileViewer.setGroup(null);$('historyWorkspace').hidden=false;$('groupPicker').hidden=false;$('freshness').textContent='Choose a water-level group';$('refresh').disabled=true;loadRainfallPriority();notice('');history.replaceState(null,'','/water-history');$('mapGroup').focus({preventScroll:true});map.viewportLayout?.fit();};
function selectTime(time){end=time;follow=false;controls();loadFrame();}
$('ending').onchange=()=>{const time=Date.parse($('ending').value+'+10:00');if(!Number.isFinite(time)||time<Date.parse(extent.firstEnd)||time>Date.parse(extent.lastEnd)){notice('Choose an ending time within the saved range, in Brisbane time.');return;}selectTime(new Date(time).toISOString());};
$('previous').onclick=()=>selectTime(new Date(Date.parse(end)-Number($('accumulation').value)*60000).toISOString());$('next').onclick=()=>selectTime(new Date(Date.parse(end)+Number($('accumulation').value)*60000).toISOString());
$('latest').onclick=()=>{follow=true;end=extent.lastEnd;controls();loadFrame();};$('accumulation').onchange=()=>{controls();loadFrame();};$('refresh').onclick=refresh;$('fit').onclick=fit;
for(const id of ['search','group'])$(id).addEventListener(id==='search'?'input':'change',()=>{draw();saveURL();if(id==='group'){fit();MobileViewer.showMap();}});
function pointColour(station){return WaterGaugeStatus.classify(station,$('colourMode').value).colour;}
function legend(){
 const comparison=frame?.comparisonMinutes||Number($('comparison').value),mode=$('colourMode').value;$('comparison').disabled=mode==='age'||mode==='flood';
 $('legendTitle').textContent=mode==='flood'?'Published flood category · matching datum':mode==='age'?'Observation age at selected ending time':`${mode==='trend'?'Measured level change':'Rate of rise / fall'} · ${duration(comparison)} comparison`;
 const entries=mode==='flood'?[['#36a48c','Below minor'],['#d5ad20','Minor'],['#e77f25','Moderate'],['#c73546','Major'],['#88969c','Unassessed']]:mode==='age'?[['#36a48c','Under 60 min'],['#e9b43d','60 min–6 h'],['#88969c','6+ h / missing']]:mode==='trend'?[['#d94843','Rising'],['#2c64cc','Falling'],['#36a48c','Steady'],['#88969c','Insufficient data']]:[['#36a46d','Rise ≤0.10 m/h'],['#e9c345','>0.10–0.30'],['#ed8b36','>0.30–0.60'],['#d94843','>0.60 m/h'],['#2c64cc','Falling'],['#36a48c','Steady'],['#88969c','Insufficient data']];
 $('legend').replaceChildren(...entries.map(([colour,label])=>{const entry=node('span'),dot=node('i',undefined,'dot');dot.style.background=colour;entry.append(dot,label);return entry;}));
}
$('colourMode').onchange=()=>{legend();draw();if(frame)saveURL();};
$('comparison').onchange=()=>{legend();if(basin)loadFrame();};
legend();
(async()=>{try{const response=await fetch('/api/archive-rainfall/groups');if(!response.ok)throw new Error();groups=(await response.json()).groups;MobileViewer.setGroups(groups);$('basinGroups').replaceChildren(...groups.map(g=>{const button=node('button',undefined,'basin-choice');button.dataset.basin=g.id;button.append(node('strong',g.label),node('span','→'));button.onclick=()=>openBasin(g.id);return button;}));loadRainfallPriority();if(groups.some(g=>g.id===params.get('basin')))openBasin(params.get('basin'),params.get('gauge'),params.get('view')==='keep'&&map.sharedViewRestored);}catch(_){$('basinGroups').textContent='Could not load groups. Please refresh.';}})();
setInterval(refresh,60000);

async function loadRainfallPriority(){
 try{
  const response=await fetch('/api/archive-rainfall/group-stats',{cache:'no-store'});if(!response.ok)throw new Error();
  const result=await response.json();if(!result.available||!result.groups)throw new Error();
  RainfallGroupPriority.apply($('basinGroups'),result.groups);
  $('groupPriorityStatus').textContent=`Groups prioritised by the latest saved 24-hour rainfall: highest gauge total, then wet-gauge coverage · ending ${date(result.end)} AEST.`;
 }catch(_){window.RainfallGroupPriority?.apply($('basinGroups'),[]);$('groupPriorityStatus').textContent='Rainfall priority unavailable · groups are listed in BoM order.';}
}

document.addEventListener('viewer-group-select',event=>{if(event.detail)openBasin(event.detail);});
