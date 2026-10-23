import { Color, Float32BufferAttribute } from 'three';
import { pointToSegmentDistance } from '../map/geometry.js';
import { ringArea, geometryFromTriangles, pushQuad } from './geometry.js';

export function tintGeometry(geometry, color) {
  const c = new Color(color), count = geometry.getAttribute('position').count, values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { values[i * 3] = c.r; values[i * 3 + 1] = c.g; values[i * 3 + 2] = c.b; }
  geometry.setAttribute('color', new Float32BufferAttribute(values, 3));
  return geometry;
}

export function wallEdges(polygon) {
  const edges = [];
  polygon.forEach((ring, ringIndex) => {
    const outward = (Math.sign(ringArea(ring)) || 1) * (ringIndex ? -1 : 1);
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (length < .3) continue;
      const ux = dx / length, uz = dz / length, nx = uz * outward, nz = -ux * outward;
      edges.push({ a, b, length, ux, uz, nx, nz, ringIndex,
        at: (d, y, offset = .032) => [a[0] + ux * d + nx * offset, y, a[1] + uz * d + nz * offset] });
    }
  });
  return edges;
}

function facingQuad(positions, a, b, c, d, nx, nz) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  if ((uy * vz - uz * vy) * nx + (ux * vy - uy * vx) * nz >= 0) pushQuad(positions, a, b, c, d);
  else pushQuad(positions, d, c, b, a);
}

/** Surveyed entrances win; an inferred entry stays on a road-facing OUTER wall. */
export function chooseEntries(building, roads = [], entrances = []) {
  const edges = building.polygons.flatMap(wallEdges), mapped = [];
  for (const entrance of entrances.filter(e => e.buildingId === building.id)) {
    const edge = [...edges].sort((a, b) => pointToSegmentDistance([entrance.x, entrance.z], a.a, a.b) - pointToSegmentDistance([entrance.x, entrance.z], b.a, b.b))[0];
    if (edge) mapped.push({ edge, distance: Math.max(0, Math.min(edge.length, (entrance.x - edge.a[0]) * edge.ux + (entrance.z - edge.a[1]) * edge.uz)), source: 'surveyed', nodeId: entrance.id });
  }
  if (mapped.length) return mapped;
  let best = null, distance = Infinity;
  for (const edge of edges.filter(e => !e.ringIndex && e.length > 3)) {
    const mid = edge.at(edge.length / 2, 0, 0);
    for (const road of roads) for (const path of road.paths ?? []) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1], lengthSq = dx * dx + dz * dz;
      const t = lengthSq ? Math.max(0, Math.min(1, ((mid[0] - a[0]) * dx + (mid[2] - a[1]) * dz) / lengthSq)) : 0;
      const rx = a[0] + dx * t - mid[0], rz = a[1] + dz * t - mid[2], d = Math.hypot(rx, rz);
      if (rx * edge.nx + rz * edge.nz > 0 && d < distance) { distance = d; best = edge; }
    }
  }
  return best ? [{ edge: best, distance: best.length / 2, source: 'illustrative' }] : [];
}

export function facadeGeometry(polygon, height, palette, entries = []) {
  const windowVertices = [], detailVertices = [], detailColors = [];
  const floors = Math.max(1, Math.floor(height / 3.2));
  const detail = (edge, left, right, bottom, top, color, offset = .045) => {
    left = Math.max(0, left); right = Math.min(edge.length, right);
    if (right <= left || top <= bottom) return;
    const before = detailVertices.length;
    facingQuad(detailVertices, edge.at(left, bottom, offset), edge.at(right, bottom, offset), edge.at(right, top, offset), edge.at(left, top, offset), edge.nx, edge.nz);
    const c = new Color(color);
    for (let i = before; i < detailVertices.length; i += 3) detailColors.push(c.r, c.g, c.b);
  };
  for (const edge of wallEdges(polygon)) {
    const { length } = edge;
    const doors = entries.filter(e => e.edge.ringIndex === edge.ringIndex && e.edge.a[0] === edge.a[0] && e.edge.a[1] === edge.a[1]);
    // Foundation and modest structural accents: no added collision volumes.
    detail(edge, 0, length, .055, .46, 0x75766b);
    detail(edge, 0, Math.min(.19, length / 3), .46, height, palette.accent);
    detail(edge, Math.max(.19, length - .19), length, .46, height, palette.accent);
    for (let floor = 0; floor < floors; floor++) {
      const y0 = floor * 3.2 + 1.05, y1 = Math.min(height - .55, y0 + 1.35);
      if (y1 <= y0 || length < 2.1) continue;
      const count = Math.max(1, Math.floor((length - 1) / 3.2)), spacing = length / count;
      for (let w = 0; w < count; w++) {
        const center = (w + .5) * spacing, half = Math.min(.62, spacing * .25);
        if (!floor && doors.some(d => Math.abs(d.distance - center) < half + .85)) continue;
        detail(edge, center - half - .08, center + half + .08, y0 - .07, y1 + .07, 0x394c4e, .025);
        facingQuad(windowVertices, edge.at(center - half, y0, .037), edge.at(center + half, y0, .037), edge.at(center + half, y1, .037), edge.at(center - half, y1, .037), edge.nx, edge.nz);
        detail(edge, center - half - .11, center + half + .11, y1, y1 + .11, 0xd8d3bf, .07);
      }
    }
    for (let floor = 1; floor < floors; floor++) detail(edge, 0, length, floor * 3.2 - .07, floor * 3.2 + .07, palette.accent);
    detail(edge, 0, length, height - .24, height + .07, 0xd2cbb8, .055);
    for (const door of doors) {
      const d = door.distance, half = Math.min(.7, length * .22);
      detail(edge, d - half - .1, d + half + .1, .06, 2.5, palette.accent, .075);
      detail(edge, d - half, d + half, .07, 2.32, 0x334a47, .083);
      detail(edge, d - .025, d + .025, .07, 2.32, 0xa0b0a3, .09);
      detail(edge, d - half - .16, d + half + .16, 2.36, 2.51, 0xd6d3be, .15);
    }
  }
  const details = geometryFromTriangles(detailVertices);
  details.setAttribute('color', new Float32BufferAttribute(detailColors, 3));
  return { windows: geometryFromTriangles(windowVertices), details };
}
