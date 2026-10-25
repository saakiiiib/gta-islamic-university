import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { movementDirection, PlayerController } from '../src/player/controller.js';
import { CampusQueries, localToWorld } from '../src/navigation/campusQueries.js';
import { ElectricVan } from '../src/vehicle/controller.js';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { passengerWorldPosition } from '../src/vehicle/occupants.js';

const bounds = { minX: -35, maxX: 35, minZ: -35, maxZ: 35 };
function floorScene(withWall = false) {
  const group = new Group(), material = new MeshBasicMaterial();
  const floor = new Mesh(new BoxGeometry(80, .2, 80), material); floor.position.y = -.1; group.add(floor);
  if (withWall) {
    const wall = new Mesh(new BoxGeometry(20, 4, .2), material);
    wall.position.set(0, 2, -3); group.add(wall);
  }
  group.updateMatrixWorld(true);
  return group;
}
function student(scene = floorScene()) {
  return new PlayerController({ collisionGroup: scene, mapData: { bounds, spawn: { x: 0, y: 0, z: 0, yaw: 0 } } });
}
function ticks(actor, seconds, input, yaw = 0) {
  for (let i = 0; i < Math.round(seconds * 60); i++) actor.update(1 / 60, input, yaw);
}

test('analog walking preserves joystick magnitude and camera-relative direction; diagonals clamp at full speed', () => {
  const half = student(), full = student(), diagonal = student();
  ticks(half, 1, { moveX: 0, moveZ: -.5 });
  ticks(full, 1, { moveX: 0, moveZ: -1 });
  ticks(diagonal, 1, { moveX: 1, moveZ: -1 });
  assert.ok(Math.abs(half.speed / full.speed - .5) < 1e-8);
  assert.ok(half.position.length() < full.position.length() * .6);
  assert.ok(Math.abs(diagonal.speed - full.speed) < 1e-8);
  assert.ok(Math.abs(movementDirection({ moveX: .5, moveZ: -.5 }, -Math.PI / 2).distanceTo(new Vector3(.5, 0, .5))) < 1e-10);
  assert.ok(Math.abs(movementDirection({ moveX: 1, moveZ: -1 }).length() - 1) < 1e-10);
  for (const player of [half, full, diagonal]) player.dispose();
});

test('analog sprint, jump and landing work while a diagonal slides along a wall', () => {
  const walker = student(), sprinter = student(), wallRunner = student(floorScene(true));
  ticks(walker, 1, { moveX: 0, moveZ: -.6 });
  ticks(sprinter, 1, { moveX: 0, moveZ: -.6, sprint: true });
  assert.ok(sprinter.speed > walker.speed * 1.9);
  ticks(sprinter, .2, {});
  sprinter.update(1 / 60, { moveX: 0, moveZ: -.6, jump: true });
  assert.equal(sprinter.grounded, false);
  assert.ok(sprinter.velocity.y > 0);
  ticks(sprinter, 1.3, {});
  assert.equal(sprinter.grounded, true);
  ticks(wallRunner, 2, { moveX: .7, moveZ: -.7, sprint: true });
  assert.ok(wallRunner.position.z >= -2.581);
  assert.ok(wallRunner.position.x > 4);
  for (const player of [walker, sprinter, wallRunner]) player.dispose();
});

test('analog van steering is proportional and throttle can brake into reverse', () => {
  const queries = new CampusQueries({ bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 } });
  const makeVan = () => { const van = new ElectricVan({ queries, spawn: { x: 0, z: 0, yaw: 0 } }); van.occupied = true; return van; };
  const half = makeVan(), full = makeVan(), keyboard = makeVan();
  ticks(half, 1, { forward: true, steer: .5 });
  ticks(full, 1, { forward: true, steer: 1 });
  ticks(keyboard, 1, { forward: true, left: true });
  assert.ok(half.yaw > 0 && half.yaw < full.yaw);
  assert.ok(Math.abs(full.yaw - keyboard.yaw) < 1e-8);
  const forwardSpeed = half.speed;
  half.update(1 / 60, { back: true });
  assert.ok(half.speed < forwardSpeed && half.speed > 0);
  ticks(half, 2.5, { back: true });
  assert.ok(half.speed < -1);
  for (const van of [half, full, keyboard]) van.dispose();
});

test('touch-style interact exits a moving van with inherited momentum and a visible driver; suspension and reset clear motion', () => {
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
  const world = buildWorld(map), sim = new CampusSimulation(map, world.collisionGroup, { renderCrowd: true });
  const van = sim.vans[0], [x, z] = localToWorld(-1.5, -.4, van.position, van.yaw);
  sim.player.teleport({ x, y: sim.queries.groundHeight(x, z), z });
  ticks(sim, .2, {});
  assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
  van.speed = 7; sim.animate(0);
  const seat = passengerWorldPosition(van);
  assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
  assert.ok(sim.player.position.distanceTo(seat) < .2);
  assert.ok(sim.player.group.visible);
  assert.ok(van.autonomous && !van.occupied && sim.driverController.isActive(van));
  assert.ok(Math.abs(sim.player.velocity.x * -Math.sin(van.yaw) + sim.player.velocity.z * -Math.cos(van.yaw) - 7) < .1);
  sim.animate(0);
  assert.equal(sim.occupants.drivers.length, 8);
  assert.ok(sim.occupants.group.children.every(child => child.visible));
  sim.setSuspended(true);
  const frozenPlayer = sim.player.position.clone(), frozenVan = van.position.clone();
  ticks(sim, 1, {});
  assert.ok(sim.player.position.equals(frozenPlayer) && van.position.equals(frozenVan));
  sim.setSuspended(false); sim.update(1 / 60);
  assert.ok(sim.player.position.distanceTo(frozenPlayer) > 0);
  sim.reset();
  assert.equal(sim.player.dismount, null);
  assert.ok(sim.vans.every(item => !item.occupied && item.speed === 0));
  assert.equal(sim.vans.filter(item => item.autonomous).length, 3);
  sim.dispose();
});
