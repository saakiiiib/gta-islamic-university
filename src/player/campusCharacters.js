/**
 * Campus Story: Islamic University | Procedural Campus Characters
 * Three.js ES module.
 *
 * Provides:
 * - createHujurCharacter: Islamic University scholar / Hujur with authentic thobe/robe,
 *   patterned red houndstooth keffiyeh/ghutrah with dual agal cords, trimmed beard, and sandals.
 * - createNiqabCharacter: Female student NPC with modest dark abaya, draped niqab veil, and eye band.
 * - animateCharacterWalk: Fluid joint and robe-bobbing walking/running animation gait.
 * - moveCampusNPCTo: Path navigation helper for campus side characters.
 */
import * as THREE from 'three';

const PI = Math.PI;
const cache = new Map();
const SCARF_TEXTURES = new Map();

function standard(color, roughness = 0.86, side = THREE.FrontSide) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side });
}

function mesh(g, m, parent, x = 0, y = 0, z = 0, shadow = true) {
  const obj = new THREE.Mesh(g, m);
  obj.position.set(x, y, z);
  obj.castShadow = shadow;
  obj.receiveShadow = true;
  parent.add(obj);
  return obj;
}

function ellipsoid(parent, mat, size, pos, detail = 16) {
  const obj = mesh(new THREE.SphereGeometry(1, detail, Math.max(10, detail - 4)), mat, parent, ...pos);
  obj.scale.set(...size);
  return obj;
}

function cylinder(parent, mat, top, bottom, length, segments, pos) {
  return mesh(new THREE.CylinderGeometry(top, bottom, length, segments), mat, parent, ...pos);
}

function roundLine(parent, mat, from, to, radius = 0.01, segs = 7) {
  const A = new THREE.Vector3(...from);
  const B = new THREE.Vector3(...to);
  const dir = B.clone().sub(A);
  const line = mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), segs), mat, parent, ...A.clone().add(B).multiplyScalar(0.5).toArray(), false);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return line;
}

function addPanel(parent, material, coords, uvCoords) {
  const geometry = new THREE.BufferGeometry();
  const faces = [0, 1, 2, 0, 2, 3];
  const positions = [];
  const uv = [];
  for (const idx of faces) {
    positions.push(...coords[idx]);
    uv.push(...uvCoords[idx]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

/**
 * Procedural red/white houndstooth weave pattern with alternating diamonds for traditional keffiyeh.
 */
function patternedScarf(accent = '#b73332') {
  const key = String(accent).toLowerCase();
  if (SCARF_TEXTURES.has(key)) return SCARF_TEXTURES.get(key);
  if (typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const c = canvas.getContext('2d');
    if (!c) return null;

    c.fillStyle = '#f4f0e7';
    c.fillRect(0, 0, 256, 256);

    const step = 24;
    c.strokeStyle = accent;
    c.lineWidth = 5;

    for (let n = -256; n < 512; n += step) {
      c.beginPath(); c.moveTo(n, 0); c.lineTo(n + 256, 256); c.stroke();
      c.beginPath(); c.moveTo(n, 256); c.lineTo(n + 256, 0); c.stroke();
    }

    c.fillStyle = accent;
    for (let y = 12; y < 256; y += 24) {
      for (let x = 12; x < 256; x += 24) {
        if (((x + y) / 24) % 2 < 1) {
          c.fillRect(x - 3, y - 8, 6, 16);
          c.fillRect(x - 8, y - 3, 16, 6);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    SCARF_TEXTURES.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}

function makeMaterials(type, opt) {
  const key = JSON.stringify({
    type,
    robeColor: opt.robeColor,
    scarfColor: opt.scarfColor,
    skinColor: opt.skinColor,
    beardColor: opt.beardColor,
    shoeColor: opt.shoeColor,
  });
  if (cache.has(key)) return cache.get(key);

  const tex = patternedScarf(opt.scarfColor);
  const m = {
    robe: standard(opt.robeColor),
    robeTrim: standard(0xd4d1c8),
    skin: standard(opt.skinColor, 0.92),
    eyes: standard(0x282321),
    eyeWhite: standard(0xefeadc),
    beard: standard(opt.beardColor, 0.99),
    shoes: standard(opt.shoeColor, 0.92),
    scarf: tex
      ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide })
      : standard(opt.scarfColor, 0.95, THREE.DoubleSide),
    agal: standard('#181819'),
    shadow: standard(0x33302d),
  };
  cache.set(key, m);
  return m;
}

function createRobe(body, m) {
  const profile = [
    [0.0, 0.085], [0.45, 0.085], [0.53, 0.12], [0.52, 0.24],
    [0.50, 0.36], [0.46, 0.63], [0.39, 1.05], [0.37, 1.30],
    [0.33, 1.39], [0, 1.39],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const robe = mesh(new THREE.LatheGeometry(profile, 24), m.robe, body);

  // Sewn center placket down the front (+Z), plus a collar and buttons
  roundLine(body, m.robeTrim, [0, 1.38, 0.34], [0, 0.91, 0.40], 0.006);
  for (const [y, z] of [[1.29, 0.365], [1.16, 0.39], [1.03, 0.405]]) {
    ellipsoid(body, m.shadow, [0.012, 0.012, 0.006], [0, y, z], 8);
  }
  const neck = cylinder(body, m.skin, 0.145, 0.15, 0.18, 12, [0, 1.45, 0]);
  neck.castShadow = false;
  const collar = mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 20), m.robe, body, 0, 1.42, 0);
  collar.rotation.x = PI / 2;
  return robe;
}

function makeSleeve(parent, material, skin, sign, long = true) {
  const shoulder = new THREE.Group();
  shoulder.position.set(sign * 0.405, 1.32, 0);
  parent.add(shoulder);

  const sleeve = cylinder(shoulder, material, 0.22, 0.155, long ? 0.69 : 0.56, 12, [sign * 0.14, -0.31, 0]);
  sleeve.rotation.z = sign * 0.24;
  ellipsoid(shoulder, skin, [0.115, 0.14, 0.105], [sign * 0.225, long ? -0.68 : -0.59, 0.005], 12);
  return shoulder;
}

function makeFeet(group, shoeMat, skinMat, sign, sandal = true) {
  const pivot = new THREE.Group();
  pivot.position.set(sign * 0.21, 0.27, 0);
  group.add(pivot);

  ellipsoid(pivot, shoeMat, [0.165, 0.095, 0.265], [0, -0.182, 0.095], 14);
  if (sandal) {
    ellipsoid(pivot, skinMat, [0.118, 0.053, 0.17], [0, -0.133, 0.105], 12);
    ellipsoid(pivot, shoeMat, [0.133, 0.026, 0.09], [0, -0.1, 0.13], 12);
  }
  return pivot;
}

function createFace(headGroup, mats) {
  const skin = mats.skin, eye = mats.eyes;
  ellipsoid(headGroup, skin, [0.25, 0.315, 0.265], [0, 0.02, 0.01], 20);
  for (const sign of [-1, 1]) {
    ellipsoid(headGroup, skin, [0.063, 0.12, 0.055], [sign * 0.255, 0.01, -0.006], 12); // ear
    ellipsoid(headGroup, mats.eyeWhite, [0.071, 0.032, 0.024], [sign * 0.116, 0.062, 0.245], 12);
    ellipsoid(headGroup, eye, [0.024, 0.032, 0.016], [sign * 0.111, 0.061, 0.267], 12);
    ellipsoid(headGroup, mats.beard, [0.078, 0.018, 0.021], [sign * 0.115, 0.128, 0.235], 12);
    ellipsoid(headGroup, mats.beard, [0.085, 0.14, 0.047], [sign * 0.203, -0.205, 0.104], 12);
  }
  ellipsoid(headGroup, skin, [0.061, 0.097, 0.09], [0, -0.045, 0.26], 12); // nose

  // Rounded chin beard
  ellipsoid(headGroup, mats.beard, [0.23, 0.17, 0.16], [0, -0.245, 0.138], 16);
  const beardPoint = mesh(new THREE.ConeGeometry(0.178, 0.29, 16), mats.beard, headGroup, 0, -0.405, 0.125);
  beardPoint.rotation.z = PI;

  for (const sign of [-1, 1]) {
    ellipsoid(headGroup, mats.beard, [0.098, 0.037, 0.027], [sign * 0.073, -0.139, 0.26], 12);
  }
}

function createScarf(headGroup, mats) {
  // Top head wrap + draped cloth panels
  const cap = mesh(new THREE.SphereGeometry(0.298, 24, 14, 0, 2 * PI, 0, PI * 0.53), mats.scarf, headGroup, 0, 0.20, -0.025);
  cap.scale.set(1.14, 0.86, 1.12);

  for (const sign of [-1, 1]) {
    addPanel(headGroup, mats.scarf,
      [[sign * 0.235, 0.22, -0.09], [sign * 0.33, 0.16, -0.18],
       [sign * 0.44, -0.66, -0.21], [sign * 0.25, -0.70, 0.07]],
      [[0, 0], [1, 0], [1, 1], [0, 1]]);
    addPanel(headGroup, mats.scarf,
      [[sign * 0.23, 0.13, -0.20], [sign * 0.31, 0.08, -0.26],
       [sign * 0.30, -0.66, -0.28], [sign * 0.21, -0.53, -0.19]],
      [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  addPanel(headGroup, mats.scarf,
    [[-0.28, 0.16, -0.20], [0.28, 0.16, -0.20],
     [0.37, -0.77, -0.27], [-0.37, -0.77, -0.27]],
    [[0, 0], [1, 0], [1, 1.7], [0, 1.7]]);

  // Twin agal rings around the crown
  for (const height of [0.275, 0.317]) {
    const ring = mesh(new THREE.TorusGeometry(0.285, 0.027, 7, 28), mats.agal, headGroup, 0, height, -0.025);
    ring.rotation.x = PI / 2;
    ring.scale.z = 0.91;
  }
}

function newRig(group, robe, headPivot, armL, armR, legL, legR, kind) {
  group.userData.campusRig = {
    kind,
    torso: robe,
    headPivot,
    leftArmPivot: armL,
    rightArmPivot: armR,
    leftLegPivot: legL,
    rightLegPivot: legR,
    phase: 0,
    blend: 0,
    initialTorsoY: robe.position.y,
    initialHeadY: headPivot.position.y,
  };
  Object.assign(group.userData, {
    leftArmPivot: armL,
    rightArmPivot: armR,
    leftLegPivot: legL,
    rightLegPivot: legR,
    walkTime: 0,
  });
  return group;
}

/**
 * Creates the Islamic University Hujur scholar 3D character.
 * Coordinate convention: local +Z is forward; soles at ground Y=0.
 * Default scale 0.88 perfectly encloses a ~1.73m human in metre scale.
 */
export function createHujurCharacter(options = {}) {
  const opt = {
    robeColor: '#eae8dc',
    skinColor: '#ba8667',
    scarfColor: '#b42b2d',
    beardColor: '#27201d',
    shoeColor: '#695844',
    scale: 0.88,
    ...options,
  };
  const mats = makeMaterials('hujur', opt);
  const group = new THREE.Group();
  group.name = 'Campus Story - Hujur';
  group.scale.setScalar(opt.scale);

  const body = new THREE.Group();
  group.add(body);
  const robe = createRobe(body, mats);
  const leftArm = makeSleeve(body, mats.robe, mats.skin, -1);
  const rightArm = makeSleeve(body, mats.robe, mats.skin, 1);
  const leftLeg = makeFeet(group, mats.shoes, mats.skin, -1);
  const rightLeg = makeFeet(group, mats.shoes, mats.skin, 1);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.69, 0);
  body.add(headGroup);

  createFace(headGroup, mats);
  createScarf(headGroup, mats);

  newRig(group, body, headGroup, leftArm, rightArm, leftLeg, rightLeg, 'hujur');
  return group;
}

/**
 * Creates the Islamic University Niqab student 3D character.
 */
export function createNiqabCharacter(options = {}) {
  const opt = {
    robeColor: '#161619',
    skinColor: '#c9a285',
    scarfColor: '#111115',
    beardColor: '#111115',
    shoeColor: '#29242a',
    scale: 0.88,
    ...options,
  };
  const m = makeMaterials('niqab', opt);
  const veil = standard(opt.scarfColor, 0.99, THREE.DoubleSide);
  const root = new THREE.Group();
  root.name = 'Campus Story - Niqab Student';
  root.scale.setScalar(opt.scale);

  const body = new THREE.Group();
  root.add(body);

  const robeProfile = [
    [0, 0.06], [0.49, 0.06], [0.50, 0.18], [0.43, 0.60],
    [0.34, 1.23], [0.25, 1.44], [0, 1.44],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(robeProfile, 24), m.robe, body);

  const armL = makeSleeve(body, m.robe, m.robe, -1);
  const armR = makeSleeve(body, m.robe, m.robe, 1);
  const legL = makeFeet(root, m.shoes, m.shoes, -1, false);
  const legR = makeFeet(root, m.shoes, m.shoes, 1, false);

  const head = new THREE.Group();
  head.position.y = 1.66;
  body.add(head);

  ellipsoid(head, veil, [0.295, 0.34, 0.285], [0, 0.065, 0], 18);
  addPanel(head, veil,
    [[-0.24, 0.10, 0.26], [0.24, 0.10, 0.26],
     [0.24, -0.32, 0.29], [-0.24, -0.32, 0.29]],
    [[0, 0], [1, 0], [1, 1], [0, 1]]);

  const eyeBand = standard(opt.skinColor, 0.9);
  ellipsoid(head, eyeBand, [0.22, 0.066, 0.024], [0, 0.108, 0.282], 14);
  for (const s of [-1, 1]) {
    ellipsoid(head, m.eyes, [0.032, 0.024, 0.014], [s * 0.105, 0.113, 0.309], 12);
  }

  addPanel(head, veil,
    [[-0.27, -0.14, -0.1], [0.27, -0.14, -0.1],
     [0.36, -0.7, 0.13], [-0.36, -0.7, 0.13]],
    [[0, 0], [1, 0], [1, 1], [0, 1]]);

  newRig(root, body, head, armL, armR, legL, legR, 'niqab');
  return root;
}

/**
 * Animates a procedural character's gait, limbs, robe bobbing, and head sway.
 */
export function animateCharacterWalk(character, delta, speed = 0) {
  const rig = character?.userData?.campusRig;
  if (!rig) return;

  delta = Math.max(0, Math.min(Number(delta) || 0, 0.075));
  const moving = typeof speed === 'boolean' ? Number(speed) * 1.8 : Math.abs(Number(speed) || 0);
  const goal = Math.min(1, moving / 1.8);
  rig.blend += (goal - rig.blend) * (1 - Math.exp(-11 * delta));
  const stride = rig.blend;

  if (stride > 0.01) {
    rig.phase += delta * (6.5 + Math.min(6, moving * 1.5));
  }
  const s = Math.sin(rig.phase);
  const bounce = Math.abs(Math.sin(rig.phase)) * 0.018 * stride;

  rig.leftArmPivot.rotation.x = s * 0.37 * stride;
  rig.rightArmPivot.rotation.x = -s * 0.37 * stride;
  rig.leftLegPivot.rotation.x = -s * 0.41 * stride;
  rig.rightLegPivot.rotation.x = s * 0.41 * stride;
  rig.torso.position.y = rig.initialTorsoY + bounce;
  rig.headPivot.rotation.z = s * 0.02 * stride;
  rig.headPivot.rotation.x = 0.035 * stride;
  character.userData.walkTime = rig.phase;
}

/**
 * Helper: Moves an NPC smoothly toward a target point on the campus ground.
 */
export function moveCampusNPCTo(npc, target, delta, speed = 1.1) {
  const vector = new THREE.Vector3(target.x, npc.position.y, target.z).sub(npc.position);
  const dist = vector.length();
  if (dist < 0.12) return 0;
  const dir = vector.normalize();
  const step = Math.min(dist - 0.12, speed * Math.min(delta, 0.075));
  npc.position.addScaledVector(dir, step);
  npc.rotation.y = Math.atan2(dir.x, dir.z);
  return speed;
}
