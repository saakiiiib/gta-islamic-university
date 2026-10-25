/** Reproducible CPU-side campus soak. GPU/audio/touch checks belong to browser QA. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Group, PerspectiveCamera } from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { TravelCamera } from '../src/vehicle/camera.js';
import { CampusVisibility } from '../src/activity/visibility.js';
import { vansOverlap } from '../src/vehicle/contacts.js';
import { rectangleFootprint } from '../src/navigation/campusQueries.js';
import { checksum, collisionFingerprint, modelFingerprint } from '../tests/helpers/integrity.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
const duration = Number(option('seconds', '300'));
if (!Number.isFinite(duration) || duration < 1 || duration > 3600) throw new Error('--seconds must be between 1 and 3600.');
const selected = option('locations', 'gate,library,applied').split(',');
const output = resolve(root, option('out', 'validation/phase3/soak.json'));
const raw = readFileSync(resolve(root, 'public/data/map.osm'));
const baseline = JSON.parse(readFileSync(resolve(root, 'tests/phase1-baseline.json')));
const map = buildMapData(parseOsm(raw.toString()));
const evidence = { generatedAt: new Date().toISOString(), simulatedSecondsPerLocation: duration,
  viewport: { width: 1280, height: 720, fov: 60, near: .08, far: 2200 },
  method: 'Fixed 60Hz CampusSimulation with 30 actual NPCs, eight vans, complete solid scenery, original spawn/map and actual TravelCamera plus CampusVisibility. Player remains stationary at each test view; no map or actor resets during a scenario. Geometry/peer clearance is sampled once per second. Camera obstruction is recomputed when its stationary target changes; this yields the same static chase pose without repeating identical raycasts.',
  limits: ['CPU-side simulation, not rendered GPU FPS', 'Audio playback and multitouch require separate browser QA'],
  initialIntegrity: {}, finalIntegrity: {}, scenarios: [], failures: [], passed: false };
function fail(code, details) { evidence.failures.push({ code, ...details }); }
let world;
const started = performance.now();
try {
  world = buildWorld(map);
  const integrity = () => ({ rawMapSha256: checksum(readFileSync(resolve(root, 'public/data/map.osm'))),
    modelSha256: modelFingerprint(map), counts: map.diagnostics.counts, collision: collisionFingerprint(world.collisionGroup) });
  evidence.initialIntegrity = integrity();
  const checkIntegrity = (value, phase) => {
    if (value.rawMapSha256 !== baseline.rawMapSha256) fail('raw-map-changed', { phase, actual: value.rawMapSha256 });
    if (value.modelSha256 !== baseline.modelSha256) fail('mapped-features-changed', { phase, actual: value.modelSha256 });
    if (!isDeepStrictEqual(value.counts, baseline.counts)) fail('map-counts-changed', { phase, actual: value.counts });
    if (!isDeepStrictEqual(value.collision, baseline.collision)) fail('canonical-map-collision-changed', { phase, actual: value.collision });
  };
  checkIntegrity(evidence.initialIntegrity, 'before');
  const locations = { gate: { name: 'Main Gate', ...map.spawn },
    library: { name: 'Central Library', x: -25.2878, y: 0, z: -176.0204, yaw: .05 },
    applied: { name: 'Faculty of Applied Science and Technology', x: 37.8957, y: 0, z: -100.1934, yaw: Math.PI / 2 } };
  for (const id of selected) {
    if (!locations[id]) { fail('unknown-location', { id }); continue; }
    const location = locations[id], scenarioStart = performance.now();
    const scenario = { id, location, samples: [], violations: {}, contacts: { pedestrian: 0, vehicle: 0, static: 0 },
      reactions: {}, summary: null, passed: false };
    evidence.scenarios.push(scenario);
    let sim;
    const violation = (code, second, details = {}) => {
      const entry = scenario.violations[code] ??= { count: 0, firstSecond: second, lastSecond: second, firstDetails: details };
      entry.count++; entry.lastSecond = second;
    };
    try {
      sim = new CampusSimulation(map, world.collisionGroup, { renderCrowd: false, scenery: world.scenery });
      const originals = [...sim.vans], originalHandle = sim.impacts.handle.bind(sim.impacts);
      sim.impacts.handle = event => { scenario.contacts[event.type] = (scenario.contacts[event.type] ?? 0) + 1; return originalHandle(event); };
      sim.player.teleport(location, location.yaw);
      const colliders = new Group(); colliders.add(world.collisionGroup);
      if (world.scenery?.collisionGroup) colliders.add(world.scenery.collisionGroup);
      const camera = new PerspectiveCamera(60, 1280 / 720, .08, 2200), chase = new TravelCamera(camera, colliders);
      chase.reset(location);
      const visibility = new CampusVisibility([sim.player.world, sim.player.sceneryWorld]);
      const previousCameraTarget = sim.player.position.clone(), walkingIds = new Set();
      let previousAgents = sim.crowd.agents.map(a => a.position.clone());
      let minPeerGap = Infinity, minHealth = 100, minDurability = 100, minPlayerVanClearance = Infinity;
      function sample(second) {
        visibility.prepare(camera); const counts = visibility.sample(.2, sim, sim.entity.position);
        let walking = 0, peerGap = Infinity;
        for (let a = 0; a < sim.crowd.agents.length; a++) {
          const npc = sim.crowd.agents[a], p = npc.position;
          minHealth = Math.min(minHealth, npc.health);
          if (!sim.queries.discClear(p.x, p.z, .28)) violation('npc-inside-world-obstacle', second, { npcId: npc.id, position: p.toArray() });
          if (!sim.graph.isWalkable(p.x, p.z, .28)) violation('npc-off-walking-network', second, { npcId: npc.id, position: p.toArray() });
          if (second > 0 && p.distanceTo(previousAgents[a]) > .1 && npc.speed > .1) { walking++; walkingIds.add(npc.id); }
          for (let b = a + 1; b < sim.crowd.agents.length; b++) peerGap = Math.min(peerGap, p.distanceTo(sim.crowd.agents[b].position));
        }
        previousAgents = sim.crowd.agents.map(a => a.position.clone());
        minPeerGap = Math.min(minPeerGap, peerGap);
        if (peerGap < .515) violation('npc-peer-overlap', second, { peerGap });
        for (let a = 0; a < sim.vans.length; a++) {
          const van = sim.vans[a]; minDurability = Math.min(minDurability, van.durability);
          minPlayerVanClearance = Math.min(minPlayerVanClearance, van.distanceFrom(sim.player.position.x, sim.player.position.z));
          if (van !== originals[a]) violation('van-identity-replaced', second, { index: a });
          if (!sim.queries.rectangleClear(van.position, van.yaw, van.config)) violation('van-inside-world-obstacle', second, { vanId: van.id });
          if (!rectangleFootprint(van.position, van.yaw, van.config).every(([x, z]) => sim.queries.onRoad(x, z))) violation('van-left-pavement', second, { vanId: van.id });
          for (let b = a + 1; b < sim.vans.length; b++) if (vansOverlap(van.position, van.yaw, van.config, sim.vans[b])) violation('van-overlap', second, { a: van.id, b: sim.vans[b].id });
        }
        const driver = sim.driverController.diagnostics;
        const movingVisible = sim.vans.filter(v => Math.abs(v.speed) > .15 && (visibility.isVisible(v.position, 1.4) || visibility.isVisible(v.position, .7))).length;
        scenario.samples.push({ second, ...counts, movingVisible, walking, peerGap, ...driver,
          activeHub: sim.crowd.stats.primaryHub,
          services: sim.vans.filter(v => v.role === 'service').map(v => {
            const state = sim.driverController.active.get(v);
            return { id: v.id, x: v.position.x, z: v.position.z, speed: v.speed, durability: v.durability,
              active: !!state, status: state?.status ?? 'parked', reason: state?.reason ?? null,
              travelled: state?.travelled ?? 0, blockedSeconds: state?.blockedTime ?? 0 };
          }) });
      }
      sample(0);
      console.log(`[${id}] starting ${duration}s at ${location.name}; props=${world.scenery?.obstacles?.length ?? 0}`);
      const steps = Math.round(duration * 60);
      for (let tick = 0; tick < steps; tick++) {
        if (previousCameraTarget.distanceToSquared(sim.player.position) > 1e-10) {
          chase.updateTravel(1 / 60, sim.entity); previousCameraTarget.copy(sim.player.position);
        }
        visibility.prepare(camera);
        sim.crowd.setView({ position: sim.entity.position, camera, visible: visibility.visible });
        sim.update(1 / 60, {}, chase.yaw);
        visibility.sample(1 / 60, sim, sim.entity.position);
        for (const event of sim.drainEvents()) scenario.reactions[event.type] = (scenario.reactions[event.type] ?? 0) + 1;
        if ((tick + 1) % 60 === 0 || tick === steps - 1) {
          const second = (tick + 1) / 60; sample(second);
          if (second % 60 === 0) console.log(`[${id}] ${second}s: moving=${sim.driverController.diagnostics.moving}, visibleNPC=${scenario.samples.at(-1).npcVisible}, contacts=${Object.values(scenario.contacts).reduce((sum, n) => sum + n, 0)}`);
        }
      }
      const final = scenario.samples.at(-1), first20 = scenario.samples.filter(s => s.second <= Math.min(20, duration));
      const tail = scenario.samples.filter(s => s.second > Math.max(0, duration - 10));
      scenario.summary = { wallSeconds: (performance.now() - scenarioStart) / 1000,
        final: { active: final.active, moving: final.moving, parked: final.parked, npcNearby: final.npcNearby, npcVisible: final.npcVisible },
        first20: { visibleNPCMin: Math.min(...first20.map(s => s.npcVisible)), visibleNPCMax: Math.max(...first20.map(s => s.npcVisible)),
          firstSecondWith10Visible: first20.find(s => s.npcVisible >= 10)?.second ?? null,
          movingVanVisible: first20.some(s => s.movingVisible > 0) },
        last10MeanMoving: tail.reduce((sum, s) => sum + s.moving, 0) / Math.max(1, tail.length),
        walkingAgentCount: walkingIds.size, minPeerGap, minHealth, minDurability, minPlayerVanClearance,
        activeServices: [...sim.driverController.active].filter(([v]) => v.role === 'service').length,
        travelled: final.travelled, laps: final.laps };
      if (sim.vans.length !== 8 || sim.crowd.agents.length !== 30) violation('wrong-actor-count', duration);
      if (final.active !== 3 || final.moving !== 3 || final.parked !== 5) violation('traffic-not-live-at-end', duration, scenario.summary.final);
      if (Object.values(scenario.contacts).some(n => n > 0)) violation('contact-occurred', duration, scenario.contacts);
      if (minHealth < 99.99 || minDurability < 99.99) violation('unprovoked-damage', duration, { minHealth, minDurability });
      if (minPlayerVanClearance < sim.player.config.radius - .02) violation('standing-player-van-overlap', duration, { minPlayerVanClearance });
      if (duration >= 20 && scenario.summary.first20.visibleNPCMax < 10) violation('busy-view-misses-10-visible-NPCs', 20, scenario.summary.first20);
      if (id === 'gate' && duration >= 20 && !scenario.summary.first20.movingVanVisible) violation('no-visible-startup-traffic', 20);
      scenario.passed = Object.keys(scenario.violations).length === 0;
      if (!scenario.passed) fail('scenario-failed', { id, violations: Object.keys(scenario.violations) });
      console.log(`[${id}] ${scenario.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(scenario.summary)}`);
    } catch (error) {
      scenario.error = error.stack ?? String(error); fail('scenario-error', { id, message: error.message });
      console.error(`[${id}] ERROR ${error.message}`);
    } finally { sim?.dispose(); }
  }
  evidence.finalIntegrity = integrity(); checkIntegrity(evidence.finalIntegrity, 'after');
} catch (error) {
  fail('setup-error', { message: error.message, stack: error.stack });
} finally {
  world?.dispose(); evidence.wallSeconds = (performance.now() - started) / 1000;
  evidence.passed = evidence.failures.length === 0 && evidence.scenarios.length === selected.length && evidence.scenarios.every(s => s.passed);
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`Evidence: ${output}`); console.log(`Overall: ${evidence.passed ? 'PASS' : 'FAIL'}`);
  if (!evidence.passed) process.exitCode = 1;
}
