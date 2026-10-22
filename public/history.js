'use strict';
const $=id=>document.getElementById(id);
const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const duration=m=>m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
const mm=value=>value===null?'Incomplete':`${value.toFixed(1)} mm`;
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
const bands=[['green','Green','#36a46d'],['yellow','Yellow','#e9c345'],['orange','Orange','#ed8b36'],['red','Red','#d94843'],['crimson','Crimson','#a71930'],['magenta','Magenta','#cc358c'],['purple','Purple','#863ab5'],['indigo','Indigo','#56339c'],['blue','Blue','#2c64cc'],['navy','Navy','#122e67']].map(([id,name,colour])=>({id,name,colour}));
const colours={missing:'#88969c',...Object.fromEntries(bands.map(b=>[b.id,b.colour]))};
let thresholds=[5,15,30,40,50,80,130,180,200];
const band=value=>value===null?'missing':bands[thresholds.findIndex(limit=>value<=limit)===-1?9:thresholds.findIndex(limit=>value<=limit)].id;
let data=null,selected=null,frame=null,extent=null,chart=null,chartMinutes=15,follow=true,targetEnd=null,loadVersion=0,detailVersion=0,sliderTimer,frameController,detailController;
const params=new URLSearchParams(location.search);
if(params.get('end')){targetEnd=params.get('end');follow=false;}
if(['15','30','60','180','360','720','1440'].includes(params.get('minutes')))$('accumulation').value=params.get('minutes');
selected=params.get('gauge');
const map=L.map('map').setView([-27.25,152.75],9);
let initialFit=!SharedMapView.attach(map);
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
tiles.on('tileerror',()=>{$('tileStatus').hidden=false;});
const layer=L.layerGroup().addTo(map),markers=new Map();
function legend(){
 const entries=[{id:'missing',name:'Grey',label:'Incomplete'},...bands.map((b,i)=>({...b,label:i===0?`0–${thresholds[0]}`:i===9?`>${thresholds[8]}`:`>${thresholds[i-1]}–${thresholds[i]}`}))];
 $('legend').replaceChildren(...entries.map(b=>{const e=node('span'),dot=node('i',undefined,'dot');dot.style.background=colours[b.id];e.append(dot,b.label);return e;}));
 const prior=$('rainFilter').value;$('rainFilter').replaceChildren(new Option('All observations','all'),...entries.map(b=>new Option(`${b.name} · ${b.label}`,b.id)));$('rainFilter').value=prior||'all';
}
function displayLimits(){
 $('thresholdInputs').replaceChildren(...thresholds.map((limit,i)=>{const label=node('label',`${bands[i].name} upper limit (mm)`),input=node('input');input.id=`t${i+1}`;input.type='number';input.min='0';input.step='.1';input.required=true;input.value=limit;label.append(input);return label;}));
}
function notice(text){$('notice').hidden=!text;$('notice').textContent=text||'';}
function localInput(iso){return new Date(Date.parse(iso)+10*3600000).toISOString().slice(0,16);}
function controlTime(){
 if(!extent?.lastEnd)return;
 const first=Date.parse(extent.firstEnd),last=Date.parse(extent.lastEnd),selectedTime=Date.parse(targetEnd);
 $('timeline').max=Math.round((last-first)/900000);$('timeline').value=Math.round((selectedTime-first)/900000);
 $('timeline').disabled=false;$('ending').disabled=false;$('accumulation').disabled=false;$('latest').disabled=false;
 $('ending').min=localInput(extent.firstEnd);$('ending').max=localInput(extent.lastEnd);$('ending').value=localInput(targetEnd);
 $('timeLabel').textContent=`${date(new Date(selectedTime-Number($('accumulation').value)*60000).toISOString())} – ${date(targetEnd)} AEST`;$('timeline').setAttribute('aria-valuetext',`${date(targetEnd)} AEST`);
 $('firstTime').textContent=date(extent.firstEnd);$('lastTime').textContent=date(extent.lastEnd);
 const step=Number($('accumulation').value)*60000,stepLabel=duration(step/60000);
 $('previous').textContent=`← ${stepLabel}`;$('next').textContent=`${stepLabel} →`;
 $('previous').disabled=selectedTime-step<first;$('next').disabled=selectedTime+step>last;
 $('latest').setAttribute('aria-pressed',String(follow));
}
function freshness(){
 if(!extent?.lastEnd)return;
 const age=(Date.now()-Date.parse(extent.lastEnd))/60000;
 const checkedAge=extent.source?.checked_at?(Date.now()-Date.parse(extent.source.checked_at))/60000:Infinity;
 const stale=age>60||age< -5||checkedAge>30||extent.source?.status!=='ok';
 $('freshness').className='badge'+(stale?' stale':'');
 $('freshness').textContent=stale?'● Archive stale / check collector':follow?'● Latest saved observations':'● Historical selection';
 $('newest').textContent=`Newest saved end: ${date(extent.lastEnd)} AEST`;
}
function saveURL(){
 try{const q=new URLSearchParams();if(!follow)q.set('end',targetEnd);q.set('minutes',frame.minutes);if(selected)q.set('gauge',selected);history.replaceState(null,'',`/history?${q}`);}catch(_){}
}
function draw(){
 if(!frame)return;
 const term=$('search').value.toLowerCase(),group=$('group').value,filter=$('rainFilter').value;
 const rows=frame.stations.filter(s=>(!term||s.name.toLowerCase().includes(term))&&(!group||s.group===group)&&(filter==='all'||band(s.depth)===filter)).sort((a,b)=>a.depth===null&&b.depth!==null?1:b.depth===null&&a.depth!==null?-1:(b.depth??0)-(a.depth??0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 layer.clearLayers();markers.clear();$('stations').replaceChildren();let mapped=0;
 for(const station of rows){
  const colour=colours[band(station.depth)],button=node('button',undefined,'station'+(station.id===selected?' active':'')),dot=node('i',undefined,'dot');dot.style.background=colour;
  button.append(dot,node('span',mm(station.depth),'reading'),document.createTextNode(station.name),node('small',`${station.group} · ${station.validBlocks}/${station.expectedBlocks} quarter-hours`));
  if(!station.coordinates)button.append(node('span','Identity / location unresolved · not plotted','unmapped'));
  button.onclick=()=>choose(station.id,true);$('stations').append(button);
  if(station.coordinates){mapped++;const c=station.coordinates,marker=L.circleMarker([c.lat,c.lon],{radius:station.id===selected?10:7,color:station.id===selected?'#123e46':'#fff',weight:2,fillColor:colour,fillOpacity:.94}).addTo(layer);marker.bindTooltip(node('span',`${station.name} · ${mm(station.depth)} / ${duration(frame.minutes)}`));marker.on('click',()=>choose(station.id,false));markers.set(station.id,marker);}
 }
 $('count').textContent=`${rows.length} gauges · ${mapped} mapped · ${rows.filter(s=>s.complete).length} complete`;
 if(!rows.length)$('stations').append(node('p','No gauges match these filters.','filters muted'));
 if(selected&&!rows.some(s=>s.id===selected)){selected=null;detailVersion++;detailController?.abort();data=null;clearIfdChart();chart?.destroy();chart=null;$('detail').replaceChildren(node('p','Select a gauge within these filters.','muted'));}
}
function fit(){const bounds=L.latLngBounds([...markers.values()].map(m=>m.getLatLng()));if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:12,animate:false});}
async function choose(id,pan=false){
 if(!frame)return;
 const station=frame.stations.find(s=>s.id===id);if(!station)return;
 selected=id;draw();saveURL();if(pan&&station.coordinates)map.setView([station.coordinates.lat,station.coordinates.lon],12);
 const version=++detailVersion,frameVersion=loadVersion,end=frame.end;
 detailController?.abort();detailController=new AbortController();data=null;clearIfdChart();chart?.destroy();chart=null;
 $('detail').replaceChildren(node('h2',station.name),node('p','Loading saved quarter-hours…','muted'));
 try{
  const response=await fetch(`/api/archive-rainfall/series?gauge=${encodeURIComponent(id)}&end=${encodeURIComponent(end)}`,{signal:detailController.signal,cache:'no-store'});
  if(!response.ok)throw new Error('Could not read this gauge.');
  const result=await response.json();if(version!==detailVersion||frameVersion!==loadVersion)return;
  if(!result.available||!result.periods?.length){$('detail').replaceChildren(node('h2',station.name),node('p',result.reason==='identity-unresolved'?'No confident station identity is assigned. Saved quarter-hours cannot be shown for this gauge.':'Saved gauge observations are unavailable.'));return;}
  data=result;renderDetail(station,result.stations[0]);
 }catch(error){if(error.name!=='AbortError'&&version===detailVersion)$('detail').replaceChildren(node('h2',station.name),node('p','Could not load saved observations. No rainfall has been estimated.'));}
}
function renderDetail(station,series){
 const host=$('detail');host.replaceChildren();host.append(node('span',station.group.toUpperCase(),'eyebrow'),node('h2',station.name));
 const valid=series.values.filter(v=>v!==null),complete=valid.length===96;
 const metrics=node('div',undefined,'metrics');
 for(const [value,label] of [[mm(station.depth),`Selected ${duration(frame.minutes)} total`],[complete?mm(valid.reduce((a,b)=>a+b,0)):'Incomplete','24-hour total ending at selected time']]){const metric=node('div',undefined,'metric');metric.append(node('strong',value),node('span',label));metrics.append(metric);}host.append(metrics);
 host.append(node('p',`${date(frame.start)} – ${date(frame.end)} AEST · ${station.validBlocks}/${station.expectedBlocks} required quarter-hours present.`,'history-coverage'));
 host.append(node('p',`The chart covers the selected ${duration(frame.minutes)} ending at ${date(frame.end)} AEST, matching the map window. Missing observations remain gaps. Chart interval groups bars only; the IFD comparison independently uses the preceding 24 hours.`,'history-window'));
 const controls=node('div',undefined,'history-chart-controls'),label=node('label','Chart interval'),select=node('select');select.id='chartInterval';const intervals=[15,30,60,180].filter(m=>m<=frame.minutes&&frame.minutes%m===0);
 if(!intervals.includes(chartMinutes))chartMinutes=intervals.at(-1);
 for(const m of intervals)select.append(new Option(duration(m),m));select.value=chartMinutes;label.append(select);controls.append(label);host.append(controls);
 const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.id='hyetograph';canvas.setAttribute('role','img');wrap.append(canvas);host.append(wrap);
 const tw=node('div',undefined,'history-table table-wrap'),table=node('table');table.id='observationTable';tw.append(table);host.append(tw);
 select.onchange=()=>{chartMinutes=Number(select.value);renderChart(series,chartMinutes);};renderChart(series,chartMinutes);
 const comparison=node('section',undefined,'ifd-comparison');comparison.id='ifdComparison';host.append(comparison);renderIfd(series);
 if(station.coordinates){const p=node('p',undefined,'detail-source'),link=node('a',`BoM station ${station.stationNumber} · audited map coordinates`);link.href=station.coordinates.source;link.target='_blank';link.rel='noopener';p.append(link);host.append(p);}
}
function renderChart(station,minutes){
 if(!data)return;
 const step=minutes/15,periods=[],values=[],first=data.periods.length-frame.minutes/15;
 for(let i=first;i<data.periods.length;i+=step){const chunk=station.values.slice(i,i+step);periods.push({start:data.periods[i].start,end:data.periods[i+step-1].end});values.push(chunk.length===step&&chunk.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)?chunk.reduce((a,b)=>a+b,0):null);}
 chart?.destroy();const canvas=$('hyetograph');canvas.setAttribute('aria-label',`${station.name}: saved rainfall in chronological ${duration(minutes)} bars, in millimetres.`);
 chart=new Chart(canvas,{type:'bar',data:{labels:periods.map(p=>date(p.end)),datasets:[{label:`${duration(minutes)} rainfall (mm)`,data:values,backgroundColor:'#36a46d',borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>{const p=periods[items[0].dataIndex];return `${date(p.start)} – ${date(p.end)} AEST`;}}}},scales:{x:{title:{display:true,text:`${duration(minutes)} period ending · AEST`},ticks:{maxTicksLimit:10},grid:{display:false}},y:{beginAtZero:true,title:{display:true,text:'Rainfall (mm)'}}}}});
 const table=$('observationTable');table.replaceChildren();const head=node('thead'),tr=node('tr');for(const text of ['Period start (AEST)','Period end (AEST)','Rainfall (mm)'])tr.append(node('th',text));head.append(tr);table.append(head);const body=node('tbody');periods.forEach((p,i)=>{const row=node('tr');row.append(node('td',date(p.start)),node('td',date(p.end)),node('td',values[i]===null?'Incomplete':values[i].toFixed(1)));body.append(row);});table.append(body);table.parentElement.scrollTop=table.parentElement.scrollHeight;
}
async function loadFrame(){
 if(!extent?.lastEnd)return;
 const version=++loadVersion;detailVersion++;detailController?.abort();frameController?.abort();frameController=new AbortController();
 $('loading').textContent='Loading selection… Existing map shows the previous completed selection.';
 try{
  const response=await fetch(`/api/archive-rainfall/frame?end=${encodeURIComponent(targetEnd)}&minutes=${$('accumulation').value}`,{signal:frameController.signal,cache:'no-store'});
  if(!response.ok)throw new Error('Choose a saved quarter-hour ending time.');const result=await response.json();if(version!==loadVersion)return;
  if(!result.available||!result.stations?.length)throw new Error('The saved rainfall archive is unavailable.');
  frame=result;data=null;clearIfdChart();chart?.destroy();chart=null;
  const group=$('group').value;$('group').replaceChildren(new Option('All groups',''),...[...new Set(frame.stations.map(s=>s.group))].sort().map(g=>new Option(g,g)));$('group').value=group;
  $('period').textContent=`${duration(frame.minutes)} · ${date(frame.start)} – ${date(frame.end)} AEST`;$('legendTitle').textContent=`Rainfall · mm / ${duration(frame.minutes)}`;
  $('loading').textContent='';notice('');draw();if(initialFit){fit();initialFit=false;}if(selected)choose(selected,false);saveURL();freshness();
 }catch(error){if(error.name!=='AbortError'&&version===loadVersion){$('loading').textContent='Selection not loaded.';notice(`${error.message} ${frame?'The map still shows its earlier labelled window.':'No historical observations are displayed.'}`);}}
}
async function refresh(){
 $('refresh').disabled=true;
 try{
  const response=await fetch('/api/archive-rainfall/extent',{cache:'no-store'});if(!response.ok)throw new Error('Could not read archive.');
  const result=await response.json();if(!result.available||!result.lastEnd)throw new Error('Saved rainfall archive is unavailable or empty. The live rainfall bulletin remains available.');
  extent=result;if(follow||!targetEnd)targetEnd=extent.lastEnd;
  const time=Date.parse(targetEnd);if(!Number.isFinite(time)||time<Date.parse(extent.firstEnd)||time>Date.parse(extent.lastEnd)){targetEnd=extent.lastEnd;follow=true;}
  controlTime();freshness();await loadFrame();
 }catch(error){notice(error.message);$('freshness').className='badge stale';$('freshness').textContent='● Archive unavailable';}
 finally{$('refresh').disabled=false;}
}
function selectTime(end){targetEnd=end;follow=false;loadVersion++;detailVersion++;frameController?.abort();detailController?.abort();controlTime();$('loading').textContent='Loading selection… Existing map shows the previous completed selection.';clearTimeout(sliderTimer);sliderTimer=setTimeout(loadFrame,180);}
$('timeline').oninput=()=>selectTime(new Date(Date.parse(extent.firstEnd)+Number($('timeline').value)*900000).toISOString());
$('ending').onchange=()=>{const time=Date.parse($('ending').value+'+10:00');if(!Number.isFinite(time)||time<Date.parse(extent.firstEnd)||time>Date.parse(extent.lastEnd)||time%900000!==0){notice('Choose a saved ending time on a 15-minute boundary, in Brisbane time.');return;}selectTime(new Date(time).toISOString());};
$('previous').onclick=()=>selectTime(new Date(Date.parse(targetEnd)-Number($('accumulation').value)*60000).toISOString());$('next').onclick=()=>selectTime(new Date(Date.parse(targetEnd)+Number($('accumulation').value)*60000).toISOString());
$('latest').onclick=()=>{follow=true;targetEnd=extent.lastEnd;controlTime();clearTimeout(sliderTimer);loadFrame();};
$('accumulation').onchange=()=>{controlTime();clearTimeout(sliderTimer);loadFrame();};$('refresh').onclick=refresh;$('fit').onclick=fit;
for(const id of ['search','group','rainFilter'])$(id).addEventListener(id==='search'?'input':'change',()=>{draw();saveURL();});
$('thresholds').onsubmit=event=>{event.preventDefault();const values=thresholds.map((_,i)=>Number($(`t${i+1}`).value));if(values.some(v=>!Number.isFinite(v)||v<0)||values.some((v,i)=>i>0&&v<=values[i-1])){$('thresholdError').textContent='Enter increasing non-negative limits.';return;}$('thresholdError').textContent='';thresholds=values;legend();draw();};
displayLimits();legend();refresh();setInterval(refresh,60000);
