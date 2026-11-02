'use strict';
// One Leaflet SVG renderer, with native vector paths rather than HTML station markers.
(function(){
 const ns='http://www.w3.org/2000/svg';
 const sizeAtZoom=z=>z<=6?8:z<=10?8+(z-6):Math.min(20,12+(z-10)*2);
 const Gauge=L.CircleMarker.extend({
  initialize(latlng,props={}){
   this.props=props;this.hovered=false;
   L.CircleMarker.prototype.initialize.call(this,latlng,{renderer:props.renderer,fillColor:props.colour||'#9CA3AF',fillOpacity:1,stroke:false,bubblingMouseEvents:false});
   this.on('mouseover',()=>{this.hovered=true;this.resize();}).on('mouseout',()=>{this.hovered=false;this.resize();});
  },
  onAdd(map){L.CircleMarker.prototype.onAdd.call(this,map);map.on('zoomend',this.resize,this);this.resize();},
  onRemove(map){map.off('zoomend',this.resize,this);for(const n of this.parts||[])n.remove();this.parts=null;L.CircleMarker.prototype.onRemove.call(this,map);},
  resize(){this.setRadius((this.props.size||sizeAtZoom(this._map.getZoom()))/2+(this.hovered?1:0));},
  _updatePath(){
   if(!this._map||!this._point||!this._path?.parentNode)return;
   if(!this.parts){this.parts=Array.from({length:4},()=>{const p=document.createElementNS(ns,'path');p.setAttribute('pointer-events','none');this._path.parentNode.insertBefore(p,this._path.nextSibling);return p;});}
   const {x,y}=this._point,r=this._radius,inner=Math.max(2,r-1.5),circle=radius=>`M ${x-radius} ${y} a ${radius} ${radius} 0 1 0 ${2*radius} 0 a ${radius} ${radius} 0 1 0 ${-2*radius} 0`;
   const [water,arrow,ring,halo]=this.parts;
   halo.setAttribute('d',circle(r+2));halo.setAttribute('fill','none');halo.setAttribute('stroke',this.props.selected?'#183f43':'white');halo.setAttribute('stroke-width',this.props.selected?'2':'1');
   ring.setAttribute('d',circle(r));ring.setAttribute('fill','#fff');ring.setAttribute('stroke','#334155');ring.setAttribute('stroke-width','1');
   const wave=inner*.22;
   const waterPath=r<=4.5?circle(inner):`M ${x-inner} ${y} Q ${x-inner/2} ${y-wave*2} ${x} ${y} T ${x+inner} ${y} A ${inner} ${inner} 0 0 1 ${x-inner} ${y} Z`;
   this._renderer._setPath(this,circle(r));
   this._path.setAttribute('fill','#fff');
   water.setAttribute('d',waterPath);water.setAttribute('fill',this.props.colour||'#9CA3AF');
   this._path.setAttribute('class','leaflet-interactive water-gauge-symbol');
   this._path.setAttribute('data-status',this.props.status||'missing');
   this._path.setAttribute('data-size',String(r*2));
   if(this.props.id)this._path.setAttribute('data-gauge','water:'+this.props.id);
   const trend=this.props.trend,ax=x+r+4,ay=y-r;
   arrow.setAttribute('d',r>=6&&trend?(trend==='rising'?`M ${ax-2} ${ay+2} L ${ax} ${ay-2} L ${ax+2} ${ay+2} Z`:trend==='falling'?`M ${ax-2} ${ay-2} L ${ax} ${ay+2} L ${ax+2} ${ay-2} Z`:`M ${ax-2} ${ay-2} L ${ax+2} ${ay} L ${ax-2} ${ay+2} Z`):'');
   arrow.setAttribute('fill','#183f43');arrow.setAttribute('stroke','white');arrow.setAttribute('stroke-width','.6');
  }
 });
 window.WaterGaugeMarker={sizeAtZoom,create:(latlng,props)=>new Gauge(latlng,props)};
})();
