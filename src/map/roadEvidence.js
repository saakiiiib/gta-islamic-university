const DEFAULT_WIDTHS = Object.freeze({ service: 6, unclassified: 6, footway: 2.2, path: 2.2,
  pedestrian: 2.2, cycleway: 2.2, tertiary: 8, trunk: 7 });
const positiveMetres = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function validSourceUrl(value) {
  if (typeof value !== 'string') return false;
  try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) && !!parsed.hostname; }
  catch { return false; }
}
function validateOverride(override) {
  if (override === null) return;
  if (typeof override !== 'object' || Array.isArray(override)) throw new TypeError('Road width override must be a source-backed evidence object');
  if (!positiveMetres(override.value)) throw new RangeError('Road width override value must be finite positive metres');
  if (!['observed', 'reported'].includes(override.status) || !['medium', 'high'].includes(override.confidence)) {
    throw new Error('Road width override requires observed/reported status and medium/high confidence');
  }
  if (!validSourceUrl(override.sourceUrl) || !validDate(override.observedAt)) {
    throw new Error('Road width override requires a valid source URL and observedAt calendar date');
  }
  if (override.measured !== undefined && typeof override.measured !== 'boolean') throw new TypeError('Road width measured flag must be boolean when supplied');
}

/**
 * Width precedence: caller-parsed OSM width > validated source-backed override >
 * existing class default. This module never parses units or rewrites source tags.
 * Defaults and mapped values are not presented as independently surveyed widths.
 */
export function resolveRoadWidth({ id, kind, sourceWidth, tags = {}, override = null } = {}) {
  if (!/^[1-9]\d*$/.test(String(id)) || (typeof id === 'number' && !Number.isSafeInteger(id))) {
    throw new TypeError('Road evidence requires a positive numeric OSM way ID');
  }
  validateOverride(override);
  const osmId = String(id), sourceUrl = `https://www.openstreetmap.org/way/${osmId}`;
  const surface = typeof tags?.surface === 'string' && tags.surface.trim() ? tags.surface : null;
  const surfaceEvidence = surface === null ? {
    value: null, status: 'unknown', confidence: 'unknown', source: null, sourceUrl: null, observedAt: null,
    osmType: 'way', osmId, measured: false, surveyStatus: 'pending',
    note: 'No usable OSM surface tag. Surface/material remains unknown; a road class does not establish asphalt.',
  } : {
    value: surface, status: 'mapped', confidence: 'medium', source: 'osm', sourceUrl, observedAt: null,
    osmType: 'way', osmId, measured: false, surveyStatus: 'not-independently-verified',
    note: 'Raw OSM surface tag, not an independent current-condition or material survey.',
  };
  if (positiveMetres(sourceWidth)) {
    return { width: sourceWidth, widthEvidence: {
      value: sourceWidth, status: 'mapped', confidence: 'medium', source: 'osm', sourceUrl, observedAt: null,
      osmType: 'way', osmId, basis: 'width', measured: false, surveyStatus: 'not-independently-verified',
      note: 'Caller-parsed OSM width in metres takes precedence; not an independent field measurement.',
    }, surfaceEvidence };
  }
  if (override) {
    return { width: override.value, widthEvidence: {
      ...structuredClone(override), source: 'sourced-override', basis: 'width-override', osmType: 'way', osmId,
      measured: override.measured ?? false, surveyStatus: 'caller-supplied-source',
      note: override.note ?? 'Source-backed caller width; any measured claim must be explicit in the supplied evidence.',
    }, surfaceEvidence };
  }
  const width = Object.hasOwn(DEFAULT_WIDTHS, kind) ? DEFAULT_WIDTHS[kind] : 6;
  return { width, widthEvidence: {
    value: width, status: 'inferred', confidence: 'low', source: 'heuristic', sourceUrl: null, observedAt: null,
    osmType: 'way', osmId, basis: `estimate:${typeof kind === 'string' && kind ? kind : 'unclassified'}`,
    measured: false, surveyStatus: 'pending',
    note: 'Existing road-class width estimate. Field width/surface/edge surveys remain pending; no measured width is invented.',
  }, surfaceEvidence };
}
