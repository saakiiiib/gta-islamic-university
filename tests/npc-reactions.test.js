import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMapData, parseOsm, pointToSegmentDistance, bufferPaths } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { PedestrianSystem, applyImpact } from '../src/npc/pedestrians.js';
import { createVanFleet } from '../src/vehicle/fleet.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map), graph = buildPedestrianGraph(map, queries);
const create = options => new PedestrianSystem(map, queries, graph, { render: false, ...options });
const updateFor = (crowd, seconds, vans) => { for (let i = 0; i < Math.round(seconds * 60); i++) crowd.update(1 / 60, vans); };
const pairSpacing = agents => Math.min(...agents.flatMap((a, i) => agents.slice(i + 1).map(b => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z))));

test('thirty students stay on safe OSM routes and preserve personal space', () => {
  const crowd = create();
  assert.equal(crowd.agents.length, 30);
  assert.ok(crowd.agents.every(agent => agent.health === 100));
  for (let tick = 0; tick < 900; tick++) {
    crowd.update(1 / 60);
    if (tick % 30) continue;
    assert.ok(pairSpacing(crowd.agents) >= .52 - 1e-6);
    for (const agent of crowd.agents) {
      assert.ok(queries.discClear(agent.position.x, agent.position.z, .28));
      assert.ok(queries.onRoad(agent.position.x, agent.position.z));
      const a = graph.nodes[agent.current], b = graph.nodes[agent.target];
      assert.ok(Math.hypot(agent.offset.x, agent.offset.z) <= .8);
      assert.ok(pointToSegmentDistance([agent.position.x, agent.position.z], [a.x, a.z], [b.x, b.z]) <= .8);
    }
  }
  crowd.dispose();
});

test('opposing students pass on the right without overlap or leaving a narrow mapped path', () => {
  const path = [[-32, 0], [32, 0]];
  const localMap = { bounds: { minX: -40, maxX: 40, minZ: -10, maxZ: 10 }, spawn: { x: -80, z: 0, yaw: 0 },
    roads: [{ id: 'walk', kind: 'path', width: 2.4, paths: [path], polygons: bufferPaths([path], 2.4) }] };
  const localQueries = new CampusQueries(localMap), localGraph = buildPedestrianGraph(localMap, localQueries);
  const crowd = new PedestrianSystem(localMap, localQueries, localGraph, { count: 2, render: false });
  const edge = localGraph.edges.find(e => Math.abs(localGraph.nodes[e.a].x) < 1 && Math.abs(localGraph.nodes[e.b].x) < 9);
  assert.ok(edge);
  const [left, right] = localGraph.nodes[edge.a].x < localGraph.nodes[edge.b].x ? [edge.a, edge.b] : [edge.b, edge.a];
  const a = crowd.agents[0], b = crowd.agents[1];
  for (const [agent, from, to, progress] of [[a, left, right, .35], [b, right, left, .35]]) {
    agent.current = from; agent.target = to; agent.previous = -1; agent.progress = progress;
    agent.edge = localGraph.nodes[from].neighbors.find(n => n.to === to);
    agent.position.set(localGraph.nodes[from].x + (localGraph.nodes[to].x - localGraph.nodes[from].x) * progress, 0, 0);
    agent.idleTime = 0;
  }
  let passed = false, sidestepped = false, maxAvoidSpeed = 0;
  for (let i = 0; i < 360; i++) {
    crowd.update(1 / 60);
    maxAvoidSpeed = Math.max(maxAvoidSpeed, a.avoidSpeed, b.avoidSpeed);
    const gap = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
    assert.ok(gap >= .52 - 1e-6);
    for (const agent of [a, b]) {
      assert.ok(localQueries.discClear(agent.position.x, agent.position.z, .28));
      assert.ok(localQueries.onRoad(agent.position.x, agent.position.z));
      assert.ok(Math.hypot(agent.offset.x, agent.offset.z) <= .8);
    }
    sidestepped ||= Math.abs(a.position.z) > .05 || Math.abs(b.position.z) > .05;
    passed ||= a.position.x > b.position.x + .5;
  }
  assert.ok(sidestepped);
  assert.ok(passed);
  assert.ok(maxAvoidSpeed > 0 && maxAvoidSpeed <= 1.2 + 1e-6);
  crowd.dispose();
});

test('a centerline parked van makes a blocked walker turn back safely', () => {
  const path = [[-32, 0], [32, 0]];
  const localMap = { bounds: { minX: -40, maxX: 40, minZ: -10, maxZ: 10 }, spawn: { x: -80, z: 0, yaw: 0 },
    roads: [{ id: 'walk', kind: 'path', width: 2.4, paths: [path], polygons: bufferPaths([path], 2.4) }] };
  const q = new CampusQueries(localMap), g = buildPedestrianGraph(localMap, q);
  const crowd = new PedestrianSystem(localMap, q, g, { count: 1, render: false });
  const edge = g.edges.find(e => [g.nodes[e.a].x, g.nodes[e.b].x].sort((a, b) => a - b).join(',') === '-8,0');
  assert.ok(edge);
  const agent = crowd.agents[0], from = g.nodes[edge.a].x < 0 ? edge.a : edge.b, to = from === edge.a ? edge.b : edge.a;
  agent.current = from; agent.target = to; agent.progress = .6; agent.previous = -1; agent.idleTime = 0;
  agent.edge = g.nodes[from].neighbors.find(n => n.to === to); agent.position.set(-3.2, 0, 0);
  const van = { id: 'parked', position: { x: 0, z: 0 }, yaw: Math.PI / 2, speed: 0,
    distanceFrom(x, z) { return Math.hypot(Math.max(0, Math.abs(x) - 1.7), Math.max(0, Math.abs(z) - .82)); } };
  let reversed = false;
  for (let i = 0; i < 360; i++) {
    crowd.update(1 / 60, [van]);
    reversed ||= agent.target === from;
    assert.ok(van.distanceFrom(agent.position.x, agent.position.z) >= .55 - 1e-6);
    assert.ok(q.discClear(agent.position.x, agent.position.z, .28));
  }
  assert.ok(reversed);
  assert.ok(agent.position.x < -4);
  crowd.dispose();
});

test('thirty walkers keep moving safely around eight real parked campus vans for a minute', () => {
  const fleet = createVanFleet(map, queries).vans;
  assert.equal(fleet.length, 8);
  const crowd = create({ avoid: fleet.map(van => ({ ...van.position, radius: 5 })) });
  const traveled = crowd.agents.map(() => 0);
  let closest = Infinity;
  for (let tick = 0; tick < 3600; tick++) {
    const before = crowd.agents.map(agent => agent.position.clone());
    crowd.update(1 / 60, fleet);
    crowd.agents.forEach((agent, index) => { traveled[index] += agent.position.distanceTo(before[index]); });
    if (tick % 30) continue;
    for (const agent of crowd.agents) {
      assert.ok(queries.discClear(agent.position.x, agent.position.z, .28));
      assert.ok(queries.onRoad(agent.position.x, agent.position.z));
      assert.ok(fleet.every(van => van.distanceFrom(agent.position.x, agent.position.z) >= .55 - 1e-6));
    }
    closest = Math.min(closest, pairSpacing(crowd.agents));
  }
  assert.ok(closest >= .52 - 1e-6);
  assert.ok(traveled.every(metres => metres > 30));
  crowd.dispose(); fleet.forEach(van => van.dispose());
});

test('impact is accepted once, harms without gore, falls, then safely rejoins its path', () => {
  const crowd = create({ count: 12 }), agent = crowd.agents[0];
  const first = agent.position.clone();
  assert.equal(applyImpact(agent, { speed: 7, normal: { x: 1, z: 0 }, vanId: 'van-1', damage: 100 }), true);
  assert.equal(agent.reactionState, 'fallen');
  assert.equal(agent.health, 0);
  assert.equal(crowd.applyImpact(agent, { speed: 7, vanId: 'van-1', damage: 100 }), false);
  assert.deepEqual(crowd.drainEvents().map(event => event.type), ['collision']);
  for (let i = 0; i < 360; i++) {
    crowd.update(1 / 60);
    assert.ok(queries.discClear(agent.position.x, agent.position.z, .28));
    assert.ok(queries.onRoad(agent.position.x, agent.position.z));
    assert.ok(Math.hypot(agent.position.x - first.x, agent.position.z - first.z) < 5);
  }
  assert.ok(agent.health >= 25);
  assert.ok(['walk', 'idle'].includes(agent.reactionState));
  const a = graph.nodes[agent.current], b = graph.nodes[agent.target];
  assert.ok(pointToSegmentDistance([agent.position.x, agent.position.z], [a.x, a.z], [b.x, b.z]) < .12);
  assert.equal(crowd.applyImpact(agent, { speed: 1, normal: { x: 0, z: 1 }, damage: 2 }), true);
  assert.equal(agent.reactionState, 'stumble');
  crowd.dispose();
});

test('moving approaching vans trigger one near miss per eight seconds; parked vans do not', () => {
  const crowd = create({ count: 12 }), agent = crowd.agents[0];
  const van = { id: 'test-van', position: { x: agent.position.x, z: agent.position.z + 3.5 }, yaw: 0, speed: 0,
    config: { halfWidth: .82, front: 1.7, rear: 1.82 },
    distanceFrom(x, z) { return Math.max(0, Math.hypot(x - this.position.x, z - this.position.z) - 1); } };
  const parked = Array.from({ length: 7 }, (_, i) => ({ id: `parked-${i}`, speed: 0,
    position: { x: agent.position.x + 50 + i * 5, z: agent.position.z }, distanceFrom() { return 50; } }));
  crowd.update(1 / 60, [...parked, van]);
  assert.equal(crowd.drainEvents().length, 0);
  van.speed = 3;
  crowd.update(1 / 60, [...parked, van]);
  const events = crowd.drainEvents();
  assert.equal(events.length, 1); assert.equal(events[0].type, 'nearMiss'); assert.equal(events[0].vanId, van.id);
  assert.equal(agent.reactionState, 'startled'); assert.equal(agent.yielding, true);
  updateFor(crowd, 2, [...parked, van]);
  assert.equal(crowd.drainEvents().length, 0);
  updateFor(crowd, 8);
  van.position.x = agent.position.x; van.position.z = agent.position.z + 3.5;
  crowd.update(1 / 60, [...parked, van]);
  assert.equal(crowd.drainEvents().filter(event => event.npcId === agent.id && event.type === 'nearMiss').length, 1);
  crowd.dispose();
});

test('reaction animation remains instanced and finite during a fall and recovery', () => {
  const crowd = create({ count: 12, render: true }), agent = crowd.agents[0];
  assert.equal(crowd.group.children.length, 3);
  crowd.applyImpact(agent, { speed: 6, normal: { x: 1, z: 0 }, damage: 12 });
  for (let i = 0; i < 18; i++) { crowd.update(1 / 60); crowd.animate(1 / 60); }
  assert.ok(agent.rig.body.rotation.z > .7);
  updateFor(crowd, 3.5);
  for (let i = 0; i < 30; i++) crowd.animate(1 / 60);
  assert.ok(Math.abs(agent.rig.body.rotation.z) < .1);
  for (const batch of crowd.group.children) assert.ok([...batch.instanceMatrix.array].every(Number.isFinite));
  crowd.dispose();
});

test('a startled student turns toward an approaching van without changing the route heading', () => {
  const crowd = create({ count: 12, render: true }), agent = crowd.agents[0];
  const routeYaw = agent.yaw;
  const van = { id: 'turning-van', position: { x: agent.position.x + 3.5, z: agent.position.z }, yaw: Math.PI / 2, speed: 3,
    config: { halfWidth: .82, front: 1.7, rear: 1.82 },
    distanceFrom(x, z) { return Math.max(0, Math.hypot(x - this.position.x, z - this.position.z) - 1); } };
  for (let i = 0; i < 20; i++) { crowd.update(1 / 60, [van]); crowd.animate(1 / 60); }
  assert.equal(agent.reactionState, 'startled');
  assert.ok(Math.abs(agent.rig.group.rotation.y) > .6);
  assert.equal(agent.yaw, routeYaw);
  crowd.dispose();
});

test('an approaching van cannot replace an active collision stumble with a near miss', () => {
  const crowd = create({ count: 12 }), agent = crowd.agents[0];
  const van = { id: 'injury-van', position: { x: agent.position.x + 3.5, z: agent.position.z }, yaw: Math.PI / 2, speed: 3,
    config: { halfWidth: .82, front: 1.7, rear: 1.82 },
    distanceFrom(x, z) { return Math.max(0, Math.hypot(x - this.position.x, z - this.position.z) - 1); } };
  crowd.applyImpact(agent, { speed: 1, normal: { x: 0, z: 1 }, vanId: van.id, damage: 3 });
  crowd.drainEvents();
  crowd.update(1 / 60, [van]);
  assert.equal(agent.reactionState, 'stumble');
  assert.equal(crowd.drainEvents().filter(event => event.npcId === agent.id && event.type === 'nearMiss').length, 0);
  crowd.dispose();
});
