'use strict';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const view=['rainfall','water','ifd'].includes(params.get('view'))?params.get('view'):'rainfall',water=view==='water',ifd=view==='ifd',gauge=params.get('gauge'),basin=params.get('basin')||'';
document.body.dataset.view=ifd?'point-ifd':view;
const endpoint='/api/archive-'+(water?'water':'rainfall');
const durations=[15,30,60,180,360,720,1440,2880,4320,10080];
let minutes=Number(params.get('minutes'))||1440,mode=params.get('mode')==='latest'?'latest':'wettest',end=params.get('end'),follow=!end,extent=null,station=null,chart=null,ifdView=null,interval=15,points=false,sequence=0,controller=null,cached=null;
if(ifd){for(const option of [...$('minutes').options])if(Number(option.value)>1440)option.remove();if(minutes>=15&&minutes<=1440&&minutes%15===0&&!durations.includes(minutes))$('minutes').append(new Option(minutes+' minutes',minutes));}
if(!(ifd?minutes>=15&&minutes<=1440&&minutes%15===0:durations.includes(minutes)))minutes=1440;
$('minutes').value=minutes;$('mode').value=mode;$('modeLabel').hidden=!ifd;$('ending').step=water?'60':'900';
const local=iso=>new Date(Date.parse(iso)+36000000).toISOString().slice(0,16);
const date=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const duration=m=>m>=2880?`${m/1440} days`:m<60?`${m} minutes`:`${m/60} ${m===60?'hour':'hours'}`;
const paths={rainfall:'/history',ifd:'/point-ifd',water:'/water-history'};
for(const el of document.querySelectorAll('.gauge-controls input,.gauge-controls select,.gauge-controls button'))if(el.id!=='refresh')el.disabled=true;
let returnURL=new URL(paths[view],location.origin);try{const u=new URL(params.get('return'),location.origin);if(u.origin===location.origin&&Object.values(paths).includes(u.pathname))returnURL=u;}catch(_){}
$('back').href=returnURL.pathname+returnURL.search;
function message(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function selectionMinutes(){return ifd&&mode==='wettest'?1440:minutes;}
function controls(){
 if(!extent)return;const time=Date.parse(end),step=selectionMinutes()*60000;
 $('ending').min=local(extent.firstEnd);$('ending').max=local(extent.lastEnd);$('ending').value=local(end);
 $('minutes').disabled=ifd&&mode==='wettest';$('previous').disabled=time-step<Date.parse(extent.firstEnd);$('next').disabled=time+step>Date.parse(extent.lastEnd);$('latest').setAttribute('aria-pressed',String(follow));
}
function save(){const u=new URL(location.href);u.searchParams.set('view',view);u.searchParams.set('minutes',minutes);u.searchParams.set('end',end);if(ifd)u.searchParams.set('mode',mode);history.replaceState(null,'',u.pathname+u.search);$('newTab').href=u.pathname+u.search;}
function comparisonURL(kind,target){
 if(!target){const u=new URL(returnURL);u.pathname=paths[kind];u.searchParams.delete('gauge');u.searchParams.set('end',kind==='water'?end:new Date(Math.floor(Date.parse(end)/900000)*900000).toISOString());u.searchParams.set('minutes',kind==='ifd'?1440:minutes);if(kind==='ifd')u.searchParams.set('mode','wettest');return u.pathname+u.search;}
 const q=new URLSearchParams({view:kind,gauge:target.id,basin:target.basinId||basin,minutes:kind==='ifd'?Math.min(minutes,1440):minutes,end:kind==='water'?end:new Date(Math.floor(Date.parse(end)/900000)*900000).toISOString(),return:returnURL.pathname+returnURL.search});
 if(kind==='ifd')q.set('mode','wettest');return '/gauge?'+q;
}
let counterpart=null,identity=null;
function links(){if(!station)return;for(const [kind,id] of [['rainfall','rainLink'],['ifd','ifdLink'],['water','waterLink']]){const link=$(id),target=(kind==='water')===water?station:counterpart?.[kind==='water'?'water':'rain'];link.hidden=false;link.href=comparisonURL(kind,target);link.toggleAttribute('aria-current',kind===view);if(kind===view)link.setAttribute('aria-current','page');}}
function identify(s){station=s;$('title').textContent=s.name;document.title=s.name+' · '+({rainfall:'Rainfall',ifd:'Point IFD',water:'Water level'}[view]);const sid=s.stationNumber||(water?s.id:null);if(identity!==sid){identity=sid;counterpart=null;if(/^\d{6}$/.test(sid||''))ViewerData.read('/api/gauge-counterparts?'+new URLSearchParams({station:sid,basin:s.basinId||basin})).then(r=>{if(identity===sid){counterpart=r;links();}}).catch(()=>{});}links();}
function bomLinks(host,s){if(!s.id?.match(/^\d{6}$/))return;const p=document.createElement('p');p.className='detail-source';for(const [path,label] of [[s.plotPath,'BoM plot'],[s.historyPath,'BoM observations']])if(path&&/^\/fwo\/IDQ\d+\/IDQ\d+\.\d{6}\.(plt|tbl)\.shtml$/.test(path)&&path.includes('.'+s.id+'.')){const a=document.createElement('a');a.href='https://reg.bom.gov.au'+path;a.target='_blank';a.rel='noopener';a.textContent=label;p.append(a,document.createTextNode(' '));}host.append(p);}
async function load(){
 if(!extent||!gauge)return;const run=++sequence;controller?.abort();controller=new AbortController();const signal=controller.signal;
 const requestedEnd=end,requestedMinutes=minutes,requestedMode=mode,span=water?minutes:ifd?1440:Math.max(1440,minutes);
 const timeout=setTimeout(()=>controller?.signal===signal&&controller.abort('timeout'),20000);
 message(chart||ifdView?'Updating… Previous plot remains below.':'Loading…');$('detail').setAttribute('aria-busy','true');controls();save();
 try{
  let result;
  if(cached&&cached.end===requestedEnd&&cached.span>=span)result=cached.result;
  else{result=await ViewerData.read(endpoint+'/series?'+new URLSearchParams({gauge,end:requestedEnd,minutes:span}),{signal});if(run!==sequence)return;if(!result.available)throw new Error('Saved gauge data unavailable.');cached={end:requestedEnd,span,result};}
  if(run!==sequence)return;
  let prepared;
  if(ifd){prepared=await PointRainfallIFD.prepare({...result,end:requestedEnd},requestedMinutes,requestedMode);if(run!==sequence)return;}
  const host=$('detail');chart?.destroy();chart=null;ifdView?.clear();
  if(water){
   const start=new Date(Date.parse(requestedEnd)-requestedMinutes*60000).toISOString(),observations=result.observations.filter(o=>Date.parse(o.time)>=Date.parse(start)&&Date.parse(o.time)<=Date.parse(requestedEnd)),last=observations.filter(o=>Number.isFinite(o.level)).at(-1);
   const s={...result.station,level:last?.level??null,datum:last?.datum||'Unspecified',observedAt:last?.time||null};identify(s);
   chart=GaugePlots.water(host,s,{...result,start,end:requestedEnd,observations},{showPoints:points,onPoints:v=>{points=v;},links:bomLinks});
  }else if(ifd){
   const s=prepared.stations[0];if(!s)throw new Error('Gauge unavailable.');identify(s);host.replaceChildren();const summary=document.createElement('section');summary.className='point-ifd-summary';const heading=document.createElement('h2');heading.textContent=PointRainfallIFD.label(s.pointIFD);summary.append(heading);
   const p=s.pointIFD;if(p?.minutes){const text=document.createElement('p');text.textContent=`${p.depth.toFixed(1)} mm · ${duration(p.minutes)} · ${date(p.start)} – ${date(p.end)} AEST${p.partial?' · partial coverage':''}`;summary.append(text);const reference=document.createElement('small');reference.textContent='Regional reference: '+s.ifdRegion;summary.append(reference);const use=document.createElement('button');use.textContent='Use this window';use.onclick=()=>{minutes=p.minutes;mode='latest';end=p.end;follow=false;if(![...$('minutes').options].some(o=>Number(o.value)===minutes))$('minutes').append(new Option(duration(minutes),minutes));$('minutes').value=minutes;$('mode').value=mode;load();};summary.append(use);}
   const comparison=document.createElement('section');comparison.id='ifdComparison';host.append(summary,comparison);ifdView??=GaugeIFD.create({compact:true,mode:requestedMode,onModeChange:v=>{mode=v;$('mode').value=v;load();}});ifdView.setMode(requestedMode);ifdView.render({...result,end:requestedEnd},s);
  }else{
   const series=result.stations[0];if(!series)throw new Error('Gauge unavailable.');const values=series.values.slice(-requestedMinutes/15),depth=values.length===requestedMinutes/15&&values.every(v=>Number.isFinite(v)&&v>=0)?values.reduce((a,b)=>a+b,0):null;
   const s={...series,depth};identify(s);chart=GaugePlots.rainfall(host,s,series,result,requestedMinutes,{interval,onInterval:v=>{interval=v;},includeIfd:false});
  }
  $('window').textContent=`${ifd&&requestedMode==='wettest'?'Wettest preceding 24 hours':duration(requestedMinutes)} · ending ${date(requestedEnd)} AEST`;message('');links();
 }catch(error){if(run===sequence){if(error.name!=='AbortError'||signal.reason==='timeout')message((signal.reason==='timeout'?'Request timed out.':'Could not load this selection.')+' Try Refresh. Previous plot, if shown, is unchanged.',true);}}
 finally{clearTimeout(timeout);if(run===sequence)$('detail').setAttribute('aria-busy','false');}
}
async function refresh(clear=false){
 try{if(clear){cached=null;ViewerData.clear();}const response=await fetch(endpoint+'/extent',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error();const result=await response.json();if(!result.available||!result.lastEnd)throw new Error();extent=result;for(const el of document.querySelectorAll('.gauge-controls input,.gauge-controls select,.gauge-controls button'))el.disabled=false;
 if(follow||!end)end=extent.lastEnd;if(!water)end=new Date(Math.floor(Date.parse(end)/900000)*900000).toISOString();
 if(!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(extent.firstEnd)||Date.parse(end)>Date.parse(extent.lastEnd)){message('Selected time is outside the saved archive. Choose Latest.',true);$('latest').disabled=false;return;}
 await load();
 }catch(_){message('Archive unavailable. Try Refresh.',true);$('detail').setAttribute('aria-busy','false');}
}
$('minutes').onchange=()=>{minutes=Number($('minutes').value);load();};$('mode').onchange=()=>{mode=$('mode').value;load();};
$('ending').onchange=()=>{const t=Date.parse($('ending').value+'+10:00');if(!extent||!Number.isFinite(t)||t<Date.parse(extent.firstEnd)||t>Date.parse(extent.lastEnd)||(!water&&t%900000)){message('Choose a saved '+(water?'time':'15-minute ending time')+' in Brisbane AEST.',true);return;}end=new Date(t).toISOString();follow=false;load();};
for(const [id,direction] of [['previous',-1],['next',1]])$(id).onclick=()=>{end=new Date(Date.parse(end)+direction*selectionMinutes()*60000).toISOString();follow=false;load();};
$('latest').onclick=()=>{follow=true;refresh();};$('refresh').onclick=()=>refresh(true);
if(gauge)refresh();else{message('No gauge selected. Return to the map.',true);$('detail').setAttribute('aria-busy','false');for(const el of document.querySelectorAll('.gauge-controls input,.gauge-controls select,.gauge-controls button'))el.disabled=true;}
setInterval(()=>{if(follow&&!document.hidden&&extent)refresh();},60000);
