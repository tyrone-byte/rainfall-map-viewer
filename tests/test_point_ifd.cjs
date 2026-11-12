const {test}=require('node:test');
const assert=require('node:assert/strict');
const {estimate,evaluate,depthsAt,colour,label}=require('../public/point-ifd.js');
const periods=Array.from({length:96},(_,i)=>({start:new Date(Date.UTC(2026,9,22,0,i*15)).toISOString(),end:new Date(Date.UTC(2026,9,22,0,(i+1)*15)).toISOString()}));
const reference={aeps:[50,10,1,.1],points:[{minutes:15,depths:[10,20,40,80]},{minutes:60,depths:[20,40,80,160]},{minutes:1440,depths:[40,80,160,320]}]};
test('log interpolation recovers exact AEPs and bounds without extrapolation',()=>{
 assert.equal(estimate(reference,15,40).aep,1);
 assert.ok(Math.abs(estimate(reference,15,Math.sqrt(20*40)).aep-Math.sqrt(10))<1e-9);
 assert.ok(Math.abs(depthsAt(reference,30)[0]-Math.sqrt(200))<1e-9);
 assert.equal(estimate(reference,15,1).bound,'above');assert.equal(label(estimate(reference,15,1)),'>50% AEP');
 assert.equal(estimate(reference,15,100).bound,'below');assert.equal(label(estimate(reference,15,100)),'<0.1% AEP');
 assert.equal(estimate(reference,3000,100),null);
});
test('rarest AEP is selected across durations, rather than largest accumulated depth',()=>{
 const values=Array(96).fill(.05);values[20]=40;
 const result=evaluate(values,periods,reference,'wettest',180);
 assert.equal(result.minutes,15);assert.equal(result.depth,40);assert.equal(result.aep,1);assert.equal(result.end,periods[20].end);
 const latest=evaluate(values,periods,reference,'latest',60);assert.equal(latest.minutes,60);assert.ok(latest.depth<1);assert.equal(latest.bound,'above');
});
test('ending mode uses exactly its chosen duration and date',()=>{
 const values=Array(96).fill(1);values[95]=20;
 const short=evaluate(values,periods,reference,'latest',15),long=evaluate(values,periods,reference,'latest',60);
 assert.equal(short.depth,20);assert.equal(long.depth,23);assert.equal(short.end,periods[95].end);assert.notEqual(short.aep,long.aep);
});
test('missing quarters are never zero or bridged and partial maxima are disclosed',()=>{
 const values=Array(96).fill(1);values[20]=null;
 const result=evaluate(values,periods,reference,'wettest');assert.equal(result.partial,true);assert.ok(result.validWindows<result.possibleWindows);
 assert.equal(evaluate(values,periods,reference,'latest',1440).aep,undefined);
 assert.equal(evaluate(Array(96).fill(null),periods,reference).aep,undefined);
 assert.equal(colour(evaluate(values,periods,null)),'#88969c');
 assert.equal(evaluate(Array(96).fill(0),periods,reference).bound,'above');
});
test('inconsistent or missing reference curves cannot produce AEP estimates',()=>{
 const bad=structuredClone(reference);bad.points[0].depths=[10,40,20,80];
 assert.equal(estimate(bad,15,30),null);assert.equal(estimate({aeps:[1],points:[]},15,1),null);
});
