import { landmarkRecords } from './campus-landmark-records.js';

export const LANDMARK_SCHEMA_VERSION = 1;
const fields = ['heightMeters', 'storeys', 'wallColor', 'roofColor', 'roofShape', 'facadeMaterial', 'windowPattern'];
const statuses = new Set(['unknown', 'mapped', 'observed', 'reported', 'provisional', 'planned']);
const confidences = new Set(['unknown', 'low', 'medium', 'high']);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const url = value => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol); } catch { return false; } };
export function landmarkKey(osmType, osmId) {
  if (!['node', 'way', 'relation'].includes(osmType) || !/^\d+$/.test(String(osmId))) throw new Error('Landmark requires OSM type and numeric ID');
  return `${osmType}/${osmId}`;
}
export function validateCampusLandmarks(records, features = null) {
  const keys = new Set(), available = features && new Set(features.map(f => landmarkKey(f.osmType, f.id)));
  for (const r of records) {
    const key = landmarkKey(r.osmType, r.osmId);
    if (keys.has(key)) throw new Error(`Duplicate landmark ${key}`);
    keys.add(key);
    if (available && !available.has(key)) throw new Error(`Unmatched landmark ${key}`);
    if (!r.names || !Array.isArray(r.names.aliases) || r.names.aliases.some(a => typeof a !== 'string' || !a.trim()) || [r.names.en, r.names.bn].some(n => n !== null && (typeof n !== 'string' || !n.trim()))) throw new Error(`Invalid names ${key}`);
    if (!url(r.identitySource?.url) || !validDate(r.identitySource?.retrievedAt)) throw new Error(`Missing identity provenance ${key}`);
    for (const field of fields) {
      const evidence = r.fields?.[field];
      if (!evidence || !statuses.has(evidence.status) || !confidences.has(evidence.confidence)) throw new Error(`Invalid evidence ${key}:${field}`);
      if (evidence.status === 'unknown') {
        if (evidence.value !== null || evidence.confidence !== 'unknown' || !evidence.reason) throw new Error(`Unknown field must retain null ${key}:${field}`);
      } else {
        if (evidence.value === null || !url(evidence.sourceUrl) || !validDate(evidence.observedAt) || evidence.confidence === 'unknown') throw new Error(`Missing field provenance ${key}:${field}`);
        if (['heightMeters', 'storeys'].includes(field) && (!Number.isFinite(evidence.value) || evidence.value <= 0)) throw new Error(`Invalid dimension ${key}:${field}`);
        if (['wallColor', 'roofColor'].includes(field) && !/^#[0-9a-f]{6}$/i.test(evidence.value)) throw new Error(`Invalid color ${key}:${field}`);
      }
    }
    if (r.renderHeight !== undefined && typeof r.renderHeight !== 'boolean') throw new Error(`Invalid height activation ${key}`);
    if (r.renderHeight === true && (!['observed', 'reported'].includes(r.fields.heightMeters.status) || !['medium', 'high'].includes(r.fields.heightMeters.confidence))) throw new Error(`Unverified height override ${key}`);
    for (const [target, field] of Object.entries(r.renderAppearance ?? {})) {
      if (!['wall', 'roof', 'accent'].includes(target) || !['wallColor', 'roofColor'].includes(field)) throw new Error(`Invalid render field ${key}`);
      const e = r.fields[field];
      if (!['observed', 'reported'].includes(e.status) || e.confidence === 'low') throw new Error(`Unverified render override ${key}:${field}`);
    }
  }
  return true;
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
validateCampusLandmarks(landmarkRecords);
export const CAMPUS_LANDMARKS = freeze(landmarkRecords);
const byKey = new Map(CAMPUS_LANDMARKS.map(r => [landmarkKey(r.osmType, r.osmId), r]));
export function getCampusLandmark(feature) {
  return feature?.osmType && feature.id != null ? byKey.get(landmarkKey(feature.osmType, feature.id)) ?? null : null;
}
export function landmarkAppearance(feature, record = getCampusLandmark(feature)) {
  if (!record) return {};
  const result = {};
  for (const [target, field] of Object.entries(record.renderAppearance ?? {})) {
    const e = record.fields[field];
    if (['observed', 'reported'].includes(e.status) && ['medium', 'high'].includes(e.confidence) && /^#[0-9a-f]{6}$/i.test(e.value)) result[target] = Number.parseInt(e.value.slice(1), 16);
  }
  return result;
}
