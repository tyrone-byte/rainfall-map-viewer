/* Shared measured-observation charts for the main viewers and Dams. */
(function(root){
 'use strict';
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
 const preciseDate=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const duration=m=>m>=2880?`${m/1440} days`:m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
 const mm=v=>v===null||!Number.isFinite(v)?'Incomplete':`${v.toFixed(1)} mm`;
 function water(host,station,result,{showPoints=false,onPoints=()=>{},links=()=>{}}={}){
  host.replaceChildren(node('span',(station.group||'').toUpperCase(),'eyebrow'),node('h2',station.name),node('h3',`${station.level===null?'No reading':station.level.toFixed(2)+' m'} · ${station.datum}`),node('p',`Last observation: ${station.observedAt?date(station.observedAt)+' AEST':'none in this window'}`,'muted'));
  links(host,station);
  if(!result.observations.length){host.append(node('p','No saved observations in this window.'));return null;}
  const controls=node('div',undefined,'water-plot-controls'),label=node('label'),points=node('input');points.type='checkbox';points.id='showRecordedPoints';points.checked=showPoints;label.append(points,document.createTextNode('Show recorded points'));controls.append(label);host.append(controls);
  const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.id='waterHistoryChart';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${station.name}: saved water levels over the selected duration`);wrap.append(canvas);host.append(wrap);
  const datums=[...new Set(result.observations.map(o=>o.datum))];
  const datasets=datums.map((datum,index)=>({label:`Gauge height · m ${datum}`,data:result.observations.map(o=>({x:Date.parse(o.time),y:o.datum===datum?o.level:null})),borderColor:['#228d85','#7350a0','#b06c28'][index%3],borderWidth:2,pointRadius:showPoints?3:0,pointHitRadius:7,spanGaps:false,tension:0,segment:{borderDash:ctx=>ctx.p1.parsed.x-ctx.p0.parsed.x>3600000?[6,5]:undefined}}));
  const chart=new Chart(canvas,{type:'line',data:{datasets},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{tooltip:{callbacks:{title:items=>preciseDate(items[0].parsed.x)+' AEST'}}},scales:{x:{type:'linear',min:Date.parse(result.start),max:Date.parse(result.end),ticks:{maxTicksLimit:8,callback:value=>date(value)},title:{display:true,text:'Observation time · Brisbane AEST'}},y:{title:{display:true,text:'Gauge height · metres (see datum in legend)'}}}}});
  points.onchange=()=>{onPoints(points.checked);for(const dataset of chart.data.datasets)dataset.pointRadius=points.checked?3:0;chart.update('none');};
  const notes=node('details',undefined,'plot-notes');notes.append(node('summary','Data notes'),node('p',`${result.observations.length} saved readings · ${date(result.start)} – ${date(result.end)} AEST. Lines connect recorded values; dashed segments indicate gaps over 60 minutes, not a communications fault. Missing values and datum changes break the line. No readings are created or accumulated. AHD and local gauge heights are not interchangeable.`,'muted'));
  if(Number.isFinite(station.ratePerHour))notes.append(node('p',`Measured comparison: ${preciseDate(station.movementStartAt)} – ${preciseDate(station.movementEndAt)} AEST · ${station.levelChange.toFixed(3)} m · ${station.ratePerHour.toFixed(3)} m/h. No tidal adjustment.`,'muted'));
  host.append(notes);return chart;
 }
 function rainfall(host,station,series,data,minutes,{interval=15,onInterval=()=>{},renderIfd=()=>{}}={}){
  host.replaceChildren(node('span',(station.group||'').toUpperCase(),'eyebrow'),node('h2',station.name));
  const valid=series.values.slice(-96).filter(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0),complete=valid.length===96;
  const metrics=node('div',undefined,'metrics');
  for(const [value,label] of [[mm(station.depth),`Selected ${duration(minutes)} total`],[complete?mm(valid.reduce((a,b)=>a+b,0)):'Incomplete','24-hour total ending at selected time']]){const metric=node('div',undefined,'metric');metric.append(node('strong',value),node('span',label));metrics.append(metric);}host.append(metrics);
  const controls=node('div',undefined,'history-chart-controls'),label=node('label','Chart interval'),select=node('select');select.id='chartInterval';const intervals=[15,30,60,180,360,720,1440].filter(m=>m<=minutes&&minutes%m===0);
  if(!intervals.includes(interval))interval=intervals.at(-1);onInterval(interval);
  for(const m of intervals)select.append(new Option(duration(m),m));select.value=interval;label.append(select);controls.append(label);host.append(controls);
  const wrap=node('div',undefined,'chart'),canvas=node('canvas');canvas.id='hyetograph';canvas.setAttribute('role','img');wrap.append(canvas);host.append(wrap);
  let chart;
  function draw(){
   const step=interval/15,periods=[],values=[],first=Math.max(0,data.periods.length-minutes/15);
   for(let i=first;i<data.periods.length;i+=step){const chunk=series.values.slice(i,i+step),last=data.periods[Math.min(i+step-1,data.periods.length-1)];periods.push({start:data.periods[i].start,end:last.end});values.push(chunk.length===step&&chunk.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)?chunk.reduce((a,b)=>a+b,0):null);}
   chart?.destroy();canvas.setAttribute('aria-label',`${station.name}: saved rainfall in chronological ${duration(interval)} bars, in millimetres.`);
   chart=new Chart(canvas,{type:'bar',data:{labels:periods.map(p=>date(p.end)),datasets:[{label:`${duration(interval)} rainfall (mm)`,data:values,backgroundColor:'#36a46d',borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>{const p=periods[items[0].dataIndex];return `${date(p.start)} – ${date(p.end)} AEST`;}}}},scales:{x:{title:{display:true,text:`${duration(interval)} period ending · AEST`},ticks:{maxTicksLimit:10},grid:{display:false}},y:{beginAtZero:true,title:{display:true,text:'Rainfall (mm)'}}}}});
  }
  select.onchange=()=>{interval=Number(select.value);onInterval(interval);draw();};draw();
  const comparison=node('section',undefined,'ifd-comparison');comparison.id='ifdComparison';host.append(comparison);renderIfd(series);
  if(station.coordinates?.source){const p=node('p',undefined,'detail-source'),link=node('a',`BoM station ${station.stationNumber} · audited map coordinates`);link.href=station.coordinates.source;link.target='_blank';link.rel='noopener';p.append(link);host.append(p);}
  return {destroy(){chart?.destroy();}};
 }
 root.GaugePlots={water,rainfall};
})(window);
