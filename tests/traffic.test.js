import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapData, parseOsm, bufferPaths, pointToSegmentDistance } from '../src/map/index.js';
import { CampusQueries, rectangleFootprint } from '../src/navigation/campusQueries.js';
import { createVanFleet, findPickupCandidates } from '../src/vehicle/fleet.js';
import { DriverContinuation } from '../src/vehicle/driver.js';
import { vansOverlap } from '../src/vehicle/contacts.js';
import { buildVehicleGraph, buildVehicleRoutes, closestRoutePosition, getVehicleNetwork, routeSample, sweptRouteClear } from '../src/vehicle/routes.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map);
function campus() {
  const fleet = createVanFleet(map, queries), driver = new DriverContinuation(map, queries, fleet.vans);
  return { ...fleet, driver, dispose() { driver.dispose(); fleet.vans.forEach(v => v.dispose()); } };
}
const advance = (driver, seconds, options = {}, callback = () => {}) => {
  for (let i = 0; i < seconds * 60; i++) { driver.update(1 / 60, options); callback(i); }
};

test('vehicle graph joins only actual source vertices, not adjacent roads across gaps', () => {
  const bounds = { minX: -50, maxX: 150, minZ: -50, maxZ: 150 };
  const roads = [[[0, 0], [0, 40]], [[.3, 40], [.3, 80]], [[0, 40], [30, 40]]].map((path, id) => ({ id: String(id), kind: 'service', width: 8, paths: [path], polygons: bufferPaths([path], 8, bounds) }));
  const graph = buildVehicleGraph({ roads });
  assert.equal(graph.nodes.length, 5);
  assert.equal(graph.nodes.find(n => n.point[0] === 0 && n.point[1] === 40).edges.length, 2);
  assert.equal(graph.nodes.find(n => n.point[0] === .3 && n.point[1] === 40).edges.length, 1);
  assert.equal(buildVehicleRoutes({ roads, bounds }, new CampusQueries({ roads, bounds })).routes.length, 0);
});

test('campus service circuits are closed source cycles with preflighted full van footprints', () => {
  const { graph, routes } = getVehicleNetwork(map, queries);
  assert.ok(routes.length >= 3);
  const gate = routes.find(r => closestRoutePosition(r, map.spawn).distance < 6);
  assert.ok(gate, 'valid slow circuit follows the tight Main Gate bends');
  for (const route of routes) {
    assert.ok(route.closed && route.length > 40 && route.radius >= 4.5);
    assert.ok(sweptRouteClear(route, queries));
    assert.equal(route.sourceNodes[0], route.sourceNodes.at(-1));
    for (let i = 1; i < route.sourceNodes.length; i++) {
      const a = route.sourceNodes[i - 1], b = route.sourceNodes[i];
      assert.ok(graph.nodes[a].edges.some(id => { const edge = graph.edges[id]; return edge.a === b || edge.b === b; }));
    }
  }
});

test('eight original vans start as three services and five clear curbside pickups near named hubs', () => {
  const s = campus(), originals = [...s.vans];
  assert.equal(s.vans.length, 8); assert.equal(s.vans[0].role, 'pickup');
  assert.equal(s.vans.filter(v => v.role === 'service').length, 3);
  assert.equal(s.vans.filter(v => v.role === 'pickup').length, 5);
  assert.equal(s.driver.startServices(), 3);
  for (const a of s.vans) {
    assert.ok(queries.rectangleClear(a.position, a.yaw, a.config));
    assert.ok(rectangleFootprint(a.position, a.yaw, a.config).every(([x, z]) => queries.onRoad(x, z)));
    for (const b of s.vans) if (a !== b) assert.equal(vansOverlap(a.position, a.yaw, a.config, b), false);
  }
  advance(s.driver, 20);
  assert.deepEqual(s.vans, originals); assert.equal(s.driver.diagnostics.moving, 3);
  assert.ok(s.vans.filter(v => v.role === 'service').every(v => s.driver.active.get(v).travelled > 16));
  assert.ok(s.vans.filter(v => v.role === 'service').some(v => v.position.distanceTo({ ...map.spawn, y: 0 }) < 85));
  s.dispose();
});

test('curbside pickups leave mapped walking paths and the central through lane clear', () => {
  const s = campus(), candidates = findPickupCandidates(map, queries);
  assert.ok(candidates.length > 20);
  const paths = map.roads.filter(r => /^(path|footway|pedestrian|cycleway)$/.test(r.kind));
  for (const van of s.vans.filter(v => v.role === 'pickup')) {
    for (const path of paths) for (const line of path.paths) for (let i = 1; i < line.length; i++) {
      assert.ok(pointToSegmentDistance([van.position.x, van.position.z], line[i - 1], line[i]) >= (path.width ?? 2.2) / 2 + 1.69);
    }
    const road = map.roads.find(r => r.id === van.spawn.roadId);
    assert.ok(road);
    const centerDistance = Math.min(...road.paths.flatMap(line => line.slice(1).map((b, i) => pointToSegmentDistance([van.position.x, van.position.z], line[i], b))));
    assert.ok(centerDistance >= 1.9, `pickup ${van.id} leaves the centre lane clear`);
  }
  s.dispose();
});

test('service driver yields without parking, then resumes when a pedestrian leaves', () => {
  const s = campus(); s.driver.startServices();
  const van = s.vans.find(v => v.role === 'service'), before = van.position.clone();
  const person = { position: { x: before.x - Math.sin(van.yaw) * 5, y: 0, z: before.z - Math.cos(van.yaw) * 5 }, config: { radius: .28 } };
  let contacts = 0;
  advance(s.driver, 4, { pedestrians: [person], onImpact: () => contacts++ });
  assert.equal(van.speed, 0); assert.ok(s.driver.isActive(van));
  assert.equal(s.driver.active.get(van).status, 'yielding'); assert.equal(contacts, 0);
  const stopped = van.position.clone();
  advance(s.driver, 10);
  assert.ok(van.position.distanceTo(stopped) > 8); assert.ok(van.speed > .1);
  s.dispose();
});

test('following services stop behind a blocking van without overlap and continue after it moves', () => {
  const s = campus(); s.driver.startServices();
  const follower = s.vans[1], blocker = s.vans[2], route = s.driver.active.get(follower).circuit;
  const a = routeSample(route, 36), b = routeSample(route, 43);
  follower.reset({ x: a.point[0], z: a.point[1], yaw: a.yaw });
  blocker.reset({ x: b.point[0], z: b.point[1], yaw: b.yaw });
  s.driver.active.clear(); s.driver.depart(follower);
  advance(s.driver, 6, {}, () => assert.equal(vansOverlap(follower.position, follower.yaw, follower.config, blocker), false));
  assert.equal(follower.speed, 0); assert.ok(s.driver.isActive(follower));
  s.driver.depart(blocker); const before = follower.position.clone();
  advance(s.driver, 12, {}, () => assert.equal(vansOverlap(follower.position, follower.yaw, follower.config, blocker), false));
  assert.ok(follower.position.distanceTo(before) > 5);
  s.dispose();
});

test('departed pickup keeps momentum, pulls into a real clear roadside stop and parks without teleporting', () => {
  const s = campus(), van = s.vans[0]; s.driver.startServices(); van.speed = 2.5;
  const before = van.position.clone(); assert.ok(s.driver.depart(van));
  s.driver.update(1 / 60); assert.ok(van.position.distanceTo(before) > .02 && van.position.distanceTo(before) < .08);
  let previous = van.position.clone(), contacts = 0;
  advance(s.driver, 40, { onImpact: () => contacts++ }, () => {
    assert.ok(van.position.distanceTo(previous) < .14, 'ordinary continuous controller motion'); previous.copy(van.position);
    assert.ok(queries.rectangleClear(van.position, van.yaw, van.config));
  });
  assert.ok(van.position.distanceTo(before) > 15); assert.equal(van.speed, 0); assert.equal(van.autonomous, false);
  assert.equal(s.driver.isActive(van), false); assert.equal(contacts, 0);
  assert.ok(findPickupCandidates(map, queries).some(p => Math.hypot(p.x - van.position.x, p.z - van.position.z) < .6));
  s.dispose();
});

test('service reset restores the same eight vans and exactly three active services', () => {
  const s = campus(), originals = [...s.vans]; s.driver.startServices(); advance(s.driver, 5);
  s.driver.reset(); s.vans.forEach(v => v.reset());
  assert.equal(s.driver.startServices(), 3); assert.equal(s.driver.startServices(), 3);
  assert.equal(s.driver.active.size, 3); assert.deepEqual(s.vans, originals);
  assert.ok(s.vans.every(v => v.position.x === v.spawn.x && v.position.z === v.spawn.z && v.durability === 100));
  s.vans[1].durability = 0; advance(s.driver, .1);
  assert.equal(s.vans[1].autonomous, false); assert.equal(s.vans[1].speed, 0);
  s.dispose();
});

test('a blocked service can retry an aligned connected circuit without teleporting or repairing', () => {
  const s = campus(), van = s.vans[3], { routes } = s.driver.network;
  let fixture = null;
  for (const circuit of routes) {
    for (let distance = 10; distance < circuit.length; distance += 12) {
      const sample = routeSample(circuit, distance), position = { x: sample.point[0], z: sample.point[1] };
      const alternative = routes.find(other => {
        if (other === circuit) return false;
        const near = closestRoutePosition(other, position), otherYaw = routeSample(other, near.s).yaw;
        return near.distance < .1 && Math.abs(Math.atan2(Math.sin(otherYaw - sample.yaw), Math.cos(otherYaw - sample.yaw))) < .1;
      });
      if (alternative) { fixture = { circuit, sample }; break; }
    }
    if (fixture) break;
  }
  assert.ok(fixture, 'source circuits share connected, aligned approaches');
  van.position.set(...[fixture.sample.point[0], 0, fixture.sample.point[1]]); van.yaw = fixture.sample.yaw; van.speed = 0; van.durability = 71;
  const state = { circuit: fixture.circuit, index: fixture.sample.index, progress: fixture.sample.s, travelled: 0, blockedTime: 10, retryAt: 8, service: true };
  const before = [van.position.toArray(), van.yaw, van.speed, van.durability];
  assert.equal(s.driver.retryRoute(van, state), true);
  assert.notEqual(state.circuit, fixture.circuit);
  assert.deepEqual([van.position.toArray(), van.yaw, van.speed, van.durability], before);
  assert.ok(closestRoutePosition(state.circuit, van.position).distance < 1.2);
  s.dispose();
});

test('five-minute source-circuit soak clears the standing Main Gate student without contacts or overlap', () => {
  const s = campus(); s.driver.startServices();
  let contacts = 0, checks = 0;
  const player = { position: { ...map.spawn, y: 0 }, config: { radius: .32 } };
  advance(s.driver, 300, { player, onImpact: () => contacts++ }, i => {
    if (i % 30) return;
    checks++;
    for (const a of s.vans.filter(v => v.role === 'service')) {
      assert.ok(queries.rectangleClear(a.position, a.yaw, a.config));
      assert.ok(rectangleFootprint(a.position, a.yaw, a.config).every(([x, z]) => queries.onRoad(x, z)));
      for (const b of s.vans) if (a !== b) assert.equal(vansOverlap(a.position, a.yaw, a.config, b), false);
    }
  });
  assert.equal(checks, 600); assert.equal(contacts, 0); assert.equal(s.driver.diagnostics.moving, 3);
  assert.ok(s.driver.diagnostics.travelled > 1500); assert.ok(s.driver.diagnostics.laps >= 4);
  assert.ok(s.vans.every(v => v.durability === 100)); s.dispose();
});
