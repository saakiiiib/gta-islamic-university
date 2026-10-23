import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Box3, Vector3 } from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { createElectricVanModel } from '../src/vehicle/model.js';
import { checksum, collisionFingerprint, modelFingerprint } from '../tests/helpers/integrity.js';

const root = new URL('../', import.meta.url), raw = await readFile(new URL('public/data/map.osm', root));
const map = buildMapData(parseOsm(raw.toString())), world = buildWorld(map), sim = new CampusSimulation(map, world.collisionGroup);
const stats = group => {
  let meshes = 0, instancedBatches = 0, triangles = 0;
  group.traverse(o => {
    if (!o.isMesh) return;
    meshes++; instancedBatches += Number(!!o.isInstancedMesh);
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  return { meshes, instancedBatches, triangles };
};
const model = createElectricVanModel(), size = new Box3().setFromObject(model.group).getSize(new Vector3());
const invalidEdges = sim.graph.edges.filter(e => { const a = sim.graph.nodes[e.a], b = sim.graph.nodes[e.b]; return !sim.queries.segmentClear([a.x, a.z], [b.x, b.z], .28); }).length;
const start = performance.now();
for (let i = 0; i < 600; i++) { sim.update(1 / 60); sim.animate(1 / 60); }
const cpuMs = performance.now() - start;
const report = {
  milestone: 'Phase 2 — electric cargo van, pedestrians and motion', upgradeBaseCommit: '24e0c8e4bd1d1b59baece745ef358825ed2eb313',
  map: { sha256: checksum(raw), bytes: raw.length, counts: map.diagnostics.counts, modelSha256: modelFingerprint(map), staticCollision: collisionFingerprint(world.collisionGroup) },
  actors: { electricVans: 1, wheels: 3, pedestrians: sim.crowd.agents.length },
  van: { spawn: sim.van.spawn, localModelMetres: { width: size.x, height: size.y, length: size.z }, configuration: sim.van.config, rendering: stats(model.group) },
  navigation: { nodes: sim.graph.nodes.length, edges: sim.graph.edges.length, ...sim.graph.diagnostics, invalidEdges },
  rendering: { staticWorld: stats(world.group), student: stats(sim.player.group), pedestrians: stats(sim.crowd.group), additionalActorMeshBatches: stats(model.group).meshes + stats(sim.crowd.group).meshes },
  cpuSample: { frames: 600, simulatedSeconds: 10, totalMilliseconds: Number(cpuMs.toFixed(2)), meanMilliseconds: Number((cpuMs / 600).toFixed(3)), includes: 'Idle player physics, twelve wandering pedestrians, parked van and all actor animation/matrix updates. Excludes WebGL rendering, camera, labels and HUD. Not an FPS measurement.' },
  estimates: 'The reference-inspired original van, students and their placement are game actors, not surveyed OSM objects. Vehicle dynamics are upright semi-arcade kinematics, not a full rigid-body simulation.',
  verificationLimits: 'Browser automation is disabled in Work settings. Interactive visual/mouse checks, actual FPS and WebGL draw-call measurements remain unverified.'
};
await writeFile(new URL('PHASE2-REPORT.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
model.dispose(); sim.dispose(); world.dispose();
