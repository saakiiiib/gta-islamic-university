import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/osm.js';
import { pointInPolygon, pointToSegmentDistance } from '../src/map/geometry.js';
import { chooseEntries, wallEdges } from '../src/world/facades.js';
import { buildAuditorium } from '../src/world/landmarks/auditorium.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const building = map.buildings.find(b => b.id === '7650711');
const entrances = chooseEntries(building, map.roads, map.entrances);

test('auditorium retains the actual footprint and source data with bounded single-batch geometry', () => {
  const before = JSON.stringify(building), model = buildAuditorium(building, { entrances });
  assert.equal(JSON.stringify(building), before);
  assert.equal(model.diagnostics.drawCalls, 1); assert.equal(model.diagnostics.collisionObjects, 0);
  assert.equal(model.diagnostics.entries[0].source, 'illustrative');
  assert.equal(model.diagnostics.entries[0].surveyed, false);
  assert.match(model.diagnostics.heightStatus, /unmeasured/);
  assert.match(model.diagnostics.detailStatus, /illustrative/);
  const mesh = model.group.children[0], geometry = mesh.geometry, positions = geometry.getAttribute('position');
  assert.equal(geometry.groups.length, 0);
  assert.equal(positions.count, geometry.getAttribute('color').count);
  assert.ok(positions.count < 70000);
  assert.ok([...positions.array].every(Number.isFinite));
  for (let i = 0; i < positions.count; i++) {
    const p = [positions.getX(i), positions.getZ(i)];
    if (pointInPolygon(p, building.polygons[0])) continue;
    const distance = Math.min(...building.polygons[0][0].slice(1).map((b, j) => pointToSegmentDistance(p, building.polygons[0][0][j], b)));
    assert.ok(distance <= model.diagnostics.maxFacadeProjection + .001, 'trim cannot spread across the grounds/roads');
  }
  assert.ok(Math.abs(geometry.boundingBox.max.y - building.height - model.diagnostics.roofRise) < 1e-4);
  for (const polygon of model.diagnostics.hallPolygons) for (const ring of polygon) for (const p of ring) {
    assert.ok(pointInPolygon(p, building.polygons[0]), 'raised hall roof is clipped to the mapped source');
  }
  model.dispose();
});

test('entry augmentation contains no closing panels, sill or stair across the entrance', () => {
  const model = buildAuditorium(building, { entrances }); model.group.updateMatrixWorld(true);
  const entry = entrances[0], edge = entry.edge;
  for (const y of [.08, .8, 1.75, 3]) for (const offset of [-.5, 0, .5]) {
    const at = edge.at(entry.distance + offset, y, 2);
    const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(-edge.nx, 0, -edge.nz), 0, 2.3);
    assert.equal(ray.intersectObject(model.group, true).length, 0, 'entry path stays visually open');
  }
  const roofAt = edge.at(entry.distance, model.diagnostics.entries[0].archHeight + 2, .4);
  const roofRay = new THREE.Raycaster(new THREE.Vector3(...roofAt), new THREE.Vector3(0, -1, 0), 0, 3);
  assert.ok(roofRay.intersectObject(model.group, true).length > 0, 'portico includes a roof above its opening');
  model.dispose();
});

test('a supplied mapped-edge entry controls orientation and bounded projection', () => {
  const edge = wallEdges(building.polygons[0]).find(e => !e.ringIndex && e.length > 15);
  const model = buildAuditorium(building, { entrances: [{ edge, distance: edge.length / 2, source: 'surveyed' }], baseHeight: 12, entryProjection: .5 });
  assert.equal(model.diagnostics.entries[0].surveyed, true);
  assert.deepEqual(model.diagnostics.entries[0].center, edge.at(edge.length / 2, 0, 0));
  assert.equal(model.diagnostics.baseHeight, 12);
  assert.equal(model.diagnostics.maxFacadeProjection, .58);
  model.dispose();
  const fallback = buildAuditorium(building);
  assert.equal(fallback.diagnostics.entries[0].source, 'illustrative-longest-edge');
  fallback.dispose();
});

test('auditorium resources are released once and detached cleanly', () => {
  const model = buildAuditorium(building), mesh = model.group.children[0], parent = new THREE.Group(); parent.add(model.group);
  let g = 0, m = 0; mesh.geometry.addEventListener('dispose', () => g++); mesh.material.addEventListener('dispose', () => m++);
  model.dispose(); model.dispose();
  assert.equal(g, 1); assert.equal(m, 1); assert.equal(parent.children.length, 0); assert.equal(model.group.children.length, 0);
});

test('identity, height, footprint and entry validation reject unusable geometry', () => {
  assert.throws(() => buildAuditorium({ ...building, id: '1' }), /relation 7650711/);
  assert.throws(() => buildAuditorium({ ...building, osmType: 'way' }), /relation 7650711/);
  assert.throws(() => buildAuditorium(building, { baseHeight: NaN }), /finite/);
  assert.throws(() => buildAuditorium(building, { entryProjection: 5 }), /limits/);
  assert.throws(() => buildAuditorium(building, { entrances: [] }), /nonempty/);
  assert.throws(() => buildAuditorium(building, { entrances: [{ edge: { a: [0, 0], b: [5, 0] }, distance: 2 }] }), /mapped outer edge/);
  assert.throws(() => buildAuditorium({ ...building, polygons: [[[[0, 0], [1, 0], [Infinity, 1], [0, 0]]]] }), /finite/);
});

test('world integrates the typed auditorium once and disposes the custom batch', async () => {
  const { buildWorld } = await import('../src/world/buildWorld.js');
  const { buildingPalette } = await import('../src/world/appearance.js');
  const world = buildWorld({ bounds: { minX:-2000,minZ:-2000,maxX:2000,maxZ:2000 }, buildings:[building], roads:[], bridges:[], greens:[], water:[] });
  const models = world.landmarkModels.filter(m => m.diagnostics.osmId === '7650711');
  assert.equal(models.length, 1); assert.equal(models[0].diagnostics.collisionObjects, 0);
  assert.equal(buildingPalette(building).wall, 0xb98172);
  let count = 0; models[0].group.children[0].geometry.addEventListener('dispose', () => count++);
  world.dispose(); assert.equal(count,1); assert.equal(models[0].group.parent,null);
});
