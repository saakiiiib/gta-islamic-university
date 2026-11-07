import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { pointToSegmentDistance } from '../src/map/geometry.js';
import { wallEdges, chooseEntries } from '../src/world/facades.js';
import { buildingPalette } from '../src/world/appearance.js';
import { academicFacadeGeometry } from '../src/world/academicFacades.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
const actual = map.buildings.filter(b => ['18079381', '18079379'].includes(b.id));
const ring = (x, z, width, depth) => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z]];
const release = facade => { facade.windows.dispose(); facade.details.dispose(); };

function verifyWallGeometry(building, facade) {
  const edges = building.polygons.flatMap(wallEdges);
  for (const geometry of [facade.windows, facade.details]) {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    assert.ok([...positions.array, ...normals.array].every(Number.isFinite));
    assert.equal(positions.count, normals.count); assert.equal(geometry.groups.length, 0);
    for (let i = 0; i < positions.count; i++) {
      const point = [positions.getX(i), positions.getZ(i)];
      assert.ok(positions.getY(i) >= 0 && positions.getY(i) <= building.height + 1e-5);
      assert.ok(edges.some(edge => pointToSegmentDistance(point, edge.a, edge.b) <= .076), 'no floating courtyard/floor/roof vertex');
      assert.ok(Math.abs(normals.getY(i)) < 1e-5, 'facade surfaces stay vertical');
    }
    for (let i = 0; i < positions.count; i += 3) {
      const vertices = [0, 1, 2].map(offset => [positions.getX(i + offset), positions.getZ(i + offset)]);
      const nx = normals.getX(i), nz = normals.getZ(i);
      const matched = edges.find(edge => nx * edge.nx + nz * edge.nz > .999 && vertices.every(point => {
        const normalDistance = (point[0] - edge.a[0]) * edge.nx + (point[1] - edge.a[1]) * edge.nz;
        const along = (point[0] - edge.a[0]) * edge.ux + (point[1] - edge.a[1]) * edge.uz;
        return normalDistance > .03 && normalDistance <= .076 && along >= -1e-4 && along <= edge.length + 1e-4;
      }));
      assert.ok(matched, 'each triangle follows a single source wall and faces air, including courtyard walls');
      const a = new THREE.Vector3().fromBufferAttribute(positions, i);
      const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1);
      const c = new THREE.Vector3().fromBufferAttribute(positions, i + 2);
      const face = b.sub(a).cross(c.sub(a));
      assert.ok(face.x * matched.nx + face.z * matched.nz > 0, 'actual triangle winding also faces the source wall air side');
    }
  }
}

test('two actual academic relations receive finite courtyard-safe arches within the triangle budget', () => {
  assert.equal(actual.length, 2);
  for (const building of actual) {
    const palette = buildingPalette(building), entries = chooseEntries(building, map.roads, map.entrances);
    const before = JSON.stringify({ building, palette, entries });
    const facade = academicFacadeGeometry(building, palette, entries), d = facade.diagnostics;
    assert.equal(JSON.stringify({ building, palette, entries }), before);
    assert.ok(d.archCount > 20); assert.ok(d.courtyardWallCount > 0); assert.equal(d.collisionObjects, 0);
    assert.equal(d.appearanceStatus, 'source-inspired-illustrative'); assert.equal(d.measuredDimensions, false);
    assert.match(d.rhythmStatus, /provisional/); assert.equal(d.sourceUrls.length, 1);
    assert.ok(d.triangleCount <= 20000); assert.equal(d.budgetClipped, false);
    assert.equal((facade.windows.getAttribute('position').count + facade.details.getAttribute('position').count) / 3, d.triangleCount);
    assert.equal(facade.details.getAttribute('color').count, facade.details.getAttribute('position').count);
    verifyWallGeometry(building, facade); release(facade);
  }
});

test('both outer and courtyard ring windings keep all triangles at their own wall and facing air', () => {
  for (const outerReversed of [false, true]) for (const innerReversed of [false, true]) {
    const outer = ring(0, 0, 30, 24), inner = ring(8, 7, 14, 10);
    const building = { osmType: 'relation', id: '18079381', height: 9.6,
      polygons: [[outerReversed ? outer.toReversed() : outer, innerReversed ? inner.toReversed() : inner]] };
    const facade = academicFacadeGeometry(building, { accent: 0xbab9a5 });
    assert.equal(facade.diagnostics.courtyardWallCount, 4);
    assert.ok(facade.diagnostics.bays.some(b => b.ringIndex === 1));
    verifyWallGeometry(building, facade); release(facade);
  }
});

test('decorative ground entry apertures are clear on all outer windings, with no new opaque door panel', () => {
  for (const reverse of [false, true]) {
    const outer = ring(0, 0, 30, 24);
    const building = { osmType: 'relation', id: '18079379', height: 12.8,
      polygons: [[reverse ? outer.toReversed() : outer, ring(8, 7, 14, 10)]] };
    const edge = wallEdges(building.polygons[0])[0];
    const entries = [{ edge, distance: edge.length / 2, source: 'surveyed', nodeId: 'surveyed-entry' },
      { edge, distance: edge.length / 2 + 1.5, source: 'surveyed', nodeId: 'nearby-entry' }];
    const facade = academicFacadeGeometry(building, {}, entries), group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    group.add(new THREE.Mesh(facade.windows, material), new THREE.Mesh(facade.details, material)); group.updateMatrixWorld(true);
    for (const entry of entries) for (const along of [-.8, 0, .8]) for (const y of [.4, 1.5, 2.4]) {
      const at = edge.at(entry.distance + along, y, 1);
      const ray = new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(-edge.nx, 0, -edge.nz), 0, 1.2);
      assert.equal(ray.intersectObject(group, true).length, 0, 'surveyed entry gets an open decorative surround');
    }
    assert.equal(facade.diagnostics.entryClearances.length, 2);
    assert.equal(facade.diagnostics.entryClearances[0].nodeId, 'surveyed-entry');
    verifyWallGeometry(building, facade); release(facade); material.dispose();
  }
});

test('arches and vertical rhythms are deterministic; caller owns independent returned geometries', () => {
  const building = actual[0], palette = buildingPalette(building);
  const first = academicFacadeGeometry(building, palette), second = academicFacadeGeometry(building, palette);
  assert.deepEqual(first.diagnostics, second.diagnostics);
  let disposals = 0;
  for (const part of ['windows', 'details']) {
    assert.notEqual(first[part], second[part]);
    assert.deepEqual(first[part].getAttribute('position').array, second[part].getAttribute('position').array);
    first[part].addEventListener('dispose', () => disposals++);
  }
  assert.equal(disposals, 0); release(first); assert.equal(disposals, 2);
  assert.ok(second.windows.getAttribute('position').count > 0); release(second);
});

test('unsupported identities return fallback null and malformed supported footprints/heights fail early', () => {
  for (const building of [undefined, { osmType: 'way', id: '18079381' }, { osmType: 'relation', id: '18079384' },
    { osmType: 'relation', id: '18079382' }, { osmType: 'way', id: '532464097' }]) {
    assert.equal(academicFacadeGeometry(building), null);
  }
  for (const height of [NaN, Infinity, 0, -1, 3, 201]) assert.throws(() => academicFacadeGeometry({ ...actual[0], height }), /height/);
  assert.throws(() => academicFacadeGeometry({ ...actual[0], polygons: [[[[0, 0], [5, 0], [NaN, 3], [0, 0]]]] }), /finite closed/);
});

test('world batches both supported facades once while retaining source courtyards', async () => {
  const { buildWorld } = await import('../src/world/buildWorld.js');
  const source = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  const before = JSON.stringify(source.buildings.map(b=>b.polygons));
  const world = buildWorld(source);
  assert.deepEqual(world.academicFacadeProfiles.map(p=>p.osmId).sort(),['18079379','18079381']);
  assert.ok(world.academicFacadeProfiles.every(p=>p.courtyardWallCount>0 && p.collisionObjects===0 && p.triangleCount<20000));
  assert.equal(JSON.stringify(source.buildings.map(b=>b.polygons)),before);
  world.dispose();
});
