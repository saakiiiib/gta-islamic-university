import * as THREE from 'three';
import { geometryFromTriangles, pushQuad } from './geometry.js';

export function measurePath(path) {
  const distances = [0];
  for (let i = 1; i < path.length; i++) distances.push(distances[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  return { distances, length: distances.at(-1) ?? 0 };
}

export function bridgeElevation(distance, length, bridge) {
  const base = 0.035;
  const top = Number.isFinite(bridge.elevation) ? bridge.elevation : 0.45;
  const ramp = Math.min(bridge.rampLength ?? 4, length * 0.3);
  if (ramp <= 0) return base;
  return base + (top - base) * Math.max(0, Math.min(1, distance / ramp, (length - distance) / ramp));
}

export function samplePath(path, distances, distance) {
  for (let i = 1; i < path.length; i++) {
    if (distance <= distances[i] || i === path.length - 1) {
      const span = distances[i] - distances[i - 1];
      const t = span > 0 ? Math.max(0, Math.min(1, (distance - distances[i - 1]) / span)) : 0;
      const dx = path[i][0] - path[i - 1][0], dz = path[i][1] - path[i - 1][1];
      const norm = Math.hypot(dx, dz) || 1;
      return { x: path[i - 1][0] + dx * t, z: path[i - 1][1] + dz * t, nx: -dz / norm, nz: dx / norm };
    }
  }
  return null;
}

// Used by water blocking as well as meshing. The deck remains traversable
// where its mapped centreline crosses the mapped water polygon.
export function bridgeHeightAt(x, z, bridges, margin = 0) {
  let result = null;
  for (const bridge of bridges ?? []) {
    for (const path of bridge.paths ?? []) {
      const { distances, length } = measurePath(path);
      for (let i = 1; i < path.length; i++) {
        const [ax, az] = path[i - 1], [bx, bz] = path[i];
        const dx = bx - ax, dz = bz - az, squared = dx * dx + dz * dz;
        if (squared === 0) continue;
        const t = ((x - ax) * dx + (z - az) * dz) / squared;
        if (t < 0 || t > 1) continue;
        const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        if (distance > (bridge.width ?? 2.2) / 2 + margin) continue;
        const y = bridgeElevation(distances[i - 1] + Math.sqrt(squared) * t, length, bridge);
        result = result === null ? y : Math.max(result, y);
      }
    }
  }
  return result;
}

function cylinderBetween(a, b, radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const delta = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 5);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
  geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
  return geometry;
}

export function makeBridgeGeometries(bridge) {
  const decks = [], rails = [];
  for (const path of bridge.paths ?? []) {
    if (path.length < 2) continue;
    const { distances, length } = measurePath(path);
    if (length < 0.01) continue;
    const ramp = Math.min(bridge.rampLength ?? 4, length * 0.3);
    const stations = [...new Set([0, ramp, length - ramp, length, ...distances])].sort((a, b) => a - b);
    const crossSections = stations.map(distance => {
      const point = samplePath(path, distances, distance);
      const y = bridgeElevation(distance, length, bridge), width = (bridge.width ?? 2.2) / 2;
      return { left: [point.x + point.nx * width, y, point.z + point.nz * width], right: [point.x - point.nx * width, y, point.z - point.nz * width] };
    });
    const positions = [];
    for (let i = 1; i < crossSections.length; i++) {
      const a = crossSections[i - 1], b = crossSections[i];
      pushQuad(positions, a.left, b.left, b.right, a.right);
      const lower = v => [v[0], v[1] - 0.16, v[2]];
      pushQuad(positions, a.left, lower(a.left), lower(b.left), b.left);
      pushQuad(positions, b.right, lower(b.right), lower(a.right), a.right);
    }
    decks.push(geometryFromTriangles(positions));
    // Slender rails remain inside the surveyed deck corridor. Their endpoints
    // follow its ramps instead of creating an artificial vertical step.
    for (const side of ['left', 'right']) {
      for (let i = 1; i < crossSections.length; i++) {
        const a = crossSections[i - 1][side], b = crossSections[i][side];
        rails.push(cylinderBetween([a[0], a[1] + 0.85, a[2]], [b[0], b[1] + 0.85, b[2]], 0.035));
      }
      for (let station = 0; station <= length; station += 3) {
        const p = samplePath(path, distances, station), y = bridgeElevation(station, length, bridge);
        const sign = side === 'left' ? 1 : -1, half = (bridge.width ?? 2.2) / 2;
        const x = p.x + sign * p.nx * half, z = p.z + sign * p.nz * half;
        rails.push(cylinderBetween([x, y, z], [x, y + 0.85, z], 0.04));
      }
    }
  }
  return { decks, rails };
}
