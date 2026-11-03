import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { PlayerController } from '../src/player/controller.js';
import { resolveVanCapsule } from '../src/player/vanCollisions.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { BUS_CONFIG } from '../src/vehicle/busModel.js';
import { localToWorld } from '../src/navigation/campusQueries.js';
import { CollisionWorld } from '../src/player/collision.js';

const square = (x0, z0, x1, z1) => [[[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]]];
function walkingPlayer(map = {}) {
  const floor = new Group();
  floor.add(new Mesh(new PlaneGeometry(100, 100).rotateX(-Math.PI / 2)));
  return new PlayerController({ collisionGroup: floor, mapData: {
    bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, spawn: { x: 0, y: 0, z: 0 }, ...map,
  } });
}
function advance(player, input, ticks = 120) {
  for (let i = 0; i < ticks; i++) player.update(1 / 60, input);
}

test('shoreline contact stops stored speed but preserves tangent walking and jump recovery', () => {
  const p = walkingPlayer({ water: [{ polygons: square(-20, -20, 20, -2) }] });
  advance(p, { forward: true, sprint: true });
  assert.ok(p.position.z >= -1.681);
  assert.equal(p.velocity.z, 0);
  assert.equal(p.speed, 0);
  const before = p.position.clone();
  p.update(1 / 60, { jump: true, forward: true });
  assert.ok(p.velocity.y > 5 && !p.grounded, 'bank contact cannot swallow a grounded jump');
  advance(p, { forward: true, right: true });
  assert.ok(p.position.x > before.x + 4, 'blocked forward motion must still slide along the bank');
  assert.equal(p.velocity.z, 0);
  assert.ok(p.grounded);
  advance(p, { back: true }, 30);
  assert.ok(p.position.z > before.z + 1, 'turning away cannot retain speed into the water');
  p.dispose();
});

test('map and campus edges stop blocked velocity and allow movement back into campus', () => {
  for (const trimmed of [false, true]) {
    const p = walkingPlayer({ bounds: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 },
      trimmed, campus: { polygons: square(-5, -5, 5, 5) } });
    advance(p, { right: true, sprint: true });
    assert.ok(p.position.x <= (trimmed ? 5 : 7.68) + 1e-7);
    assert.equal(p.velocity.x, 0);
    const atEdge = p.position.x;
    advance(p, { left: true }, 30);
    assert.ok(p.position.x < atEdge - 1);
    p.dispose();
  }
});

test('live van separation cannot push the capsule through the campus perimeter', () => {
  const p = walkingPlayer({ trimmed: true, campus: { polygons: square(-5, -5, 5, 5) },
    spawn: { x: 4.8, y: 0, z: .8 } });
  p.setVanObstacles([{ position: new Vector3(4, 0, 0), yaw: 0, speed: 0 }]);
  p.update(1 / 60);
  assert.equal(p.position.x, 4.8, 'reject the forbidden collision displacement at the last accepted point');
  assert.equal(p.velocity.x, 0);
  assert.equal(p.velocity.z, 0);
  p.dispose();
});

test('bus capsule collision uses its full configured hull in either world heading', () => {
  for (const yaw of [0, .9]) {
    const bus = { isBus: true, config: BUS_CONFIG, position: new Vector3(3, 0, -2), yaw, speed: 0 };
    // Both side and rear positions are far outside the small electric-van proxy.
    for (const [side, longitudinal, axis] of [[BUS_CONFIG.halfWidth + .1, 0, 'side'], [0, BUS_CONFIG.rear + .1, 'rear']]) {
      const [x, z] = localToWorld(side, longitudinal, bus.position, yaw);
      const capsule = new Capsule(new Vector3(x, .32, z), new Vector3(x, 1.43, z), .32);
      const before = capsule.start.clone();
      resolveVanCapsule(capsule, new Vector3(), bus);
      assert.ok(capsule.start.distanceTo(before) > .2, `${axis} of the real bus hull must separate the capsule`);
    }
  }
});

test('octree subdivision retains outer hull wall and roof triangles at floating-point bounds', () => {
  const hull = new Mesh(new BoxGeometry(2.7, 4.2, 8.2));
  hull.position.set(0, 2.1, .5);
  const world = new CollisionWorld(hull);
  for (const x of [-1.45, 1.45]) {
    const capsule = new Capsule(new Vector3(x, .32, 0), new Vector3(x, 1.43, 0), .32);
    world.resolve(capsule, new Vector3(-Math.sign(x), 0, 0));
    assert.ok(Math.abs(capsule.start.x) > 1.669, 'both side faces must remain in the tree');
  }
  for (const z of [-3.7, 4.7]) {
    const capsule = new Capsule(new Vector3(0, .32, z), new Vector3(0, 1.43, z), .32);
    world.resolve(capsule, new Vector3(0, 0, -Math.sign(z)));
    assert.ok(z < 0 ? capsule.start.z < -3.919 : capsule.start.z > 4.919, 'front and rear faces must remain solid');
  }
  const roof = new Capsule(new Vector3(0, 4.4, 0), new Vector3(0, 5.51, 0), .32);
  const falling = new Vector3(0, -2, 0);
  assert.ok(world.resolve(roof, falling), 'top face grounds a falling capsule');
  assert.ok(roof.start.y >= 4.519);
  assert.equal(falling.y, 0);
  const ceiling = new Capsule(new Vector3(0, -1.31, 0), new Vector3(0, -.2, 0), .32);
  const rising = new Vector3(0, 2, 0);
  assert.equal(world.resolve(ceiling, rising), false, 'an underside hit must not count as ground');
  assert.ok(ceiling.end.y <= -.319);
  assert.equal(rising.y, 0, 'ceiling contact stops upward velocity');
  hull.geometry.dispose(); hull.material.dispose();
});

test('jumping under a low roof stops at the ceiling, lands, and leaves walking responsive', () => {
  const p = walkingPlayer();
  const floor = new Group();
  floor.add(new Mesh(new PlaneGeometry(100, 100).rotateX(-Math.PI / 2)));
  const roof = new Mesh(new BoxGeometry(8, .2, 8));
  roof.position.y = 2.1; floor.add(roof);
  p.world = new CollisionWorld(floor);
  advance(p, {}, 2);
  p.update(1 / 60, { jump: true });
  assert.ok(p.velocity.y > 0);
  let maximum = p.position.y;
  for (let i = 0; i < 90; i++) { p.update(1 / 60); maximum = Math.max(maximum, p.position.y); }
  assert.ok(maximum <= 2 - p.config.height + .001, 'the head cannot cross the roof underside');
  assert.ok(p.grounded && Math.abs(p.position.y) < 1e-4);
  advance(p, { forward: true }, 30);
  assert.ok(p.position.z < -1);
  p.dispose();
});

function stubSimulation({ driving = false } = {}) {
  let busTicks = 0, busElapsed = 0, sideElapsed = 0;
  const bus = { position: new Vector3(), update(dt) { busTicks++; busElapsed += dt; } };
  const sim = { suspended: false, session: { driving, van: bus, entity: { position: new Vector3() } }, vans: [], bus,
    ambulance: null, events: [], player: { update() {} },
    sideCharacters: { update(dt) { sideElapsed += dt; } },
    impacts: { update() {}, drainEvents() { return []; } },
    crowd: { update() {}, agents: [], drainEvents() { return []; } }, driverController: { update() {} },
    get allVehicles() { return [bus]; },
  };
  return { sim, elapsed: () => ({ busTicks, busElapsed, sideElapsed }) };
}

test('exited moving bus keeps simulating once per fixed tick instead of freezing or double updating', () => {
  for (const driving of [false, true]) {
    const { sim, elapsed } = stubSimulation({ driving });
    CampusSimulation.prototype.update.call(sim, .1);
    assert.equal(elapsed().busTicks, 6);
    assert.ok(Math.abs(elapsed().busElapsed - .1) < 1e-12);
    assert.ok(Math.abs(elapsed().sideElapsed - .1) < 1e-12, 'side characters use the fixed tick duration');
  }
});

test('simulation reset forwards an optional matching player/camera spawn and preserves the map default', () => {
  const mapSpawn = { x: 1, y: 0, z: 2, yaw: .5 }, gateSpawn = { x: 3, y: 0, z: 4, yaw: 1 };
  let accepted;
  const sim = { map: { spawn: mapSpawn }, session: { reset(spawn) { accepted = spawn; } },
    driverController: { reset() {}, startServices() {} }, crowd: { clearAround() {} },
    impacts: { reset() {} }, events: [], occupants: { update() {} }, allVehicles: [],
  };
  CampusSimulation.prototype.reset.call(sim, gateSpawn);
  assert.equal(accepted, gateSpawn);
  CampusSimulation.prototype.reset.call(sim);
  assert.equal(accepted, mapSpawn);
});
