// CPU-only world inventory. No browser/GPU, assets, source writes or checkout.
// Usage: node campus-budget.mjs <repository-root> [snapshot-label]
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repo = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const load = relative => import(pathToFileURL(resolve(repo, relative)).href);
const [{ parseOsm, buildMapData }, { buildWorld }, { planVegetation }] = await Promise.all([
  load('src/map/index.js'), load('src/world/buildWorld.js'), load('src/world/vegetation.js'),
]);
const raw = await readFile(resolve(repo, 'public/data/map.osm'));
const map = buildMapData(parseOsm(raw.toString('utf8')), { trimToCampus: true });
const legacy = planVegetation(map), started = performance.now(), world = buildWorld(map);
const constructionMilliseconds = performance.now() - started;
try {
  const geometries = new Set(), materials = new Set(), buffers = new Set(), textures = new Set();
  const addBuffer = attribute => { if (attribute?.array?.buffer) buffers.add(attribute.array.buffer); };
  const roots = [world.group, world.collisionGroup, world.scenery?.collisionGroup].filter(Boolean);
  for (const root of roots) root.traverse(object => {
    if (object.geometry) {
      geometries.add(object.geometry);
      Object.values(object.geometry.attributes).forEach(addBuffer); addBuffer(object.geometry.index);
    }
    addBuffer(object.instanceMatrix); addBuffer(object.instanceColor);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  let objects = 0, meshes = 0, lines = 0, instances = 0, instancedMeshes = 0, drawCandidates = 0, triangleCandidates = 0;
  const families = {};
  world.group.traverseVisible(object => {
    if (!object.geometry || (!object.isMesh && !object.isLine && !object.isPoints)) return;
    if (object.isInstancedMesh && !object.count) return;
    const available = (object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0);
    if (!available) return;
    const activeMaterials = Array.isArray(object.material) ? object.geometry.groups
      .filter(group => group.count && object.material[group.materialIndex]?.visible !== false).length : object.material?.visible === false ? 0 : 1;
    if (!activeMaterials) return;
    objects++; drawCandidates += activeMaterials;
    if (object.isMesh) meshes++; if (object.isLine) lines++;
    const count = object.isInstancedMesh ? object.count : 1;
    if (object.isInstancedMesh) { instances += count; instancedMeshes++; }
    if (object.isMesh) triangleCandidates += available / 3 * count;
    const family = object.name || object.type;
    families[family] ??= { objects: 0, instances: 0, triangleCandidates: 0 };
    families[family].objects++; families[family].instances += object.isInstancedMesh ? count : 0;
    families[family].triangleCandidates += object.isMesh ? available / 3 * count : 0;
  });
  const colliderCounts = roots.slice(1).map(root => {
    let meshCount = 0; root.traverse(object => { if (object.isMesh) meshCount++; });
    return { root: root.name, meshes: meshCount };
  });
  console.log(JSON.stringify({
    label: process.argv[3] ?? 'current-working-tree',
    sourceMapSha256: createHash('sha256').update(raw).digest('hex'),
    scope: 'CPU inventory before asset loading; no browser renderer/GPU/frame/shadow measurement',
    baselineComparison: 'Full main-world metrics not measured. Legacy vegetation is an isolated planner comparison on the same current map.',
    map: Object.fromEntries(['buildings', 'roads', 'greens', 'water', 'bridges', 'trees', 'treeRows', 'places', 'entrances']
      .map(key => [key, (map[key] ?? []).length])),
    visibleWorld: { renderObjects: objects, meshObjects: meshes, lineObjects: lines, instancedMeshes,
      instances, drawCandidatesNoCullingOrShadows: drawCandidates, triangleCandidatesIncludingInstances: triangleCandidates },
    resourcesIncludingCollidersAndHiddenDebug: { uniqueGeometries: geometries.size, uniqueMaterials: materials.size,
      uniqueTexturesPresent: textures.size, distinctArrayBufferBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) },
    colliders: colliderCounts,
    proceduralVegetation: { current: { trees: world.decoration.vegetation.trees.length, shrubs: world.decoration.vegetation.shrubs.length },
      legacyPlannerSameMap: { trees: legacy.trees.length, shrubs: legacy.shrubs.length } },
    waterDetails: world.waterDetails ? { instances: world.waterDetails.diagnostics.instanceCount, draws: world.waterDetails.diagnostics.drawCalls } : null,
    landmarkModels: (world.landmarkModels ?? []).map(model => ({ osmId: model.diagnostics.osmId, draws: model.diagnostics.drawCalls })),
    constructionMilliseconds: Math.round(constructionMilliseconds * 10) / 10,
    families,
  }, null, 2));
} finally { world.dispose(); }
