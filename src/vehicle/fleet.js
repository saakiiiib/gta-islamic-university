import { Group } from 'three';
import { pointInMultiPolygon } from '../map/geometry.js';
import { rectangleFootprint } from '../navigation/campusQueries.js';
import { ElectricVan, findVanSpawn, VAN_CONFIG } from './controller.js';

export function findFleetSpawns(map, queries, count = 8) {
  const selected = [findVanSpawn(map, queries)], pool = [];
  for (const road of map.roads ?? []) {
    if (!/^(service|unclassified|tertiary|residential)$/.test(road.kind)) continue;
    for (const path of road.paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = 4; t < length - 3; t += 11) {
        const p = { x: a[0] + (b[0] - a[0]) * t / length, z: a[1] + (b[1] - a[1]) * t / length, yaw: Math.atan2(a[0] - b[0], a[1] - b[1]) };
        if (map.campus?.polygons && !pointInMultiPolygon([p.x, p.z], map.campus.polygons)) continue;
        if (!queries.rectangleClear(p, p.yaw, VAN_CONFIG, .25)) continue;
        if (!rectangleFootprint(p, p.yaw, VAN_CONFIG).every(([x, z]) => queries.onRoad(x, z))) continue;
        pool.push(p);
      }
    }
  }
  while (selected.length < count) {
    let best = null, distance = 24;
    for (const p of pool) {
      const separation = Math.min(...selected.map(q => Math.hypot(q.x - p.x, q.z - p.z)));
      if (separation > distance) { best = p; distance = separation; }
    }
    if (!best) throw new Error(`The supplied campus has no safe road parking for ${count} vans.`);
    selected.push(best);
  }
  return selected.slice(0, count);
}

export function createVanFleet(map, queries, count = 8) {
  const group = new Group(); group.name = 'electric-van-fleet';
  const vans = findFleetSpawns(map, queries, count).map((spawn, i) => {
    const van = new ElectricVan({ queries, spawn }); van.id = i; van.group.name = `electricCargoTricycle-${i + 1}`; group.add(van.group); return van;
  });
  return { vans, group };
}
