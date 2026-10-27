import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fetchResource, sha256 } from '../src/loading/resources.js';
import { createWorldAssetPipeline, MATERIAL_ASSETS } from '../src/world/assets.js';

const bytes = text => new TextEncoder().encode(text);
class MemoryCache {
  entries = new Map();
  async match(key) { return this.entries.get(String(key))?.clone(); }
  async put(key, value) { this.entries.set(String(key), value.clone()); }
  async delete(key) { return this.entries.delete(typeof key === 'string' ? key : key.url); }
  async keys() { return [...this.entries.keys()].map(key => new Request(key)); }
}

test('checksum cache reuses validated bytes and rejects corrupted cached data', async () => {
  const body = bytes('a real bundled asset'), hash = await sha256(body), cache = new MemoryCache(); let requests = 0;
  const options = { sha256: hash, expectedBytes: body.length, cacheStorage: { open: async () => cache },
    fetchImpl: async () => { requests++; return new Response(body, { headers: { 'content-type': 'image/webp' } }); } };
  const first = await fetchResource('https://example.test/game/visual/a.webp', options);
  await new Promise(resolve => setImmediate(resolve));
  const next = await fetchResource('https://example.test/game/visual/a.webp', options);
  assert.equal(first.fromCache, false); assert.equal(next.fromCache, true); assert.equal(requests, 1);
  const key = [...cache.entries.keys()][0]; cache.entries.set(key, new Response('corrupted'));
  const repaired = await fetchResource('https://example.test/game/visual/a.webp', options);
  assert.equal(repaired.fromCache, false); assert.equal(requests, 2);
  assert.deepEqual(new Uint8Array(repaired.buffer), body);
});

test('unavailable persistent storage keeps network loading and accurate byte progress working', async () => {
  const data = bytes('map content'), progress = [];
  const result = await fetchResource('https://example.test/game/data/map.osm', {
    sha256: await sha256(data), cacheStorage: { open: async () => { throw new Error('private storage'); } },
    fetchImpl: async () => new Response(data), expectedBytes: data.length, onProgress: event => progress.push(event),
  });
  assert.equal(new TextDecoder().decode(result.buffer), 'map content');
  assert.equal(progress.at(-1).loadedBytes, data.length); assert.equal(progress.at(-1).totalBytes, data.length);
});

test('new checksums version the HTTP request URL as well as the persistent cache key', async () => {
  const body = bytes('updated asset'), hash = await sha256(body); let requested;
  await fetchResource('https://example.test/campus/visual/grass.webp', { sha256: hash,
    fetchImpl: async url => { requested = new URL(url); return new Response(body); }, cacheStorage: null,
  });
  assert.equal(requested.pathname, '/campus/visual/grass.webp');
  assert.equal(requested.searchParams.get('__campus_sha256'), hash);
});

test('aborted stalled requests fail with a retryable deadline instead of freezing startup', async () => {
  await assert.rejects(fetchResource('https://example.test/stalled', {
    timeoutMs: 15, fetchImpl: (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }),
  }), /Timed out.*retry/);
  await assert.rejects(fetchResource('https://example.test/incomplete', {
    expectedBytes: 20, fetchImpl: async () => new Response('short'),
  }), /Incomplete/);
});

test('opening materials load first at unchanged quality and distant bench assets load separately', async () => {
  const requested = [], files = new Map(), variant = '512';
  for (const asset of Object.keys(MATERIAL_ASSETS)) for (const suffix of ['color', 'normal', 'orm']) files.set(`${variant}/${asset}-${suffix}.webp`, bytes(`${asset}-${suffix}`));
  const gltf = { buffers: [{ uri: '../painted-wooden-bench.bin' }], images: [{ uri: 'bench-color.webp' }, { uri: 'bench-normal.webp' }, { uri: 'bench-orm.webp' }] };
  files.set(`${variant}/painted-wooden-bench.gltf`, bytes(JSON.stringify(gltf)));
  files.set('painted-wooden-bench.bin', bytes('binary'));
  for (const name of ['color', 'normal', 'orm']) files.set(`${variant}/bench-${name}.webp`, bytes(name));
  const manifest = { files: [...files].map(([path, value]) => ({ path, bytes: value.byteLength })) };
  let replacements = 0, uploads = 0;
  const materials = Object.fromEntries(Object.values(MATERIAL_ASSETS).flat().map(key => [key, new THREE.MeshStandardMaterial()]));
  const world = { group: new THREE.Group(), materials, scenery: { replaceBenchGeometry: () => { replacements++; } } };
  const pipeline = createWorldAssetPipeline({ baseURL: 'https://example.test/campus/', mobile: true,
    fetchImpl: async url => {
      const path = new URL(url).pathname.split('/visual/')[1]; requested.push(path);
      return path === 'manifest.json' ? Response.json(manifest) : new Response(files.get(path));
    },
    textureLoader: { loadAsync: async () => new THREE.Texture() },
    gltfLoader: { parseAsync: async text => {
      const data = JSON.parse(text); assert.ok([...data.images, ...data.buffers].every(entry => entry.uri.startsWith('blob:')));
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, .8, .4), new THREE.MeshStandardMaterial())); return { scene };
    } },
  });
  await pipeline.applyEssential(world, { camera: new THREE.PerspectiveCamera(), renderer: { initTexture: () => { uploads++; } } });
  assert.equal(world.assetState.loaded.length, 4); assert.equal(uploads, 12);
  assert.equal(requested.some(path => path.includes('Corrugated') || path.includes('bench')), false);
  assert.equal(materials.asphalt.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(materials.ground.normalScale.x, .3); assert.equal(materials.asphalt.map.anisotropy, 2);
  await pipeline.startBackground(world);
  assert.equal(world.assetState.loaded.length, 6); assert.deepEqual(world.assetState.failed, []);
  assert.equal(replacements, 1); assert.ok(requested.includes('painted-wooden-bench.bin'));
  assert.equal(requested.some(path => path.startsWith('1024/')), false);
  pipeline.dispose(); Object.values(materials).forEach(material => material.dispose());
});

test('failed optional maps retain visible material fallbacks without rejecting readiness', async () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x223344 });
  const world = { group: new THREE.Group(), materials: { asphalt: material }, scenery: {} };
  const pipeline = createWorldAssetPipeline({ baseURL: 'https://example.test/game/',
    fetchImpl: async () => { throw new Error('offline'); }, textureLoader: { loadAsync: async () => new THREE.Texture() },
  });
  await pipeline.applyEssential(world, { camera: new THREE.PerspectiveCamera() });
  await pipeline.startBackground(world);
  assert.equal(material.map, null); assert.equal(material.color.getHex(), 0x223344);
  assert.equal(world.assetState.failed.length, 6); pipeline.dispose(); material.dispose();
});
