import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';

test('world releases every instance buffer once, including canopy, scenery and aquatic plants', () => {
  const map=buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm',import.meta.url),'utf8')),{trimToCampus:true});
  const world=buildWorld(map), counts=new Map();
  world.group.traverse(mesh=>{
    if (!mesh.isInstancedMesh) return;
    counts.set(mesh,0); mesh.addEventListener('dispose',()=>counts.set(mesh,counts.get(mesh)+1));
  });
  assert.ok(counts.size>5);
  world.dispose(); world.dispose();
  for (const [mesh,count] of counts) assert.equal(count,1,mesh.name);
});
