/* Viewport-loaded, supplied geographic context. No remote GIS service required. */
(function(root){
 'use strict';
 const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 root.MapContext={attach(map,options={}){
  if(map.contextLayers)return map.contextLayers;
  for(const [name,z] of [['contextOverviewAreas',325],['contextAreas',330],['contextSubAreas',331],['contextBoundaries',340],['contextStreams',350],['contextLabels',360]]){map.createPane(name);map.getPane(name).style.zIndex=z;}
  for(const name of ['contextOverviewAreas','contextAreas','contextSubAreas','contextBoundaries','contextStreams','contextLabels'])map.getPane(name).style.pointerEvents='none';
  const labels=L.layerGroup().addTo(map),active=new Map(),cache=new Map(),failed=new Set(),pending=new Map(),queue=[];
  let manifest=null,indexPromise=null,version=0,timer,busy=0,indexFailed=false;
  const panel=node('details');panel.className='map-context-control';panel.append(node('summary','Layers'));
  const contents=node('div');contents.className='map-context-options';panel.append(contents);
  let saved={};try{saved=JSON.parse(localStorage.getItem('atlas-context-layers')||'{}')||{};}catch(_){}
  function toggle(id,text){const label=node('label'),input=node('input');input.type='checkbox';input.id=id;input.checked=typeof saved[id]==='boolean'?saved[id]:true;label.append(input,document.createTextNode(text));contents.append(label);input.onchange=()=>{saved[id]=input.checked;try{localStorage.setItem('atlas-context-layers',JSON.stringify(saved));}catch(_){}schedule();};return input;}
  const catchments=toggle('contextCatchments','Catchments / water plans · solid'),subcatchments=toggle('contextSubcatchments','Subcatchments · dashed + shading'),streams=toggle('contextStreams','Named rivers / larger creeks');
  if(options.boundariesOnly){streams.checked=false;streams.closest('label').hidden=true;}
  if(typeof saved.contextSubcatchments!=='boolean')subcatchments.checked=catchments.checked;
  if(!catchments.checked)subcatchments.checked=false;
  function saveHierarchy(){saved.contextCatchments=catchments.checked;saved.contextSubcatchments=subcatchments.checked;try{localStorage.setItem('atlas-context-layers',JSON.stringify(saved));}catch(_){}schedule();}
  catchments.onchange=()=>{if(!catchments.checked)subcatchments.checked=false;saveHierarchy();};subcatchments.onchange=()=>{if(subcatchments.checked)catchments.checked=true;saveHierarchy();};
  const key=node('div');key.className='context-style-key';for(const [cls,text] of [['context-major-key','Catchment / plan'],['context-minor-key','Subcatchment']]){const item=node('span'),line=node('i');line.className=cls;line.setAttribute('aria-hidden','true');item.append(line,document.createTextNode(text));key.append(item);}contents.append(key);
  const status=node('p','Broad outlines from zoom 5; streams / subcatchments 11.');status.className='map-context-status';status.setAttribute('role','status');contents.append(status);
  const note=node('p','Plan overviews combine supplied areas; they are not newly delineated catchments. Water-plan areas are not verified upstream gauge catchments. Dashed dividers show supplied subcatchments inside solid outlines. Area colours distinguish geography, not warning levels. Stream coverage is partial.');note.className='muted';contents.append(note);
  const retry=node('button','Retry context layers');retry.type='button';retry.hidden=true;retry.onclick=()=>{failed.clear();indexFailed=false;indexPromise=null;schedule();};contents.append(retry);
  const control=L.control({position:'topright'});control.onAdd=()=>{L.DomEvent.disableClickPropagation(panel);L.DomEvent.disableScrollPropagation(panel);L.DomEvent.on(panel,'keydown',L.DomEvent.stopPropagation);return panel;};control.addTo(map);
  if(!options.skipAttribution)map.attributionControl.addAttribution('Water-plan areas / streams © State of Queensland 2025 · CC BY 4.0');
  async function index(){if(indexFailed)throw new Error('Context index unavailable');return indexPromise??=fetch('/map-context/index.json').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{if(d.schemaVersion!==2||!Array.isArray(d.entries))throw new Error();manifest=d;return d;}).catch(e=>{indexFailed=true;throw e;});}
  function pump(){while(busy<4&&queue.length){const {entry,resolve,reject}=queue.shift();busy++;fetch('/map-context/'+entry.file).then(r=>{if(!r.ok)throw new Error('Context file unavailable');return r.json();}).then(data=>{cache.set(entry.file,data);if(cache.size>48)cache.delete(cache.keys().next().value);resolve(data);}).catch(e=>{failed.add(entry.file);reject(e);}).finally(()=>{busy--;pending.delete(entry.file);pump();});}}
  function get(entry){if(cache.has(entry.file))return Promise.resolve(cache.get(entry.file));if(failed.has(entry.file))return Promise.reject(new Error('Context file unavailable'));if(!pending.has(entry.file)){const promise=new Promise((resolve,reject)=>queue.push({entry,resolve,reject}));pending.set(entry.file,promise);pump();}return pending.get(entry.file);}
  function intersects(bounds){const v=map.getBounds();return bounds[0]<=v.getEast()&&bounds[2]>=v.getWest()&&bounds[1]<=v.getNorth()&&bounds[3]>=v.getSouth();}
  function enabled(entry,zoom){const level=entry.kind==='areas'?entry.level:entry.kind;if((level==='subcatchments'||level==='streams')&&(zoom<11||map.groupOverview?.broadView))return false;if(zoom<(entry.minimumZoom??(level==='streams'?11:9))||zoom>(entry.maximumZoom??Infinity))return false;return level==='catchments'?catchments.checked:level==='subcatchments'?subcatchments.checked:level==='streams'&&streams.checked;}
  function paneFor(entry){return entry.kind==='areas'?(entry.derived?'contextOverviewAreas':entry.level==='subcatchments'?'contextSubAreas':'contextAreas'):entry.kind==='streams'?'contextStreams':'contextBoundaries';}
  function styleFor(entry,zoom,feature){
   if(entry.kind==='areas')return {className:'context-area',stroke:false,fill:true,fillColor:feature?.properties?.areaColour||'#8faeaa',fillOpacity:entry.level==='subcatchments' ? .20 : .12};
   if(entry.kind==='streams')return {className:'context-stream',color:'#337eae',weight:zoom>=13?2.2:1.7,opacity:.85,lineCap:'round',lineJoin:'round',fill:false};
   if(entry.kind==='subcatchments')return {className:'context-subcatchment',color:'#84916f',weight:1.2,opacity:.9,dashArray:'6 5',lineCap:'butt',lineJoin:'round',fill:false};
   return {className:'context-catchment',color:'#5c6f58',weight:1.8,opacity:.9,dashArray:null,lineCap:'round',lineJoin:'round',fill:false};
  }
  function labelStreams(){
   labels.clearLayers();if(map.getZoom()<13||!streams.checked)return;
   const size=map.getSize(),names=new Map(),occupied=[],limit=size.x<600?6:12;
   for(const {entry,data} of active.values()){
    if(entry.kind!=='streams')continue;
    for(const feature of data.features||[]){const name=feature.properties?.name;if(!name)continue;const g=feature.geometry,lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
     for(const line of lines){let length=0;const parts=[];
      for(let i=1;i<line.length;i++){const start=map.latLngToContainerPoint([line[i-1][1],line[i-1][0]]),end=map.latLngToContainerPoint([line[i][1],line[i][0]]),clipped=L.LineUtil.clipSegment(start,end,L.bounds([8,12],[size.x-8,size.y-12]),false);if(clipped){const [a,b]=clipped,distance=a.distanceTo(b);if(distance){parts.push({a,b,distance});length+=distance;}}}
      const width=Math.min(180,name.length*6+12);if(length<width+20||names.get(name)?.length>=length)continue;
      function along(d){let used=0;for(const p of parts){if(used+p.distance>=d)return p.a.add(p.b.subtract(p.a).multiplyBy((d-used)/p.distance));used+=p.distance;}return parts.at(-1).b;}
      const at=along(length/2),a=along(Math.max(0,length/2-25)),b=along(Math.min(length,length/2+25));let angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;if(angle>90)angle-=180;if(angle< -90)angle+=180;
      names.set(name,{name,width,length,at,angle});
     }
    }
   }
   for(const p of [...names.values()].sort((a,b)=>b.length-a.length)){
    const w=Math.abs(p.width*Math.cos(p.angle*Math.PI/180))+20,h=Math.abs(p.width*Math.sin(p.angle*Math.PI/180))+20,box={x:p.at.x-w/2,y:p.at.y-h/2,w,h};
    if(box.x<4||box.y<4||box.x+w>size.x-4||box.y+h>size.y-4||occupied.some(b=>box.x<b.x+b.w&&box.x+w>b.x&&box.y<b.y+b.h&&box.y+h>b.y))continue;
    const text=node('span',p.name);text.className='context-stream-label';text.style.transform=`rotate(${p.angle.toFixed(1)}deg)`;
    L.marker(map.containerPointToLatLng(p.at),{pane:'contextLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'context-label-anchor',html:text,iconSize:[p.width,20],iconAnchor:[p.width/2,10]})}).addTo(labels);occupied.push(box);if(occupied.length>=limit)break;
   }
  }
  async function refresh(){
   const run=++version,zoom=map.getZoom();labels.clearLayers();if(!map.getContainer().getClientRects().length)return;
   if(zoom<5||(!catchments.checked&&!streams.checked)){for(const {layer} of active.values())map.removeLayer(layer);active.clear();status.textContent=zoom<5?'Broad outlines from zoom 5; streams / subcatchments 11.':'Context layers hidden.';return;}
   status.textContent='Loading geographic context…';
   try{
    const data=manifest||await index();if(run!==version)return;
    const center=map.getCenter(),matches=data.entries.filter(e=>intersects(e.bounds)&&enabled(e,zoom));
    matches.sort((a,b)=>(a.kind==='areas')-(b.kind==='areas')||Math.hypot((a.bounds[0]+a.bounds[2])/2-center.lng,(a.bounds[1]+a.bounds[3])/2-center.lat)-Math.hypot((b.bounds[0]+b.bounds[2])/2-center.lng,(b.bounds[1]+b.bounds[3])/2-center.lat));
    const chosen=matches.slice(0,32),wanted=new Set(chosen.map(e=>e.file));
    for(const [file,{layer}] of active)if(!wanted.has(file)){map.removeLayer(layer);active.delete(file);}
    await Promise.allSettled(chosen.map(async entry=>{if(active.has(entry.file)){active.get(entry.file).layer.setStyle(entry.kind==='areas'?f=>styleFor(entry,zoom,f):styleFor(entry,zoom));return;}const geo=await get(entry);if(run!==version)return;
     const layer=L.geoJSON(geo,{pane:paneFor(entry),smoothFactor:0,interactive:false,style:f=>styleFor(entry,zoom,f)}).addTo(map);
     active.set(entry.file,{entry,data:geo,layer});
    }));
    if(run!==version)return;
    const n=[...active.values()].filter(a=>a.entry.kind==='catchments').length,minor=[...active.values()].filter(a=>a.entry.kind==='subcatchments').length,s=[...active.values()].filter(a=>a.entry.kind==='streams').length;
    const failures=chosen.filter(e=>failed.has(e.file)).length;
    status.textContent=`${catchments.checked?(n?'Solid catchment / plan outlines shown.':'No saved catchment outline in view.'):'Catchments hidden.'} ${!subcatchments.checked?'Subcatchments hidden.':map.groupOverview?.broadView?'Subcatchments hidden in group overview.':zoom<11?'Zoom to 11 for supplied subcatchments.':minor?'Dashed subcatchment dividers shown.':'No supplied subcatchment dividers in view.'} ${!streams.checked?'Stream layer hidden.':map.groupOverview?.broadView?'Streams hidden in group overview.':zoom<11?'Zoom to 11 for streams.':s?'Saved stream context shown; coverage is partial.':'No saved stream coverage in this view.'}${matches.length>32?' Zoom closer for additional detail.':''}${failures?' Some context files could not load; observations are unaffected.':''}`;
    retry.hidden=!failures;labelStreams();
   }catch(_){if(run===version){status.textContent='Geographic context unavailable. Gauge observations remain available.';retry.hidden=false;}}
  }
  function schedule(){version++;clearTimeout(timer);timer=setTimeout(refresh,120);}
  map.on('moveend zoomend resize groupoverviewchange',schedule);schedule();
  map.contextLayers={refresh,active,labels,panel};return map.contextLayers;
 }};
})(window);
