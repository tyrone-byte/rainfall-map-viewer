/* Explicit group navigation, separate from the passive catchment polygons. */
(function(root){
 'use strict';
 function contains(ring,lat,lng){
  if(!Array.isArray(ring)||ring.length<3)return false;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const [ax,ay]=ring[j],[bx,by]=ring[i],cross=(lng-ax)*(by-ay)-(lat-ay)*(bx-ax);
   if(Math.abs(cross)<1e-9&&lng>=Math.min(ax,bx)-1e-9&&lng<=Math.max(ax,bx)+1e-9&&lat>=Math.min(ay,by)-1e-9&&lat<=Math.max(ay,by)+1e-9)return true;
   if((ay>lat)!==(by>lat)&&lng<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
 }
 function visibleShare(group,inside){const points=group.locations||[group.anchor];return points.length?points.filter(p=>inside(p)).length/points.length:0;}
 if(typeof module!=='undefined'&&module.exports){module.exports={contains,visibleShare};return;}
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 root.GroupOverview={attach(map,{kind='rain'}={}){
  map.createPane('gaugeGroupOverview').style.zIndex=385;
  const layer=L.layerGroup().addTo(map);let catalogue=[],allowed=new Map(),selected=null,loaded=false,overviewEnabled=false,broadView=false;
  const ready=fetch('/gauge-group-overview.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Group navigation unavailable');return r.json();}).then(d=>{if(d.schemaVersion!==1||!Array.isArray(d[kind]))throw new Error('Group navigation format unavailable');catalogue=d[kind];loaded=true;draw();}).catch(()=>{loaded=false;});
  function groups(){return catalogue.filter(g=>allowed.has(g.id));}
  function navigable(){return groups().filter(g=>!selected||g.id===selected||visibleShare(g,p=>map.getBounds().contains(p))>=.5);}
  function choose(id){const group=groups().find(g=>g.id===id);if(!group)return;map.closePopup();const b=group.bounds;map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[20,20],maxZoom:12,animate:false});document.dispatchEvent(new CustomEvent('viewer-group-select',{detail:id}));}
  let hover=null;
  function clearHover(){if(hover){map.removeLayer(hover);hover=null;}}
  function draw(){
   layer.clearLayers();clearHover();
   const wasBroad=broadView;
   broadView=!!selected&&groups().some(g=>g.id!==selected&&visibleShare(g,p=>map.getBounds().contains(p))>=.5);
   overviewEnabled=loaded&&allowed.size>0&&(!selected||broadView);map.getContainer().classList.toggle('group-overview-enabled',overviewEnabled);
   if(wasBroad!==broadView)map.fire('groupoverviewchange',{broadView});
  }
  map.on('mousemove',event=>{
   clearHover();
   if(!overviewEnabled||event.originalEvent?.target?.closest?.('.leaflet-interactive,.leaflet-marker-icon,.leaflet-control,.leaflet-popup'))return;
   const matches=navigable().filter(g=>contains(g.footprint,event.latlng.lat,event.latlng.lng));
   if(!matches.length)return;
   const content=node('div');
   for(const group of matches){const label=node('strong',allowed.get(group.id).label);label.dataset.groupOverview=group.id;label.style.display='block';content.append(label);}
   hover=L.tooltip({direction:'top',offset:[0,-12],className:'group-hover-label',interactive:false}).setLatLng(event.latlng).setContent(content).addTo(map);
  });
  map.getContainer().addEventListener('mouseleave',clearHover);
  map.on('movestart zoomstart',clearHover);
  map.on('zoomend moveend resize',draw);
  map.on('click',event=>{
   clearHover();
   if(event.originalEvent?.target?.closest?.('.leaflet-interactive,.leaflet-marker-icon,.leaflet-control,.leaflet-popup'))return;
   if(!overviewEnabled||event.propagatedFrom||event.layer||(event.sourceTarget&&event.sourceTarget!==map))return;
   const matches=navigable().filter(g=>contains(g.footprint,event.latlng.lat,event.latlng.lng));
   if(matches.length===1){choose(matches[0].id);return;}
   const content=node('div');content.className='group-choice-popup';content.append(node('strong',matches.length?'Choose a gauge group':'No mapped gauge group at this location'));
   if(!matches.length)content.append(node('p','Click a group area or use the group selector.'));
   for(const group of matches){const button=node('button',allowed.get(group.id).label);button.type='button';button.onclick=()=>choose(group.id);content.append(button);}
   if(matches.length>1)content.append(node('small','Gauge-group footprints overlap here; these are not catchment boundaries.'));
   L.popup({maxWidth:300}).setLatLng(event.latlng).setContent(content).openOn(map);
  });
  const api={setGroups(items){allowed=new Map(items.map(g=>[g.id,g]));draw();},select(id){selected=id;draw();},get broadView(){return broadView;},layer,ready};map.groupOverview=api;return api;
 }};
})(typeof globalThis!=='undefined'?globalThis:this);
