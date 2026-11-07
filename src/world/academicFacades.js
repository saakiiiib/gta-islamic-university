import { Color, Float32BufferAttribute } from 'three';
import { pointToSegmentDistance } from '../map/geometry.js';
import { geometryFromTriangles } from './geometry.js';
import { wallEdges } from './facades.js';

const REFERENCES = Object.freeze({
  'relation/18079381': { date: '2021-04-15', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Faculty_of_Arts_building,_Islamic_University,_Bangladesh.jpg' },
  'relation/18079379': { date: '2021-04-17', sourceUrl: 'https://commons.wikimedia.org/wiki/File:The_faculty_of_science,_Islamic_University.jpg' },
});
const TRIANGLE_CAP = 20000, ARCH_SEGMENTS = 8, ENTRY_HALF_WIDTH = 1, ENTRY_TOP = 2.65;
const OFFSET = Object.freeze({ window: .038, frame: .065, band: .055, entry: .075 });

function matchingEntries(edge, entries) {
  if (edge.ringIndex) return [];
  return entries.flatMap(entry => {
    const source = entry?.edge;
    if (!source || source.ringIndex || !Number.isFinite(entry.distance) || !Array.isArray(source.a) ||
      !Number.isFinite(source.ux) || !Number.isFinite(source.uz)) return [];
    const point = [source.a[0] + source.ux * entry.distance, source.a[1] + source.uz * entry.distance];
    if (pointToSegmentDistance(point, edge.a, edge.b) > .01) return [];
    const distance = (point[0] - edge.a[0]) * edge.ux + (point[1] - edge.a[1]) * edge.uz;
    if (distance < 0 || distance > edge.length) return [];
    return [{ distance, source: entry.source ?? 'caller-supplied', nodeId: entry.nodeId ?? null }];
  });
}

/**
 * Two caller-owned batched geometries for the entire supported building.
 * Historical-photo-inspired arches follow wall rings; no mass/collision changes.
 */
export function academicFacadeGeometry(building, palette = {}, entries = []) {
  const key = `${building?.osmType}/${building?.id}`, reference = REFERENCES[key];
  if (!reference) return null;
  const height = building.height;
  if (!Number.isFinite(height) || height < 4 || height > 200) throw new RangeError('Academic facade height must be finite and within 4..200 metres');
  if (!Array.isArray(building.polygons) || !building.polygons.length || building.polygons.some(polygon =>
    !Array.isArray(polygon) || !polygon.length || polygon.some(ring => !Array.isArray(ring) || ring.length < 4 ||
      ring.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) ||
      ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]))) {
    throw new TypeError('Academic facades require finite closed footprint rings');
  }
  const windows = [], details = [], windowNormals = [], detailNormals = [], detailColors = [], bays = [], walls = [], entryClearances = [];
  let triangleCount = 0, budgetClipped = false;
  const pale = new Color(0xdcd8c6), bandColor = new Color(palette.accent ?? 0xc3c2ac);
  const triangle = (target, edge, a, b, c, color) => {
    // All input points are (distance along wall, height), never courtyard spans.
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) return;
    if (triangleCount >= TRIANGLE_CAP) { budgetClipped = true; return; }
    const offset = target === windows ? OFFSET.window : color.offset;
    const pa = edge.at(...a, offset), pb = edge.at(...b, offset), pc = edge.at(...c, offset);
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
    const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    if ((uy * vz - uz * vy) * edge.nx + (ux * vy - uy * vx) * edge.nz < 0) target.push(...pa, ...pc, ...pb);
    else target.push(...pa, ...pb, ...pc);
    // Preserve the exact wall normal rather than amplifying Float32 position
    // rounding in narrow bands on oblique, campus-coordinate wall planes.
    const normals = target === windows ? windowNormals : detailNormals;
    for (let i = 0; i < 3; i++) normals.push(edge.nx, 0, edge.nz);
    if (target === details) for (let i = 0; i < 3; i++) detailColors.push(color.tint.r, color.tint.g, color.tint.b);
    triangleCount++;
  };
  const rawQuad = (edge, left, right, bottom, top, tint, offset) => {
    if (right - left < 1e-6 || top - bottom < 1e-6) return;
    const color = { tint, offset };
    triangle(details, edge, [left, bottom], [right, bottom], [right, top], color);
    triangle(details, edge, [left, bottom], [right, top], [left, top], color);
  };
  const quad = (edge, doors, left, right, bottom, top, tint = pale, offset = OFFSET.frame) => {
    left = Math.max(0, left); right = Math.min(edge.length, right);
    bottom = Math.max(0, bottom); top = Math.min(height, top);
    if (bottom >= ENTRY_TOP || !doors.length) return rawQuad(edge, left, right, bottom, top, tint, offset);
    if (top > ENTRY_TOP) rawQuad(edge, left, right, ENTRY_TOP, top, tint, offset);
    let spans = [[left, right]];
    for (const door of doors) spans = spans.flatMap(([a, b]) => {
      const lo = door.distance - ENTRY_HALF_WIDTH, hi = door.distance + ENTRY_HALF_WIDTH;
      if (hi <= a || lo >= b) return [[a, b]];
      return [[a, Math.min(lo, b)], [Math.max(hi, a), b]].filter(([x, y]) => y > x);
    });
    for (const [a, b] of spans) rawQuad(edge, a, b, bottom, Math.min(top, ENTRY_TOP), tint, offset);
  };
  const divisions = Math.max(1, Math.ceil(height / 3.2));
  for (const [polygonIndex, polygon] of building.polygons.entries()) for (const [edgeIndex, edge] of wallEdges(polygon).entries()) {
    const doors = matchingEntries(edge, entries);
    walls.push({ polygonIndex, edgeIndex, ringIndex: edge.ringIndex, length: edge.length });
    for (const door of doors) entryClearances.push({ polygonIndex, edgeIndex, ringIndex: 0,
      center: edge.at(door.distance, 0, 0), halfWidth: ENTRY_HALF_WIDTH, top: ENTRY_TOP, source: door.source, nodeId: door.nodeId });
    if (edge.length < 2) continue;
    const count = Math.min(80, Math.max(1, Math.floor(edge.length / 3.6))), spacing = edge.length / count;
    for (let bay = 0; bay < count; bay++) {
      const center = (bay + .5) * spacing, radius = Math.min(1.25, spacing * .34), thickness = .11;
      const top = height - .4, spring = top - radius;
      const intersectsEntry = doors.some(door => Math.abs(center - door.distance) < radius + ENTRY_HALF_WIDTH);
      const bottom = intersectsEntry ? ENTRY_TOP + .06 : .65;
      if (bottom < spring) {
        const outline = [[center - radius, bottom], [center + radius, bottom], [center + radius, spring]];
        for (let segment = 1; segment <= ARCH_SEGMENTS; segment++) {
          const angle = segment / ARCH_SEGMENTS * Math.PI;
          outline.push([center + Math.cos(angle) * radius, spring + Math.sin(angle) * radius]);
        }
        for (let i = 0; i < outline.length; i++) triangle(windows, edge, [center, bottom], outline[i], outline[(i + 1) % outline.length]);
      }
      // Slender pale piers and a curved rim create a tall arcade rhythm. Only
      // the existing source wall plane carries these details, including holes.
      quad(edge, doors, center - radius - thickness, center - radius, .3, spring);
      quad(edge, doors, center + radius, center + radius + thickness, .3, spring);
      for (let segment = 0; segment < ARCH_SEGMENTS; segment++) {
        const a = segment / ARCH_SEGMENTS * Math.PI, b = (segment + 1) / ARCH_SEGMENTS * Math.PI;
        const point = (angle, r) => [center + Math.cos(angle) * r, spring + Math.sin(angle) * r];
        const color = { tint: pale, offset: OFFSET.frame };
        triangle(details, edge, point(a, radius), point(b, radius), point(b, radius + thickness), color);
        triangle(details, edge, point(a, radius), point(b, radius + thickness), point(a, radius + thickness), color);
      }
      bays.push({ polygonIndex, edgeIndex, ringIndex: edge.ringIndex, centerDistance: center,
        radius, bottom, springHeight: spring, top, entryClear: intersectsEntry });
    }
    for (let division = 1; division < divisions; division++) {
      const y = height * division / divisions;
      quad(edge, doors, 0, edge.length, y - .055, y + .055, bandColor, OFFSET.band);
    }
    quad(edge, doors, 0, edge.length, height - .2, height - .09, pale, OFFSET.frame);
    for (const door of doors) {
      // An open entrance surround preserves a clear aperture. No dark panel or
      // sill crosses a surveyed/illustrative entry in these decorative meshes.
      quad(edge, doors, door.distance - 1.12, door.distance - ENTRY_HALF_WIDTH, .1, 2.82, pale, OFFSET.entry);
      quad(edge, doors, door.distance + ENTRY_HALF_WIDTH, door.distance + 1.12, .1, 2.82, pale, OFFSET.entry);
      quad(edge, [], door.distance - 1.12, door.distance + 1.12, ENTRY_TOP, 2.82, pale, OFFSET.entry);
    }
  }
  const windowGeometry = geometryFromTriangles(windows), detailGeometry = geometryFromTriangles(details);
  windowGeometry.setAttribute('normal', new Float32BufferAttribute(windowNormals, 3));
  detailGeometry.setAttribute('normal', new Float32BufferAttribute(detailNormals, 3));
  detailGeometry.setAttribute('color', new Float32BufferAttribute(detailColors, 3));
  for (const geometry of [windowGeometry, detailGeometry]) {
    geometry.computeBoundingBox(); if (geometry.getAttribute('position').count) geometry.computeBoundingSphere();
  }
  return { windows: windowGeometry, details: detailGeometry,
    diagnostics: { osmType: building.osmType, osmId: String(building.id), heightMeters: height,
      appearanceStatus: 'source-inspired-illustrative', rhythmStatus: 'provisional-historical-photo-interpretation',
      measuredDimensions: false, observedAt: reference.date, sourceUrls: [reference.sourceUrl],
      walls, bays, entryClearances, archCount: bays.length, courtyardWallCount: walls.filter(w => w.ringIndex > 0).length,
      triangleCount, triangleCap: TRIANGLE_CAP, budgetClipped, maxWallOffsetMeters: OFFSET.entry, collisionObjects: 0,
      limitations: ['Exact bay spacing and vertical divisions are illustrative, not measured floor counts',
        'Historical science-complex photograph does not establish every current wing elevation',
        'No footprint, height, courtyard roof/floor or collision geometry is replaced'] } };
}
