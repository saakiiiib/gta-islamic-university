import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildShaheedMinar } from '../src/world/landmarks/shaheedMinar.js';

test('Minar is an unplaced five-frame asset with finite bounded geometry and explicit art scale', () => {
  const options = Object.freeze({ heightMeters: 12 }), model = buildShaheedMinar(options);
  const { group, diagnostics: d } = model, mesh = group.children[0];
  assert.deepEqual(options, { heightMeters: 12 });
  assert.deepEqual(group.position.toArray(), [0, 0, 0]);
  assert.deepEqual(group.rotation.toArray().slice(0, 3), [0, 0, 0]);
  assert.equal(d.frames.length, 5); assert.equal(d.placementStatus, 'unverified');
  assert.equal(d.dimensionsStatus, 'provisional'); assert.equal(d.heightSource, 'caller-supplied-art-scale');
  assert.equal(d.collisionObjects, 0); assert.equal(d.drawCalls, 1);
  assert.ok(d.sourceUrls.every(url => url.startsWith('https://commons.wikimedia.org/')));
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  assert.ok([...positions.array].every(Number.isFinite)); assert.ok(positions.count < 50000);
  assert.equal(geometry.getAttribute('color').count, positions.count);
  assert.equal(geometry.groups.length, 0);
  const box = new THREE.Box3().setFromObject(group);
  assert.ok(Math.abs(box.min.y) < 1e-5); assert.ok(Math.abs(box.max.y - 12) < 1e-5);
  assert.ok(box.max.x - box.min.x <= 12 * 2.11);
  assert.ok(box.max.z - box.min.z <= 12 * 1.29);
  model.dispose();
});

test('Minar frame apertures transmit rays while the red disc and uprights remain physical', () => {
  const model = buildShaheedMinar({ heightMeters: 10 }); model.group.updateMatrixWorld(true);
  const shoot = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, -10), new THREE.Vector3(0, 0, 1), 0, 20)
    .intersectObject(model.group, true);
  for (const frame of model.diagnostics.frames) {
    assert.equal(shoot(...frame.openingSample).length, 0, `frame ${frame.index} has an open upper aperture`);
    assert.ok(shoot(frame.centerX - frame.width / 2 + .04, frame.bottom + frame.height * .8).length > 0);
  }
  assert.ok(shoot(.3, model.diagnostics.redDisc.center[1]).length > 0, 'red disc is solid behind central frame');
  model.dispose();
});

test('Minar geometry scales from caller height without sharing mutable geometry or provenance', () => {
  const a = buildShaheedMinar({ heightMeters: 5 }), b = buildShaheedMinar({ heightMeters: 15 });
  assert.notEqual(a.group.children[0].geometry, b.group.children[0].geometry);
  assert.ok(Math.abs(b.group.children[0].geometry.boundingBox.max.y / a.group.children[0].geometry.boundingBox.max.y - 3) < 1e-5);
  a.diagnostics.sourceUrls.pop(); a.diagnostics.scaleRatios.plazaWidth = 99;
  assert.equal(b.diagnostics.sourceUrls.length, 2); assert.equal(b.diagnostics.scaleRatios.plazaWidth, 2.1);
  a.dispose(); b.dispose();
});

test('Minar rejects missing or invalid scale and releases its resources exactly once', () => {
  for (const heightMeters of [undefined, null, 0, -1, NaN, Infinity, '12', 1001]) {
    assert.throws(() => buildShaheedMinar({ heightMeters }), /heightMeters/);
  }
  for (const options of [null, [], 4]) assert.throws(() => buildShaheedMinar(options), /object/);
  const model = buildShaheedMinar({ heightMeters: 8 }), parent = new THREE.Group(), mesh = model.group.children[0];
  parent.add(model.group); let geometries = 0, materials = 0;
  mesh.geometry.addEventListener('dispose', () => geometries++);
  mesh.material.addEventListener('dispose', () => materials++);
  model.dispose(); model.dispose();
  assert.equal(geometries, 1); assert.equal(materials, 1);
  assert.equal(parent.children.length, 0); assert.equal(model.group.children.length, 0);
});
