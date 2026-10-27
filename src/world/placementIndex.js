import { ringBounds } from '../map/geometry.js';

/** Conservative broadphase only; the original precise predicates still decide
 * placement. Objects spanning cells are deduplicated without changing source data. */
export class PlacementIndex {
  constructor(features, size = 32) {
    this.size = size; this.cells = new Map();
    for (const feature of features) {
      const points = (feature.polygons ?? []).flatMap(p => p.flat()).concat((feature.paths ?? []).flat());
      if (Number.isFinite(feature.x) && Number.isFinite(feature.z)) points.push([feature.x, feature.z]);
      if (!points.length) continue;
      const bounds = ringBounds(points), item = { feature, bounds };
      for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++)
        for (let z = Math.floor(bounds.minZ / size); z <= Math.floor(bounds.maxZ / size); z++) {
          const key = `${x},${z}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(item);
        }
    }
  }
  near(point, radius = 0) {
    const [x, z] = point, size = this.size, found = new Set();
    for (let ix = Math.floor((x - radius) / size); ix <= Math.floor((x + radius) / size); ix++)
      for (let iz = Math.floor((z - radius) / size); iz <= Math.floor((z + radius) / size); iz++)
        for (const item of this.cells.get(`${ix},${iz}`) ?? []) {
          const b = item.bounds;
          if (b.minX <= x + radius && b.maxX >= x - radius && b.minZ <= z + radius && b.maxZ >= z - radius) found.add(item.feature);
        }
    return found;
  }
}

const cache = new WeakMap();
export function placementIndexes(map) {
  if (!cache.has(map)) {
    const pitches = (map.greens ?? []).filter(g => /pitch|recreation_ground/.test(g.kind));
    cache.set(map, {
      roads: new PlacementIndex(map.roads ?? []), buildings: new PlacementIndex(map.buildings ?? []),
      waters: new PlacementIndex([...(map.bridges ?? []), ...(map.water ?? [])]),
      pitches: new PlacementIndex(pitches), entrances: new PlacementIndex(map.entrances ?? []),
      trees: new PlacementIndex(map.trees ?? []), rows: new PlacementIndex(map.treeRows ?? []),
      vegetationExclusions: new PlacementIndex([...(map.roads ?? []), ...(map.bridges ?? []), ...(map.buildings ?? []), ...(map.water ?? []), ...pitches]),
    });
  }
  return cache.get(map);
}
