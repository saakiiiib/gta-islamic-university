import { interiorAnchor, sourceName } from '../map/places.js';

const preferred = [
  ['9027931168', 'arrival'], ['9027931167', 'arrival'], ['532464097', 'library'], ['18079379', 'academic'],
  ['18079380', 'administration'], ['532464636', 'cafeteria'], ['18079381', 'academic'],
  ['18079382', 'academic'], ['18079384', 'academic'], ['18079386', 'academic'],
];
const category = name => /main gate/i.test(name) ? 'arrival' : /library/i.test(name) ? 'library'
  : /cafeteria|canteen/i.test(name) ? 'cafeteria' : /administrat/i.test(name) ? 'administration'
    : /faculty|academic|arts building|science building|bba building/i.test(name) ? 'academic' : null;

/** Source-backed destinations only. Building anchors are NOT pedestrian spawn points. */
export function buildActivityHubs(map) {
  const places = [...(map.places ?? [])];
  for (const building of map.buildings ?? []) {
    if (places.some(p => p.buildingId === building.id)) continue;
    const named = sourceName(building.tags), anchor = interiorAnchor(building.polygons);
    if (named && anchor) places.push({ id: `buildings:${building.id}`, buildingId: building.id,
      ...named, x: anchor[0], z: anchor[1], sourceIds: [`buildings:${building.id}`] });
  }
  const hubs = [];
  const add = (place, kind) => {
    if (!place || !Number.isFinite(place.x) || !Number.isFinite(place.z) || !place.name || hubs.some(h => h.id === place.id)) return;
    hubs.push({ id: place.id, name: place.name, x: place.x, z: place.z, kind,
      sourceIds: [...(place.sourceIds ?? [place.id])] });
  };
  for (const [id, kind] of preferred) add(places.find(p => p.id === `node:${id}` || p.buildingId === id || p.id === `buildings:${id}`), kind);
  for (const place of places) {
    const kind = category(place.name);
    if (kind) add(place, kind);
  }
  return hubs;
}
