/* Map-first phone layout with compact controls and an optional expanded map. */
(function(root){
 'use strict';
 let active=null;
 root.MobileViewer={attach(map){
  const main=document.querySelector('main'),sidebar=document.querySelector('.sidebar'),plots=document.querySelector('.workspace'),time=document.querySelector('.time-controls');
  if(!main||!sidebar||!plots||!time)return;
  document.body.classList.add('viewer-page','viewer-awaiting-group');main.hidden=false;
  const picker=document.getElementById('groupPicker');if(picker)sidebar.prepend(picker);
  const groupBar=document.createElement('div');groupBar.className='map-group-selector';const groupLabel=document.createElement('label');groupLabel.htmlFor='mapGroup';groupLabel.textContent='Group';const groupSelect=document.createElement('select');groupSelect.id='mapGroup';groupSelect.setAttribute('aria-label','Choose observation group');groupSelect.append(new Option('Loading groups…',''));document.getElementById('period').textContent='Choose a group to load saved gauge observations';groupBar.append(groupLabel,groupSelect);plots.prepend(groupBar);groupSelect.onchange=()=>document.dispatchEvent(new CustomEvent('viewer-group-select',{detail:groupSelect.value}));
  const media=root.matchMedia('(max-width: 850px)');
  const overview=GroupOverview.attach(map,{kind:location.pathname.startsWith('/water-history')?'water':'rain'});
  sidebar.id=sidebar.id||'viewerGauges';plots.id=plots.id||'viewerPlots';
  const find=document.createElement('a');find.href='#'+sidebar.id;find.textContent='Find gauge ↓';find.className='mobile-jump-link';find.setAttribute('aria-label','Jump to station search and gauges');
  document.querySelector('.map-controls')?.append(find);
  const back=document.createElement('a');back.href='#map';back.textContent='Back to map ↑';back.className='mobile-jump-link';sidebar.querySelector('.filters')?.prepend(back);
  const compact=document.createElement('details');compact.className='mobile-controls';
  const summary=document.createElement('summary');summary.textContent='Time & display controls';compact.append(summary);
  const legend=plots.querySelector('.legend');let legendPanel;
  if(legend){legendPanel=document.createElement('details');legendPanel.className=legend.className+' map-legend';const title=document.createElement('summary');title.textContent='Map legend';const content=document.createElement('div');content.className='map-legend-content';while(legend.firstChild)content.append(legend.firstChild);legendPanel.append(title,content);legend.replaceWith(legendPanel);L.DomEvent.disableClickPropagation(legendPanel);L.DomEvent.disableScrollPropagation(legendPanel);}
  const mapControls=plots.querySelector('.map-controls'),displayControls=document.createElement('div');displayControls.className='mobile-display-settings';const displayFields=[...mapControls.querySelectorAll(':scope > label')];time.append(displayControls);
  function summaryText(){const duration=document.getElementById('accumulation'),mode=document.getElementById('mapIfdMode'),colour=document.getElementById('colourMode');summary.title='Time & display · '+(mode?.value==='wettest'?'Wettest 24 hours':duration?.selectedOptions[0]?.textContent||'Selected time')+(colour?' · '+colour.selectedOptions[0].textContent:'');}
  summary.textContent='Map & time';time.addEventListener('change',summaryText);const timeLabel=document.getElementById('timeLabel');if(timeLabel)new MutationObserver(summaryText).observe(timeLabel,{childList:true});summaryText();
  const newest=document.getElementById('newest');
  function compactDate(){if(!newest)return;const text=newest.textContent,short=text.replace(/^Newest saved (?:end|observation):\s*/,'');if(short!==text){newest.dataset.fullText=text;newest.title=text;}if(media.matches&&short!==text)newest.textContent=short;else if(!media.matches&&newest.dataset.fullText&&short===text&&text)newest.textContent=newest.dataset.fullText;}
  if(newest)new MutationObserver(compactDate).observe(newest,{childList:true});const refresh=document.getElementById('refresh');if(refresh)refresh.title='Refresh saved data';
  const timeContainer=document.createElement('div');timeContainer.className='mobile-time-control';const timeControl=L.control({position:'topright'});timeControl.onAdd=()=>{L.DomEvent.disableClickPropagation(timeContainer);L.DomEvent.disableScrollPropagation(timeContainer);return timeContainer;};timeControl.addTo(map);
  const actionContainer=document.createElement('div');actionContainer.className='map-action-control';const actionControl=L.control({position:'topleft'});actionControl.onAdd=()=>{L.DomEvent.disableClickPropagation(actionContainer);return actionContainer;};actionControl.addTo(map);const fitButton=document.getElementById('fit');
  function sync(){
   compactDate();
   if(media.matches){plots.prepend(groupBar);displayControls.append(...displayFields);compact.append(time);timeContainer.append(compact);actionContainer.append(fitButton,find);timeContainer.hidden=false;actionContainer.hidden=false;main.append(plots,sidebar);}
   else{mapControls.prepend(...displayFields);mapControls.append(fitButton,find);sidebar.prepend(time);sidebar.prepend(groupBar);compact.remove();timeContainer.hidden=true;actionContainer.hidden=true;main.append(sidebar,plots);}
   if(legendPanel)legendPanel.open=!media.matches;
   if(!main.hidden)requestAnimationFrame(()=>MapLanding.resize(map));
  }
  compact.addEventListener('toggle',()=>{if(!main.hidden)requestAnimationFrame(()=>MapLanding.resize(map));});
  active={setGroups(groups){overview.setGroups(groups);groupSelect.replaceChildren(new Option('Choose a group…',''),...groups.map(g=>new Option(g.label,g.id)));},setGroup(id){overview.select(id);groupSelect.value=id||'';groupBar.hidden=false;if(!id)document.getElementById('period').textContent='Choose a group to load saved gauge observations';document.body.classList.toggle('viewer-awaiting-group',!id);main.hidden=false;map.viewportLayout?.fit();},showMap(){if(expanded)return;if(media.matches)root.scrollTo({top:0,behavior:'auto'});else plots.scrollTo({top:0,behavior:'auto'});},show(target){if(main.hidden||!target)return;if(expanded)setExpanded(false);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!target.isConnected)return;if(media.matches)target.scrollIntoView({block:'start',behavior:'auto'});else plots.scrollTo({top:plots.scrollTop+target.getBoundingClientRect().top-plots.getBoundingClientRect().top,behavior:'auto'});}));}};
  new MutationObserver(()=>{if(media.matches){root.scrollTo({top:0});if(!main.hidden)requestAnimationFrame(()=>MapLanding.resize(map));}}).observe(main,{attributes:true,attributeFilter:['hidden']});
  media.addEventListener('change',sync);sync();
  // Keep the active page tab discoverable without a second navigation button.
  const nav=document.querySelector('.page-tabs'),current=nav?.querySelector('[aria-current="page"]');if(nav&&current&&media.matches)nav.scrollLeft=Math.max(0,current.offsetLeft-nav.offsetLeft-20);
  MapLanding.attach(map);
  const wrap=plots.querySelector('.map-wrap'),expand=document.createElement('button');expand.type='button';expand.className='expand-map-button';expand.textContent='Expand map';expand.setAttribute('aria-pressed','false');
  const control=L.control({position:'bottomright'});control.onAdd=()=>{L.DomEvent.disableClickPropagation(expand);return expand;};control.addTo(map);
  const caption=document.createElement('div');caption.className='expanded-map-caption';wrap.append(caption);const period=document.getElementById('period');function captionText(){caption.textContent=period?.textContent||'Selected gauge observations';}if(period)new MutationObserver(captionText).observe(period,{childList:true});captionText();
  let expanded=false,previousOverflow='',wasDragging=false;const inertBefore=new Map();
  function syncPan(){const button=document.querySelector('.map-pan-control button');if(button){const enabled=map.dragging.enabled();button.textContent=enabled?'Finish moving':'Move map';button.setAttribute('aria-pressed',String(enabled));}}
  function setExpanded(value){
   expanded=value;expand.textContent=value?'Exit full map':'Expand map';expand.setAttribute('aria-pressed',String(value));wrap.classList.toggle('map-expanded',value);document.body.classList.toggle('viewer-map-expanded',value);
   if(value){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';wasDragging=map.dragging.enabled();map.dragging.enable();wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-label','Expanded gauge map');
    for(const element of document.querySelectorAll('header,nav,footer,.sidebar,.time-controls,#notice,.workspace > :not(.map-wrap)')){if(element.contains(wrap))continue;inertBefore.set(element,element.inert);element.inert=true;}
   }else{document.body.style.overflow=previousOverflow;if(wasDragging)map.dragging.enable();else map.dragging.disable();wrap.removeAttribute('role');wrap.removeAttribute('aria-modal');wrap.removeAttribute('aria-label');for(const [el,value] of inertBefore)el.inert=value;inertBefore.clear();}
   syncPan();if(!value)map.viewportLayout?.fit();requestAnimationFrame(()=>{MapLanding.resize(map);expand.focus({preventScroll:true});});
  }
  expand.onclick=()=>setExpanded(!expanded);
  document.addEventListener('keydown',event=>{if(!expanded)return;if(event.key==='Escape'){event.preventDefault();setExpanded(false);}else if(event.key==='Tab'){const focusable=[...wrap.querySelectorAll('button,input,select,summary,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}},true);
 },setGroups(groups){active?.setGroups(groups);},setGroup(id){active?.setGroup(id);},showMap(){active?.showMap();},showPlot(target){active?.show(target);}};
})(window);
