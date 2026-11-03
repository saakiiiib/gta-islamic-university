import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { GateMenuCamera, CameraHandoff } from '../src/ui/gateCamera.js';
import { MAIN_GATE_CONFIG } from '../src/world/mainGate.js';

const up = new Vector3(0, 1, 0);
const gatePoints = [];
// Actual outer cornice/crown/feet and upper sign coordinates from mainGate.js.
for (const x of [-10.2, 10.2]) for (const y of [0, 10.725]) for (const z of [-1.1, 1.1]) gatePoints.push(new Vector3(x, y, z));
for (const x of [-6.4, 6.4]) for (const y of [7.925, 9.275]) gatePoints.push(new Vector3(x, y, .82));
gatePoints.push(new Vector3(-2.1, 0, 3.3), new Vector3(2.1, 0, 3.3));

function snapshot(camera) {
  return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov,
    aspect: camera.aspect, zoom: camera.zoom, projection: camera.projectionMatrix.toArray(), matrix: camera.matrixWorld.toArray() };
}

function chaseCamera() {
  const camera = new PerspectiveCamera(60, 16 / 9, .08, 2200);
  camera.position.set(312, 3, -70);
  camera.lookAt(305, 1.35, -65);
  camera.updateMatrixWorld(true);
  return camera;
}

test('menu camera fits all gate arches, crown, sign and crest in landscape and portrait stage safe frames', () => {
  const menu = new GateMenuCamera();
  assert.ok(menu.camera.isPerspectiveCamera);
  for (const aspect of [2.4, 16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, .4]) {
    menu.fit(aspect);
    for (const localPoint of gatePoints) {
      const point = localPoint.clone().applyAxisAngle(up, MAIN_GATE_CONFIG.yaw).add(new Vector3(...Object.values(MAIN_GATE_CONFIG.position)));
      const projected = point.project(menu.camera);
      assert.ok(Math.abs(projected.x) < .85 && Math.abs(projected.y) < .85 && projected.z > -1 && projected.z < 1,
        `gate point ${localPoint.toArray()} is outside ${aspect} safe frame: ${projected.toArray()}`);
    }
    const outward = new Vector3(0, 0, 1).applyAxisAngle(up, MAIN_GATE_CONFIG.yaw);
    assert.ok(menu.camera.position.clone().sub(menu.target).dot(outward) > 0, 'camera stays on the highway-facing side');
  }
});

test('menu pose follows gate yaw and position, remains static, and survives hidden/invalid stage dimensions', () => {
  const config = { position: { x: -50, y: 3, z: 80 }, yaw: -.9 };
  const menu = new GateMenuCamera(config);
  menu.fit(1.5);
  const initial = snapshot(menu.camera);
  menu.fit(1.5);
  assert.deepEqual(snapshot(menu.camera), initial);
  for (const localPoint of gatePoints) {
    const projected = localPoint.clone().applyAxisAngle(up, config.yaw).add(new Vector3(-50, 3, 80)).project(menu.camera);
    assert.ok(Math.abs(projected.x) < .85 && Math.abs(projected.y) < .85);
  }
  for (const aspect of [0, -1, NaN, Infinity, undefined, 1e-20, 1e20]) {
    menu.fit(aspect);
    assert.ok([...menu.camera.position.toArray(), ...menu.camera.quaternion.toArray(), ...menu.camera.projectionMatrix.toArray()].every(Number.isFinite));
  }
});

test('handoff starts at menu pose, eases toward live chase, and ends exactly at 0.65 seconds without changing either camera', () => {
  const menu = new GateMenuCamera().fit(1.4), chase = chaseCamera(), handoff = new CameraHandoff();
  const sourceBefore = snapshot(menu), chaseBefore = snapshot(chase);
  const first = handoff.begin(menu, chase);
  assert.notEqual(first, chase);
  assert.equal(handoff.active, true);
  assert.deepEqual(first.position.toArray(), menu.position.toArray());
  assert.deepEqual(first.quaternion.toArray(), menu.quaternion.toArray());
  assert.equal(first.aspect, chase.aspect, 'the bridge renders into the gameplay viewport');
  const middle = handoff.update(.325, chase);
  assert.ok(middle.position.distanceTo(menu.position.clone().lerp(chase.position, .5)) < 1e-9);
  assert.ok(Math.abs(middle.quaternion.angleTo(menu.quaternion.clone().slerp(chase.quaternion, .5))) < 1e-7);
  assert.equal(middle.fov, 52.5);
  assert.deepEqual(snapshot(chase), chaseBefore);
  assert.deepEqual(snapshot(menu), sourceBefore);
  chase.position.x += 4;
  chase.updateMatrixWorld(true);
  const movedChase = snapshot(chase);
  assert.equal(handoff.update(.325, chase), chase);
  assert.equal(handoff.active, false);
  assert.deepEqual(handoff.camera.position.toArray(), chase.position.toArray());
  assert.deepEqual(snapshot(chase), movedChase);
  assert.equal(handoff.update(.1, chase), chase);
});

test('handoff snapshots its source, handles invalid time, and can snap or cancel without changing chase', () => {
  const menu = new GateMenuCamera().camera, chase = chaseCamera(), handoff = new CameraHandoff();
  const chaseBefore = snapshot(chase), sourcePosition = menu.position.clone();
  handoff.begin(menu, chase);
  menu.position.set(100, 100, 100);
  for (const dt of [NaN, Infinity, -2, undefined]) {
    const camera = handoff.update(dt, chase);
    assert.deepEqual(camera.position.toArray(), sourcePosition.toArray());
    assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
  }
  handoff.cancel();
  assert.equal(handoff.active, false);
  assert.equal(handoff.update(.1, chase), chase);
  assert.equal(handoff.begin(menu, chase, { reducedMotion: true }), chase);
  assert.equal(handoff.active, false);
  assert.equal(new CameraHandoff(0).begin(menu, chase), chase);
  handoff.begin(menu, chase);
  assert.equal(handoff.update(10, chase), chase, 'a delayed frame completes without overshooting');
  assert.deepEqual(snapshot(chase), chaseBefore);
});
