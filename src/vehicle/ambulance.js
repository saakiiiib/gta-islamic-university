import * as THREE from 'three';
import { localToWorld, worldToLocal, rectangleFootprint } from '../navigation/campusQueries.js';
import { buildVehicleGraph, shortestVehiclePath } from './routes.js';
import { hornAudio } from '../audio/horn.js';

export const AMBULANCE_CONFIG = Object.freeze({
  maxSpeed: 24.0,
  reverseSpeed: 4.5,
  acceleration: 6.0,
  braking: 8.5,
  wheelbase: 3.2,
  maxSteer: 0.46,
  wheelRadius: 0.44,
  halfWidth: 1.1,
  front: 2.3,
  rear: 2.7,
});

export const MEDICAL_CENTRE_BAY = Object.freeze({
  x: -206.0,
  y: 0.0,
  z: -172.0,
  yaw: -1.25,
});

/** Create side decal with Red Crescent & IU Medical Centre inscription */
function createAmbulanceDecal() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Reflective emergency red stripe
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(0, 36, canvas.width, 56);

    // Red Cross / Crescent Emblem
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('✚ AMBULANCE', 24, 64);

    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#d32f2f';
    ctx.fillText('IU MEDICAL CENTRE · কুষ্টিয়া', 24, 110);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/**
 * Builds the 3D model for the Islamic University Emergency Ambulance.
 */
export function createAmbulanceModel() {
  const group = new THREE.Group();
  group.name = 'islamic-university-ambulance';

  // Materials
  const whitePaint = new THREE.MeshStandardMaterial({
    color: 0xfcfcfc,
    roughness: 0.35,
    metalness: 0.15,
  });

  const redTrim = new THREE.MeshStandardMaterial({
    color: 0xd32f2f,
    roughness: 0.4,
  });

  const darkTrim = new THREE.MeshStandardMaterial({
    color: 0x1e2022,
    roughness: 0.85,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1b2832,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.85,
  });

  const redBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xff1111,
    roughness: 0.2,
    emissive: 0xff0000,
    emissiveIntensity: 0.0,
  });

  const blueBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x1166ff,
    roughness: 0.2,
    emissive: 0x0044ff,
    emissiveIntensity: 0.0,
  });

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.3, metalness: 0.8 });

  const body = new THREE.Group();
  body.name = 'ambulance-body';
  group.add(body);

  const L = 5.2, W = 2.15, H = 2.35;

  // 1. Lower Chassis & Main Cabin
  const mainGeo = new THREE.BoxGeometry(W, 1.45, L);
  mainGeo.translate(0, 1.1, 0);
  const mainMesh = new THREE.Mesh(mainGeo, whitePaint);
  mainMesh.castShadow = mainMesh.receiveShadow = true;
  body.add(mainMesh);

  // Red reflective waist stripe
  const stripeGeo = new THREE.BoxGeometry(W + 0.02, 0.26, L + 0.01);
  stripeGeo.translate(0, 1.05, 0);
  body.add(new THREE.Mesh(stripeGeo, redTrim));

  // High Roof Extension (Patient Compartment)
  const roofGeo = new THREE.BoxGeometry(W - 0.1, 0.55, L - 1.2);
  roofGeo.translate(0, 2.05, 0.4);
  body.add(new THREE.Mesh(roofGeo, whitePaint));

  // Windshield (Front: -Z)
  const windshieldGeo = new THREE.BoxGeometry(W - 0.25, 0.65, 0.1);
  windshieldGeo.translate(0, 1.45, -L / 2 - 0.02);
  body.add(new THREE.Mesh(windshieldGeo, glassMat));

  // Side Medical Decals
  const decalTex = createAmbulanceDecal();
  if (decalTex) {
    const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, roughness: 0.35 });
    const decalGeo = new THREE.PlaneGeometry(3.2, 0.8);

    // Left side
    const decalL = new THREE.Mesh(decalGeo, decalMat);
    decalL.position.set(-W / 2 - 0.02, 1.1, 0.3);
    decalL.rotation.y = -Math.PI / 2;
    body.add(decalL);

    // Right side
    const decalR = new THREE.Mesh(decalGeo, decalMat);
    decalR.position.set(W / 2 + 0.02, 1.1, 0.3);
    decalR.rotation.y = Math.PI / 2;
    body.add(decalR);
  }

  // 2. Emergency Lightbar on Roof
  const lightbarGroup = new THREE.Group();
  lightbarGroup.position.set(0, 2.4, -0.6);

  // Base bracket
  const bracketGeo = new THREE.BoxGeometry(1.4, 0.08, 0.25);
  lightbarGroup.add(new THREE.Mesh(bracketGeo, darkTrim));

  // Red strobe (Left)
  const redBeaconGeo = new THREE.BoxGeometry(0.55, 0.18, 0.22);
  redBeaconGeo.translate(-0.35, 0.11, 0);
  const redBeacon = new THREE.Mesh(redBeaconGeo, redBeaconMat);
  lightbarGroup.add(redBeacon);

  // Blue strobe (Right)
  const blueBeaconGeo = new THREE.BoxGeometry(0.55, 0.18, 0.22);
  blueBeaconGeo.translate(0.35, 0.11, 0);
  const blueBeacon = new THREE.Mesh(blueBeaconGeo, blueBeaconMat);
  lightbarGroup.add(blueBeacon);

  body.add(lightbarGroup);

  // Front Grille & Bumpers
  const grilleGeo = new THREE.BoxGeometry(1.4, 0.45, 0.12);
  grilleGeo.translate(0, 0.7, -L / 2 - 0.04);
  body.add(new THREE.Mesh(grilleGeo, darkTrim));

  const fdBumperGeo = new THREE.BoxGeometry(W + 0.08, 0.32, 0.28);
  fdBumperGeo.translate(0, 0.42, -L / 2 - 0.1);
  body.add(new THREE.Mesh(fdBumperGeo, darkTrim));

  // 3. Wheels
  const steering = new THREE.Group();
  steering.name = 'ambulance-steering';
  group.add(steering);

  const wheels = [];
  const makeWheel = () => {
    const wGroup = new THREE.Group();
    const tireGeo = new THREE.CylinderGeometry(AMBULANCE_CONFIG.wheelRadius, AMBULANCE_CONFIG.wheelRadius, 0.28, 14);
    tireGeo.rotateZ(Math.PI / 2);
    wGroup.add(new THREE.Mesh(tireGeo, wheelMat));

    const rimGeo = new THREE.CylinderGeometry(AMBULANCE_CONFIG.wheelRadius * 0.6, AMBULANCE_CONFIG.wheelRadius * 0.6, 0.3, 10);
    rimGeo.rotateZ(Math.PI / 2);
    wGroup.add(new THREE.Mesh(rimGeo, rimMat));
    return wGroup;
  };

  // Front steering wheels (Z: -1.5)
  for (const sign of [-1, 1]) {
    const wheel = makeWheel();
    wheel.position.set(sign * (W / 2 - 0.08), AMBULANCE_CONFIG.wheelRadius, -1.5);
    steering.add(wheel);
    wheels.push(wheel);
  }

  // Rear wheels (Z: 1.5)
  for (const sign of [-1, 1]) {
    const wheel = makeWheel();
    wheel.position.set(sign * (W / 2 - 0.08), AMBULANCE_CONFIG.wheelRadius, 1.5);
    group.add(wheel);
    wheels.push(wheel);
  }

  return {
    group,
    body,
    steering,
    wheels,
    redBeacon,
    blueBeacon,
    dispose() {
      group.traverse(o => {
        o.geometry?.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      group.clear();
    },
  };
}

/**
 * Autonomous Emergency Ambulance Controller.
 * Stationed at Islamic University Medical Centre.
 * Dispatches on critical injury, navigates along the road network, stabilizes victim, and returns.
 */
export class AmbulanceController {
  constructor(mapData, queries) {
    this.map = mapData;
    this.queries = queries;
    this.config = AMBULANCE_CONFIG;
    this.model = createAmbulanceModel();
    this.group = this.model.group;

    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.steering = 0;
    this.wheelAngle = 0;

    this.isAmbulance = true;
    this.id = 'iu-ambulance';
    this.name = 'IU Ambulance (অ্যাম্বুলেন্স)';
    this.state = 'idle'; // 'idle', 'dispatched', 'en_route', 'on_scene', 'treating', 'returning'

    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.treatmentTimer = 0;
    this.strobeTimer = 0;
    this.graph = buildVehicleGraph(mapData);
    this.maxDurability = 120;
    this.durability = this.maxDurability;
    this.impactStrength = 0;
    this.impactRoll = 0;
    this.impactAge = 0;

    this.spawn = { ...MEDICAL_CENTRE_BAY };
    this.reset();
  }

  reset() {
    this.position.set(this.spawn.x, this.queries ? this.queries.groundHeight(this.spawn.x, this.spawn.z) : 0, this.spawn.z);
    this.yaw = this.spawn.yaw;
    this.speed = this.steering = this.wheelAngle = 0;
    this.state = 'idle';
    this.target = null;
    this.path = [];
    this.pathIndex = 0;
    this.treatmentTimer = 0;
    this.strobeTimer = 0;
    this.durability = this.maxDurability;
    this.impactStrength = this.impactRoll = this.impactAge = 0;
    this.setBeacons(false);
    hornAudio.stopSiren();
    this.syncVisuals(0);
  }

  setBeacons(active) {
    if (!this.model.redBeacon || !this.model.blueBeacon) return;
    if (!active) {
      this.model.redBeacon.material.emissiveIntensity = 0.0;
      this.model.blueBeacon.material.emissiveIntensity = 0.0;
    }
  }

  /**
   * Dispatches the ambulance to an accident location.
   */
  dispatch(targetPoint, npcId) {
    if (this.state === 'treating') return false; // Already attending patient

    this.target = { x: targetPoint.x, z: targetPoint.z, npcId };
    this.state = 'en_route';
    this.treatmentTimer = 0;

    // Rapid emergency response:
    // If victim is distant (>70m, e.g. across campus or at Main Gate),
    // reposition to a road node ~40-65m from victim facing towards them
    // so the ambulance immediately rushes into view within 3-4 seconds.
    const currentDist = Math.hypot(this.position.x - targetPoint.x, this.position.z - targetPoint.z);
    if (currentDist > 70) {
      let bestPoint = null;
      let minScore = Infinity;
      if (this.graph?.nodes?.length) {
        for (let i = 0; i < this.graph.nodes.length; i++) {
          const pt = this.graph.nodes[i].point;
          const d = Math.hypot(pt[0] - targetPoint.x, pt[1] - targetPoint.z);
          if (d >= 35 && d <= 75) {
            const score = Math.abs(d - 52);
            if (score < minScore) {
              minScore = score;
              bestPoint = pt;
            }
          }
        }
      }
      if (bestPoint) {
        const y = this.queries ? this.queries.groundHeight(bestPoint[0], bestPoint[1]) : 0;
        this.position.set(bestPoint[0], y, bestPoint[1]);
        this.yaw = Math.atan2(-(targetPoint.x - bestPoint[0]), -(targetPoint.z - bestPoint[1]));
      }
      this.speed = 10.0;
    } else {
      this.speed = Math.max(this.speed, 2.0);
    }

    // Build route from current position to target
    this.buildRouteToTarget([targetPoint.x, targetPoint.z]);

    // Activate siren and emergency beacons
    hornAudio.startSiren();
    return true;
  }

  buildRouteToTarget(targetCoords) {
    if (!this.graph?.nodes?.length) {
      this.path = [targetCoords];
      this.pathIndex = 0;
      return;
    }

    // Find nearest graph node to ambulance and target
    let startNode = 0, startDist = Infinity;
    let endNode = 0, endDist = Infinity;

    for (let i = 0; i < this.graph.nodes.length; i++) {
      const p = this.graph.nodes[i].point;
      const dStart = Math.hypot(p[0] - this.position.x, p[1] - this.position.z);
      if (dStart < startDist) { startDist = dStart; startNode = i; }

      const dEnd = Math.hypot(p[0] - targetCoords[0], p[1] - targetCoords[1]);
      if (dEnd < endDist) { endDist = dEnd; endNode = i; }
    }

    const route = shortestVehiclePath(this.graph, startNode, endNode);
    if (route && route.nodes.length) {
      this.path = route.nodes.map(n => this.graph.nodes[n].point);
      this.path.push(targetCoords);
    } else {
      this.path = [[this.position.x, this.position.z], targetCoords];
    }
    this.pathIndex = 0;
  }

  update(dt, { crowd } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return {};

    let event = null;
    const isEmergency = this.state === 'en_route' || this.state === 'returning';

    // Strobe lightbar flashing animation during emergency
    if (isEmergency) {
      this.strobeTimer += dt * 10;
      const flash = Math.sin(this.strobeTimer) > 0;
      if (this.model.redBeacon) this.model.redBeacon.material.emissiveIntensity = flash ? 1.4 : 0.1;
      if (this.model.blueBeacon) this.model.blueBeacon.material.emissiveIntensity = !flash ? 1.4 : 0.1;
    } else {
      this.setBeacons(false);
    }

    if (this.state === 'en_route') {
      // Emergency vehicle scatter ahead
      crowd?.honkAt?.(this.position, this.yaw, 20, Math.PI * 0.7);

      const reached = this.driveTowardsPath(dt);
      const distToVictim = this.target ? Math.hypot(this.position.x - this.target.x, this.position.z - this.target.z) : Infinity;

      if (distToVictim < 5.8 || reached) {
        // Arrived at accident scene
        this.state = 'treating';
        this.speed = 0;
        this.treatmentTimer = 2.4; // 2.4s medical stabilization
        hornAudio.stopSiren();
        event = { type: 'ambulanceArrived', npcId: this.target?.npcId };
      }
    } else if (this.state === 'treating') {
      this.speed = 0;
      hornAudio.stopSiren();
      this.treatmentTimer -= dt;
      if (this.treatmentTimer <= 0) {
        // Stabilize student
        if (this.target?.npcId != null) {
          crowd?.healStudent?.(this.target.npcId);
        }
        event = { type: 'patientStabilized', npcId: this.target?.npcId };

        // Return to Medical Centre
        this.state = 'returning';
        this.target = null;
        hornAudio.stopSiren();
        this.buildRouteToTarget([this.spawn.x, this.spawn.z]);
      }
    } else if (this.state === 'returning') {
      hornAudio.stopSiren();
      const reached = this.driveTowardsPath(dt);
      const distToBay = Math.hypot(this.position.x - this.spawn.x, this.position.z - this.spawn.z);
      if (distToBay < 2.5 || reached) {
        this.state = 'idle';
        this.speed = 0;
        this.yaw = this.spawn.yaw;
        hornAudio.stopSiren();
        event = { type: 'ambulanceReturned' };
      }
    }

    this.syncVisuals(dt);
    return event;
  }

  driveTowardsPath(dt) {
    if (!this.path || this.pathIndex >= this.path.length) return true;

    const waypoint = this.path[this.pathIndex];
    const dx = waypoint[0] - this.position.x;
    const dz = waypoint[1] - this.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 2.2) {
      this.pathIndex++;
      if (this.pathIndex >= this.path.length) return true;
    }

    // Target heading towards next waypoint
    const targetYaw = Math.atan2(-dx, -dz);
    let deltaAngle = THREE.MathUtils.euclideanModulo(targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;

    this.steering = THREE.MathUtils.clamp(deltaAngle * 1.6, -this.config.maxSteer, this.config.maxSteer);
    this.yaw += this.steering * (this.speed / this.config.wheelbase) * dt;

    // Smooth emergency acceleration
    const cruise = this.state === 'en_route' ? this.config.maxSpeed : this.config.maxSpeed * 0.75;
    this.speed = THREE.MathUtils.lerp(this.speed, cruise, 1 - Math.exp(-2.5 * dt));

    this.position.x -= Math.sin(this.yaw) * this.speed * dt;
    this.position.z -= Math.cos(this.yaw) * this.speed * dt;

    if (this.queries) {
      this.position.y = this.queries.groundHeight(this.position.x, this.position.z);
    }
    this.wheelAngle -= (this.speed * dt) / this.config.wheelRadius;

    return false;
  }

  get disabled() {
    return this.durability <= 0;
  }

  applyDamage(amount, { speed = 0, normal = { x: 0, z: 0 } } = {}) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.durability = Math.max(0, this.durability - amount);
    this.impactAge = 0;
    this.impactStrength = Math.min(0.2, Math.abs(speed) * 0.03);
    const local = worldToLocal(this.position.x + normal.x, this.position.z + normal.z, this.position, this.yaw);
    this.impactRoll = Math.sign(local[0]) * this.impactStrength * 0.5;
    if (this.disabled) {
      this.speed = 0;
      hornAudio.stopSiren();
    }
  }

  distanceFrom(x, z) {
    const [u, v] = worldToLocal(x, z, this.position, this.yaw);
    const cfg = this.config;
    return Math.hypot(Math.max(0, Math.abs(u) - cfg.halfWidth), Math.max(0, -cfg.front - v, v - cfg.rear));
  }

  get footprint() {
    return rectangleFootprint(this.position, this.yaw, this.config);
  }

  syncVisuals(dt) {
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);

    this.impactAge += Math.max(0, Math.min(dt, 0.1));
    const rebound = Math.sin(this.impactAge * 20) * Math.exp(-this.impactAge * 4.5);
    if (this.model.body) {
      this.model.body.rotation.z = this.impactRoll * rebound;
      this.model.body.position.y = rebound * this.impactStrength * 0.3;
    }

    if (this.model.steering) {
      this.model.steering.rotation.y = this.steering;
    }
    for (const wheel of this.model.wheels) {
      wheel.rotation.x = this.wheelAngle;
    }
  }

  createParkedCollider() {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.config.halfWidth * 2, 2.4, this.config.front + this.config.rear),
      new THREE.MeshBasicMaterial()
    );
    mesh.position.set(0, 1.2, (-this.config.front + this.config.rear) / 2);
    group.add(mesh);
    group.position.copy(this.position);
    group.rotation.y = this.yaw;
    group.updateMatrixWorld(true);
    return group;
  }

  dispose() {
    this.setBeacons(false);
    hornAudio.stopSiren();
    this.model.dispose();
  }
}
