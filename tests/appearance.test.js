import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import clipping from 'polygon-clipping';
import * as THREE from 'three';
import { parseOsm, buildMapData, bufferPaths, pointInMultiPolygon, ringArea } from '../src/map/index.js';
import { interiorAnchor, deduplicatePlaces, buildPlaceMetadata } from '../src/map/places.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { buildRoadAppearance, bridgeDeckFootprint, ROAD_LEVELS } from '../src/world/roads.js';
import { classifyBuilding, buildingPalette } from '../src/world/appearance.js';
import { facadeGeometry, wallEdges, chooseEntries } from '../src/world/facades.js';
import { planVegetation, vegetationAllowed } from '../src/world/vegetation.js';
import { collisionFingerprint, modelFingerprint, checksum } from './helpers/integrity.js';

const raw = readFileSync(new URL('../public/data/map.osm', import.meta.url));
const map = buildMapData(parseOsm(raw.toString()));
const baseline = JSON.parse(readFileSync(new URL('./phase1-baseline.json', import.meta.url)));
const square = (x, z, size) => [[[[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]]]];
const area = polygons => polygons.reduce((total, p) => total + ringArea(p[0]) - p.slice(1).reduce((s, r) => s + ringArea(r), 0), 0);
const road = (id, kind, width, path) => ({ id, kind, width, paths: [path], polygons: bufferPaths([path], width) });
const roadsMap = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, buildings: [], water: [],
  roads: [road('east-west', 'service', 6, [[-30, 0], [30, 0]]), road('north-south', 'service', 6, [[0, -30], [0, 30]]), road('walk', 'path', 2.2, [[12, 0], [12, 20]])], bridges: [] };

test('Phase 1 raw map, feature counts, footprints, heights and heightSource are unchanged', () => {
  assert.equal(checksum(raw), baseline.rawMapSha256);
  assert.deepEqual(map.diagnostics.counts, baseline.counts);
  assert.equal(modelFingerprint(map), baseline.modelSha256);
});

test('canonical collision triangles retain Phase 1 positions AND winding', () => {
  const world = buildWorld(map);
  assert.deepEqual(collisionFingerprint(world.collisionGroup), baseline.collision);
  assert.equal(world.footprintDebug.visible, false);
  assert.equal(world.collisionGroup.children.some(m => /facade|curb|tree|road/.test(m.name)), false);
  world.dispose();
});

test('vehicle junctions are continuous unions and walking surfaces have no asphalt overlap', () => {
  const before = JSON.stringify(roadsMap), appearance = buildRoadAppearance(roadsMap);
  for (const point of [[0, 0], [2.9, 2.9], [-20, 0], [0, -20]]) assert.ok(pointInMultiPolygon(point, appearance.asphalt));
  assert.ok(area(clipping.intersection(appearance.paths, appearance.asphalt)) < 1e-8);
  const expected = clipping.union(...roadsMap.roads.map(r => r.polygons));
  assert.ok(Math.abs(area(expected) - area(appearance.asphalt) - area(appearance.paths)) < 1e-6);
  assert.equal(JSON.stringify(roadsMap), before, 'the original roads are not rewritten');
});

test('curbs stop at vehicle junctions, walking connections and bridge approaches', () => {
  const bridge = { width: 2.2, paths: [[[20, 0], [20, -15]]], polygons: bufferPaths([[[20, 0], [20, -15]]], 2.2) };
  const a = buildRoadAppearance({ ...roadsMap, bridges: [bridge] });
  assert.equal(pointInMultiPolygon([0, 3.3], a.curbs), false, 'no curb across a vehicle junction');
  assert.equal(pointInMultiPolygon([12, 3.4], a.curbs), false, 'footpath opening');
  assert.equal(pointInMultiPolygon([20, -3.4], a.curbs), false, 'bridge approach opening');
  assert.equal(pointInMultiPolygon([-15, 3.4], a.curbs), true, 'uninterrupted road edge still has a curb');
  assert.equal(area(clipping.intersection(a.asphalt, bridgeDeckFootprint(bridge))), 0);
  assert.ok(pointInMultiPolygon([20, .8], a.asphalt), 'pavement reaches the square ramp endpoint without a round-cap gap');
});

test('edging excludes building and water polygons and avoids pavement overlaps', () => {
  const forbidden = [{ polygons: square(-16, 3, 4) }];
  const a = buildRoadAppearance({ ...roadsMap, buildings: forbidden, water: [{ polygons: square(23, 3, 4) }] });
  assert.equal(pointInMultiPolygon([-15, 3.4], a.curbs), false);
  assert.equal(pointInMultiPolygon([24, 3.4], a.curbs), false);
  assert.ok(area(clipping.intersection(a.edges, a.asphalt)) < 1e-7);
  assert.ok(area(clipping.intersection(a.curbs, a.paths)) < 1e-7);
});

test('centre markings only belong to trunk/tertiary pavement and skip junctions', () => {
  assert.equal(buildRoadAppearance(roadsMap).markings.length, 0);
  const trunk = road('trunk', 'trunk', 7, [[-30, -15], [30, -15]]);
  const a = buildRoadAppearance({ ...roadsMap, roads: [...roadsMap.roads, trunk] });
  assert.ok(a.markings.length);
  assert.ok(area(clipping.difference(a.markings, a.asphalt)) < 1e-8);
  assert.equal(pointInMultiPolygon([0, -15], a.markings), false);
  assert.ok(ROAD_LEVELS.marking > ROAD_LEVELS.edge && ROAD_LEVELS.edge > ROAD_LEVELS.path && ROAD_LEVELS.path > ROAD_LEVELS.asphalt);
  assert.ok(ROAD_LEVELS.curbTop <= .15);
});

test('building use prioritizes tags and worship over names containing Hall', () => {
  assert.equal(classifyBuilding({ tags: { building: 'yes', name: 'Jia Hall Mosque' } }), 'worship');
  assert.equal(classifyBuilding({ tags: { building: 'university', name: 'Faculty Hall' } }), 'academic');
  assert.equal(classifyBuilding({ tags: { building: 'dormitory', name: 'Science House' } }), 'residential');
  assert.equal(classifyBuilding({ tags: { building: 'construction', name: 'Academic Building' } }), 'construction');
  assert.equal(classifyBuilding({ tags: { building: 'yes', amenity: 'hospital' } }), 'civic');
  assert.equal(classifyBuilding({ tags: { building: 'yes', name: 'Saddam Hossain Hall' } }), 'residential');
  assert.equal(classifyBuilding({ tags: { building: 'yes' } }), 'unclassified');
  assert.notEqual(buildingPalette({ id: '1', tags: { building: 'dormitory' } }).wall, buildingPalette({ id: '1', tags: { building: 'university' } }).wall);
});

test('façade triangles face outward for BOTH outer windings and courtyard windings', () => {
  const outer = square(0, 0, 20)[0][0], inner = square(5, 5, 10)[0][0];
  for (const reverseOuter of [false, true]) for (const reverseHole of [false, true]) {
    const polygon = [reverseOuter ? outer.toReversed() : outer, reverseHole ? inner.toReversed() : inner];
    const palette = buildingPalette({ id: 'test', tags: {} }), facades = facadeGeometry(polygon, 9.6, palette);
    const edges = wallEdges(polygon);
    for (const geometry of Object.values(facades)) {
      const p = geometry.attributes.position, n = geometry.attributes.normal;
      for (let i = 0; i < p.count; i += 3) {
        const center = new THREE.Vector3().fromBufferAttribute(p, i).add(new THREE.Vector3().fromBufferAttribute(p, i + 1)).add(new THREE.Vector3().fromBufferAttribute(p, i + 2)).multiplyScalar(1 / 3);
        const edge = [...edges].sort((a, b) => Math.abs((center.x - a.a[0]) * a.nx + (center.z - a.a[1]) * a.nz) - Math.abs((center.x - b.a[0]) * b.nx + (center.z - b.a[1]) * b.nz));
        // Identify the supporting wall from its perpendicular distance and along-wall extent.
        const owner = edge.find(e => { const d = (center.x - e.a[0]) * e.nx + (center.z - e.a[1]) * e.nz; const t = (center.x - e.a[0]) * e.ux + (center.z - e.a[1]) * e.uz; return d > 0 && d < .16 && t >= -.01 && t <= e.length + .01; });
        assert.ok(owner, 'every decoration stays on an actual wall');
        assert.ok(n.getX(i) * owner.nx + n.getZ(i) * owner.nz > .99);
      }
      geometry.dispose();
    }
  }
});

test('surveyed entries are retained; illustrative entries choose the road-facing outer wall', () => {
  const building = { id: 'b', polygons: square(0, 0, 20) };
  const roads = [road('r', 'service', 6, [[-10, -10], [30, -10]])];
  const inferred = chooseEntries(building, roads);
  assert.equal(inferred[0].source, 'illustrative');
  assert.equal(inferred[0].edge.nz, -1);
  const surveyed = chooseEntries(building, roads, [{ id: 'node', buildingId: 'b', x: 20, z: 7 }]);
  assert.equal(surveyed.length, 1); assert.equal(surveyed[0].nodeId, 'node'); assert.equal(surveyed[0].source, 'surveyed');
  assert.ok(Math.abs(surveyed[0].edge.at(surveyed[0].distance, 0, 0)[2] - 7) < 1e-8);
});

test('place labels have source names and valid anchors, never synthetic bridge fallbacks', () => {
  assert.ok(map.places.length > 30 && map.entrances.length >= 5);
  assert.equal(map.places.some(p => p.name === 'Lake footbridge'), false);
  const parsed = parseOsm(raw.toString());
  for (const p of map.places) {
    assert.ok(['name', 'name:en', 'ref'].includes(p.nameTag));
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
    const [type, id] = p.sourceIds[0].split(':');
    const source = type === 'node' ? parsed.nodes.get(id) : map[type].find(f => f.id === id);
    assert.equal(source.tags[p.nameTag].trim(), p.name);
    if (p.buildingId) assert.ok(pointInMultiPolygon([p.x, p.z], map.buildings.find(b => b.id === p.buildingId).polygons));
  }
  assert.ok(map.places.some(p => p.name === 'Main Gate' && p.nameTag === 'ref'));
});

test('courtyard label anchors stay inside the building, and duplicate labels retain source IDs', () => {
  const polygon = square(0, 0, 20); polygon[0].push(square(5, 5, 10)[0][0]);
  assert.ok(pointInMultiPolygon(interiorAnchor(polygon), polygon));
  const sources = [{ id: 'a', name: 'Diana Chattar', sourceIds: ['a'], x: 0, z: 0 }, { id: 'b', name: 'Diana Chattar', sourceIds: ['b'], x: 15, z: 0 }, { id: 'c', name: 'Diana Chattar', sourceIds: ['c'], x: 250, z: 0 }];
  const result = deduplicatePlaces(sources);
  assert.equal(result.length, 2); assert.deepEqual(result[0].sourceIds, ['a', 'b']); assert.deepEqual(sources[0].sourceIds, ['a']);
});

test('building entrance association preserves surveyed coordinates and tags', () => {
  const node = { id: 'door', tags: { entrance: 'yes', ref: 'West entry' } };
  const data = { ...roadsMap, greens: [], water: [], buildings: [{ id: 'b', height: 9.6, polygons: square(0, 0, 10) }] };
  const meta = buildPlaceMetadata(data, new Map([['door', node]]), new Map([['door', [0, 4]]]));
  assert.equal(meta.entrances[0].buildingId, 'b'); assert.equal(meta.entrances[0].z, 4); assert.deepEqual(meta.entrances[0].tags, node.tags);
});

test('decorative planting is deterministic, capped and stays out of every exclusion zone', () => {
  const result = planVegetation(map);
  assert.deepEqual(result, planVegetation(map));
  assert.ok(result.trees.length > 0 && result.trees.length <= 240);
  assert.ok(result.shrubs.length > 0 && result.shrubs.length <= 160);
  for (const p of [...result.trees, ...result.shrubs]) {
    const green = map.greens.find(g => g.id === p.greenId);
    assert.ok(vegetationAllowed([p.x, p.z], green, map, p.radius));
  }
  const capped = planVegetation(map, { treeCap: 3, shrubCap: 2 });
  assert.equal(capped.trees.length, 3); assert.equal(capped.shrubs.length, 2);
});
