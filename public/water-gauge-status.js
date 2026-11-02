'use strict';
// Display measured movement only. These colours are not flood or consequence categories.
(function(root){
 const colours={missing:'#88969c',rising:'#d94843',falling:'#2c64cc',steady:'#36a48c'};
 const ageColours={current:'#36a48c',suspect:'#e9b43d',out:colours.missing,missing:colours.missing};
 const rateBands=[{maximum:.1,colour:'#36a46d'},{maximum:.3,colour:'#e9c345'},{maximum:.6,colour:'#ed8b36'},{maximum:Infinity,colour:colours.rising}];
 const config={trendThresholdPerHour:null};
 function classify(station,mode='trend',settings=config){
  const missing={status:'missing',colour:colours.missing,label:'Insufficient data',trend:null};
  if(!Number.isFinite(station.level))return missing;
  if(mode==='age')return {status:station.status||'missing',colour:ageColours[station.status]||colours.missing,label:'Observation age',trend:null};
  const direction=station.direction,rate=station.ratePerHour;
  if(!['rising','falling','steady'].includes(direction))return missing;
  if(mode==='rate'&&!Number.isFinite(rate))return missing;
  const colour=mode==='rate'&&direction==='rising'?rateBands.find(b=>rate<=b.maximum).colour:colours[direction];
  const threshold=settings.trendThresholdPerHour;
  const trend=Number.isFinite(threshold)&&threshold>=0&&Number.isFinite(rate)?Math.abs(rate)>threshold?(rate>0?'rising':'falling'):'steady':null;
  return {status:direction,colour,label:direction,trend};
 }
 const api={colours,ageColours,rateBands,config,classify};root.WaterGaugeStatus=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
