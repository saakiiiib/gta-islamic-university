import { readFile, writeFile, readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
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
const frames = 600, started = performance.now();
for (let i = 0; i < frames; i++) { sim.update(1 / 60); sim.animate(1 / 60); }
const cpuMs = performance.now() - started;
const audio = await readdir(new URL('public/audio/', root)), clips = [];
for (const filename of audio.filter(name => name.endsWith('.wav'))) {
  const data = await readFile(new URL(`public/audio/${filename}`, root));
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Invalid WAV: ${filename}`);
  clips.push({ filename, bytes: data.length, sha256: checksum(data) });
}
const report = {
  milestone: 'Campus in motion — eight occupied vans, thirty students, damage and Bangla reactions', upgradeBaseCommit: 'ddf0896cc308cb1f1888badfdaf0638bfd13828f',
  map: { sha256: checksum(raw), bytes: raw.length, counts: map.diagnostics.counts, modelSha256: modelFingerprint(map), staticCollision: collisionFingerprint(world.collisionGroup) },
  actors: { electricVans: sim.vans.length, wheels: sim.vans.reduce((sum, v) => sum + v.model.wheels.length, 0), permanentDrivers: sim.occupants.drivers.length, pedestrians: sim.crowd.agents.length, playerVisibleWhileRiding: true },
  spawns: sim.vans.map(v => ({ id: v.id, ...v.spawn, validPavement: sim.queries.onRoad(v.spawn.x, v.spawn.z) })),
  navigation: { nodes: sim.graph.nodes.length, edges: sim.graph.edges.length, ...sim.graph.diagnostics },
  rendering: { staticWorld: stats(world.group), student: stats(sim.player.group), fleet: stats(sim.fleetGroup), pedestrians: stats(sim.crowd.group), drivers: stats(sim.occupants.group), additionalActorMeshBatches: stats(sim.fleetGroup).meshes + stats(sim.crowd.group).meshes + stats(sim.occupants.group).meshes },
  audio: { clips, gameServiceRequests: 0, deviceVoiceMayUseOSServices: true, speech: 'Bengali device voice preferred; local synthetic eSpeak NG Bengali WAV fallback; subtitles remain available muted.' },
  cpuSample: { frames, simulatedSeconds: frames / 60, totalMilliseconds: Number(cpuMs.toFixed(2)), meanMilliseconds: Number((cpuMs / frames).toFixed(3)), includes: 'Idle player physics, thirty wandering pedestrians, eight parked vans, visible occupants and all actor animation/matrix updates. Excludes WebGL rendering, camera, labels, audio and HUD. Not an FPS measurement.' },
  estimates: 'All actors are illustrative game props. Upright vehicle kinematics and constrained nonlethal knockback replace full rigid-body/ragdoll simulation. All eight vans are parked until selected by the player.',
  verificationLimits: 'Browser control is disabled in Work settings. Interactive visual/audio quality, pointer-lock behavior and actual GPU FPS/draw calls remain unverified.'
};
await writeFile(new URL('CAMPUS-MOTION-REPORT.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, audio: { ...report.audio, clips: clips.length } }, null, 2));
sim.dispose(); world.dispose();
