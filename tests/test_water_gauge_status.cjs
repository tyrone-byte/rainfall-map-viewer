const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classify,colours,config}=require('../public/water-gauge-status.js');
test('movement colours ignore absolute heights and supplied consequence categories',()=>{
 for(const direction of ['rising','falling','steady'])for(const level of [0,99])assert.equal(classify({level,direction,floodStatus:'major'}).colour,colours[direction]);
 for(const station of [{level:null,direction:'rising'},{level:NaN},{level:3,direction:'unavailable'}])assert.equal(classify(station).status,'missing');
});
test('rate-of-rise bands preserve original boundaries, falling and steady colours',()=>{
 for(const [rate,colour] of [[.1,'#36a46d'],[.1001,'#e9c345'],[.3,'#e9c345'],[.3001,'#ed8b36'],[.6,'#ed8b36'],[.6001,'#d94843']])assert.equal(classify({level:4,direction:'rising',ratePerHour:rate},'rate').colour,colour);
 assert.equal(classify({level:4,direction:'falling',ratePerHour:-2},'rate').colour,colours.falling);
 assert.equal(classify({level:4,direction:'steady',ratePerHour:0},'rate').colour,colours.steady);
 assert.equal(classify({level:4,direction:'rising'},'rate').status,'missing');
 assert.equal(classify({level:4,status:'suspect'},'age').colour,'#e9b43d');
});
test('optional arrows require a configured significance threshold independently of movement colour',()=>{
 const station={level:3,direction:'rising',ratePerHour:.1};
 assert.equal(classify(station).trend,null);
 const settings={...config,trendThresholdPerHour:.1};
 assert.equal(classify(station,'trend',settings).trend,'steady');
 assert.equal(classify({...station,ratePerHour:.11},'trend',settings).trend,'rising');
 assert.equal(classify({...station,ratePerHour:-.11},'trend',settings).trend,'falling');
});
test('flood colours use explicit classification, never the absolute height or a missing reading',()=>{
 assert.equal(classify({level:100},'flood').colour,colours.missing);
 assert.equal(classify({level:0,flood:{category:'major'}},'flood').colour,'#c73546');
 assert.equal(classify({level:5,flood:{category:'minor'}},'flood').colour,'#d5ad20');
 assert.equal(classify({level:null,flood:{category:'major'}},'flood').status,'missing');
});
