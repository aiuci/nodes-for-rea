import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanWorkspace} from '../lib/workspace.mjs';
import {linearWirePath,linearWireHitsNode} from '../lib/wire-style.mjs';
import {growthRoute} from '../lib/result-growth.mjs';
import {reportConnector} from '../lib/report-connector.mjs';
test('saved wire style migrates existing Circuit maps and survives normalization independently of node shape',()=>{
 assert.equal(cleanWorkspace().wireStyle,'spline');assert.equal(cleanWorkspace({circuitMode:true}).wireStyle,'straight');
 assert.equal(cleanWorkspace({circuitMode:true,wireStyle:'linear'}).wireStyle,'linear');assert.equal(cleanWorkspace({wireStyle:'invalid'}).wireStyle,'spline');
 const before=cleanWorkspace({wireStyle:'linear',dottedLines:true,wiresVisible:false,layout:'manual',draft:'unused'});assert.deepEqual(cleanWorkspace(before),before);
});
test('Linear uses angled segments and detects a blocking card before drawing a shortcut',()=>{
 const start={x:100,y:100},end={x:400,y:250},block={x:220,y:140,width:60,height:100};
 const d=linearWirePath(start,end);assert.ok(!/[CQAHV]/.test(d));assert.equal(linearWireHitsNode(start,end,[block]),true);assert.equal(linearWireHitsNode(start,end,[{x:220,y:500,width:60,height:60}]),false);
 const route=growthRoute({x:0,y:70,width:100,height:60},{x:400,y:220,width:100,height:60},[block]);assert.equal(route.hits,0);const routed=linearWirePath(route.start,route.end,{points:route.points});assert.ok(!/[CQAHV]/.test(routed));assert.notEqual(routed,d);assert.ok(routed.endsWith(`L${route.end.x} ${route.end.y}`));
});
test('Linear reader wire retains clearance waypoints instead of taking a direct diagonal across the action pill',()=>{
 const route=reportConnector({x:20,y:20,width:220,height:66},{x:800,y:30,width:350,height:500},{pill:{x:180,y:70,width:80,height:40}}),d=linearWirePath(route.start,route.end,{points:route.points});
 assert.ok(route.lane>110);assert.ok(d.includes(String(route.lane)));assert.ok(!/[CQAHV]/.test(d));assert.ok(!/NaN|Infinity/.test(d));
});
