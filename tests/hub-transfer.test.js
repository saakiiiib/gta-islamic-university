import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, PerspectiveCamera } from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { TravelCamera } from '../src/vehicle/camera.js';
import { CampusVisibility } from '../src/activity/visibility.js';
import { buildCrowdRouting } from '../src/npc/routing.js';

test('crowd-only hairpin shortcuts preserve source graph and remain inside accepted walking corridors', () => {
  const points = [[0,0],[4.2,0],[-2.6,.2]];
  const nodes = points.map(([x,z],id)=>({id,x,z,height:0,neighbors:[]}));
  const edges = [[0,1],[1,2]].map(([a,b])=>({a,b,length:Math.hypot(nodes[a].x-nodes[b].x,nodes[a].z-nodes[b].z),walkingKind:'roadside',width:1.6}));
  for(const edge of edges){nodes[edge.a].neighbors.push({...edge,to:edge.b});nodes[edge.b].neighbors.push({...edge,to:edge.a});}
  const source={nodes,edges,segmentWalkable:()=>true,diagnostics:{}}, before=JSON.stringify(source);
  const routing=buildCrowdRouting(source);
  assert.equal(JSON.stringify(source),before);assert.ok(routing.nodes[0].neighbors.some(e=>e.to===2));
  assert.equal(buildCrowdRouting({...source,segmentWalkable:()=>false}).edges.length,2);
});

test('the same thirty identities populate Gate, Library and Applied Science without junction deadlock or visible relocation', () => {
  const map=buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm',import.meta.url),'utf8'))),world=buildWorld(map);
  const sim=new CampusSimulation(map,world.collisionGroup,{renderCrowd:false,scenery:world.scenery});
  const colliders=new Group();colliders.add(world.collisionGroup,world.scenery.collisionGroup);
  const camera=new PerspectiveCamera(60,1365/768,.08,2200),chase=new TravelCamera(camera,colliders);
  const visibility=new CampusVisibility([sim.player.world,sim.player.sceneryWorld]);
  const identities=[...sim.crowd.agents];
  try {
    for(const [name,pose,seconds] of [
      ['Gate',map.spawn,20],['Library',{x:-25.2878,z:-176.0204,yaw:.05},20],
      ['Applied',{x:37.8957,z:-100.1934,yaw:Math.PI/2},90],
    ]){
      sim.player.teleport({...pose,y:0},pose.yaw);sim.player.update(1/60);chase.reset(pose);
      visibility.prepare(camera);
      let maxVisible=0;
      for(let step=0;step<seconds*60;step++){
        sim.crowd.setView({position:sim.player.position,camera,visible:visibility.visible});sim.update(1/60,{},chase.yaw);
        if(step%60===59){const stats=visibility.sample(.2,sim,sim.player.position);maxVisible=Math.max(maxVisible,stats.npcVisible);}
      }
      const stats=visibility.sample(.2,sim,sim.player.position);
      console.log(`${name}: nearby=${stats.npcNearby} visible=${stats.npcVisible} peak=${maxVisible} moving=${stats.vanMoving}`);
      assert.ok(maxVisible>=10,`${name} should have ten observable students, got ${maxVisible}`);
      assert.ok(stats.npcNearby>=10,`${name} should retain a nearby activity population`);
      assert.deepEqual(sim.crowd.agents,identities);
      for(const a of sim.crowd.agents){assert.ok(sim.graph.isWalkable(a.position.x,a.position.z));for(const b of sim.crowd.agents)if(a!==b)assert.ok(a.position.distanceTo(b.position)>=.52-1e-6);}
    }
  } finally {sim.dispose();world.dispose();}
});
