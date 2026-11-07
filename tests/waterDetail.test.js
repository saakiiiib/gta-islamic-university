import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { bufferPaths, pointInMultiPolygon, pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { buildWaterDetails } from '../src/world/waterDetail.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
const rectangle = (x, z, width, depth) => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z]];

test('world owns bounded water-detail batches and releases them once', async () => {
  const { buildWorld } = await import('../src/world/buildWorld.js');
  const world = buildWorld(map), detail = world.waterDetails;
  assert.equal(detail.group.parent, world.group);
  assert.ok(detail.diagnostics.drawCalls <= 2);
  assert.equal(world.collisionGroup.getObjectByName('illustrative-aquatic-water-details'), undefined);
  let count = 0; detail.group.children[0].geometry.addEventListener('dispose', () => count++);
  world.dispose(); assert.equal(count, 1); assert.equal(detail.group.parent, null);
});

test('all three actual water features remain separate, with sparse finite bounded instancing', () => {
  const before = JSON.stringify(map), model = buildWaterDetails(map), d = model.diagnostics;
  assert.equal(JSON.stringify(map), before);
  assert.deepEqual(d.waters.map(w => w.id), ['1317423252', '1317423265', '1317423275']);
  assert.deepEqual(d.waters.map(w => w.name), map.water.map(w => w.name));
  assert.ok(d.waters.every(w => w.leaves + w.reeds > 0));
  assert.equal(d.appearanceStatus, 'source-inspired-illustrative-seasonal');
  assert.equal(d.photoToPolygonMatchStatus, 'unresolved'); assert.equal(d.plantLocationsStatus, 'not-surveyed');
  assert.ok(d.instanceCount > 30 && d.instanceCount <= 250); assert.equal(d.instanceCount, d.placements.length);
  assert.equal(d.collisionObjects, 0); assert.ok(d.drawCalls <= 2); assert.equal(d.drawCalls, model.group.children.length);
  assert.equal(model.group.children.reduce((sum, mesh) => sum + mesh.count, 0), d.instanceCount);
  for (const mesh of model.group.children) {
    assert.ok(mesh.isInstancedMesh); assert.equal(mesh.material.transparent, false);
    assert.ok(mesh.geometry.getAttribute('position').count <= 24);
    assert.ok([...mesh.geometry.getAttribute('position').array, ...mesh.instanceMatrix.array, ...mesh.instanceColor.array].every(Number.isFinite));
    assert.ok(mesh.boundingSphere.radius < 1000);
  }
  model.dispose();
});

test('every actual placement and rendered vertex stays inside its mapped water and clear of bridge approaches', () => {
  const model = buildWaterDetails(map), d = model.diagnostics;
  const bridgeBuffers = map.bridges.map(bridge => bufferPaths(bridge.paths, bridge.width + 8));
  for (const plant of d.placements) {
    const polygon = map.water[plant.featureIndex].polygons[plant.polygonIndex], point = [plant.x, plant.z];
    assert.ok(pointInPolygon(point, polygon)); assert.ok(plant.shoreDistance <= 8);
    for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      assert.ok(pointToSegmentDistance(point, ring[i - 1], ring[i]) >= plant.radius + .149);
    }
    for (const [index, bridge] of map.bridges.entries()) {
      assert.equal(pointInMultiPolygon(point, bridgeBuffers[index]), false);
      for (const path of bridge.paths) for (let i = 1; i < path.length; i++) {
        assert.ok(pointToSegmentDistance(point, path[i - 1], path[i]) > bridge.width / 2 + 4 + plant.radius);
      }
    }
  }
  const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  for (const mesh of model.group.children) {
    const plants = d.placements.filter(p => mesh.name === `aquatic-${p.kind}`), positions = mesh.geometry.getAttribute('position');
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index).applyMatrix4(matrix);
        assert.ok(pointInPolygon([vertex.x, vertex.z], map.water[plants[instance].featureIndex].polygons[plants[instance].polygonIndex]));
        for (const corridor of bridgeBuffers) assert.equal(pointInMultiPolygon([vertex.x, vertex.z], corridor), false);
      }
    }
  }
  model.dispose();
});

test('synthetic water holes remain clear and approach buffers protect both bridge endpoints', () => {
  const polygon = [rectangle(0, 0, 80, 70), rectangle(24, 20, 30, 28)];
  const synthetic = { water: [{ id: 'water-with-island', name: '', kind: 'pond', polygons: [polygon] }],
    bridges: [{ width: 3, rampLength: 6, paths: [[[0, 8], [20, 8]]] }] };
  const before = JSON.stringify(synthetic), model = buildWaterDetails(synthetic);
  assert.equal(JSON.stringify(synthetic), before); assert.ok(model.diagnostics.instanceCount > 0);
  for (const p of model.diagnostics.placements) {
    assert.ok(pointInPolygon([p.x, p.z], polygon));
    assert.ok(pointToSegmentDistance([p.x, p.z], [0, 8], [20, 8]) > 1.5 + 6 + p.radius);
    for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      assert.ok(pointToSegmentDistance([p.x, p.z], ring[i - 1], ring[i]) > p.radius);
    }
  }
  model.dispose();
});

test('sampling is deterministic and copied diagnostics/resources do not mutate future builds', () => {
  const a = buildWaterDetails(map), b = buildWaterDetails(map);
  assert.deepEqual(a.diagnostics, b.diagnostics);
  for (let i = 0; i < a.group.children.length; i++) {
    assert.deepEqual(a.group.children[i].instanceMatrix.array, b.group.children[i].instanceMatrix.array);
    assert.notEqual(a.group.children[i].geometry, b.group.children[i].geometry);
  }
  a.diagnostics.sourceUrls.pop(); a.diagnostics.placements[0].x = 99999; a.diagnostics.waters[0].name = 'test';
  assert.equal(b.diagnostics.sourceUrls.length, 3); assert.notEqual(b.diagnostics.placements[0].x, 99999);
  assert.equal(b.diagnostics.waters[0].name, map.water[0].name);
  a.dispose(); b.dispose();
});

test('empty or unusably narrow water adds no draws and disposal releases owned resources exactly once', () => {
  for (const input of [{}, { water: [], bridges: [] }, { water: [{ id: 'tiny', polygons: [[rectangle(0, 0, .3, .2)]] }] },
    { water: [{ id: 'invalid', polygons: [[[[0, 0], [NaN, 2], [0, 2], [0, 0]]]] }] }]) {
    const empty = buildWaterDetails(input); assert.equal(empty.diagnostics.instanceCount, 0); assert.equal(empty.diagnostics.drawCalls, 0);
    assert.equal(empty.group.children.length, 0); empty.dispose(); empty.dispose();
  }
  const model = buildWaterDetails(map), parent = new THREE.Group(), meshes = [...model.group.children];
  parent.add(model.group); let materials = 0, geometries = 0, instances = 0;
  meshes[0].material.addEventListener('dispose', () => materials++);
  meshes.forEach(mesh => { mesh.geometry.addEventListener('dispose', () => geometries++); mesh.addEventListener('dispose', () => instances++); });
  model.dispose(); model.dispose();
  assert.equal(materials, 1); assert.equal(geometries, meshes.length); assert.equal(instances, meshes.length);
  assert.equal(parent.children.length, 0); assert.equal(model.group.children.length, 0);
});
