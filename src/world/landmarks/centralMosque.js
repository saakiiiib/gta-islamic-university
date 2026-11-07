import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pointInPolygon, pointToSegmentDistance } from '../../map/geometry.js';
import { wallEdges, tintGeometry } from '../facades.js';

export const CENTRAL_MOSQUE_ID = '1317423259';
const REFERENCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Central_Mosque_architectures_of_Islamic_University,_Bangladesh.jpg',
  'https://commons.wikimedia.org/wiki/File:Islamic_University_Central_Mosque_main_dome_and_others.jpg',
  'https://thedailycampus.com/public-university/138124',
]);

function clearance(point, polygon) {
  if (!pointInPolygon(point, polygon)) return -1;
  let distance = Infinity;
  for (const ring of polygon) for (let i = 1; i < ring.length; i++) {
    distance = Math.min(distance, pointToSegmentDistance(point, ring[i - 1], ring[i]));
  }
  return distance;
}

function candidates(polygon) {
  const ring = polygon[0], xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const points = [];
  for (let ix = 0; ix <= 32; ix++) for (let iz = 0; iz <= 32; iz++) {
    const center = [minX + (maxX - minX) * ix / 32, minZ + (maxZ - minZ) * iz / 32];
    const room = clearance(center, polygon);
    if (room > .1) points.push({ center, room });
  }
  return points;
}

function pointedArch(width, height, inset = 0) {
  const w = width / 2 - inset, bottom = inset, top = height - inset, spring = height * .58;
  const path = new THREE.Shape();
  path.moveTo(-w, bottom); path.lineTo(-w, spring);
  path.quadraticCurveTo(-w, top - height * .15, 0, top);
  path.quadraticCurveTo(w, top - height * .15, w, spring);
  path.lineTo(w, bottom); path.closePath();
  return path;
}

/** Visual augmentation only. Source body/roof and all collision remain caller-owned. */
export function buildCentralMosque(building, options = {}) {
  if (String(building?.id) !== CENTRAL_MOSQUE_ID || (building.osmType && building.osmType !== 'way')) {
    throw new TypeError('Central Mosque model requires OSM way 1317423259');
  }
  const polygon = building.polygons?.[0];
  if (building.polygons?.length !== 1 || !polygon?.[0]?.length || polygon.some(ring =>
    ring.length < 4 || ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
    ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])) {
    throw new TypeError('Central Mosque requires one finite closed mapped polygon');
  }
  const baseHeight = options.baseHeight ?? building.height ?? 9.6;
  const mainDomeTopMeters = options.mainDomeTopMeters ?? 27.4;
  if (!Number.isFinite(baseHeight) || baseHeight < 3 || !Number.isFinite(mainDomeTopMeters) ||
    mainDomeTopMeters <= baseHeight + 4 || mainDomeTopMeters > 100) {
    throw new RangeError('Mosque roof and provisional ground-to-finial height must leave room for the dome');
  }
  const points = candidates(polygon).sort((a, b) => b.room - a.room);
  if (!points.length || points[0].room < 3) throw new RangeError('Mosque footprint has no usable dome placement');
  const requested = options.mainDomeCenter;
  const mainCenter = requested ? [...requested] : [...points[0].center];
  if (mainCenter.length !== 2 || !mainCenter.every(Number.isFinite) || clearance(mainCenter, polygon) < 3) {
    throw new RangeError('Main dome center must be safely inside the mapped footprint');
  }
  const mainRadius = Math.min(12, clearance(mainCenter, polygon) * .7);
  const components = [], parts = [];
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv');
    tintGeometry(geometry, color);
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    parts.push(geometry);
  };
  const cylinder = (x, z, radius, bottom, height, color, sides = 24) =>
    add(new THREE.CylinderGeometry(radius, radius, height, sides).translate(x, bottom + height / 2, z), color);
  const dome = (kind, center, radius, bottom, rise, drum, finial) => {
    const [x, z] = center;
    cylinder(x, z, radius, bottom, drum, 0xd9d1bc, kind === 'main-dome' ? 8 : 16);
    cylinder(x, z, radius * 1.025, bottom + drum - .12, .16, 0x7a796c);
    const profile = [];
    for (let i = 0; i <= 12; i++) {
      const angle = i / 12 * Math.PI / 2;
      profile.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * rise));
    }
    add(new THREE.LatheGeometry(profile, kind === 'main-dome' ? 24 : 12).translate(x, bottom + drum, z), 0xe7e1d1);
    const top = bottom + drum + rise;
    if (finial > 0) {
      add(new THREE.ConeGeometry(Math.min(.17, radius * .08), finial, 8).translate(x, top + finial / 2, z), 0xada994);
      add(new THREE.SphereGeometry(Math.min(.23, radius * .12), 8, 6).translate(x, top + finial * .35, z), 0xc6bea4);
    }
    components.push({ kind, center: [...center], radius: radius * 1.025, bottom, top: top + finial });
  };

  const remaining = mainDomeTopMeters - baseHeight, mainDrum = Math.min(4.2, remaining * .28), finial = .9;
  dome('main-dome', mainCenter, mainRadius, baseHeight, remaining - mainDrum - finial, mainDrum, finial);
  for (let i = 0; i < 8; i++) {
    const angle = (i + .5) * Math.PI / 4, radius = mainRadius * Math.cos(Math.PI / 8) + .025;
    const g = new THREE.ShapeGeometry(pointedArch(mainRadius * .4, mainDrum * .73), 10);
    g.applyMatrix4(new THREE.Matrix4().set(
      Math.cos(angle), 0, Math.sin(angle), mainCenter[0] + Math.sin(angle) * radius,
      0, 1, 0, baseHeight + mainDrum * .1,
      -Math.sin(angle), 0, Math.cos(angle), mainCenter[1] + Math.cos(angle) * radius,
      0, 0, 0, 1));
    add(g, 0x474b43);
  }

  // The photographs establish a shallow secondary dome, not a surveyed roof plan.
  const freePoints = points.filter(p => p.room > 3.2 &&
    Math.hypot(p.center[0] - mainCenter[0], p.center[1] - mainCenter[1]) > mainRadius * 1.025 + Math.min(6, p.room * .6) + 1);
  const secondary = freePoints.sort((a, b) => b.room - a.room || a.center[1] - b.center[1])[0];
  if (secondary) {
    const radius = Math.min(6, secondary.room * .6), [x, z] = secondary.center;
    cylinder(x, z, radius * 1.15, baseHeight, .65, 0xd3cdbd);
    dome('secondary-dome', secondary.center, radius, baseHeight + .65, radius * .35, .15, .65);
  }

  // Four small domed roof cupolas are visible in the historical aerial reference.
  // Their low height is deliberately distinct from the planned 150-foot minarets.
  for (let i = 0; i < 4; i++) {
    const usable = points.filter(p => p.room > 1.8 && components.every(c =>
      Math.hypot(p.center[0] - c.center[0], p.center[1] - c.center[1]) > c.radius + 2));
    const point = usable.sort((a, b) => {
      const score = p => Math.min(...components.map(c => Math.hypot(p.center[0] - c.center[0], p.center[1] - c.center[1]) - c.radius));
      return score(b) - score(a);
    })[0];
    if (!point) break;
    const scale = Math.min(1, (remaining - .25) / 4.35);
    dome('roof-cupola', point.center, 1.35, baseHeight, 1.6 * scale, 2.2 * scale, .55 * scale);
  }

  let archCount = 0;
  if (options.includeFacadeArches !== false) {
    const levels = Math.max(1, Math.round(baseHeight / 3.2));
    for (const edge of wallEdges(polygon).filter(e => !e.ringIndex && e.length > 4)) {
      const bays = Math.max(1, Math.floor(edge.length / 4.8)), spacing = edge.length / bays;
      for (let row = 0; row < levels; row++) for (let bay = 0; bay < bays; bay++) {
        const height = baseHeight / levels * .86, width = Math.min(spacing * .7, height * .8);
        const shape = pointedArch(width, height), hole = pointedArch(width, height, .13);
        shape.holes.push(new THREE.Path(hole.getPoints(4)));
        const g = new THREE.ExtrudeGeometry(shape, { depth: .075, bevelEnabled: false, curveSegments: 4 });
        const at = edge.at((bay + .5) * spacing, row * baseHeight / levels + .12, .045);
        const matrix = new THREE.Matrix4().set(
          edge.ux, 0, edge.nx, at[0], 0, 1, 0, at[1], edge.uz, 0, edge.nz, at[2], 0, 0, 0, 1);
        g.applyMatrix4(matrix); add(g, 0xe6dfcc); archCount++;
        // Upper arches read as recessed glazing; leave ground-level openings
        // free of decorative infill or additional collision.
        if (row > 0) {
          const inset = new THREE.ShapeGeometry(pointedArch(width, height, .14), 4);
          inset.applyMatrix4(matrix); add(inset, 0x56605c);
        }
      }
    }
  }

  const geometry = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!geometry) throw new Error('Could not merge Central Mosque geometry');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .94, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'central-mosque-domes-and-arches'; mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'central-mosque-landmark'; group.add(mesh);
  const diagnostics = {
    osmType: 'way', osmId: CENTRAL_MOSQUE_ID, baseHeight, mainDomeTopMeters,
    heightStatus: 'reported-ambiguous-datum', physicalDatum: 'provisional ground-to-finial interpretation',
    layoutStatus: requested ? 'caller-supplied-main-center' : 'illustrative-contained-roof-layout',
    components, archCount, drawCalls: 1, collisionObjects: 0, plannedMinarets: 0,
    sourceUrls: [...REFERENCES], observedAt: '2021-04',
  };
  group.userData.centralMosque = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
