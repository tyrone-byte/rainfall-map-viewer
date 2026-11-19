/* Gauge analysis has its own URL and selection; the map stays untouched. */
(function(root){
 'use strict';
 function mapURL(map){const u=new URL(location.href),c=map.getCenter().wrap();u.searchParams.set('view','keep');u.searchParams.set('mapLat',c.lat.toFixed(6));u.searchParams.set('mapLng',c.lng.toFixed(6));u.searchParams.set('mapZoom',map.getZoom());return u.pathname+u.search;}
 function url(map,station,selection){const q=new URLSearchParams({view:selection.view,gauge:station.id,basin:station.basinId||new URLSearchParams(location.search).get('basin')||'',end:selection.end,minutes:selection.minutes,return:mapURL(map)});if(selection.mode)q.set('mode',selection.mode);return '/gauge?'+q;}
 function target(){return matchMedia('(max-width:850px)').matches?'_self':'_blank';}
 root.GaugeNavigation={url,link(map,station,selection){const a=document.createElement('a');a.href=url(map,station,selection);a.target=target();a.rel='noopener';for(const type of ['pointerdown','contextmenu','focus'])a.addEventListener(type,()=>{a.href=url(map,station,selection);a.target=target();});a.addEventListener('click',event=>{if(target()==='_self'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey)history.replaceState(null,'',mapURL(map));});return a;},open(map,station,selection){const href=url(map,station,selection),destination=target();if(destination==='_self')history.replaceState(null,'',mapURL(map));root.open(href,destination,'noopener');}};
})(window);
