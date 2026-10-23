import { pointInMultiPolygon } from '../map/geometry.js';
import { bridgeElevation, measurePath } from '../world/bridge.js';
import { walkingRoutes } from './walkingRoutes.js';

const JOIN = .1;
const MAX_EDGE = 8;
const EPS = 1e-8;

function crossing(a, b, c, d) {
  const ux = b[0] - a[0], uz = b[1] - a[1];
  const vx = d[0] - c[0], vz = d[1] - c[1];
  const det = ux * vz - uz * vx;
  if (Math.abs(det) < EPS) return null;
  const wx = c[0] - a[0], wz = c[1] - a[1];
  const t = (wx * vz - wz * vx) / det;
  const u = (wx * uz - wz * ux) / det;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [Math.max(0, Math.min(1, t)), Math.max(0, Math.min(1, u))];
}

function parameter(point, segment) {
  const [a, b] = segment;
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / (dx * dx + dz * dz);
  if (t < -EPS || t > 1 + EPS) return null;
  const x = a[0] + t * dx, z = a[1] + t * dz;
  return Math.hypot(x - point[0], z - point[1]) <= JOIN ? Math.max(0, Math.min(1, t)) : null;
}

/** Build mapped footpaths plus conservative, explicitly estimated roadside walks. */
export function buildPedestrianGraph(map, queries) {
  const sources = walkingRoutes(map);
  const segments = [];
  for (const road of sources) {
    const path = road.path;
    const measured = measurePath(path);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length > EPS) segments.push({a, b, roadId: road.roadId, kind: road.kind, walkingKind: road.walkingKind,
        source: road.source, width: road.width, cuts: [0, 1],
        height: t => road.bridge ? bridgeElevation(measured.distances[i - 1] + length * t, measured.length, road.bridge) : 0 });
    }
  }

  let intersections = 0;
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const s = segments[i], t = segments[j];
    if (Math.max(s.a[0], s.b[0]) + JOIN < Math.min(t.a[0], t.b[0]) || Math.max(t.a[0], t.b[0]) + JOIN < Math.min(s.a[0], s.b[0]) ||
      Math.max(s.a[1], s.b[1]) + JOIN < Math.min(t.a[1], t.b[1]) || Math.max(t.a[1], t.b[1]) + JOIN < Math.min(s.a[1], s.b[1])) continue;
    const hit = crossing(s.a, s.b, t.a, t.b);
    if (hit && Math.abs(s.height(hit[0]) - t.height(hit[1])) <= .16 &&
      s.walkingKind === 'footpath' && t.walkingKind === 'footpath') { s.cuts.push(hit[0]); t.cuts.push(hit[1]); intersections++; }
    // Collinear overlaps and near-coincident T junctions need their endpoints split too.
    for (const [point, own, other, value] of [[s.a, s, t, 0], [s.b, s, t, 1], [t.a, t, s, 0], [t.b, t, s, 1]]) {
      const at = parameter(point, [other.a, other.b]);
      if (at !== null && Math.abs(own.height(value) - other.height(at)) <= .16) {
        // An estimated line meeting another line at a generated endpoint is a planned junction.
        own.cuts.push(value); other.cuts.push(at);
      }
    }
  }

  const nodes = [], edges = [], cells = new Map(), edgeKeys = new Set();
  const cell = (x, z) => `${x},${z}`;
  function nodeAt(x, z, height) {
    const cx = Math.floor(x / JOIN), cz = Math.floor(z / JOIN);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) for (const id of cells.get(cell(ix, iz)) ?? []) {
      if (Math.hypot(nodes[id].x - x, nodes[id].z - z) <= JOIN && Math.abs(nodes[id].height - height) <= .16) return id;
    }
    const id = nodes.length;
    nodes.push({id, x, z, height, neighbors: []});
    const key = cell(cx, cz);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(id);
    return id;
  }
  const campus = map.campus?.polygons;
  const validPoint = p => (!campus?.length || pointInMultiPolygon(p, campus)) && queries.discClear(...p, .28);
  let rejected = 0, duplicates = 0;
  for (const s of segments) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const cuts = [...new Set(s.cuts.map(t => Math.max(0, Math.min(1, t))))].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const lo = cuts[i - 1], hi = cuts[i];
      const count = Math.ceil(Math.hypot(dx, dz) * (hi - lo) / MAX_EDGE);
      for (let k = 0; k < count; k++) {
        const t0 = lo + (hi - lo) * k / count, t1 = lo + (hi - lo) * (k + 1) / count;
        const a = [s.a[0] + dx * t0, s.a[1] + dz * t0], b = [s.a[0] + dx * t1, s.a[1] + dz * t1];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= EPS) continue;
        if (!validPoint(a) || !validPoint(b) || !validPoint(mid) || !queries.segmentClear(a, b, .28)) { rejected++; continue; }
        const na = nodeAt(...a, s.height(t0)), nb = nodeAt(...b, s.height(t1));
        if (na === nb) continue;
        const joinedA = [nodes[na].x, nodes[na].z], joinedB = [nodes[nb].x, nodes[nb].z];
        if (!queries.segmentClear(joinedA, joinedB, .28)) { rejected++; continue; }
        const checks = Math.max(1, Math.ceil(Math.hypot(joinedA[0] - joinedB[0], joinedA[1] - joinedB[1]) / .5));
        if (Array.from({ length: checks + 1 }, (_, i) => [joinedA[0] + (joinedB[0] - joinedA[0]) * i / checks, joinedA[1] + (joinedB[1] - joinedA[1]) * i / checks]).some(p => !validPoint(p))) { rejected++; continue; }
        const key = `${Math.min(na, nb)}:${Math.max(na, nb)}`;
        if (edgeKeys.has(key)) { duplicates++; continue; }
        edgeKeys.add(key);
        const length = Math.hypot(nodes[na].x - nodes[nb].x, nodes[na].z - nodes[nb].z);
        const detail = {length, roadId: s.roadId, kind: s.kind, walkingKind: s.walkingKind,
          source: s.source, estimated: s.source === 'estimated', width: s.width};
        edges.push({a: na, b: nb, ...detail});
        nodes[na].neighbors.push({to: nb, ...detail});
        nodes[nb].neighbors.push({to: na, ...detail});
      }
    }
  }
  let components = 0;
  const seen = new Set();
  for (const node of nodes) if (!seen.has(node.id)) {
    components++;
    const stack = [node.id]; seen.add(node.id);
    while (stack.length) for (const neighbor of nodes[stack.pop()].neighbors) if (!seen.has(neighbor.to)) { seen.add(neighbor.to); stack.push(neighbor.to); }
  }
  const corridor = edge => Math.min(.8, Math.max(.42, (edge.width ?? 1.6) / 2 - .28));
  const routeCells = new Map(), cellSize = 8;
  for (const edge of edges) {
    const a = nodes[edge.a], b = nodes[edge.b], pad = corridor(edge);
    for (let ix = Math.floor((Math.min(a.x, b.x) - pad) / cellSize); ix <= Math.floor((Math.max(a.x, b.x) + pad) / cellSize); ix++)
      for (let iz = Math.floor((Math.min(a.z, b.z) - pad) / cellSize); iz <= Math.floor((Math.max(a.z, b.z) + pad) / cellSize); iz++) {
        const key = `${ix},${iz}`;
        if (!routeCells.has(key)) routeCells.set(key, []);
        routeCells.get(key).push(edge);
      }
  }
  function isWalkable(x, z, radius = .28) {
    if (!validPoint([x, z]) || !queries.discClear(x, z, radius)) return false;
    return (routeCells.get(`${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`) ?? [])
      .some(edge => pointToEdge(x, z, nodes[edge.a], nodes[edge.b]) <= corridor(edge) + EPS);
  }
  function segmentWalkable(a, b, radius = .28) {
    if (!queries.segmentClear(a, b, radius)) return false;
    const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .3));
    for (let i = 0; i <= count; i++) if (!isWalkable(a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count, radius)) return false;
    return true;
  }
  return {nodes, edges, isWalkable, segmentWalkable, diagnostics: {sourceSegments: segments.length, intersections,
    rejectedEdges: rejected, duplicateEdges: duplicates, components,
    byType: Object.fromEntries(['footpath', 'roadside', 'crossing'].map(type => [type, edges.filter(e => e.walkingKind === type).length]))}};
}

function pointToEdge(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}
