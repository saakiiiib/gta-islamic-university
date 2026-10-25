import { rectangleFootprint } from '../navigation/campusQueries.js';
import { VAN_CONFIG } from './controller.js';

export const VEHICLE_ROAD = /^(service|unclassified|tertiary|residential)$/;
const distance = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const key = p => `${Math.round(p[0] * 10000)},${Math.round(p[1] * 10000)}`;
const direction = (a, b) => { const d = distance(a, b); return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/** Connections exist only at coincident source vertices, never across a nearby gap. */
export function buildVehicleGraph(map) {
  const nodes = [], edges = [], byKey = new Map();
  function node(point) {
    const id = key(point);
    if (!byKey.has(id)) { const n = { id: nodes.length, point, edges: [] }; byKey.set(id, n); nodes.push(n); }
    return byKey.get(id);
  }
  for (const road of map.roads ?? []) {
    if (!VEHICLE_ROAD.test(road.kind)) continue;
    for (const path of road.paths ?? []) for (let i = 1; i < path.length; i++) {
      const a = node(path[i - 1]), b = node(path[i]), length = distance(a.point, b.point);
      if (length < .05 || a === b) continue;
      if (a.edges.some(id => { const e = edges[id]; return e.a === b.id || e.b === b.id; })) continue;
      const edge = { id: edges.length, a: a.id, b: b.id, length, road };
      edges.push(edge); a.edges.push(edge.id); b.edges.push(edge.id);
    }
  }
  return { nodes, edges };
}

export function shortestVehiclePath(graph, start, end, excluded = -1) {
  const costs = new Map([[start, 0]]), previous = new Map(), queue = new Set([start]);
  while (queue.size) {
    let at = null, cost = Infinity;
    for (const n of queue) if (costs.get(n) < cost) { cost = costs.get(n); at = n; }
    queue.delete(at);
    if (at === end) {
      const nodes = [end], edges = [];
      while (nodes.at(-1) !== start) { const p = previous.get(nodes.at(-1)); if (!p) return null; edges.push(p.edge); nodes.push(p.node); }
      return { nodes: nodes.reverse(), edges: edges.reverse(), length: cost };
    }
    for (const id of graph.nodes[at].edges) {
      if (id === excluded) continue;
      const edge = graph.edges[id], next = edge.a === at ? edge.b : edge.a, nextCost = cost + edge.length;
      if (nextCost < (costs.get(next) ?? Infinity)) { costs.set(next, nextCost); previous.set(next, { node: at, edge: id }); queue.add(next); }
    }
  }
  return null;
}

function simplifyRing(input) {
  const points = input.map(p => [...p]);
  if (distance(points[0], points.at(-1)) < .01) points.pop();
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length], b = points[i], c = points[(i + 1) % points.length];
      const u = direction(a, b), v = direction(b, c), cross = Math.abs(u[0] * v[1] - u[1] * v[0]);
      if (dot(u, v) > .985 && cross * Math.min(distance(a, b), distance(b, c)) < .28) { points.splice(i, 1); changed = true; break; }
    }
  }
  return points;
}

/** Circular tangent fillets respect the existing van's minimum steering radius. */
export function smoothVehicleCircuit(input, radius = 6.2) {
  const points = simplifyRing(input), corners = [];
  if (points.length < 3) return null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const incoming = direction(previous, p), outgoing = direction(p, next), theta = Math.acos(clamp(dot(incoming, outgoing), -1, 1));
    if (theta > Math.PI * .88) return null;
    const trim = radius * Math.tan(theta / 2);
    if (trim > distance(previous, p) * .94 || trim > distance(p, next) * .94) return null;
    const entry = [p[0] - incoming[0] * trim, p[1] - incoming[1] * trim], exit = [p[0] + outgoing[0] * trim, p[1] + outgoing[1] * trim];
    const sign = Math.sign(incoming[0] * outgoing[1] - incoming[1] * outgoing[0]) || 1;
    const center = [entry[0] - incoming[1] * radius * sign, entry[1] + incoming[0] * radius * sign];
    corners.push({ entry, exit, theta, sign, center, radius, trim });
  }
  // Adjacent fillets share a segment. A short source segment can safely devote
  // most of its length to one bend when its other endpoint is almost straight.
  for (let i = 0; i < corners.length; i++) {
    const next = (i + 1) % corners.length;
    if (corners[i].trim + corners[next].trim > distance(points[i], points[next]) * .94) return null;
  }
  const sampled = [];
  const add = p => { if (!sampled.length || distance(sampled.at(-1), p) > .001) sampled.push(p); };
  for (let i = 0; i < corners.length; i++) {
    const corner = corners[i], before = corners[(i + corners.length - 1) % corners.length].exit;
    const length = distance(before, corner.entry), steps = Math.max(1, Math.ceil(length / 1));
    for (let j = 0; j < steps; j++) add([before[0] + (corner.entry[0] - before[0]) * j / steps, before[1] + (corner.entry[1] - before[1]) * j / steps]);
    const angle = Math.atan2(corner.entry[1] - corner.center[1], corner.entry[0] - corner.center[0]), arcSteps = Math.max(1, Math.ceil(corner.theta * radius / .6));
    for (let j = 0; j <= arcSteps; j++) {
      const a = angle + corner.sign * corner.theta * j / arcSteps;
      add([corner.center[0] + radius * Math.cos(a), corner.center[1] + radius * Math.sin(a)]);
    }
  }
  if (sampled.length < 4) return null;
  const stations = [0];
  for (let i = 1; i < sampled.length; i++) stations.push(stations.at(-1) + distance(sampled[i - 1], sampled[i]));
  const length = stations.at(-1) + distance(sampled.at(-1), sampled[0]);
  return { points: sampled, stations, length, radius, closed: true };
}

export function routeSample(route, distanceAlong) {
  const s = route.closed === false ? clamp(distanceAlong, 0, route.length - .00001) : ((distanceAlong % route.length) + route.length) % route.length;
  let low = 0, high = route.stations.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (route.stations[mid] <= s) low = mid; else high = mid - 1; }
  const a = route.points[low], b = route.points[(low + 1) % route.points.length], length = distance(a, b), t = length > 0 ? (s - route.stations[low]) / length : 0;
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], yaw: Math.atan2(a[0] - b[0], a[1] - b[1]), index: low, s };
}

export function closestRoutePosition(route, position, nearIndex = null) {
  let best = { distance: Infinity, s: 0, index: 0, point: route.points[0] };
  const count = route.points.length, available = route.closed === false ? count - 1 : count;
  const steps = nearIndex === null || route.closed === false ? available : Math.min(count, 39), start = nearIndex === null || route.closed === false ? 0 : nearIndex - 13;
  for (let j = 0; j < steps; j++) {
    const i = (start + j + count) % count, a = route.points[i], b = route.points[(i + 1) % count], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    const t = clamp(((position.x - a[0]) * dx + (position.z - a[1]) * dz) / (length * length), 0, 1), point = [a[0] + dx * t, a[1] + dz * t];
    const separation = Math.hypot(point[0] - position.x, point[1] - position.z);
    if (separation < best.distance) best = { distance: separation, s: route.stations[i] + t * length, index: i, point };
  }
  return best;
}

/** A gentle, preflighted pull-in along the current source-road straight. */
export function buildPickupApproach(van, pickup, queries) {
  const forward = [-Math.sin(van.yaw), -Math.cos(van.yaw)], right = [Math.cos(van.yaw), -Math.sin(van.yaw)];
  const dx = pickup.x - van.position.x, dz = pickup.z - van.position.z;
  const length = dx * forward[0] + dz * forward[1], side = dx * right[0] + dz * right[1];
  const angle = Math.atan2(Math.sin(pickup.yaw - van.yaw), Math.cos(pickup.yaw - van.yaw));
  if (length < 14 || length > 85 || Math.abs(side) > 4.5 || Math.abs(angle) > .22) return null;
  const points = [], stations = [0], count = Math.ceil(length / .7);
  for (let i = 0; i <= count; i++) {
    const t = i / count, lateral = side * t * t * (3 - 2 * t);
    const point = [van.position.x + forward[0] * length * t + right[0] * lateral,
      van.position.z + forward[1] * length * t + right[1] * lateral];
    const slope = side * 6 * t * (1 - t) / length;
    const yaw = Math.atan2(-forward[0] - right[0] * slope, -forward[1] - right[1] * slope);
    const position = { x: point[0], z: point[1] };
    if (!queries.rectangleClear(position, yaw, van.config, .08)
      || !rectangleFootprint(position, yaw, van.config, .06).every(([x, z]) => queries.onRoad(x, z))) return null;
    if (points.length) stations.push(stations.at(-1) + distance(points.at(-1), point));
    points.push(point);
  }
  return { id: `pickup-${pickup.roadId ?? ''}`, points, stations, length: stations.at(-1), closed: false, pickup, sourceNodes: [] };
}

export function sweptRouteClear(route, queries, config = VAN_CONFIG) {
  for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i], a = route.points[(i + route.points.length - 1) % route.points.length], b = route.points[(i + 1) % route.points.length];
    const yaw = Math.atan2(a[0] - b[0], a[1] - b[1]), position = { x: p[0], z: p[1] };
    if (!queries.rectangleClear(position, yaw, config, .09) || !rectangleFootprint(position, yaw, config, .07).every(([x, z]) => queries.onRoad(x, z))) return false;
  }
  return true;
}

/** Shortest source cycles give genuine connected circuits instead of endpoint U-turns. */
export function buildVehicleRoutes(map, queries) {
  const graph = buildVehicleGraph(map), seen = new Set(), routes = [];
  for (const edge of graph.edges) {
    const alternate = shortestVehiclePath(graph, edge.b, edge.a, edge.id);
    if (!alternate || alternate.length + edge.length < 45 || alternate.length + edge.length > 2600) continue;
    const ids = [edge.id, ...alternate.edges].sort((a, b) => a - b), signature = ids.join(',');
    if (seen.has(signature)) continue;
    seen.add(signature);
    const sourceNodes = [edge.a, ...alternate.nodes], input = sourceNodes.map(id => graph.nodes[id].point);
    for (const reverse of [false, true]) {
      const ordered = reverse ? [...input].reverse() : input;
      // Tighter mapped loops receive a slower fallback where a wider fillet
      // cannot fit. Curve speed limits do not alter the vehicle's physics.
      let route = smoothVehicleCircuit(ordered);
      if (!route || !sweptRouteClear(route, queries)) route = smoothVehicleCircuit(ordered, 5.4);
      if (!route || !sweptRouteClear(route, queries)) route = smoothVehicleCircuit(ordered, 4.5);
      if (!route || !sweptRouteClear(route, queries)) continue;
      const result = { ...route, id: `source-circuit-${routes.length}`, sourceNodes, sourceEdges: ids, roadIds: [...new Set(ids.map(id => graph.edges[id].road.id).filter(Boolean))] };
      routes.push(result);
    }
  }
  return { graph, routes };
}

const networks = new WeakMap();
export function getVehicleNetwork(map, queries) {
  if (!networks.has(queries)) networks.set(queries, buildVehicleRoutes(map, queries));
  return networks.get(queries);
}
