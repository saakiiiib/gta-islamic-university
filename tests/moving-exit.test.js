import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera } from 'three';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { passengerWorldPosition } from '../src/vehicle/occupants.js';
import { localToWorld } from '../src/navigation/campusQueries.js';
import { TravelCamera } from '../src/vehicle/camera.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8'))), world = buildWorld(map);
function mounted(speed, render = false) {
  const sim = new CampusSimulation(map, world.collisionGroup, { renderCrowd: render }), van = sim.vans[0];
  const [x, z] = localToWorld(-1.5, -.4, van.position, van.yaw);
  sim.player.teleport({ x, y: sim.queries.groundHeight(x, z), z });
  for (let i = 0; i < 10; i++) sim.update(1 / 60);
  assert.ok(sim.update(1 / 60, { interact: true }).changed); van.speed = speed; sim.animate(0);
  return { sim, van };
}

test('moving exits start at the real visible seat, inherit momentum, and leave the visible driver in control', () => {
  const { sim, van } = mounted(7, true), seat = passengerWorldPosition(van), originalGroup = sim.player.group;
  const camera = new PerspectiveCamera(60, 1.6, .08, 2200), rig = new TravelCamera(camera, world.collisionGroup);
  rig.setDriving(true); rig.reset({ ...van.position, yaw: van.yaw });
  const beforeCamera = camera.position.clone(), beforeVan = van.position.clone();
  sim.player.teleport = () => { throw new Error('Dismount must not teleport to an exit point'); };
  assert.equal(sim.session.interact().changed, true);
  assert.ok(sim.player.position.distanceTo(seat) < 1e-8); assert.equal(sim.player.group, originalGroup);
  assert.equal(sim.player.group.visible, true); assert.equal(van.speed, 7);
  assert.ok(van.autonomous && !van.occupied && sim.driverController.isActive(van));
  assert.ok(Math.abs(sim.player.velocity.x * -Math.sin(van.yaw) + sim.player.velocity.z * -Math.cos(van.yaw) - 7) < 1e-8);
  assert.equal(sim.occupants.drivers.length, 8);
  for (let i = 0; i < 6; i++) { sim.update(1 / 60); sim.animate(1 / 60); }
  assert.ok(van.position.distanceTo(beforeVan) > .4, 'the driver continues instead of freezing on exit');
  assert.ok(sim.occupants.group.children.every(batch => batch.visible));
  rig.setDriving(false); rig.updateTravel(1 / 60, sim.entity);
  assert.ok(camera.position.distanceTo(beforeCamera) < .6, 'camera follows the new player target smoothly'); sim.dispose();
});

test('low and high speed real-campus jump-offs make ground contact and apply different landing damage', () => {
  const low = mounted(1), high = mounted(8);
  for (const { sim } of [low, high]) {
    assert.ok(sim.session.interact().changed);
    for (let i = 0; i < 180; i++) { sim.update(1 / 60); sim.animate(1 / 60); }
    assert.ok(sim.player.grounded); assert.ok(sim.queries.discClear(sim.player.position.x, sim.player.position.z, .32));
    assert.ok(Math.abs(sim.player.position.y - sim.queries.groundHeight(sim.player.position.x, sim.player.position.z)) < .02);
    assert.equal(sim.player.group.visible, true); assert.ok(sim.player.position.distanceTo({ ...map.spawn }) > 1);
  }
  assert.equal(low.sim.player.health, 100); assert.ok(high.sim.player.health < low.sim.player.health);
  low.sim.dispose(); high.sim.dispose();
});

test('pause freezes a departing driver and airborne passenger; reset clears their motion and injuries', () => {
  const { sim, van } = mounted(8); sim.session.interact(); sim.update(1 / 60); sim.animate(1 / 60);
  const capture = () => [sim.player.position.toArray(), sim.player.velocity.toArray(), sim.player.dismount.phaseTime, sim.player.health, van.position.toArray(), van.speed];
  const before = capture(); sim.setSuspended(true);
  for (let i = 0; i < 60; i++) { sim.update(10); sim.animate(10); }
  assert.deepEqual(capture(), before); sim.setSuspended(false); sim.update(1 / 60);
  assert.ok(sim.player.position.distanceTo({ x: before[0][0], y: before[0][1], z: before[0][2] }) < .2);
  sim.reset(); assert.equal(sim.player.health, 100); assert.equal(sim.player.dismount, null);
  assert.ok(sim.vans.every(v => !v.autonomous && !v.occupied && v.speed === 0)); sim.dispose();
});
