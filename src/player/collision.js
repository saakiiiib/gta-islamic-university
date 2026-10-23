import { Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

/** Immutable triangle acceleration structure shared by all character updates. */
export class CollisionWorld {
  constructor(group) {
    this.octree = new Octree();
    if (group) {
      group.updateWorldMatrix(true, true);
      this.octree.fromGraphNode(group);
    }
  }

  resolve(capsule, velocity) {
    let grounded = false;
    for (let iteration = 0; iteration < 5; iteration++) {
      const hit = this.octree.capsuleIntersect(capsule);
      if (!hit || hit.depth < 1e-8) break;
      if (hit.normal.y > 0.5 && velocity.y <= 0) grounded = true;
      capsule.translate(new Vector3().copy(hit.normal).multiplyScalar(hit.depth + 1e-6));
      const into = velocity.dot(hit.normal);
      if (into < 0) velocity.addScaledVector(hit.normal, -into);
    }
    return grounded;
  }
}

function onSegment(point, a, b) {
  const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
  return Math.abs(cross) < 1e-7 && point[0] >= Math.min(a[0], b[0]) - 1e-7 && point[0] <= Math.max(a[0], b[0]) + 1e-7 && point[1] >= Math.min(a[1], b[1]) - 1e-7 && point[1] <= Math.max(a[1], b[1]) + 1e-7;
}

function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(point, a, b)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function pointInMultiPolygon(point, polygons = []) {
  return polygons.some(polygon => polygon.length && inRing(point, polygon[0]) && !polygon.slice(1).some(hole => inRing(point, hole)));
}

export function isWaterBlocked(x, z, mapData, radius = 0.32) {
  const water = mapData?.water ?? [];
  if (!water.length) return false;
  const bridges = mapData.bridges ?? [];
  for (let i = -1; i < 8; i++) {
    const p = i < 0 ? [x, z] : [x + Math.cos(i * Math.PI / 4) * radius, z + Math.sin(i * Math.PI / 4) * radius];
    if (water.some(feature => pointInMultiPolygon(p, feature.polygons)) && !bridges.some(feature => pointInMultiPolygon(p, feature.polygons))) return true;
  }
  return false;
}
