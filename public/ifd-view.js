'use strict';
let ifdReference=null,ifdReferenceError=null,ifdChart=null,ifdMode='latest';
const referenceAeps=[50,20,10,5,2,1,.1];
const referenceColours=['#a1b5b4','#75a8b5','#448fb1','#5574ad','#8065ae','#b15b93','#c75a56'];
function clearIfdChart(){if(ifdChart)ifdChart.destroy();ifdChart=null;}
function renderIfd(station){
 const host=$('ifdComparison');if(!host)return;
 clearIfdChart();host.replaceChildren();
 host.append(node('span','DESIGN RAINFALL COMPARISON','eyebrow'),node('h2','Observed rainfall & Brisbane 2030 IFD'));
 host.append(node('p',`${station.name} · BoM bulletin issued ${date(data.issuedAt)} AEST`,'ifd-station'));
 host.append(node('p','Brisbane 2030 reference · rainfall depths in mm, confirmed by the table provider. User-supplied design scenario.','ifd-provisional'));
 host.append(node('p','Brisbane reference scenario applied for context across all gauges. This is not a station-specific AEP assessment or a warning level.','muted'));
 if(!ifdReference){host.append(node('p',ifdReferenceError||'Loading IFD reference…','muted'));return;}
 const control=node('div',undefined,'ifd-controls'),label=node('label','Observed accumulation'),select=node('select');select.id='ifdMode';
 select.append(new Option('Ending at latest observation','latest'),new Option('Wettest available window','wettest'));select.value=ifdMode;
 select.onchange=()=>{ifdMode=select.value;renderIfd(station);};label.append(select);control.append(label);host.append(control);
 const points=RainfallIFD.accumulations(station.values,data.periods,ifdMode);
 const hasGaps=points.some(p=>p.validWindows<p.possibleWindows);
 host.append(node('p',ifdMode==='latest'?`Accumulations ending ${date(data.periods.at(-1).end)} AEST. Only consecutive, complete 3-hour blocks are summed.`:'Each duration uses its wettest complete window within this bulletin. Dots may have different ending times. Only windows aligned to the 3-hour bulletin blocks can be assessed.','ifd-explanation'));
 if(hasGaps)host.append(node('p',ifdMode==='latest'?'Missing observations leave gaps in the observed comparison.':'Incomplete windows excluded. With missing data, the true wettest accumulation may be higher than the available result.','unmapped'));
 const wrap=node('div',undefined,'ifd-chart'),canvas=node('canvas');canvas.id='ifdChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${station.name}: observed accumulated rainfall depths from 3 to 24 hours against user-supplied Brisbane 2030 design rainfall curves. Summary values are in the following table.`);wrap.append(canvas);host.append(wrap);
 const datasets=referenceAeps.map((aep,i)=>({label:`${aep}% AEP reference`,data:ifdReference.points.filter(p=>p.minutes<=1440).map(p=>({x:p.minutes,y:p.depths[ifdReference.aeps.indexOf(aep)]})),borderColor:referenceColours[i],backgroundColor:referenceColours[i],borderWidth:1.6,pointRadius:0,pointHitRadius:5,tension:0,order:2}));
 datasets.unshift({label:ifdMode==='latest'?'Observed · ending latest':'Observed · wettest complete windows',data:points.map(p=>({x:p.minutes,y:p.depth})),borderColor:'#123f43',backgroundColor:'#123f43',borderWidth:3,borderDash:[5,4],pointRadius:5,pointHoverRadius:7,pointBorderColor:'#fff',pointBorderWidth:1.5,spanGaps:false,order:1});
 const shortDuration={id:'shortDuration',beforeDraw(c){const {ctx,chartArea:a,scales:{x}}=c;if(!a)return;const limit=x.getPixelForValue(180);ctx.save();ctx.fillStyle='#eef2f3';ctx.fillRect(a.left,a.top,limit-a.left,a.bottom-a.top);ctx.strokeStyle='#9eacb1';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(limit,a.top);ctx.lineTo(limit,a.bottom);ctx.stroke();ctx.restore();}};
 ifdChart=new Chart(canvas,{type:'line',data:{datasets},plugins:[shortDuration],options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',intersect:false},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:9,font:{size:11}}},tooltip:{callbacks:{title:items=>{const m=items[0].parsed.x;return m<60?`${m} minutes`:`${m/60} hours`;},label:context=>`${context.dataset.label}: ${mm(context.parsed.y)}`,afterLabel:context=>{if(context.datasetIndex!==0)return 'Design reference depth · mm';const p=points[context.dataIndex];return [`${date(p.start)} – ${date(p.end)} AEST`,`${p.validWindows}/${p.possibleWindows} complete windows`];}}}},scales:{x:{type:'logarithmic',min:5,max:1440,afterBuildTicks:axis=>{axis.ticks=[5,15,30,60,180,360,720,1440].map(value=>({value}));},ticks:{maxRotation:0,autoSkip:false,callback:value=>value<60?`${value}m`:`${value/60}h`},title:{display:true,text:'Rainfall duration · logarithmic scale'}},y:{beginAtZero:true,title:{display:true,text:'Accumulated rainfall depth (mm)'}}}}});
 host.append(node('p','Shaded durations below 3 hours have no observed data. Dots are sums of complete 3-hour blocks; dashed connectors do not reconstruct shorter bursts. Reference curves connect supplied table points.','muted'));
 const tw=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),row=node('tr');
 for(const text of ['Duration','Observed (mm)','Window (AEST)','10% AEP reference','1% AEP reference','0.1% AEP reference'])row.append(node('th',text));head.append(row);table.append(head);
 const body=node('tbody');
 for(const hours of [3,6,12,24]){
  const p=points.find(p=>p.minutes===hours*60),r=ifdReference.points.find(p=>p.minutes===hours*60),tr=node('tr');
  tr.append(node('td',`${hours} hours`),node('td',p?mm(p.depth):'Unavailable'),node('td',p?.depth!==null&&p?.start?`${date(p.start)} – ${date(p.end)}`:'No complete window'));
  for(const aep of [10,1,.1])tr.append(node('td',r?mm(r.depths[ifdReference.aeps.indexOf(aep)]):'Not supplied'));
  body.append(tr);
 }
 table.append(body);tw.append(table);host.append(tw);
 const source=node('p',undefined,'detail-source'),link=node('a','Download supplied Brisbane 2030 IFD table');link.href='/reference/brisbane-ifd-2030.csv';link.download='brisbane-ifd-2030.csv';source.append(link,' · User supplied “Default Current (2030) Baseline”. No AEP is assigned to the observed rainfall.');host.append(source);
}
fetch('/reference/brisbane-ifd-2030.csv').then(response=>{if(!response.ok)throw new Error('IFD reference is unavailable.');return response.text();}).then(csv=>{ifdReference=RainfallIFD.parseReference(csv);}).catch(error=>{ifdReferenceError=error.message;}).finally(()=>{if(typeof data!=='undefined'&&data&&selected){const s=data.stations.find(s=>s.id===selected);if(s)renderIfd(s);}});
