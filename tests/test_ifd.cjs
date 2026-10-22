const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {accumulations,parseReference}=require('../public/ifd.js');
const periods=Array.from({length:8},(_,i)=>({start:new Date(Date.UTC(2026,9,21,i*3)).toISOString(),end:new Date(Date.UTC(2026,9,21,(i+1)*3)).toISOString()}));
test('latest sums complete blocks and leaves missing durations unavailable',()=>{
 const p=accumulations([10,0,20,30,null,5,0,0],periods);
 assert.equal(p[0].depth,0);assert.equal(p[1].depth,0);assert.equal(p[2].depth,5);assert.equal(p[3].depth,null);assert.equal(p[7].depth,null);
 assert.equal(p[2].start,periods[5].start);assert.equal(p[2].end,periods[7].end);
 assert.deepEqual(p.map(p=>p.minutes),[180,360,540,720,900,1080,1260,1440]);
});
test('wettest windows can have different ends; incomplete candidates are disclosed',()=>{
 const p=accumulations([10,0,20,30,null,5,0,0],periods,'wettest');
 assert.equal(p[0].depth,30);assert.equal(p[1].depth,50);assert.equal(p[3].depth,60);assert.equal(p[7].depth,null);
 assert.equal(p[0].end,periods[3].end);assert.equal(p[0].validWindows,7);assert.equal(p[0].possibleWindows,8);
 assert.equal(p[3].validWindows,1);assert.equal(p[3].possibleWindows,5);
});
test('all missing never becomes zero; valid zero remains zero',()=>{
 assert.ok(accumulations(Array(8).fill(null),periods,'wettest').every(p=>p.depth===null));
 assert.ok(accumulations(Array(8).fill(0),periods).every(p=>p.depth===0));
});
test('discontinuous periods are not bridged',()=>{
 const broken=structuredClone(periods);broken[4].start=periods[3].start;
 const p=accumulations(Array(8).fill(1),broken);
 assert.equal(p[2].depth,3);assert.equal(p[3].depth,null);assert.equal(p[7].depth,null);
});
test('reference uses exact supplied depths and durations, with no AEP inference',()=>{
 const r=parseReference(fs.readFileSync('data/brisbane-ifd-2030.csv','utf8'));
 const p=r.points.find(p=>p.minutes===180);
 assert.equal(p.depths[r.aeps.indexOf(1)],130.2);assert.equal(p.depths[r.aeps.indexOf(.1)],180);
 assert.equal(r.points[0].minutes,5);
 assert.throws(()=>parseReference('bad,1\n180 (3.0),100'));
 assert.throws(()=>parseReference('min (h) AEP,1\n180 (3.0),'));
});
test('quarter-hour IFD uses native blocks and preserves gaps at selected ending time',()=>{
 const quarters=Array.from({length:96},(_,i)=>({start:new Date(Date.UTC(2026,9,22,0,i*15)).toISOString(),end:new Date(Date.UTC(2026,9,22,0,(i+1)*15)).toISOString()}));
 const values=Array(96).fill(1);values[92]=null;
 const result=accumulations(values,quarters,'latest',15);
 assert.equal(result[0].minutes,15);assert.equal(result[95].minutes,1440);
 assert.equal(result[2].depth,3);assert.equal(result[3].depth,null);
 assert.equal(result[0].end,quarters[95].end);
 const wettest=accumulations(values,quarters,'wettest',15);
 assert.equal(wettest[3].depth,4);assert.equal(wettest[95].depth,null);
 assert.equal(values[92],null);assert.equal(quarters.length,96);
 assert.throws(()=>accumulations(values,quarters,'latest',0));
});
