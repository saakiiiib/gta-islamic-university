// A cadastral polygon is not evidence of an intact physical wall. No segment
// geometry has a dated, georeferenced survey, so this list intentionally is empty.
export const CAMPUS_BOUNDARY_EVIDENCE = Object.freeze({
  checkedAt: '2026-11-07', geometryStatus: 'survey-pending',
  verifiedSegments: Object.freeze([]),
  reports: Object.freeze([
    Object.freeze({ sourceUrl: 'https://en.bonikbarta.com/bangladesh/Jt4KuaecEDOYfFrm',
      publishedAt: '2025-09-24', locationDescription: 'Western side and near Shah Azizur Rahman Hall',
      condition: 'Missing, broken or low fencing reported; wall collapse near hall reported',
      material: null, geometry: null, confidence: 'medium', status: 'reported-not-georeferenced' }),
    Object.freeze({ sourceUrl: 'https://www.bssnews.net/news/410780', publishedAt: '2026-08-01',
      locationDescription: 'Campus, precise extent unspecified',
      condition: 'Support requested to construct boundary wall; no completed segments established',
      material: null, geometry: null, confidence: 'medium', status: 'reported-not-georeferenced' }),
  ]),
});
