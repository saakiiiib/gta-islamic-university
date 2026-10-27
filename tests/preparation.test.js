import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildRoadAppearance } from '../src/world/roads.js';
import { planVegetation } from '../src/world/vegetation.js';
import { planScenery } from '../src/world/scenery.js';
import { buildWorld } from '../src/world/buildWorld.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { buildVehicleRoutes, getVehicleNetwork } from '../src/vehicle/routes.js';
import { validateCampusPreparation, loadCampusPreparation } from '../src/world/prepared.js';
import { collisionFingerprint } from './helpers/integrity.js';

const bytes = readFileSync(new URL('../public/data/map.osm', import.meta.url));
const map = buildMapData(parseOsm(bytes.toString('utf8')));
map.sourceSha256 = createHash('sha256').update(bytes).digest('hex');
const packet = JSON.parse(readFileSync(new URL('../src/generated/campus-prepared.json', import.meta.url)));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('indexed planting and furniture preserve the original deterministic placements exactly', () => {
  const vegetation = planVegetation(map), scenery = planScenery(map, { vegetation });
  // Fingerprints independently compared with the unmodified 5f2c051 generators.
  assert.equal(hash(vegetation), 'ba1b2d835451ecab15da8ba93f1ecb39b7ebccb7549e73df54721ac2ca1832e4');
  assert.equal(hash(scenery), '46100fa82a9daec35ab355434e3e31a66ac9843a10e7d01d1bde632221670fb5');
  assert.deepEqual(packet.data.vegetation, vegetation);
  assert.deepEqual(packet.data.scenery, scenery);
});

test('prepared road polygons, walking graph and swept van routes match their source generators', () => {
  assert.deepEqual(packet.data.roads, buildRoadAppearance(map));
  const queries = new CampusQueries(map, { obstacles: packet.data.scenery });
  const runtime = buildPedestrianGraph(map, queries);
  const hydrated = buildPedestrianGraph(map, queries, packet.data.pedestrianGraph);
  assert.deepEqual(hydrated.nodes, runtime.nodes);
  assert.deepEqual(hydrated.edges, runtime.edges);
  assert.deepEqual(hydrated.diagnostics, runtime.diagnostics);
  for (const node of runtime.nodes.filter((_, i) => i % 29 === 0)) {
    assert.equal(hydrated.isWalkable(node.x, node.z), runtime.isWalkable(node.x, node.z));
    const next = runtime.nodes[node.neighbors[0]?.to];
    if (next) assert.equal(hydrated.segmentWalkable([node.x, node.z], [next.x, next.z]), runtime.segmentWalkable([node.x, node.z], [next.x, next.z]));
  }
  queries.preparedVehicleNetwork = packet.data.vehicleNetwork;
  assert.deepEqual(getVehicleNetwork(map, queries), buildVehicleRoutes(map, queries));
});

test('prepared world preserves source collider triangles and does not mutate the cached plan', () => {
  const baseline = JSON.parse(readFileSync(new URL('./phase1-baseline.json', import.meta.url)));
  const world = buildWorld(map, { preparedData: packet.data });
  assert.deepEqual(collisionFingerprint(world.collisionGroup), baseline.collision);
  assert.equal(packet.data.scenery.length, 78);
  assert.equal(hash(packet.data), packet.payloadSha256);
  world.dispose();
});

test('preparation requires exact map/schema identity and verifies cached payload bytes', async () => {
  assert.equal(validateCampusPreparation(packet, map), true);
  const fetcher = async () => new Response(JSON.stringify(packet));
  assert.deepEqual(await loadCampusPreparation(map, { fetcher }), packet.data);
  assert.equal(validateCampusPreparation({ ...packet, version: -1 }, map), false);
  assert.equal(validateCampusPreparation(packet, { ...map, sourceSha256: '0'.repeat(64) }), false);
  assert.equal(validateCampusPreparation(packet, { ...map, spawn: { ...map.spawn, x: map.spawn.x + .01 } }), false);
  const corrupt = structuredClone(packet); corrupt.data.vegetation.trees[0].x += 1;
  assert.equal(await loadCampusPreparation(map, { fetcher: async () => new Response(JSON.stringify(corrupt)) }), null);
  assert.equal(await loadCampusPreparation(map, { fetcher: async () => new Response('broken') }), null);
  assert.equal(await loadCampusPreparation(map, { fetcher: async () => new Response('', { status: 404 }) }), null);
  assert.equal(await loadCampusPreparation(map, { fetcher: async () => { throw new Error('offline'); } }), null);
});

test('stalled optional preparation aborts and leaves runtime generation available', async () => {
  let aborted = false;
  const result = await loadCampusPreparation(map, { timeoutMs: 10,
    fetcher: (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); })),
  });
  assert.equal(result, null); assert.equal(aborted, true);
});
