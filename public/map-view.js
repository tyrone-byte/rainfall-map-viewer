/* Share the geographic viewport through session storage and new-tab link URLs. */
(function(root){
 'use strict';
 const storageKey='rainfall-atlas.map-view.v1';
 root.SharedMapView={attach(map){
  let movement=false;
  function setMovement(value){movement=!!value;for(const name of ['dragging','scrollWheelZoom','touchZoom','doubleClickZoom','boxZoom','keyboard'])map[name]?.[movement?'enable':'disable']();const button=map.getContainer().querySelector('.map-pan-control button');if(button){button.textContent=movement?'Lock map':'Move map';button.setAttribute('aria-pressed',String(movement));}}
  const PanControl=L.Control.extend({options:{position:'topleft'},onAdd(){const container=L.DomUtil.create('div','leaflet-bar map-pan-control'),button=L.DomUtil.create('button','',container);button.type='button';button.textContent='Move map';button.setAttribute('aria-pressed','false');button.title='Unlock dragging, wheel and touch zoom; lock again to compare views';L.DomEvent.disableClickPropagation(container);L.DomEvent.disableScrollPropagation(container);L.DomEvent.on(button,'click',()=>setMovement(!movement));return container;}});
  map.addControl(new PanControl());map.setMovementEnabled=setMovement;map.movementEnabled=()=>movement;setMovement(false);
  let restored=false;
  try{
   const params=new URLSearchParams(location.search),names=['mapLat','mapLng','mapZoom'];
   const explicit=names.every(k=>params.has(k)&&params.get(k).trim()!=='')?{lat:Number(params.get('mapLat')),lng:Number(params.get('mapLng')),zoom:Number(params.get('mapZoom'))}:null;
   const valid=v=>v&&[v.lat,v.lng,v.zoom].every(Number.isFinite)&&Math.abs(v.lat)<=85.051129&&Math.abs(v.lng)<=180&&v.zoom>=0&&v.zoom<=18;
   const saved=valid(explicit)?explicit:JSON.parse(sessionStorage.getItem(storageKey));
   if(saved&&[saved.lat,saved.lng,saved.zoom].every(Number.isFinite)&&Math.abs(saved.lat)<=85.051129&&Math.abs(saved.lng)<=180&&saved.zoom>=0&&saved.zoom<=18){
    map.setView([saved.lat,saved.lng],saved.zoom,{animate:false});restored=true;
   }
  }catch(_){/* A blocked or invalid browser store must not stop the map. */}
  function shareLinks(){const centre=map.getCenter().wrap();for(const link of document.querySelectorAll('.page-tabs a')){const url=new URL(link.href,location.href);if(url.origin!==location.origin||!['/history','/point-ifd','/water-history','/dams'].includes(url.pathname))continue;url.searchParams.set('mapLat',centre.lat.toFixed(6));url.searchParams.set('mapLng',centre.lng.toFixed(6));url.searchParams.set('mapZoom',String(map.getZoom()));url.searchParams.set('view','keep');link.href=url.pathname+url.search;}}
  map.shareViewLinks=shareLinks;shareLinks();
  for(const type of ['contextmenu','pointerdown','focusin'])document.addEventListener(type,event=>{if(event.target.closest?.('.page-tabs a'))shareLinks();},true);
  const save=()=>{
   shareLinks();
   try{const centre=map.getCenter().wrap();sessionStorage.setItem(storageKey,JSON.stringify({lat:centre.lat,lng:centre.lng,zoom:map.getZoom()}));}catch(_){}
  };
  map.on('moveend zoomend',save);
  root.addEventListener('pagehide',save);
  map.sharedViewRestored=restored;
  return restored;
 }};
})(window);
