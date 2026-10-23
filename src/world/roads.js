import clipping from 'polygon-clipping';
import { bufferPaths, clipPolygons } from '../map/geometry.js';
import { measurePath, samplePath } from './bridge.js';

export const ROAD_LEVELS = Object.freeze({ asphalt: 0.04, path: 0.047, edge: 0.052, marking: 0.06, curbBase: 0.052, curbTop: 0.13 });
export const isWalking = road => /^(path|footway|cycleway|pedestrian|steps|track)$/.test(road.kind);
export const union = parts => { const valid = parts.filter(p => p?.length); return valid.length ? clipping.union(...valid) : []; };
export const subtract = (subject, ...cuts) => subject.length ? clipping.difference(subject, ...cuts.filter(p => p.length)) : [];

// Match the deck's square end cross-sections. Its water corridor has round caps;
// using those caps to cut pavement would leave an artificial gap at each ramp.
export function bridgeDeckFootprint(bridge) {
  const pieces = [];
  for (const path of bridge.paths ?? []) {
    if (path.length < 2) continue;
    const { distances, length } = measurePath(path), ramp = Math.min(bridge.rampLength ?? 4, length * .3);
    if (length < .01) continue;
    const sections = [...new Set([0, ramp, length - ramp, length, ...distances])].sort((a, b) => a - b).map(d => {
      const p = samplePath(path, distances, d), half = (bridge.width ?? 2.2) / 2;
      return [[p.x + p.nx * half, p.z + p.nz * half], [p.x - p.nx * half, p.z - p.nz * half]];
    });
    for (let i = 1; i < sections.length; i++) pieces.push([[sections[i - 1][0], sections[i][0], sections[i][1], sections[i - 1][1], sections[i - 1][0]]]);
  }
  return union(pieces);
}

/** Visual surfaces only: source ways, widths and collision geometry are untouched. */
export function buildRoadAppearance(map) {
  const roads = map.roads ?? [], bridges = map.bridges ?? [];
  const vehicleWays = roads.filter(r => !isWalking(r)), walkingWays = roads.filter(isWalking);
  const vehicles = union(vehicleWays.map(r => r.polygons));
  const walkUnion = union(walkingWays.map(r => r.polygons));
  const bridgeDecks = union(bridges.map(bridgeDeckFootprint));
  const asphalt = subtract(vehicles, bridgeDecks);
  const paths = subtract(walkUnion, vehicles, bridgeDecks);
  const transport = union([vehicles, walkUnion, bridgeDecks].filter(p => p.length));
  const forbidden = union([...(map.buildings ?? []), ...(map.water ?? [])].map(f => f.polygons));
  const bridgeOpenings = union(bridges.map(b => bufferPaths(b.paths, b.width + 3, map.bounds)));
  // A gap wider than the path prevents a raised lip across every walking connection.
  const walkOpenings = union(walkingWays.map(r => bufferPaths(r.paths, r.width + 1.6, map.bounds)));
  const boundaries = vehicles.flatMap(p => p);
  const edgeEnvelope = bufferPaths(boundaries, 0.52, map.bounds);
  const curbEnvelope = bufferPaths(boundaries, 1.10, map.bounds);
  const edges = subtract(edgeEnvelope, transport, forbidden, bridgeOpenings, walkOpenings);
  const curbs = subtract(curbEnvelope, transport, edgeEnvelope, forbidden, bridgeOpenings, walkOpenings);
  const markings = [];
  for (const road of vehicleWays.filter(r => /^(trunk|tertiary)$/.test(r.kind))) {
    const junctions = union(vehicleWays.filter(r => r !== road).map(r => bufferPaths(r.paths, r.width + 2, map.bounds)));
    for (const path of road.paths) {
      const { distances, length } = measurePath(path);
      for (let d = 2; d + 3 < length; d += 9) {
        const a = samplePath(path, distances, d), b = samplePath(path, distances, d + 3);
        const ribbon = [[[[a.x + a.nx * .065, a.z + a.nz * .065], [b.x + b.nx * .065, b.z + b.nz * .065],
          [b.x - b.nx * .065, b.z - b.nz * .065], [a.x - a.nx * .065, a.z - a.nz * .065], [a.x + a.nx * .065, a.z + a.nz * .065]]]];
        markings.push(...subtract(clipping.intersection(ribbon, asphalt), junctions));
      }
    }
  }
  const bounded = polygons => map.bounds ? clipPolygons(polygons, map.bounds) : polygons;
  return { asphalt, paths, edges: bounded(edges), curbs: bounded(curbs), markings, bridgeOpenings, walkOpenings };
}
