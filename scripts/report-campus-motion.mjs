import { readFile, writeFile } from 'node:fs/promises';
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
const manifest = JSON.parse(await readFile(new URL('public/audio/reactions.json', root), 'utf8')), clips = [];
for (const [id, clip] of Object.entries(manifest.clips)) {
  const filename = clip.file;
  if (!/^npc\/[a-z0-9_-]+\.mp3$/i.test(filename)) throw new Error('Invalid local recording path');
  const data = await readFile(new URL(`public/audio/${filename}`, root));
  if (data.toString('ascii', 0, 3) !== 'ID3' && !(data[0] === 0xff && (data[1] & 0xe0) === 0xe0)) throw new Error(`Invalid MP3: ${filename}`);
  clips.push({ id, filename, bytes: data.length, sha256: checksum(data) });
}
const report = {
  milestone: 'Recorded NPC voices, footpath/roadside walking and moving passenger exits', upgradeBaseCommit: 'dca1412ecf10439f64cbfe2b99618500d0a014a7',
  map: { sha256: checksum(raw), bytes: raw.length, counts: map.diagnostics.counts, modelSha256: modelFingerprint(map), staticCollision: collisionFingerprint(world.collisionGroup) },
  actors: { electricVans: sim.vans.length, wheels: sim.vans.reduce((sum, v) => sum + v.model.wheels.length, 0), permanentDrivers: sim.occupants.drivers.length, pedestrians: sim.crowd.agents.length, playerVisibleWhileRiding: true },
  spawns: sim.vans.map(v => ({ id: v.id, ...v.spawn, validPavement: sim.queries.onRoad(v.spawn.x, v.spawn.z) })),
  navigation: { nodes: sim.graph.nodes.length, edges: sim.graph.edges.length, ...sim.graph.diagnostics,
    routeMetres: Object.fromEntries(['footpath','roadside','crossing'].map(kind => [kind, Number(sim.graph.edges.filter(e => e.walkingKind === kind).reduce((sum,e) => sum + e.length,0).toFixed(2))])) },
  rendering: { staticWorld: stats(world.group), student: stats(sim.player.group), fleet: stats(sim.fleetGroup), pedestrians: stats(sim.crowd.group), drivers: stats(sim.occupants.group), additionalActorMeshBatches: stats(sim.fleetGroup).meshes + stats(sim.crowd.group).meshes + stats(sim.occupants.group).meshes },
  audio: { clips, categories: manifest.categories, remoteServiceRequests: 0, synthesis: false, dialogueSubtitles: false, spatial: 'HRTF panner follows NPC position; listener follows camera heading; collision clips can replace preceding near misses without overlap.' },
  cpuSample: { frames, simulatedSeconds: frames / 60, totalMilliseconds: Number(cpuMs.toFixed(2)), meanMilliseconds: Number((cpuMs / frames).toFixed(3)), includes: 'Idle player physics, thirty wandering pedestrians, eight parked vans, visible occupants and all actor animation/matrix updates. Excludes WebGL rendering, camera, labels, audio and HUD. Not an FPS measurement.' },
  exits: { launch: 'Actual visible passenger root, inherited planar van momentum plus outward/upward impulse; no safe-point teleport.', injury: 'Speed-scaled nonlethal landing/wall impact injury, stumble/fall/recovery.', driver: 'Visible driver continues on connected mapped vehicle roads; brakes or parks at obstructions or dead ends.' },
  estimates: 'Roadside walking corridors are unrendered navigation estimates, not surveyed sidewalks. All map geometry stays unchanged. Vehicle continuation and dismounts use bounded kinematics/capsule collision rather than a full rigid-body/ragdoll engine.',
  verificationLimits: 'Browser smoke checks cover loading, visible student/driver, recorded-voice readiness, inspection and error logs. Automated tests cover detailed dismount/collision behavior. Actual audible recording clarity and full gameplay visual review remain limited.'
};
await writeFile(new URL('CAMPUS-MOTION-REPORT.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, audio: { ...report.audio, clips: clips.length } }, null, 2));
sim.dispose(); world.dispose();
