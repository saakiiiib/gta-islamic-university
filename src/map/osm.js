import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { MAP_CONFIG } from '../config.js';
import {project, ringBounds, ringArea, pointInRing, clipPolygons, intersectsBounds, clipLineString, bufferPaths} from './geometry.js';

export {project, pointInPolygon, pointInMultiPolygon, pointToSegmentDistance} from './geometry.js';

const ARRAY_TAGS = new Set(['node', 'way', 'relation', 'nd', 'member', 'tag']);
const tagsOf = item => Object.fromEntries((item.tag || []).map(t => [String(t.k), String(t.v)]));
const named = tags => tags['name:en'] || tags.name || '';
const building = tags => !!tags.building && tags.building !== 'no';
const greenKind = tags => ['garden', 'park', 'pitch'].includes(tags.leisure) ? tags.leisure
  : ['forest', 'orchard', 'grass', 'meadow'].includes(tags.landuse) ? tags.landuse
    : ['wood', 'grassland'].includes(tags.natural) ? tags.natural : null;
const waterKind = tags => tags.natural === 'water' || tags.water ? tags.water || 'water' : null;

/** Parse untrusted OSM as data, preserving every ID and tag value as strings. */
export function parseOsm(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('The supplied map.osm is empty or missing.');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid map.osm XML: ${valid.err.msg}`);
  const document = new XMLParser({ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false,
    parseTagValue: false, processEntities: false, isArray: name => ARRAY_TAGS.has(name)}).parse(xml);
  const raw = document.osm;
  if (!raw || !raw.node?.length || !raw.way?.length) throw new Error('Invalid map.osm: expected OpenStreetMap nodes and ways.');
  const nodes = new Map(), ways = new Map(), relations = new Map();
  for (const node of raw.node) {
    const lat = Number(node.lat), lon = Number(node.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new Error(`Invalid map.osm coordinate on node ${node.id}.`);
    }
    nodes.set(String(node.id), {id: String(node.id), lat, lon, tags: tagsOf(node)});
  }
  for (const way of raw.way) ways.set(String(way.id), {id: String(way.id), refs: (way.nd || []).map(n => String(n.ref)), tags: tagsOf(way)});
  for (const relation of raw.relation || []) relations.set(String(relation.id), {id: String(relation.id), tags: tagsOf(relation),
    members: (relation.member || []).map(m => ({type: String(m.type), ref: String(m.ref), role: String(m.role || '')}))});
  return {nodes, ways, relations};
}

export function parseMetres(value) {
  if (value == null) return null;
  const match = String(value).trim().match(/^([\d.]+)\s*(m|metres?|meters?|ft|feet|')?/i);
  if (!match) return null;
  const number = Number(match[1]) * (/^(ft|feet|')$/i.test(match[2] || '') ? 0.3048 : 1);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function estimateHeight(tags) {
  const explicit = parseMetres(tags.height);
  if (explicit) return {height: explicit, heightSource: 'height'};
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) return {height: levels * 3.2, heightSource: 'building:levels'};
  const description = `${tags.building || ''} ${named(tags)}`.toLowerCase();
  if (/dorm|apartment|hostel|ডরমিটরি/.test(description) || tags.tourism === 'hostel' || /hall/.test(description)) {
    return {height: 12.8, heightSource: 'estimate:dormitory'};
  }
  if (/house|residen/.test(description)) return {height: 6.4, heightSource: 'estimate:house'};
  if (/shed|garage|grarage/.test(description)) return {height: 3.2, heightSource: 'estimate:shed'};
  if (/university|school|academic|faculty|science|arts|education|admin|library/.test(description)) {
    return {height: 9.6, heightSource: 'estimate:academic'};
  }
  return {height: 9.6, heightSource: 'estimate:unclassified'};
}

function assembleRings(members, ways, positions, warnings, label) {
  const chains = [];
  for (const member of members) {
    const way = ways.get(member.ref);
    if (!way || way.refs.some(id => !positions.has(id))) {
      warnings.push(`${label}: missing way or node for member ${member.ref}; omitted.`);
      continue;
    }
    if (way.refs.length >= 2) chains.push([...way.refs]);
  }
  const rings = [];
  while (chains.length) {
    let chain = chains.shift(), changed = true;
    while (chain[0] !== chain.at(-1) && changed) {
      changed = false;
      for (let i = 0; i < chains.length; i++) {
        const next = chains[i];
        if (chain.at(-1) === next[0]) chain.push(...next.slice(1));
        else if (chain.at(-1) === next.at(-1)) chain.push(...next.toReversed().slice(1));
        else if (chain[0] === next.at(-1)) chain = [...next.slice(0, -1), ...chain];
        else if (chain[0] === next[0]) chain = [...next.toReversed().slice(0, -1), ...chain];
        else continue;
        chains.splice(i, 1); changed = true; break;
      }
    }
    if (chain.length >= 4 && chain[0] === chain.at(-1)) {
      const ring = chain.map(id => [...positions.get(id)]);
      if (ringArea(ring) > 0.01) rings.push(ring);
    } else warnings.push(`${label}: incomplete ring omitted.`);
  }
  return rings;
}

function wayRing(way, positions, warnings) {
  if (way.refs.length < 4 || way.refs[0] !== way.refs.at(-1)) return null;
  if (way.refs.some(ref => !positions.has(ref))) {warnings.push(`Way ${way.id} has missing node references; omitted.`); return null;}
  const ring = way.refs.map(ref => [...positions.get(ref)]);
  return ringArea(ring) > 0.01 ? ring : null;
}

export function buildMapData(parsed, config = MAP_CONFIG) {
  const {nodes, ways, relations} = parsed;
  if (!(nodes instanceof Map) || !(ways instanceof Map)) throw new Error('Invalid parsed OSM map.');
  const diagnostics = {counts: {}, warnings: [], repairs: []};
  const origin = {...config.origin};
  const positions = new Map([...nodes].map(([id, n]) => [id, project(n.lat, n.lon, origin)]));
  const campusWay = ways.get(String(config.campusWayId));
  const campusRing = campusWay && wayRing(campusWay, positions, diagnostics.warnings);
  if (!campusRing) throw new Error(`map.osm is missing the complete Islamic University campus boundary (${config.campusWayId}).`);
  const rawBounds = ringBounds(campusRing), margin = config.contextMetres ?? 100;
  const bounds = {minX: rawBounds.minX - margin, maxX: rawBounds.maxX + margin,
    minZ: rawBounds.minZ - margin, maxZ: rawBounds.maxZ + margin};
  const data = {origin, bounds, campus: {id: campusWay.id, name: named(campusWay.tags), polygons: [[campusRing]]},
    buildings: [], roads: [], greens: [], water: [], bridges: [], trees: [], treeRows: [], spawn: null, diagnostics};
  const represented = new Set(), orphanHoles = [];
  for (const relation of relations.values()) {
    if (relation.tags.type !== 'multipolygon') continue; // Incomplete administrative boundaries are not campus surfaces.
    const isBuilding = building(relation.tags), green = greenKind(relation.tags), water = waterKind(relation.tags);
    if (!isBuilding && !green && !water) continue;
    const outerMembers = relation.members.filter(m => m.type === 'way' && m.role !== 'inner');
    const innerMembers = relation.members.filter(m => m.type === 'way' && m.role === 'inner');
    const outers = assembleRings(outerMembers, ways, positions, diagnostics.warnings, `Relation ${relation.id}`);
    const inners = assembleRings(innerMembers, ways, positions, diagnostics.warnings, `Relation ${relation.id}`);
    if (!outers.length) {
      if (isBuilding && inners.length) orphanHoles.push({relation, rings: inners, sourceWayIds: innerMembers.map(m => m.ref)});
      continue;
    }
    const polygons = outers.map(outer => [outer]);
    for (const inner of inners) {
      const owner = polygons.find(poly => inner.slice(0, -1).every(point => pointInRing(point, poly[0])));
      if (owner) owner.push(inner);
      else diagnostics.warnings.push(`Relation ${relation.id}: inner ring outside its outer; omitted.`);
    }
    const outerTags = outerMembers.map(m => ways.get(m.ref)?.tags || {}).reduce((a, b) => ({...a, ...b}), {});
    const tags = {...outerTags, ...relation.tags};
    const feature = {id: relation.id, name: named(tags), tags, polygons, sourceWayIds: outerMembers.map(m => m.ref)};
    if (isBuilding && intersectsBounds(polygons, bounds)) data.buildings.push({...feature, ...estimateHeight(tags)});
    else if (!isBuilding) {
      const clipped = clipPolygons(polygons, bounds);
      if (clipped.length) (water ? data.water : data.greens).push({...feature, polygons: clipped, kind: water || green});
    }
    for (const m of [...outerMembers, ...innerMembers]) represented.add(m.ref);
  }
  // The supplied extract contains a building relation with only two inner rings. Restore only
  // holes whose entire ring is contained by one and only one existing mapped footprint.
  for (const orphan of orphanHoles) {
    for (let i = 0; i < orphan.rings.length; i++) {
      const ring = orphan.rings[i], candidates = [];
      for (const feature of data.buildings) for (const polygon of feature.polygons) {
        if (ring.slice(0, -1).every(p => pointInRing(p, polygon[0]))) candidates.push({feature, polygon});
      }
      if (candidates.length === 1) {
        candidates[0].polygon.push(ring);
        const repair = {type: 'orphan-courtyard', fromRelation: orphan.relation.id,
          toBuilding: candidates[0].feature.id, wayId: orphan.sourceWayIds[i]};
        diagnostics.repairs.push(repair);
        diagnostics.warnings.push(`Reattached courtyard way ${repair.wayId} from outer-less relation ${repair.fromRelation} to uniquely enclosing building ${repair.toBuilding}.`);
        represented.add(repair.wayId);
      } else diagnostics.warnings.push(`Relation ${orphan.relation.id}: orphan courtyard could not be uniquely associated; omitted.`);
    }
  }
  for (const way of ways.values()) {
    const tags = way.tags;
    if (building(tags) && !represented.has(way.id)) {
      const ring = wayRing(way, positions, diagnostics.warnings);
      if (ring && intersectsBounds([[ring]], bounds)) data.buildings.push({id: way.id, name: named(tags), tags,
        polygons: [[ring]], sourceWayIds: [way.id], ...estimateHeight(tags)});
    }
    const green = greenKind(tags), water = waterKind(tags);
    if ((green || water) && !represented.has(way.id)) {
      const ring = wayRing(way, positions, diagnostics.warnings), clipped = ring ? clipPolygons([[ring]], bounds) : [];
      if (clipped.length) (water ? data.water : data.greens).push({id: way.id, name: named(tags), tags, kind: water || green, polygons: clipped});
    }
    const lineNeeded = tags.highway || tags.waterway || tags.natural === 'tree_row' || tags.bridge === 'yes' || way.id === '1317423268';
    if (!lineNeeded) continue;
    if (way.refs.some(ref => !positions.has(ref))) {diagnostics.warnings.push(`Way ${way.id} has incomplete line geometry; omitted.`); continue;}
    const paths = clipLineString(way.refs.map(ref => positions.get(ref)), bounds);
    if (!paths.length) continue;
    if (tags.natural === 'tree_row') data.treeRows.push({id: way.id, paths});
    if (tags.waterway) {
      const width = parseMetres(tags.width) || 3;
      data.water.push({id: way.id, name: named(tags), tags, kind: tags.waterway, width,
        paths, polygons: bufferPaths(paths, width, bounds)});
    }
    const isBridge = tags.bridge === 'yes' || way.id === '1317423268';
    if (isBridge) {
      const width = parseMetres(tags.width) || 2.2;
      data.bridges.push({id: way.id, name: named(tags) || 'Lake footbridge', tags, width, paths,
        polygons: bufferPaths(paths, width, bounds), elevation: .45, rampLength: 4});
    }
    if (tags.highway) {
      const kind = tags.highway, width = parseMetres(tags.width) || ({service: 6, unclassified: 6, path: 2.2,
        footway: 2.2, pedestrian: 2.2, cycleway: 2.2, tertiary: 8, trunk: 7}[kind] || 6);
      data.roads.push({id: way.id, name: named(tags), tags, kind, width, paths,
        polygons: bufferPaths(paths, width, bounds)});
    }
  }
  for (const node of nodes.values()) {
    const p = positions.get(node.id);
    if (node.tags.natural === 'tree' && p[0] >= bounds.minX && p[0] <= bounds.maxX && p[1] >= bounds.minZ && p[1] <= bounds.maxZ) {
      data.trees.push({id: node.id, x: p[0], z: p[1]});
    }
  }
  const spawn = positions.get(String(config.spawnNodeId));
  if (!spawn) throw new Error(`map.osm is missing Main Gate spawn node ${config.spawnNodeId}.`);
  const approach = ways.get('975575586');
  const index = approach?.refs.indexOf(String(config.spawnNodeId)) ?? -1;
  const next = index >= 0 ? positions.get(approach.refs[index + 1]) : null;
  const length = next ? Math.hypot(next[0] - spawn[0], next[1] - spawn[1]) : 1;
  const forward = next ? [(next[0] - spawn[0]) / length, (next[1] - spawn[1]) / length] : [-Math.SQRT1_2, -Math.SQRT1_2];
  data.spawn = {x: spawn[0], z: spawn[1], y: 0, yaw: Math.atan2(-forward[0], -forward[1]), forward};
  diagnostics.counts = {sourceNodes: nodes.size, sourceWays: ways.size, sourceRelations: relations.size,
    buildings: data.buildings.length, roads: data.roads.length, greens: data.greens.length, water: data.water.length,
    bridges: data.bridges.length, trees: data.trees.length, treeRows: data.treeRows.length};
  return data;
}

export async function loadMap(url, onProgress = () => {}) {
  onProgress('Loading supplied OpenStreetMap extract…');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load map.osm (${response.status}). Place the supplied map in public/data/map.osm.`);
  const text = await response.text();
  onProgress('Projecting campus coordinates and joining mapped footprints…');
  const data = buildMapData(parseOsm(text));
  onProgress(`Loaded ${data.buildings.length} building footprints and ${data.roads.length} mapped roads.`);
  return data;
}
