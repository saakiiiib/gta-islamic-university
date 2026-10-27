import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { PedestrianSystem } from '../src/npc/pedestrians.js';
import { VehicleHornAudio, hornAudio } from '../src/audio/horn.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map);
const graph = buildPedestrianGraph(map, queries);

test('VehicleHornAudio operates safely without throwing in headless environment', () => {
  const horn = new VehicleHornAudio();
  assert.equal(horn.sirenActive, false);

  // Honk van and bus
  horn.honk(false);
  horn.honk(true);

  // Siren
  horn.startSiren();
  horn.stopSiren();
  horn.dispose();
  assert.equal(horn.sirenActive, false);
});

test('PedestrianSystem honkAt startles students and scatters them outward', () => {
  const crowd = new PedestrianSystem(map, queries, graph, { count: 30, render: false });
  const firstAgent = crowd.agents[0];

  // Position horn 5m behind first student facing directly at them
  const hornPos = { x: firstAgent.position.x, z: firstAgent.position.z + 5.0 };
  const hornYaw = 0; // Facing negative Z (directly towards first student)

  const scattered = crowd.honkAt(hornPos, hornYaw, 25);
  assert.ok(scattered > 0, 'At least one student should react to the horn');
  assert.equal(firstAgent.reactionState, 'startled');
  assert.ok(firstAgent.impulse.x !== 0 || firstAgent.impulse.z !== 0);

  // Test healStudent
  firstAgent.health = 20;
  firstAgent.reactionState = 'fallen';
  crowd.healStudent(firstAgent.id);
  assert.equal(firstAgent.health, 100);
  assert.equal(firstAgent.reactionState, 'recover');

  crowd.dispose();
});
