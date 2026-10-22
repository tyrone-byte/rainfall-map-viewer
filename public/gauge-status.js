'use strict';
const $=id=>document.getElementById(id);
const labels={out:'Out of action · age flag',suspect:'Suspect',unverified:'Unverified',current:'Current','no-data':'No valid observation',unresolved:'Identity unresolved'};
const order={out:0,suspect:1,unverified:2,'no-data':3,unresolved:4,current:5};
let data,suspect=60,out=360;
const when=value=>value?new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}):'Not available';
function node(tag,text,cls){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;}
function render(){
  if(!data)return;
  const search=$('search').value.toLowerCase();
  const rows=data.rows.filter(r=>(!$('metric').value||r.kind===$('metric').value)&&(!$('status').value||r.status===$('status').value)&&(!$('group').value||r.group===$('group').value)&&`${r.name} ${r.station}`.toLowerCase().includes(search));
  rows.sort((a,b)=>order[a.status]-order[b.status]||(b.ageMinutes??-1)-(a.ageMinutes??-1)||a.name.localeCompare(b.name));
  const counts=Object.fromEntries(Object.keys(labels).map(status=>[status,data.rows.filter(r=>r.status===status).length]));
  $('counts').textContent=`Showing ${rows.length} of ${data.rows.length} gauge series · ${counts.out} out of action by age · ${counts.suspect} suspect · ${counts.unverified} unverified · ${counts['no-data']} no valid observation · ${counts.unresolved} unresolved · ${counts.current} current`;
  $('rows').replaceChildren(...rows.map(r=>{
    const tr=node('tr'),name=node('td');name.append(node('strong',r.name),node('small',r.group),node('small',r.station));
    const status=node('td');status.append(node('span',labels[r.status],`health-status ${r.status}`));
    const age=r.ageMinutes===null?'Unknown':r.ageMinutes<60?`${Math.round(r.ageMinutes)} min`:`${(r.ageMinutes/60).toFixed(1)} hours`;
    const detail=node('td',r.reason);
    if(r.latestMissing)detail.append(node('small',`Latest missing report: ${when(r.lastReportedAt)}`));
    if(r.kind==='water-summary')detail.append(node('small',`${r.stationType}. Summary observation dates are inferred from issue day and reported weekday.`));
    tr.append(name,node('td',r.kind==='rain-15m'?'Rainfall · 15 min':'Water level'),status,node('td',when(r.lastValidAt)),node('td',age),node('td',when(r.lastCheckedAt)),detail);return tr;
  }));
}
async function load(){
  $('refresh').disabled=true;
  try{
    const response=await fetch(`/api/gauge-health?suspect=${suspect}&out=${out}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Report unavailable');
    data=await response.json();
    $('connection').textContent=data.archiveAvailable?'Connected to the saved observation archive.':data.archiveReason==='not-connected'?'Archive connection pending. Water statuses use the current BoM summary only; rainfall status and collector monitoring are unverified.':'Archive unavailable. Water statuses use the current BoM summary only; rainfall status and collector monitoring are unverified.';
    const run=data.collectorRun;
    $('collector').textContent=run?`Latest collector run: ${run.status} · started ${when(run.started_at)} · finished ${when(run.finished_at)}`:'Collector run history unavailable. A successful website refresh does not prove the collector is running.';
    $('asof').textContent=`Report generated ${when(data.generatedAt)} AEST · age limits ${suspect} min / ${out/60} hours · database checks cached for up to one minute.`;
    const group=$('group').value;$('group').replaceChildren(new Option('All groups',''),...[...new Set(data.rows.map(r=>r.group))].sort().map(g=>new Option(g,g)));$('group').value=group;render();
  }catch(error){$('connection').textContent='Could not refresh this report. Any displayed rows are from the earlier report; check the report generation time.';}
  finally{$('refresh').disabled=false;}
}
for(const id of ['search','metric','group','status'])$(id).addEventListener(id==='search'?'input':'change',render);
$('limits').onsubmit=event=>{event.preventDefault();const s=Number($('suspect').value),o=Number($('out').value)*60;if(!Number.isInteger(s)||!Number.isInteger(o)||s<1||o<=s||o>43200){$('limitError').textContent='Use increasing age limits, up to 720 hours.';return;}$('limitError').textContent='';suspect=s;out=o;load();};
$('refresh').onclick=load;load();setInterval(load,60000);
