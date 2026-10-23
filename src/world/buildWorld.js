import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingGeometry, surfaceGeometry, geometryMaterialPart, polygonCenter, ringArea, geometryFromTriangles, pushQuad, lineSegmentsGeometry } from './geometry.js';
import { makeBridgeGeometries, measurePath, samplePath } from './bridge.js';

export { bridgeHeightAt } from './bridge.js';

const CHUNK_SIZE = 150;
const hashId = id => [...String(id)].reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7);

function facadeGeometry(polygon, height) {
  const windows = [], bands = [];
  const floors = Math.max(1, Math.floor(height / 3.2));
  for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
    const ring = polygon[ringIndex];
    const orientation = Math.sign(ringArea(ring)) || 1;
    const outward = orientation * (ringIndex === 0 ? 1 : -1);
    for (let i = 1; i < ring.length; i++) {
      const [ax, az] = ring[i - 1], [bx, bz] = ring[i];
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < 0.3) continue;
      const ux = dx / length, uz = dz / length;
      const nx = uz * outward, nz = -ux * outward;
      const at = (distance, y, offset = 0.032) => [ax + ux * distance + nx * offset, y, az + uz * distance + nz * offset];
      for (let floor = 0; floor < floors; floor++) {
        const y0 = floor * 3.2 + 1.05, y1 = Math.min(height - 0.55, y0 + 1.35);
        if (y1 <= y0 || length < 2.1) continue;
        const count = Math.max(1, Math.floor((length - 1.0) / 2.65));
        const spacing = length / count;
        for (let w = 0; w < count; w++) {
          const centre = (w + 0.5) * spacing;
          const half = Math.min(0.62, spacing * 0.25);
          pushQuad(windows, at(centre - half, y0), at(centre + half, y0), at(centre + half, y1), at(centre - half, y1));
          // Narrow pale lintels read at human scale without textures or decals.
          pushQuad(bands, at(centre - half - 0.08, y1, 0.04), at(centre + half + 0.08, y1, 0.04), at(centre + half + 0.08, y1 + 0.1, 0.04), at(centre - half - 0.08, y1 + 0.1, 0.04));
        }
      }
      for (let floor = 1; floor < floors; floor++) {
        const y = floor * 3.2;
        pushQuad(bands, at(0, y - 0.08, 0.04), at(length, y - 0.08, 0.04), at(length, y + 0.1, 0.04), at(0, y + 0.1, 0.04));
      }
      pushQuad(bands, at(0, height - 0.22, 0.045), at(length, height - 0.22, 0.045), at(length, height + 0.04, 0.045), at(0, height + 0.04, 0.045));
    }
  }
  return { windows: geometryFromTriangles(windows), bands: geometryFromTriangles(bands) };
}

class SpatialBatches {
  constructor(group, collisionGroup) {
    this.group = group;
    this.collisionGroup = collisionGroup;
    this.buckets = new Map();
    this.buildingMeshes = [];
    this.bridgeMeshes = [];
  }
  add(geometry, material, x, z, { collision = false, kind = 'surface' } = {}) {
    if (!geometry.getAttribute('position')?.count) { geometry.dispose(); return; }
    // Standardise attributes for independently generated caps, strips and quads.
    geometry.deleteAttribute('uv');
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    const key = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)},${material.uuid},${collision},${kind}`;
    if (!this.buckets.has(key)) this.buckets.set(key, { geometries: [], material, collision, kind });
    this.buckets.get(key).geometries.push(geometry);
  }
  finish() {
    for (const { geometries, material, collision, kind } of this.buckets.values()) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach(item => item.dispose());
      if (!geometry) throw new Error(`Could not merge ${kind} geometry`);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${kind}-chunk`;
      mesh.receiveShadow = true;
      mesh.castShadow = kind === 'building' || kind === 'bridge';
      this.group.add(mesh);
      if (kind === 'building') this.buildingMeshes.push(mesh);
      if (kind === 'bridge') this.bridgeMeshes.push(mesh);
      if (collision) {
        const collider = new THREE.Mesh(geometry, material);
        collider.name = `collision-${kind}`;
        this.collisionGroup.add(collider);
      }
    }
    this.buckets.clear();
  }
}

function addTrees(mapData, group, materials) {
  const points = [...(mapData.trees ?? [])].map(p => ({ x: p.x, z: p.z, id: p.id }));
  for (const row of mapData.treeRows ?? []) {
    for (const path of row.paths ?? []) {
      if (path.length < 2) continue;
      const { distances, length } = measurePath(path);
      for (let d = 0; d <= length; d += 7) {
        const p = samplePath(path, distances, d);
        if (!points.some(q => Math.hypot(p.x - q.x, p.z - q.z) < 2)) points.push({ x: p.x, z: p.z, id: `${row.id}-${d}` });
      }
    }
  }
  if (!points.length) return;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.28, 2.8, 6), materials.trunk, points.length);
  const canopy = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), materials.foliage, points.length);
  const transform = new THREE.Object3D();
  points.forEach((point, i) => {
    const variation = (hashId(point.id) % 100) / 100;
    transform.position.set(point.x, 1.4, point.z); transform.scale.set(1, 1, 1); transform.rotation.set(0, 0, 0); transform.updateMatrix(); trunk.setMatrixAt(i, transform.matrix);
    transform.position.set(point.x, 3.5 + variation * 0.5, point.z); transform.scale.set(2.1 + variation * 0.7, 2.15 + variation * 0.65, 2.1 + variation * 0.7); transform.rotation.y = variation * Math.PI; transform.updateMatrix(); canopy.setMatrixAt(i, transform.matrix);
    canopy.setColorAt(i, new THREE.Color().setHSL(0.27 + variation * 0.045, 0.25, 0.29 + variation * 0.075));
  });
  trunk.name = 'mapped-tree-trunks'; canopy.name = 'mapped-tree-canopies';
  trunk.castShadow = canopy.castShadow = true; trunk.receiveShadow = canopy.receiveShadow = true;
  group.add(trunk, canopy);
}

export function buildWorld(mapData, { onProgress = () => {} } = {}) {
  const group = new THREE.Group(); group.name = 'islamic-university-map';
  const collisionGroup = new THREE.Group(); collisionGroup.name = 'campus-colliders'; collisionGroup.visible = false;
  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, ...options });
  const materials = {
    ground: standard(0x8f9b72), asphalt: standard(0x53575a), path: standard(0xc9bd96),
    roof: standard(0xb7b7aa), windows: standard(0x536a70, { roughness: 0.52, metalness: 0.08, side: THREE.DoubleSide }),
    trim: standard(0xe2dcc4, { side: THREE.DoubleSide }), water: standard(0x4d8792, { roughness: 0.28, metalness: 0.13 }),
    garden: standard(0x698655), park: standard(0x79976c), grass: standard(0x7e9966),
    forest: standard(0x4d745b), orchard: standard(0x6d885b), pitch: standard(0x9ba477),
    bridge: standard(0xc0bca6), rail: standard(0x525e61, { metalness: 0.3 }),
    trunk: standard(0x745e48), foliage: standard(0x61805a),
    roadLine: new THREE.MeshBasicMaterial({ color: 0xddd8b4 }),
    pitchLine: new THREE.LineBasicMaterial({ color: 0xd8dcc1, transparent: true, opacity: 0.7 }),
    walls: [0xd5cfb8, 0xc7bf9f, 0xd5d2c1, 0xc3c4b0, 0xcbb69a].map(color => standard(color)),
  };
  const batches = new SpatialBatches(group, collisionGroup);
  const bounds = mapData.bounds;
  const ground = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  ground.rotateX(-Math.PI / 2);
  ground.translate((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  batches.add(ground, materials.ground, 0, 0, { collision: true, kind: 'ground' });
  onProgress('Rendering mapped landscape');
  for (const green of mapData.greens ?? []) {
    const key = /forest|wood/.test(green.kind) ? 'forest' : /orchard/.test(green.kind) ? 'orchard' : /pitch|recreation_ground/.test(green.kind) ? 'pitch' : /garden/.test(green.kind) ? 'garden' : /park/.test(green.kind) ? 'park' : 'grass';
    for (const polygon of green.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(surfaceGeometry(polygon, 0.012), materials[key], x, z);
      if (key === 'pitch') {
        const line = new THREE.LineSegments(lineSegmentsGeometry(polygon, 0.025), materials.pitchLine);
        line.name = 'mapped-pitch-boundary'; group.add(line);
      }
    }
  }
  for (const water of mapData.water ?? []) {
    for (const polygon of water.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(surfaceGeometry(polygon, 0.021), materials.water, x, z, { kind: 'water' });
    }
  }
  for (const road of mapData.roads ?? []) {
    const path = /path|footway|cycleway|pedestrian|steps|track/.test(road.kind);
    for (const polygon of road.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(surfaceGeometry(polygon, path ? 0.047 : 0.04), path ? materials.path : materials.asphalt, x, z, { kind: 'road' });
    }
    if (/^(trunk|tertiary)$/.test(road.kind)) {
      for (const path of road.paths ?? []) {
        const { distances, length } = measurePath(path);
        for (let distance = 0; distance + 3 < length; distance += 9) {
          const a = samplePath(path, distances, distance), b = samplePath(path, distances, distance + 3);
          const vertices = [];
          pushQuad(vertices, [a.x + a.nx * 0.06, 0.045, a.z + a.nz * 0.06], [b.x + b.nx * 0.06, 0.045, b.z + b.nz * 0.06], [b.x - b.nx * 0.06, 0.045, b.z - b.nz * 0.06], [a.x - a.nx * 0.06, 0.045, a.z - a.nz * 0.06]);
          batches.add(geometryFromTriangles(vertices), materials.roadLine, a.x, a.z, { kind: 'road-marking' });
        }
      }
    }
  }
  onProgress('Extruding campus buildings');
  for (const building of mapData.buildings ?? []) {
    const wallMaterial = materials.walls[hashId(building.id) % materials.walls.length];
    for (const polygon of building.polygons) {
      const [x, z] = polygonCenter(polygon);
      const geometry = buildingGeometry(polygon, building.height);
      batches.add(geometryMaterialPart(geometry, 0), materials.roof, x, z, { collision: true, kind: 'building' });
      batches.add(geometryMaterialPart(geometry, 1), wallMaterial, x, z, { collision: true, kind: 'building' });
      geometry.dispose();
      const facade = facadeGeometry(polygon, building.height);
      batches.add(facade.windows, materials.windows, x, z, { kind: 'facade' });
      batches.add(facade.bands, materials.trim, x, z, { kind: 'facade' });
    }
  }
  for (const bridge of mapData.bridges ?? []) {
    const geometries = makeBridgeGeometries(bridge);
    const centre = bridge.paths?.[0]?.[0] ?? [0, 0];
    for (const deck of geometries.decks) batches.add(deck, materials.bridge, ...centre, { collision: true, kind: 'bridge' });
    for (const rail of geometries.rails) batches.add(rail, materials.rail, ...centre, { kind: 'bridge-rail' });
  }
  batches.finish();
  addTrees(mapData, group, materials);
  group.updateMatrixWorld(true); collisionGroup.updateMatrixWorld(true);
  onProgress('Campus geometry ready');
  let elapsed = 0;
  return {
    group, collisionGroup, bridgeMeshes: batches.bridgeMeshes, buildingMeshes: batches.buildingMeshes,
    update(dt) {
      elapsed += Math.max(0, dt);
      // Restrained tonal movement suggests a breeze on the water, with no
      // per-vertex work and no animated world geometry in the collision tree.
      const lightness = 1 + Math.sin(elapsed * 0.55) * 0.018;
      materials.water.color.setHex(0x4d8792).multiplyScalar(lightness);
    },
    dispose() {
      const geometries = new Set();
      group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      collisionGroup.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      const allMaterials = new Set(Object.values(materials).flat());
      allMaterials.forEach(material => material.dispose());
      group.clear(); collisionGroup.clear();
    },
  };
}
