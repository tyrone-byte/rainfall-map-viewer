/* Share the geographic viewport between both dashboards in this browser tab. */
(function(root){
 'use strict';
 const storageKey='rainfall-atlas.map-view.v1';
 root.SharedMapView={attach(map){
  // Wheel/trackpad scrolling belongs to the page, never the map.
  map.scrollWheelZoom.disable();
  if(L.Browser.mobile||root.matchMedia('(pointer: coarse)').matches){
   map.dragging.disable();
   const PanControl=L.Control.extend({options:{position:'topleft'},onAdd(){
    const container=L.DomUtil.create('div','leaflet-bar map-pan-control'),button=L.DomUtil.create('button','',container);
    button.type='button';button.textContent='Move map';button.setAttribute('aria-pressed','false');button.title='Enable one-finger map movement';
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.on(button,'click',()=>{const active=!map.dragging.enabled();if(active)map.dragging.enable();else map.dragging.disable();button.textContent=active?'Finish moving':'Move map';button.setAttribute('aria-pressed',String(active));button.title=active?'Return to page scrolling':'Enable one-finger map movement';});
    return container;
   }});
   map.addControl(new PanControl());
  }
  let restored=false;
  try{
   const saved=JSON.parse(sessionStorage.getItem(storageKey));
   if(saved&&[saved.lat,saved.lng,saved.zoom].every(Number.isFinite)&&Math.abs(saved.lat)<=85.051129&&Math.abs(saved.lng)<=180&&saved.zoom>=0&&saved.zoom<=18){
    map.setView([saved.lat,saved.lng],saved.zoom,{animate:false});restored=true;
   }
  }catch(_){/* A blocked or invalid browser store must not stop the map. */}
  const save=()=>{
   try{const centre=map.getCenter().wrap();sessionStorage.setItem(storageKey,JSON.stringify({lat:centre.lat,lng:centre.lng,zoom:map.getZoom()}));}catch(_){}
  };
  map.on('moveend zoomend',save);
  root.addEventListener('pagehide',save);
  return restored;
 }};
})(window);
