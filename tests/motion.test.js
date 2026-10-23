import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerController } from '../src/player/controller.js';

function setup() {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial(), geometry = new THREE.BoxGeometry(100, .2, 100);
  const ground = new THREE.Mesh(geometry, material); ground.position.y = -.1; group.add(ground); group.updateMatrixWorld(true);
  const player = new PlayerController({ collisionGroup: group, mapData: { spawn: { x: 0, z: 0, y: 0, yaw: 0 } } });
  for (let i = 0; i < 20; i++) player.update(1 / 60);
  return { player, dispose() { player.dispose(); geometry.dispose(); material.dispose(); } };
}
const frames = (p, count, input = {}) => { for (let i = 0; i < count; i++) { p.update(1 / 60, input); p.animate(1 / 60); } };

test('student exposes idle, walk, run, jump and landing states without changing jump gravity', () => {
  const s = setup(), p = s.player; assert.equal(p.state.motionState, 'idle');
  frames(p, 60, { forward: true }); assert.equal(p.state.motionState, 'walk');
  frames(p, 60, { forward: true, sprint: true }); assert.equal(p.state.motionState, 'run');
  frames(p, 60); p.update(1 / 60, { jump: true }); assert.equal(p.state.motionState, 'jump');
  let landed = false;
  for (let i = 0; i < 90; i++) { p.update(1 / 60); p.animate(1 / 60); if (p.grounded) { assert.equal(p.state.motionState, 'land'); landed = true; break; } }
  assert.ok(landed); frames(p, 30); assert.equal(p.state.motionState, 'idle'); s.dispose();
});

test('student acceleration and softer deceleration are bounded and never overshoot zero', () => {
  const s = setup(), p = s.player; p.update(1 / 60, { forward: true }); assert.ok(p.speed > 0 && p.speed < .34);
  frames(p, 60, { forward: true }); const before = p.speed; p.update(1 / 60);
  assert.ok(p.speed < before && before - p.speed <= 14 / 60 + 1e-6); frames(p, 60); assert.equal(p.speed, 0); s.dispose();
});

test('turning/running animates a subtle bounded lean and reset restores the spawn independently of teleport', () => {
  const s = setup(), p = s.player; frames(p, 60, { forward: true, sprint: true }); frames(p, 12, { right: true, sprint: true });
  assert.ok(Math.abs(p.rig.body.rotation.z) > .01 && Math.abs(p.rig.body.rotation.z) <= .13); assert.ok(p.rig.body.rotation.x < 0);
  p.teleport({ x: 15, y: 0, z: 15 }, 1); p.reset(); assert.deepEqual(p.position.toArray(), [0, 0, 0]); s.dispose();
});
