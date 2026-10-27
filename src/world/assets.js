import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallEdges } from './facades.js';
import { fetchResource, bounded, yieldFrame } from '../loading/resources.js';

/** Metre-based tiling survives spatial batching; attributes never alter colliders. */
export function horizontalUVs(geometry, tileSize = 4) {
  const positions = geometry.getAttribute('position'), values = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) { values[i * 2] = positions.getX(i) / tileSize; values[i * 2 + 1] = -positions.getZ(i) / tileSize; }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(values, 2));
  geometry.setAttribute('uv1', geometry.getAttribute('uv').clone()); return geometry;
}

export function facadeUVs(geometry, polygon, tileSize = 2.5) {
  const position = geometry.getAttribute('position'), values = new Float32Array(position.count * 2);
  const edges = wallEdges(polygon); let cumulative = 0;
  for (const edge of edges) { edge.uvStart = cumulative; cumulative += edge.length; }
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    // The stable sort previously allocated an edge array for every triangle.
    // Select the same first minimum without allocation or O(n log n) sorting.
    let edge, nearest = Infinity;
    for (const candidate of edges) {
      const distance = Math.abs((x - candidate.a[0]) * candidate.nx + (z - candidate.a[1]) * candidate.nz);
      if (distance < nearest) { nearest = distance; edge = candidate; }
    }
    for (let j = i; j < Math.min(i + 3, position.count); j++) {
      values[j * 2] = edge ? (edge.uvStart + (position.getX(j) - edge.a[0]) * edge.ux + (position.getZ(j) - edge.a[1]) * edge.uz) / tileSize : position.getX(j) / tileSize;
      values[j * 2 + 1] = position.getY(j) / tileSize;
    }
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(values, 2)); geometry.setAttribute('uv1', geometry.getAttribute('uv').clone()); return geometry;
}

export function ensureBatchUVs(geometry) {
  if (!geometry.getAttribute('uv')) horizontalUVs(geometry);
  if (!geometry.getAttribute('uv1')) geometry.setAttribute('uv1', geometry.getAttribute('uv').clone());
  return geometry;
}

export const MATERIAL_ASSETS = Object.freeze({
  Asphalt010: ['asphalt'], Concrete034: ['building', 'roof', 'paths', 'edges'],
  Bricks051: ['brick'], Grass004: ['ground', 'garden', 'park', 'grass', 'forest', 'orchard', 'pitch'], CorrugatedSteel005: ['shedRoof'],
});

/** Start optional visual downloads beside map/CPU preparation. The opening
 * view waits for complete materials; distant enhancements never gate entry. */
export function createWorldAssetPipeline({
  baseURL = import.meta.env?.BASE_URL ?? './', mobile = false, onProgress = () => {},
  fetchImpl = globalThis.fetch, textureLoader, gltfLoader,
} = {}) {
  const variant = mobile ? '512' : '1024';
  const root = new URL(`${baseURL.replace(/\/?$/, '/')}visual/`, globalThis.location?.href ?? 'http://localhost/').href;
  const textures = new Set(), loaded = [], failed = [], resources = new Map(), sets = new Map();
  let disposed = false, background, worldRef, stage = 'essential', uploadQueue = Promise.resolve();
  const emit = () => {
    const entries = [...resources.values()];
    onProgress({ stage, loadedBytes: entries.reduce((n, r) => n + r.loaded, 0), totalBytes: entries.reduce((n, r) => n + r.total, 0),
      completed: entries.filter(r => r.done).length, total: entries.length });
  };
  const manifest = fetchResource(`${root}manifest.json`, { fetchImpl, timeoutMs: 12_000, cache: 'no-cache' })
    .then(({ buffer }) => JSON.parse(new TextDecoder().decode(buffer)))
    .catch(() => ({ files: [] }));
  const read = async path => {
    const metadata = (await manifest).files.find(file => file.path === path);
    const status = { loaded: 0, total: metadata?.bytes ?? 0, done: false }; resources.set(path, status); emit();
    try {
      return await fetchResource(new URL(path, root).href, { fetchImpl, sha256: metadata?.sha256, expectedBytes: metadata?.bytes,
        timeoutMs: 25_000, onProgress: progress => { status.loaded = progress.loadedBytes; status.total = progress.totalBytes; emit(); } });
    } finally { status.done = true; emit(); }
  };
  const readTexture = async (path, color = false) => {
    if (!textureLoader && typeof document === 'undefined') throw new Error('Images unavailable');
    const resource = await read(path), url = URL.createObjectURL(new Blob([resource.buffer], { type: resource.contentType || 'image/webp' }));
    let finished = false;
    try {
      const pending = (textureLoader ?? new THREE.TextureLoader()).loadAsync(url);
      pending.then(texture => { if (finished || disposed) texture.dispose(); }, () => {});
      const texture = await bounded(pending, path);
      if (disposed) { texture.dispose(); throw new Error('Disposed visual pipeline'); }
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = mobile ? 2 : 4;
      textures.add(texture); return texture;
    } finally { finished = true; URL.revokeObjectURL(url); }
  };
  const prepareSet = asset => {
    if (!sets.has(asset)) {
      // Resolve all failures here, including early prefetches, so an optional
      // failure cannot become an unhandled rejection while geometry is built.
      sets.set(asset, Promise.allSettled(['color', 'normal', 'orm'].map(suffix => readTexture(`${variant}/${asset}-${suffix}.webp`, suffix === 'color')))
        .then(results => {
          if (results.every(r => r.status === 'fulfilled')) return results.map(r => r.value);
          for (const result of results) if (result.status === 'fulfilled') {
            result.value.dispose(); textures.delete(result.value);
          }
          return null;
        }));
    }
    return sets.get(asset);
  };
  const warm = async (items, renderer) => {
    for (const texture of items) {
      if (disposed) return;
      // All families share one queue: parallel downloads must not become a
      // burst of simultaneous GPU uploads on a mobile browser.
      uploadQueue = uploadQueue.then(async () => {
        if (!disposed) renderer?.initTexture?.(texture);
        await yieldFrame();
      });
      await uploadQueue;
    }
  };
  const applySet = async (world, asset, renderer) => {
    if (loaded.includes(asset) || failed.includes(asset) || disposed) return;
    const maps = await prepareSet(asset);
    if (!maps || disposed) { if (!disposed) failed.push(asset); return; }
    await warm(maps, renderer);
    if (disposed) return;
    const [color, normal, orm] = maps;
    for (const key of MATERIAL_ASSETS[asset]) {
      const material = world.materials[key]; if (!material) continue;
      material.map = color; material.normalMap = normal; material.normalScale.setScalar(asset === 'Grass004' ? .3 : asset === 'Asphalt010' ? .45 : .5);
      material.roughnessMap = orm; material.metalnessMap = orm; material.aoMap = orm; material.aoMapIntensity = .35;
      material.roughness = 1; material.metalness = asset === 'CorrugatedSteel005' ? .55 : 0;
      if (asset === 'Asphalt010') material.color.setHex(0xc6c9c7);
      else if (asset === 'Grass004') material.color.setHex(0xbfc6ad);
      material.needsUpdate = true;
    }
    loaded.push(asset);
  };
  let bench;
  const releaseModel = (model, releaseTextures = true) => {
    const materials = new Set(), maps = new Set(), geometries = new Set();
    model?.scene?.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    if (releaseTextures) maps.forEach(texture => texture.dispose());
  };
  const prepareBench = () => bench ??= (async () => {
    if (!gltfLoader && typeof document === 'undefined') throw new Error('Images unavailable');
    const { buffer } = await read(`${variant}/painted-wooden-bench.gltf`);
    const data = JSON.parse(new TextDecoder().decode(buffer)), urls = [];
    try {
      const dependencies = await Promise.allSettled([...data.buffers, ...data.images].map(async entry => {
        const path = new URL(entry.uri, `${root}${variant}/painted-wooden-bench.gltf`).href.slice(root.length);
        const item = await read(path), url = URL.createObjectURL(new Blob([item.buffer], { type: item.contentType || (path.endsWith('.webp') ? 'image/webp' : 'application/octet-stream') }));
        urls.push(url); entry.uri = url;
      }));
      if (dependencies.some(result => result.status === 'rejected')) throw new Error('Missing bench dependency');
      let finished = false;
      const pending = (gltfLoader ?? new GLTFLoader()).parseAsync(JSON.stringify(data), '');
      pending.then(model => { if (finished || disposed) releaseModel(model); }, () => {});
      try { return await bounded(pending, 'campus bench'); }
      finally { finished = true; }
    } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
  })().catch(() => null);
  const applyBench = async (world, renderer) => {
    const name = 'painted_wooden_bench';
    if (loaded.includes(name) || failed.includes(name) || disposed) return;
    const result = await prepareBench();
    if (!result || disposed) { if (result) releaseModel(result); if (!disposed) failed.push(name); return; }
    if (!world.scenery?.replaceBenchGeometry) { releaseModel(result); failed.push(name); return; }
    const parts = []; let sourceMaterial;
    try {
      result.scene.updateMatrixWorld(true);
      result.scene.traverse(object => {
        if (!object.isMesh) return;
        let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
        if (geometry.index) { const source = geometry; geometry = source.toNonIndexed(); source.dispose(); }
        parts.push(geometry); sourceMaterial ??= object.material;
      });
      if (!parts.length) throw new Error('Empty bench');
      const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); geometry.computeBoundingBox();
      const box = geometry.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const scale = 1.25 / Math.max(size.x, size.z);
      geometry.translate(-center.x, -box.min.y, -center.z); geometry.scale(scale, scale, scale);
      const material = sourceMaterial.clone(); material.color.multiplyScalar(.92); material.roughness = .95;
      const benchTextures = new Set();
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (material[key]) { material[key].anisotropy = mobile ? 2 : 4; textures.add(material[key]); benchTextures.add(material[key]); }
      await warm(benchTextures, renderer);
      if (disposed) { geometry.dispose(); material.dispose(); return; }
      world.scenery?.replaceBenchGeometry(geometry, material); loaded.push(name);
    } catch { failed.push(name); }
    finally { releaseModel(result, false); }
  };
  const visibleEnhancements = (world, camera) => {
    if (!camera) return { shed: true, bench: true };
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    let shed = false, bench = false;
    world.group?.updateMatrixWorld(true);
    world.group?.traverse(object => {
      if (!object.isMesh || !object.visible) return;
      if (object.material === world.materials.shedRoof && frustum.intersectsObject(object)) shed = true;
      if (object.userData.kind === 'bench') for (const prop of object.userData.props ?? []) {
        const point = new THREE.Vector3(prop.x, .6, prop.z);
        if (point.distanceTo(camera.position) < 200 && frustum.intersectsSphere(new THREE.Sphere(point, 1))) bench = true;
      }
    });
    return { shed, bench };
  };
  // These materials occur throughout the opening gate and its roadside scene.
  for (const asset of ['Asphalt010', 'Concrete034', 'Bricks051', 'Grass004']) prepareSet(asset);
  const pipeline = {
    async applyEssential(world, { camera, renderer } = {}) {
      worldRef = world; world.assetTextures = textures; world.assetState = { loaded, failed, variant }; world.assetPipeline = pipeline;
      const visible = visibleEnhancements(world, camera);
      if (visible.shed) prepareSet('CorrugatedSteel005');
      if (visible.bench) prepareBench();
      await Promise.all(['Asphalt010', 'Concrete034', 'Bricks051', 'Grass004', ...(visible.shed ? ['CorrugatedSteel005'] : [])].map(asset => applySet(world, asset, renderer)));
      if (visible.bench) await applyBench(world, renderer);
      return world.assetState;
    },
    startBackground(world = worldRef, { renderer } = {}) {
      if (!world) throw new Error('Apply essential assets before background assets');
      return background ??= (async () => {
        stage = 'background'; emit(); await yieldFrame();
        await applySet(world, 'CorrugatedSteel005', renderer); await yieldFrame();
        await applyBench(world, renderer); stage = 'complete'; emit();
        return world.assetState;
      })();
    },
    dispose() { disposed = true; textures.forEach(texture => { texture.dispose(); texture.image?.close?.(); }); textures.clear(); },
  };
  return pipeline;
}

/** Compatibility entry point for tests and non-staged callers. */
export async function applyWorldAssets(world, options = {}) {
  const pipeline = createWorldAssetPipeline(options);
  await pipeline.applyEssential(world);
  return pipeline.startBackground(world);
}

export function disposeWorldTextures(world) {
  if (world.assetPipeline) world.assetPipeline.dispose();
  else world.assetTextures?.forEach(texture => texture.dispose());
}
