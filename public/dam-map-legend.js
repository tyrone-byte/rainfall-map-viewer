'use strict';
(function(){
 const ns='http://www.w3.org/2000/svg';
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function water(colour){
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');
  svg.innerHTML=`<circle cx="12" cy="12" r="10" fill="white" stroke="#334155" stroke-width="1.5"/><path d="M3.5 12Q7.75 8 12 12T20.5 12A8.5 8.5 0 0 1 3.5 12Z" fill="${colour}"/>`;
  return svg;
 }
 function attach(map){
  const panel=node('details',null,'dam-map-legend');panel.open=!matchMedia('(max-width:600px)').matches;
  panel.setAttribute('aria-label','Map legend');panel.append(node('summary','Map legend'));
  const content=node('div',null,'dam-map-legend-content');panel.append(content);
  function section(title){const section=node('section');section.append(node('h3',title));content.append(section);return section;}
  function item(section,symbol,label){const entry=node('span',null,'map-legend-entry');symbol.setAttribute('aria-hidden','true');entry.append(symbol,node('span',label));section.append(entry);}
  function dam(state,selected=false){const svg=DamMarker.icon({state,size:18,selected}).options.html;svg.classList.remove('dam-symbol');return svg;}
  const dams=section('Dams · provisional crest comparison');dams.setAttribute('aria-label','Dam symbol legend');
  item(dams,dam('below'),'At / below listed crest');item(dams,dam('above'),'Above listed crest');item(dams,dam('unknown'),'Unresolved / missing / stale / review');item(dams,dam('below',true),'Selected dam · larger with outline');
  const rain=section('Rainfall · selected duration (mm)');
  for(const [colour,label] of [['#36a46d','≤5'],['#e9c345','>5–30'],['#ed8b36','>30–80'],['#d94843','>80'],['#88969c','Incomplete / missing']]){
   const circle=node('i',null,'legend-rain-circle');circle.style.background=colour;item(rain,circle,label);
  }
  const levels=section('Water levels · 60-minute change');
  for(const [status,label] of [['rising','Rising'],['falling','Falling'],['steady','Steady'],['missing','Insufficient data']])item(levels,water(WaterGaugeStatus.colours[status]),label);
  const context=section('Map context');
  item(context,node('i',null,'legend-watercourse-line'),'Named watercourses');item(context,node('i',null,'legend-boundary-line'),'Water-plan boundary');
  const note=node('p','Colours describe the selected data; they are not warning thresholds.','map-legend-note');content.append(note);
  const csv=node('a','Download crest-check CSV');csv.href='/api/dam-spillway-review.csv';csv.download='dam-spillway-review.csv';content.append(csv);
  const control=L.control({position:'bottomright'});control.onAdd=()=>{
   L.DomEvent.disableClickPropagation(panel);L.DomEvent.disableScrollPropagation(panel);L.DomEvent.on(panel,'keydown',L.DomEvent.stopPropagation);return panel;
  };control.addTo(map);return control;
 }
 window.DamMapLegend={attach};
})();
