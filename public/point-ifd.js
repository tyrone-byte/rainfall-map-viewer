/* Point rainfall comparison: saved observations and saved defaults only. */
(function(root){
 'use strict';
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const logMix=(a,b,t)=>Math.exp(Math.log(a)+(Math.log(b)-Math.log(a))*t);
 function depthsAt(reference,minutes){
  if(!Number.isFinite(minutes)||minutes<=0)return null;
  const points=reference?.points,aeps=reference?.aeps;
  if(!Array.isArray(points)||!Array.isArray(aeps)||!points.length||!aeps.length||aeps.some(a=>!Number.isFinite(a)||a<=0||a>100)||new Set(aeps).size!==aeps.length)return null;
  if(points.some((p,i)=>!Number.isFinite(p.minutes)||p.minutes<=0||(i&&p.minutes<=points[i-1].minutes)||!Array.isArray(p.depths)||p.depths.length!==aeps.length||p.depths.some(d=>!valid(d)||d<=0)))return null;
  if(minutes<points[0].minutes||minutes>points.at(-1).minutes)return null;
  const exact=points.find(p=>p.minutes===minutes);if(exact)return exact.depths;
  const upper=points.findIndex(p=>p.minutes>minutes),a=points[upper-1],b=points[upper],t=Math.log(minutes/a.minutes)/Math.log(b.minutes/a.minutes);
  return a.depths.map((d,i)=>logMix(d,b.depths[i],t));
 }
 function estimate(reference,minutes,depth){
  if(!valid(depth))return null;
  const depths=depthsAt(reference,minutes);if(!depths)return null;
  const pairs=reference.aeps.map((aep,i)=>({aep,depth:depths[i]})).sort((a,b)=>b.aep-a.aep);
  // Do not repair or invert inconsistent source curves.
  if(pairs.some((p,i)=>i&&p.depth<pairs[i-1].depth))return null;
  const first=pairs[0],last=pairs.at(-1);
  if(depth<first.depth)return {aep:first.aep,bound:'above',ratio:depth/last.depth};
  if(depth>last.depth)return {aep:last.aep,bound:'below',ratio:depth/last.depth};
  const exact=pairs.find(p=>p.depth===depth);if(exact)return {aep:exact.aep,bound:null,ratio:depth/last.depth};
  for(let i=1;i<pairs.length;i++)if(depth<pairs[i].depth){
   const a=pairs[i-1],b=pairs[i],t=Math.log(depth/a.depth)/Math.log(b.depth/a.depth);
   return {aep:logMix(a.aep,b.aep,t),bound:null,ratio:depth/last.depth};
  }
  return null;
 }
 function evaluate(values,periods,reference,mode='wettest',minutes=180){
  if(!reference)return {reason:'No assigned default 2030 IFD'};
  if(!['wettest','latest'].includes(mode)||values.length!==periods.length||!Number.isInteger(minutes)||minutes<15||minutes>1440||minutes%15)return {reason:'Invalid comparison selection'};
  const n=values.length,sums=[0],missing=[0],breaks=[0];
  for(let i=0;i<n;i++){
   const p=periods[i],continuous=Date.parse(p.end)-Date.parse(p.start)===900000&&(i===0||Date.parse(p.start)===Date.parse(periods[i-1].end));
   sums.push(sums[i]+(valid(values[i])?values[i]:0));missing.push(missing[i]+(!valid(values[i])?1:0));breaks.push(breaks[i]+(!continuous?1:0));
  }
  let best=null;
  const durations=mode==='latest'?[minutes]:Array.from({length:Math.min(n,96)},(_,i)=>(i+1)*15);
  for(const m of durations){
   const blocks=m/15,ends=mode==='latest'?[n]:Array.from({length:Math.max(0,n-blocks+1)},(_,i)=>i+blocks);
   let wettest=null,validWindows=0;
   for(const end of ends){const start=end-blocks;
    if(start<0||missing[end]!==missing[start]||breaks[end]!==breaks[start])continue;
    validWindows++;const depth=sums[end]-sums[start];
    if(!wettest||depth>wettest.depth)wettest={depth,start:periods[start].start,end:periods[end-1].end,minutes:m};
   }
   if(!wettest)continue;
   const estimated=estimate(reference,m,wettest.depth);if(!estimated)continue;
   const candidate={...wettest,...estimated,validWindows,possibleWindows:ends.length,partial:missing[n]>0||breaks[n]>0};
   if(!best||candidate.aep<best.aep||(candidate.aep===best.aep&&candidate.ratio>best.ratio))best=candidate;
  }
  return best||{reason:reference?'No complete observation window or valid IFD curve':'No assigned default 2030 IFD'};
 }
 const bands=[{limit:.1,label:'≤0.1%',colour:'#6b238e'},{limit:.5,label:'>0.1–0.5%',colour:'#b53683'},{limit:1,label:'>0.5–1%',colour:'#c9414a'},{limit:2,label:'>1–2%',colour:'#e16c32'},{limit:5,label:'>2–5%',colour:'#e4a52b'},{limit:10,label:'>5–10%',colour:'#c8bb40'},{limit:20,label:'>10–20%',colour:'#70a868'},{limit:50,label:'>20–50%',colour:'#299487'},{limit:Infinity,label:'>50%',colour:'#6b9bab'}];
 function colour(result){if(!Number.isFinite(result?.aep))return '#88969c';return bands.find(b=>(result.bound==='above'?result.aep*(1+1e-12):result.aep)<=b.limit).colour;}
 function label(result){if(!Number.isFinite(result?.aep))return result?.reason||'AEP unavailable';return `${result.bound==='above'?'>':result.bound==='below'?'<':'≈'}${Number(result.aep.toPrecision(3))}% AEP`;}
 const api={depthsAt,estimate,evaluate,bands,colour,label};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
 let indexPromise;const files=new Map();
 async function getIndex(){return indexPromise??=fetch('/reference/local-ifd-index.json').then(r=>{if(!r.ok)throw new Error('Saved IFD assignments unavailable');return r.json();}).then(index=>{if(index.schemaVersion!==1||!index.locations)throw new Error('Saved IFD assignment format is not recognised');return index;}).catch(e=>{indexPromise=null;throw e;});}
 async function reference(station,index){
  const c=station.coordinates,key=c?`${c.lat.toFixed(6)},${c.lon.toFixed(6)}`:null;
  const target=index.regionalAssignments?.[key]||index.regionalAssignments?.[station.ifdLocationKey]||station.ifdLocationKey||key;
  const entry=index.locations?.[target];if(!entry)return null;
  if(!files.has(entry.file))files.set(entry.file,fetch(`/reference/local-ifd/${encodeURIComponent(entry.file)}`).then(r=>{if(!r.ok)throw new Error('Saved regional IFD file unavailable');return r.json();}).then(d=>{if(d.locationKey!==target)throw new Error('Saved IFD coordinates do not match');return d;}).catch(e=>{files.delete(entry.file);throw e;}));
  const data=await files.get(entry.file),dataset=data.datasets?.find(d=>d.name==='Default Current (2030) Baseline');
  return dataset?{dataset,data}:null;
 }
 api.prepare=async function(result,minutes,mode){
  const index=await getIndex(),stations=[];
  // Fetch each distinct reference only once, with bounded local-server concurrency.
  let cursor=0;const output=Array(result.stations.length);
  async function worker(){while(cursor<result.stations.length){const i=cursor++,s=result.stations[i];let ref=null,error=null;
   try{ref=await reference(s,index);}catch(e){error=e.message;}
   const comparison=error?{reason:error}:evaluate(s.values,result.periods,ref?.dataset,mode,minutes);
   const validBlocks=s.values.filter(valid).length;
   output[i]={...s,pointIFD:comparison,ifdRegion:ref?.data.region?.name||'Saved default reference',depth:Number.isFinite(comparison.aep)?comparison.depth:null,complete:validBlocks===96,validBlocks,expectedBlocks:96};
  }}
  await Promise.all(Array.from({length:Math.min(4,result.stations.length)},worker));stations.push(...output);
  return {...result,stations,minutes:mode==='wettest'?1440:minutes,mode,start:new Date(Date.parse(result.end)-(mode==='wettest'?1440:minutes)*60000).toISOString()};
 };
 root.PointRainfallIFD=api;
})(typeof globalThis!=='undefined'?globalThis:this);
