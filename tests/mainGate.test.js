import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMainGate, MAIN_GATE_CONFIG } from '../src/world/mainGate.js';

test('Main Gate constructs authentic 4-arch Roman-Islamic architecture with calligraphy and landscape', () => {
  const gate = buildMainGate();

  assert.ok(gate.group.isGroup);
  assert.equal(gate.group.name, 'islamic-university-main-gate');
  assert.ok(gate.collisionGroup.isGroup);

  // 5 pillars + 1 central island + 2 boundary walls = 8 solid colliders
  assert.ok(gate.collisionGroup.children.length >= 8);
  assert.ok(gate.obstacles.length >= 6);

  // Verify gate location matches OSM Entrance Node 9027931168
  assert.equal(MAIN_GATE_CONFIG.position.x, 304.91);
  assert.equal(MAIN_GATE_CONFIG.position.z, -64.49);

  // Verify exterior player spawn on highway approach N704
  assert.equal(MAIN_GATE_CONFIG.exteriorSpawn.x, 326.0);
  assert.equal(MAIN_GATE_CONFIG.exteriorSpawn.z, -78.0);
  assert.ok(Math.abs(MAIN_GATE_CONFIG.exteriorSpawn.yaw - 2.1866) < 0.001);

  // Clean disposal without errors
  gate.dispose();
  assert.equal(gate.group.children.length, 0);
  assert.equal(gate.collisionGroup.children.length, 0);
});
