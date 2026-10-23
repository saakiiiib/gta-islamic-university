import test from 'node:test';
import assert from 'node:assert/strict';
import { mapToMinimap, nearestPlace } from '../src/ui/minimap.js';
test('minimap preserves north-up orientation and metre scale', () => {
  const center = { x: 80, z: -30 };
  assert.deepEqual(mapToMinimap([80, -30], center, 256, 256), { x: 128, y: 128 });
  assert.deepEqual(mapToMinimap([180, -30], center, 256, 256), { x: 228, y: 128 });
  assert.deepEqual(mapToMinimap([80, -130], center, 256, 256), { x: 128, y: 28 });
});
test('location uses source names with a reliable gate and campus fallback', () => {
  const data = { spawn: { x: 0, z: 0 }, buildings: [{name:'Auditorium',polygons:[[[[80,80],[90,80],[90,90],[80,90],[80,80]]]]}], greens: [], water: [] };
  assert.equal(nearestPlace({ x: 20, z: 10 }, data), 'Main Gate');
  assert.equal(nearestPlace({ x: 82, z: 86 }, data), 'Auditorium');
  assert.equal(nearestPlace({ x: 800, z: 860 }, data), 'Islamic University');
});
