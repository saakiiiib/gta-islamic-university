import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, bufferPaths, pointToSegmentDistance } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { walkingRoutes } from '../src/navigation/walkingRoutes.js';
import { PedestrianSystem } from '../src/npc/pedestrians.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map), graph = buildPedestrianGraph(map, queries);
const metric = (point, road) => Math.min(...road.paths.flatMap(path => path.slice(1).map((b, i) => pointToSegmentDistance(point, path[i], b))));
const road = (id, kind, path, width) => ({ id, kind, width, paths: [path], polygons: bufferPaths([path], width) });

test('mapped footpaths and lake bridge are retained; vehicle routes use estimated roadside lines', () => {
  assert.equal(map.roads.length, 42);
  assert.equal(map.bridges.length, 1);
  const footIds = new Set([...map.roads.filter(r => ['path', 'footway', 'pedestrian'].includes(r.kind)), ...map.bridges].map(r => r.id));
  assert.ok([...footIds].every(id => graph.edges.some(edge => edge.roadId === id && edge.walkingKind === 'footpath' && edge.source === 'osm')));
  const lengths = Object.fromEntries(['footpath', 'roadside', 'crossing'].map(kind =>
    [kind, graph.edges.filter(e => e.walkingKind === kind).reduce((sum, e) => sum + e.length, 0)]));
  assert.ok(lengths.footpath > 500);
  assert.ok(lengths.roadside > lengths.crossing * 5);
  assert.ok((lengths.roadside + lengths.footpath) / Object.values(lengths).reduce((a, b) => a + b, 0) > .85);
  for (const edge of graph.edges.filter(e => e.walkingKind === 'roadside')) {
    const source = map.roads.find(r => r.id === edge.roadId);
    const a = graph.nodes[edge.a], b = graph.nodes[edge.b], mid = [(a.x + b.x) / 2, (a.z + b.z) / 2];
    assert.ok(edge.estimated && edge.source === 'estimated');
    assert.ok(metric(mid, source) >= source.width / 2 + .15, `roadside route ${edge.roadId} is beyond its pavement edge`);
  }
});

test('crossings come from short mapped junction or footpath connections, never arbitrary road intersections', () => {
  const routes = walkingRoutes(map), crossings = routes.filter(route => route.walkingKind === 'crossing');
  assert.ok(crossings.length > 0);
  assert.ok(crossings.every(route => route.source === 'estimated' && route.path.length === 2 &&
    Math.hypot(route.path[0][0] - route.path[1][0], route.path[0][1] - route.path[1][1]) <= 9));
  const local = { bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    roads: [road('east-west', 'service', [[-20, 0], [20, 0]], 6),
      road('north-south', 'service', [[0, -20], [0, 20]], 6)] };
  assert.equal(walkingRoutes(local).filter(route => route.walkingKind === 'crossing').length, 0);
  const connected = { ...local, roads: [road('west', 'service', [[-20, 0], [0, 0]], 6),
    road('east', 'service', [[0, 0], [20, 0]], 6)] };
  assert.ok(walkingRoutes(connected).some(route => route.walkingKind === 'crossing'));
});

test('every corridor segment avoids water and walls, and van clearance covers sidesteps and impulses', () => {
  assert.ok(graph.diagnostics.components > 0);
  for (const edge of graph.edges) {
    const a = graph.nodes[edge.a], b = graph.nodes[edge.b];
    assert.ok(queries.segmentClear([a.x, a.z], [b.x, b.z], .28));
    assert.ok(graph.segmentWalkable([a.x, a.z], [b.x, b.z]));
  }
  const path = [[-20, 0], [20, 0]];
  const local = { bounds: { minX: -25, maxX: 25, minZ: -8, maxZ: 8 },
    spawn: { x: -25, z: 0, yaw: 0 }, roads: [road('walk', 'path', path, 2.2)] };
  const q = new CampusQueries(local), g = buildPedestrianGraph(local, q);
  const crowd = new PedestrianSystem(local, q, g, { count: 1, render: false });
  const agent = crowd.agents[0];
  agent.position.set(-1.35, 0, 0);
  const van = { position: { x: 0, z: 0 }, yaw: 0, speed: 0,
    distanceFrom(x, z) { return Math.hypot(Math.max(0, Math.abs(x) - .82), Math.max(0, Math.abs(z) - 1.7)); } };
  assert.equal(crowd.safeMove(agent, -.9, 0, [van]), false);
  assert.equal(crowd.safeMove(agent, -1.5, 0, [van]), true);
  crowd.dispose();
});
