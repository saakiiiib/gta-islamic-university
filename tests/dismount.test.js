import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { PlayerController } from '../src/player/controller.js';

function world(walls = []) {
  const group = new Group(), material = new MeshBasicMaterial();
  const floor = new Mesh(new BoxGeometry(80, .2, 80), material);
  floor.position.y = -.1; group.add(floor);
  for (const { size, center } of walls) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(...center); group.add(mesh);
  }
  return group;
}
function player(walls) {
  return new PlayerController({ collisionGroup: world(walls), mapData: {
    spawn: { x: -10, y: 0, z: 0, yaw: 0 },
    bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
  } });
}
function van(x = 0, z = 0, speed = 0, yaw = 0) {
  return { position: { x, y: 0, z }, yaw, speed, config: { halfWidth: .82 },
    distanceFrom(px, pz) { return Math.hypot(Math.max(0, Math.abs(px - this.position.x) - .82),
      Math.max(0, -(pz - this.position.z) - 1.7, (pz - this.position.z) - 1.82)); } };
}
function simulate(p, seconds, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    p.update(1 / fps);
    p.animate(1 / fps);
  }
}
function exit(p, source, speed = 0) {
  const position = { x: source.position.x, y: .83, z: source.position.z + .9 };
  const velocity = { x: -Math.sin(source.yaw) * speed, z: -Math.cos(source.yaw) * speed };
  p.setVanObstacles([source], { ignore: source });
  p.beginDismount({ position, yaw: source.yaw, velocity, side: { x: 1, z: 0 }, speed, van: source });
  return position;
}

test('launch starts at the visible passenger sole and preserves van momentum in air', () => {
  const p = player(), source = van(0, 0, 8);
  p.rig.body.rotation.x = .075;
  p.rig.legs[0].rotation.x = 1.47;
  const root = exit(p, source, 8);
  assert.deepEqual(p.position.toArray(), [root.x, root.y, root.z]);
  assert.equal(p.rig.pose.l0, 1.47);
  assert.equal(p.state.motionState, 'jumpOff');
  assert.ok(Math.abs(p.velocity.x - 3.3) < 1e-9);
  assert.ok(Math.abs(p.velocity.z + 8) < 1e-9);
  assert.ok(Math.abs(p.velocity.y - 3.8) < 1e-9);
  simulate(p, .1);
  assert.ok(p.position.z < .15, `retained forward motion: ${p.position.z}`);
  assert.ok(p.position.x > .25, `outward jump: ${p.position.x}`);
  assert.ok(p.position.y > root.y);
  assert.ok(p.dismount?.ignoreSource);
});

test('low and high speed exits land on real floor with speed-scaled nonlethal injury', () => {
  const low = player(), high = player();
  exit(low, van(), 0); exit(high, van(0, 0, 8), 8);
  simulate(low, 2); simulate(high, 2);
  assert.ok(low.grounded && high.grounded);
  assert.ok(Math.abs(low.position.y) < .01 && Math.abs(high.position.y) < .01);
  assert.equal(low.health, 100);
  assert.ok(high.health < 95 && high.health >= 25, `health=${high.health}`);
  assert.ok(high.injury.lastDamage > 0);
  assert.equal(high.injury.lastCause, 'dismount');
  high.reset();
  assert.equal(high.health, 100);
  assert.equal(high.dismount, null);
});

test('dismount hits a static wall instead of crossing it or finding a safe exit', () => {
  const p = player([{ size: [.2, 4, 12], center: [1.5, 2, 0] }]);
  exit(p, van(), 0);
  simulate(p, 1);
  assert.ok(p.position.x <= 1.081, `wall penetration: ${p.position.x}`);
  assert.ok(p.position.x > .4);
});

test('live van collision uses its latest transform and protects the dismounted player', () => {
  const p = player(), source = van(), other = van(7, .9);
  p.setVanObstacles([source, other]);
  other.position.x = 2.3;
  const root = { x: 0, y: .83, z: .9 };
  p.beginDismount({ position: root, yaw: 0, velocity: { x: 0, z: 0 }, side: { x: 1, z: 0 }, speed: 0, van: source });
  simulate(p, 1.3);
  assert.ok(p.position.x < 2.3, `passed through moving van: ${p.position.x}`);
  assert.ok(p.position.y >= -.001);
  assert.ok(p.dismount === null || !p.dismount.ignoreSource);
});

test('a moving driver van resolves a standing player onto its current deck', () => {
  const p = player(), driver = van(4, 0, 3);
  p.teleport({ x: 1, y: 0, z: .9 }, 0);
  p.setVanObstacles([driver]);
  driver.position.x = 1.5;
  p.update(1 / 60);
  assert.ok(Math.abs(p.position.y - .88) < .001, `driver proxy did not separate capsule: ${p.position.toArray()}`);
  assert.equal(p.grounded, true);
});

test('a hard landing progresses from fall to recovery without respawning', () => {
  const p = player(), source = van(0, 0, 8);
  exit(p, source, 8);
  let reachedFloor = false;
  for (let i = 0; i < 90; i++) {
    p.update(1 / 60); p.animate(1 / 60);
    if (p.state.motionState === 'fallen') { reachedFloor = true; break; }
  }
  assert.ok(reachedFloor);
  const landingX = p.position.x;
  assert.ok(landingX > 1);
  simulate(p, 1.2);
  assert.ok(p.state.motionState === 'recover' || p.dismount === null);
  assert.ok(p.position.x > landingX);
  assert.ok(p.health < 100);
});

test('fixed step dismount motion and animated phases remain finite at 30 and 60 Hz', () => {
  const a = player(), b = player();
  exit(a, van(0, 0, 5), 5); exit(b, van(0, 0, 5), 5);
  simulate(a, 1.5, 30); simulate(b, 1.5, 60);
  assert.ok(a.position.distanceTo(b.position) < 1e-7);
  assert.ok(Math.abs(a.health - b.health) < 1e-7);
  for (const rig of [a.rig, b.rig]) for (const part of [rig.body, ...rig.arms, ...rig.legs, ...rig.knees]) {
    assert.ok(Number.isFinite(part.rotation.x) && Number.isFinite(part.rotation.z));
  }
});

test('a fallen passenger cannot start running or jumping before getting up', () => {
  const p = player(); exit(p, van(0, 0, 8), 8);
  for (let i = 0; i < 90 && p.state.motionState !== 'fallen'; i++) p.update(1 / 60);
  assert.equal(p.state.motionState, 'fallen');
  for (let i = 0; i < 45; i++) p.update(1 / 60, { forward: true, sprint: true, jump: true });
  assert.ok(p.grounded); assert.ok(p.speed < .1); assert.equal(p.state.motionState, 'fallen'); p.dispose();
});
