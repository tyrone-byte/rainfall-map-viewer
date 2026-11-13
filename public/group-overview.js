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
 if(typeof module!=='undefined'&&module.exports){module.exports={contains};return;}
 const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
 root.GroupOverview={attach(map,{kind='rain'}={}){
  map.createPane('gaugeGroupOverview').style.zIndex=385;
  const layer=L.layerGroup().addTo(map);let catalogue=[],allowed=new Map(),selected=null,loaded=false,overviewEnabled=false;
  const ready=fetch('/gauge-group-overview.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Group navigation unavailable');return r.json();}).then(d=>{if(d.schemaVersion!==1||!Array.isArray(d[kind]))throw new Error('Group navigation format unavailable');catalogue=d[kind];loaded=true;draw();}).catch(()=>{loaded=false;});
  function groups(){return catalogue.filter(g=>allowed.has(g.id));}
  function choose(id){const group=groups().find(g=>g.id===id);if(!group)return;map.closePopup();const b=group.bounds;map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[20,20],maxZoom:12,animate:false});document.dispatchEvent(new CustomEvent('viewer-group-select',{detail:id}));}
  function draw(){
   layer.clearLayers();const view=map.getBounds(),visible=groups().map(g=>({...g,visibleSites:(g.locations||[g.anchor]).filter(p=>view.contains(p))})).filter(g=>g.visibleSites.length);
   overviewEnabled=loaded&&allowed.size>0&&!selected;map.getContainer().classList.toggle('group-overview-enabled',overviewEnabled);
   if(!overviewEnabled)return;
   const size=map.getSize(),occupied=[];
   for(const group of visible.sort((a,b)=>(b.id===selected)-(a.id===selected)||b.mappedGaugeCount-a.mappedGaugeCount)){
    const anchor=view.contains(group.anchor)?group.anchor:group.visibleSites.reduce((a,b)=>map.distance(a,map.getCenter())<map.distance(b,map.getCenter())?a:b);
    const p=map.latLngToContainerPoint(anchor),width=size.x<600?136:176,height=43;
    const shifts=[[0,0],[0,-48],[0,48],[-width,0],[width,0]];
    const offset=shifts.find(([x,y])=>{const r={x:p.x-width/2+x,y:p.y-height/2+y,w:width,h:height};return r.x>=4&&r.y>=4&&r.x+r.w<size.x-4&&r.y+r.h<size.y-4&&!occupied.some(o=>r.x<o.x+o.w&&r.x+r.w>o.x&&r.y<o.y+o.h&&r.y+r.h>o.y);});if(!offset)continue;
    const box={x:p.x-width/2+offset[0],y:p.y-height/2+offset[1],w:width,h:height};occupied.push(box);
    const text=node('div');text.className='gauge-group-badge'+(group.id===selected?' is-current':'');text.append(node('strong',allowed.get(group.id).label),node('small',`${group.mappedGaugeCount} sites · View gauges`));
    const marker=L.marker(anchor,{pane:'gaugeGroupOverview',keyboard:true,autoPanOnFocus:false,bubblingMouseEvents:false,title:`View gauges: ${allowed.get(group.id).label}`,icon:L.divIcon({className:'gauge-group-anchor',html:text,iconSize:[width,height],iconAnchor:[width/2-offset[0],height/2-offset[1]]})}).addTo(layer);
    marker.getElement().dataset.groupOverview=group.id;marker.getElement().setAttribute('aria-label',`View gauges for ${allowed.get(group.id).label}`);marker.on('click',()=>choose(group.id));
   }
  }
  map.on('zoomend moveend resize',draw);
  map.on('click',event=>{
   if(event.originalEvent?.target?.closest?.('.leaflet-interactive,.leaflet-marker-icon,.leaflet-control,.leaflet-popup'))return;
   if(!overviewEnabled||event.propagatedFrom||event.layer||(event.sourceTarget&&event.sourceTarget!==map))return;
   const matches=groups().filter(g=>contains(g.footprint,event.latlng.lat,event.latlng.lng));
   if(matches.length===1){choose(matches[0].id);return;}
   const content=node('div');content.className='group-choice-popup';content.append(node('strong',matches.length?'Choose a gauge group':'No mapped gauge group at this location'));
   if(!matches.length)content.append(node('p','Choose a labelled group or use the group selector.'));
   for(const group of matches){const button=node('button',allowed.get(group.id).label);button.type='button';button.onclick=()=>choose(group.id);content.append(button);}
   if(matches.length>1)content.append(node('small','Gauge-group footprints overlap here; these are not catchment boundaries.'));
   L.popup({maxWidth:300}).setLatLng(event.latlng).setContent(content).openOn(map);
  });
  const api={setGroups(items){allowed=new Map(items.map(g=>[g.id,g]));draw();},select(id){selected=id;draw();},layer,ready};map.groupOverview=api;return api;
 }};
})(typeof globalThis!=='undefined'?globalThis:this);
