import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusQueries, localToWorld, rectangleFootprint } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { CampusSimulation } from '../src/game/simulation.js';
import { ImpactSystem, impactDamage } from '../src/game/impacts.js';
import { PedestrianSystem } from '../src/npc/pedestrians.js';
import { ElectricVan } from '../src/vehicle/controller.js';
import { vansOverlap } from '../src/vehicle/contacts.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const world = buildWorld(map);
const create = () => new CampusSimulation(map, world.collisionGroup, { renderCrowd: false });
const flat = new CampusQueries({ bounds: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 } });

test('eight parked vans have distinct valid road footprints spread across campus', () => {
  const sim = create();
  assert.equal(sim.vans.length, 8); assert.equal(sim.fleetGroup.children.length, 8);
  assert.equal(new Set(sim.vans.map(v => v.id)).size, 8);
  assert.equal(new Set(sim.vans.map(v => v.group)).size, 8);
  for (const [i, van] of sim.vans.entries()) {
    assert.equal(van.group.parent, sim.fleetGroup);
    assert.equal(van.durability, 100);
    assert.ok(sim.queries.rectangleClear(van.position, van.yaw, van.config, .25), `van ${i} clear`);
    assert.ok(rectangleFootprint(van.position, van.yaw, van.config).every(([x, z]) => sim.queries.onRoad(x, z)), `van ${i} on pavement`);
    for (const other of sim.vans.slice(i + 1)) {
      assert.equal(vansOverlap(van.position, van.yaw, van.config, other), false);
      assert.ok(van.position.distanceTo(other.position) > 24, 'fleet covers separate campus roads');
    }
  }
  assert.equal(sim.crowd.agents.length, 30);
  sim.dispose();
});

test('any of the eight parked vans can be entered and the student stays visible', () => {
  const sim = create();
  for (const van of sim.vans) {
    const [x, z] = localToWorld(-1.5, -.4, van.position, van.yaw);
    sim.player.teleport({ x, y: sim.queries.groundHeight(x, z), z });
    for (let i = 0; i < 10; i++) sim.update(1 / 60);
    assert.equal(sim.session.nearestVan(), van);
    assert.equal(sim.van, van);
    assert.ok(sim.session.canEnter(van), `van ${van.id} reachable`);
    assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
    assert.equal(sim.session.van, van); assert.equal(sim.entity.vanId, van.id);
    assert.equal(sim.player.group.visible, true);
    assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
    assert.equal(sim.player.group.visible, true);
  }
  sim.dispose();
});

function realPedestrianContact(initialSpeed) {
  const q = new CampusQueries(map), graph = buildPedestrianGraph(map, q);
  const crowd = new PedestrianSystem(map, q, graph, { count: 1, render: false });
  const agent = crowd.agents[0], van = new ElectricVan({ queries: flat, spawn: { x: agent.position.x, z: agent.position.z + 3.8, yaw: 0 } });
  van.occupied = true; van.speed = initialSpeed;
  const impacts = new ImpactSystem(crowd), hits = [];
  for (let i = 0; i < 180 && !hits.length; i++) {
    impacts.update(1 / 60);
    van.update(1 / 60, { forward: true }, { pedestrians: [agent], onImpact: hit => { hits.push(hit); impacts.handle(hit); } });
  }
  return { crowd, agent, van, impacts, hits, dispose() { crowd.dispose(); van.dispose(); } };
}

test('real van to pedestrian contact reduces both health and durability with speed', () => {
  const slow = realPedestrianContact(1.5), fast = realPedestrianContact(7);
  for (const result of [slow, fast]) {
    assert.equal(result.hits[0]?.type, 'pedestrian');
    assert.ok(result.agent.health < 100); assert.ok(result.van.durability < 100);
    assert.equal(result.van.speed, 0); assert.equal(result.van.hitObstacle, true);
    assert.equal(result.crowd.drainEvents().filter(e => e.type === 'collision').length, 1);
    assert.ok(['stumble', 'fallen'].includes(result.agent.reactionState));
  }
  assert.ok(fast.hits[0].speed > slow.hits[0].speed);
  assert.ok(fast.agent.health < slow.agent.health);
  assert.ok(fast.van.durability < slow.van.durability);
  assert.ok(impactDamage(7).pedestrian > impactDamage(2).pedestrian);
  slow.dispose(); fast.dispose();
});

test('continued throttle at contact does not stack damage; separation rearms a later hit', () => {
  const s = realPedestrianContact(4);
  assert.equal(s.hits[0]?.type, 'pedestrian');
  const initial = [s.agent.health, s.van.durability];
  for (let i = 0; i < 120; i++) {
    s.impacts.update(1 / 60);
    s.van.update(1 / 60, { forward: true }, { pedestrians: [s.agent], onImpact: hit => s.impacts.handle(hit) });
  }
  assert.deepEqual([s.agent.health, s.van.durability], initial);
  s.van.position.z += 5; s.van.speed = 0;
  for (let i = 0; i < 90; i++) { s.impacts.update(1 / 60); s.crowd.update(1 / 60); }
  assert.equal(s.impacts.contacts.size, 0);
  s.van.position.set(s.agent.position.x, 0, s.agent.position.z + 3.8); s.van.yaw = 0; s.van.speed = 3;
  let recontact = false;
  for (let i = 0; i < 120 && !recontact; i++) {
    s.impacts.update(1 / 60);
    s.van.update(1 / 60, { forward: true }, { pedestrians: [s.agent], onImpact: hit => { recontact = s.impacts.handle(hit); } });
  }
  assert.equal(recontact, true);
  assert.ok(s.agent.health < initial[0]); assert.ok(s.van.durability < initial[1]);
  s.dispose();
});

test('a parked van stops and damages a moving van without allowing their footprints to overlap', () => {
  const moving = new ElectricVan({ queries: flat, spawn: { x: 0, z: 0, yaw: 0 } });
  const parked = new ElectricVan({ queries: flat, spawn: { x: 0, z: -5, yaw: 0 } });
  moving.id = 1; parked.id = 2; moving.occupied = true; moving.speed = 6;
  const impacts = new ImpactSystem({ applyImpact() { return false; } });
  let contacted = false;
  for (let i = 0; i < 120 && !contacted; i++) {
    impacts.update(1 / 60);
    moving.update(1 / 60, { forward: true }, { vans: [moving, parked], onImpact: hit => { contacted = hit.type === 'vehicle'; impacts.handle(hit); } });
    assert.equal(vansOverlap(moving.position, moving.yaw, moving.config, parked), false);
  }
  assert.equal(contacted, true); assert.equal(moving.speed, 0);
  assert.ok(moving.durability < 100 && parked.durability < 100);
  assert.equal(impacts.drainEvents().filter(e => e.type === 'worldImpact').length, 1);
  moving.dispose(); parked.dispose();
});

test('static contact damages only the van and leaves pedestrian collision queries intact', () => {
  const wall = { polygons: [[[[ -10, -5 ], [10, -5], [10, -4.9], [-10, -4.9], [-10, -5]]]] };
  const mapData = { bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, buildings: [wall] };
  const before = structuredClone(mapData), q = new CampusQueries(mapData);
  const van = new ElectricVan({ queries: q, spawn: { x: 0, z: 0, yaw: 0 } });
  van.occupied = true; van.speed = 6;
  const impacts = new ImpactSystem({ applyImpact() { return false; } });
  let staticHit = false;
  for (let i = 0; i < 120 && !staticHit; i++) {
    impacts.update(1 / 60);
    van.update(1 / 60, { forward: true }, { onImpact: hit => { staticHit = hit.type === 'static'; impacts.handle(hit); } });
  }
  assert.equal(staticHit, true); assert.ok(van.durability < 100);
  assert.deepEqual(mapData, before);
  assert.equal(q.discClear(0, -5, .32), false);
  assert.equal(q.rectangleClear(van.position, van.yaw, van.config), true);
  van.dispose();
});

test('zero durability disables the engine while stopped exit remains available', () => {
  const sim = create(), van = sim.vans[0];
  const [x, z] = localToWorld(-1.5, -.4, van.position, van.yaw);
  sim.player.teleport({ x, y: sim.queries.groundHeight(x, z), z });
  for (let i = 0; i < 10; i++) sim.update(1 / 60);
  assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
  van.applyDamage(1000, { speed: 8 });
  const position = van.position.clone();
  for (let i = 0; i < 90; i++) sim.update(1 / 60, { forward: true });
  assert.equal(van.durability, 0); assert.equal(van.disabled, true);
  assert.equal(van.speed, 0); assert.deepEqual(van.position.toArray(), position.toArray());
  assert.equal(sim.update(1 / 60, { interact: true }).changed, true);
  assert.equal(sim.session.driving, false); assert.equal(sim.player.group.visible, true);
  assert.equal(sim.session.canEnter(van), false);
  sim.dispose();
});

test('pause freezes eight vans and injury timers; reset repairs the same fleet without duplication', () => {
  const sim = create(), originals = [...sim.vans], agent = sim.crowd.agents[0];
  sim.vans[0].applyDamage(40, { speed: 6 });
  sim.impacts.handle({ type: 'pedestrian', van: sim.vans[1], pedestrian: agent, speed: 5, normal: { x: 1, z: 0 } });
  const capture = () => ({ vans: sim.vans.map(v => [v.position.toArray(), v.speed, v.durability, v.impactAge]),
    agent: [agent.position.toArray(), agent.health, agent.reactionState, agent.reactionTime], clock: [sim.crowd.time, sim.impacts.time] });
  const before = capture(); sim.setSuspended(true);
  for (let i = 0; i < 30; i++) { sim.update(10, { forward: true }); sim.animate(10); }
  assert.deepEqual(capture(), before);
  sim.setSuspended(false); sim.update(1 / 60, { reset: true });
  assert.deepEqual(sim.vans, originals); assert.equal(sim.fleetGroup.children.length, 8);
  assert.ok(sim.vans.every(v => v.durability === 100 && !v.disabled && v.speed === 0 && !v.occupied));
  assert.ok(sim.vans.every(v => v.position.x === v.spawn.x && v.position.z === v.spawn.z));
  assert.equal(sim.session.driving, false); assert.equal(sim.player.group.visible, true);
  assert.equal(sim.impacts.contacts.size, 0);
  sim.dispose();
});

test('durability loss changes the original van appearance and repair restores it', () => {
  const van = new ElectricVan({ queries: flat, spawn: { x: 0, z: 0, yaw: 0 } });
  const mesh = van.model.body.children[0], paint = mesh.material.color.clone(), scale = van.model.body.scale.clone();
  van.applyDamage(75, { speed: 6, normal: { x: 1, z: 0 } }); van.syncVisuals(.04);
  assert.notDeepEqual(mesh.material.color.toArray(), paint.toArray());
  assert.ok(van.model.body.scale.y < scale.y && van.model.body.scale.y > .9);
  assert.ok(Math.abs(van.model.body.rotation.x) <= .19 && Math.abs(van.model.body.rotation.z) <= .075);
  van.reset(); assert.ok(mesh.material.color.equals(paint)); assert.ok(van.model.body.scale.equals(scale));
  van.dispose();
});

test('the shared simulation forwards actual impact health and reaction events to its presentation layer', () => {
  const sim = create(), van = sim.vans[0], person = sim.crowd.agents[0];
  const [x, z] = localToWorld(-1.5, -.4, van.position, van.yaw);
  sim.player.teleport({ x, y: sim.queries.groundHeight(x, z), z });
  for (let i = 0; i < 10; i++) sim.update(1 / 60);
  sim.update(1 / 60, { interact: true });
  const [px, pz] = localToWorld(0, -3.4, van.position, van.yaw);
  assert.ok(sim.queries.discClear(px, pz, .28)); person.position.set(px, sim.queries.groundHeight(px, pz), pz);
  person.idleTime = 20; van.speed = 6;
  const events = [];
  for (let i = 0; i < 60 && !events.some(e => e.type === 'collision'); i++) { sim.update(1 / 60, { forward: true }); events.push(...sim.drainEvents()); }
  assert.ok(events.some(e => e.type === 'collision' && e.npcId === person.id));
  assert.equal(sim.lastCollision.npcId, person.id); assert.ok(person.health < 100 && van.durability < 100);
  assert.equal(sim.player.group.visible, true); sim.dispose();
});
