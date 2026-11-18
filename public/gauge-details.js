/* Desktop side panel and full-screen phone details with identity-safe comparison tabs. */
(function(root){
 'use strict';
 root.GaugeDetails={attach(map){
  const detail=document.getElementById('detail');if(!detail)return null;
  const panel=document.createElement('section');panel.className='gauge-detail-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');panel.setAttribute('aria-labelledby','gaugePanelTitle');
  const bar=document.createElement('div');bar.className='gauge-panel-bar';const title=document.createElement('h2');title.id='gaugePanelTitle';title.textContent='Gauge details';
  const actions=document.createElement('div');actions.className='gauge-panel-actions';
  function comparison(text){const link=document.createElement('a');link.textContent=text;link.target='_blank';link.rel='noopener';return link;}
  const water=comparison('Open Water Level'),ifd=comparison('Open IFD'),closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='Close details';
  actions.append(water,ifd,closeButton);bar.append(title,actions);panel.append(bar,detail);document.body.append(panel);
  const currentWater=location.pathname.startsWith('/water-history'),currentIfd=location.pathname.startsWith('/point-ifd');if(currentIfd)ifd.textContent='Open Rainfall';
  let station=null,selection=null,previousFocus=null,counterparts=null,loading=false,version=0;
  const media=matchMedia('(max-width:850px)'),inertBefore=new Map();let modal=false,previousOverflow='';
  function syncModal(){const next=!panel.hidden&&media.matches;if(next===modal)return;modal=next;panel.setAttribute('aria-modal',String(modal));if(modal){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';for(const child of document.body.children){if(child===panel||['SCRIPT','STYLE'].includes(child.tagName))continue;inertBefore.set(child,child.inert);child.inert=true;}}else{document.body.style.overflow=previousOverflow;for(const [child,value] of inertBefore)child.inert=value;inertBefore.clear();}}
  media.addEventListener('change',syncModal);
  function destination(link,path,target){
   if(target===undefined){link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.title='Checking station match…';return;}
   const current=new URL(location.href),u=new URL(path,location.origin),c=map.getCenter().wrap();
   u.searchParams.set('basin',target?.basinId||station.basinId||current.searchParams.get('basin'));
   if(target)u.searchParams.set('gauge',target.id);
   const end=path==='/point-ifd'?new Date(Math.floor(Date.parse(selection.end)/900000)*900000).toISOString():selection.end;
   u.searchParams.set('end',end);u.searchParams.set('minutes',path==='/point-ifd'?1440:selection.minutes);if(path==='/point-ifd')u.searchParams.set('mode','wettest');
   u.searchParams.set('view','keep');u.searchParams.set('mapLat',c.lat.toFixed(6));u.searchParams.set('mapLng',c.lng.toFixed(6));u.searchParams.set('mapZoom',map.getZoom());
   link.href=u.pathname+u.search;link.removeAttribute('aria-disabled');link.title=target?'Open this station with the same map view':'No verified station match; open the same view and choose a gauge';
  }
  function share(){if(!station||!selection)return;destination(water,'/water-history',currentWater?station:loading?undefined:counterparts?.water||null);destination(ifd,currentIfd?'/history':'/point-ifd',!currentWater?station:loading?undefined:counterparts?.rain||null);}
  function close(){if(panel.hidden)return;panel.hidden=true;syncModal();if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});}
  closeButton.onclick=close;
  document.addEventListener('keydown',event=>{if(modal&&event.key==='Tab'){const items=[...panel.querySelectorAll('button,a[href],input,select,summary,textarea,[tabindex="0"]')].filter(n=>!n.disabled&&n.getClientRects().length),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopImmediatePropagation();close();}},true);
  map.on('moveend zoomend',share);for(const link of [water,ifd])for(const type of ['contextmenu','pointerdown'])link.addEventListener(type,share);
  return {select(s,w){station=s;selection=w;title.textContent=s.name;counterparts=null;loading=false;const run=++version,sid=s.stationNumber||(currentWater?s.id:null);if(/^\d{6}$/.test(sid||'')){loading=true;ViewerData.read('/api/gauge-counterparts?'+new URLSearchParams({station:sid,basin:s.basinId||new URLSearchParams(location.search).get('basin')})).then(result=>{if(run!==version)return;counterparts=result;}).catch(()=>{}).finally(()=>{if(run!==version)return;loading=false;share();});}share();},open(){if(panel.hidden){previousFocus=document.activeElement;panel.hidden=false;syncModal();detail.scrollTop=0;closeButton.focus({preventScroll:true});}},close,panel};
 }};
})(window);
