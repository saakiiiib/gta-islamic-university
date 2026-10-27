import * as THREE from 'three';

/**
 * Islamic University Main Gate (প্রধান ফটক) & Highway Approach Reconstruction.
 * Modeled based on official architectural photographs and OpenStreetMap coordinates.
 * Features:
 * - 4 grand Roman-Islamic arches (2 central vehicular, 2 flanking pedestrian)
 * - Continuous upper frieze with golden Arabic Calligraphy ("لا إله إلا الله محمد رسول الله")
 * - Central raised circular brick planter island with Islamic University crest emblem & plaque
 * - Wrought-iron gates in open configuration
 * - Flanking blooming red Krishnachura (Delonix regia) tree canopies and Royal palms
 * - Solid pillar colliders allowing unobstructed transit through archways
 */

export const MAIN_GATE_CONFIG = Object.freeze({
  position: { x: 304.91, y: 0.0, z: -64.49 }, // OSM Entrance Node 9027931168
  yaw: 2.1866, // Angle facing outward toward highway (~125.3 deg)
  highwayNode: { x: 338.00, y: 0.0, z: -87.87 }, // OSM Highway Node 321516187
  exteriorSpawn: { x: 326.00, y: 0.0, z: -78.00, yaw: 2.1866 }, // Highway approach spawn facing Main Gate
  busParking: { x: 271.00, y: 0.0, z: -45.00, yaw: -0.45 }, // Road bay near entrance
});

/** Create offscreen canvas texture for golden Arabic calligraphy */
function createCalligraphyTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Rich dark emerald/black background with subtle marble sheen
    ctx.fillStyle = '#0f241a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative Islamic border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    // Golden embossed Arabic Calligraphy: لا إله إلا الله محمد رسول الله
    ctx.font = 'bold 54px "Amiri", "Scheherazade New", "Traditional Arabic", "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.fillStyle = '#4a3b10';
    ctx.fillText('لَا إِلٰهَ إِلَّا الله مُحَمَّدٌ رَسُولُ الله', canvas.width / 2 + 2, canvas.height / 2 + 3);

    // Shimmering gold fill
    const gradient = ctx.createLinearGradient(0, 20, 0, 100);
    gradient.addColorStop(0, '#ffe894');
    gradient.addColorStop(0.4, '#f7d057');
    gradient.addColorStop(0.7, '#d4af37');
    gradient.addColorStop(1, '#a37a1c');
    ctx.fillStyle = gradient;
    ctx.fillText('لَا إِلٰهَ إِلَّا الله مُحَمَّدٌ رَسُولُ الله', canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Create university crest signboard texture */
function createCrestTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White marble background
    ctx.fillStyle = '#f8f8f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Green header bar
    ctx.fillStyle = '#0f522e';
    ctx.fillRect(10, 10, canvas.width - 20, 75);

    // University Seal / Medallion in center
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 160, 48, 0, Math.PI * 2);
    ctx.fillStyle = '#0f522e';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#d4af37';
    ctx.stroke();

    // Star & Crescent emblem
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IU', canvas.width / 2, 160);

    // Text Inscriptions in Bangla, Arabic & English
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('ইসলামী বিশ্ববিদ্যালয়, বাংলাদেশ', canvas.width / 2, 48);

    ctx.fillStyle = '#0f522e';
    ctx.font = 'bold 22px serif';
    ctx.fillText('الجامعة الإسلامية · كوشتيا', canvas.width / 2, 235);

    ctx.fillStyle = '#1b2a21';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('ISLAMIC UNIVERSITY', canvas.width / 2, 275);
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#555555';
    ctx.fillText('KUSHTIA · ESTD. 1979', canvas.width / 2, 310);

    // Gold border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Create procedural blooming Krishnachura tree (Delonix regia) */
function createKrishnachuraTree(x, z, scale = 1.0) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x423124, roughness: 0.9, metalness: 0.05 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e5927, roughness: 0.8, metalness: 0.05 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xeb3617, roughness: 0.6, metalness: 0.1 }); // Vibrant scarlet

  // Twisted sculptural trunk
  const trunkGeo = new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 4.5 * scale, 8);
  trunkGeo.translate(0, 2.25 * scale, 0);
  const trunk = new THREE.Mesh(trunkGeo, barkMat);
  trunk.castShadow = trunk.receiveShadow = true;
  tree.add(trunk);

  // Broad umbrella boughs
  const branchConfigs = [
    { x: 0, y: 3.8 * scale, z: 0, rotX: 0.3, rotZ: 0.4, len: 3.8 * scale },
    { x: 0, y: 3.5 * scale, z: 0, rotX: -0.35, rotZ: -0.3, len: 4.2 * scale },
    { x: 0, y: 4.0 * scale, z: 0, rotX: 0.1, rotZ: -0.45, len: 3.5 * scale },
    { x: 0, y: 3.7 * scale, z: 0, rotX: -0.2, rotZ: 0.35, len: 3.9 * scale },
  ];

  for (const b of branchConfigs) {
    const branchGeo = new THREE.CylinderGeometry(0.18 * scale, 0.28 * scale, b.len, 6);
    branchGeo.translate(0, b.len / 2, 0);
    const branch = new THREE.Mesh(branchGeo, barkMat);
    branch.position.set(b.x, b.y, b.z);
    branch.rotation.set(b.rotX, 0, b.rotZ);
    branch.castShadow = true;
    tree.add(branch);
  }

  // Spreading canopy clusters (ferny foliage + brilliant red blooms)
  const canopyClusters = [
    { x: 0, y: 6.2 * scale, z: 0, r: 2.8 * scale },
    { x: 2.2 * scale, y: 5.6 * scale, z: 1.2 * scale, r: 2.4 * scale },
    { x: -2.4 * scale, y: 5.4 * scale, z: -1.0 * scale, r: 2.5 * scale },
    { x: 1.4 * scale, y: 5.8 * scale, z: -2.2 * scale, r: 2.3 * scale },
    { x: -1.6 * scale, y: 5.5 * scale, z: 2.0 * scale, r: 2.2 * scale },
  ];

  for (const c of canopyClusters) {
    // Green foliage base
    const leafGeo = new THREE.DodecahedronGeometry(c.r, 1);
    leafGeo.scale(1.3, 0.45, 1.3);
    const foliage = new THREE.Mesh(leafGeo, leafMat);
    foliage.position.set(c.x, c.y, c.z);
    foliage.castShadow = foliage.receiveShadow = true;
    tree.add(foliage);

    // Brilliant red Krishnachura flowers on top of the canopy
    const flowerGeo = new THREE.DodecahedronGeometry(c.r * 0.95, 1);
    flowerGeo.scale(1.25, 0.35, 1.25);
    const flowers = new THREE.Mesh(flowerGeo, flowerMat);
    flowers.position.set(c.x, c.y + 0.35 * scale, c.z);
    flowers.castShadow = true;
    tree.add(flowers);
  }

  return tree;
}

/** Create tall Royal Palm tree (Roystonea regia) */
function createRoyalPalm(x, z, height = 9.5) {
  const palm = new THREE.Group();
  palm.position.set(x, 0, z);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x99968f, roughness: 0.8 }); // Smooth grey concrete-like bark
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x1f5424, roughness: 0.7 }); // Deep emerald fronds

  // Smooth columnar trunk with gentle bulge in middle
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.32, height, 8);
  trunkGeo.translate(0, height / 2, 0);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = trunk.receiveShadow = true;
  palm.add(trunk);

  // Green crownshaft
  const shaftGeo = new THREE.CylinderGeometry(0.25, 0.25, 1.4, 8);
  shaftGeo.translate(0, height + 0.7, 0);
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3d7e36, roughness: 0.5 });
  palm.add(new THREE.Mesh(shaftGeo, shaftMat));

  // Arching fronds
  const frondCount = 9;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2;
    const frondGeo = new THREE.ConeGeometry(0.35, 3.8, 4);
    frondGeo.translate(0, 1.9, 0);
    const frond = new THREE.Mesh(frondGeo, crownMat);
    frond.position.set(0, height + 1.2, 0);
    frond.rotation.set(0.9, angle, 0);
    frond.scale.set(1, 1, 0.3);
    frond.castShadow = true;
    palm.add(frond);
  }

  return palm;
}

/**
 * Builds the complete 3D Main Gate architectural assembly, boundary walls,
 * landscaping, approach road, and collision boxes.
 */
export function buildMainGate(options = {}) {
  const group = new THREE.Group();
  group.name = 'islamic-university-main-gate';

  const collisionGroup = new THREE.Group();
  collisionGroup.name = 'main-gate-colliders';
  collisionGroup.visible = false;

  const obstacles = [];

  // Materials
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0xf3ede0, // Cream ivory architectural stone
    roughness: 0.82,
    metalness: 0.08,
  });

  const basePlinthMat = new THREE.MeshStandardMaterial({
    color: 0xded6c4,
    roughness: 0.88,
    metalness: 0.05,
  });

  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37, // Metallic gold
    roughness: 0.25,
    metalness: 0.85,
  });

  const brickMat = new THREE.MeshStandardMaterial({
    color: 0x9e3828, // Terracotta red brick
    roughness: 0.92,
    metalness: 0.02,
  });

  const curbWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7 });
  const curbBlackMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.35, metalness: 0.92 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.88, metalness: 0.1 });
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x486b36, roughness: 0.9 });

  // --------------------------------------------------------------------------
  // 1. Classical Stone Pilasters (Pillars)
  // 5 Pillars creating 4 Archways:
  // - Arch 1 (Left Pedestrian): between x = -8.5 and x = -5.8  (width: 2.7m)
  // - Arch 2 (Left Vehicular):  between x = -4.8 and x = -0.7  (width: 4.1m)
  // - Arch 3 (Right Vehicular): between x = 0.7  and x = 4.8   (width: 4.1m)
  // - Arch 4 (Right Pedestrian):between x = 5.8  and x = 8.5   (width: 2.7m)
  // --------------------------------------------------------------------------
  const pillarLayout = [
    { x: -9.0, width: 1.0, height: 5.6, depth: 1.4, isSide: true },
    { x: -5.3, width: 1.0, height: 8.2, depth: 1.5, isCentral: true },
    { x: 0.0,  width: 1.4, height: 8.5, depth: 1.6, isCenter: true },
    { x: 5.3,  width: 1.0, height: 8.2, depth: 1.5, isCentral: true },
    { x: 9.0,  width: 1.0, height: 5.6, depth: 1.4, isSide: true },
  ];

  const gateCenter = MAIN_GATE_CONFIG.position;
  const gateYaw = MAIN_GATE_CONFIG.yaw;

  // Local gate container positioned and rotated at entrance node
  const gateRig = new THREE.Group();
  gateRig.position.set(gateCenter.x, gateCenter.y, gateCenter.z);
  gateRig.rotation.y = gateYaw;
  group.add(gateRig);

  for (let i = 0; i < pillarLayout.length; i++) {
    const p = pillarLayout[i];
    const pillarGroup = new THREE.Group();
    pillarGroup.position.set(p.x, 0, 0);

    // Base plinth
    const plinthGeo = new THREE.BoxGeometry(p.width + 0.35, 0.7, p.depth + 0.35);
    plinthGeo.translate(0, 0.35, 0);
    pillarGroup.add(new THREE.Mesh(plinthGeo, basePlinthMat));

    // Shaft column
    const shaftGeo = new THREE.BoxGeometry(p.width, p.height - 1.2, p.depth);
    shaftGeo.translate(0, (p.height - 1.2) / 2 + 0.7, 0);
    const shaftMesh = new THREE.Mesh(shaftGeo, stoneMat);
    shaftMesh.castShadow = shaftMesh.receiveShadow = true;
    pillarGroup.add(shaftMesh);

    // Decorative capital on top
    const capGeo = new THREE.BoxGeometry(p.width + 0.3, 0.5, p.depth + 0.3);
    capGeo.translate(0, p.height + 0.25, 0);
    pillarGroup.add(new THREE.Mesh(capGeo, stoneMat));

    gateRig.add(pillarGroup);

    // Collider for this pillar (in world space for player/vehicle physics)
    const colliderGeo = new THREE.BoxGeometry(p.width + 0.2, p.height, p.depth + 0.2);
    const colliderMesh = new THREE.Mesh(colliderGeo, new THREE.MeshBasicMaterial());
    // Calculate world position
    const worldP = new THREE.Vector3(p.x, p.height / 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), gateYaw).add(gateCenter);
    colliderMesh.position.copy(worldP);
    colliderMesh.rotation.y = gateYaw;
    colliderMesh.name = `gate-pillar-${i}`;
    collisionGroup.add(colliderMesh);

    obstacles.push({
      id: `gate-pillar-${i}`,
      kind: 'gate-pillar',
      x: worldP.x,
      z: worldP.z,
      width: p.width + 0.2,
      depth: p.depth + 0.2,
      height: p.height,
      yaw: gateYaw,
    });
  }

  // --------------------------------------------------------------------------
  // 2. Arch Curves (Roman semicircular arches spanning between pillars)
  // --------------------------------------------------------------------------
  const archConfigs = [
    // Left pedestrian arch
    { x1: -9.0, x2: -5.3, springY: 3.6, peakY: 5.2, depth: 1.2 },
    // Left vehicular arch
    { x1: -5.3, x2: 0.0,  springY: 5.5, peakY: 7.8, depth: 1.3 },
    // Right vehicular arch
    { x1: 0.0,  x2: 5.3,  springY: 5.5, peakY: 7.8, depth: 1.3 },
    // Right pedestrian arch
    { x1: 5.3,  x2: 9.0,  springY: 3.6, peakY: 5.2, depth: 1.2 },
  ];

  for (const arch of archConfigs) {
    const span = Math.abs(arch.x2 - arch.x1);
    const midX = (arch.x1 + arch.x2) / 2;
    const archH = arch.peakY - arch.springY;

    // Semicircular arch spandrel fill with arched void
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(-span / 2, archH + 0.6);
    shape.lineTo(span / 2, archH + 0.6);
    shape.lineTo(span / 2, 0);
    // Inner curve cut
    shape.absarc(0, 0, span / 2 - 0.25, 0, Math.PI, false);

    const extrudeSettings = { steps: 1, depth: arch.depth, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 };
    const archGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    archGeo.translate(0, 0, -arch.depth / 2);
    const archMesh = new THREE.Mesh(archGeo, stoneMat);
    archMesh.position.set(midX, arch.springY, 0);
    archMesh.castShadow = archMesh.receiveShadow = true;
    gateRig.add(archMesh);

    // Decorative keystone at apex
    const keystoneGeo = new THREE.BoxGeometry(0.55, 0.7, arch.depth + 0.25);
    const keystone = new THREE.Mesh(keystoneGeo, basePlinthMat);
    keystone.position.set(midX, arch.peakY + 0.25, 0);
    gateRig.add(keystone);
  }

  // --------------------------------------------------------------------------
  // 3. Grand Upper Architrave & Parapet with Arabic Calligraphy
  // --------------------------------------------------------------------------
  const friezeLength = 19.6;
  const friezeHeight = 1.7;
  const friezeDepth = 1.6;
  const friezeY = 8.6;

  // Main beam spanning across all 4 arches
  const friezeGeo = new THREE.BoxGeometry(friezeLength, friezeHeight, friezeDepth);
  friezeGeo.translate(0, friezeY, 0);
  const friezeMesh = new THREE.Mesh(friezeGeo, stoneMat);
  friezeMesh.castShadow = true;
  gateRig.add(friezeMesh);

  // Decorative stepped cornice on top
  const corniceGeo = new THREE.BoxGeometry(friezeLength + 0.8, 0.45, friezeDepth + 0.6);
  corniceGeo.translate(0, friezeY + friezeHeight / 2 + 0.22, 0);
  gateRig.add(new THREE.Mesh(corniceGeo, basePlinthMat));

  // Central stepped pediment / crown
  const pedimentGeo = new THREE.BoxGeometry(10.5, 0.85, friezeDepth + 0.2);
  pedimentGeo.translate(0, friezeY + friezeHeight / 2 + 0.85, 0);
  gateRig.add(new THREE.Mesh(pedimentGeo, stoneMat));

  // Golden Arabic Calligraphy Display Banner (Facing Highway / Exterior: +Z in local space)
  const calligraphyTexture = createCalligraphyTexture();
  const calligraphyMat = calligraphyTexture
    ? new THREE.MeshStandardMaterial({
        map: calligraphyTexture,
        roughness: 0.35,
        metalness: 0.6,
      })
    : goldTrimMat;

  const calligraphyPlaneGeo = new THREE.PlaneGeometry(12.8, 1.35);
  // Exterior side (+Z)
  const calligraphyExterior = new THREE.Mesh(calligraphyPlaneGeo, calligraphyMat);
  calligraphyExterior.position.set(0, friezeY, friezeDepth / 2 + 0.02);
  gateRig.add(calligraphyExterior);

  // Interior side (-Z)
  const calligraphyInterior = new THREE.Mesh(calligraphyPlaneGeo, calligraphyMat);
  calligraphyInterior.position.set(0, friezeY, -friezeDepth / 2 - 0.02);
  calligraphyInterior.rotation.y = Math.PI;
  gateRig.add(calligraphyInterior);

  // --------------------------------------------------------------------------
  // 4. Central Raised Planter Island with University Crest Monument
  // --------------------------------------------------------------------------
  const islandGroup = new THREE.Group();
  islandGroup.position.set(0, 0, 1.2); // Positioned between the two vehicular archways

  // Brick circular planter (radius: 2.1m, height: 0.55m)
  const planterRadius = 2.1;
  const planterHeight = 0.55;
  const planterGeo = new THREE.CylinderGeometry(planterRadius, planterRadius + 0.1, planterHeight, 24);
  planterGeo.translate(0, planterHeight / 2, 0);
  islandGroup.add(new THREE.Mesh(planterGeo, brickMat));

  // White stone top coping rim
  const rimGeo = new THREE.TorusGeometry(planterRadius, 0.12, 8, 24);
  rimGeo.rotateX(Math.PI / 2);
  rimGeo.translate(0, planterHeight + 0.06, 0);
  islandGroup.add(new THREE.Mesh(rimGeo, curbWhiteMat));

  // Top soil and flowers inside planter
  const soilGeo = new THREE.CylinderGeometry(planterRadius - 0.15, planterRadius - 0.15, 0.1, 20);
  soilGeo.translate(0, planterHeight, 0);
  islandGroup.add(new THREE.Mesh(soilGeo, grassMat));

  // Colorful shrub clusters inside planter
  const shrubColors = [0xe63920, 0xf5a623, 0x2e7d32, 0xffd166];
  for (let s = 0; s < 8; s++) {
    const sAngle = (s / 8) * Math.PI * 2;
    const sRad = 1.3;
    const shrubGeo = new THREE.DodecahedronGeometry(0.38, 0);
    const shrubMat = new THREE.MeshStandardMaterial({ color: shrubColors[s % shrubColors.length], roughness: 0.8 });
    const shrub = new THREE.Mesh(shrubGeo, shrubMat);
    shrub.position.set(Math.cos(sAngle) * sRad, planterHeight + 0.25, Math.sin(sAngle) * sRad);
    shrub.castShadow = true;
    islandGroup.add(shrub);
  }

  // Central Islamic University Crest Stele / Pylon
  const pylonGeo = new THREE.BoxGeometry(1.6, 1.8, 0.35);
  pylonGeo.translate(0, planterHeight + 0.9, 0);
  const pylonMesh = new THREE.Mesh(pylonGeo, stoneMat);
  pylonMesh.castShadow = true;
  islandGroup.add(pylonMesh);

  // Crest plaque texture
  const crestTexture = createCrestTexture();
  if (crestTexture) {
    const crestMat = new THREE.MeshStandardMaterial({ map: crestTexture, roughness: 0.4 });
    const crestPlaneGeo = new THREE.PlaneGeometry(1.4, 1.4);

    // Exterior face (+Z)
    const crestExterior = new THREE.Mesh(crestPlaneGeo, crestMat);
    crestExterior.position.set(0, planterHeight + 0.9, 0.19);
    islandGroup.add(crestExterior);

    // Interior face (-Z)
    const crestInterior = new THREE.Mesh(crestPlaneGeo, crestMat);
    crestInterior.position.set(0, planterHeight + 0.9, -0.19);
    crestInterior.rotation.y = Math.PI;
    islandGroup.add(crestInterior);
  }

  gateRig.add(islandGroup);

  // Collider for the central island
  const islandWorldP = new THREE.Vector3(0, planterHeight / 2, 1.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), gateYaw).add(gateCenter);
  const islandCollider = new THREE.Mesh(new THREE.CylinderGeometry(planterRadius, planterRadius, planterHeight + 1.8, 12), new THREE.MeshBasicMaterial());
  islandCollider.position.copy(islandWorldP);
  islandCollider.name = 'main-gate-central-island';
  collisionGroup.add(islandCollider);

  obstacles.push({
    id: 'main-gate-central-island',
    kind: 'gate-island',
    x: islandWorldP.x,
    z: islandWorldP.z,
    radius: planterRadius,
    height: planterHeight + 1.8,
  });

  // --------------------------------------------------------------------------
  // 5. Wrought-Iron Open Gates (Left & Right Vehicular Portals)
  // --------------------------------------------------------------------------
  const makeGateLeaf = (width, height) => {
    const leaf = new THREE.Group();
    const frameGeo = new THREE.BoxGeometry(width, height, 0.08);
    frameGeo.translate(width / 2, height / 2, 0);
    leaf.add(new THREE.Mesh(frameGeo, ironMat));

    // Vertical bars
    const barCount = Math.floor(width / 0.22);
    for (let b = 1; b < barCount; b++) {
      const barGeo = new THREE.CylinderGeometry(0.02, 0.02, height, 6);
      barGeo.translate(b * 0.22, height / 2, 0);
      leaf.add(new THREE.Mesh(barGeo, ironMat));

      // Golden spearhead finial
      const spearGeo = new THREE.ConeGeometry(0.045, 0.18, 4);
      spearGeo.translate(b * 0.22, height + 0.09, 0);
      leaf.add(new THREE.Mesh(spearGeo, goldTrimMat));
    }
    return leaf;
  };

  // Open gate leaves swung into campus (-Z in local gate space)
  const leftGate = makeGateLeaf(2.1, 3.8);
  leftGate.position.set(-4.8, 0, -0.7);
  leftGate.rotation.y = -Math.PI * 0.42; // Folded back against wall
  gateRig.add(leftGate);

  const rightGate = makeGateLeaf(2.1, 3.8);
  rightGate.position.set(4.8, 0, -0.7);
  rightGate.rotation.y = Math.PI * 0.42;
  gateRig.add(rightGate);

  // --------------------------------------------------------------------------
  // 6. Perimeter Boundary Walls Extending Left & Right
  // --------------------------------------------------------------------------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xded8c9, roughness: 0.85 });
  const wallHeight = 2.4;
  const wallSegments = [
    { x1: -9.5, x2: -35.0 }, // Left boundary wall
    { x1: 9.5,  x2: 35.0 },  // Right boundary wall
  ];

  for (const seg of wallSegments) {
    const wLen = Math.abs(seg.x2 - seg.x1);
    const midX = (seg.x1 + seg.x2) / 2;

    const wallGeo = new THREE.BoxGeometry(wLen, wallHeight, 0.45);
    wallGeo.translate(midX, wallHeight / 2, 0);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = true;
    gateRig.add(wallMesh);

    // Wall top coping
    const copingGeo = new THREE.BoxGeometry(wLen + 0.1, 0.18, 0.6);
    copingGeo.translate(midX, wallHeight + 0.09, 0);
    gateRig.add(new THREE.Mesh(copingGeo, stoneMat));

    // Wall colliders in world space
    const wallWorldP = new THREE.Vector3(midX, wallHeight / 2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), gateYaw).add(gateCenter);
    const wallCollider = new THREE.Mesh(new THREE.BoxGeometry(wLen, wallHeight, 0.6), new THREE.MeshBasicMaterial());
    wallCollider.position.copy(wallWorldP);
    wallCollider.rotation.y = gateYaw;
    wallCollider.name = `boundary-wall-${seg.x1 < 0 ? 'left' : 'right'}`;
    collisionGroup.add(wallCollider);
  }

  // --------------------------------------------------------------------------
  // 7. Landscaping: Blooming Red Krishnachura & Royal Palm Trees
  // --------------------------------------------------------------------------
  // Overhanging Krishnachura trees on gate shoulders
  const krishnachura1 = createKrishnachuraTree(-13.5, -2.5, 1.15);
  gateRig.add(krishnachura1);

  const krishnachura2 = createKrishnachuraTree(14.0, -2.0, 1.1);
  gateRig.add(krishnachura2);

  // Royal Palms lining the highway approach
  const palmCoords = [
    { x: -11.5, z: 8.5 },
    { x: -14.0, z: 18.0 },
    { x: 11.5,  z: 8.5 },
    { x: 14.0,  z: 18.0 },
  ];

  for (const p of palmCoords) {
    const palm = createRoyalPalm(p.x, p.z, 9.5);
    gateRig.add(palm);
  }

  // --------------------------------------------------------------------------
  // 8. Exterior Highway Approach Road & Striped Curbs
  // --------------------------------------------------------------------------
  // Road connecting Highway node (338.00, -87.87) to Gate Entrance (304.91, -64.49)
  const approachLength = 40.0;
  const approachWidth = 14.0;
  const roadGeo = new THREE.PlaneGeometry(approachWidth, approachLength);
  roadGeo.rotateX(-Math.PI / 2);
  roadGeo.translate(0, 0.02, approachLength / 2); // Extends forward (+Z) toward highway

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  gateRig.add(roadMesh);

  // Black & White striped curbs along approach edges
  const curbLength = approachLength;
  const curbStep = 2.0;
  for (let c = 0; c < curbLength; c += curbStep) {
    const isWhite = Math.floor(c / curbStep) % 2 === 0;
    const cMat = isWhite ? curbWhiteMat : curbBlackMat;

    // Left curb
    const lCurbGeo = new THREE.BoxGeometry(0.35, 0.22, curbStep);
    lCurbGeo.translate(-approachWidth / 2 - 0.18, 0.11, c + curbStep / 2);
    gateRig.add(new THREE.Mesh(lCurbGeo, cMat));

    // Right curb
    const rCurbGeo = new THREE.BoxGeometry(0.35, 0.22, curbStep);
    rCurbGeo.translate(approachWidth / 2 + 0.18, 0.11, c + curbStep / 2);
    gateRig.add(new THREE.Mesh(rCurbGeo, cMat));
  }

  // Center dashed road markings on highway approach
  for (let m = 3; m < approachLength - 2; m += 4.5) {
    const markGeo = new THREE.PlaneGeometry(0.2, 2.5);
    markGeo.rotateX(-Math.PI / 2);
    markGeo.translate(0, 0.03, m);
    const markMesh = new THREE.Mesh(markGeo, curbWhiteMat);
    gateRig.add(markMesh);
  }

  collisionGroup.updateMatrixWorld(true);

  return {
    group,
    collisionGroup,
    obstacles,
    config: MAIN_GATE_CONFIG,
    dispose() {
      group.traverse(o => {
        o.geometry?.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      collisionGroup.traverse(o => o.geometry?.dispose());
      group.clear();
      collisionGroup.clear();
    },
  };
}
