import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStudent } from '../src/player/character.js';
import { createElectricVanModel } from '../src/vehicle/model.js';
import { VanOccupants } from '../src/vehicle/occupants.js';

function setup() {
  const vans = Array.from({ length: 8 }, (_, i) => {
    const model = createElectricVanModel();
    model.group.position.set(i * 4, i % 2 ? .4 : 0, -i * 3);
    model.group.rotation.y = i * .29;
    model.body.rotation.set((i - 3) * .022, 0, (i - 3) * .009);
    model.group.updateMatrixWorld(true);
    return { model, group: model.group, steering: (i - 3) * .07, disabled: i === 7 };
  });
  const rig = createStudent();
  const player = { rig, group: rig.group, position: new THREE.Vector3(91, 0, 37), capsule: { marker: 'unchanged' } };
  const occupants = new VanOccupants(vans, player);
  return { vans, player, occupants, dispose() { occupants.dispose(); vans.forEach(v => v.model.dispose()); } };
}

test('all eight vans retain visible drivers in three instanced primitive batches', () => {
  const s = setup();
  assert.equal(s.occupants.drivers.length, 8);
  assert.equal(s.occupants.group.children.length, 3);
  assert.deepEqual(Object.keys(s.occupants.batches), ['box', 'head', 'hair']);
  for (const rig of s.occupants.drivers) {
    const hip = rig.body.localToWorld(new THREE.Vector3(0, .77, 0));
    assert.ok(hip.distanceTo(new THREE.Vector3(0, 1.44, -.43)) < 1e-8, 'driver hip rests on the saddle');
    rig.arms.forEach((arm, side) => {
      const hand = arm.children[2].getWorldPosition(new THREE.Vector3());
      const grip = new THREE.Vector3(side ? .38 : -.38, 1.53, -1.19);
      assert.ok(hand.distanceTo(grip) < .13, 'driver hand reaches its handlebar grip');
    });
  }
  for (const [type, batch] of Object.entries(s.occupants.batches)) {
    assert.ok(batch.isInstancedMesh && batch.visible);
    assert.equal(batch.count, s.occupants.slots[type].length);
    assert.equal(s.occupants.slots[type].filter(slot => slot.driver === 7).length, batch.count / 8, 'disabled van still has a driver');
  }
  for (const van of s.vans) van.disabled = true;
  s.occupants.update(1 / 60, { driving: false });
  for (const batch of Object.values(s.occupants.batches)) {
    assert.ok(batch.visible);
    for (const value of batch.instanceMatrix.array) assert.ok(Number.isFinite(value));
  }
  s.dispose();
});

test('the original player rig stays visible on the rear deck of each tilted, rotated van', () => {
  const s = setup(), originalGroup = s.player.group, originalCapsule = s.player.capsule;
  for (const van of s.vans) {
    originalGroup.visible = false; // VehicleSession may have just processed an entry.
    s.occupants.update(1 / 60, { driving: true, van });
    assert.equal(s.player.group, originalGroup);
    assert.equal(s.player.group.visible, true);
    const body = van.model.body;
    const local = body.worldToLocal(s.player.group.position.clone());
    assert.ok(local.distanceTo(new THREE.Vector3(0, .065, .9)) < 1e-8);
    assert.ok(local.z > .25 && local.z < 1.55, 'student remains behind the driver on the deck');
    const orientation = body.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(1 - Math.abs(orientation.dot(s.player.group.quaternion)) < 1e-10);
    assert.ok(s.player.rig.legs.every(leg => leg.rotation.x > 1.4), 'feet extend along the deck');
    s.player.group.updateMatrixWorld(true);
    const hip = body.worldToLocal(s.player.rig.body.localToWorld(new THREE.Vector3(0, .77, 0)));
    assert.ok(hip.distanceTo(new THREE.Vector3(0, .835, .9)) < 1e-8, 'student hip rests on the deck');
    s.player.rig.knees.forEach(knee => {
      const shoe = body.worldToLocal(knee.children[1].getWorldPosition(new THREE.Vector3()));
      assert.ok(Math.abs(shoe.x) < .7 && shoe.z > .1 && shoe.z < 1.74, 'shoe stays over the slatted deck');
    });
    assert.deepEqual(s.player.position.toArray(), [91, 0, 37], 'physics position is unchanged');
    assert.equal(s.player.capsule, originalCapsule);
  }
  s.player.group.position.set(3, 1, 4);
  s.occupants.update(1 / 60, { driving: false });
  assert.deepEqual(s.player.group.position.toArray(), [3, 1, 4], 'on-foot location belongs to the player controller');
  assert.equal(s.player.rig.legs[0].rotation.x, 0);
  assert.equal(s.player.rig.pose, null);
  s.dispose();
});

test('driver batches move with van body pitch, roll, yaw and steering while remaining finite', () => {
  const s = setup();
  const first = s.occupants.batches.head.getMatrixAt(0, new THREE.Matrix4()).clone();
  const van = s.vans[0];
  van.group.position.set(15, 2, -9);
  van.group.rotation.y = 1.3;
  van.model.body.rotation.set(.17, 0, -.07);
  van.steering = .45;
  s.occupants.update(1 / 60, { driving: false });
  const moved = s.occupants.batches.head.getMatrixAt(0, new THREE.Matrix4());
  assert.ok(!first.equals(moved));
  for (const batch of Object.values(s.occupants.batches)) {
    for (const value of batch.instanceMatrix.array) assert.ok(Number.isFinite(value));
  }
  const geometries = Object.values(s.occupants.batches).map(batch => batch.geometry);
  let disposed = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposed++));
  s.dispose();
  assert.equal(disposed, 3);
  assert.equal(s.occupants.group.children.length, 0);
});
