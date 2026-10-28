/* A linear phone layout: time controls, map/plots, then station search/list. */
(function(root){
 'use strict';
 let active=null;
 root.MobileViewer={attach(map){
  const main=document.querySelector('main'),sidebar=document.querySelector('.sidebar'),plots=document.querySelector('.workspace'),time=document.querySelector('.time-controls');
  if(!main||!sidebar||!plots||!time)return;
  const media=root.matchMedia('(max-width: 850px)');
  sidebar.id=sidebar.id||'viewerGauges';plots.id=plots.id||'viewerPlots';
  const find=document.createElement('a');find.href='#'+sidebar.id;find.textContent='Find gauge ↓';find.className='mobile-jump-link';find.setAttribute('aria-label','Jump to station search and gauges');
  document.querySelector('.map-controls')?.append(find);
  const back=document.createElement('a');back.href='#map';back.textContent='Back to map ↑';back.className='mobile-jump-link';sidebar.querySelector('.filters')?.prepend(back);
  function sync(){
   if(media.matches)main.append(time,plots,sidebar);
   else{sidebar.prepend(time);main.append(sidebar,plots);}
   if(!main.hidden)requestAnimationFrame(()=>map.invalidateSize({animate:false}));
  }
  active={show(target){if(media.matches&&!main.hidden&&target)target.scrollIntoView({block:'start'});}};
  new MutationObserver(()=>{if(media.matches){root.scrollTo({top:0});if(!main.hidden)requestAnimationFrame(()=>map.invalidateSize({animate:false}));}}).observe(main,{attributes:true,attributeFilter:['hidden']});
  media.addEventListener('change',sync);sync();
 },showPlot(target){active?.show(target);}};
})(window);
