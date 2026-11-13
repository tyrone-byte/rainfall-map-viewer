/* Fit the complete map into the initial viewport; controls and plots remain reachable. */
(function(root){
 'use strict';
 root.MapLanding={resize(map){const center=map.getCenter(),zoom=map.getZoom();map.invalidateSize({animate:false});map.setView(center,zoom,{animate:false,reset:true});},attachDam(map){
  const main=document.querySelector('.dam-main'),workspace=document.querySelector('.dam-workspace'),controls=document.querySelector('.dam-controls'),wrap=workspace.querySelector('.map-wrap');
  const panel=document.createElement('details');panel.className='dam-controls-panel';const summary=document.createElement('summary');summary.textContent='Dam & time controls';controls.replaceWith(panel);panel.append(summary,controls);
  const metadata=document.createElement('details');metadata.className='dam-context-details';const title=document.createElement('summary');title.textContent='Dam details & source notes';const content=document.createElement('div');metadata.append(title,content);content.append(document.getElementById('damInfo'),...workspace.querySelectorAll(':scope > p'));const liveStatus=content.querySelector('#status');if(liveStatus)wrap.after(liveStatus,metadata);else wrap.after(metadata);
  controls.append(workspace.querySelector('.dam-layers'));const background=workspace.querySelector('.map-heading>label');if(background)controls.append(background);
  const damLabel=document.getElementById('dam').closest('label'),placeholder=document.createComment('dam selector');damLabel.before(placeholder);const picker=document.createElement('div');picker.className='dam-picker';workspace.prepend(picker);
  const holder=document.createElement('div');holder.className='dam-mobile-settings';const control=L.control({position:'topright'});control.onAdd=()=>{L.DomEvent.disableClickPropagation(holder);L.DomEvent.disableScrollPropagation(holder);return holder;};control.addTo(map);
  const media=matchMedia('(max-width:850px)');function sync(){if(media.matches){picker.append(damLabel);holder.append(panel);holder.hidden=false;panel.open=false;}else{placeholder.after(damLabel);main.prepend(panel);holder.hidden=true;panel.open=true;}map.viewportLayout?.fit();root.MapLanding.resize(map);}media.addEventListener('change',sync);sync();
  this.attach(map);
 },attach(map){
  const wrap=map.getContainer().closest('.map-wrap'),workspace=wrap.closest('.workspace,.dam-workspace');if(!wrap||!workspace)return;
  document.body.classList.add('map-landing');let scheduled=false;
  function fit(){scheduled=false;if(wrap.classList.contains('map-expanded')||!wrap.getClientRects().length)return;
   const viewport=root.visualViewport?.height||innerHeight,rect=wrap.getBoundingClientRect(),mobile=matchMedia('(max-width:850px)').matches;
   const top=rect.top+scrollY+(mobile?0:workspace.scrollTop);
   const bottom=!mobile&&document.body.classList.contains('viewer-page')?workspace.getBoundingClientRect().bottom:viewport;
   const available=Math.max(140,Math.floor(bottom-top-10));
   wrap.style.setProperty('--map-panel-height',Math.max(100,available-24)+'px');
   if(Math.abs(map.getContainer().offsetHeight-available)>1){const center=map.getCenter(),zoom=map.getZoom();map.getContainer().style.setProperty('height',available+'px');map.invalidateSize({animate:false});map.setView(center,zoom,{animate:false,reset:true});}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(fit);}
  const observer=new ResizeObserver(schedule);
  for(const el of [document.querySelector('header'),document.querySelector('.page-tabs'),workspace.querySelector('.map-heading'),document.querySelector('.map-group-selector'),document.querySelector('#notice')])if(el)observer.observe(el);
  root.addEventListener('resize',schedule);root.visualViewport?.addEventListener('resize',schedule);
  map.viewportLayout={fit:schedule};schedule();
 }};
})(window);
