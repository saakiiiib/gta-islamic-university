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
  academic: { walls: [0xddc79e, 0xc9b18c, 0xe4d3b4], roof: 0x566e72, accent: 0xa86749, map: '#c2ac82' },
  residential: { walls: [0xc88568, 0xd49b7c, 0xbd7a66], roof: 0x5d6d6e, accent: 0x8a4e3a, map: '#bf876d' },
  civic: { walls: [0xa9c8bf, 0xc1d4c4, 0x96bab6], roof: 0x4e7378, accent: 0x3e7772, map: '#94b6aa' },
  worship: { walls: [0xeae8ce, 0xd2dfc7], roof: 0x3d8c77, accent: 0x589a83, map: '#86b69d' },
  construction: { walls: [0x9c8a78, 0xaa8e77], roof: 0x807b70, accent: 0x8b674d, map: '#918475' },
  unclassified: { walls: [0xd1c8ac, 0xbccdb6, 0xd4b6a2, 0xb6c9cc], roof: 0x687b78, accent: 0x85947c, map: '#b4bda4' },
});

export function buildingPalette(building) {
  const kind = classifyBuilding(building), family = BUILDING_PALETTES[kind];
  return { kind, ...family, wall: family.walls[hashId(building.id) % family.walls.length] };
}

export const LAND_COLORS = Object.freeze({ ground: 0x7ba05f, grass: 0x76a35f, garden: 0x59964e, park: 0x6ca374,
  forest: 0x447953, orchard: 0x779751, pitch: 0x98b873, water: 0x258f9e });
