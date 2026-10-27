const CACHE_NAME = 'campus-story-resources-v1';

export async function sha256(buffer) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function absoluteURL(url) {
  return new URL(url, globalThis.location?.href ?? 'http://localhost/').href;
}

/** Cache immutable bytes, not live Three.js objects. Every cached response is
 * checked against the release manifest; unavailable/private storage is harmless. */
export async function fetchResource(url, {
  sha256: expectedHash, expectedBytes = 0, onProgress = () => {}, timeoutMs = 30_000,
  fetchImpl = globalThis.fetch, cacheStorage = globalThis.caches, cache = 'default', signal,
} = {}) {
  const address = absoluteURL(url), key = new URL(address);
  if (expectedHash) key.searchParams.set('__campus_sha256', expectedHash);
  let store;
  if (expectedHash && globalThis.crypto?.subtle && cacheStorage) {
    try {
      store = await cacheStorage.open(CACHE_NAME);
      const hit = await store.match(key.href);
      if (hit) {
        const buffer = await hit.arrayBuffer();
        if (await sha256(buffer) === expectedHash) {
          onProgress({ resource: address, loadedBytes: buffer.byteLength, totalBytes: buffer.byteLength, fromCache: true });
          return { buffer, contentType: hit.headers.get('content-type') ?? '', fromCache: true };
        }
        await store.delete(key.href);
      }
    } catch { store = null; }
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error(`Timed out loading ${address}`)), timeoutMs);
  try {
    // Version the network URL too: Pages can otherwise serve an older file
    // from its ordinary ten-minute HTTP cache after a new deployment.
    const response = await fetchImpl(expectedHash ? key.href : address, { signal: controller.signal, cache });
    if (!response.ok) throw new Error(`Cannot load ${address} (HTTP ${response.status}).`);
    const totalBytes = expectedBytes || Number(response.headers.get('content-length')) || 0;
    let buffer;
    if (response.body?.getReader) {
      const reader = response.body.getReader(), chunks = []; let loadedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loadedBytes += value.byteLength;
        onProgress({ resource: address, loadedBytes, totalBytes, fromCache: false });
      }
      const bytes = new Uint8Array(loadedBytes); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      buffer = bytes.buffer;
    } else buffer = await response.arrayBuffer();
    if (expectedBytes && buffer.byteLength !== expectedBytes) throw new Error(`Incomplete resource: ${address}`);
    if (expectedHash && globalThis.crypto?.subtle && await sha256(buffer) !== expectedHash) throw new Error(`Resource checksum mismatch: ${address}`);
    onProgress({ resource: address, loadedBytes: buffer.byteLength, totalBytes: buffer.byteLength, fromCache: false });
    const contentType = response.headers.get('content-type') ?? '';
    if (store) {
      // Do not let storage quota or cleanup delay readiness, and never touch
      // other applications' caches on this shared GitHub Pages origin.
      void (async () => {
        try {
          await store.put(key.href, new Response(buffer, { headers: { 'content-type': contentType } }));
          for (const request of await store.keys()) {
            const previous = new URL(request.url);
            previous.searchParams.delete('__campus_sha256');
            if (previous.href === address && request.url !== key.href) await store.delete(request);
          }
        } catch { /* CacheStorage is optional. */ }
      })();
    }
    return { buffer, contentType, fromCache: false };
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error(`Timed out loading ${address}. Please retry.`, { cause: error });
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}

/** Image decoding and model parsing must also have a deadline, not just fetch. */
export async function bounded(promise, label, timeoutMs = 20_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out preparing ${label}`)), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

export const yieldFrame = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function' && globalThis.document?.visibilityState !== 'hidden') requestAnimationFrame(resolve);
  else setTimeout(resolve, 0);
});
