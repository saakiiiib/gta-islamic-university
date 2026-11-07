import { pointToSegmentDistance, ringBounds } from '../map/geometry.js';
import { hashId } from './appearance.js';
import { placementIndexes } from './placementIndex.js';
import { vegetationAllowed } from './vegetation.js';

const SPACING = Object.freeze({ forest: 8, wood: 8, orchard: 9, garden: 14, park: 15,
  grass: 24, meadow: 24, grassland: 24 });
const TREE_RADIUS = 2.8, SHRUB_RADIUS = 1.2;
const SOURCES = Object.freeze([
  { sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cultural_function_at_mango_garden,_islamic_university_kushtia.jpg',
    observedAt: '2010-04-18', role: 'Historical shaded-grove character; not measured tree positions or a species inventory' },
  { sourceUrl: 'https://commons.wikimedia.org/wiki/File:Faculty_of_Arts_building,_Islamic_University,_Bangladesh.jpg',
    observedAt: '2021-04-15', role: 'Historical dense academic-area canopy; not a current canopy survey' },
  { sourceUrl: 'https://commons.wikimedia.org/wiki/File:Grass_fields_at_Islamic_university_kushtia_-_2.jpg',
    observedAt: '2010-05-13', role: 'Historical open field character; mapped pitches receive no procedural planting' },
]);
function budget(value, maximum, name) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a nonnegative integer`);
  return Math.min(value, maximum);
}
function featureKey(green) {
  const type = ['node', 'way', 'relation'].includes(green.osmType) ? green.osmType : 'untyped';
  // Some older parser outputs lack osmType, and synthetic features may lack IDs.
  // Do not invent a mapped way identity for either case.
  return green.id != null ? `${type}/${green.id}` : `geometry/${hashId(JSON.stringify([green.kind, green.polygons]))}`;
}
function clearMappedPlants(point, radius, index, largestMappedRadius) {
  for (const tree of index.trees.near(point, radius + largestMappedRadius)) {
    const mappedRadius = Number.isFinite(tree.radius) && tree.radius > 0 ? tree.radius : TREE_RADIUS;
    if (Math.hypot(tree.x - point[0], tree.z - point[1]) < radius + mappedRadius) return false;
  }
  for (const row of index.rows.near(point, radius + TREE_RADIUS)) for (const path of row.paths ?? []) {
    for (let i = 1; i < path.length; i++) {
      if (pointToSegmentDistance(point, path[i - 1], path[i]) < radius + TREE_RADIUS) return false;
    }
  }
  return true;
}

/**
 * Source-inspired landscape art; no inferred point is an individually surveyed
 * tree, identified species or current canopy observation. Legacy planner stays
 * independent so historic fixtures can continue to reproduce its geometry.
 */
export function planReferenceVegetation(map, { treeCap = 300, shrubCap = 160 } = {}) {
  const caps = { trees: budget(treeCap, 300, 'treeCap'), shrubs: budget(shrubCap, 160, 'shrubCap') };
  const trees = [], shrubs = [], placed = [], candidates = [], greenRecords = [];
  const index = placementIndexes(map);
  const largestMappedRadius = Math.max(TREE_RADIUS, ...(map.trees ?? [])
    .map(tree => Number.isFinite(tree.radius) && tree.radius > 0 ? tree.radius : TREE_RADIUS));
  for (const green of map.greens ?? []) {
    if (!Object.hasOwn(SPACING, green.kind)) continue;
    const spacing = SPACING[green.kind], key = featureKey(green);
    greenRecords.push({ key, id: green.id ?? null, osmType: green.osmType ?? null, kind: green.kind, spacingMeters: spacing });
    for (const [polygonIndex, polygon] of (green.polygons ?? []).entries()) {
      if (!polygon?.[0]?.length || polygon.some(ring => ring.length < 4 || ring.some(point =>
        !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)))) continue;
      const bounds = ringBounds(polygon[0]);
      for (let x = Math.ceil(bounds.minX / spacing) * spacing; x < bounds.maxX; x += spacing) {
        for (let z = Math.ceil(bounds.minZ / spacing) * spacing; z < bounds.maxZ; z += spacing) {
          const id = `reference-vegetation:${key}:${polygonIndex}:${x}:${z}`, seed = hashId(id);
          const point = [x + ((seed & 255) / 255 - .5) * spacing * .46,
            z + (((seed >>> 8) & 255) / 255 - .5) * spacing * .46];
          candidates.push({ id, seed, green, key, point });
        }
      }
    }
  }
  // Global seeded ordering interleaves source polygons. Stable ID tie-breaking
  // also makes feature array order irrelevant when IDs or fallback geometry match.
  candidates.sort((a, b) => a.seed - b.seed || a.id.localeCompare(b.id, 'en'));
  for (const { id, seed, green, key, point } of candidates) {
    const shrub = green.kind === 'garden' && seed % 3 !== 0;
    const output = shrub ? shrubs : trees, cap = shrub ? caps.shrubs : caps.trees, radius = shrub ? SHRUB_RADIUS : TREE_RADIUS;
    if (output.length >= cap || !vegetationAllowed(point, green, map, radius) ||
      !clearMappedPlants(point, radius, index, largestMappedRadius)) continue;
    if (placed.some(p => Math.hypot(p.x - point[0], p.z - point[1]) < radius + p.radius)) continue;
    const plant = { id, greenId: green.id ?? null, greenKey: key, x: point[0], z: point[1], radius };
    output.push(plant); placed.push(plant);
    if (trees.length >= caps.trees && shrubs.length >= caps.shrubs) break;
  }
  return { trees, shrubs, provenance: {
    planner: 'reference-vegetation-v1', densityStatus: 'historical-photo-inspired-art-spacing',
    plantLocationsStatus: 'illustrative-not-surveyed', speciesStatus: 'unspecified', measured: false,
    sources: structuredClone(SOURCES), spacingMeters: { ...SPACING }, canopyRadiiMeters: { tree: TREE_RADIUS, shrub: SHRUB_RADIUS },
    budgets: { trees: caps.trees, shrubs: caps.shrubs, hardTotal: 460 },
    greens: greenRecords.sort((a, b) => a.key.localeCompare(b.key, 'en')),
    exclusions: ['Mapped pitches/recreation grounds', 'Source polygon boundaries and holes',
      'Building volumes and courtyards', 'Roads, water and bridge corridors', 'Mapped tree canopies and tree-row paths'],
    limitations: ['Spacing parameters are artistic; no measured density or species monoculture is implied',
      'Historical canopy photographs do not establish current tree locations or condition',
      'Important individual trees, field fixtures and approach species remain survey work'] } };
}
