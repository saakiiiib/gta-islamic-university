import { pointInPolygon, pointToSegmentDistance, ringBounds } from './geometry.js';

export function sourceName(tags = {}, entrance = false) {
  for (const key of ['name:en', 'name', ...(entrance ? ['ref'] : [])]) {
    if (tags[key]?.trim()) return { name: tags[key].trim(), nameTag: key };
  }
  return null;
}

/** An interior anchor, including for concave footprints and buildings with courtyards. */
export function interiorAnchor(polygons) {
  for (const polygon of polygons ?? []) {
    const b = ringBounds(polygon[0]), center = [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
    if (pointInPolygon(center, polygon)) return center;
    for (let i = 1; i < polygon[0].length; i++) {
      const a = polygon[0][i - 1], c = polygon[0][i];
      for (const t of [.03, .1, .25, .5]) {
        const candidate = [(a[0] + c[0]) / 2 * (1 - t) + center[0] * t, (a[1] + c[1]) / 2 * (1 - t) + center[1] * t];
        if (pointInPolygon(candidate, polygon)) return candidate;
      }
    }
  }
  return null;
}

export function deduplicatePlaces(places, radius = 80) {
  const output = [];
  for (const place of places) {
    const existing = output.find(p => p.name.toLowerCase() === place.name.toLowerCase() && Math.hypot(p.x - place.x, p.z - place.z) < radius);
    if (existing) existing.sourceIds.push(...place.sourceIds);
    else output.push({ ...place, sourceIds: [...place.sourceIds] });
  }
  return output;
}

export function buildPlaceMetadata(map, nodes, positions) {
  const entrances = [], places = [];
  const inBounds = ([x, z]) => x >= map.bounds.minX && x <= map.bounds.maxX && z >= map.bounds.minZ && z <= map.bounds.maxZ;
  for (const node of nodes.values()) {
    const p = positions.get(node.id);
    if (!inBounds(p)) continue;
    const isEntrance = !!node.tags.entrance && node.tags.entrance !== 'no';
    if (isEntrance) {
      let buildingId = null, closest = .8;
      for (const building of map.buildings) for (const polygon of building.polygons) for (const ring of polygon) {
        for (let i = 1; i < ring.length; i++) {
          const d = pointToSegmentDistance(p, ring[i - 1], ring[i]);
          if (d < closest) { closest = d; buildingId = building.id; }
        }
      }
      entrances.push({ id: node.id, x: p[0], z: p[1], tags: node.tags, buildingId, source: 'osm:node' });
    }
    const named = sourceName(node.tags, isEntrance);
    if (named && (isEntrance || node.tags.place || node.tags.amenity || node.tags.historic || node.tags.tourism)) {
      places.push({ id: `node:${node.id}`, sourceIds: [`node:${node.id}`], ...named, kind: isEntrance ? 'entrance' : 'place', x: p[0], y: 3, z: p[1] });
    }
  }
  for (const type of ['buildings', 'greens', 'water', 'roads', 'bridges']) for (const feature of map[type]) {
    const named = sourceName(feature.tags);
    if (!named) continue; // Synthetic display fallbacks are deliberately not source names.
    let point = interiorAnchor(feature.polygons);
    if (type === 'roads' && feature.paths?.[0]?.length) point = feature.paths[0][Math.floor(feature.paths[0].length / 2)];
    if (!point || !inBounds(point)) continue;
    places.push({ id: `${type}:${feature.id}`, sourceIds: [`${type}:${feature.id}`], ...named, kind: type === 'buildings' ? 'building' : type,
      buildingId: type === 'buildings' ? feature.id : null, x: point[0], y: (type === 'buildings' ? feature.height : 0) + 3.5, z: point[1] });
  }
  return { entrances, places: deduplicatePlaces(places) };
}
