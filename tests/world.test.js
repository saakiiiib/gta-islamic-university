import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildWorld, bridgeHeightAt } from '../src/world/index.js';
import { buildingGeometry, surfaceGeometry } from '../src/world/geometry.js';
import { makeBridgeGeometries, bridgeElevation } from '../src/world/bridge.js';

const footprint = [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], [[5, 5], [5, 15], [15, 15], [15, 5], [5, 5]]];
const bridge = { id: '1317423268', width: 2.2, paths: [[[-14, 0], [14, 0]]], elevation: 0.45, rampLength: 4 };

function triangleAreaXZ(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = source.getAttribute('position');
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    area += Math.abs((p.getX(i + 1) - p.getX(i)) * (p.getZ(i + 2) - p.getZ(i)) - (p.getZ(i + 1) - p.getZ(i)) * (p.getX(i + 2) - p.getX(i))) / 2;
  }
  if (source !== geometry) source.dispose();
  return area;
}

test('horizontal mapped surfaces preserve courtyard holes and face upward', () => {
  const geometry = surfaceGeometry(footprint, 0.02);
  assert.ok(Math.abs(triangleAreaXZ(geometry) - 300) < 0.01);
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.99);
  geometry.dispose();
});

test('building extrusion uses metre height and retains an open courtyard', () => {
  const geometry = buildingGeometry(footprint, 9.6);
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.max.y - 9.6) < 0.0001);
  assert.ok(Math.abs(geometry.boundingBox.min.y) < 0.0001);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster(new THREE.Vector3(10, 20, 10), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(mesh).length, 0, 'courtyard must not receive an invented roof');
  ray.set(new THREE.Vector3(2, 20, 2), new THREE.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(mesh).length > 0);
  geometry.dispose(); mesh.material.dispose();
});

test('bridge has gentle four metre ramps and a bounded walkable corridor', () => {
  assert.equal(bridgeHeightAt(-14, 0, [bridge]), 0.035);
  assert.ok(Math.abs(bridgeHeightAt(-12, 0, [bridge]) - 0.2425) < 0.0001);
  assert.ok(Math.abs(bridgeHeightAt(0, 0, [bridge]) - 0.45) < 0.0001);
  assert.equal(bridgeHeightAt(0, 1.11, [bridge]), null);
  assert.equal(bridgeHeightAt(-15, 0, [bridge]), null);
  assert.ok(Math.abs(bridgeElevation(24, 28, bridge) - 0.45) < 0.0001);
  const { decks, rails } = makeBridgeGeometries(bridge);
  assert.ok(decks.length && rails.length);
  const mesh = new THREE.Mesh(decks[0], new THREE.MeshBasicMaterial());
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, 0));
  assert.ok(Math.abs(ray.intersectObject(mesh)[0].point.y - 0.45) < 0.001, 'top triangles face upward');
  [...decks, ...rails].forEach(geometry => geometry.dispose()); mesh.material.dispose();
});

test('world is CPU-buildable and separates shared visual/collision geometry', () => {
  const world = buildWorld({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, buildings: [{ id: '1', height: 9.6, polygons: [footprint] }], bridges: [bridge], trees: [{ id: 'tree', x: -22, z: 12 }] });
  assert.ok(world.group.isGroup);
  assert.ok(world.buildingMeshes.length > 0 && world.bridgeMeshes.length > 0);
  assert.ok(world.collisionGroup.children.some(mesh => mesh.name === 'collision-ground'));
  assert.ok(world.group.children.some(mesh => mesh.name === 'mapped-tree-canopies'));
  const collider = world.collisionGroup.children.find(mesh => mesh.name === 'collision-building');
  assert.ok(world.buildingMeshes.some(mesh => mesh.geometry === collider.geometry));
  world.update(1 / 60, new THREE.Vector3());
  world.dispose();
  assert.equal(world.group.children.length, 0);
  assert.equal(world.collisionGroup.children.length, 0);
});
