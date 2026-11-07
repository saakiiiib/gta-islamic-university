import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { buildingGeometry } from '../geometry.js';
import { wallEdges, tintGeometry } from '../facades.js';

export const AUDITORIUM_ID = '7650711';
const PHOTO_URL = 'https://commons.wikimedia.org/wiki/File:Architectures_of_Islamic_University,_Bangladesh._Birshreshtha_Hamidur_Rahman_Auditorium.jpg';

// A continuous inverted-U strip, including the jambs but no threshold bar.
function openArch(width, height, thickness) {
  const half = width / 2, inner = half - thickness, spring = height - width * .24;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0); shape.lineTo(-half, spring);
  shape.bezierCurveTo(-half, height, half, height, half, spring);
  shape.lineTo(half, 0); shape.lineTo(inner, 0); shape.lineTo(inner, spring);
  shape.bezierCurveTo(inner, height - thickness, -inner, height - thickness, -inner, spring);
  shape.lineTo(-inner, 0); shape.closePath();
  return shape;
}

function anchorInside(polygon) {
  const xs = polygon[0].map(p => p[0]), zs = polygon[0].map(p => p[1]);
  const minX = Math.min(...xs), minZ = Math.min(...zs), width = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  let best;
  for (let ix = 1; ix < 25; ix++) for (let iz = 1; iz < 25; iz++) {
    const point = [minX + width * ix / 25, minZ + depth * iz / 25];
    if (!pointInPolygon(point, polygon)) continue;
    const room = Math.min(...polygon.flatMap(ring => ring.slice(1).map((p, i) => pointToSegmentDistance(point, ring[i], p))));
    if (!best || room > best.room) best = { point, room };
  }
  return best;
}

/** Adds visual roof masses/entry trim; the caller retains the mapped body and collision. */
export function buildAuditorium(building, options = {}) {
  if (String(building?.id) !== AUDITORIUM_ID || (building.osmType && building.osmType !== 'relation')) {
    throw new TypeError('Auditorium model requires OSM relation 7650711');
  }
  const polygon = building.polygons?.[0];
  if (building.polygons?.length !== 1 || !polygon?.[0]?.length || polygon.some(ring => ring.length < 4 ||
    ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
    throw new TypeError('Auditorium requires one finite closed mapped polygon');
  }
  const height = options.baseHeight ?? building.height ?? 9.6;
  const projection = options.entryProjection ?? .9;
  if (!Number.isFinite(height) || height < 4 || height > 40 || !Number.isFinite(projection) || projection < .15 || projection > 1.25) {
    throw new RangeError('Auditorium height/projection must be finite and within visual augmentation limits');
  }
  const edges = wallEdges(polygon).filter(e => !e.ringIndex && e.length >= 4);
  if (!edges.length) throw new RangeError('Auditorium has no usable outer facade');
  const samePoint = (a, b) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
  const requested = options.entrances;
  if (requested !== undefined && (!Array.isArray(requested) || !requested.length)) throw new TypeError('Entrances must be a nonempty array');
  const entryInputs = requested ?? [{ edge: [...edges].sort((a, b) => b.length - a.length)[0], source: 'illustrative-longest-edge' }];
  const entries = entryInputs.map(entry => {
    const edge = edges.find(e => samePoint(e.a, entry.edge?.a) && samePoint(e.b, entry.edge?.b));
    const distance = entry.distance ?? edge?.length / 2;
    if (!edge || !Number.isFinite(distance) || distance < 1 || distance > edge.length - 1) {
      throw new RangeError('Entrance must lie away from a corner on a mapped outer edge');
    }
    return { edge, distance, source: entry.source ?? 'caller-supplied-unverified' };
  });
  const anchor = anchorInside(polygon);
  if (!anchor || anchor.room < 1) throw new RangeError('Auditorium footprint has no usable hall roof');
  const parts = [], entryDetails = [];
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv'); tintGeometry(geometry, color);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    parts.push(geometry);
  };
  const onEdge = (geometry, edge, distance, y, outward, color) => {
    const at = edge.at(distance, y, outward);
    geometry.applyMatrix4(new THREE.Matrix4().set(
      edge.ux, 0, edge.nx, at[0], 0, 1, 0, at[1], edge.uz, 0, edge.nz, at[2], 0, 0, 0, 1));
    add(geometry, color);
  };

  // Follow every original ring, including holes; no invented rectangular site slab.
  const cap = buildingGeometry(polygon, .14); cap.translate(0, height + .015, 0); add(cap, 0xc6b9aa);
  const front = entries[0].edge, halfWidth = anchor.room * 1.16, halfDepth = anchor.room * .92;
  const rectangle = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth], [-halfWidth, -halfDepth]]
    .map(([u, v]) => [anchor.point[0] + front.ux * u + front.nx * v, anchor.point[1] + front.uz * u + front.nz * v]);
  const hallPolygons = polygonClipping.intersection(building.polygons, [rectangle]);
  const hallRise = Math.min(2.1, height * .2);
  for (const p of hallPolygons) {
    const walls = buildingGeometry(p, hallRise); walls.translate(0, height + .16, 0); add(walls, 0x9e6d61);
    const slab = buildingGeometry(p, .18); slab.translate(0, height + .16 + hallRise, 0); add(slab, 0xd5c7b5);
  }

  for (const { edge, distance, source } of entries) {
    const width = Math.min(7.8, Math.min(distance, edge.length - distance) * 1.65);
    const archHeight = Math.min(7, height * .76), trim = Math.min(.42, width * .07);
    const frame = new THREE.ExtrudeGeometry(openArch(width, archHeight, trim), { depth: projection - .08, bevelEnabled: false, curveSegments: 12 });
    onEdge(frame, edge, distance, .06, .08, 0xe0cbb5);
    // Only overhead slabs span the opening. No closed front/back panel or stairs.
    for (const [dy, depth, color] of [[.10, projection, 0xa77465], [.45, projection * .84, 0xd9c7b0]]) {
      onEdge(new THREE.BoxGeometry(width + .45, .18, depth), edge, distance, archHeight + dy, depth / 2 + .035, color);
    }
    entryDetails.push({ center: edge.at(distance, 0, 0), source, width, clearWidth: width - trim * 2,
      archHeight, maxProjection: projection + .08, surveyed: source === 'surveyed' });
  }

  // High facade ornaments are independent of occupied floor counts.
  let upperArches = 0;
  for (const edge of edges) {
    const count = Math.max(1, Math.floor(edge.length / 6)), spacing = edge.length / count;
    for (let i = 0; i < count; i++) {
      const width = Math.min(3.3, spacing * .62), h = Math.min(2.05, height * .22);
      const shape = openArch(width, h, .18);
      onEdge(new THREE.ExtrudeGeometry(shape, { depth: .07, bevelEnabled: false, curveSegments: 10 }),
        edge, spacing * (i + .5), height - h - .28, .045, 0xdac7b1);
      upperArches++;
    }
  }

  const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
  if (!geometry) throw new Error('Could not merge auditorium augmentation');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .95, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'auditorium-layered-roof-and-arches'; mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'birshreshtha-hamidur-rahman-auditorium'; group.add(mesh);
  const diagnostics = { osmType: 'relation', osmId: AUDITORIUM_ID, baseHeight: height,
    heightStatus: 'caller-body-height-unmeasured', roofRise: hallRise + .34, footprintStatus: 'source-osm',
    detailStatus: 'illustrative-dimensions-from-historical-photo', entries: entryDetails, upperArches,
    drawCalls: 1, collisionObjects: 0, maxFacadeProjection: projection + .08,
    sourceUrl: PHOTO_URL, observedAt: '2021-04-04', hallPolygons };
  group.userData.auditorium = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
