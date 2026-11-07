import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HALL_OBSERVATIONS, applyHallObservations } from '../src/data/hall-observations.js';
import { landmarkRecords } from '../src/data/campus-landmark-records.js';
import { validateCampusLandmarks, landmarkAppearance } from '../src/data/campus-landmarks.js';
import { parseOsm, buildMapData } from '../src/map/index.js';

const key = record => `${record.osmType}/${record.osmId}`;
const originals = structuredClone(landmarkRecords);
const applied = applyHallObservations(originals);

test('eight established halls have typed historical sources; seven supported palettes pass the registry validator', () => {
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  assert.equal(Object.keys(HALL_OBSERVATIONS).length, 8);
  assert.equal(validateCampusLandmarks(applied, map.buildings), true);
  for (const [id, observation] of Object.entries(HALL_OBSERVATIONS)) {
    assert.match(id, /^way\/\d+$/);
    const record = applied.find(r => key(r) === id); assert.ok(record);
    assert.ok(Object.isFrozen(observation.fields));
    for (const [field, evidence] of Object.entries(observation.fields)) {
      if (evidence.value === null) {
        assert.equal(evidence.status, 'unknown'); assert.equal(evidence.confidence, 'unknown');
      } else {
        assert.equal(evidence.status, 'observed'); assert.equal(evidence.confidence, 'medium');
        assert.equal(evidence.sourceUrl, observation.sourceUrl); assert.equal(evidence.observedAt, observation.observedAt);
        assert.match(evidence.reason, /[Hh]istorical photograph/); assert.match(evidence.reason, /lighting-dependent/);
        assert.match(evidence.reason, /not a current survey or measured/);
      }
      if (field === 'facadeMaterial') assert.equal(evidence.value, null, 'no structural material inferred from surface color');
    }
  }
  const halls = applied.filter(r => HALL_OBSERVATIONS[key(r)] && r.osmId !== '970015482');
  assert.equal(halls.length, 7);
  assert.equal(new Set(halls.map(r => r.fields.wallColor.value)).size, 7);
  for (const hall of halls) assert.equal(landmarkAppearance(null, hall).wall, parseInt(hall.fields.wallColor.value.slice(1), 16));
});

test('gate-only Aisha, July roof color and unresolvable aerial window patterns stay unknown', () => {
  const aisha = originals.find(r => r.osmId === '970015482');
  assert.deepEqual(applied.find(r => key(r) === key(aisha)), aisha);
  assert.deepEqual(landmarkAppearance(null, applied.find(r => key(r) === key(aisha))), {});
  const july = applied.find(r => r.osmId === '532464846');
  assert.equal(july.fields.roofColor.value, null); assert.equal(july.renderAppearance.roof, undefined);
  for (const id of ['532464712', '532464760']) {
    assert.equal(applied.find(r => r.osmId === id).fields.windowPattern.value, null);
  }
});

test('appearance application preserves dimensions, names, aliases, source records and all unrelated buildings', () => {
  const before = JSON.stringify(originals), output = applyHallObservations(originals);
  assert.equal(JSON.stringify(originals), before); assert.notEqual(output, originals);
  for (let i = 0; i < output.length; i++) {
    const a = originals[i], b = output[i]; assert.notEqual(a, b);
    assert.deepEqual(b.names, a.names); assert.notEqual(b.names, a.names);
    assert.deepEqual(b.identitySource, a.identitySource);
    assert.deepEqual(b.fields.heightMeters, a.fields.heightMeters);
    assert.deepEqual(b.fields.storeys, a.fields.storeys);
    assert.deepEqual(b.fields.facadeMaterial, a.fields.facadeMaterial);
    assert.equal(b.renderHeight, a.renderHeight);
    if (!HALL_OBSERVATIONS[key(a)]) assert.deepEqual(b, a);
  }
  const relation = structuredClone(originals.find(r => r.osmId === '532464837')); relation.osmType = 'relation';
  assert.deepEqual(applyHallObservations([relation]), [relation], 'matching numerical ID is insufficient without OSM way type');
  const mosque = output.find(r => r.osmId === '1317423300');
  assert.deepEqual(mosque, originals.find(r => r.osmId === '1317423300'), 'hall-name mosque is not mistaken for a residential hall');
});

test('existing evidence and explicit rendering choices survive, and results share no mutable observations', () => {
  const input = structuredClone(originals.find(r => r.osmId === '967967198'));
  input.fields.wallColor = { value: '#aabbcc', status: 'observed', confidence: 'high', sourceUrl: 'https://iu.ac.bd/',
    observedAt: '2026-11-07', reason: 'Caller-provided later appearance evidence.' };
  input.fields.roofColor = { value: null, status: 'unknown', confidence: 'unknown', sourceUrl: null, observedAt: null, reason: 'Unknown fixture roof' };
  input.renderAppearance = { wall: 'wallColor', accent: 'wallColor' };
  const [first] = applyHallObservations([input]), [second] = applyHallObservations([input]);
  assert.deepEqual(first.fields.wallColor, input.fields.wallColor);
  assert.equal(first.renderAppearance.accent, 'wallColor');
  assert.equal(first.renderAppearance.roof, 'roofColor');
  assert.equal(validateCampusLandmarks([first]), true);
  first.names.aliases.push('test alias'); first.fields.roofColor.value = '#000000';
  assert.notDeepEqual(first.names.aliases, input.names.aliases);
  assert.notEqual(first.fields.roofColor.value, second.fields.roofColor.value);
  assert.notEqual(first.fields.roofColor.value, HALL_OBSERVATIONS[key(input)].fields.roofColor.value);
  assert.deepEqual(applyHallObservations([second]), [second], 'repeated application is stable');
  for (const records of [null, {}, 'halls']) assert.throws(() => applyHallObservations(records), /record array/);
});

test('world palette consumes the seven typed hall records while Aisha retains the fallback', async () => {
  const { buildingPalette } = await import('../src/world/appearance.js');
  for (const [id, source] of Object.entries(HALL_OBSERVATIONS)) {
    const [osmType, osmId] = id.split('/');
    const actual = buildingPalette({ id: osmId, osmType, tags: { building: 'dormitory' } });
    if (source.fields.wallColor.value) assert.equal(actual.wall, parseInt(source.fields.wallColor.value.slice(1), 16));
    else assert.deepEqual(landmarkAppearance({ id: osmId, osmType }), {});
  }
});
