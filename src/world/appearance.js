export const hashId = id => [...String(id)].reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7);

// Tags take priority; source names fill gaps in this particular OSM extract.
export function classifyBuilding(building) {
  const t = building.tags ?? {};
  const name = `${t['name:en'] || t.name || building.name || ''}`.toLowerCase();
  if (t.amenity === 'place_of_worship' || t.religion || /mosque|church|temple|মসজিদ/.test(name) || /mosque|church|temple/.test(t.building ?? '')) return 'worship';
  if (t.building === 'construction' || t.construction || /under construction|new building|new administrative/.test(name)) return 'construction';
  if (/dormitory|apartments|residential|house|detached|semidetached_house/.test(t.building ?? '') || /hostel|guest_house/.test(t.tourism ?? '')) return 'residential';
  if (/university|school|college/.test(t.building ?? '') || /university|school|college|library/.test(t.amenity ?? '')) return 'academic';
  if (t.amenity || /civic|hospital|service|shed|garage|grarage/.test(t.building ?? '')) return 'civic';
  if (/hall|residence|dorm|hostel|guest house|quarter|bungalow/.test(name)) return 'residential';
  if (/faculty|academic|science|arts|library|institute|education|bba|business|administrati/.test(name)) return 'academic';
  if (/cafeteria|canteen|medical|hospital|bank|post office|auditorium|gymnasium|substation|store|garage/.test(name)) return 'civic';
  return 'unclassified';
}

export const BUILDING_PALETTES = Object.freeze({
  academic: { walls: [0xddc79e, 0xc9b18c, 0xe3d1ae], roof: 0x5c7377, accent: 0xa2674a, map: '#c2ac82' },
  residential: { walls: [0xc78d70, 0xd5a182, 0xbc806d], roof: 0x616f70, accent: 0x85513e, map: '#bf876d' },
  civic: { walls: [0xa9c8bf, 0xc1d4c4, 0x96bab6], roof: 0x4e7378, accent: 0x3e7772, map: '#94b6aa' },
  worship: { walls: [0xe6e4c7, 0xd0dec3], roof: 0x428d79, accent: 0x5e9c86, map: '#86b69d' },
  construction: { walls: [0x9c8a78, 0xaa8e77], roof: 0x807b70, accent: 0x8b674d, map: '#918475' },
  unclassified: { walls: [0xd1c8ac, 0xbccdb6, 0xd4b6a2, 0xb6c9cc], roof: 0x687b78, accent: 0x85947c, map: '#b4bda4' },
});

export function buildingPalette(building) {
  const kind = classifyBuilding(building), family = BUILDING_PALETTES[kind];
  return { kind, ...family, wall: family.walls[hashId(building.id) % family.walls.length] };
}

export const LAND_COLORS = Object.freeze({ ground: 0x7e9e62, grass: 0x7da76b, garden: 0x609b56, park: 0x70a77b,
  forest: 0x477c56, orchard: 0x799954, pitch: 0x9cbb78, water: 0x2b93a1 });
