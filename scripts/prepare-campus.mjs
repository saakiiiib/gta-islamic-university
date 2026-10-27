import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseOsm, buildMapData } from '../src/map/index.js';
import { buildRoadAppearance } from '../src/world/roads.js';
import { planVegetation } from '../src/world/vegetation.js';
import { planScenery } from '../src/world/scenery.js';
import { buildMainGate } from '../src/world/mainGate.js';
import { CampusQueries } from '../src/navigation/campusQueries.js';
import { buildPedestrianGraph } from '../src/navigation/graph.js';
import { buildVehicleRoutes } from '../src/vehicle/routes.js';
import { PREPARATION_VERSION, preparationMapKey } from '../src/world/prepared.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const mapBytes = await readFile(resolve(root, 'public/data/map.osm'));
const mapSha256 = sha256(mapBytes), sourceHash = createHash('sha256');
await mkdir(resolve(root, 'src/generated'), { recursive: true });
await writeFile(resolve(root, 'src/generated/campus-source.js'), `// Generated from the unchanged supplied map.\nexport const CAMPUS_MAP_SHA256 = '${mapSha256}';\nexport const CAMPUS_MAP_BYTES = ${mapBytes.byteLength};\n`);
// A source fingerprint avoids regenerating on every preview/build while never
// retaining stale placement or navigation when its implementation changes.
for (const directory of ['src/map', 'src/world', 'src/navigation', 'src/activity', 'src/vehicle']) {
  for (const name of (await readdir(resolve(root, directory))).filter(n => n.endsWith('.js')).sort()) {
    sourceHash.update(`${directory}/${name}`); sourceHash.update(await readFile(resolve(root, directory, name)));
  }
}
sourceHash.update(await readFile(fileURLToPath(import.meta.url)));
const generatorSha256 = sourceHash.digest('hex'), target = resolve(root, 'src/generated/campus-prepared.json');
try {
  const old = JSON.parse(await readFile(target, 'utf8'));
  if (old.version === PREPARATION_VERSION && old.mapSha256 === mapSha256 && old.generatorSha256 === generatorSha256 && old.payloadSha256 === sha256(JSON.stringify(old.data))) {
    console.log('Campus preparation already matches source and unchanged map.'); process.exit(0);
  }
} catch { /* First build, source change or invalid previous packet. */ }

const map = buildMapData(parseOsm(mapBytes.toString('utf8'))), started = performance.now();
const roads = buildRoadAppearance(map), vegetation = planVegetation(map), scenery = planScenery(map, { vegetation });
const gate = buildMainGate({ mapData: map });
const queries = new CampusQueries(map, { obstacles: [...scenery, ...gate.obstacles] });
const pedestrianGraph = buildPedestrianGraph(map, queries), vehicleNetwork = buildVehicleRoutes(map, queries);
gate.dispose();
// Runtime functions are recreated by graph hydration. Store road IDs rather
// than repeating complete OSM road polygons once for every vehicle graph edge.
const data = JSON.parse(JSON.stringify({ roads, vegetation, scenery,
  pedestrianGraph: { nodes: pedestrianGraph.nodes.map(({ neighbors, ...node }) => node), edges: pedestrianGraph.edges, diagnostics: pedestrianGraph.diagnostics },
  vehicleNetwork: { routes: vehicleNetwork.routes, graph: { nodes: vehicleNetwork.graph.nodes,
    edges: vehicleNetwork.graph.edges.map(e => ({ ...e, road: e.road.id })) } },
}));
const packet = { version: PREPARATION_VERSION, mapSha256, mapKey: preparationMapKey(map), generatorSha256,
  payloadSha256: sha256(JSON.stringify(data)), data };
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(packet));
console.log(`Prepared unchanged campus: ${scenery.length} props, ${pedestrianGraph.nodes.length} pedestrian nodes, ${vehicleNetwork.routes.length} van routes in ${((performance.now() - started) / 1000).toFixed(1)}s.`);
