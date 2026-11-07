import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { CAMPUS_LANDMARKS, validateCampusLandmarks, getCampusLandmark, landmarkAppearance } from '../src/data/campus-landmarks.js';
import { buildingPalette } from '../src/world/appearance.js';
const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
const record = () => structuredClone(CAMPUS_LANDMARKS[0]);
test('all 57 registered buildings match a typed real feature and keep raw OSM tags', () => {
  assert.equal(CAMPUS_LANDMARKS.length, 57);
  assert.equal(validateCampusLandmarks(CAMPUS_LANDMARKS, map.buildings), true);
  for (const b of map.buildings) {
    const tags = structuredClone(b.tags), r = getCampusLandmark(b);
    assert.ok(r); buildingPalette(b); assert.deepEqual(b.tags, tags);
    assert.equal(Object.isFrozen(r.fields), true);
  }
});
test('way/relation identities never collide and unknown identities do not guess', () => {
  const a = record(), b = record(); a.osmType = 'way'; b.osmType = 'relation';
  assert.equal(validateCampusLandmarks([a, b]), true);
  assert.throws(() => validateCampusLandmarks([a, a]), /Duplicate/);
  assert.throws(() => validateCampusLandmarks([a], []), /Unmatched/);
  assert.equal(getCampusLandmark({ id: a.osmId }), null);
  assert.equal(getCampusLandmark({ osmType: 'way', id: '999999999999' }), null);
});
test('unknown values remain null and dimensions/colors require field provenance', () => {
  const a = record(); a.fields.heightMeters.value = 12;
  assert.throws(() => validateCampusLandmarks([a]), /Unknown field/);
  const b = record(); b.fields.wallColor = { value: '#f1c232', status: 'observed', confidence: 'medium', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Central_library_of_IU.jpg', observedAt: '2018-11-21' };
  b.renderAppearance = { wall: 'wallColor' };
  assert.equal(validateCampusLandmarks([b]), true);
  assert.equal(landmarkAppearance(null, b).wall, 0xf1c232);
  b.fields.wallColor.sourceUrl = null;
  assert.throws(() => validateCampusLandmarks([b]), /provenance/);
});
test('planned and provisional observations cannot silently change rendering', () => {
  for (const status of ['planned', 'provisional']) {
    const a = record(); a.fields.wallColor = { value: '#ffffff', status, confidence: 'low', sourceUrl: 'https://iu.ac.bd/', observedAt: '2026-11-07' }; a.renderAppearance = { wall: 'wallColor' };
    assert.throws(() => validateCampusLandmarks([a]), /Unverified/);
    assert.deepEqual(landmarkAppearance(null, a), {});
  }
});
test('invalid dates, colors and nonfinite heights are rejected', () => {
  for (const value of [Infinity, -1, 0]) {
    const a = record(); a.fields.heightMeters = { value, status: 'reported', confidence: 'medium', sourceUrl: 'https://iu.ac.bd/', observedAt: '2026-11-07' };
    assert.throws(() => validateCampusLandmarks([a]), /dimension/);
  }
  const a = record(); a.identitySource.retrievedAt = '2026-02-31';
  assert.throws(() => validateCampusLandmarks([a]), /provenance/);
});
