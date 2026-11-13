const {test}=require('node:test'),assert=require('node:assert/strict');
const {contains,visibleShare}=require('../public/group-overview.js');
test('navigation footprint includes interior and boundary points, not distant points',()=>{
 const ring=[[152,-28],[153,-28],[153,-27],[152,-27]];
 assert.equal(contains(ring,-27.5,152.5),true);assert.equal(contains(ring,-28,152.5),true);assert.equal(contains(ring,-26,152.5),false);assert.equal(contains([],0,0),false);
});
test('overlapping footprints retain both possible groups',()=>{
 const a=[[152,-28],[153,-28],[153,-27],[152,-27]],b=[[152.5,-28.5],[153.5,-28.5],[153.5,-27.5],[152.5,-27.5]];
 assert.equal([a,b].filter(p=>contains(p,-27.75,152.75)).length,2);
});

test('neighbour visibility switches at half its mapped gauges, not one anchor',()=>{
 const g={locations:[[0,0],[0,1],[0,2],[0,3]]};
 assert.equal(visibleShare(g,p=>p[1]<1),.25);assert.equal(visibleShare(g,p=>p[1]<2),.5);assert.equal(visibleShare({locations:[]},()=>true),0);
});
