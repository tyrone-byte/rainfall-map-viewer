/* Prioritise complete latest-24h rainfall totals, then wet-gauge coverage. */
(function(root){
 'use strict';
 root.RainfallGroupPriority={apply(container,stats){
  const byId=new Map(stats.map(s=>[s.id,s])),buttons=[...container.querySelectorAll('[data-basin]')];
  buttons.forEach((button,index)=>{if(!button.dataset.originalOrder)button.dataset.originalOrder=String(index+1);});
  function comparable(button){const s=byId.get(button.dataset.basin);return s?.completeGauges>0&&Number.isFinite(s.maxDepth)?s:null;}
  buttons.sort((a,b)=>{
   const left=comparable(a),right=comparable(b);
   if(left&&!right)return -1;if(right&&!left)return 1;
   if(left&&right){const difference=right.maxDepth-left.maxDepth||(right.wetPercent??0)-(left.wetPercent??0)||(right.wetGauges??0)-(left.wetGauges??0);if(difference)return difference;}
   return Number(a.dataset.originalOrder)-Number(b.dataset.originalOrder);
  });
  container.append(...buttons);
 }};
})(window);
