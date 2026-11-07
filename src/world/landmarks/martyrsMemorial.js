import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tintGeometry } from '../facades.js';

const SOURCES = Object.freeze([
  'https://commons.wikimedia.org/wiki/File:Shahid_Monument,_Islamic_University,_Bangladesh.jpg',
  'https://commons.wikimedia.org/wiki/File:Shahid_Monument,_architectures_of_Islamic_University,_Bangladesh.jpg',
]);

function rectangle(x, y, width, height) {
  const path = new THREE.Path();
  path.moveTo(x, y); path.lineTo(x + width, y); path.lineTo(x + width, y + height);
  path.lineTo(x, y + height); path.closePath(); return path;
}

/** Separate from the Minar: local-origin, provisional-scale, unplaced visual geometry only. */
export function buildMartyrsMemorial(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Memorial options must be an object');
  const { heightMeters } = options;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0 || heightMeters > 1000) {
    throw new RangeError('Memorial heightMeters must be caller-supplied, positive and at most 1000 metres');
  }
  const h = heightMeters, base = .05 * h, parts = [];
  const ratios = { shellWidth: .6, shellDepth: .29, shellThickness: .035, plinthHeight: .05, wingHeight: .14 };
  const add = (geometry, color) => {
    geometry.deleteAttribute('uv');
    if (geometry.index) { const flat = geometry.toNonIndexed(); geometry.dispose(); geometry = flat; }
    tintGeometry(geometry, color); parts.push(geometry);
  };
  const extrude = (shape, depth, z, color) => {
    add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, z), color);
  };
  for (let step = 0; step < 3; step++) {
    add(new THREE.BoxGeometry((1.45 - step * .06) * h, base / 3, (.92 - step * .06) * h)
      .translate(0, (step + .5) * base / 3, 0), step === 2 ? 0xbbb3a3 : 0xa9a494);
  }
  // A U-shaped section extruded through depth makes a barrel-vault shell, including
  // its inner curved soffit and both jambs. The opening reaches the platform.
  const radius = .3 * h, inner = radius - ratios.shellThickness * h, spring = .7 * h;
  const shell = new THREE.Shape(); shell.moveTo(-radius, base); shell.lineTo(-radius, spring);
  shell.absarc(0, spring, radius, Math.PI, 0, true); shell.lineTo(radius, base);
  shell.lineTo(inner, base); shell.lineTo(inner, spring);
  shell.absarc(0, spring, inner, 0, Math.PI, false); shell.lineTo(-inner, base); shell.closePath();
  extrude(shell, ratios.shellDepth * h, -.145 * h, 0x865347);

  const portals = [];
  for (const [index, width, top, z] of [[0, .46, .79, -.137], [1, .34, .62, .075]]) {
    const w = width * h / 2, shoulder = (top - .11) * h, crown = .075 * h;
    const shape = new THREE.Shape();
    // The small bottom notch is an actual open doorway, not a black decal.
    shape.moveTo(-w, base); shape.lineTo(-w, shoulder); shape.lineTo(-crown, shoulder);
    shape.lineTo(-crown, (top - .075) * h);
    shape.absarc(0, (top - .075) * h, crown, Math.PI, 0, true);
    shape.lineTo(crown, shoulder); shape.lineTo(w, shoulder); shape.lineTo(w, base);
    shape.lineTo(.025 * h, base); shape.lineTo(.025 * h, base + .12 * h);
    shape.lineTo(-.025 * h, base + .12 * h); shape.lineTo(-.025 * h, base); shape.closePath();
    for (const sign of [-1, 1]) {
      for (const fraction of [.22, .6]) {
        shape.holes.push(rectangle((sign < 0 ? -width * .43 : width * .27) * h,
          base + fraction * (shoulder - base), width * .16 * h, .2 * (shoulder - base)));
      }
    }
    shape.holes.push(rectangle(-.025 * h, base + .29 * h, .05 * h, .15 * h));
    const archHole = new THREE.Path();
    const holeBottom = (top - .095) * h, holeSpring = (top - .075) * h, holeRadius = .026 * h;
    archHole.moveTo(-holeRadius, holeBottom); archHole.lineTo(-holeRadius, holeSpring);
    archHole.absarc(0, holeSpring, holeRadius, Math.PI, 0, true);
    archHole.lineTo(holeRadius, holeBottom); archHole.closePath(); shape.holes.push(archHole);
    extrude(shape, .025 * h, z * h, index ? 0x74493e : 0x955e4b);
    portals.push({ index, width: width * h, top: top * h, depth: .025 * h, z: z * h });
  }

  // Curved pale wing walls and a terracotta inset suggest the historical relief
  // panels without inventing readable inscriptions or copying photographic pixels.
  const wing = (sign, radius, thickness, bottom, rise, color) => {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const a = -Math.PI / 2 + i / 24 * Math.PI;
      points.push([sign * (.34 * h + Math.cos(a) * radius), -(.02 * h + Math.sin(a) * radius)]);
    }
    for (let i = 24; i >= 0; i--) {
      const a = -Math.PI / 2 + i / 24 * Math.PI;
      points.push([sign * (.34 * h + Math.cos(a) * (radius - thickness)), -(.02 * h + Math.sin(a) * (radius - thickness))]);
    }
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(...p)));
    add(new THREE.ExtrudeGeometry(shape, { depth: rise, bevelEnabled: false }).rotateX(-Math.PI / 2)
      .translate(0, bottom, 0), color);
  };
  for (const sign of [-1, 1]) {
    wing(sign, .31 * h, .018 * h, base, ratios.wingHeight * h, 0xd9d5c7);
    wing(sign, .311 * h, .002 * h, base + .035 * h, .075 * h, 0xad7154);
  }
  const geometry = mergeGeometries(parts, false); parts.forEach(part => part.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .97, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'martyrs-memorial-shell-portals-and-wings';
  mesh.castShadow = mesh.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'unplaced-martyrs-memorial'; group.add(mesh);
  const diagnostics = { placementStatus: 'unverified', dimensionsStatus: 'provisional', heightMeters,
    heightSource: 'caller-supplied-art-scale', scaleRatios: { ...ratios }, localFront: '-Z', portals,
    shell: { width: radius * 2, depth: ratios.shellDepth * h, thickness: radius - inner, springHeight: spring },
    openingSamples: [[0, base + .07 * h, 0], [0, .87 * h, 0]],
    drawCalls: 1, collisionObjects: 0, sourceUrls: [...SOURCES], observedAt: '2021-04',
    limitations: ['No campus anchor or orientation', 'Ratios are provisional photo interpretation',
      'Relief panel colors are illustrative; sculptural inscriptions omitted'] };
  group.userData.martyrsMemorial = diagnostics;
  let disposed = false;
  return { group, diagnostics, dispose() {
    if (disposed) return;
    disposed = true; geometry.dispose(); material.dispose(); group.removeFromParent(); group.clear();
  } };
}
