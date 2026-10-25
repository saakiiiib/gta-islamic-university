import { pointInPolygon, pointInRing, pointToSegmentDistance, ringBounds } from '../map/geometry.js';
import { bridgeHeightAt } from '../world/bridge.js';
import { union, subtract, bridgeDeckFootprint } from '../world/roads.js';

const EPS = 1e-7;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
export function segmentsIntersect(a, b, c, d) {
  const p = cross(a, b, c), q = cross(a, b, d), r = cross(c, d, a), s = cross(c, d, b);
  if (((p > EPS && q < -EPS) || (p < -EPS && q > EPS)) && ((r > EPS && s < -EPS) || (r < -EPS && s > EPS))) return true;
  return (Math.abs(p) <= EPS && pointToSegmentDistance(c, a, b) <= EPS) || (Math.abs(q) <= EPS && pointToSegmentDistance(d, a, b) <= EPS)
    || (Math.abs(r) <= EPS && pointToSegmentDistance(a, c, d) <= EPS) || (Math.abs(s) <= EPS && pointToSegmentDistance(b, c, d) <= EPS);
}
function segmentDistance(a, b, c, d) {
  return segmentsIntersect(a, b, c, d) ? 0 : Math.min(pointToSegmentDistance(a, c, d), pointToSegmentDistance(b, c, d), pointToSegmentDistance(c, a, b), pointToSegmentDistance(d, a, b));
}
export function localToWorld(x, z, position, yaw) {
  return [position.x + x * Math.cos(yaw) + z * Math.sin(yaw), position.z - x * Math.sin(yaw) + z * Math.cos(yaw)];
}
export function worldToLocal(x, z, position, yaw) {
  const dx = x - position.x, dz = z - position.z;
  return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
}
export function rectangleFootprint(position, yaw, { halfWidth = .82, front = 1.7, rear = 1.82 } = {}, margin = .035) {
  const x = halfWidth + margin, a = front + margin, b = rear + margin;
  return [[-x, -a], [x, -a], [x, b], [-x, b], [-x, -a]].map(([u, v]) => localToWorld(u, v, position, yaw));
}
function rectangleIntersectsPolygon(rect, polygon) {
  if (rect.slice(0, -1).some(p => pointInPolygon(p, polygon)) || polygon[0].some(p => pointInRing(p, rect))) return true;
  for (const ring of polygon) for (let i = 1; i < ring.length; i++) for (let j = 1; j < rect.length; j++) {
    if (segmentsIntersect(rect[j - 1], rect[j], ring[i - 1], ring[i])) return true;
  }
  return false;
}
function discIntersectsPolygon(point, radius, polygon) {
  if (pointInPolygon(point, polygon)) return true;
  return polygon.some(ring => ring.slice(1).some((b, i) => pointToSegmentDistance(point, ring[i], b) <= radius + EPS));
}

class PolygonIndex {
  constructor(polygons, cellSize = 32) {
    this.cells = new Map(); this.cellSize = cellSize;
    polygons.forEach(polygon => {
      const b = ringBounds(polygon[0]);
      for (let x = Math.floor(b.minX / cellSize); x <= Math.floor(b.maxX / cellSize); x++) for (let z = Math.floor(b.minZ / cellSize); z <= Math.floor(b.maxZ / cellSize); z++) {
        const key = `${x},${z}`; if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(polygon);
      }
    });
  }
  near(bounds) {
    const found = new Set(), size = this.cellSize;
    for (let x = Math.floor(bounds.minX / size); x <= Math.floor(bounds.maxX / size); x++) for (let z = Math.floor(bounds.minZ / size); z <= Math.floor(bounds.maxZ / size); z++) {
      for (const p of this.cells.get(`${x},${z}`) ?? []) found.add(p);
    }
    return found;
  }
}

/** Immutable plan-view collision queries: courtyards stay holes, bridge stays a corridor. */
export class CampusQueries {
  constructor(map, { obstacles = [] } = {}) {
    this.map = map; this.bounds = map.bounds ?? { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 };
    const buildings = (map.buildings ?? []).flatMap(b => b.polygons);
    const water = union((map.water ?? []).map(w => w.polygons)), decks = union((map.bridges ?? []).map(bridgeDeckFootprint));
    this.forbiddenWater = subtract(water, decks);
    this.buildings = new PolygonIndex(buildings); this.water = new PolygonIndex(this.forbiddenWater);
    this.roads = new PolygonIndex([...(map.roads ?? []), ...(map.bridges ?? [])].flatMap(r => r.polygons ?? []));
    this.setSceneryObstacles(obstacles);
  }
  /** Illustrative scenery is independent of the immutable OSM map model. */
  setSceneryObstacles(obstacles = []) {
    this.sceneryObstacles = obstacles;
    this.scenery = new PolygonIndex(obstacles.map(o => [o.polygon]).filter(p => p[0]?.length >= 4));
  }
  inBounds(x, z, radius = 0) {
    const b = this.bounds;
    return Number.isFinite(x) && Number.isFinite(z) && x - radius >= b.minX && x + radius <= b.maxX && z - radius >= b.minZ && z + radius <= b.maxZ;
  }
  discClear(x, z, radius = .32) {
    if (!this.inBounds(x, z, radius)) return false;
    const box = { minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius };
    for (const index of [this.buildings, this.water, this.scenery]) for (const polygon of index.near(box)) if (discIntersectsPolygon([x, z], radius, polygon)) return false;
    return true;
  }
  rectangleClear(position, yaw, dimensions, margin = .035) {
    const rect = rectangleFootprint(position, yaw, dimensions, margin);
    if (!rect.every(([x, z]) => this.inBounds(x, z))) return false;
    const box = ringBounds(rect);
    for (const index of [this.buildings, this.water, this.scenery]) for (const polygon of index.near(box)) if (rectangleIntersectsPolygon(rect, polygon)) return false;
    return true;
  }
  segmentClear(a, b, radius = .28) {
    if (!this.discClear(...a, radius) || !this.discClear(...b, radius)) return false;
    const box = { minX: Math.min(a[0], b[0]) - radius, maxX: Math.max(a[0], b[0]) + radius, minZ: Math.min(a[1], b[1]) - radius, maxZ: Math.max(a[1], b[1]) + radius };
    for (const index of [this.buildings, this.water, this.scenery]) for (const polygon of index.near(box)) for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
      if (segmentDistance(a, b, ring[i - 1], ring[i]) <= radius + EPS) return false;
    }
    return true;
  }
  onRoad(x, z) {
    const box = { minX: x, maxX: x, minZ: z, maxZ: z };
    for (const p of this.roads.near(box)) if (pointInPolygon([x, z], p)) return true;
    return false;
  }
  groundHeight(x, z) { return bridgeHeightAt(x, z, this.map.bridges ?? []) ?? 0; }
}
