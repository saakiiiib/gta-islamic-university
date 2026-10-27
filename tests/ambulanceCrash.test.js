import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { AmbulanceController } from '../src/vehicle/ambulance.js';
import { ElectricVan } from '../src/vehicle/controller.js';
import { ImpactSystem } from '../src/game/impacts.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')));
const queries = new CampusQueries(map);

test('Van crashing into ambulance applies damage cleanly without unhandled TypeError', () => {
  const ambulance = new AmbulanceController(map, queries);
  const van = new ElectricVan({ queries, spawn: { x: -200, z: -170, yaw: 0 } });
  van.occupied = true;
  const impacts = new ImpactSystem(null);

  assert.equal(ambulance.durability, 120);
  assert.equal(ambulance.disabled, false);

  // Directly test impact handling when van hits ambulance
  const handled = impacts.handle({
    type: 'vehicle',
    van,
    other: ambulance,
    speed: 8.5,
    normal: { x: 0, z: 1 },
  });

  assert.ok(handled, 'Impact should be handled cleanly');
  assert.ok(ambulance.durability < 120, 'Ambulance should sustain damage without throwing');
  assert.ok(van.durability < 100, 'Van should sustain damage');

  // Verify spatial distance methods
  const dist = ambulance.distanceFrom(-200, -170);
  assert.ok(Number.isFinite(dist));
  assert.ok(ambulance.footprint.length > 0);

  // Verify visual syncing under impact
  ambulance.syncVisuals(0.016);
  assert.ok(ambulance.model.body.rotation.z !== 0 || ambulance.impactRoll !== 0);

  // Severe damage disables vehicle cleanly
  ambulance.applyDamage(200, { speed: 20 });
  assert.equal(ambulance.durability, 0);
  assert.equal(ambulance.disabled, true);
  assert.equal(ambulance.speed, 0);

  ambulance.dispose();
  van.dispose();
});
