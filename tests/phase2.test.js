import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { localToWorld } from '../src/navigation/campusQueries.js';
import { ElectricVan } from '../src/vehicle/controller.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8'))), world = buildWorld(map);
const create = () => new CampusSimulation(map, world.collisionGroup, { renderCrowd: false });
function approach(sim) {
  const [x, z] = localToWorld(-1.5, -.4, sim.van.position, sim.van.yaw);
  sim.player.teleport({ x, z, y: sim.queries.groundHeight(x, z) });
  for (let i = 0; i < 10; i++) sim.update(1 / 60);
  assert.ok(sim.session.canEnter());
}

test('real campus starts with eight safe parked electric vans and thirty separated students', () => {
  const sim = create(); assert.equal(sim.vans.length, 8); assert.equal(sim.van.group.name, 'electricCargoTricycle-1'); assert.equal(sim.crowd.agents.length, 30);
  assert.equal(sim.session.driving, false); assert.ok(sim.queries.rectangleClear(sim.van.position, sim.van.yaw, sim.van.config));
  assert.ok(sim.queries.onRoad(sim.van.position.x, sim.van.position.z));
  for (const a of sim.crowd.agents) { assert.ok(sim.vans.every(v => v.distanceFrom(a.position.x, a.position.z) > 2)); for (const b of sim.crowd.agents) if (a !== b) assert.ok(a.position.distanceTo(b.position) > 4); }
  sim.dispose();
});

test('real-campus enter, drive, reverse, brake and jump-off land on valid ground', () => {
  const sim = create(); approach(sim); assert.ok(sim.update(1 / 60, { interact: true }).changed);
  const origin = sim.van.position.clone(); for (let i = 0; i < 90; i++) sim.update(1 / 60, { forward: true }, sim.van.yaw);
  assert.ok(sim.van.position.distanceTo(origin) > 1); assert.equal(sim.player.group.visible, true);
  for (let i = 0; i < 90; i++) sim.update(1 / 60, { back: true }); assert.ok(sim.van.speed < 0);
  for (let i = 0; i < 60; i++) sim.update(1 / 60, { brake: true }); assert.equal(sim.van.speed, 0);
  assert.ok(sim.update(1 / 60, { interact: true }).changed); assert.equal(sim.player.group.visible, true);
  for (let i = 0; i < 90; i++) sim.update(1 / 60);
  assert.ok(sim.player.grounded); assert.ok(sim.driverController.isActive(sim.session.van) || !sim.session.van.autonomous);
  assert.ok(sim.queries.discClear(sim.player.position.x, sim.player.position.z, .32)); sim.dispose();
});

test('electric van crosses the actual bent lake footbridge without entering water', () => {
  const sim = create(), path = map.bridges.find(b => b.id === '1317423268').paths[0];
  const extend = (a, b, amount) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * amount / length, a[1] + (b[1] - a[1]) * amount / length];
  };
  const route = [extend(path[0], path[1], -4), ...path, extend(path.at(-1), path.at(-2), -4)];
  const van = new ElectricVan({ queries: sim.queries, spawn: { x: route[0][0], z: route[0][1], yaw: Math.atan2(path[0][0] - path[1][0], path[0][1] - path[1][1]) } });
  van.occupied = true;
  let target = 1, maximumHeight = 0;
  for (let i = 0; i < 2000; i++) {
    if (Math.hypot(route[target][0] - van.position.x, route[target][1] - van.position.z) < 2 && target < route.length - 1) target++;
    const goal = Math.atan2(van.position.x - route[target][0], van.position.z - route[target][1]);
    const error = Math.atan2(Math.sin(goal - van.yaw), Math.cos(goal - van.yaw));
    // Slow, ordinary forward/steering inputs follow the surveyed bridge centre line.
    van.update(1 / 60, { forward: van.speed < 1.5, left: error > .009, right: error < -.009 }); van.syncVisuals(1 / 60);
    maximumHeight = Math.max(maximumHeight, van.position.y);
    assert.equal(van.hitObstacle, false); assert.ok(sim.queries.rectangleClear(van.position, van.yaw, van.config));
    if (Math.hypot(route.at(-1)[0] - van.position.x, route.at(-1)[1] - van.position.z) < .7) break;
  }
  assert.ok(Math.hypot(route.at(-1)[0] - van.position.x, route.at(-1)[1] - van.position.z) < .7);
  assert.ok(maximumHeight > .44); van.dispose(); sim.dispose();
});

test('pause/inspection suspend every moving entity and resume without a catch-up step', () => {
  const sim = create(); approach(sim); sim.update(1 / 60, { interact: true });
  for (let i = 0; i < 60; i++) sim.update(1 / 60, { forward: true, left: true }); sim.animate(.016);
  const capture = () => ({ van: [sim.van.position.toArray(), sim.van.yaw, sim.van.speed, sim.van.wheelAngle, sim.van.model.body.rotation.toArray()], player: [sim.player.position.toArray(), sim.player.velocity.toArray(), sim.player.group.visible], crowd: sim.crowd.agents.map(a => [a.position.toArray(), a.yaw, a.progress, a.idleTime]) });
  const before = capture(); sim.setSuspended(true); for (let i = 0; i < 60; i++) { sim.update(10, { forward: true, interact: true }); sim.animate(10); }
  assert.deepEqual(capture(), before); assert.ok(sim.session.driving);
  sim.setSuspended(false); sim.update(1 / 60); assert.ok(sim.van.position.distanceTo({ x: before.van[0][0], y: before.van[0][1], z: before.van[0][2] }) < .15); sim.dispose();
});

test('reset while driving restores on-foot Main Gate controls and parks the same van', () => {
  const sim = create(), vehicle = sim.van; approach(sim); sim.update(1 / 60, { interact: true });
  for (let i = 0; i < 60; i++) sim.update(1 / 60, { forward: true });
  sim.crowd.agents[0].position.set(sim.van.spawn.x, 0, sim.van.spawn.z);
  const result = sim.update(1 / 60, { reset: true });
  assert.ok(result.reset); assert.equal(sim.van, vehicle); assert.equal(sim.session.driving, false); assert.equal(sim.player.group.visible, true); assert.equal(sim.van.speed, 0);
  assert.deepEqual(sim.player.position.toArray(), [map.spawn.x, 0, map.spawn.z]); assert.deepEqual([sim.van.position.x, sim.van.position.z], [sim.van.spawn.x, sim.van.spawn.z]);
  assert.ok(sim.crowd.agents.every(a => sim.van.distanceFrom(a.position.x, a.position.z) >= .8)); sim.dispose();
});
