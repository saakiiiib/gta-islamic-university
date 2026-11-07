import * as THREE from 'three';
import { bufferPaths, pointInMultiPolygon, pointInPolygon, pointToSegmentDistance, ringBounds } from '../map/geometry.js';

const INSTANCE_CAP = 250, SHORE_BAND_METERS = 8, SHORE_MARGIN_METERS = .15;
const SOURCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:IU_Lake,_also_called_Mofiz_Lake.jpg',
  'https://commons.wikimedia.org/wiki/File:Islamic_University_Lake_with_Central_Mosque_View.jpg',
  'https://commons.wikimedia.org/wiki/File:Stair_of_the_ponds_at_sheikh_mujib_hall,_Islamic_university_kushtia_-_1.jpg',
]);
function hash(text) {
  let result = 2166136261;
  for (let i = 0; i < text.length; i++) result = Math.imul(result ^ text.charCodeAt(i), 16777619);
  return result >>> 0;
}
const finitePoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const validPolygon = polygon => Array.isArray(polygon) && polygon.length && polygon.every(ring =>
  Array.isArray(ring) && ring.length >= 4 && ring.every(finitePoint));
function boundaryDistance(point, polygons) {
  let distance = Infinity;
  for (const polygon of polygons) for (const ring of polygon) {
    for (let i = 0, previous = ring.length - 1; i < ring.length; previous = i++) {
      distance = Math.min(distance, pointToSegmentDistance(point, ring[previous], ring[i]));
    }
  }
  return distance;
}

function bridgeExclusions(bridges) {
  return bridges.map(bridge => {
    const paths = (bridge.paths ?? []).filter(path => Array.isArray(path) && path.length > 1 && path.every(finitePoint));
    const width = Number.isFinite(bridge.width) && bridge.width > 0 ? bridge.width : 2.2;
    const approach = Math.max(4, Number.isFinite(bridge.rampLength) ? bridge.rampLength : 4);
    // Round buffered caps also protect the endpoints/approaches rather than just
    // the deck rectangle. Path-distance checks below retain full radial clearance.
    return { id: String(bridge.id ?? ''), paths, width, approach, polygons: bufferPaths(paths, width + approach * 2) };
  });
}
function clearsBridges(point, radius, bridges) {
  for (const bridge of bridges) {
    if (pointInMultiPolygon(point, bridge.polygons) ||
      boundaryDistance(point, bridge.polygons) <= radius + SHORE_MARGIN_METERS) return false;
    for (const path of bridge.paths) for (let i = 1; i < path.length; i++) {
      if (pointToSegmentDistance(point, path[i - 1], path[i]) <=
        bridge.width / 2 + bridge.approach + radius + SHORE_MARGIN_METERS) return false;
    }
  }
  return true;
}

function candidatesFor(water, featureIndex, bridges) {
  const candidates = [];
  for (const [polygonIndex, polygon] of (water.polygons ?? []).entries()) {
    if (!validPolygon(polygon)) continue;
    const bounds = ringBounds(polygon[0]), area = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
    // Campus inputs use 6.5 m cells. Bound work for unexpectedly large extents.
    const spacing = Math.max(6.5, Math.sqrt(area / 4096));
    if (!Number.isFinite(spacing)) continue;
    const columns = Math.ceil((bounds.maxX - bounds.minX) / spacing);
    const rows = Math.ceil((bounds.maxZ - bounds.minZ) / spacing);
    for (let ix = 0; ix < columns; ix++) for (let iz = 0; iz < rows; iz++) {
      const seed = hash(`${water.id ?? featureIndex}:${polygonIndex}:${ix}:${iz}`);
      const x = bounds.minX + (ix + .5 + ((seed & 255) / 255 - .5) * .32) * spacing;
      const z = bounds.minZ + (iz + .5 + (((seed >>> 8) & 255) / 255 - .5) * .32) * spacing;
      const point = [x, z], radius = .7 + ((seed >>> 16) & 255) / 255 * .45;
      const shoreDistance = boundaryDistance(point, [polygon]);
      if (!pointInPolygon(point, polygon) || shoreDistance < radius + SHORE_MARGIN_METERS ||
        shoreDistance > SHORE_BAND_METERS || !clearsBridges(point, radius, bridges)) continue;
      candidates.push({ waterId: String(water.id ?? ''), featureIndex, polygonIndex, x, z, radius,
        kind: seed % 4 === 0 ? 'reeds' : 'leaves', yaw: (seed % 360) * Math.PI / 180, seed, shoreDistance });
    }
  }
  return candidates.sort((a, b) => a.seed - b.seed || a.x - b.x || a.z - b.z);
}

function plantGeometry(kind) {
  const vertices = [], colors = [];
  const triangle = (a, b, c, color) => {
    vertices.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) colors.push(color.r, color.g, color.b);
  };
  if (kind === 'leaves') {
    for (let leaf = 0; leaf < 4; leaf++) {
      const angle = leaf * Math.PI / 2, color = new THREE.Color(leaf % 2 ? 0x71894b : 0x5a793e);
      const rotate = ([x, y, z]) => [x * Math.cos(angle) - z * Math.sin(angle), y, x * Math.sin(angle) + z * Math.cos(angle)];
      const points = [[0, .04, 0], [.4, .12, -.25], [.9, .05, 0], [.4, .12, .25]].map(rotate);
      triangle(points[0], points[2], points[1], color); triangle(points[0], points[3], points[2], color);
    }
  } else {
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5, x = Math.cos(angle) * .16, z = Math.sin(angle) * .16;
      const height = .6 + blade % 3 * .15, color = new THREE.Color(blade % 2 ? 0x8b9254 : 0x687f49);
      triangle([x - .035, 0, z], [x + .035, 0, z], [x * 2, height, z * 2], color);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Sparse seasonal art inside source water only; never adds bank/bridge collision. */
export function buildWaterDetails(mapData = {}) {
  const waters = mapData.water ?? [], bridges = bridgeExclusions(mapData.bridges ?? []);
  const queues = waters.map((water, index) => candidatesFor(water, index, bridges));
  const placements = [], cursors = queues.map(() => 0);
  // Round-robin the features so a long lake cannot consume the entire budget.
  while (placements.length < INSTANCE_CAP) {
    let progress = false;
    for (let featureIndex = 0; featureIndex < queues.length && placements.length < INSTANCE_CAP; featureIndex++) {
      const candidate = queues[featureIndex][cursors[featureIndex]++];
      if (!candidate) continue;
      // Also keeps multipolygon overlaps/close jittered cells from doubling up.
      if (placements.some(p => Math.hypot(p.x - candidate.x, p.z - candidate.z) < p.radius + candidate.radius + .5)) continue;
      placements.push(candidate); progress = true;
    }
    if (!progress && queues.every((queue, index) => cursors[index] >= queue.length)) break;
  }
  const group = new THREE.Group(); group.name = 'illustrative-aquatic-water-details';
  const geometries = [], meshes = [];
  const material = placements.length ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }) : null;
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (const kind of ['leaves', 'reeds']) {
    const plants = placements.filter(plant => plant.kind === kind);
    if (!plants.length) continue;
    const geometry = plantGeometry(kind); geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, plants.length); mesh.name = `aquatic-${kind}`;
    for (let index = 0; index < plants.length; index++) {
      const plant = plants[index];
      transform.position.set(plant.x, .04, plant.z); transform.rotation.set(0, plant.yaw, 0);
      transform.scale.setScalar(plant.radius); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
      const tone = .88 + (plant.seed % 17) / 100;
      tint.setRGB(tone, tone, tone); mesh.setColorAt(index, tint);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh); meshes.push(mesh);
  }
  const diagnostics = { appearanceStatus: 'source-inspired-illustrative-seasonal', plantLocationsStatus: 'not-surveyed',
    photoToPolygonMatchStatus: 'unresolved', sourceUrls: [...SOURCES], photographDates: ['2021-04-16', '2010-12-02'],
    placementRule: 'Whole plant footprint inside mapped water, within an 8 m shore band and clear of buffered bridge approaches',
    waters: waters.map((water, featureIndex) => ({ id: String(water.id ?? ''), osmType: water.osmType ?? null,
      name: water.name ?? '', kind: water.kind ?? null, featureIndex, plantLocationsStatus: 'illustrative',
      leaves: placements.filter(p => p.featureIndex === featureIndex && p.kind === 'leaves').length,
      reeds: placements.filter(p => p.featureIndex === featureIndex && p.kind === 'reeds').length })),
    placements: placements.map(({ seed, ...placement }) => ({ ...placement })), instanceCount: placements.length,
    instanceCap: INSTANCE_CAP, drawCalls: meshes.length, collisionObjects: 0, shoreBandMeters: SHORE_BAND_METERS,
    bridgeApproachMinimumMeters: 4,
    bridgeExclusions: bridges.map(bridge => ({ id: bridge.id, width: bridge.width, approachMarginMeters: bridge.approach })),
    limitations: ['Historical plant coverage is seasonal; no current species/location survey',
      'Map water names remain unchanged; lake aliases are not assigned to every pond',
      'Historical pond steps do not establish their precise present extent; no steps or bank structures added'] };
  group.userData.waterDetails = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; meshes.forEach(mesh => mesh.dispose()); geometries.forEach(geometry => geometry.dispose());
    material?.dispose(); group.removeFromParent(); group.clear();
  } };
}
