'use strict';
// Classification is independent of map rendering. Never derive flood severity from raw height.
(function(root){
 const colours={missing:'#9CA3AF',normal:'#3B82F6',elevated:'#22C55E',minor:'#EAB308',moderate:'#F97316',major:'#EF4444',extreme:'#8B5CF6'};
 const config={trendThresholdPerHour:null,staleMinutes:60};
 function classify(station,settings=config){
  const stale=['missing','stale','suspect','out'].includes(station.status)||station.stale===true||(Number.isFinite(station.ageMinutes)&&station.ageMinutes>=settings.staleMinutes);
  if(!Number.isFinite(station.level)||stale)return {status:'missing',colour:colours.missing,label:'No / stale data',trend:null};
  const supplied=station.floodStatus==='watch'?'minor':station.floodStatus;
  const status=Object.hasOwn(colours,supplied)&&supplied!=='missing'?supplied:'normal';
  const threshold=settings.trendThresholdPerHour,rate=station.ratePerHour;
  const trend=Number.isFinite(threshold)&&threshold>=0&&Number.isFinite(rate)?Math.abs(rate)>threshold?(rate>0?'rising':'falling'):'steady':null;
  return {status,colour:colours[status],label:supplied===status?status:'Current · flood category unclassified',trend};
 }
 const api={colours,config,classify};root.WaterGaugeStatus=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
