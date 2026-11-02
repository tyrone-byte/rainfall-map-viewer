const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,colours,config}=require('../public/water-gauge-status.js');
test('status palette uses explicit categories and never guesses flood category from height',()=>{
 for(const status of ['normal','elevated','minor','moderate','major','extreme'])assert.equal(classify({level:4,floodStatus:status}).colour,colours[status]);
 assert.equal(classify({level:99,status:'current'}).label,'Current · flood category unclassified');
 assert.equal(classify({level:4,floodStatus:'watch'}).status,'minor');
});
test('missing and stale data override supplied severity, relative to selected frame',()=>{
 for(const station of [{level:null},{level:NaN},{level:3,status:'suspect'},{level:3,ageMinutes:60},{level:3,status:'out'}])assert.equal(classify({...station,floodStatus:'major'}).status,'missing');
 assert.equal(classify({level:3,ageMinutes:59}).status,'normal');
});
test('trend requires an explicit significance threshold and complete rate',()=>{
 assert.equal(classify({level:3,ratePerHour:2}).trend,null);
 const settings={...config,trendThresholdPerHour:.1};
 assert.equal(classify({level:3,ratePerHour:.1},settings).trend,'steady');
 assert.equal(classify({level:3,ratePerHour:.11},settings).trend,'rising');
 assert.equal(classify({level:3,ratePerHour:-.11},settings).trend,'falling');
 assert.equal(classify({level:3},settings).trend,null);
});
