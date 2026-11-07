import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData, parseMetres } from '../src/map/osm.js';
import { bufferPaths } from '../src/map/geometry.js';
import { resolveRoadWidth } from '../src/map/roadEvidence.js';

const road = { id: '1317423277', kind: 'service' };
const override = { value: 5.4, status: 'observed', confidence: 'medium', sourceUrl: 'https://iu.ac.bd/',
  observedAt: '2026-11-07', reason: 'Synthetic source-backed override fixture, not an actual campus measurement.' };

test('road class defaults are unchanged, explicit inferred estimates with unknown surfaces', () => {
  for (const [kind, expected] of Object.entries({ service: 6, unclassified: 6, footway: 2.2, path: 2.2,
    pedestrian: 2.2, cycleway: 2.2, tertiary: 8, trunk: 7, residential: 6, primary: 6, unknown: 6, __test__: 6,
    toString: 6 })) {
    const result = resolveRoadWidth({ ...road, kind });
    assert.equal(result.width, expected); assert.equal(result.widthEvidence.value, expected);
    assert.equal(result.widthEvidence.status, 'inferred'); assert.equal(result.widthEvidence.confidence, 'low');
    assert.equal(result.widthEvidence.measured, false); assert.equal(result.widthEvidence.surveyStatus, 'pending');
    assert.equal(result.widthEvidence.sourceUrl, null); assert.equal(result.widthEvidence.observedAt, null);
    assert.equal(result.surfaceEvidence.value, null); assert.equal(result.surfaceEvidence.status, 'unknown');
  }
  assert.equal(resolveRoadWidth({ id: road.id }).width, 6);
});

test('parsed source metres win over a validated override; otherwise the override wins before defaults', () => {
  const mapped = resolveRoadWidth({ ...road, sourceWidth: 7.6, override });
  assert.equal(mapped.width, 7.6); assert.equal(mapped.widthEvidence.status, 'mapped');
  assert.equal(mapped.widthEvidence.source, 'osm'); assert.equal(mapped.widthEvidence.basis, 'width');
  assert.equal(mapped.widthEvidence.osmType, 'way'); assert.equal(mapped.widthEvidence.osmId, road.id);
  assert.equal(mapped.widthEvidence.sourceUrl, `https://www.openstreetmap.org/way/${road.id}`);
  assert.equal(mapped.widthEvidence.measured, false); assert.equal(mapped.widthEvidence.observedAt, null);
  for (const status of ['observed', 'reported']) for (const confidence of ['medium', 'high']) {
    const result = resolveRoadWidth({ ...road, override: { ...override, status, confidence } });
    assert.equal(result.width, 5.4); assert.equal(result.widthEvidence.status, status);
    assert.equal(result.widthEvidence.sourceUrl, override.sourceUrl); assert.equal(result.widthEvidence.observedAt, override.observedAt);
    assert.equal(result.widthEvidence.reason, override.reason); assert.equal(result.widthEvidence.measured, false);
  }
  assert.equal(resolveRoadWidth({ ...road, override: { ...override, measured: true } }).widthEvidence.measured, true,
    'measured is retained only when explicitly supplied with source-backed evidence');
});

test('invalid caller-parsed widths fall back rather than reinterpret raw tags or nonnumeric values', () => {
  for (const sourceWidth of [undefined, null, NaN, Infinity, -Infinity, 0, -3, '7.5', {}, true]) {
    assert.equal(resolveRoadWidth({ ...road, sourceWidth, tags: { width: '99 ft' } }).width, 6);
    assert.equal(resolveRoadWidth({ ...road, sourceWidth, override }).width, override.value);
  }
});

test('surface evidence comes only from the raw OSM tag, independently of width selection', () => {
  for (const surface of ['asphalt', 'gravel', 'unpaved', ' concrete ']) {
    const tags = Object.freeze({ surface }), result = resolveRoadWidth({ ...road, tags, override });
    assert.equal(result.surfaceEvidence.value, surface); assert.equal(result.surfaceEvidence.status, 'mapped');
    assert.equal(result.surfaceEvidence.sourceUrl, `https://www.openstreetmap.org/way/${road.id}`);
    assert.equal(result.surfaceEvidence.observedAt, null); assert.equal(result.surfaceEvidence.measured, false);
    assert.deepEqual(tags, { surface });
  }
  for (const surface of [undefined, null, '', '  ', 4]) {
    assert.equal(resolveRoadWidth({ ...road, tags: { surface }, sourceWidth: 4 }).surfaceEvidence.value, null);
  }
});

test('active overrides require valid dimensions, status, confidence, source and real calendar dates', () => {
  const invalid = [[], '5 metres', { ...override, value: NaN }, { ...override, value: Infinity }, { ...override, value: 0 },
    { ...override, value: -1 }, { ...override, value: '5' }, { ...override, status: 'planned' }, { ...override, status: 'provisional' },
    { ...override, status: 'mapped' }, { ...override, confidence: 'low' }, { ...override, confidence: 'unknown' },
    { ...override, sourceUrl: null }, { ...override, sourceUrl: 'file:///survey' }, { ...override, sourceUrl: 'not-a-url' },
    { ...override, observedAt: null }, { ...override, observedAt: '2026-02-29' }, { ...override, observedAt: '2026-02-31' },
    { ...override, observedAt: '2026-11-07T00:00:00Z' }, { ...override, measured: 'yes' }];
  for (const bad of invalid) {
    assert.throws(() => resolveRoadWidth({ ...road, override: bad }), /override|source|measured/i);
    assert.throws(() => resolveRoadWidth({ ...road, sourceWidth: 8, override: bad }), /override|source|measured/i,
      'invalid configuration must not pass silently just because OSM width currently wins');
  }
  assert.equal(resolveRoadWidth({ ...road, override: { ...override, observedAt: '2024-02-29' } }).width, 5.4);
  for (const id of [undefined, null, '', 'relation/4', 'abc', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => resolveRoadWidth({ ...road, id }), /way ID/);
  }
});

test('evidence is independent of frozen raw tags and nested caller metadata', () => {
  const tags = Object.freeze({ width: '18 ft', surface: 'unpaved', name: 'fixture' });
  const inputOverride = { ...override, metadata: { method: 'fixture only', points: [1, 2] } };
  const before = structuredClone({ tags, inputOverride });
  const first = resolveRoadWidth({ ...road, tags, override: inputOverride });
  const second = resolveRoadWidth({ ...road, tags, override: inputOverride });
  first.widthEvidence.metadata.points.push(3); first.surfaceEvidence.value = 'changed';
  assert.deepEqual({ tags, inputOverride }, before); assert.deepEqual(second.widthEvidence.metadata.points, [1, 2]);
  assert.equal(second.surfaceEvidence.value, 'unpaved');
});

test('all 40 actual derived roads retain their widths and buffered geometry without inventing survey data', () => {
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  const before = JSON.stringify(map.roads); assert.equal(map.roads.length, 40);
  let surfaces = 0;
  for (const existing of map.roads) {
    const result = resolveRoadWidth({ id: existing.id, kind: existing.kind, sourceWidth: parseMetres(existing.tags.width), tags: existing.tags });
    assert.equal(result.width, existing.width); assert.equal(result.widthEvidence.status, 'inferred');
    assert.deepEqual(existing.widthEvidence, result.widthEvidence);
    assert.deepEqual(existing.surfaceEvidence, result.surfaceEvidence);
    assert.equal(result.widthEvidence.measured, false); assert.equal(result.widthEvidence.surveyStatus, 'pending');
    assert.deepEqual(bufferPaths(existing.paths, result.width, map.bounds), existing.polygons);
    if (result.surfaceEvidence.status === 'mapped') { surfaces++; assert.equal(existing.id, '276712534'); }
  }
  assert.equal(surfaces, 1); assert.equal(JSON.stringify(map.roads), before);
});
