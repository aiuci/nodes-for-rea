import test from 'node:test';
import assert from 'node:assert/strict';
import {radialLayout} from '../lib/radial-layout.mjs';
import {reportConnector} from '../lib/report-connector.mjs';
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const absoluteSlots=layout=>layout.slots.map(p=>({...p,x:p.x+layout.x,y:p.y+layout.y}));
test('node action cards form aligned icon-and-label rows beside their owner',()=>{
 const node={x:400,y:300,width:220,height:66},anchor={x:640,y:333};
 for(const count of [2,4,8,12])for(const itemHeight of [36,44,64]){
  const layout=radialLayout(count,anchor,{width:1400,height:1100},{node,itemHeight}),slots=absoluteSlots(layout);
  assert.equal(layout.symmetric,undefined);assert.equal(layout.direction,1);assert.equal(layout.width,312);
  assert.ok(layout.x>=node.x+node.width+12);
  for(const [i,p]of slots.entries()){
   assert.equal(overlap(p,node),false);assert.equal(p.width,296);assert.equal(p.height,itemHeight);
   if(i)assert.equal(p.y-slots[i-1].y,itemHeight+8);
   assert.equal(p.x,slots[0].x);
  }
 }
});
test('cascading node tools preserve owner/reader clearance and remain bounded at edges',()=>{
  const viewport={width:1200,height:850},reader={x:800,y:90,width:390,height:740};
  for(const [x,y]of [[400,300],[15,80],[570,80],[15,740],[570,740]])for(const count of [2,3,4,6,8]){
    const node={x,y,width:180,height:50},obstacle={x:450,y:190,width:220,height:50},layout=radialLayout(count,{x:x+195,y:y+25},viewport,{node,reader,obstacles:[obstacle]}),slots=absoluteSlots(layout);
    assert.equal(slots.length,count);
    for(const [i,p]of slots.entries()){
      assert.ok(p.x>=10&&p.y>=64&&p.x+p.width<=1190&&p.y+p.height<=840);
      assert.equal(overlap(p,node),false,`owner ${x},${y}/${count}`);assert.equal(overlap(p,reader),false,`reader ${x},${y}/${count}`);
      for(const q of slots.slice(i+1))assert.equal(overlap(p,q),false);
    }
  }
  const node={x:400,y:300,width:220,height:66},obstacle={x:440,y:210,width:420,height:55},layout=radialLayout(4,{x:640,y:333},viewport,{node,obstacles:[obstacle]});
  assert.equal(layout.direction,1); // Recovered Main preference: stack at right of its owner.
});
test('small node flyouts adapt to narrow canvases and larger text without losing actions',()=>{
  for(const width of [240,320,390,600])for(const itemHeight of [36,54,72]){
    const node={x:30,y:310,width:160,height:48},layout=radialLayout(4,{x:210,y:334},{width,height:850},{node,itemHeight});
    assert.equal(layout.slots.length,4);
    for(const p of absoluteSlots(layout))assert.ok(p.x>=10&&p.x+p.width<=width-10&&p.y>=64&&p.y+p.height<=840);
  }
});
test('compact labeled action fans have no item overlap and remain in available space beside a report',()=>{
  for(const count of [3,8,12,16,20]){
    const reader={x:700,y:90,width:480,height:720},layout=radialLayout(count,{x:300,y:280},{width:1200,height:850},{reader});
    assert.ok(layout.x>=10&&layout.y>=0);assert.ok(layout.x+layout.width<=reader.x-12);assert.ok(layout.y+layout.height<=840);
    for(let i=0;i<layout.slots.length;i++)for(let j=i+1;j<layout.slots.length;j++)assert.equal(overlap(layout.slots[i],layout.slots[j]),false,`${count}: ${i}/${j}`);
    assert.equal(layout.slots.length,count);assert.ok(layout.width<=312);
  }
});
test('explanations receive their measured row height without stretching the other actions',()=>{
 const heights=[54,54,54,54,54,71,88,54],layout=radialLayout(8,{x:640,y:333},{width:1400,height:1100},{node:{x:400,y:300,width:220,height:66},itemHeight:88,itemHeights:heights});
 assert.deepEqual(layout.slots.map(p=>p.height),heights);
 for(let i=1;i<layout.slots.length;i++)assert.equal(layout.slots[i].y-(layout.slots[i-1].y+heights[i-1]),8);
 assert.equal(layout.contentHeight,heights.reduce((sum,n)=>sum+n,0)+7*8+16);
 assert.equal(layout.scroll,false);
});
test('narrow and short screens retain all readable actions with bounded scrolling when required',()=>{
  for(const viewport of [{width:390,height:844},{width:480,height:320}]){
    const layout=radialLayout(18,{x:viewport.width-4,y:viewport.height-4},viewport,{reader:{x:20,y:90,width:viewport.width-40,height:500}});
    assert.equal(layout.slots.length,18);assert.ok(layout.x>=10);assert.ok(layout.x+layout.width<=viewport.width-10);assert.ok(layout.y+layout.height<=viewport.height-10);assert.ok(layout.slots.every(p=>p.width>=120&&p.height>=36));
  }
});
test('report connection leaves the bottom and routes below the adjacent pill, updating with movement and docking',()=>{
  const node={x:80,y:160,width:220,height:66},pill={x:305,y:177,width:36,height:32},reader={x:700,y:90,width:480,height:650};
  const line=reportConnector(node,reader,{pill});assert.equal(line.start.y,226);assert.ok(line.start.x>node.x+node.width/2);assert.ok(line.lane>=pill.y+pill.height+28);assert.equal(line.end.x,reader.x);assert.ok(line.points.slice(1,-1).every(p=>p.y>=226));
  const moved=reportConnector({...node,x:180,y:260},reader,{pill:{...pill,x:405,y:277}});assert.equal(moved.start.x-line.start.x,100);assert.equal(moved.start.y-line.start.y,100);
  const bottom=reportConnector(node,{x:8,y:600,width:1150,height:220},{pill,dock:'bottom'});assert.equal(bottom.end.y,600);assert.match(bottom.d,/^M/);assert.ok(!bottom.d.includes('NaN'));
});

// The root opts in; ordinary feature/secondary/canvas menu geometry is unchanged.
test('four primary root rows stay balanced around the owner with a taller disabled action',()=>{
 const node={x:600,y:400,width:220,height:66},anchor={x:840,y:480};
 for(const heights of [[54,54,54,54],[126,54,54,54]]){
  const layout=radialLayout(4,anchor,{width:1600,height:1200},{node,itemHeights:heights,centerOnNode:true}),rows=absoluteSlots(layout),center=node.y+node.height/2;
  assert.equal(rows.filter(p=>p.y+p.height/2<center).length,2);assert.equal(rows.filter(p=>p.y+p.height/2>center).length,2);
  assert.ok(Math.abs((rows[1].y+rows[1].height/2+rows[2].y+rows[2].height/2)/2-center)<1e-8);
  assert.ok(rows.every(p=>p.height===Math.max(...heights)));assert.ok(rows.every(p=>!overlap(p,node)));
 }
 const five=radialLayout(5,anchor,{width:1600,height:1200},{node,itemHeights:[126,54,54,54,54],centerOnNode:true});assert.deepEqual(five.slots.map(p=>p.height),[126,54,54,54,54]);
});
test('centered root stack flips at the right edge and clamps or scrolls at boundaries',()=>{
 const viewport={width:1200,height:850};
 for(const [x,y]of [[20,350],[950,350],[600,70],[600,750]]){
  const node={x,y,width:180,height:50},layout=radialLayout(4,{x:x+195,y:y+45},viewport,{node,itemHeights:[86,54,54,54],centerOnNode:true});
  assert.ok(layout.x>=10&&layout.x+layout.width<=1190);assert.ok(layout.y>=64&&layout.y+layout.height<=840);
  if(y===350){const rows=absoluteSlots(layout),center=y+25;assert.equal(rows.filter(p=>p.y+p.height/2<center).length,2);assert.equal(rows.filter(p=>p.y+p.height/2>center).length,2);assert.equal(layout.direction,x>900?-1:1);}
 }
 const short=radialLayout(4,{x:190,y:150},{width:390,height:320},{node:{x:20,y:120,width:160,height:50},itemHeights:[126,54,54,54],centerOnNode:true});assert.equal(short.scroll,true);assert.equal(short.slots.length,4);assert.ok(short.y+short.height<=310);
});
