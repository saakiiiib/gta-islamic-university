import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { pointInMultiPolygon, pointInRing, pointToSegmentDistance } from '../src/map/geometry.js';
import { planVegetation, vegetationAllowed } from '../src/world/vegetation.js';
import { planReferenceVegetation } from '../src/world/referenceVegetation.js';

const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
const ring = (x, z, width, depth) => [[x, z], [x + width, z], [x + width, z + depth], [x, z + depth], [x, z]];
const plants = result => [...result.trees, ...result.shrubs];

test('actual source-inspired plants stay eligible, canopy-clear and outside every mapped pitch', () => {
  const before = JSON.stringify(map), result = planReferenceVegetation(map);
  assert.equal(JSON.stringify(map), before);
  assert.ok(result.trees.length > 0 && result.trees.length <= 300);
  assert.ok(result.shrubs.length > 0 && result.shrubs.length <= 160); assert.ok(plants(result).length <= 460);
  assert.equal(result.provenance.measured, false); assert.equal(result.provenance.speciesStatus, 'unspecified');
  assert.equal(result.provenance.plantLocationsStatus, 'illustrative-not-surveyed');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result, 'preparation can serialize the complete plan');
  for (const p of plants(result)) {
    const green = map.greens.find(g => g.id === p.greenId); assert.ok(green);
    assert.match(green.kind, /^(forest|wood|orchard|garden|park|grass|meadow|grassland)$/);
    assert.ok(vegetationAllowed([p.x, p.z], green, map, p.radius));
    assert.ok(pointInMultiPolygon([p.x, p.z], green.polygons));
    for (const pitch of map.greens.filter(g => /pitch|recreation_ground/.test(g.kind))) {
      assert.equal(pointInMultiPolygon([p.x, p.z], pitch.polygons), false);
      for (const polygon of pitch.polygons) for (const r of polygon) for (let i = 1; i < r.length; i++) {
        assert.ok(pointToSegmentDistance([p.x, p.z], r[i - 1], r[i]) >= p.radius);
      }
    }
    for (const tree of map.trees) assert.ok(Math.hypot(tree.x - p.x, tree.z - p.z) >= p.radius + 2.8);
    for (const row of map.treeRows) for (const path of row.paths) for (let i = 1; i < path.length; i++) {
      assert.ok(pointToSegmentDistance([p.x, p.z], path[i - 1], path[i]) >= p.radius + 2.8);
    }
  }
  for (const [i, a] of plants(result).entries()) for (const b of plants(result).slice(i + 1)) {
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= a.radius + b.radius);
  }
});

test('art spacing distinguishes groves, orchards, gardens, parks and sparse grass while pitches are excluded', () => {
  const greens = ['forest', 'wood', 'orchard', 'garden', 'park', 'grass', 'meadow', 'grassland', 'pitch', 'recreation_ground']
    .map((kind, i) => ({ id: String(100 + i), osmType: 'way', kind, polygons: [[ring(i * 130, 0, 110, 100)]] }));
  const result = planReferenceVegetation({ greens });
  assert.deepEqual(result.provenance.spacingMeters, { forest: 8, wood: 8, orchard: 9, garden: 14, park: 15, grass: 24, meadow: 24, grassland: 24 });
  assert.equal(result.provenance.greens.length, 8);
  assert.equal(result.provenance.greens.some(g => /pitch|recreation_ground/.test(g.kind)), false);
  assert.equal(plants(result).some(p => ['108', '109'].includes(p.greenId)), false);
});

test('synthetic holes, building courtyards and mapped source trees/rows remain unplanted', () => {
  const source = { greens: [{ osmType: 'way', id: '1', kind: 'forest', polygons: [[ring(0, 0, 100, 100), ring(35, 35, 30, 30)]] }],
    buildings: [{ id: 'building', polygons: [[ring(5, 5, 25, 25), ring(12, 12, 10, 10)]] }],
    trees: [{ id: 'mapped-tree', x: 80, z: 80, radius: 4 }], treeRows: [{ id: 'row', paths: [[[8, 75], [65, 75]]] }] };
  const before = JSON.stringify(source), result = planReferenceVegetation(source); assert.ok(plants(result).length > 0);
  assert.equal(JSON.stringify(source), before);
  for (const p of plants(result)) {
    assert.ok(vegetationAllowed([p.x, p.z], source.greens[0], source, p.radius));
    assert.equal(pointInRing([p.x, p.z], source.greens[0].polygons[0][1]), false);
    assert.equal(pointInRing([p.x, p.z], source.buildings[0].polygons[0][1]), false);
    assert.ok(Math.hypot(p.x - 80, p.z - 80) >= p.radius + 4);
    assert.ok(pointToSegmentDistance([p.x, p.z], [8, 75], [65, 75]) >= p.radius + 2.8);
  }
});

test('deterministic typed and geometry fallback keys survive source-feature reordering and keep legacy independent', () => {
  const before = planVegetation(map), a = planReferenceVegetation(map), b = planReferenceVegetation(map);
  assert.deepEqual(a, b); assert.deepEqual(planVegetation(map), before, 'legacy planning remains untouched');
  const reordered = { ...map, greens: [...map.greens].reverse() };
  assert.deepEqual(planReferenceVegetation(reordered), a);
  const synthetic = { greens: [
    { id: '7', osmType: 'way', kind: 'garden', polygons: [[ring(0, 0, 80, 80)]] },
    { id: '7', osmType: 'relation', kind: 'garden', polygons: [[ring(100, 0, 80, 80)]] },
    { kind: 'forest', polygons: [[ring(200, 0, 80, 80)]] },
  ] };
  const result = planReferenceVegetation(synthetic);
  assert.ok(result.provenance.greens.some(g => g.key === 'way/7'));
  assert.ok(result.provenance.greens.some(g => g.key === 'relation/7'));
  assert.ok(result.provenance.greens.some(g => g.key.startsWith('geometry/')));
  assert.equal(new Set(plants(result).map(p => p.id)).size, plants(result).length);
  assert.deepEqual(planReferenceVegetation({ greens: [...synthetic.greens].reverse() }), result);
  a.provenance.sources[0].role = 'changed'; a.provenance.spacingMeters.forest = 999;
  assert.notEqual(b.provenance.sources[0].role, 'changed'); assert.equal(b.provenance.spacingMeters.forest, 8);
});

test('explicit budgets stay below hard maxima and empty/zero-cap/pitch-only inputs produce no planting', () => {
  const limited = planReferenceVegetation(map, { treeCap: 3, shrubCap: 2 });
  assert.ok(limited.trees.length <= 3 && limited.shrubs.length <= 2);
  const oversize = planReferenceVegetation(map, { treeCap: 1000, shrubCap: 1000 });
  assert.ok(oversize.trees.length <= 300 && oversize.shrubs.length <= 160);
  for (const input of [{}, { greens: [] }, { greens: [{ id: 'pitch', kind: 'pitch', polygons: [[ring(0, 0, 100, 100)]] }] }]) {
    const result = planReferenceVegetation(input); assert.deepEqual(result.trees, []); assert.deepEqual(result.shrubs, []);
  }
  const zero = planReferenceVegetation(map, { treeCap: 0, shrubCap: 0 }); assert.equal(plants(zero).length, 0);
  for (const cap of [-1, 1.5, NaN, Infinity, '3']) {
    assert.throws(() => planReferenceVegetation(map, { treeCap: cap }), /treeCap/);
    assert.throws(() => planReferenceVegetation(map, { shrubCap: cap }), /shrubCap/);
  }
});
