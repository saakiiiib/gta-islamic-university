import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, pointInRing } from '../src/map/index.js';
import { PlayerController } from '../src/player/controller.js';
import * as THREE from 'three';

const xml = readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8');

test('untrimmed mapData retains canonical 189 buildings for backwards compatibility', () => {
  const rawMap = buildMapData(parseOsm(xml));
  assert.equal(rawMap.buildings.length, 189);
  assert.equal(rawMap.water.length, 4);
  assert.equal(rawMap.trimmed, undefined);
});

test('trimmed mapData trims strictly to 57 authentic campus buildings', () => {
  const campusMap = buildMapData(parseOsm(xml), { trimToCampus: true });
  assert.equal(campusMap.trimmed, true);
  assert.equal(campusMap.buildings.length, 57);

  // Verify key university buildings exist in the trimmed dataset
  const names = campusMap.buildings.map(b => b.name).filter(Boolean);
  assert.ok(names.some(n => /Auditorium/i.test(n)), 'Auditorium should be present');
  assert.ok(names.some(n => /Central Library/i.test(n)), 'Central Library should be present');
  assert.ok(names.some(n => /Central Mosque/i.test(n)), 'Central Mosque should be present');
  assert.ok(names.some(n => /Rabindra Arts/i.test(n)), 'Rabindra Arts building should be present');
  assert.ok(names.some(n => /Ibn Sina Science/i.test(n)), 'Ibn Sina Science Building should be present');
  assert.ok(names.some(n => /Medical Centre/i.test(n)), 'Medical Centre should be present');
  assert.ok(names.some(n => /Saddam Hossain Hall/i.test(n)), 'Saddam Hossain Hall should be present');

  // Verify external non-campus buildings are excluded
  assert.equal(campusMap.buildings.some(b => b.id === '532466329'), false, 'Sheikhpara mosque should be excluded');
  assert.equal(campusMap.buildings.some(b => b.id === '532466676'), false, 'Sonali Bank outside should be excluded');
  assert.equal(campusMap.buildings.some(b => b.id === '929202809'), false, 'Village hut 929202809 should be excluded');
  assert.equal(campusMap.buildings.some(b => b.id === '929202902'), false, 'Village hut 929202902 should be excluded');
});

test('trimmed mapData retains 3 campus ponds and excludes external village pond', () => {
  const campusMap = buildMapData(parseOsm(xml), { trimToCampus: true });
  assert.equal(campusMap.water.length, 3);
  assert.equal(campusMap.water.some(w => w.id === '657395964'), false, 'External pond 657395964 should be excluded');
  assert.ok(campusMap.water.some(w => w.id === '1317423252'), 'Campus pond 1317423252 should be present');
});

test('trimmed mapData preserves all campus sports fields and gardens', () => {
  const campusMap = buildMapData(parseOsm(xml), { trimToCampus: true });
  assert.equal(campusMap.greens.length, 16);
  const names = campusMap.greens.map(g => g.name).filter(Boolean);
  assert.ok(names.some(n => /Cricket Field/i.test(n)), 'Cricket Field should be present');
  assert.ok(names.some(n => /Football Playground/i.test(n)), 'Football Playground should be present');
  assert.ok(names.some(n => /Mango Garden/i.test(n)), 'Mango Garden should be present');
});

test('player controller enforces campus perimeter when mapData is trimmed', () => {
  const campusMap = buildMapData(parseOsm(xml), { trimToCampus: true });
  const collisionGroup = new THREE.Group();
  const groundGeo = new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2);
  collisionGroup.add(new THREE.Mesh(groundGeo));

  const player = new PlayerController({
    collisionGroup,
    mapData: campusMap,
  });

  // Teleport player near the campus boundary
  player.teleport({ x: 440, y: 0, z: 320 }, 0);
  for (let i = 0; i < 20; i++) {
    player.update(0.1, { right: true, back: true }, 0);
  }

  const campusRing = campusMap.campus.polygons[0][0];
  const isInside = pointInRing([player.position.x, player.position.z], campusRing) ||
    (player.position.x >= 290 && player.position.x <= 338 && player.position.z >= -90 && player.position.z <= -55);
  assert.ok(isInside, 'Player must remain inside the campus or Main Gate plaza');
  assert.ok(player.position.x <= 444, 'Player cannot cross the boundary perimeter');
});
