'use strict';
async function renderArchivedRainfall(host,station){
  const make=(tag,text)=>{const item=document.createElement(tag);item.textContent=text;return item;};
  host.append(make('h2','Saved 15-minute rainfall totals'),make('p','Loading the observation archive…'));
  try{
    const response=await fetch(`/api/rainfall-history?gauge=${encodeURIComponent(station.id)}`,{cache:'no-store'});
    if(!response.ok)throw new Error('Archive unavailable');
    const data=await response.json();if(!host.isConnected)return;
    host.replaceChildren(make('h2','Saved 15-minute rainfall totals'));
    if(!data.available||!data.totals?.length){host.append(make('p',data.reason==='identity-unresolved'?'Station identity unresolved; no quarter-hour totals are assigned.':'Saved quarter-hour totals are unavailable. The archive may not yet be connected to this website.'));return;}
    const when=iso=>new Date(iso).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false});
    host.append(make('p',`Ending ${when(data.end)} AEST, the latest quarter-hour timestamp in the archive. Every required 15-minute block must be present. Hourly and 3-hour bulletin values are not used to fill gaps.`));
    const wrap=make('div','');wrap.className='table-wrap';const table=make('table',''),head=make('tr','');
    for(const title of ['Duration','Saved total (mm)','Valid quarter-hours'])head.append(make('th',title));const thead=make('thead','');thead.append(head);table.append(thead);const tbody=make('tbody','');
    for(const p of data.totals){const row=make('tr','');row.append(make('td',p.minutes<60?`${p.minutes} minutes`:`${p.minutes/60} hours`),make('td',p.complete?p.depth.toFixed(1):'Incomplete'),make('td',`${p.validBlocks}/${p.expectedBlocks}`));tbody.append(row);}table.append(tbody);wrap.append(table);host.append(wrap);
    const qa=make('details','');qa.append(make('summary','QA comparison with BoM hourly / 3-hour bulletins'));
    for(const p of data.qa){const label=p.assessment==='match'?'Match within 0.1 mm':p.assessment==='difference'?`Difference: ${p.difference.toFixed(1)} mm (saved quarter-hours minus bulletin)`:p.assessment==='reference-missing'?'Bulletin value missing':'Insufficient quarter-hours for comparison';qa.append(make('p',`${p.minutes/60}h ending ${when(p.end)} AEST: ${label}.`));}
    qa.append(make('p','Comparisons use the same station identity and exact window. Differences may reflect rounding, source updates or data revisions; they are not automatically treated as faulty gauges. No QA difference triggers an alarm.'));host.append(qa);
  }catch(error){if(host.isConnected)host.replaceChildren(make('h2','Saved 15-minute rainfall totals'),make('p','Could not load the archive. No totals have been estimated.'));}
}
