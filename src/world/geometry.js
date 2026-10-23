import * as THREE from 'three';

// OSM coordinates are [east, south]. Shape coordinates use [east, north],
// then rotate into the horizontal X/Z plane. All geometry uses this one rule.
export function shapeFromPolygon(polygon) {
  const shape = new THREE.Shape();
  for (let ringIndex = 0; ringIndex < polygon.length; ringIndex++) {
    const ring = polygon[ringIndex];
    if (ring.length < 4) continue;
    const path = ringIndex === 0 ? shape : new THREE.Path();
    path.moveTo(ring[0][0], -ring[0][1]);
    for (let i = 1; i < ring.length; i++) path.lineTo(ring[i][0], -ring[i][1]);
    path.closePath();
    if (ringIndex > 0) shape.holes.push(path);
  }
  return shape;
}

export function surfaceGeometry(polygon, elevation = 0) {
  const geometry = new THREE.ShapeGeometry(shapeFromPolygon(polygon), 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, elevation, 0);
  return geometry;
}

export function buildingGeometry(polygon, height) {
  const geometry = new THREE.ExtrudeGeometry(shapeFromPolygon(polygon), {
    depth: height, steps: 1, bevelEnabled: false, curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function geometryMaterialPart(geometry, materialIndex) {
  // ExtrudeGeometry is non-indexed. Separate roofs from walls before merging,
  // so an entire spatial chunk costs two draw calls, not one per footprint.
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const result = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = [];
    for (const group of source.groups) {
      if (group.materialIndex !== materialIndex) continue;
      const start = group.start * attribute.itemSize;
      const end = (group.start + group.count) * attribute.itemSize;
      for (let i = start; i < end; i++) values.push(attribute.array[i]);
    }
    result.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
  }
  if (source !== geometry) source.dispose();
  return result;
}

export function ringArea(ring) {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  return sum / 2;
}

export function polygonCenter(polygon) {
  const ring = polygon[0];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return [(minX + maxX) / 2, (minZ + maxZ) / 2];
}

export function geometryFromTriangles(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function pushQuad(positions, a, b, c, d) {
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
}

export function lineSegmentsGeometry(rings, elevation) {
  const positions = [];
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      positions.push(ring[i - 1][0], elevation, ring[i - 1][1], ring[i][0], elevation, ring[i][1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
