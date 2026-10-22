/* Pure calculations shared by the browser and regression tests. */
(function(root){
 'use strict';
 function parseReference(csv){
  const rows=csv.trim().split(/\r?\n/).map(line=>line.split(',').map(v=>v.trim()));
  if(!rows[0][0].includes('AEP'))throw new Error('IFD reference headings not recognised.');
  const aeps=rows.shift().slice(1).map(Number);
  if(aeps.some(v=>!Number.isFinite(v)||v<=0||v>100))throw new Error('Invalid IFD AEP headings.');
  const points=rows.map(row=>{
   const match=/^(\d+)\s*\(/.exec(row[0]),depths=row.slice(1).map(v=>v===''?NaN:Number(v));
   if(!match||depths.length!==aeps.length||depths.some(v=>!Number.isFinite(v)||v<0))throw new Error('Invalid IFD reference row.');
   return {minutes:Number(match[1]),depths};
  });
  if(points.some((p,i)=>p.minutes<=0||(i>0&&p.minutes<=points[i-1].minutes)))throw new Error('IFD durations must increase.');
  return {aeps,points};
 }
 function accumulations(values,periods,mode='latest'){
  if(values.length!==periods.length||!['latest','wettest'].includes(mode))throw new Error('Invalid accumulation inputs.');
  return Array.from({length:values.length},(_,i)=>{
   const blocks=i+1,windows=[];
   const ends=mode==='latest'?[values.length]:Array.from({length:values.length-blocks+1},(_,j)=>j+blocks);
   for(const end of ends){
    const start=end-blocks,chunk=values.slice(start,end);
    const continuous=periods.slice(start,end).every((p,j)=>Number.isFinite(Date.parse(p.start))&&Date.parse(p.end)-Date.parse(p.start)===10800000&&(j===0||Date.parse(p.start)===Date.parse(periods[start+j-1].end)));
    if(continuous&&chunk.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))windows.push({depth:chunk.reduce((a,b)=>a+b,0),start:periods[start].start,end:periods[end-1].end});
   }
   const best=windows.reduce((a,b)=>!a||b.depth>a.depth?b:a,null);
   return {minutes:blocks*180,depth:best?.depth??null,start:best?.start??null,end:best?.end??null,validWindows:windows.length,possibleWindows:ends.length};
  });
 }
 const api={parseReference,accumulations};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RainfallIFD=api;
})(typeof globalThis!=='undefined'?globalThis:this);
