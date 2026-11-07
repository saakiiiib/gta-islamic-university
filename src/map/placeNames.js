import { CAMPUS_LANDMARKS } from '../data/campus-landmarks.js';

const normalized = value => typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase() : '';
const nonempty = value => typeof value === 'string' && value.trim() ? value : null;
const recordsByKey = new Map(CAMPUS_LANDMARKS.map(record => [`${record.osmType}/${record.osmId}`, record]));
const recordsById = new Map();
for (const record of CAMPUS_LANDMARKS) {
  if (!recordsById.has(record.osmId)) recordsById.set(record.osmId, []);
  recordsById.get(record.osmId).push(record);
}
function uniqueStrings(values) {
  const seen = new Set();
  return values.filter(value => {
    const text = normalized(value);
    if (!text || seen.has(text)) return false;
    seen.add(text); return true;
  });
}
function matchingRecord(place) {
  const ids = new Set(), typed = new Set();
  if (place.buildingId != null && /^\d+$/.test(String(place.buildingId))) ids.add(String(place.buildingId));
  if (place.buildingId != null && ['way', 'relation'].includes(place.buildingOsmType ?? place.osmType)) {
    typed.add(`${place.buildingOsmType ?? place.osmType}/${place.buildingId}`);
  }
  for (const sourceId of place.sourceIds ?? []) {
    if (typeof sourceId !== 'string') continue;
    const building = /^buildings:(\d+)$/.exec(sourceId);
    if (building) ids.add(building[1]);
    const key = /^(?:buildings:)?(way|relation)[/:](\d+)$/.exec(sourceId);
    if (key) { ids.add(key[2]); typed.add(`${key[1]}/${key[2]}`); }
  }
  // Deduplication can combine multiple source IDs. Conflicting identities must
  // keep their raw label instead of arbitrarily choosing one landmark's name.
  if (ids.size !== 1 || typed.size > 1) return null;
  const id = [...ids][0];
  if (typed.size) {
    const key = [...typed][0];
    return key.endsWith(`/${id}`) ? recordsByKey.get(key) ?? null : null;
  }
  const matches = recordsById.get(id) ?? [];
  return matches.length === 1 ? matches[0] : null;
}
function fallbackNames(place) {
  const names = { en: nonempty(place.names?.en), bn: nonempty(place.names?.bn) }, raw = nonempty(place.name);
  if (!raw) return names;
  if (place.nameTag === 'name:en') names.en ??= raw;
  else if (place.nameTag === 'name:bn') names.bn ??= raw;
  else {
    const bangla = /[\u0980-\u09ff]/u.test(raw), latin = /\p{Script=Latin}/u.test(raw);
    if (bangla && !latin) names.bn ??= raw;
    if (latin && !bangla) names.en ??= raw;
  }
  return names;
}

/** Enrich existing anchors only. Raw source labels, IDs and positions are retained. */
export function enrichPlaceNames(places) {
  if (!Array.isArray(places)) throw new TypeError('Place names require an array of existing places');
  return places.map(place => {
    const copy = structuredClone(place), record = matchingRecord(place), fallback = fallbackNames(place);
    const names = { en: record?.names.en ?? fallback.en, bn: record?.names.bn ?? fallback.bn };
    const displayName = uniqueStrings([names.en, names.bn]).join(' · ') || place.name;
    const canonical = new Set([normalized(names.en), normalized(names.bn)]);
    const aliases = uniqueStrings([...(Array.isArray(place.aliases) ? place.aliases : []), ...(record?.names.aliases ?? []),
      ...(canonical.has(normalized(place.name)) ? [] : [place.name])]);
    const searchText = uniqueStrings([displayName, names.en, names.bn, place.name, ...aliases]).map(normalized).join('\n');
    return { ...copy, names, displayName, aliases, searchText };
  });
}

/** Stable bounded search of current/raw/historical names, with NFC Unicode matching. */
export function searchPlaces(places, query = '', limit = 10) {
  if (!Array.isArray(places)) throw new TypeError('Place search requires an array');
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Place search limit must be a nonnegative integer');
  const maximum = Math.min(limit, 50), text = normalized(query), tokens = text.split(' ').filter(Boolean), found = [];
  for (const [index, place] of places.entries()) {
    const current = uniqueStrings([place.names?.en, place.names?.bn, place.displayName, place.name]).map(normalized);
    const aliases = uniqueStrings(place.aliases ?? []).map(normalized);
    const haystack = [...current, ...aliases, normalized(place.searchText)].join('\n');
    if (text && !tokens.every(token => haystack.includes(token))) continue;
    let score = 0;
    if (text) {
      score = current.includes(text) ? 0 : current.some(name => name.startsWith(text)) ? 1 : aliases.includes(text) ? 2 :
        current.some(name => name.includes(text)) ? 3 : aliases.some(name => name.startsWith(text)) ? 4 :
          aliases.some(name => name.includes(text)) ? 5 : 6;
    } else score = place.kind === 'building' ? 0 : place.kind === 'entrance' ? 1 : 2;
    found.push({ place, score, index });
  }
  found.sort((a, b) => a.score - b.score || a.index - b.index);
  const seen = new Set();
  return found.filter(({ place, index }) => {
    const id = place.id ?? `index:${index}`;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, maximum).map(result => result.place);
}
