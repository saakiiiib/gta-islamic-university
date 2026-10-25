import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import { buildMapData, parseOsm } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { PedestrianSystem } from '../src/npc/pedestrians.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map), graph = buildPedestrianGraph(map, queries);
const create = options => new PedestrianSystem(map, queries, graph, { render: false, ...options });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('startup allocates 18 students near Main Gate, eight at the next source hub and four in background hubs', () => {
  const crowd = create(), other = create();
  assert.equal(crowd.agents.length, 30);
  assert.deepEqual(crowd.agents.map(a => a.position.toArray()), other.agents.map(a => a.position.toArray()));
  assert.equal(crowd.activity.primary.name, 'Main Gate');
  assert.equal(crowd.agents.filter(a => a.activityHub === crowd.activity.primary.id).length, 18);
  assert.equal(crowd.agents.filter(a => a.activityHub === crowd.activity.secondary.id).length, 8);
  assert.equal(crowd.agents.filter(a => distance(a.position, map.spawn) < 80).length, 18);
  for (const a of crowd.agents) {
    assert.ok(graph.isWalkable(a.position.x, a.position.z));
    assert.ok(queries.discClear(a.position.x, a.position.z, .3));
    assert.notEqual(a.edge.walkingKind, 'crossing');
    assert.ok(crowd.activity.hubs.some(h => h.id === a.activityHub && h.sourceIds?.length));
    for (const b of crowd.agents) if (a !== b) assert.ok(distance(a.position, b.position) >= 2.5 - 1e-8);
  }
  crowd.dispose(); other.dispose();
});

test('nearby pairs, conversations and waiting coexist and physical reactions interrupt social intent', () => {
  const crowd = create(); crowd.update(1 / 60);
  for (const mode of ['pair', 'conversation', 'waiting', 'walk']) assert.ok(crowd.agents.some(a => a.behavior === mode), mode);
  const person = crowd.agents.find(a => a.behavior === 'conversation');
  assert.equal(crowd.applyImpact(person, { speed: 2, damage: 4, normal: { x: 1, z: 0 } }), true);
  assert.equal(person.socialUntil, 0);
  crowd.update(1 / 60);
  assert.equal(person.reactionState, 'stumble'); assert.notEqual(person.behavior, 'conversation');
  assert.equal(crowd.drainEvents().filter(e => e.type === 'collision' && e.npcId === person.id).length, 1);
  assert.equal(crowd.activity.canReassign(person, crowd.time), false);
  crowd.dispose();
});

test('hidden relocation waits three seconds, keeps identity and targets a valid exterior route', () => {
  const crowd = create(), library = crowd.activity.hubs.find(h => h.kind === 'library'), agent = crowd.agents[0];
  const original = agent, originalPosition = agent.position.clone(), seed = agent.seed;
  crowd.setView({ position: library, visible: () => false });
  crowd.activity.update(0); crowd.activity.update(1); crowd.activity.update(2.5);
  assert.deepEqual(agent.position.toArray(), originalPosition.toArray());
  crowd.activity.update(3.1);
  assert.equal(crowd.agents[0], original); assert.equal(agent.seed, seed); assert.equal(agent.health, 100);
  assert.equal(agent.activityHub, library.id); assert.ok(distance(agent.position, originalPosition) > 160);
  assert.ok(graph.isWalkable(agent.position.x, agent.position.z)); assert.ok(distance(agent.position, library) < 100);
  assert.ok(crowd.activity.reassignments > 0 && crowd.activity.reassignments <= 2);
  crowd.dispose();
});

test('hidden arrival search filters nearby points before sorting and finds the next valid approach', () => {
  const crowd = create(), library = crowd.activity.hubs.find(h => h.kind === 'library');
  const position = { x: -25.2878, z: -176.0204 };
  crowd.setView({ position, visible: () => false }); crowd.activity.primary = library;
  assert.ok(crowd.activity.candidates.some(p => distance(p, position) < 12), 'fixture includes too-close hidden candidates');
  const point = crowd.activity.findPlacement(library, [], { hidden: true });
  assert.ok(point && distance(point, position) >= 12);
  assert.ok(distance(point, library) < 100 && graph.isWalkable(point.x, point.z));
  crowd.dispose();
});

test('visible destinations, injuries and recent reactions cannot be hidden relocation candidates', () => {
  const crowd = create(), library = crowd.activity.hubs.find(h => h.kind === 'library');
  const agent = crowd.agents[0], original = agent.position.clone();
  crowd.setView({ position: library, visible: point => distance(point, library) < 125 });
  crowd.activity.update(0); crowd.activity.update(4);
  assert.deepEqual(agent.position.toArray(), original.toArray(), 'no relocation into the visible arrival area');
  crowd.setView({ position: library, visible: () => false });
  agent.health = 90; agent.hiddenSince = 0;
  assert.equal(crowd.activity.canReassign(agent, 10), false);
  agent.health = 100; agent.lastVoiceAt = 7;
  assert.equal(crowd.activity.canReassign(agent, 10), false);
  agent.lastVoiceAt = -Infinity; agent.reactionState = 'recover';
  assert.equal(crowd.activity.canReassign(agent, 10), false);
  agent.reactionState = 'walk';
  assert.equal(crowd.activity.canReassign(agent, 10), true);
  crowd.setView({ position: original, visible: () => false });
  assert.equal(crowd.activity.canReassign(agent, 10), false, 'never relocate a nearby student');
  crowd.dispose();
});

test('adjacent academic hubs switch destination without relocating visible nearby students', () => {
  const crowd = create(), library = crowd.activity.hubs.find(h => h.kind === 'library');
  const applied = crowd.activity.hubs.find(h => /Applied Science/.test(h.name)), person = crowd.agents[0];
  crowd.setView({ position: library, visible: () => false }); crowd.activity.update(0); crowd.activity.update(3.1);
  assert.equal(person.activityHub, library.id);
  const before = person.position.clone(), changes = crowd.activity.reassignments;
  crowd.setView({ position: applied, visible: () => true }); crowd.activity.update(4);
  assert.equal(crowd.activity.primary.id, applied.id); assert.equal(person.activityHub, applied.id);
  assert.deepEqual(person.position.toArray(), before.toArray()); assert.equal(crowd.activity.reassignments, changes);
  assert.equal(person.ingressUntil, 0); assert.equal(person.ingressCosts, null, 'the prior Library ingress goal is immediately cancelled');
  const costs = crowd.activity.costsToHub(applied);
  assert.ok(Number.isFinite(costs[person.current]), 'nearby transfer has a connected mapped walking route');
  crowd.dispose();
});

test('explicit activity reset restores Gate allocation without replacing identities or erasing health and voice cooldowns', () => {
  const crowd = create(), agent = crowd.agents[0], before = agent.position.clone();
  const identities = [...crowd.agents]; agent.health = 45; agent.lastVoiceAt = 12; agent.lastNearMissAt = 10;
  agent.position.set(-40, 0, -190); agent.activityHub = crowd.activity.hubs.find(h => h.kind === 'library').id;
  crowd.activity.primary = crowd.activity.hubs.find(h => h.kind === 'library'); crowd.resetActivity();
  assert.deepEqual(crowd.agents, identities); assert.deepEqual(agent.position.toArray(), before.toArray());
  assert.equal(crowd.activity.primary.name, 'Main Gate'); assert.equal(agent.health, 45);
  assert.equal(agent.lastVoiceAt, 12); assert.equal(agent.lastNearMissAt, 10);
  assert.equal(crowd.agents.filter(a => a.activityHub === crowd.activity.primary.id).length, 18);
  crowd.dispose();
});

test('crowd rendering compacts only visible nearby rigs while preserving three instanced batches', () => {
  const crowd = create({ render: true }), camera = new PerspectiveCamera(60, 16 / 9, .1, 2200);
  camera.position.set(map.spawn.x + 4, 4, map.spawn.z + 4);
  camera.lookAt(new Vector3(map.spawn.x - 25, 1, map.spawn.z - 25)); camera.updateMatrixWorld();
  crowd.setView({ position: map.spawn, camera, visible: () => true }); crowd.animate(1 / 60);
  assert.equal(crowd.group.children.length, 3); assert.ok(crowd.renderer.renderedAgents >= 10);
  for (const batch of crowd.group.children) {
    assert.ok(batch.count > 0 && batch.count < batch.instanceMatrix.count);
    assert.ok([...batch.instanceMatrix.array].every(Number.isFinite));
  }
  camera.lookAt(new Vector3(map.spawn.x + 150, 3, map.spawn.z + 150)); camera.updateMatrixWorld(); crowd.animate(1 / 60);
  assert.equal(crowd.renderer.renderedAgents, 0); assert.ok(crowd.group.children.every(batch => batch.count === 0));
  crowd.dispose();
});
