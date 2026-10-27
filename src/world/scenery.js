import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildActivityHubs } from '../activity/hubs.js';
import { pointInMultiPolygon, pointInRing, pointToSegmentDistance } from '../map/geometry.js';
import { hashId } from './appearance.js';
import { tintGeometry } from './facades.js';
import { placementIndexes } from './placementIndex.js';

export const PROP_DIMENSIONS = Object.freeze({
  bench: { width: 1.25, depth: .55, height: .96 }, lamp: { width: .28, depth: .28, height: 4.2 },
  cyclestand: { width: 2.3, depth: .65, height: .8 }, noticeboard: { width: 1.65, depth: .25, height: 2.15 },
  fence: { width: 4.8, depth: .16, height: 1.1 },
});

const transformPoint = (x, z, yaw, px, pz) => [x + Math.cos(yaw) * px + Math.sin(yaw) * pz, z - Math.sin(yaw) * px + Math.cos(yaw) * pz];
export function propFootprint(kind, x, z, yaw = 0, margin = 0) {
  const d = PROP_DIMENSIONS[kind], w = d.width / 2 + margin, h = d.depth / 2 + margin;
  const ring = [[-w, -h], [w, -h], [w, h], [-w, h]].map(p => transformPoint(x, z, yaw, ...p));
  return [...ring, [...ring[0]]];
}

function featureDistance(point, feature) {
  if (pointInMultiPolygon(point, feature.polygons ?? [])) return 0;
  let distance = Infinity;
  for (const polygon of feature.polygons ?? []) for (const ring of polygon) for (let i = 1; i < ring.length; i++) distance = Math.min(distance, pointToSegmentDistance(point, ring[i - 1], ring[i]));
  return distance;
}

/** Furniture never consumes an existing walking corridor; the extra 1.5 m is
 * outside its footprint, not an assumed reduction in a mapped path's width. */
export function sceneryAllowed(prop, map, placed = []) {
  const index = placementIndexes(map);
  const ring = prop.polygon ?? propFootprint(prop.kind, prop.x, prop.z, prop.yaw);
  const points = [...ring.slice(0, -1), [prop.x, prop.z]];
  for (let i = 1; i < ring.length; i++) points.push([(ring[i - 1][0] + ring[i][0]) / 2, (ring[i - 1][1] + ring[i][1]) / 2]);
  for (const p of points) {
    if (map.campus?.polygons && prop.kind !== 'fence' && !pointInMultiPolygon(p, map.campus.polygons)) return false;
    if (p[0] < map.bounds.minX || p[0] > map.bounds.maxX || p[1] < map.bounds.minZ || p[1] > map.bounds.maxZ) return false;
    for (const road of index.roads.near(p, 1.5)) if (featureDistance(p, road) < 1.5) return false;
    for (const feature of index.waters.near(p, 2)) if (featureDistance(p, feature) < 2) return false;
    for (const b of index.buildings.near(p, 1.2)) {
      if (featureDistance(p, b) < 1.2 || b.polygons.some(polygon => polygon.slice(1).some(hole => pointInRing(p, hole)))) return false;
    }
    for (const entrance of index.entrances.near(p, 5)) if (Math.hypot(p[0] - entrance.x, p[1] - entrance.z) < 5) return false;
    for (const tree of index.trees.near(p, 2)) if (Math.hypot(p[0] - tree.x, p[1] - tree.z) < 2) return false;
    for (const row of index.rows.near(p, 2)) for (const path of row.paths ?? []) for (let i = 1; i < path.length; i++) if (pointToSegmentDistance(p, path[i - 1], path[i]) < 2) return false;
    for (const green of index.pitches.near(p, 2)) if (featureDistance(p, green) < 2) return false;
    for (const other of placed) {
      if (pointInRing(p, other.polygon)) return false;
      for (let i = 1; i < other.polygon.length; i++) if (pointToSegmentDistance(p, other.polygon[i - 1], other.polygon[i]) < 1.5) return false;
    }
  }
  return !placed.some(other => other.polygon.some(p => pointInRing(p, ring)));
}

export function planScenery(map, { cap = 80, hubs = buildActivityHubs(map), vegetation = null } = {}) {
  const props = [], pattern = ['bench', 'lamp', 'bench', 'noticeboard', 'cyclestand', 'lamp', 'bench', 'lamp'];
  const planting = [...(vegetation?.trees ?? []), ...(vegetation?.shrubs ?? [])];
  const allowed = prop => sceneryAllowed(prop, map, props) && planting.every(p => Math.hypot(p.x - prop.x, p.z - prop.z) >= (p.radius ?? 2) + Math.hypot(PROP_DIMENSIONS[prop.kind].width, PROP_DIMENSIONS[prop.kind].depth) / 2 + .4);
  for (const hub of hubs.slice(0, 9)) {
    const candidates = [];
    for (const road of map.roads ?? []) for (const path of road.paths ?? []) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 2) continue;
      for (let d = 2; d < length; d += 5) for (const side of [-1, 1]) {
        const offset = (road.width ?? 2.2) / 2 + 3.1;
        const x = a[0] + dx / length * d - dz / length * side * offset;
        const z = a[1] + dz / length * d + dx / length * side * offset;
        const distance = Math.hypot(x - hub.x, z - hub.z);
        if (distance < 80) candidates.push({ x, z, yaw: Math.atan2(-dz, dx), distance,
          seed: hashId(`${hub.id}:${road.id}:${i}:${d}:${side}`) });
      }
    }
    // Close pockets win, with deterministic variation rather than a row of copies.
    candidates.sort((a, b) => a.distance + a.seed % 21 - b.distance - b.seed % 21);
    for (let n = 0; n < pattern.length && props.length < Math.max(0, cap - 8); n++) {
      const kind = pattern[n];
      const candidate = candidates.find(p => allowed({ ...p, kind }));
      if (!candidate) continue;
      const prop = { id: `scenery:${hub.id}:${n}`, kind, hubId: hub.id, source: 'illustrative', ...candidate,
        height: PROP_DIMENSIONS[kind].height };
      prop.polygon = propFootprint(kind, prop.x, prop.z, prop.yaw); props.push(prop);
    }
  }
  // Only the actual OSM campus boundary is eligible; never the context rectangle.
  for (const polygon of map.campus?.polygons ?? []) for (const ring of polygon.slice(0, 1)) {
    for (let i = 1; i < ring.length && props.length < cap; i++) {
      const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < 12) continue;
      // Keep the illustrative fence concentrated around mapped arrival/activity areas.
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (!hubs.some(h => Math.hypot(h.x - mid[0], h.z - mid[1]) < 230)) continue;
      for (const d of [.35, .5, .65]) {
        if (props.length >= cap) break;
        const prop = { id: `scenery:boundary:${i}:${d}`, kind: 'fence', source: 'illustrative', boundaryId: map.campus.id,
          x: a[0] + dx * d, z: a[1] + dz * d, yaw: Math.atan2(-dz, dx), height: PROP_DIMENSIONS.fence.height };
        prop.polygon = propFootprint(prop.kind, prop.x, prop.z, prop.yaw);
        if (allowed(prop)) props.push(prop);
      }
    }
  }
  return props;
}

function prototype(kind) {
  const parts = [], add = (g, color) => { tintGeometry(g, color); if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; } parts.push(g); };
  const box = (w, h, d, x, y, z, color) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
  const pole = (radius, h, x, y, z, color) => add(new THREE.CylinderGeometry(radius, radius, h, 6).translate(x, y, z), color);
  const metal = 0x64716d, wood = 0x8f7456, pale = 0xd4cfc0;
  if (kind === 'bench') {
    for (const x of [-.43, .43]) box(.09, .42, .48, x, .21, 0, metal);
    for (const z of [-.2, -.07, .07, .2]) box(1.25, .075, .1, 0, .46, z, wood);
    for (const y of [.64, .78]) box(1.25, .1, .05, 0, y, -.24, wood);
  } else if (kind === 'lamp') {
    pole(.09, 4, 0, 2, 0, metal); box(.28, .12, .28, 0, .06, 0, 0x797b70);
    box(.7, .07, .12, .28, 4.03, 0, metal); box(.38, .1, .22, .48, 3.98, 0, pale);
    box(.32, .025, .18, .48, 3.92, 0, 0xe8dfb9);
  } else if (kind === 'cyclestand') {
    for (const x of [-.95, -.32, .32, .95]) { pole(.035, .7, x, .35, -.23, metal); pole(.035, .7, x, .35, .23, metal); box(.07, .07, .46, x, .73, 0, metal); }
    box(2.3, .06, .06, 0, .04, -.23, metal); box(2.3, .06, .06, 0, .04, .23, metal);
  } else if (kind === 'noticeboard') {
    for (const x of [-.69, .69]) pole(.045, 2.05, x, 1.025, 0, metal);
    box(1.65, 1.04, .1, 0, 1.49, 0, wood); box(1.48, .88, .11, 0, 1.49, .01, 0x9aab99);
    for (const x of [-.46, -.04, .39]) for (const y of [1.31, 1.66]) box(.27, .28, .012, x, y, .073, x === -.04 ? 0xbdb69a : 0xdfd8bf);
    box(1.8, .08, .35, 0, 2.1, 0, metal);
  } else {
    for (const x of [-2.35, 0, 2.35]) pole(.045, 1.1, x, .55, 0, metal);
    for (const y of [.23, .95]) box(4.8, .035, .04, 0, y, 0, metal);
    for (let x = -2.2; x <= 2.2; x += .3) pole(.013, .85, x, .55, 0, metal);
  }
  const merged = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); return merged;
}

export function buildScenery(map, options = {}) {
  const props = options.preparedProps ? structuredClone(options.preparedProps) : planScenery(map, options), group = new THREE.Group(), collisionGroup = new THREE.Group();
  group.name = 'illustrative-campus-furniture'; collisionGroup.name = 'scenery-colliders'; collisionGroup.visible = false;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .82, metalness: .12 });
  const prototypes = new Map(), buckets = new Map(), colliderMaterial = new THREE.MeshBasicMaterial();
  const transform = new THREE.Object3D();
  for (const p of props) {
    const key = `${p.kind}:${Math.floor(p.x / 150)}:${Math.floor(p.z / 150)}`;
    if (!buckets.has(key)) buckets.set(key, { kind: p.kind, props: [] }); buckets.get(key).props.push(p);
    const d = PROP_DIMENSIONS[p.kind];
    const collider = new THREE.Mesh(new THREE.BoxGeometry(d.width, d.height, d.depth), colliderMaterial);
    collider.position.set(p.x, d.height / 2, p.z); collider.rotation.y = p.yaw; collider.name = p.id;
    collisionGroup.add(collider);
  }
  const meshes = [];
  for (const bucket of buckets.values()) {
    if (!prototypes.has(bucket.kind)) prototypes.set(bucket.kind, prototype(bucket.kind));
    const mesh = new THREE.InstancedMesh(prototypes.get(bucket.kind), material, bucket.props.length);
    bucket.props.forEach((p, i) => { transform.position.set(p.x, 0, p.z); transform.rotation.set(0, p.yaw, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
    mesh.computeBoundingSphere(); mesh.name = `scenery-${bucket.kind}`; mesh.receiveShadow = true;
    mesh.userData.kind = bucket.kind; mesh.userData.props = bucket.props; mesh.userData.nearVisible = true;
    group.add(mesh); meshes.push(mesh);
  }
  collisionGroup.updateMatrixWorld(true);
  return {
    group, collisionGroup, obstacles: props, meshes,
    replaceBenchGeometry(geometry, benchMaterial) {
      for (const mesh of meshes.filter(m => m.userData.kind === 'bench')) { mesh.geometry = geometry; mesh.material = benchMaterial; mesh.computeBoundingSphere(); }
      this.importedBench = { geometry, material: benchMaterial };
    },
    update(position) {
      if (!position) return;
      for (const mesh of meshes) {
        const distance = Math.min(...mesh.userData.props.map(p => Math.hypot(p.x - position.x, p.z - position.z)));
        // Hysteresis prevents small furniture flickering at the detail boundary.
        const threshold = mesh.userData.kind === 'fence' ? 450 : mesh.userData.nearVisible ? 205 : 180;
        mesh.visible = mesh.userData.nearVisible = distance < threshold;
      }
    },
    dispose() {
      prototypes.forEach(g => g.dispose()); this.importedBench?.geometry.dispose(); this.importedBench?.material.dispose();
      collisionGroup.traverse(m => m.geometry?.dispose()); material.dispose(); colliderMaterial.dispose(); group.clear(); collisionGroup.clear();
    },
  };
}
