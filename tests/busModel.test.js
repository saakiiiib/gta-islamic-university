import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoubleDeckerBusModel, DoubleDeckerBus, BUS_CONFIG } from '../src/vehicle/busModel.js';

test('DoubleDeckerBus model creates dual-deck geometry with 6 heavy-duty wheels', () => {
  const model = createDoubleDeckerBusModel();
  assert.ok(model.group.isGroup);
  assert.equal(model.group.name, 'islamic-university-red-bus');
  assert.equal(model.wheels.length, 6);
  assert.equal(model.rearWheels.length, 4);
  model.dispose();
  assert.equal(model.group.children.length, 0);
});

test('DoubleDeckerBus controller drives, steers, brakes, and responds to collisions', () => {
  const bus = new DoubleDeckerBus({
    spawn: { x: 271.0, y: 0.0, z: -45.0, yaw: -0.45 },
  });

  assert.equal(bus.isBus, true);
  assert.equal(bus.durability, 150);
  assert.equal(bus.disabled, false);
  assert.equal(bus.position.x, 271.0);
  assert.equal(bus.position.z, -45.0);

  // Accelerate forward
  bus.occupied = true;
  for (let i = 0; i < 60; i++) {
    bus.update(1 / 60, { forward: true });
  }
  assert.ok(bus.speed > 0);

  // Steer left while driving
  for (let i = 0; i < 30; i++) {
    bus.update(1 / 60, { forward: true, left: true });
  }
  assert.ok(bus.steering > 0);

  // Brake to halt
  for (let i = 0; i < 60; i++) {
    bus.update(1 / 60, { brake: true });
  }
  assert.equal(bus.speed, 0);

  // Damage response
  bus.applyDamage(50, { speed: 8 });
  assert.equal(bus.durability, 100);
  assert.equal(bus.disabled, false);

  bus.applyDamage(100, { speed: 10 });
  assert.equal(bus.durability, 0);
  assert.equal(bus.disabled, true);

  // Parked collider
  const collider = bus.createParkedCollider();
  assert.ok(collider.isGroup);
  assert.ok(collider.children.length > 0);

  bus.dispose();
});
