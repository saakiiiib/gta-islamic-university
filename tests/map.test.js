import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP_CONFIG} from '../src/config.js';
import {parseOsm, buildMapData, project, pointInPolygon, pointInMultiPolygon, pointToSegmentDistance,
  clipLineString, bufferPaths, estimateHeight, parseMetres} from '../src/map/index.js';

const xml = readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8');
const parsed = parseOsm(xml);
const map = buildMapData(parsed);
const allPolygonPoints = polygons => polygons.flat(2);
const inBounds = p => p[0] >= map.bounds.minX - 1e-6 && p[0] <= map.bounds.maxX + 1e-6
  && p[1] >= map.bounds.minZ - 1e-6 && p[1] <= map.bounds.maxZ + 1e-6;

test('OSM parsing preserves string IDs, source counts, tags, and all way references', () => {
  assert.equal(parsed.nodes.size, 3260);
  assert.equal(parsed.ways.size, 482);
  assert.equal(parsed.relations.size, 14);
  assert.equal(parsed.nodes.get('9027931167').id, '9027931167');
  assert.equal(parsed.ways.get('532464180').tags['building:levels'], '4');
  assert.ok([...parsed.ways.values()].every(way => way.refs.every(id => parsed.nodes.has(id))));
});

test('projection is metre based with east +X and north -Z', () => {
  assert.deepEqual(project(MAP_CONFIG.origin.lat, MAP_CONFIG.origin.lon, MAP_CONFIG.origin), [0, -0]);
  const east = project(MAP_CONFIG.origin.lat, MAP_CONFIG.origin.lon + .001, MAP_CONFIG.origin);
  const north = project(MAP_CONFIG.origin.lat + .001, MAP_CONFIG.origin.lon, MAP_CONFIG.origin);
  assert.ok(east[0] > 101 && east[0] < 103 && east[1] === 0);
  assert.ok(north[1] < -111 && north[1] > -112 && north[0] === 0);
});

test('whole campus and its northern edge survive with exactly 100m of bounding-box context', () => {
  const points = map.campus.polygons[0][0];
  assert.ok(points.every(inBounds));
  assert.ok(Math.abs(map.bounds.minZ - (Math.min(...points.map(p => p[1])) - 100)) < 1e-7);
  assert.ok(Math.abs(map.bounds.maxX - (Math.max(...points.map(p => p[0])) + 100)) < 1e-7);
  assert.ok(Math.abs(map.bounds.maxX - map.bounds.minX - 1086.3744) < .001);
  assert.ok(Math.abs(map.bounds.maxZ - map.bounds.minZ - 1391.8199) < .001);
});

test('real footprint count, auditorium, and relation member deduplication are preserved', () => {
  assert.equal(map.buildings.length, 189);
  assert.equal(map.buildings.filter(f => f.id === '7650711').length, 1);
  assert.equal(map.buildings.find(f => f.id === '7650711').sourceWayIds[0], '532464608');
  assert.equal(map.buildings.filter(f => f.id === '532464608').length, 0);
  const sourceIds = map.buildings.flatMap(f => f.sourceWayIds);
  assert.equal(sourceIds.length, new Set(sourceIds).size);
  for (const building of map.buildings) for (const polygon of building.polygons) for (const ring of polygon) {
    assert.deepEqual(ring[0], ring.at(-1));
    assert.ok(ring.length >= 4);
  }
});

test('documented malformed relation repairs only its two uniquely enclosed courtyards', () => {
  assert.equal(map.diagnostics.repairs.length, 2);
  assert.deepEqual(map.diagnostics.repairs.map(r => r.wayId).sort(), ['1317423250', '1317423251']);
  assert.ok(map.diagnostics.repairs.every(r => r.toBuilding === '18079382' && r.fromRelation === '18079383'));
  const arts = map.buildings.find(f => f.id === '18079382');
  assert.equal(arts.polygons[0].length, 3);
  const hole = arts.polygons[0][1];
  const centroid = hole.slice(0, -1).reduce((sum, p) => [sum[0] + p[0] / (hole.length - 1), sum[1] + p[1] / (hole.length - 1)], [0, 0]);
  assert.equal(pointInMultiPolygon(centroid, arts.polygons), false);
  assert.equal(map.buildings.some(f => f.id === '18079383'), false);
  assert.ok(map.diagnostics.warnings.every(w => w.includes('courtyard')));
});

test('mapped concave polygons and courtyard holes remain rings instead of bounding boxes', () => {
  const science = map.buildings.find(f => f.id === '18079384');
  assert.equal(science.polygons[0].length, 3);
  assert.ok(science.polygons[0][0].length > 5);
  assert.equal(map.buildings.find(f => f.id === '18079386').polygons[0].length, 2);
});

test('long roads and canals are clipped before buffering and have no distant geometry', () => {
  assert.equal(map.roads.length, 42);
  for (const feature of [...map.roads, ...map.water, ...map.greens]) {
    assert.ok(allPolygonPoints(feature.polygons).every(p => p.every(Number.isFinite) && inBounds(p)), feature.id);
    if (feature.paths) assert.ok(feature.paths.flat().every(inBounds), feature.id);
  }
  const trunk = map.roads.find(f => f.kind === 'trunk');
  assert.equal(trunk.width, 7);
  assert.equal(map.roads.find(f => f.id === '975575586').width, 6);
  assert.equal(map.roads.find(f => f.id === '1317423267').width, 2.2);
  assert.equal(map.water.filter(f => f.kind === 'canal').length, 1);
  assert.equal(map.water.find(f => f.kind === 'canal').width, 3);
});

test('line clipping handles distant crossing endpoints, separate re-entry, and rejects outside lines', () => {
  const b = {minX: 0, maxX: 10, minZ: 0, maxZ: 10};
  const crossing = clipLineString([[-100, 5], [100, 5]], b);
  assert.ok(Math.abs(crossing[0][0][0]) < 1e-6 && Math.abs(crossing[0][1][0] - 10) < 1e-6);
  assert.equal(crossing[0][0][1], 5);
  assert.deepEqual(clipLineString([[-2, -1], [12, -1]], b), []);
  const paths = clipLineString([[1, 1], [12, 1], [12, 8], [1, 8]], b);
  assert.equal(paths.length, 2);
  assert.ok(paths.flat().every(p => p[0] >= -1e-6 && p[0] <= 10 + 1e-6));
});

test('road buffers join bends, cover centre lines, and respect final context bounds', () => {
  const polygons = bufferPaths([[[0, 0], [10, 0], [10, 10]]], 4);
  assert.equal(polygons.length, 1);
  assert.ok(pointInMultiPolygon([10, 0], polygons));
  assert.ok(pointInMultiPolygon([10, 8], polygons));
  assert.equal(pointInMultiPolygon([5, 5], polygons), false);
  const clipped = bufferPaths([[[0, 0], [10, 0]]], 4, {minX: 0, maxX: 10, minZ: -1, maxZ: 1});
  assert.ok(allPolygonPoints(clipped).every(p => p[0] >= 0 && p[0] <= 10 && Math.abs(p[1]) <= 1));
});

test('lake footbridge imports without highway, while layer-only road stays on ground', () => {
  assert.equal(map.bridges.length, 1);
  const bridge = map.bridges[0];
  assert.equal(bridge.id, '1317423268');
  assert.equal(bridge.width, 2.2);
  assert.equal(bridge.elevation, .45);
  assert.equal(bridge.rampLength, 4);
  assert.equal(bridge.paths[0].length, 4);
  assert.ok(bridge.paths[0].flat().every(Number.isFinite));
  const road = map.roads.find(f => f.id === '1317423277');
  assert.equal(road.tags.layer, '1');
  assert.equal(map.bridges.some(f => f.id === road.id), false);
});

test('mapped green areas, water, point tree, and tree row are represented', () => {
  assert.equal(map.greens.length, 16);
  assert.equal(map.water.length, 4);
  assert.equal(map.trees.length, 1);
  assert.equal(map.treeRows.length, 1);
  assert.ok(map.greens.some(g => g.id === '18079385' && g.kind === 'garden'));
  assert.ok(map.greens.some(g => g.kind === 'forest'));
  assert.ok(map.greens.some(g => g.kind === 'orchard'));
  assert.ok(map.greens.some(g => g.kind === 'pitch'));
  assert.ok(map.water.some(w => w.kind === 'lake'));
});

test('height estimates follow explicit height, levels, then building use', () => {
  assert.deepEqual(estimateHeight({height: '10 m', 'building:levels': '4'}), {height: 10, heightSource: 'height'});
  assert.equal(estimateHeight({'building:levels': '4'}).height, 12.8);
  assert.equal(estimateHeight({building: 'apartments'}).height, 12.8);
  assert.equal(estimateHeight({building: 'yes', tourism: 'hostel'}).height, 12.8);
  assert.equal(estimateHeight({building: 'house'}).height, 6.4);
  assert.equal(estimateHeight({building: 'shed'}).height, 3.2);
  assert.equal(estimateHeight({building: 'university'}).height, 9.6);
  assert.equal(estimateHeight({building: 'yes'}).height, 9.6);
  assert.equal(parseMetres('20 ft'), 6.096);
  assert.equal(parseMetres('unknown'), null);
  assert.equal(map.buildings.find(f => f.id === '18079379').height, 12.8);
});

test('spawn uses the mapped inner Main Gate node and faces northwest along its road', () => {
  const node = parsed.nodes.get(MAP_CONFIG.spawnNodeId);
  const [x, z] = project(node.lat, node.lon, MAP_CONFIG.origin);
  assert.equal(map.spawn.x, x);
  assert.equal(map.spawn.z, z);
  assert.ok(map.spawn.forward[0] < 0 && map.spawn.forward[1] < 0);
  assert.ok(Math.abs(Math.hypot(...map.spawn.forward) - 1) < 1e-10);
  assert.ok(map.spawn.yaw > .5 && map.spawn.yaw < 1);
});

test('geometry helpers respect holes, polygon boundaries, and zero-length segments', () => {
  const p = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]];
  assert.equal(pointInPolygon([1, 1], p), true);
  assert.equal(pointInPolygon([5, 5], p), false);
  assert.equal(pointInPolygon([20, 5], p), false);
  assert.equal(pointToSegmentDistance([3, 4], [0, 0], [0, 0]), 5);
});

test('empty, malformed, and incomplete OSM fail with actionable loading errors', () => {
  assert.throws(() => parseOsm(''), /empty or missing/);
  assert.throws(() => parseOsm('<osm><node></osm>'), /Invalid map.osm XML/);
  assert.throws(() => parseOsm('<html><body>404</body></html>'), /expected OpenStreetMap/);
  assert.throws(() => buildMapData({...parsed, ways: new Map()}), /campus boundary/);
  const nodes = new Map(parsed.nodes);
  nodes.delete(MAP_CONFIG.spawnNodeId);
  assert.throws(() => buildMapData({...parsed, nodes}), /Main Gate spawn node/);
});
