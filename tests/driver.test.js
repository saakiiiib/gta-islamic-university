import test from 'node:test';
import assert from 'node:assert/strict';
import { bufferPaths } from '../src/map/index.js';
import { CampusQueries, rectangleFootprint } from '../src/navigation/campusQueries.js';
import { ElectricVan } from '../src/vehicle/controller.js';
import { DriverContinuation } from '../src/vehicle/driver.js';
import { vansOverlap } from '../src/vehicle/contacts.js';

const bounds = { minX: -50, maxX: 160, minZ: -80, maxZ: 160 };
function road(path, width = 8, kind = 'service') { return { kind, width, paths: [path], polygons: bufferPaths([path], width, bounds) }; }
function scene(roads, spawns) {
  const map = { bounds, roads }, queries = new CampusQueries(map);
  const vans = spawns.map((spawn, id) => { const van = new ElectricVan({ queries, spawn }); van.id = id; return van; });
  const driver = new DriverContinuation(map, queries, vans);
  return { map, queries, vans, driver, dispose() { driver.dispose(); for (const van of vans) van.dispose(); } };
}
function run(scene, seconds, callback = () => {}) {
  for (let i = 0; i < seconds * 60; i++) {
    scene.driver.update(1 / 60);
    callback(i);
  }
}

test('only a departed van resumes its existing momentum; all original parked vans remain', () => {
  const s = scene([road([[0, 150], [0, -60]], 10)], Array.from({ length: 8 }, (_, i) => ({ x: 0, z: 130 - i * 20, yaw: 0 })));
  const originalVans = [...s.vans], parked = s.vans.slice(1).map(v => v.position.clone());
  const van = s.vans[0]; van.occupied = true; van.speed = 2.4; van.steering = .04;
  const start = van.position.clone();
  assert.equal(s.driver.depart(van), true);
  assert.equal(van.occupied, false); assert.equal(van.autonomous, true);
  s.driver.update(1 / 60);
  assert.ok(van.position.distanceTo(start) > .02 && van.position.distanceTo(start) < .08, 'first step keeps forward momentum');
  assert.ok(van.speed > 2 && van.steering !== 0);
  run(s, 2);
  assert.ok(van.position.z < start.z - 3);
  assert.deepEqual(s.vans, originalVans);
  s.vans.slice(1).forEach((v, i) => assert.ok(v.position.equals(parked[i])));
  s.dispose();
});

test('the driver follows connected source bends, keeps its footprint on pavement, and parks at the end', () => {
  const s = scene([road([[0, 60], [0, 0], [35, 0]], 12)], [{ x: 0, z: 26, yaw: 0 }]);
  const van = s.vans[0]; van.speed = 2.2; s.driver.depart(van);
  let minZ = Infinity, maxX = -Infinity;
  run(s, 32, () => {
    minZ = Math.min(minZ, van.position.z); maxX = Math.max(maxX, van.position.x);
    assert.ok(s.queries.rectangleClear(van.position, van.yaw, van.config));
    assert.ok(rectangleFootprint(van.position, van.yaw, van.config).every(([x, z]) => s.queries.onRoad(x, z)));
  });
  assert.ok(minZ < 5, `reached bend: ${minZ}`);
  assert.ok(maxX > 8, `followed connected eastbound source path: ${maxX}`);
  assert.ok(!s.driver.isActive(van) && van.speed === 0, 'parks at route end');
  assert.ok(van.position.x < 35, 'does not travel past source road');
  s.dispose();
});

test('a parked van blocks a departing one without footprint overlap', () => {
  const s = scene([road([[0, 70], [0, -60]], 10)], [{ x: 0, z: 35, yaw: 0 }, { x: 0, z: 20, yaw: 0 }]);
  const moving = s.vans[0], parked = s.vans[1], parkedStart = parked.position.clone();
  moving.speed = 3; s.driver.depart(moving);
  run(s, 9, () => assert.equal(vansOverlap(moving.position, moving.yaw, moving.config, parked), false));
  assert.ok(moving.position.z > parked.position.z + 3.4);
  assert.equal(moving.speed, 0);
  assert.ok(parked.position.equals(parkedStart));
  s.dispose();
});

test('missing route parks, a wall causes waiting, and reset releases all original vans', () => {
  const wall = { polygons: [[[[ -8, 3 ], [8, 3], [8, 3.1], [-8, 3.1], [-8, 3 ]]]] };
  const s = scene([road([[0, 60], [0, -40]], 10)], [{ x: 0, z: 13, yaw: 0 }, { x: 40, z: 40, yaw: 0 }]);
  s.map.buildings = [wall];
  // A second query set includes the wall while preserving the same road geometry.
  s.queries = new CampusQueries(s.map);
  s.driver.queries = s.queries;
  s.vans.forEach(v => { v.queries = s.queries; });
  const originals = [...s.vans], first = s.vans[0], second = s.vans[1];
  first.speed = 3; second.speed = 2;
  s.driver.depart(first); s.driver.depart(second);
  run(s, 7, () => assert.ok(s.queries.rectangleClear(first.position, first.yaw, first.config)));
  assert.ok(first.position.z > 4.75);
  assert.equal(first.speed, 0);
  assert.equal(second.speed, 0);
  assert.equal(s.driver.isActive(second), false);
  s.driver.reset(); s.vans.forEach(v => v.reset());
  assert.deepEqual(s.vans, originals);
  assert.ok(s.vans.every(v => !v.autonomous && v.speed === 0 && v.position.x === v.spawn.x && v.position.z === v.spawn.z));
  s.dispose();
});

test('large elapsed frames are capped and cannot launch a departed van across the map', () => {
  const s = scene([road([[0, 80], [0, -60]], 10)], [{ x: 0, z: 40, yaw: 0 }]);
  const van = s.vans[0]; van.speed = 8; s.driver.depart(van);
  const before = van.position.clone(); s.driver.update(10);
  assert.ok(van.position.distanceTo(before) < .85);
  s.dispose();
});

test('the departing driver yields to the dismounted player and releases a reboarded van', () => {
  const s = scene([road([[0, 70], [0, -60]], 10)], [{ x: 0, z: 20, yaw: 0 }]);
  const van = s.vans[0]; van.speed = 2; s.driver.depart(van);
  const player = { position: { x: 0, y: 0, z: 11 }, config: { radius: .32 } };
  for (let i = 0; i < 600; i++) s.driver.update(1 / 60, { player });
  assert.ok(van.position.z > player.position.z + van.config.front + .32);
  assert.equal(van.speed, 0);
  assert.equal(s.driver.isActive(van), true, 'temporary obstruction keeps the driver ready to resume');
  const waiting = van.position.clone();
  for (let i = 0; i < 120; i++) s.driver.update(1 / 60);
  assert.ok(van.position.distanceTo(waiting) > .5, 'driver resumes after the player leaves the lane');
  s.driver.depart(van);
  van.occupied = true; van.autonomous = false;
  const position = van.position.clone();
  s.driver.update(1 / 60);
  assert.equal(s.driver.isActive(van), false);
  assert.ok(van.position.equals(position));
  s.dispose();
});
