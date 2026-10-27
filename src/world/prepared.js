export const PREPARATION_VERSION = 1;

/** Include metadata used by placement as well as geography; never quantize GPS
 * projection or collider coordinates to make the preparation smaller. */
export function preparationMapKey(map) {
  const value = JSON.stringify(Object.fromEntries(['origin', 'bounds', 'spawn', 'campus', 'buildings', 'roads', 'greens', 'water', 'bridges', 'trees', 'treeRows', 'places', 'entrances'].map(k => [k, map[k]])));
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function finiteData(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteData);
  if (value && typeof value === 'object') return Object.values(value).every(finiteData);
  return value === null || ['string', 'boolean', 'undefined'].includes(typeof value);
}

export function validateCampusPreparation(packet, map, mapSha256 = map.sourceSha256) {
  if (!packet || packet.version !== PREPARATION_VERSION || !/^[a-f0-9]{64}$/.test(mapSha256 ?? '') || packet.mapSha256 !== mapSha256 || packet.mapKey !== preparationMapKey(map)) return false;
  const p = packet.data;
  if (!p || !finiteData(p) || !p.roads || !['asphalt', 'paths', 'edges', 'curbs', 'markings', 'bridgeOpenings', 'walkOpenings'].every(k => Array.isArray(p.roads[k]))) return false;
  if (!Array.isArray(p.vegetation?.trees) || !Array.isArray(p.vegetation?.shrubs) || !Array.isArray(p.scenery)) return false;
  const graph = p.pedestrianGraph;
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph.edges) || !graph.nodes.every((n, i) => n.id === i && (!n.neighbors || Array.isArray(n.neighbors) && n.neighbors.every(e => Number.isInteger(e.to) && e.to >= 0 && e.to < graph.nodes.length)))) return false;
  if (!graph.edges.every(e => Number.isInteger(e.a) && Number.isInteger(e.b) && e.a >= 0 && e.b >= 0 && e.a < graph.nodes.length && e.b < graph.nodes.length)) return false;
  const network = p.vehicleNetwork;
  return Array.isArray(network?.graph?.nodes) && Array.isArray(network.graph.edges) && Array.isArray(network.routes)
    && network.routes.every(r => Array.isArray(r.points) && r.points.length >= 4 && Array.isArray(r.stations) && r.stations.length === r.points.length && r.length > 0);
}

/** Build output is emitted under a Vite content-hashed URL, so Pages never
 * reuses preparation from an older generator after a deployment. */
export async function loadCampusPreparation(map, { mapSha256 = map.sourceSha256, fetcher = globalThis.fetch, onProgress = () => {}, timeoutMs = 12000 } = {}) {
  if (!fetcher || !mapSha256) return null;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    onProgress('Loading prepared campus routes and landscape…');
    const response = await fetcher(new URL('../generated/campus-prepared.json', import.meta.url), { signal: controller.signal });
    if (!response.ok) return null;
    const packet = await response.json();
    if (!validateCampusPreparation(packet, map, mapSha256) || !globalThis.crypto?.subtle) return null;
    const bytes = new TextEncoder().encode(JSON.stringify(packet.data));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
    if (hash !== packet.payloadSha256) return null;
    onProgress('Prepared campus routes and landscape ready');
    return packet.data;
  } catch {
    // Offline development, old deployment, quota failures and corrupt optional
    // preparation always retain the original authoritative source generators.
    return null;
  } finally { clearTimeout(timer); }
}
