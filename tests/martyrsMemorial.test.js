import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMartyrsMemorial } from '../src/world/landmarks/martyrsMemorial.js';

test('separate memorial preserves a deep curved shell, nested portals and provisional provenance', () => {
  const options = Object.freeze({ heightMeters: 16 }), model = buildMartyrsMemorial(options);
  const { group, diagnostics: d } = model, geometry = group.children[0].geometry;
  assert.deepEqual(options, { heightMeters: 16 }); assert.deepEqual(group.position.toArray(), [0, 0, 0]);
  assert.deepEqual(group.rotation.toArray().slice(0, 3), [0, 0, 0]);
  assert.equal(d.placementStatus, 'unverified'); assert.equal(d.dimensionsStatus, 'provisional');
  assert.equal(d.heightSource, 'caller-supplied-art-scale'); assert.equal(d.portals.length, 2);
  assert.ok(d.shell.depth > 4); assert.ok(d.shell.thickness > .5);
  assert.equal(d.drawCalls, 1); assert.equal(d.collisionObjects, 0);
  assert.ok(d.sourceUrls.every(url => url.startsWith('https://commons.wikimedia.org/')));
  assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
  assert.ok(geometry.getAttribute('position').count < 50000);
  assert.equal(geometry.getAttribute('color').count, geometry.getAttribute('position').count);
  assert.equal(geometry.groups.length, 0);
  const box = new THREE.Box3().setFromObject(group);
  assert.ok(Math.abs(box.min.y) < 1e-5); assert.ok(Math.abs(box.max.y - 16) < 1e-5);
  assert.ok(box.max.x - box.min.x <= 16 * 1.46); assert.ok(box.max.z - box.min.z <= 16 * .93);
  model.dispose();
});

test('memorial openings transmit rays through depth while shell jambs, crown and soffit remain solid', () => {
  const h = 10, model = buildMartyrsMemorial({ heightMeters: h }); model.group.updateMatrixWorld(true);
  const shoot = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, -h), new THREE.Vector3(0, 0, 1), 0, h * 2)
    .intersectObject(model.group, true);
  for (const [x, y] of model.diagnostics.openingSamples) assert.equal(shoot(x, y).length, 0);
  assert.ok(shoot(.283 * h, .4 * h).length > 0, 'shell jamb has material thickness');
  assert.ok(shoot(0, .98 * h).length > 0, 'curved shell crown is a solid volume');
  const up = new THREE.Raycaster(new THREE.Vector3(0, .85 * h, 0), new THREE.Vector3(0, 1, 0), 0, .2 * h);
  assert.ok(up.intersectObject(model.group, true).length > 0, 'inner curved soffit exists through shell depth');
  model.dispose();
});

test('memorials scale without sharing mutable resources or diagnostic arrays', () => {
  const a = buildMartyrsMemorial({ heightMeters: 7 }), b = buildMartyrsMemorial({ heightMeters: 21 });
  assert.notEqual(a.group.children[0].geometry, b.group.children[0].geometry);
  assert.ok(Math.abs(b.group.children[0].geometry.boundingBox.max.y / a.group.children[0].geometry.boundingBox.max.y - 3) < 1e-5);
  a.diagnostics.sourceUrls.pop(); a.diagnostics.scaleRatios.shellDepth = 99;
  assert.equal(b.diagnostics.sourceUrls.length, 2); assert.equal(b.diagnostics.scaleRatios.shellDepth, .29);
  a.dispose(); b.dispose();
});

test('memorial requires caller scale and disposes geometry and material only once', () => {
  for (const heightMeters of [undefined, null, 0, -1, NaN, Infinity, '12', 1001]) {
    assert.throws(() => buildMartyrsMemorial({ heightMeters }), /heightMeters/);
  }
  for (const options of [null, [], 4]) assert.throws(() => buildMartyrsMemorial(options), /object/);
  const model = buildMartyrsMemorial({ heightMeters: 9 }), parent = new THREE.Group(), mesh = model.group.children[0];
  parent.add(model.group); let geometries = 0, materials = 0;
  mesh.geometry.addEventListener('dispose', () => geometries++);
  mesh.material.addEventListener('dispose', () => materials++);
  model.dispose(); model.dispose();
  assert.equal(geometries, 1); assert.equal(materials, 1);
  assert.equal(parent.children.length, 0); assert.equal(model.group.children.length, 0);
});
