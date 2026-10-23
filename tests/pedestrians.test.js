import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, bufferPaths, pointToSegmentDistance, pointInMultiPolygon } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { PedestrianSystem } from '../src/npc/pedestrians.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map), graph = buildPedestrianGraph(map, queries);
const road = (id, path, kind = 'path', width = 2.2) => ({ id, kind, width, paths: [path], polygons: bufferPaths([path], width) });

test('pedestrian navigation splits T junctions and geometric crossings instead of cutting across campus', () => {
  const m = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, roads: [road('a', [[-30, 0], [30, 0]]), road('b', [[0, 0], [0, 30]])] };
  const g = buildPedestrianGraph(m, new CampusQueries(m)), junction = g.nodes.find(n => Math.hypot(n.x, n.z) < 1e-6);
  assert.equal(junction.neighbors.length, 3);
  assert.ok(g.edges.every(e => e.length <= 8.1)); assert.equal(new Set(g.edges.map(e => [e.a, e.b].sort((a, b) => a - b).join(':'))).size, g.edges.length);
});

test('bridge deck crossings do not falsely connect to a road below the known deck elevation', () => {
  const bridge = { ...road('bridge', [[0, -16], [0, 16]]), elevation: .45, rampLength: 4 };
  const m = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, roads: [road('ground', [[-16, 0], [16, 0]])], bridges: [bridge] };
  const g = buildPedestrianGraph(m, new CampusQueries(m));
  assert.equal(g.diagnostics.components, 2);
  assert.equal(g.nodes.filter(n => n.neighbors.some(e => e.roadId === 'ground') && n.neighbors.some(e => e.roadId === 'bridge')).length, 0);
});

test('actual campus graph excludes highways and every accepted edge is safe', () => {
  assert.ok(graph.nodes.length > 500 && graph.edges.length > 500);
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a], b = graph.nodes[edge.b]; assert.ok(!/trunk|motorway/.test(edge.kind));
    assert.ok(queries.segmentClear([a.x, a.z], [b.x, b.z], .28));
    assert.ok(pointInMultiPolygon([a.x, a.z], map.campus.polygons));
    assert.ok(graph.segmentWalkable([a.x, a.z], [b.x, b.z]));
  }
});

test('twelve deterministic pedestrians wander safely along real edges for a minute', () => {
  const a = new PedestrianSystem(map, queries, graph, { render: false, count: 12 }), b = new PedestrianSystem(map, queries, graph, { render: false, count: 12 });
  assert.equal(a.agents.length, 12); assert.deepEqual(a.agents.map(p => p.position.toArray()), b.agents.map(p => p.position.toArray()));
  for (let tick = 0; tick < 3600; tick++) {
    a.update(1 / 60);
    if (tick % 20) continue;
    for (const p of a.agents) {
      assert.ok(queries.discClear(p.position.x, p.position.z, .28)); assert.ok(graph.isWalkable(p.position.x, p.position.z));
      const from = graph.nodes[p.current], to = graph.nodes[p.target];
      assert.ok(Math.hypot(p.offset.x, p.offset.z) <= .8);
      assert.ok(pointToSegmentDistance([p.position.x, p.position.z], [from.x, from.z], [to.x, to.z]) <= .8, 'bounded pavement sidesteps allow walkers to pass');
    }
  }
  assert.ok(a.agents.every(p => p.visited.size > 3)); a.dispose(); b.dispose();
});

test('pedestrians reverse at a dead end and yield away from an approaching van on their route', () => {
  const m = { bounds: { minX: -100, maxX: 100, minZ: -30, maxZ: 30 }, spawn: { x: -85, z: 0, yaw: -Math.PI / 2 }, roads: [road('long', [[-80, 0], [80, 0]])] };
  const q = new CampusQueries(m), g = buildPedestrianGraph(m, q), crowd = new PedestrianSystem(m, q, g, { render: false, count: 12 });
  const p = crowd.agents[0], dead = g.nodes.find(n => n.neighbors.length === 1), from = g.nodes[dead.neighbors[0].to];
  p.current = from.id; p.target = dead.id; p.progress = .99; p.edge = from.neighbors.find(n => n.to === dead.id); p.idleTime = 0; p.speed = 1.3;
  p.position.set(from.x + (dead.x - from.x) * .99, 0, from.z + (dead.z - from.z) * .99);
  crowd.update(.1); assert.equal(p.current, dead.id); assert.equal(p.target, from.id);
  p.progress = .5; p.idleTime = 0; const to = g.nodes[p.target], start = g.nodes[p.current];
  p.position.set((start.x + to.x) / 2, 0, 0);
  const nearX = p.position.x + Math.sign(to.x - start.x), oldTarget = p.target;
  crowd.update(1 / 60, { distanceFrom: (x, z) => Math.hypot(x - nearX, z) });
  assert.ok(p.yielding); assert.notEqual(p.target, oldTarget); crowd.dispose();
});

test('pedestrian visuals use three coloured instance batches with finite animated matrices', () => {
  const crowd = new PedestrianSystem(map, queries, graph, { count: 12 });
  assert.equal(crowd.group.children.length, 3); assert.ok(crowd.group.children.every(m => m.isInstancedMesh));
  const skinColors = new Set(crowd.agents.map(p => p.rig.head.material.color.getHex())); assert.ok(skinColors.size >= 4);
  for (let i = 0; i < 120; i++) { crowd.update(1 / 60); crowd.animate(1 / 60); }
  for (const batch of crowd.group.children) assert.ok([...batch.instanceMatrix.array].every(Number.isFinite));
  assert.ok(crowd.agents.some(p => Math.abs(p.rig.legs[0].rotation.x) > .01)); crowd.dispose();
});
