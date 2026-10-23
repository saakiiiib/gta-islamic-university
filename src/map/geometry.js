import polygonClipping from 'polygon-clipping';

export const EARTH_RADIUS = 6378137;
const RAD = Math.PI / 180;
const EPS = 1e-7;

/** X is east, Z is south, and distances are metres. */
export function project(lat, lon, origin) {
  return [EARTH_RADIUS * Math.cos(origin.lat * RAD) * (lon - origin.lon) * RAD,
    -EARTH_RADIUS * (lat - origin.lat) * RAD];
}

export function pointToSegmentDistance(point, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSq)) : 0;
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t);
}

export function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (pointToSegmentDistance(point, a, b) < EPS) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point, polygon) {
  return !!polygon?.length && pointInRing(point, polygon[0]) && !polygon.slice(1).some(r => pointInRing(point, r));
}

export function pointInMultiPolygon(point, polygons) {
  return polygons.some(polygon => pointInPolygon(point, polygon));
}

export function ringBounds(ring) {
  return ring.reduce((b, p) => ({minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
    minZ: Math.min(b.minZ, p[1]), maxZ: Math.max(b.maxZ, p[1])}),
  {minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity});
}

export function boundsPolygon(b) {
  return [[[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ], [b.minX, b.minZ]]];
}

export function clipPolygons(polygons, bounds) {
  if (!polygons.length) return [];
  return polygonClipping.intersection(polygons, boundsPolygon(bounds));
}

export function intersectsBounds(polygons, bounds) {
  return polygons.some(p => {
    const b = ringBounds(p[0]);
    return b.minX <= bounds.maxX && b.maxX >= bounds.minX && b.minZ <= bounds.maxZ && b.maxZ >= bounds.minZ;
  }) && clipPolygons(polygons, bounds).length > 0;
}

/** Liang–Barsky clipping keeps a crossing segment even when both nodes are distant. */
export function clipLineString(points, bounds) {
  const paths = [];
  let path = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const p = [-dx, dx, -dz, dz];
    const q = [a[0] - bounds.minX, bounds.maxX - a[0], a[1] - bounds.minZ, bounds.maxZ - a[1]];
    let lo = 0, hi = 1, valid = true;
    for (let j = 0; j < 4; j++) {
      if (Math.abs(p[j]) < EPS) { if (q[j] < 0) valid = false; }
      else if (p[j] < 0) lo = Math.max(lo, q[j] / p[j]);
      else hi = Math.min(hi, q[j] / p[j]);
    }
    if (!valid || lo > hi || Math.hypot(dx, dz) < EPS) {
      if (path.length > 1) paths.push(path);
      path = [];
      continue;
    }
    const first = [a[0] + dx * lo, a[1] + dz * lo], last = [a[0] + dx * hi, a[1] + dz * hi];
    if (path.length && Math.hypot(path.at(-1)[0] - first[0], path.at(-1)[1] - first[1]) > EPS) {
      if (path.length > 1) paths.push(path);
      path = [];
    }
    if (!path.length) path.push(first);
    if (Math.hypot(last[0] - first[0], last[1] - first[1]) > EPS) path.push(last);
    if (hi < 1) { if (path.length > 1) paths.push(path); path = []; }
  }
  if (path.length > 1) paths.push(path);
  return paths;
}

/** Segment ribbons and small round joins are unioned, avoiding gaps at bends. */
export function bufferPaths(paths, width, bounds) {
  const parts = [], radius = width / 2;
  for (const points of paths) {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < EPS) continue;
      const nx = -dz / length * radius, nz = dx / length * radius;
      parts.push([[[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz],
        [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz], [a[0] + nx, a[1] + nz]]]);
    }
    for (const point of points) {
      const ring = Array.from({length: 9}, (_, i) => [point[0] + Math.cos(i / 8 * 2 * Math.PI) * radius,
        point[1] + Math.sin(i / 8 * 2 * Math.PI) * radius]);
      ring[8] = [...ring[0]];
      parts.push([ring]);
    }
  }
  if (!parts.length) return [];
  // Remove floating point near-collinearity from sin(π) joins. Micrometre snapping
  // is far below the OSM source precision and avoids fragile zero-width slivers.
  const snapped = parts.map(polygon => polygon.map(ring => ring.map(p => p.map(n => Math.round(n * 1e6) / 1e6))));
  const polygons = polygonClipping.union(...snapped);
  return bounds ? clipPolygons(polygons, bounds) : polygons;
}

export function ringArea(ring) {
  let area = 0;
  for (let i = 1; i < ring.length; i++) area += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return Math.abs(area) / 2;
}
