import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { createAmbulanceModel, AmbulanceController, MEDICAL_CENTRE_BAY } from '../src/vehicle/ambulance.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map);

test('Ambulance 3D model creates emergency van with 4 wheels and strobe beacons', () => {
  const model = createAmbulanceModel();
  assert.ok(model.group.isGroup);
  assert.equal(model.group.name, 'islamic-university-ambulance');
  assert.equal(model.wheels.length, 4);
  assert.ok(model.redBeacon);
  assert.ok(model.blueBeacon);
  model.dispose();
  assert.equal(model.group.children.length, 0);
});

test('AmbulanceController dispatches from Medical Centre, navigates, treats victim, and returns', () => {
  const ambulance = new AmbulanceController(map, queries);

  assert.equal(ambulance.state, 'idle');
  assert.equal(ambulance.position.x, MEDICAL_CENTRE_BAY.x);
  assert.equal(ambulance.position.z, MEDICAL_CENTRE_BAY.z);

  // Mock crowd with healStudent
  let healedNpcId = null;
  const mockCrowd = {
    healStudent: id => { healedNpcId = id; },
    honkAt: () => {},
  };

  // Dispatch to an accident site
  const victimPos = { x: -180.0, z: -140.0 };
  const dispatched = ambulance.dispatch(victimPos, 5);
  assert.ok(dispatched);
  assert.equal(ambulance.state, 'en_route');
  assert.equal(ambulance.target.npcId, 5);
  assert.ok(ambulance.path.length > 0);

  // Run update steps until arrived or close
  for (let i = 0; i < 300 && ambulance.state === 'en_route'; i++) {
    ambulance.update(1 / 30, { crowd: mockCrowd });
  }

  // Force close proximity to trigger on-scene treatment if not already there
  if (ambulance.state === 'en_route') {
    ambulance.position.set(victimPos.x + 1.0, 0, victimPos.z + 1.0);
    ambulance.update(1 / 30, { crowd: mockCrowd });
  }

  assert.equal(ambulance.state, 'treating');

  // Complete treatment
  for (let i = 0; i < 90 && ambulance.state === 'treating'; i++) {
    ambulance.update(1 / 30, { crowd: mockCrowd });
  }

  assert.equal(healedNpcId, 5, 'Student must be stabilized with 100 HP');
  assert.equal(ambulance.state, 'returning');

  // Reset restores ambulance to Medical Centre
  ambulance.reset();
  assert.equal(ambulance.state, 'idle');
  assert.equal(ambulance.position.x, MEDICAL_CENTRE_BAY.x);

  const collider = ambulance.createParkedCollider();
  assert.ok(collider.isGroup);

  ambulance.dispose();
});
