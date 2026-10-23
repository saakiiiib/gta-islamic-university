import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController, movementDirection, ThirdPersonCamera, isWaterBlocked, pointInMultiPolygon, InputController } from '../src/player/index.js';

function scene({ walls = [] } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(80, 0.2, 80), material);
  floor.position.y = -0.1;
  group.add(floor);
  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), material);
    mesh.position.set(...wall.position);
    group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

const bounds = { minX: -35, maxX: 35, minZ: -35, maxZ: 35 };
const square = (x1, z1, x2, z2) => [[[[x1, z1], [x2, z1], [x2, z2], [x1, z2], [x1, z1]]]];
function player(group = scene(), map = {}) {
  return new PlayerController({ collisionGroup: group, mapData: { bounds, spawn: { x: 0, y: 0, z: 0, yaw: 0 }, ...map } });
}
function simulate(p, seconds, input = {}, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) p.update(1 / fps, input, 0);
}

test('movement axes are camera relative and diagonals are normalized', () => {
  assert.deepEqual(movementDirection({ forward: true }, 0).toArray(), [0, 0, -1]);
  const east = movementDirection({ forward: true }, -Math.PI / 2);
  assert.ok(east.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  assert.ok(Math.abs(movementDirection({ forward: true, right: true }, 0).length() - 1) < 1e-10);
  assert.equal(movementDirection({ forward: true, back: true }).length(), 0);
});

test('walking and sprinting reach their metre-per-second speeds', () => {
  const p = player();
  simulate(p, 1, { forward: true });
  assert.ok(Math.abs(p.speed - 3.8) < 1e-8);
  assert.ok(p.position.z < -3.4 && p.position.z > -3.6);
  p.reset();
  simulate(p, 1, { forward: true, sprint: true });
  assert.ok(Math.abs(p.speed - 7.5) < 1e-8);
  assert.ok(p.position.z < -6 && p.position.z > -6.4);
});

test('diagonal walking covers the same ground distance', () => {
  const a = player(), b = player();
  simulate(a, 2, { forward: true });
  simulate(b, 2, { forward: true, right: true });
  assert.ok(Math.abs(a.position.length() - b.position.length()) < 1e-7);
});

test('gravity lands and jump is grounded-only without midair retrigger', () => {
  const p = player();
  simulate(p, 0.2);
  assert.equal(p.grounded, true);
  p.update(1 / 60, { jump: true });
  assert.equal(p.grounded, false);
  assert.ok(p.velocity.y > 5);
  const before = p.velocity.y;
  p.update(1 / 60, { jump: true });
  assert.ok(p.velocity.y < before);
  simulate(p, 1.2);
  assert.equal(p.grounded, true);
  assert.ok(Math.abs(p.position.y) < 1e-4);
});

test('wall collision stops penetration but lets diagonal movement slide', () => {
  const p = player(scene({ walls: [{ size: [20, 4, 0.2], position: [0, 2, -3] }] }));
  simulate(p, 2, { forward: true, right: true, sprint: true });
  assert.ok(p.position.z >= -2.581, `z=${p.position.z}`);
  assert.ok(p.position.x > 8);
  assert.ok(Math.abs(p.position.y) < 0.01);
});

test('two perpendicular walls contain a sprint into their corner', () => {
  const p = player(scene({ walls: [
    { size: [20, 4, 0.2], position: [0, 2, -3] },
    { size: [0.2, 4, 20], position: [3, 2, 0] },
  ] }));
  simulate(p, 3, { forward: true, right: true, sprint: true });
  assert.ok(p.position.x <= 2.581);
  assert.ok(p.position.z >= -2.581);
  assert.ok(p.grounded);
});

test('falling onto a roof grounds the player at its actual height', () => {
  const p = player(scene({ walls: [{ size: [8, 3, 8], position: [0, 1.5, 0] }] }));
  p.reset({ x: 0, y: 6, z: 0, yaw: 0 });
  simulate(p, 2);
  assert.ok(Math.abs(p.position.y - 3) < 1e-4);
  assert.equal(p.grounded, true);
});

test('an extruded footprint preserves a physically accessible courtyard hole', () => {
  const shape = new THREE.Shape();
  shape.moveTo(-5, -5); shape.lineTo(5, -5); shape.lineTo(5, 5); shape.lineTo(-5, 5); shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-2, -2); hole.lineTo(-2, 2); hole.lineTo(2, 2); hole.lineTo(2, -2); hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  const group = scene();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  const p = player(group);
  p.reset({ x: 0, y: 6, z: 0 });
  simulate(p, 2);
  assert.ok(Math.abs(p.position.y) < 1e-4, `courtyard floor ${p.position.y}`);
  simulate(p, 1, { right: true });
  assert.ok(p.position.x < 1.681);
});

test('water shoreline blocks the whole capsule footprint and allows a mapped bridge', () => {
  const map = {
    water: [{ polygons: square(-5, -10, 5, -2) }],
    bridges: [{ polygons: square(-1.1, -11, 1.1, -1) }],
  };
  assert.equal(isWaterBlocked(3, -1.8, map), true);
  assert.equal(isWaterBlocked(0, -5, map), false);
  const blocked = player(scene(), { ...map, spawn: { x: 3, y: 0, z: 0, yaw: 0 } });
  simulate(blocked, 3, { forward: true, sprint: true });
  assert.ok(blocked.position.z >= -1.68 - 0.02);
  const crossing = player(scene(), map);
  simulate(crossing, 3, { forward: true });
  assert.ok(crossing.position.z < -10);
});

test('polygon water holes are walkable land', () => {
  const polygon = square(-5, -5, 5, 5);
  polygon[0].push([[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]);
  assert.equal(pointInMultiPolygon([3, 0], polygon), true);
  assert.equal(pointInMultiPolygon([0, 0], polygon), false);
});

test('the capsule walks up a bridge ramp and stays grounded on its deck', () => {
  const positions = [], indices = [];
  for (const [z, y] of [[-6, 0], [-4, 0.6], [4, 0.6], [6, 0]]) positions.push(-1.1, y, z, 1.1, y, z);
  for (let i = 0; i < 6; i += 2) indices.push(i, i + 2, i + 1, i + 2, i + 3, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const group = scene();
  group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
  const p = player(group, {
    spawn: { x: 0, y: 0, z: 8 },
    water: [{ polygons: square(-5, -5, 5, 5) }],
    bridges: [{ polygons: square(-1.1, -6, 1.1, 6) }],
  });
  simulate(p, 2, { forward: true });
  assert.ok(p.position.z < 2 && p.position.z > -2);
  assert.ok(Math.abs(p.position.y - 0.6) < 0.02, `deck height ${p.position.y}`);
  assert.equal(p.grounded, true);
  simulate(p, 2.5, { forward: true });
  assert.ok(p.position.z < -7);
  assert.ok(Math.abs(p.position.y) < 0.02);
});

test('boundary is inset by capsule radius and reset clears velocity', () => {
  const p = player(scene(), { bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 } });
  simulate(p, 2, { right: true, sprint: true });
  assert.ok(p.position.x <= 1.6801);
  p.update(1 / 60, { reset: true });
  assert.deepEqual(p.position.toArray(), [0, 0, 0]);
  assert.equal(p.velocity.length(), 0);
});

test('bounded internal fixed steps are invariant at 30 and 60 render Hz', () => {
  const a = player(), b = player();
  simulate(a, 2, { forward: true, sprint: true }, 30);
  simulate(b, 2, { forward: true, sprint: true }, 60);
  assert.ok(a.position.distanceTo(b.position) < 1e-8);
  a.update(10, { forward: true });
  assert.ok(a.position.distanceTo(b.position) < 0.8);
});

test('camera obstacle rays keep its near plane outside a wall', () => {
  const group = scene({ walls: [{ size: [20, 5, 0.2], position: [0, 2.5, 3] }] });
  const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  const chase = new ThirdPersonCamera(camera, group);
  chase.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  assert.ok(camera.position.z < 2.7, `camera z ${camera.position.z}`);
  assert.ok(camera.position.z > 0);
  chase.update(1 / 60, new THREE.Vector3(), { dx: 0, dy: 100000 });
  assert.equal(chase.pitch, 1.05);
  chase.update(1 / 60, new THREE.Vector3(), { dx: 0, dy: -100000 });
  assert.equal(chase.pitch, 0.1);
});

test('student model is original geometry, proportioned in metres, and animates', () => {
  const p = player();
  p.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(p.group);
  assert.ok(box.max.y <= 1.77 && box.max.y > 1.7);
  assert.ok(box.min.y >= -0.01);
  simulate(p, 1, { forward: true });
  p.animate(0.05);
  assert.notEqual(p.rig.legs[0].rotation.x, 0);
  assert.ok(p.group.children.length > 0);
});

test('input one-shot actions, pause clearing, pointer-lock fallback and cleanup', async () => {
  class Surface extends EventTarget { }
  const win = new Surface(), doc = new Surface(), canvas = new Surface();
  doc.defaultView = win; doc.pointerLockElement = null; canvas.ownerDocument = doc;
  const pauses = [];
  const input = new InputController(canvas, { onPause: reason => pauses.push(reason) });
  function key(code, repeat = false) {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: repeat } });
    win.dispatchEvent(event);
  }
  assert.equal(input.enabled, false);
  key('KeyW'); key('Space');
  assert.equal(input.snapshot().jump, false);
  assert.equal(input.snapshot().forward, false);
  input.setEnabled(true);
  key('KeyW'); key('Space'); key('Space', true);
  assert.equal(input.snapshot().jump, true);
  assert.equal(input.snapshot().jump, false);
  assert.equal(input.snapshot().forward, true);
  win.dispatchEvent(new Event('blur'));
  assert.equal(input.snapshot().forward, false);
  assert.deepEqual(pauses, ['focus']);
  key('Escape');
  assert.deepEqual(pauses, ['focus', 'escape']);
  doc.pointerLockElement = canvas;
  doc.dispatchEvent(new Event('pointerlockchange'));
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event('pointerlockchange'));
  assert.deepEqual(pauses, ['focus', 'escape', 'pointerlock']);
  key('KeyW'); key('Space');
  input.setEnabled(false);
  assert.equal(input.snapshot().forward, false);
  assert.equal(input.snapshot().jump, false);
  doc.pointerLockElement = canvas;
  doc.dispatchEvent(new Event('pointerlockchange'));
  doc.pointerLockElement = null;
  doc.dispatchEvent(new Event('pointerlockchange'));
  win.dispatchEvent(new Event('blur'));
  assert.deepEqual(pauses, ['focus', 'escape', 'pointerlock']);
  key('Escape');
  assert.equal(pauses.at(-1), 'escape');
  assert.equal(await input.requestPointerLock(), false);
  canvas.requestPointerLock = () => Promise.reject(new Error('unavailable'));
  assert.equal(await input.requestPointerLock(), false);
  input.dispose();
  key('KeyW');
  assert.equal(input.snapshot().forward, false);
});

test('held arrow camera controls are elapsed-time scaled and clear on pause', () => {
  class Surface extends EventTarget { }
  const win = new Surface(), doc = new Surface(), canvas = new Surface();
  doc.defaultView = win; canvas.ownerDocument = doc;
  const input = new InputController(canvas);
  function key(code, type = 'keydown') {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
    win.dispatchEvent(event);
    return event;
  }
  key('ArrowRight');
  assert.deepEqual(input.consumeLook(1 / 30), { dx: 0, dy: 0 });
  input.setEnabled(true);
  assert.equal(key('ArrowRight').defaultPrevented, true);
  key('ArrowUp');
  input.lookDelta.dx = 3;
  input.lookDelta.dy = 2;
  assert.deepEqual(input.consumeLook(1 / 30), { dx: 23, dy: -13 });
  assert.deepEqual(input.consumeLook(1 / 60), { dx: 10, dy: -7.5 });
  key('ArrowLeft'); key('ArrowDown');
  assert.deepEqual(input.consumeLook(1 / 60), { dx: 0, dy: 0 });
  key('ArrowLeft', 'keyup'); key('ArrowDown', 'keyup');
  assert.deepEqual(input.consumeLook(10), { dx: 60, dy: -45 });
  assert.deepEqual(input.consumeLook(-1), { dx: 0, dy: 0 });
  input.setEnabled(false);
  assert.deepEqual(input.consumeLook(1 / 60), { dx: 0, dy: 0 });
  input.setEnabled(true);
  assert.deepEqual(input.consumeLook(1 / 60), { dx: 0, dy: 0 });
  input.dispose();
});
