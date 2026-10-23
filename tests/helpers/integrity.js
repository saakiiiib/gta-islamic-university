import { createHash } from 'node:crypto';

export const checksum = value => createHash('sha256').update(value).digest('hex');

// Ignore batch order and cyclic vertex order, but retain triangle winding.
export function collisionFingerprint(group) {
  group.updateMatrixWorld(true);
  const triangles = [];
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = geometry.getAttribute('position'), e = mesh.matrixWorld.elements;
    const vertex = i => {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]
        .map(n => (Math.abs(n) < 0.000005 ? 0 : n).toFixed(5)).join(',');
    };
    for (let i = 0; i < p.count; i += 3) {
      const v = [vertex(i), vertex(i + 1), vertex(i + 2)];
      triangles.push([v.join('|'), [v[1], v[2], v[0]].join('|'), [v[2], v[0], v[1]].join('|')].sort()[0]);
    }
    if (geometry !== mesh.geometry) geometry.dispose();
  });
  return { triangles: triangles.length, sha256: checksum(triangles.sort().join('\n')) };
}

export function modelFingerprint(map) {
  const features = {};
  for (const type of ['buildings', 'roads', 'greens', 'water', 'bridges', 'trees', 'treeRows']) {
    features[type] = map[type].map(feature => {
      const { id, polygons, paths, height, heightSource, width, elevation, rampLength, x, z } = feature;
      return { id, polygons, paths, height, heightSource, width, elevation, rampLength, x, z };
    }).sort((a, b) => a.id.localeCompare(b.id));
  }
  return checksum(JSON.stringify({ origin: map.origin, bounds: map.bounds, spawn: map.spawn, features }));
}
