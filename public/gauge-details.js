/* Non-modal gauge details: selecting data never moves the geographic viewport. */
(function(root){
 'use strict';
 root.GaugeDetails={attach(map){
  const detail=document.getElementById('detail');if(!detail)return null;
  const panel=document.createElement('section');panel.className='gauge-detail-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','gaugePanelTitle');
  const bar=document.createElement('div');bar.className='gauge-panel-bar';
  const title=document.createElement('h2');title.id='gaugePanelTitle';title.textContent='Gauge details';
  const actions=document.createElement('div');actions.className='gauge-panel-actions';
  function button(text){const b=document.createElement('button');b.type='button';b.textContent=text;return b;}
  const centre=button('Centre on gauge'),expand=button('Expand details'),closeButton=button('Close details'),openTab=document.createElement('a');openTab.textContent='Open in new tab';openTab.target='_blank';openTab.rel='noopener';expand.setAttribute('aria-expanded','false');
  actions.append(centre,expand,openTab,closeButton);bar.append(title,actions);panel.append(bar,detail);document.body.append(panel);
  let station=null,window=null,previousFocus=null;
  function share(){if(!station||!window)return;const u=new URL(location.href),c=map.getCenter().wrap();u.searchParams.set('gauge',station.id);u.searchParams.set('end',window.end);u.searchParams.set('minutes',window.minutes);u.searchParams.set('detail','1');u.searchParams.set('view','keep');u.searchParams.set('mapLat',c.lat.toFixed(6));u.searchParams.set('mapLng',c.lng.toFixed(6));u.searchParams.set('mapZoom',map.getZoom());openTab.href=u.pathname+u.search;}
  function close(){if(panel.hidden)return;panel.hidden=true;panel.classList.remove('is-expanded');expand.setAttribute('aria-expanded','false');expand.textContent='Expand details';if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  centre.onclick=()=>{if(station?.coordinates)map.setView([station.coordinates.lat,station.coordinates.lon],12,{animate:false});};
  closeButton.onclick=close;expand.onclick=()=>{const value=panel.classList.toggle('is-expanded');expand.setAttribute('aria-expanded',String(value));expand.textContent=value?'Reduce details':'Expand details';};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  map.on('moveend zoomend',share);openTab.addEventListener('contextmenu',share);openTab.addEventListener('pointerdown',share);
  return {select(s,w){station=s;window=w;title.textContent=s.name;centre.disabled=!s.coordinates;share();},open(){if(panel.hidden){previousFocus=document.activeElement;panel.hidden=false;detail.scrollTop=0;closeButton.focus({preventScroll:true});}},close,panel};
 }};
})(window);
