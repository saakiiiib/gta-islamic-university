import { pointInMultiPolygon, pointInRing, pointToSegmentDistance, ringBounds } from '../map/geometry.js';
import { hashId } from './appearance.js';
import { placementIndexes } from './placementIndex.js';

function distanceToFeature(point, feature) {
  if (pointInMultiPolygon(point, feature.polygons ?? [])) return 0;
  let distance = Infinity;
  for (const polygon of feature.polygons ?? []) for (const ring of polygon) for (let i = 1; i < ring.length; i++) distance = Math.min(distance, pointToSegmentDistance(point, ring[i - 1], ring[i]));
  return distance;
}

export function vegetationAllowed(point, green, map, radius = 2.8) {
  const index = placementIndexes(map);
  if (!pointInMultiPolygon(point, green.polygons)) return false;
  // Keep the entire canopy inside a surveyed green polygon, away from its holes.
  for (const polygon of green.polygons) for (const ring of polygon) for (let i = 1; i < ring.length; i++) if (pointToSegmentDistance(point, ring[i - 1], ring[i]) < radius) return false;
  for (const building of index.buildings.near(point)) {
    if (building.polygons.some(p => p.slice(1).some(r => pointInRing(point, r)))) return false;
  }
  for (const feature of index.vegetationExclusions.near(point, radius)) {
    if (distanceToFeature(point, feature) < radius) return false;
  }
  return true;
}

export function planVegetation(map, { treeCap = 240, shrubCap = 160 } = {}) {
  const trees = [], shrubs = [], candidates = [];
  for (const green of map.greens ?? []) {
    if (!/^(garden|park|orchard|forest|wood|grass|meadow|grassland)$/.test(green.kind)) continue;
    const spacing = /forest|wood|orchard/.test(green.kind) ? 10 : 17;
    for (const polygon of green.polygons) {
      const b = ringBounds(polygon[0]);
      for (let x = Math.ceil(b.minX / spacing) * spacing; x < b.maxX; x += spacing) for (let z = Math.ceil(b.minZ / spacing) * spacing; z < b.maxZ; z += spacing) {
        const id = `${green.id}:${x}:${z}`, seed = hashId(id);
        const point = [x + ((seed % 100) / 100 - .5) * spacing * .5, z + (((seed >>> 8) % 100) / 100 - .5) * spacing * .5];
        candidates.push({ id, seed, green, point });
      }
    }
  }
  // Interleave polygons deterministically rather than filling only the first garden.
  candidates.sort((a, b) => a.seed - b.seed);
  for (const { id, seed, green, point } of candidates) {
    const shrub = green.kind === 'garden' && seed % 3 !== 0;
    const output = shrub ? shrubs : trees, cap = shrub ? shrubCap : treeCap, radius = shrub ? 1.2 : 2.8;
    if (output.length >= cap || !vegetationAllowed(point, green, map, radius)) continue;
    if ([...trees, ...shrubs].some(p => Math.hypot(p.x - point[0], p.z - point[1]) < radius + (p.radius ?? 2.8))) continue;
    output.push({ id, greenId: green.id, x: point[0], z: point[1], radius });
  }
  return { trees, shrubs };
}
