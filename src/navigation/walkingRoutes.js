const WALKING = new Set(['footway', 'pedestrian', 'path', 'steps', 'living_street']);
const VEHICLE = new Set(['service', 'unclassified', 'residential', 'tertiary']);
const EPS = 1e-6;
const key = p => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function offsetPath(path, amount) {
  const normals = [];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i][0] - path[i - 1][0], dz = path[i][1] - path[i - 1][1], length = Math.hypot(dx, dz);
    normals.push(length > EPS ? [-dz / length, dx / length] : [0, 0]);
  }
  return path.map((p, i) => {
    const before = normals[Math.max(0, i - 1)], after = normals[Math.min(normals.length - 1, i)];
    const nx = before[0] + after[0], nz = before[1] + after[1],
      divisor = Math.max(.625, 1 + before[0] * after[0] + before[1] * after[1]);
    return [p[0] + amount * nx / divisor, p[1] + amount * nz / divisor];
  });
}

/** OSM walking ways are exact source lines. Roadside lines and crossings are estimates. */
export function walkingRoutes(map) {
  const routes = [], roadsideVertices = [], footEndpoints = [];
  const bridgeIds = new Set((map.bridges ?? []).map(b => b.id));
  for (const road of map.roads ?? []) {
    if (bridgeIds.has(road.id)) continue;
    if (WALKING.has(road.kind)) {
      for (const path of road.paths ?? []) {
        routes.push({ path, roadId: road.id, kind: road.kind, walkingKind: 'footpath', width: road.width, source: 'osm', bridge: null });
        if (path.length > 1) footEndpoints.push(path[0], path.at(-1));
      }
    } else if (VEHICLE.has(road.kind)) {
      for (const path of road.paths ?? []) for (const side of [-1, 1]) {
        const shifted = offsetPath(path, side * ((road.width ?? 6) / 2 + 1));
        routes.push({ path: shifted, roadId: road.id, kind: 'sidewalk', walkingKind: 'roadside', width: 1.6,
          source: 'estimated', bridge: null, originalKind: road.kind });
        shifted.forEach((point, i) => roadsideVertices.push({ point, anchor: path[i], roadId: road.id, end: i === 0 || i === path.length - 1 }));
      }
    }
  }
  for (const bridge of map.bridges ?? []) for (const path of bridge.paths ?? []) {
    routes.push({ path, roadId: bridge.id, kind: 'bridge', walkingKind: 'footpath', width: bridge.width, source: 'osm', bridge });
    if (path.length > 1) footEndpoints.push(path[0], path.at(-1));
  }

  // Only OSM junctions and walking-way ends authorize crossings of vehicle pavement.
  const groups = new Map();
  for (const v of roadsideVertices) {
    const k = key(v.anchor);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(v);
  }
  const seen = new Set();
  function connector(a, b, roadId) {
    const d = distance(a, b);
    if (d < .2 || d > 9) return;
    const id = [key(a), key(b)].sort().join(':');
    if (seen.has(id)) return;
    seen.add(id);
    routes.push({ path: [a, b], roadId, kind: 'crossing', walkingKind: 'crossing', width: 1.2,
      source: 'estimated', bridge: null });
  }
  for (const group of groups.values()) {
    if (new Set(group.map(v => v.roadId)).size < 2) continue;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      if (group[i].roadId !== group[j].roadId) connector(group[i].point, group[j].point, `${group[i].roadId}:${group[j].roadId}`);
    }
  }
  for (const foot of footEndpoints) {
    const candidates = roadsideVertices.filter(v => v.end && distance(foot, v.anchor) < 2 && distance(foot, v.point) <= 6.5);
    for (const v of candidates) connector(foot, v.point, v.roadId);
  }
  return routes;
}
