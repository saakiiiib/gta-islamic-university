import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/osm.js';
import { pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { wallEdges } from '../src/world/facades.js';
import { buildCentralMosque } from '../src/world/landmarks/centralMosque.js';

const building = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')))
  .buildings.find(b => b.id === '1317423259');

test('mosque augmentation fits the actual OSM footprint and has finite, bounded geometry', () => {
  const snapshot = JSON.stringify(building), model = buildCentralMosque(building);
  const { diagnostics, group } = model;
  assert.equal(JSON.stringify(building), snapshot, 'source map data remains caller-owned');
  assert.equal(diagnostics.drawCalls, 1);
  assert.equal(diagnostics.plannedMinarets, 0);
  assert.equal(diagnostics.collisionObjects, 0);
  assert.ok(diagnostics.components.some(c => c.kind === 'secondary-dome'));
  assert.equal(diagnostics.components.filter(c => c.kind === 'roof-cupola').length, 4);
  const polygon = building.polygons[0];
  for (const c of diagnostics.components) {
    assert.ok(pointInPolygon(c.center, polygon));
    for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      assert.ok(pointToSegmentDistance(c.center, ring[i - 1], ring[i]) >= c.radius - 1e-5);
    }
    assert.ok(c.bottom >= building.height);
    assert.ok(c.top <= diagnostics.mainDomeTopMeters + 1e-6);
  }
  const mesh = group.children[0], positions = mesh.geometry.getAttribute('position');
  assert.ok(positions.count < 60000, 'landmark remains a modest procedural asset');
  assert.ok([...positions.array].every(Number.isFinite));
  assert.equal(mesh.geometry.groups.length, 0, 'one material and no hidden per-part draw groups');
  assert.equal(mesh.geometry.getAttribute('color').count, positions.count);
  assert.ok(Math.abs(mesh.geometry.boundingBox.max.y - 27.4) < 1e-4);
  assert.match(diagnostics.heightStatus, /ambiguous/);
  assert.match(diagnostics.layoutStatus, /illustrative/);
  model.dispose();
});

test('decorative facade arches leave their ground-level openings clear', () => {
  const model = buildCentralMosque(building);
  model.group.updateMatrixWorld(true);
  for (const edge of wallEdges(building.polygons[0]).filter(e => !e.ringIndex && e.length > 4)) {
    const bays = Math.max(1, Math.floor(edge.length / 4.8)), distance = edge.length / bays / 2;
    const at = edge.at(distance, .8, 1);
    const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(-edge.nx, 0, -edge.nz), 0, 1.5);
    assert.equal(ray.intersectObject(model.group, true).length, 0, 'arch centers add no opaque entrance panel');
  }
  model.dispose();
});

test('roof height and optional main center can be changed without moving or mutating the footprint', () => {
  const first = buildCentralMosque(building, { includeFacadeArches: false });
  const center = first.diagnostics.components[0].center;
  const next = buildCentralMosque(building, { baseHeight: 12.8, mainDomeTopMeters: 30, mainDomeCenter: center });
  assert.deepEqual(next.diagnostics.components[0].center, center);
  assert.equal(next.diagnostics.baseHeight, 12.8);
  assert.equal(first.diagnostics.archCount, 0);
  assert.ok(next.diagnostics.archCount > 0);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(next.group).max.y - 30) < 1e-4);
  assert.equal(next.diagnostics.layoutStatus, 'caller-supplied-main-center');
  first.dispose(); next.dispose();
});

test('resources are disposed exactly once and detached without disposing caller resources', () => {
  const model = buildCentralMosque(building), parent = new THREE.Group(), mesh = model.group.children[0];
  parent.add(model.group);
  let geometryDisposals = 0, materialDisposals = 0;
  mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  mesh.material.addEventListener('dispose', () => materialDisposals++);
  model.dispose(); model.dispose();
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(model.group.children.length, 0); assert.equal(parent.children.length, 0);
});

test('the dedicated mosque model rejects unrelated identities, invalid heights and unusable rings', () => {
  assert.throws(() => buildCentralMosque({ ...building, id: '1317423300' }), /way 1317423259/);
  assert.throws(() => buildCentralMosque({ ...building, osmType: 'relation' }), /way 1317423259/);
  for (const height of [NaN, Infinity, -1, 26]) {
    assert.throws(() => buildCentralMosque(building, { baseHeight: height }), /height|room/i);
  }
  assert.throws(() => buildCentralMosque(building, { mainDomeCenter: [0, 0] }), /inside/);
  assert.throws(() => buildCentralMosque({ ...building, polygons: [[[[0, 0], [1, 0], [NaN, 2], [0, 0]]]] }), /finite/);
});

test('world integrates one mosque model and owns its lifetime without adding collision', async () => {
  const { buildWorld } = await import('../src/world/buildWorld.js');
  const { buildingGeometry } = await import('../src/world/geometry.js');
  const { collisionFingerprint } = await import('./helpers/integrity.js');
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  const world = buildWorld(map);
  assert.equal(world.landmarkModels.filter(m => m.diagnostics.osmId === '1317423259').length, 1);
  assert.ok(world.group.getObjectByName('central-mosque-landmark'));
  assert.equal(world.collisionGroup.getObjectByName('central-mosque-domes-and-arches'), undefined);
  const model = world.landmarkModels.find(m => m.diagnostics.osmId === '1317423259'), mesh = model.group.children[0];
  let disposals = 0; mesh.geometry.addEventListener('dispose', () => disposals++);
  world.dispose(); assert.equal(disposals, 1); assert.equal(model.group.parent, null);
});
