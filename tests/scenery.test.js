import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData, pointToSegmentDistance } from '../src/map/index.js';
import { planScenery, sceneryAllowed, buildScenery, PROP_DIMENSIONS } from '../src/world/scenery.js';
import { horizontalUVs, facadeUVs, ensureBatchUVs, applyWorldAssets } from '../src/world/assets.js';
import { buildingGeometry, geometryMaterialPart } from '../src/world/geometry.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { collisionFingerprint, checksum } from './helpers/integrity.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));

test('solid scenery is deterministic, capped, source-hub anchored and outside exclusion corridors', () => {
  const result = planScenery(map);
  assert.deepEqual(result, planScenery(map)); assert.ok(result.length > 40 && result.length <= 80);
  for (const kind of Object.keys(PROP_DIMENSIONS)) assert.ok(result.some(p => p.kind === kind), kind);
  for (const p of result) {
    assert.equal(p.source, 'illustrative'); assert.ok(sceneryAllowed(p, map));
    assert.deepEqual(p.polygon[0], p.polygon.at(-1)); assert.equal(p.height, PROP_DIMENSIONS[p.kind].height);
    assert.ok(p.kind === 'fence' ? p.boundaryId === map.campus.id : p.hubId);
  }
  assert.ok(planScenery(map, { cap: 12 }).length <= 12);
});

test('illustrative fences follow the real campus boundary rather than the context bounding box', () => {
  for (const prop of planScenery(map).filter(p => p.kind === 'fence')) {
    const distance = Math.min(...map.campus.polygons.flatMap(p => p[0].slice(1).map((b, i) => pointToSegmentDistance([prop.x, prop.z], p[0][i], b))));
    assert.ok(distance < 1e-6);
    assert.ok(Math.abs(prop.x - map.bounds.minX) > 1 && Math.abs(prop.z - map.bounds.maxZ) > 1);
  }
});

test('scenery remains a separate solid collider layer and nearby furniture uses hysteresis', () => {
  const scenery = buildScenery(map);
  assert.equal(scenery.collisionGroup.children.length, scenery.obstacles.length);
  assert.equal(scenery.group.children.some(m => !m.isInstancedMesh), false);
  assert.ok(scenery.meshes.length < scenery.obstacles.length);
  scenery.update({ x: 10000, z: 10000 }); assert.ok(scenery.meshes.every(m => !m.visible));
  const p = scenery.obstacles[0]; scenery.update(p); assert.ok(scenery.meshes.some(m => m.visible));
  scenery.dispose();
});

test('surface and facade UVs retain metre-scaled texture coordinates without moving vertices', () => {
  const plane = new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), before = [...plane.attributes.position.array];
  horizontalUVs(plane, 4); assert.deepEqual([...plane.attributes.position.array], before);
  assert.equal(Math.abs(plane.attributes.uv.getX(0) - plane.attributes.uv.getX(1)), 2);
  const polygon = [[[0, 0], [12, 0], [12, 8], [0, 8], [0, 0]]];
  const extrusion = buildingGeometry(polygon, 9.6), walls = geometryMaterialPart(extrusion, 1);
  const wallPositions = [...walls.attributes.position.array]; facadeUVs(walls, polygon, 2);
  assert.deepEqual([...walls.attributes.position.array], wallPositions);
  assert.ok([...walls.attributes.uv.array].every(Number.isFinite));
  assert.ok(Math.max(...walls.attributes.uv.array) > 4);
  walls.deleteAttribute('uv1'); ensureBatchUVs(walls); assert.equal(walls.attributes.uv1.count, walls.attributes.position.count);
  plane.dispose(); extrusion.dispose(); walls.dispose();
});

test('batched textured world preserves the canonical map collider and roof/wall UV attributes', () => {
  const baseline = JSON.parse(readFileSync(new URL('./phase1-baseline.json', import.meta.url)));
  const world = buildWorld(map);
  assert.deepEqual(collisionFingerprint(world.collisionGroup), baseline.collision);
  assert.ok(world.scenery.collisionGroup.children.length > 40);
  for (const mesh of world.buildingMeshes) {
    assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
    assert.equal(mesh.geometry.attributes.uv1.count, mesh.geometry.attributes.position.count);
  }
  world.dispose();
});

test('CC0 runtime asset variants and local glTF dependencies are present, checksummed and within budget', () => {
  const root = new URL('../public/visual/', import.meta.url), manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
  assert.equal(manifest.license, 'CC0-1.0'); assert.ok(manifest.sources.length >= 10);
  assert.ok(manifest.variants['1024'] < 12_000_000 && manifest.variants['512'] < 6_000_000);
  for (const file of manifest.files) { const bytes = readFileSync(new URL(file.path, root)); assert.equal(checksum(bytes), file.sha256); assert.equal(bytes.length, file.bytes); }
  for (const variant of ['1024', '512']) {
    const gltf = JSON.parse(readFileSync(new URL(`${variant}/painted-wooden-bench.gltf`, root)));
    const folder = new URL(`${variant}/`, root);
    for (const entry of [...gltf.buffers, ...gltf.images]) { assert.equal(/^https?:/.test(entry.uri), false); assert.ok(readFileSync(new URL(entry.uri, folder)).length); }
    assert.equal(gltf.accessors[gltf.meshes[0].primitives[0].indices].count / 3, 630);
  }
});

test('missing optional visual assets preserve visible fallback materials and furniture without document access', async () => {
  const world = { materials: {}, scenery: {} };
  const state = await applyWorldAssets(world, { baseURL: './missing/', mobile: true });
  assert.equal(state.variant, '512'); assert.equal(state.failed.length, 6); assert.equal(state.loaded.length, 0);
});
