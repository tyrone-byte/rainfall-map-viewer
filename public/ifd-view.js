'use strict';
let ifdReference=null,ifdReferenceError=null,ifdChart=null,ifdMode='latest';
let ifdIndex=null,ifdIndexError=null;
const ifdLocationFiles=new Map(),ifdSelections=new Map();
function gaugeLocationKey(station){if(station.ifdLocationKey)return station.ifdLocationKey;const c=station.coordinates;return c?`${c.lat.toFixed(6)},${c.lon.toFixed(6)}`:null;}
function redrawSelectedIfd(){if(typeof data!=='undefined'&&data&&selected){const s=data.stations.find(s=>s.id===selected);if(s)renderIfd(s);}}
function localIfd(station){
 const key=gaugeLocationKey(station);
 if(!ifdIndex)return {state:ifdIndexError?'index-error':'loading-index'};
 const entry=key?ifdIndex.locations[key]:null;
 if(!entry)return {state:'unavailable'};
 if(!ifdLocationFiles.has(key)){
  ifdLocationFiles.set(key,{state:'loading'});
  fetch(`/reference/local-ifd/${encodeURIComponent(entry.file)}`).then(r=>{if(!r.ok)throw new Error('Local IFD file could not be loaded.');return r.json();}).then(result=>{
   if(result.locationKey!==key||!Array.isArray(result.datasets)||!result.datasets.length)throw new Error('Local IFD location or dataset metadata does not match.');
   ifdLocationFiles.set(key,{state:'ready',data:result,file:entry.file});
  }).catch(error=>ifdLocationFiles.set(key,{state:'error',error:error.message})).finally(redrawSelectedIfd);
 }
 return ifdLocationFiles.get(key);
}
const referenceAeps=[50,20,10,5,2,1,.1];
const referenceColours=['#a1b5b4','#75a8b5','#448fb1','#5574ad','#8065ae','#b15b93','#c75a56'];
function clearIfdChart(){if(ifdChart)ifdChart.destroy();ifdChart=null;}
function renderIfd(station){
 const host=$('ifdComparison');if(!host)return;
 clearIfdChart();host.replaceChildren();
 const local=localIfd(station),key=gaugeLocationKey(station);
 const isLocal=local.state==='ready';
 host.append(node('span','DESIGN RAINFALL COMPARISON','eyebrow'),node('h2',isLocal?'Observed rainfall & local 2030 IFD':'Observed rainfall & Brisbane 2030 IFD'));
 const blockMinutes=data.periodMinutes||180,blockLabel=blockMinutes===15?'15-minute':'3-hour';
 host.append(node('p',data.periodMinutes===15?`${station.name} · Saved quarter-hours ending ${date(data.periods.at(-1).end)} AEST`:`${station.name} · BoM bulletin issued ${date(data.issuedAt)} AEST`,'ifd-station'));
 if(['loading-index','loading'].includes(local.state)){host.append(node('p','Checking saved local IFD datasets…','muted'));return;}
 if(local.state==='error'){host.append(node('p',`${local.error} No regional table has been substituted for the known local dataset.`,'unmapped'));return;}
 let reference=ifdReference,selectedDataset=null;
 if(isLocal){
  host.append(node('p',`Local gauge coordinates ${local.data.coordinates.lat}, ${local.data.coordinates.lon} · ARR Data Hub ${local.data.datahubVersion} · depths in mm · 2030 baseline.`,'ifd-provisional'));
  const controls=node('div',undefined,'ifd-controls'),label=node('label','Local dataset and climate scenario'),select=node('select');select.id='ifdDataset';
  select.append(new Option('Choose a local 2030 dataset…',''));
  for(const family of [...new Set(local.data.datasets.map(d=>d.family))]){
   const group=node('optgroup');group.label=family;
   for(const dataset of local.data.datasets.filter(d=>d.family===family))group.append(new Option(`${family} · ${dataset.scenario} · 2030`,dataset.name));
   select.append(group);
  }
  select.value=ifdSelections.get(key)||'';select.onchange=()=>{ifdSelections.set(key,select.value);renderIfd(station);};label.append(select);controls.append(label);host.append(controls);
  selectedDataset=local.data.datasets.find(d=>d.name===select.value);
  host.append(node('p','Local design rainfall at the gauge coordinates. Choose the dataset family and climate scenario explicitly; these are design estimates, not a warning or a return period assigned to this event.','muted'));
  if(!selectedDataset){host.append(node('p','Select one of the saved 2030 datasets to show the comparison. No dataset or climate scenario is selected automatically.','history-message'));return;}
  reference=selectedDataset;
  host.append(node('p',`Selected: ${selectedDataset.name}`,'ifd-explanation'));
 }else{
  host.append(node('p','Brisbane 2030 reference · rainfall depths in mm, confirmed by the table provider. User-supplied design scenario.','ifd-provisional'));
  host.append(node('p',`${ifdIndexError?'Local IFD index unavailable. ':''}No local IFD table loaded for this gauge. Showing the shared Brisbane reference only; it is not a station-specific AEP assessment or warning level.`,'unmapped'));
 }
 if(!reference){host.append(node('p',ifdReferenceError||'Loading IFD reference…','muted'));return;}
 const control=node('div',undefined,'ifd-controls'),label=node('label','Observed accumulation'),select=node('select');select.id='ifdMode';
 select.append(new Option(data.periodMinutes===15?'Ending at selected time':'Ending at latest observation','latest'),new Option('Wettest available window','wettest'));select.value=ifdMode;
 select.onchange=()=>{ifdMode=select.value;renderIfd(station);};label.append(select);control.append(label);host.append(control);
 const points=RainfallIFD.accumulations(station.values,data.periods,ifdMode,blockMinutes);
 const hasGaps=points.some(p=>p.validWindows<p.possibleWindows);
 host.append(node('p',ifdMode==='latest'?`Accumulations ending ${date(data.periods.at(-1).end)} AEST. Only consecutive, complete ${blockLabel} blocks are summed.`:`Each duration uses its wettest complete window within the displayed 24 hours. Dots may have different ending times. Only windows aligned to the ${blockLabel} observation blocks can be assessed.`,'ifd-explanation'));
 if(hasGaps)host.append(node('p',ifdMode==='latest'?'Missing observations leave gaps in the observed comparison.':'Incomplete windows excluded. With missing data, the true wettest accumulation may be higher than the available result.','unmapped'));
 const wrap=node('div',undefined,'ifd-chart'),canvas=node('canvas');canvas.id='ifdChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${station.name}: observed accumulated rainfall depths from ${blockMinutes} minutes to 24 hours against ${isLocal?'local ARR':'shared Brisbane'} 2030 design rainfall curves. Summary values are in the following table.`);wrap.append(canvas);host.append(wrap);
 const datasets=referenceAeps.map((aep,i)=>({label:`${aep}% AEP reference`,data:reference.points.filter(p=>p.minutes<=1440).map(p=>({x:p.minutes,y:p.depths[reference.aeps.indexOf(aep)]})),borderColor:referenceColours[i],backgroundColor:referenceColours[i],borderWidth:1.6,pointRadius:0,pointHitRadius:5,tension:0,order:2}));
 datasets.unshift({label:ifdMode==='latest'?'Observed · ending latest':'Observed · wettest complete windows',data:points.map(p=>({x:p.minutes,y:p.depth})),borderColor:'#123f43',backgroundColor:'#123f43',borderWidth:3,borderDash:[5,4],pointRadius:5,pointHoverRadius:7,pointBorderColor:'#fff',pointBorderWidth:1.5,spanGaps:false,order:1});
 const shortDuration={id:'shortDuration',beforeDraw(c){const {ctx,chartArea:a,scales:{x}}=c;if(!a)return;const limit=x.getPixelForValue(blockMinutes);ctx.save();ctx.fillStyle='#eef2f3';ctx.fillRect(a.left,a.top,limit-a.left,a.bottom-a.top);ctx.strokeStyle='#9eacb1';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(limit,a.top);ctx.lineTo(limit,a.bottom);ctx.stroke();ctx.restore();}};
 ifdChart=new Chart(canvas,{type:'line',data:{datasets},plugins:[shortDuration],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9,font:{size:11}}},tooltip:{callbacks:{title:items=>{const m=items[0].parsed.x;return m<60?`${m} minutes`:`${m/60} hours`;},label:context=>`${context.dataset.label}: ${mm(context.parsed.y)}`,afterLabel:context=>{if(context.datasetIndex!==0)return 'Design reference depth · mm';const p=points[context.dataIndex];return [`${date(p.start)} – ${date(p.end)} AEST`,`${p.validWindows}/${p.possibleWindows} complete windows`];}}}},scales:{x:{type:'logarithmic',min:5,max:1440,afterBuildTicks:axis=>{axis.ticks=[5,15,30,60,180,360,720,1440].map(value=>({value}));},ticks:{maxRotation:0,autoSkip:false,callback:value=>value<60?`${value}m`:`${value/60}h`},title:{display:true,text:'Rainfall duration · logarithmic scale'}},y:{beginAtZero:true,title:{display:true,text:'Accumulated rainfall depth (mm)'}}}}});
 host.append(node('p',`Shaded durations below ${blockMinutes===15?'15 minutes':'3 hours'} have no observed data. Dots are sums of complete ${blockLabel} blocks; dashed connectors do not reconstruct shorter bursts. Reference curves connect supplied table points.`,'muted'));
 const tw=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),row=node('tr');
 for(const text of ['Duration','Observed (mm)','Window (AEST)','10% AEP reference','1% AEP reference','0.1% AEP reference'])row.append(node('th',text));head.append(row);table.append(head);
 const body=node('tbody');
 for(const hours of (blockMinutes===15?[.25,.5,1,3,6,12,24]:[3,6,12,24])){
  const p=points.find(p=>p.minutes===hours*60),r=reference.points.find(p=>p.minutes===hours*60),tr=node('tr');
  tr.append(node('td',hours<1?`${hours*60} minutes`:`${hours} hours`),node('td',p?mm(p.depth):'Unavailable'),node('td',p?.depth!==null&&p?.start?`${date(p.start)} – ${date(p.end)}`:'No complete window'));
  for(const aep of [10,1,.1])tr.append(node('td',r?mm(r.depths[reference.aeps.indexOf(aep)]):'Not supplied'));
  body.append(tr);
 }
 table.append(body);tw.append(table);host.append(tw);
 const source=node('p',undefined,'detail-source'),link=node('a',isLocal?'Download saved local IFD datasets':'Download supplied Brisbane 2030 IFD table');
 link.href=isLocal?`/reference/local-ifd/${encodeURIComponent(local.file)}`:'/reference/brisbane-ifd-2030.csv';
 link.download=isLocal?local.file:'brisbane-ifd-2030.csv';
 source.append(link,isLocal?` · ${local.data.attribution} · ${selectedDataset.name}. No AEP is assigned to the observed rainfall.`:' · User supplied “Default Current (2030) Baseline”. No AEP is assigned to the observed rainfall.');host.append(source);
}
fetch('/reference/brisbane-ifd-2030.csv').then(response=>{if(!response.ok)throw new Error('IFD reference is unavailable.');return response.text();}).then(csv=>{ifdReference=RainfallIFD.parseReference(csv);}).catch(error=>{ifdReferenceError=error.message;}).finally(()=>{if(typeof data!=='undefined'&&data&&selected){const s=data.stations.find(s=>s.id===selected);if(s)renderIfd(s);}});

fetch('/reference/local-ifd-index.json').then(r=>{if(!r.ok)throw new Error('Local IFD index unavailable.');return r.json();}).then(index=>{if(!index.locations||index.schemaVersion!==1)throw new Error('Local IFD index format not recognised.');ifdIndex=index;}).catch(error=>{ifdIndexError=error.message;}).finally(redrawSelectedIfd);
