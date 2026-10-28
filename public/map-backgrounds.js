/* Background tiles are independent of gauge observations and map position. */
(function(root){
 'use strict';
 root.MapBackgrounds={attach(map,select){
  const street=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  // Reuse the same no-key OSM tiles; greyscale applies only to this tile layer.
  const grey=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,className:'map-grey-tiles',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
  const imagery=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Tiles © Esri · Maxar · Earthstar Geographics · GIS User Community'});
  const labels=L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{maxZoom:18,attribution:'Labels © Esri'});
  const layers={street,grey,hybrid:L.layerGroup([imagery,labels])};
  for(const layer of [street,grey,imagery,labels])layer.on('tileerror',()=>{const status=document.getElementById('tileStatus');if(status)status.hidden=false;});
  let current;
  try{const saved=localStorage.getItem('atlas-background');if(layers[saved])select.value=saved;}catch(_){}
  function apply(){if(current)map.removeLayer(current);current=layers[select.value]||street;const status=document.getElementById('tileStatus');if(status)status.hidden=true;current.addTo(map);try{localStorage.setItem('atlas-background',select.value);}catch(_){}}
  select.addEventListener('change',apply);apply();return layers;
 }};
})(window);
