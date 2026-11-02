'use strict';
(function(){
 const colours={below:'#168BFF',at:'#168BFF',above:'#EF4444',unknown:'#9CA3AF'};
 function state(dam,reading){
  if(!dam.storageWaterGauge||!dam.spillwayCrest||!Number.isFinite(dam.spillwayCrest.level)||!reading||!Number.isFinite(reading.level)||reading.datum!=='AHD'||(dam.spillwayCrest.datum&&dam.spillwayCrest.datum!=='AHD')||['missing','suspect','out'].includes(reading.status)||(Number.isFinite(reading.ageMinutes)&&reading.ageMinutes>=60))return 'unknown';
  const delta=reading.level-dam.spillwayCrest.level;
  return Math.abs(delta)>10?'unknown':delta>0?'above':delta<0?'below':'at';
 }
 function icon({state='unknown',size=14,selected=false}={}){
  const colour=colours[state]||colours.unknown;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',size);svg.setAttribute('height',size);svg.classList.add('dam-symbol');svg.setAttribute('data-state',state);
  // Fixed geometry: only palette/selection properties vary; no station strings enter SVG markup.
  svg.innerHTML=`<circle cx="12" cy="12" r="11" fill="white" stroke="${selected?'#183f43':'white'}" stroke-width="2"/><circle cx="12" cy="12" r="10" fill="white" stroke="#07345b" stroke-width="1.4"/><path d="M3 12Q5 10 7 12T11 12T15 12L17 19Q10 25 3 17Z" fill="${colour}"/><path d="M13 21L15 5H19L21 17Q19 20 13 21Z" fill="#657786" stroke="#23435b" stroke-width="1"/><path d="M14 20L16 6H17L15 20Z" fill="#bac6cf"/>${state==='above'&&size>=16?'<path d="M15 9Q12 11 11 19M16 10Q14 13 13 20" fill="none" stroke="white" stroke-width="1.3"/>':''}`;
  return L.divIcon({html:svg,className:'dam-marker'+(selected?' is-selected':''),iconSize:[size+6,size+6],iconAnchor:[(size+6)/2,(size+6)/2]});
 }
 const sizeAtZoom=zoom=>Math.max(8,Math.min(20,8+(zoom-6)*2));
 window.DamMarker={colours,state,icon,sizeAtZoom};
})();
