import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { CAMPUS_BOUNDARY_EVIDENCE } from '../src/data/campus-boundary.js';
import { buildScenery } from '../src/world/scenery.js';

test('reports never manufacture boundary segments, surveyed material or full wall', () => {
  assert.ok(Object.isFrozen(CAMPUS_BOUNDARY_EVIDENCE.verifiedSegments));
  assert.deepEqual(CAMPUS_BOUNDARY_EVIDENCE.verifiedSegments, []);
  for (const r of CAMPUS_BOUNDARY_EVIDENCE.reports) {
    assert.equal(r.geometry, null); assert.equal(r.material, null);
    assert.equal(r.status, 'reported-not-georeferenced');
    assert.ok(new URL(r.sourceUrl).hostname);
  }
});

test('existing modeled fence collisions stay separate from physical survey claims', () => {
  const map = buildMapData(parseOsm(readFileSync(new URL('../public/data/map.osm', import.meta.url), 'utf8')), { trimToCampus: true });
  const model = buildScenery(map);
  const fences = model.obstacles.filter(p => p.kind === 'fence');
  assert.ok(fences.length > 0);
  assert.equal(model.boundaryEvidence.illustrativeFenceCount, fences.length);
  assert.equal(model.boundaryEvidence.physicalPerimeterVerified, false);
  assert.equal(model.collisionGroup.children.length, model.obstacles.length);
  assert.ok(fences.every(p => p.source === 'illustrative'));
  model.boundaryEvidence.reports[0].material = 'fixture';
  assert.equal(CAMPUS_BOUNDARY_EVIDENCE.reports[0].material, null);
  model.dispose();
});
