import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CampusQueries, localToWorld, rectangleFootprint } from '../src/navigation/campusQueries.js';
import { createElectricVanModel } from '../src/vehicle/model.js';
import { ElectricVan, VAN_CONFIG } from '../src/vehicle/controller.js';
import { VehicleSession } from '../src/vehicle/session.js';
import { TravelCamera } from '../src/vehicle/camera.js';
import { PlayerController, InputController } from '../src/player/index.js';
import { bufferPaths } from '../src/map/index.js';

const square = (x, z, width, depth = width) => [[[[x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z]]]];
const bounds = { minX: -80, maxX: 80, minZ: -80, maxZ: 80 };
const queries = extra => new CampusQueries({ bounds, ...extra });
function van(q = queries(), spawn = { x: 0, z: 0, yaw: 0 }) { const v = new ElectricVan({ queries: q, spawn }); v.occupied = true; return v; }
const simulate = (v, seconds, controls, fps = 60) => { for (let i = 0; i < Math.round(seconds * fps); i++) v.update(1 / fps, controls); };

test('electric cargo model has exactly one front/two rear wheels and compact reference-style proportions', () => {
  const model = createElectricVanModel(), box = new THREE.Box3().setFromObject(model.group), size = box.getSize(new THREE.Vector3());
  assert.equal(model.wheels.length, 3); assert.equal(model.rearWheels.length, 2); assert.equal(model.frontWheel.parent, model.steering);
  assert.ok(model.rearWheels.every(w => w.parent === model.group));
  assert.ok(size.x <= 1.64 && size.z <= 3.6 && size.y <= 1.65);
  assert.ok(box.min.z >= -VAN_CONFIG.front && box.max.z <= VAN_CONFIG.rear, 'physics encloses the front tire and bed');
  let meshes = 0, triangles = 0;
  model.group.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.attributes.position.count / 3; assert.ok(o.geometry.attributes.color); } });
  assert.equal(meshes, 5); assert.ok(triangles < 6000);
  assert.ok(model.body.children[0].name.includes('Open') || model.body.children[0].name.includes('openSlat'));
  model.dispose();
});

test('van accelerates progressively, has a bounded low top speed, coasts and brakes to a stop', () => {
  const v = van(); simulate(v, .5, { forward: true }); assert.ok(v.speed > 1 && v.speed < 1.5);
  simulate(v, 3, { forward: true }); assert.ok(v.speed <= 8 && v.speed > 7);
  const before = v.position.z; simulate(v, .5, {}); assert.ok(v.position.z < before && v.speed > 5 && v.speed < 8);
  simulate(v, 2, { forward: true, brake: true }); assert.equal(v.speed, 0); v.dispose();
});

test('S brakes forward momentum before reversing and reverse speed stays bounded', () => {
  const v = van(); simulate(v, 1, { forward: true }); const start = v.speed;
  v.update(1 / 60, { back: true }); assert.ok(v.speed > 0 && v.speed < start);
  simulate(v, 2.5, { back: true }); assert.ok(v.speed < -1 && v.speed >= -2.5);
  const z = v.position.z; simulate(v, .2, { back: true }); assert.ok(v.position.z > z); v.dispose();
});

test('steering is rate-limited, stationary steering does not spin the van, and reverse turns correctly', () => {
  const v = van(); v.update(1 / 60, { left: true }); assert.ok(v.steering > 0 && v.steering < .04); assert.equal(v.yaw, 0);
  simulate(v, 1.5, { left: true, forward: true }); assert.ok(v.yaw > .1);
  v.reset({ x: 0, z: 0, yaw: 0 }); v.occupied = true; simulate(v, 1.5, { left: true, back: true }); assert.ok(v.yaw < -.05);
  v.syncVisuals(.1); assert.ok(Math.abs(v.model.body.rotation.z) <= .075 && Math.abs(v.model.body.rotation.x) <= .19);
  assert.notEqual(v.model.frontWheel.rotation.x, 0); assert.equal(v.model.steering.rotation.y, v.steering); v.dispose();
});

test('vehicle integration agrees at 30/60 Hz and caps a long elapsed frame', () => {
  const a = van(), b = van(); simulate(a, 2, { forward: true, right: true }, 30); simulate(b, 2, { forward: true, right: true }, 60);
  assert.ok(a.position.distanceTo(b.position) < 1e-8); assert.ok(Math.abs(a.yaw - b.yaw) < 1e-8);
  const before = a.position.clone(); a.update(10, { forward: true }); assert.ok(a.position.distanceTo(before) < .85); a.dispose(); b.dispose();
});

test('full van footprint stops at a thin wall, including reverse travel and swept turning corners', () => {
  for (const reverse of [false, true]) {
    const q = queries({ buildings: [{ polygons: square(-20, -.05, 40, .1) }] });
    const v = van(q, { x: 0, z: 5, yaw: reverse ? Math.PI : 0 }); v.speed = reverse ? -8 : 8;
    let hit = false;
    for (let i = 0; i < 120; i++) { v.update(1 / 60, reverse ? { back: true } : { forward: true }); hit ||= v.hitObstacle; assert.ok(q.rectangleClear(v.position, v.yaw, v.config)); }
    assert.ok(hit); assert.ok(v.position.z >= (reverse ? v.config.rear : v.config.front) + .085 - 1e-6); v.dispose();
  }
  const q = queries({ buildings: [{ polygons: square(2, -8, 1, 16) }] }), v = van(q, { x: 0, z: 0, yaw: 0 });
  for (let i = 0; i < 300; i++) { v.update(1 / 60, { forward: true, right: true }); assert.ok(q.rectangleClear(v.position, v.yaw, v.config)); }
  v.dispose();
});

test('water blocks the complete cart while the correctly aligned mapped bridge remains traversable', () => {
  const bridge = { width: 2.2, paths: [[[0, 16], [0, -16]]], polygons: bufferPaths([[[0, 16], [0, -16]]], 2.2), elevation: .45, rampLength: 4 };
  const q = queries({ water: [{ polygons: square(-12, -12, 24) }], bridges: [bridge] });
  const crossing = van(q, { x: 0, z: 18, yaw: 0 }); let height = 0;
  for (let i = 0; i < 390; i++) { crossing.update(1 / 60, { forward: true }); crossing.syncVisuals(1 / 60); height = Math.max(height, crossing.position.y); }
  assert.ok(crossing.position.z < -17, `crossed to ${crossing.position.z}`); assert.ok(height > .44);
  const blocked = van(q, { x: 3, z: 18, yaw: 0 }); simulate(blocked, 5, { forward: true }); assert.ok(blocked.position.z >= 13.7);
  assert.ok(q.rectangleClear(blocked.position, blocked.yaw, blocked.config)); crossing.dispose(); blocked.dispose();
});

test('vehicle bounds include rear corners and courtyard holes remain valid space', () => {
  const building = square(-10, -10, 20); building[0].push(square(-4, -4, 8)[0][0]);
  const q = queries({ buildings: [{ polygons: building }] }); assert.ok(q.rectangleClear({ x: 0, z: 0 }, .7, VAN_CONFIG));
  assert.equal(q.rectangleClear({ x: 3, z: 0 }, .7, VAN_CONFIG), false);
  assert.equal(queries().rectangleClear({ x: 79, z: 0 }, Math.PI / 2, VAN_CONFIG), false);
});

function walkingSession(extra = {}) {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(160, .2, 160), material); ground.position.y = -.1; group.add(ground); group.updateMatrixWorld(true);
  const q = queries(extra), v = van(q), player = new PlayerController({ collisionGroup: group, mapData: { bounds, spawn: { x: -1.6, y: 0, z: -.4, yaw: 0 } } });
  v.occupied = false; const session = new VehicleSession(player, v, q);
  for (let i = 0; i < 10; i++) player.update(1 / 60);
  return { player, v, session, dispose() { player.dispose(); v.dispose(); ground.geometry.dispose(); material.dispose(); } };
}

test('E entry requires proximity and moving exit keeps the student at the passenger position', () => {
  const s = walkingSession(); assert.ok(s.session.canEnter());
  assert.equal(s.session.interact().changed, true); assert.ok(s.session.driving && s.v.occupied); assert.equal(s.player.group.visible, true);
  s.v.speed = 2; assert.equal(s.session.interact().changed, true); assert.equal(s.player.group.visible, true); assert.equal(s.v.occupied, false);
  assert.ok(Math.abs(s.player.position.x) < 1e-6 && Math.abs(s.player.position.z - .9) < 1e-6, 'starts at the actual seat rather than a selected safe ground location');
  assert.equal(s.player.state.motionState, 'jumpOff'); assert.equal(s.v.speed, 2);
  for (let i = 0; i < 90; i++) s.player.update(1 / 60);
  assert.ok(s.v.distanceFrom(s.player.position.x, s.player.position.z) > s.player.config.radius);
  s.player.teleport({ x: -15, y: 0, z: 0 }); assert.equal(s.session.canEnter(), false); s.dispose();
});

test('a blocked launch direction cannot prevent E dismounting at the real seat', () => {
  const s = walkingSession(); s.session.interact();
  const original = s.session.queries.discClear;
  s.session.queries.discClear = () => false;
  assert.equal(s.session.interact().changed, true); assert.equal(s.session.driving, false);
  assert.ok(Math.abs(s.player.position.x) < 1e-6 && Math.abs(s.player.position.z - .9) < 1e-6);
  s.session.queries.discClear = original; s.dispose();
});

test('parked van is a solid dynamic obstacle for the walking student', () => {
  const s = walkingSession();
  for (let i = 0; i < 120; i++) s.player.update(1 / 60, { right: true }, 0);
  assert.ok(s.player.position.x < -.53, `student x ${s.player.position.x}`); s.dispose();
});

test('vehicle camera transitions smoothly between modes and remains obstructed by walls', () => {
  const group = new THREE.Group(), wall = new THREE.Mesh(new THREE.BoxGeometry(30, 8, .2), new THREE.MeshBasicMaterial()); wall.position.set(0, 4, 5); group.add(wall); group.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(60, 1.6, .08, 2200), rig = new TravelCamera(camera, group);
  rig.reset({ x: 0, y: 0, z: 0, yaw: 0 }); const before = camera.position.clone();
  rig.setDriving(true); rig.updateTravel(1 / 60, { position: new THREE.Vector3(), yaw: .5, speed: 3 });
  assert.ok(camera.position.distanceTo(before) < .3); assert.ok(camera.position.z < 4.7);
  for (let i = 0; i < 120; i++) rig.updateTravel(1 / 60, { position: new THREE.Vector3(), yaw: 0, speed: 3 });
  assert.ok(rig.target.y < 1.1 && rig.target.y > 1.05); assert.equal(rig.followRate, 9);
  assert.ok(camera.position.z < 4.7); rig.setDriving(false); const vehicleDistance = rig.distance;
  rig.updateTravel(1 / 60, { position: new THREE.Vector3(), yaw: 0, speed: 0 }); assert.ok(rig.distance < vehicleDistance && rig.distance > 6);
  wall.geometry.dispose(); wall.material.dispose();
});

test('entry cannot reach through a thin wall or across a strip of water', () => {
  for (const type of ['buildings', 'water']) {
    const s = walkingSession({ [type]: [{ polygons: square(-1.2, -2, .1, 4) }] });
    assert.equal(s.session.canEnter(), false); assert.equal(s.session.interact().changed, false); s.dispose();
  }
});

test('jump-off chooses an unobstructed impulse direction without relocating the player', () => {
  const s = walkingSession(); s.session.interact();
  s.session.queries = queries({ buildings: [{ polygons: square(-1.05, -4, .05, 8) }] });
  assert.ok(s.session.queries.discClear(-1.5, -.4, .44), 'endpoint alone looks clear');
  const result = s.session.interact(); assert.equal(result.changed, true);
  assert.ok(s.player.velocity.x > 0, 'launch toward the unobstructed side');
  assert.ok(Math.abs(s.player.position.x) < 1e-6, 'do not move immediately to that side'); s.dispose();
});

test('a turning van cannot sweep its corners through a nearby pedestrian', () => {
  const v = van(), pedestrian = { position: new THREE.Vector3(1.5, 0, -1.2) };
  for (let i = 0; i < 240; i++) {
    v.update(1 / 60, { forward: true, right: true }, { pedestrians: [pedestrian] });
    assert.ok(v.distanceFrom(pedestrian.position.x, pedestrian.position.z) >= .36 - 1e-6);
  }
  v.dispose();
});

test('E is one-shot, Space brake is held, and pause/focus clear both interaction and braking', () => {
  const win = new EventTarget(), doc = new EventTarget(), canvas = new EventTarget(); doc.defaultView = win; canvas.ownerDocument = doc;
  const input = new InputController(canvas); input.setEnabled(true);
  const key = (code, repeat = false, type = 'keydown') => { const e = new Event(type, { cancelable: true }); Object.defineProperties(e, { code: { value: code }, repeat: { value: repeat } }); win.dispatchEvent(e); };
  key('KeyE'); assert.equal(input.snapshot().interact, true); key('KeyE', true); assert.equal(input.snapshot().interact, false);
  key('Space'); assert.equal(input.snapshot().brake, true); assert.equal(input.snapshot().brake, true);
  input.setEnabled(false); assert.equal(input.snapshot().brake, false); assert.equal(input.snapshot().interact, false);
  input.setEnabled(true); key('KeyE', true); assert.equal(input.snapshot().interact, false);
  key('KeyE', false, 'keyup'); key('KeyE'); win.dispatchEvent(new Event('blur')); assert.equal(input.snapshot().interact, false); input.dispose();
});
