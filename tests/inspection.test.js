import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InspectionCamera, InspectionSession } from '../src/player/inspection.js';
import { InputController, ThirdPersonCamera, PlayerController } from '../src/player/index.js';
import { selectLabels, rectanglesOverlap } from '../src/ui/labels.js';

const bounds = { minX: -543, maxX: 543, minZ: -696, maxZ: 696 };
function surfaces() {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget();
  doc.defaultView = win; doc.pointerLockElement = null; canvas.ownerDocument = doc;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange')); };
  return { win, doc, canvas };
}
function key(win, code, type = 'keydown') {
  const event = new Event(type, { cancelable: true }); Object.defineProperties(event, { code: { value: code }, repeat: { value: false } }); win.dispatchEvent(event);
}

test('initial inspection fits the complete campus in wide and resized viewports', () => {
  const camera = new THREE.PerspectiveCamera(52, 16 / 9, .5, 3500), inspector = new InspectionCamera(camera, bounds);
  for (const aspect of [16 / 9, 1, 1.2, .6]) {
    inspector.resize(aspect);
    for (const x of [bounds.minX, bounds.maxX]) for (const z of [bounds.minZ, bounds.maxZ]) {
      const p = new THREE.Vector3(x, 0, z).project(camera);
      assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1, `campus corner outside ${aspect}: ${p.toArray()}`);
    }
  }
  assert.equal(camera.far, 3500);
});

test('inspection entry clears held movement, releases lock without pause, and exit restores the chase view', () => {
  const { win, doc, canvas } = surfaces(), pauses = [];
  const input = new InputController(canvas, { onPause: r => pauses.push(r) });
  input.setEnabled(true); key(win, 'KeyW'); key(win, 'Space');
  doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange'));
  const chaseCamera = new THREE.PerspectiveCamera(60, 1.7, .08, 2200), chase = new ThirdPersonCamera(chaseCamera, null);
  chase.reset({ x: 1, y: 0, z: 2, yaw: .7 }); chase.update(.1, new THREE.Vector3(1, 0, 2), { dx: 32, dy: 20 });
  const saved = { position: chaseCamera.position.toArray(), rotation: chaseCamera.quaternion.toArray(), yaw: chase.yaw, pitch: chase.pitch, target: chase.target.toArray() };
  const inspector = new InspectionCamera(new THREE.PerspectiveCamera(52, 1.7, .5, 3500), bounds), session = new InspectionSession(input, inspector, doc);
  session.enter(); assert.equal(session.active, true); assert.equal(input.enabled, false); assert.equal(doc.pointerLockElement, null); assert.deepEqual(pauses, []);
  assert.equal(input.snapshot().forward, false); assert.equal(input.snapshot().jump, false);
  const heldRepeat = new Event('keydown', { cancelable: true }); Object.defineProperties(heldRepeat, { code: { value: 'KeyW' }, repeat: { value: true } });
  inspector.orbit(100, 50); inspector.pan(30, 40); inspector.zoom(-300);
  session.exit(); assert.equal(session.active, false); assert.equal(input.enabled, true); assert.equal(inspector.enabled, false);
  assert.deepEqual({ position: chaseCamera.position.toArray(), rotation: chaseCamera.quaternion.toArray(), yaw: chase.yaw, pitch: chase.pitch, target: chase.target.toArray() }, saved);
  win.dispatchEvent(heldRepeat);
  assert.equal(input.snapshot().forward, false, 'held-key repeats cannot restart movement after the transition'); input.dispose();
});

test('inspection leaves student capsule, velocity and airborne state unchanged', () => {
  const { doc, canvas } = surfaces(), input = new InputController(canvas);
  const group = new THREE.Group(), ground = new THREE.Mesh(new THREE.BoxGeometry(30, .2, 30), new THREE.MeshBasicMaterial()); ground.position.y = -.1; group.add(ground); group.updateMatrixWorld(true);
  const player = new PlayerController({ collisionGroup: group, mapData: { bounds, spawn: { x: 0, y: 0, z: 0, yaw: 0 } } });
  for (let i = 0; i < 30; i++) player.update(1 / 60, {}, 0);
  player.update(1 / 60, { jump: true, forward: true }, .5);
  const capture = () => ({ position: player.position.toArray(), velocity: player.velocity.toArray(), yaw: player.yaw, grounded: player.grounded, start: player.capsule.start.toArray(), end: player.capsule.end.toArray() });
  const saved = capture(), inspector = new InspectionCamera(new THREE.PerspectiveCamera(52, 1.7, .5, 3500), bounds), session = new InspectionSession(input, inspector, doc);
  session.enter(); inspector.keys.add('KeyW');
  for (let i = 0; i < 1200; i++) inspector.update(1 / 60);
  assert.deepEqual(capture(), saved); session.exit(); assert.deepEqual(capture(), saved);
  player.update(1 / 60, input.snapshot(), 0); assert.ok(player.position.distanceTo(new THREE.Vector3(...saved.position)) < .15, 'resume advances only one normal tick');
  input.dispose(); player.dispose(); ground.geometry.dispose(); ground.material.dispose();
});

test('inspection focus loss clears controls; suspend/resume retains the inspection viewpoint', () => {
  const { win, doc, canvas } = surfaces(); let focusLosses = 0;
  const input = new InputController(canvas), inspector = new InspectionCamera(new THREE.PerspectiveCamera(52, 1.7, .5, 3500), bounds), session = new InspectionSession(input, inspector, doc);
  inspector.attach(canvas, () => { focusLosses++; session.suspend(); });
  session.enter(); key(win, 'KeyW'); key(win, 'ArrowLeft'); inspector.update(.05);
  win.dispatchEvent(new Event('blur')); assert.equal(focusLosses, 1); assert.equal(inspector.enabled, false); assert.equal(inspector.keys.size, 0);
  const position = inspector.camera.position.clone(); inspector.update(10); assert.deepEqual(inspector.camera.position.toArray(), position.toArray());
  session.resume(); assert.equal(session.active, true); assert.equal(input.enabled, false); assert.equal(inspector.enabled, true); assert.equal(inspector.keys.size, 0);
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); assert.equal(focusLosses, 2);
  inspector.dispose(); input.dispose();
});

test('a delayed pointer-lock grant is released if inspection or pause already disabled student input', async () => {
  const { doc, canvas } = surfaces(), pauses = [];
  const input = new InputController(canvas, { onPause: r => pauses.push(r) });
  let grant;
  canvas.requestPointerLock = () => new Promise(resolve => { grant = resolve; });
  input.setEnabled(true); const pending = input.requestPointerLock(); input.setEnabled(false);
  doc.pointerLockElement = canvas; doc.dispatchEvent(new Event('pointerlockchange')); grant();
  assert.equal(await pending, false); assert.equal(doc.pointerLockElement, null); assert.deepEqual(pauses, []);
  input.dispose();
});

test('inspection keyboard pan is normalized, orbit/zoom are bounded, and resize respects manual framing', () => {
  const a = new InspectionCamera(new THREE.PerspectiveCamera(52, 1.7, .5, 3500), bounds), b = new InspectionCamera(new THREE.PerspectiveCamera(52, 1.7, .5, 3500), bounds);
  a.setEnabled(true); b.setEnabled(true); a.keys.add('KeyW'); b.keys.add('KeyW'); b.keys.add('KeyD');
  const origin = a.target.clone(); a.update(.05); b.update(.05);
  assert.ok(Math.abs(a.target.distanceTo(origin) - b.target.distanceTo(origin)) < 1e-8);
  a.orbit(100000, 100000); assert.equal(a.pitch, 1.48); a.orbit(0, -100000); assert.equal(a.pitch, .22);
  a.zoom(-100000); assert.equal(a.distance, 35); a.zoom(100000); assert.equal(a.distance, 2900);
  const target = a.target.toArray(); a.resize(1.5); assert.deepEqual(a.target.toArray(), target); assert.equal(a.distance, 2900);
  a.setEnabled(false); assert.equal(a.keys.size, 0);
});

test('nearby labels enforce range, occlusion, HUD avoidance, overlap rejection and six/eighteen caps', () => {
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 3500); camera.position.set(0, 100, 200); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const anchors = [];
  for (let x = -150; x <= 150; x += 50) for (let z = -200; z <= 100; z += 50) anchors.push({ id: `${x}:${z}`, name: `Place ${x} ${z}`, kind: 'building', x, y: 10, z });
  anchors.push({ id: 'far', name: 'Distant place', x: 0, y: 10, z: -600 });
  const avoid = [{ left: 0, top: 0, right: 260, bottom: 300 }];
  const options = { width: 1600, height: 1000, avoid, occluded: a => a.x === 50 };
  const labels = selectLabels(anchors, camera, { x: 0, z: 0 }, options);
  assert.equal(labels.length, 6);
  for (const item of labels) {
    assert.ok(item.distance <= 300); assert.notEqual(item.anchor.x, 50); assert.ok(!rectanglesOverlap(item.rect, avoid[0]));
    for (const other of labels) if (other !== item) assert.ok(!rectanglesOverlap(item.rect, other.rect));
  }
  const inspection = selectLabels(anchors, camera, { x: 0, z: 0 }, { ...options, inspection: true });
  assert.ok(inspection.length > 6 && inspection.length <= 18);
});
