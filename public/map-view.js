/* Share the geographic viewport between both dashboards in this browser tab. */
(function(root){
 'use strict';
 const storageKey='rainfall-atlas.map-view.v1';
 root.SharedMapView={attach(map){
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
