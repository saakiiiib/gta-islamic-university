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
