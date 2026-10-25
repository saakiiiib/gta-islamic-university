import { Group } from 'three';
import { pointInMultiPolygon, pointToSegmentDistance } from '../map/geometry.js';
import { buildActivityHubs } from '../activity/hubs.js';
import { rectangleFootprint } from '../navigation/campusQueries.js';
import { ElectricVan, findVanSpawn, VAN_CONFIG } from './controller.js';
import { VEHICLE_ROAD, getVehicleNetwork, closestRoutePosition, routeSample } from './routes.js';
import { vansOverlap } from './contacts.js';

const separation = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const safe = (p, queries) => queries.rectangleClear(p, p.yaw, VAN_CONFIG, .14)
  && rectangleFootprint(p, p.yaw, VAN_CONFIG, .08).every(([x, z]) => queries.onRoad(x, z));

/** Illustrative curbside stops, never surveyed parking bays or pedestrian routes. */
export function findPickupCandidates(map, queries) {
  const pool = [], pedestrianPaths = (map.roads ?? []).filter(r => /^(path|footway|pedestrian|cycleway)$/.test(r.kind));
  for (const road of map.roads ?? []) {
    if (!VEHICLE_ROAD.test(road.kind)) continue;
    for (const path of road.paths ?? []) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      const offset = Math.min(2.5, (road.width ?? 6) / 2 - VAN_CONFIG.halfWidth - .26);
      if (length < 13 || offset < VAN_CONFIG.halfWidth * 2 + .25) continue;
      for (let t = 6; t <= length - 6; t += 6) for (const side of [-1, 1]) {
        const p = { x: a[0] + dx * t / length - dz / length * offset * side,
          z: a[1] + dz * t / length + dx / length * offset * side, yaw: Math.atan2(-dx, -dz), role: 'pickup', roadId: road.id };
        if (map.campus?.polygons && !pointInMultiPolygon([p.x, p.z], map.campus.polygons)) continue;
        if (!safe(p, queries)) continue;
        if (pedestrianPaths.some(r => r.paths.some(line => line.slice(1).some((end, j) => pointToSegmentDistance([p.x, p.z], line[j], end) < (r.width ?? 2.2) / 2 + 1.7)))) continue;
        pool.push(p);
      }
    }
  }
  return pool;
}

function circuitSpawn(route, s, role = 'service') {
  const sample = routeSample(route, s);
  return { x: sample.point[0], z: sample.point[1], yaw: sample.yaw, role, routeId: route.id, routeDistance: sample.s };
}

export function findFleetSpawns(map, queries, count = 8) {
  const { routes } = getVehicleNetwork(map, queries), hubs = buildActivityHubs(map), gate = map.spawn ?? hubs[0] ?? { x: 0, z: 0 };
  const selected = [], pool = findPickupCandidates(map, queries);
  const clear = p => selected.every(q => separation(p, q) > 11 && !vansOverlap(p, p.yaw, VAN_CONFIG, { position: q, yaw: q.yaw, config: VAN_CONFIG }));
  function pickup(hub) {
    const sorted = [...pool].sort((a, b) => separation(a, hub) - separation(b, hub));
    const candidate = sorted.find(p => clear(p) && separation(p, gate) > 5
      && (hub !== gate || !gate.forward || (p.x - gate.x) * gate.forward[0] + (p.z - gate.z) * gate.forward[1] > 6));
    if (!candidate) return false;
    selected.push({ ...candidate, hubId: hub.id ?? null }); return true;
  }
  if (!pickup(gate)) selected.push({ ...findVanSpawn(map, queries), role: 'pickup' });
  const gateRoutes = [...routes].sort((a, b) => closestRoutePosition(a, gate).distance - closestRoutePosition(b, gate).distance || a.length - b.length);
  const gateRoute = gateRoutes[0];
  if (gateRoute && closestRoutePosition(gateRoute, gate).distance < 100) {
    const nearest = closestRoutePosition(gateRoute, gate);
    for (const distance of [22, 84]) {
      if (selected.length >= count) break;
      let candidate = null;
      for (let shift = 0; shift <= 30; shift += 5) {
        const p = circuitSpawn(gateRoute, nearest.s + distance + shift);
        if (safe(p, queries) && clear(p)) { candidate = p; break; }
      }
      if (candidate) selected.push(candidate);
    }
  }
  const academic = hubs.find(h => h.kind === 'library') ?? hubs.find(h => h.kind === 'academic') ?? gate;
  const centralRoutes = routes.filter(r => r !== gateRoute).sort((a, b) => closestRoutePosition(a, academic).distance + a.length * .02 - closestRoutePosition(b, academic).distance - b.length * .02);
  for (const route of centralRoutes) {
    if (selected.filter(p => p.role === 'service').length >= 3 || selected.length >= count) break;
    const near = closestRoutePosition(route, academic);
    let found = false;
    for (const advance of [12, 25, 40]) {
      const candidate = circuitSpawn(route, near.s + advance);
      if (safe(candidate, queries) && clear(candidate)) { selected.push(candidate); found = true; break; }
    }
    if (found) break;
  }
  const pickupHubs = [hubs.find(h => h.kind === 'administration'), academic,
    hubs.find(h => h.kind === 'cafeteria'), ...hubs.filter(h => h.kind === 'academic'), ...hubs].filter(Boolean);
  for (const hub of pickupHubs) { if (selected.length >= count) break; pickup(hub); }
  for (const p of [...pool].sort((a, b) => separation(a, gate) - separation(b, gate))) {
    if (selected.length >= count) break;
    if (clear(p)) selected.push(p);
  }
  if (selected.length < count) throw new Error(`The supplied campus has no safe roadside parking for ${count} vans.`);
  return selected.slice(0, count);
}

export function createVanFleet(map, queries, count = 8) {
  const group = new Group(); group.name = 'electric-van-fleet';
  const vans = findFleetSpawns(map, queries, count).map((spawn, i) => {
    const van = new ElectricVan({ queries, spawn }); van.id = i;
    van.role = spawn.role; van.serviceRouteId = spawn.routeId ?? null;
    van.pickupHubId = spawn.hubId ?? null;
    van.group.name = `electricCargoTricycle-${i + 1}`; group.add(van.group); return van;
  });
  return { vans, group };
}
