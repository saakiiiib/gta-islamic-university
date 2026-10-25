import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { wallEdges } from './facades.js';

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
    const edge = [...edges].sort((a, b) => Math.abs((x - a.a[0]) * a.nx + (z - a.a[1]) * a.nz) - Math.abs((x - b.a[0]) * b.nx + (z - b.a[1]) * b.nz))[0];
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

/** Optional enhancement; CPU-only buildWorld and an unavailable asset both retain
 * visible materials/furniture. All fetches stay below the supplied Pages base. */
export async function applyWorldAssets(world, { baseURL = import.meta.env?.BASE_URL ?? './', mobile = false } = {}) {
  const variant = mobile ? '512' : '1024', base = `${baseURL.replace(/\/?$/, '/')}visual/${variant}/`;
  const loader = new THREE.TextureLoader(), textures = new Set(), loaded = [], failed = [];
  const readTexture = async (url, color = false) => {
    const texture = await loader.loadAsync(url);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = mobile ? 2 : 4; textures.add(texture); return texture;
  };
  await Promise.all(Object.entries(MATERIAL_ASSETS).map(async ([asset, keys]) => {
    try {
      const settled = await Promise.allSettled(['color', 'normal', 'orm'].map(suffix => readTexture(`${base}${asset}-${suffix}.webp`, suffix === 'color')));
      if (settled.some(r => r.status !== 'fulfilled')) throw new Error(`Incomplete ${asset} maps`);
      const [color, normal, orm] = settled.map(r => r.value);
      for (const key of keys) {
        const material = world.materials[key]; if (!material) continue;
        material.map = color; material.normalMap = normal; material.normalScale.setScalar(asset === 'Grass004' ? .3 : asset === 'Asphalt010' ? .45 : .5);
        material.roughnessMap = orm; material.metalnessMap = orm; material.aoMap = orm; material.aoMapIntensity = .35;
        material.roughness = 1; material.metalness = asset === 'CorrugatedSteel005' ? .55 : 0;
        // The asphalt's photograph supplies its dark tone; avoid multiplying it
        // by the former nearly-black fallback vertex colour.
        if (asset === 'Asphalt010') material.color.setHex(0xc6c9c7);
        else if (asset === 'Grass004') material.color.setHex(0xbfc6ad);
        material.needsUpdate = true;
      }
      loaded.push(asset);
    } catch (error) { failed.push(asset); }
  }));
  try {
    const result = await new GLTFLoader().loadAsync(`${base}painted-wooden-bench.gltf`), parts = []; let sourceMaterial;
    result.scene.updateMatrixWorld(true);
    result.scene.traverse(object => {
      if (!object.isMesh) return;
      let geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      if (geometry.index) { const source = geometry; geometry = source.toNonIndexed(); source.dispose(); }
      // One source material in the licensed 630-triangle bench; preserve UVs.
      parts.push(geometry); sourceMaterial ??= object.material;
    });
    if (!parts.length) throw new Error('Empty bench');
    const geometry = mergeGeometries(parts, false); parts.forEach(p => p.dispose()); geometry.computeBoundingBox();
    const box = geometry.boundingBox, size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    // Original glTF units are metres. A small uniform normalization preserves
    // the photographed proportions and stays inside the furniture proxy.
    const scale = 1.25 / Math.max(size.x, size.z);
    geometry.translate(-center.x, -box.min.y, -center.z); geometry.scale(scale, scale, scale);
    const material = sourceMaterial.clone(); material.color.multiplyScalar(.92); material.roughness = .95;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) if (material[key]) { material[key].anisotropy = mobile ? 2 : 4; textures.add(material[key]); }
    world.scenery?.replaceBenchGeometry(geometry, material); loaded.push('painted_wooden_bench');
    result.scene.traverse(object => { object.geometry?.dispose(); });
  } catch (error) { failed.push('painted_wooden_bench'); }
  world.assetState = { loaded, failed, variant }; world.assetTextures = textures;
  return world.assetState;
}

export function disposeWorldTextures(world) {
  world.assetTextures?.forEach(texture => texture.dispose());
}
