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
  academic: { walls: [0xcbbda0, 0xbcae8f, 0xd3c5a8], roof: 0x656e6d, accent: 0x925e48, map: '#b7a98c' },
  residential: { walls: [0xb88972, 0xc49a80, 0xae806c], roof: 0x696c67, accent: 0x755144, map: '#af8069' },
  civic: { walls: [0xb5c4bc, 0xc0c9bc, 0xa6b9b3], roof: 0x647778, accent: 0x496b68, map: '#9bafa6' },
  worship: { walls: [0xdfddc4, 0xcdd4bf], roof: 0x538879, accent: 0x648c7d, map: '#88a997' },
  construction: { walls: [0x9c8a78, 0xaa8e77], roof: 0x807b70, accent: 0x8b674d, map: '#918475' },
  unclassified: { walls: [0xc0baa9, 0xb4baa9, 0xc9c2b2], roof: 0x727970, accent: 0x848a78, map: '#b1b4a2' },
});

export function buildingPalette(building) {
  const kind = classifyBuilding(building), family = BUILDING_PALETTES[kind];
  return { kind, ...family, wall: family.walls[hashId(building.id) % family.walls.length] };
}

export const LAND_COLORS = Object.freeze({ ground: 0x84946b, grass: 0x7d986b, garden: 0x688958, park: 0x72976d,
  forest: 0x506f53, orchard: 0x6c8655, pitch: 0x9aa977, water: 0x397f87 });
