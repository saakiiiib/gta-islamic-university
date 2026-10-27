import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildingGeometry, surfaceGeometry, geometryMaterialPart, polygonCenter, lineSegmentsGeometry } from './geometry.js';
import { makeBridgeGeometries, measurePath, samplePath } from './bridge.js';
import { buildRoadAppearance, ROAD_LEVELS } from './roads.js';
import { buildingPalette, hashId, LAND_COLORS } from './appearance.js';
import { facadeGeometry, tintGeometry, chooseEntries } from './facades.js';
import { planVegetation } from './vegetation.js';
import { horizontalUVs, facadeUVs, ensureBatchUVs, disposeWorldTextures } from './assets.js';
import { buildScenery } from './scenery.js';
import { buildMainGate } from './mainGate.js';

export { bridgeHeightAt } from './bridge.js';

const CHUNK_SIZE = 150;

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
    // Preserve metre-scaled UVs while standardising independently generated
    // surfaces, facade quads and caps for the shared spatial batches.
    ensureBatchUVs(geometry);
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
      if (kind === 'road') mesh.renderOrder = 1;
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

function addTrees(mapData, group, materials, decoration) {
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
  points.push(...decoration.trees);
  if (!points.length && !decoration.shrubs.length) return;
  // A single coloured unit tree permits trunks, crowns and low shrubs to share
  // one instanced draw, rather than adding draw calls for each planting family.
  const trunkGeometry = new THREE.CylinderGeometry(.17, .28, 2.8, 6).translate(0, 1.4, 0);
  const crownGeometry = new THREE.DodecahedronGeometry(1, 0).scale(2.1, 2.15, 2.1).translate(0, 3.5, 0);
  tintGeometry(trunkGeometry, 0x745e48); tintGeometry(crownGeometry, 0x61805a);
  trunkGeometry.deleteAttribute('uv'); crownGeometry.deleteAttribute('uv');
  const sourceTrunk = trunkGeometry.index ? trunkGeometry.toNonIndexed() : trunkGeometry;
  const geometry = mergeGeometries([sourceTrunk, crownGeometry], false);
  if (sourceTrunk !== trunkGeometry) sourceTrunk.dispose(); trunkGeometry.dispose(); crownGeometry.dispose();
  const canopy = new THREE.InstancedMesh(geometry, materials.foliage, points.length + decoration.shrubs.length);
  const transform = new THREE.Object3D();
  points.forEach((point, i) => {
    const variation = (hashId(point.id) % 100) / 100;
    transform.position.set(point.x, 0, point.z); transform.scale.setScalar(1 + variation * .28); transform.rotation.set(0, variation * Math.PI, 0); transform.updateMatrix(); canopy.setMatrixAt(i, transform.matrix);
    canopy.setColorAt(i, new THREE.Color().setScalar(.9 + variation * .1));
  });
  decoration.shrubs.forEach((point, i) => {
    transform.position.set(point.x, 0, point.z); transform.scale.set(.44, .22, .44); transform.rotation.y = hashId(point.id) % 6; transform.updateMatrix(); canopy.setMatrixAt(points.length + i, transform.matrix);
    canopy.setColorAt(points.length + i, new THREE.Color(.95, 1, .9));
  });
  canopy.name = 'mapped-tree-canopies'; canopy.userData.includesTrunksAndShrubs = true;
  canopy.castShadow = canopy.receiveShadow = true; group.add(canopy);
}

export function buildWorld(mapData, { onProgress = () => {}, preparedData = null } = {}) {
  const group = new THREE.Group(); group.name = 'islamic-university-map';
  const collisionGroup = new THREE.Group(); collisionGroup.name = 'campus-colliders'; collisionGroup.visible = false;
  const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, ...options });
  const materials = {
    ground: standard(LAND_COLORS.ground), pavement: standard(0xffffff, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    asphalt: standard(0x343b3b, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    paths: standard(0xd3cebc, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    edges: standard(0xaeb5aa, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    building: standard(0xffffff, { vertexColors: true }), roof: standard(0xffffff, { vertexColors: true }),
    brick: standard(0xffffff, { vertexColors: true }), shedRoof: standard(0xffffff, { vertexColors: true, metalness: .35 }),
    windows: standard(0x4b6669, { roughness: 0.35, metalness: 0.18 }),
    decor: standard(0xffffff, { vertexColors: true }), water: standard(LAND_COLORS.water, { roughness: 0.3, metalness: 0.15 }),
    garden: standard(LAND_COLORS.garden), park: standard(LAND_COLORS.park), grass: standard(LAND_COLORS.grass),
    forest: standard(LAND_COLORS.forest), orchard: standard(LAND_COLORS.orchard), pitch: standard(LAND_COLORS.pitch),
    bridge: standard(0xc0bca6), rail: standard(0x525e61, { metalness: 0.3 }),
    foliage: standard(0xffffff, { vertexColors: true }),
    pitchLine: new THREE.LineBasicMaterial({ color: 0xd8dcc1, transparent: true, opacity: 0.7 }),
    debugRoad: new THREE.LineBasicMaterial({ color: 0x49e7f0, transparent: true, opacity: .8, depthTest: false }),
    debugBuilding: new THREE.LineBasicMaterial({ color: 0xffbd54, transparent: true, opacity: .9, depthTest: false }),
  };
  // Concrete roof/wall appearance is carried by their own UVs and vertex tints;
  // sharing the material retains batching instead of doubling academic chunks.
  materials.roof.dispose(); materials.roof = materials.building;
  const batches = new SpatialBatches(group, collisionGroup);
  const bounds = mapData.bounds;
  const ground = new THREE.PlaneGeometry(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  ground.rotateX(-Math.PI / 2);
  ground.translate((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
  horizontalUVs(ground, 5);
  batches.add(ground, materials.ground, 0, 0, { collision: true, kind: 'ground' });
  onProgress('Rendering mapped landscape');
  for (const green of mapData.greens ?? []) {
    const key = /forest|wood/.test(green.kind) ? 'forest' : /orchard/.test(green.kind) ? 'orchard' : /pitch|recreation_ground/.test(green.kind) ? 'pitch' : /garden/.test(green.kind) ? 'garden' : /park/.test(green.kind) ? 'park' : 'grass';
    for (const polygon of green.polygons) {
      const [x, z] = polygonCenter(polygon);
      batches.add(horizontalUVs(surfaceGeometry(polygon, 0.012), key === 'pitch' ? 6 : 4), materials[key], x, z);
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
  onProgress('Joining roads and opening walking connections');
  const roadAppearance = preparedData?.roads ?? buildRoadAppearance(mapData);
  for (const [key, level, color] of [['asphalt', ROAD_LEVELS.asphalt, 0x343e43], ['paths', ROAD_LEVELS.path, 0xd2c29c], ['edges', ROAD_LEVELS.edge, 0xbac2ad], ['markings', ROAD_LEVELS.marking, 0xeae4b6]]) {
    for (const polygon of roadAppearance[key]) {
      const [x, z] = polygonCenter(polygon);
      const material = key === 'asphalt' ? materials.asphalt : key === 'paths' ? materials.paths : key === 'edges' ? materials.edges : materials.pavement;
      const geometry = horizontalUVs(surfaceGeometry(polygon, level), key === 'asphalt' ? 4 : 2.4);
      // Keep vertex colours consistent within a batch, without darkening photos twice.
      batches.add(tintGeometry(geometry, key === 'asphalt' || key === 'paths' ? 0xffffff : color), material, x, z, { kind: 'road' });
    }
  }
  for (const polygon of roadAppearance.curbs) {
    const [x, z] = polygonCenter(polygon), geometry = buildingGeometry(polygon, ROAD_LEVELS.curbTop - ROAD_LEVELS.curbBase);
    geometry.translate(0, ROAD_LEVELS.curbBase, 0);
    batches.add(tintGeometry(geometry, 0xc2c5b8), materials.edges, x, z, { kind: 'road' });
  }
  onProgress('Extruding campus buildings');
  const entryTreatments = [];
  for (const building of mapData.buildings ?? []) {
    const palette = buildingPalette(building), entries = chooseEntries(building, mapData.roads, mapData.entrances);
    entryTreatments.push(...entries.map(e => ({ buildingId: building.id, source: e.source, nodeId: e.nodeId, position: e.edge.at(e.distance, 0, 0) })));
    for (const polygon of building.polygons) {
      const [x, z] = polygonCenter(polygon);
      const geometry = buildingGeometry(polygon, building.height);
      const roofMaterial = /^(shed|garage|grarage)$/.test(building.tags?.building ?? '') ? materials.shedRoof : materials.roof;
      const wallMaterial = palette.kind === 'residential' || palette.kind === 'construction' ? materials.brick : materials.building;
      // Only UV/material attributes change; the original collision positions and
      // triangle winding remain those of the unmodified OSM extrusion.
      batches.add(tintGeometry(horizontalUVs(geometryMaterialPart(geometry, 0), 3), palette.roof), roofMaterial, x, z, { collision: true, kind: 'building' });
      batches.add(tintGeometry(facadeUVs(geometryMaterialPart(geometry, 1), polygon, wallMaterial === materials.brick ? 2.5 : 3.5), palette.wall), wallMaterial, x, z, { collision: true, kind: 'building' });
      geometry.dispose();
      const facade = facadeGeometry(polygon, building.height, palette, entries);
      batches.add(facade.windows, materials.windows, x, z, { kind: 'facade' });
      batches.add(facade.details, materials.decor, x, z, { kind: 'facade' });
    }
  }
  for (const bridge of mapData.bridges ?? []) {
    const geometries = makeBridgeGeometries(bridge);
    const centre = bridge.paths?.[0]?.[0] ?? [0, 0];
    for (const deck of geometries.decks) batches.add(deck, materials.bridge, ...centre, { collision: true, kind: 'bridge' });
    for (const rail of geometries.rails) batches.add(rail, materials.rail, ...centre, { kind: 'bridge-rail' });
  }
  batches.finish();
  const vegetation = preparedData?.vegetation ?? planVegetation(mapData);
  addTrees(mapData, group, materials, vegetation);
  const scenery = buildScenery(mapData, { vegetation, preparedProps: preparedData?.scenery });
  group.add(scenery.group);
  const mainGate = buildMainGate({ mapData });
  group.add(mainGate.group);
  scenery.collisionGroup.add(mainGate.collisionGroup);
  if (scenery.obstacles && mainGate.obstacles) scenery.obstacles.push(...mainGate.obstacles);
  const footprintDebug = new THREE.Group(); footprintDebug.name = 'osm-alignment-debug'; footprintDebug.visible = false;
  const debugLines = (rings, elevation, material) => {
    if (!rings.length) return;
    const line = new THREE.LineSegments(lineSegmentsGeometry(rings, elevation), material); line.renderOrder = 20; line.frustumCulled = false; footprintDebug.add(line);
  };
  debugLines((mapData.roads ?? []).flatMap(r => [...r.polygons.flatMap(p => p), ...r.paths]), .17, materials.debugRoad);
  debugLines((mapData.buildings ?? []).flatMap(b => b.polygons.flatMap(p => p)), .17, materials.debugBuilding);
  group.add(footprintDebug);
  group.updateMatrixWorld(true); collisionGroup.updateMatrixWorld(true);
  onProgress('Campus geometry ready');
  let elapsed = 0;
  const world = {
    group, collisionGroup, materials, scenery, bridgeMeshes: batches.bridgeMeshes, buildingMeshes: batches.buildingMeshes,
    decoration: { roads: roadAppearance, vegetation, entryTreatments }, footprintDebug, labelAnchors: mapData.places ?? [],
    update(dt) {
      elapsed += Math.max(0, dt);
      // Restrained tonal movement suggests a breeze on the water, with no
      // per-vertex work and no animated world geometry in the collision tree.
      const lightness = 1 + Math.sin(elapsed * 0.55) * 0.018;
      materials.water.color.setHex(LAND_COLORS.water).multiplyScalar(lightness);
    },
    dispose() {
      disposeWorldTextures(world); scenery.dispose(); mainGate?.dispose();
      const geometries = new Set();
      group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      collisionGroup.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
      geometries.forEach(geometry => geometry.dispose());
      const allMaterials = new Set(Object.values(materials).flat());
      allMaterials.forEach(material => material.dispose());
      group.clear(); collisionGroup.clear();
    },
  };
  return world;
}
