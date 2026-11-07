import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tintGeometry } from '../facades.js';

const SOURCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Shahid_Minar_IU.jpg',
  'https://commons.wikimedia.org/wiki/File:Shahid_minar_and_Monument.jpg',
]);

/** Historical-photo-inspired local asset. No surveyed scale, anchor or orientation is implied. */
export function buildShaheedMinar(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Minar options must be an object');
  const { heightMeters } = options;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0 || heightMeters > 1000) {
    throw new RangeError('Minar heightMeters must be caller-supplied, positive and at most 1000 metres');
  }
  const h = heightMeters, parts = [], base = .075 * h;
  const ratios = { plazaWidth: 2.1, plazaDepth: 1.28, plinthHeight: .075, frameDepth: .032, redDiscDiameter: .43 };
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    tintGeometry(geometry, color); parts.push(geometry);
  };
  const box = (x, y, z, w, rise, depth, color) =>
    add(new THREE.BoxGeometry(w, rise, depth).translate(x, y + rise / 2, z), color);
  for (let step = 0; step < 3; step++) {
    const geometry = new THREE.CylinderGeometry(1, 1, base / 3, 48);
    geometry.scale((ratios.plazaWidth / 2 - step * .075) * h, 1, (ratios.plazaDepth / 2 - step * .065) * h);
    geometry.translate(0, (step + .5) * base / 3, .18 * h);
    add(geometry, step === 2 ? 0x9d644e : 0x744a3c);
  }
  const frames = [
    { x: -.72, width: .14, height: .44 }, { x: -.45, width: .14, height: .59 },
    { x: 0, width: .46, height: .925 },
    { x: .45, width: .14, height: .59 }, { x: .72, width: .14, height: .44 },
  ].map((frame, index) => {
    const x = frame.x * h, width = frame.width * h, rise = frame.height * h;
    const thickness = (index === 2 ? .03 : .023) * h, depth = ratios.frameDepth * h;
    box(x - width / 2 + thickness / 2, base, 0, thickness, rise, depth, 0xd4d4c9);
    box(x + width / 2 - thickness / 2, base, 0, thickness, rise, depth, 0xd4d4c9);
    box(x, base + rise - thickness, 0, width, thickness, depth, 0xd4d4c9);
    if (index === 2) box(x, base, 0, thickness, rise, depth, 0xd4d4c9);
    // Sparse physical bars preserve the open frame rather than using an opaque panel.
    const bars = index === 2 ? 12 : 3, rod = .002 * h;
    for (let bar = 1; bar <= bars; bar++) {
      const at = x - width / 2 + thickness + (width - 2 * thickness) * bar / (bars + 1);
      box(at, base, .003 * h, rod, rise - thickness, rod, 0x51554d);
    }
    for (const fraction of [.25, .5, .75]) {
      box(x, base + rise * fraction, .003 * h, width - 2 * thickness, rod, rod, 0x51554d);
    }
    box(x, base, 0, width * 1.1, .025 * h, .075 * h, 0x787b70);
    const interval = (width - 2 * thickness) / (bars + 1);
    return { index, centerX: x, width, height: rise, bottom: base, top: base + rise,
      openingSample: [x - width / 2 + thickness + interval * .5, base + rise * .82, 0] };
  });
  // The disc is behind the central frame, facing local -Z; it is deliberately solid.
  add(new THREE.CylinderGeometry(.215 * h, .215 * h, .009 * h, 48)
    .rotateX(Math.PI / 2).translate(0, base + .235 * h, .065 * h), 0xb82b25);
  const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'shaheed-minar-frames-disc-and-plaza';
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'unplaced-shaheed-minar'; group.add(mesh);
  const diagnostics = { placementStatus: 'unverified', dimensionsStatus: 'provisional', heightMeters,
    heightSource: 'caller-supplied-art-scale', scaleRatios: { ...ratios }, localFront: '-Z', frames,
    redDisc: { center: [0, base + .235 * h, .065 * h], radius: .215 * h },
    drawCalls: 1, collisionObjects: 0, observedAt: '2021-03', sourceUrls: [...SOURCES],
    limitations: ['No campus anchor or orientation', 'Ratios are provisional photo interpretation',
      'No reproduction of alpona, inscriptions or measured platform dimensions'] };
  group.userData.shaheedMinar = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
