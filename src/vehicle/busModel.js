import * as THREE from 'three';
import { localToWorld, worldToLocal, rectangleFootprint } from '../navigation/campusQueries.js';
import { pedestrianContact, touchesPedestrian, vansOverlap } from './contacts.js';

export const BUS_CONFIG = Object.freeze({
  maxSpeed: 13.5,            // ~48.6 km/h top speed
  reverseSpeed: 3.2,
  acceleration: 2.1,          // Heavy bus torque
  reverseAcceleration: 1.4,
  braking: 5.8,              // Responsive pneumatic brakes
  rolling: 0.22,
  drag: 0.024,
  wheelbase: 5.4,
  maxSteer: 0.42,
  wheelRadius: 0.54,
  halfWidth: 1.35,           // Bus width: 2.7m
  front: 3.6,                // Bus length: 9.8m
  rear: 4.6,
});

const approach = (value, target, delta) =>
  value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

/** Create illuminated destination marquee texture */
function createDestinationTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Glowing orange/amber LED matrix sign
    ctx.fillStyle = '#ffaa11';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISLAMIC UNIVERSITY', canvas.width / 2, 42);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ff7700';
    ctx.fillText('কুষ্টিয়া · লাল বাস', canvas.width / 2, 90);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/** Create university crest decal texture for bus flanks */
function createBusSideDecal() {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#f5e6ca'; // Cream banner background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f522e'; // Dark Islamic green
    ctx.font = 'bold 36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ইসলামী বিশ্ববিদ্যালয় · কুষ্টিয়া', canvas.width / 2, 42);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#9b1828';
    ctx.fillText('ISLAMIC UNIVERSITY · BANGLADESH', canvas.width / 2, 88);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch {
    return null;
  }
}

/**
 * Builds the 3D model for the iconic Red Double Decker Bus ("লাল বাস").
 */
export function createDoubleDeckerBusModel() {
  const group = new THREE.Group();
  group.name = 'islamic-university-red-bus';

  // Materials
  const busRed = new THREE.MeshStandardMaterial({
    color: 0xb51829, // Authentic BRTC crimson red
    roughness: 0.45,
    metalness: 0.15,
  });

  const creamStripe = new THREE.MeshStandardMaterial({
    color: 0xf5e8d0, // Cream accent stripe
    roughness: 0.5,
  });

  const darkRubber = new THREE.MeshStandardMaterial({
    color: 0x1b1c1e,
    roughness: 0.9,
    metalness: 0.05,
  });

  const chromeTrim = new THREE.MeshStandardMaterial({
    color: 0xdedede,
    roughness: 0.2,
    metalness: 0.85,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x223545, // Tinted glass
    roughness: 0.1,
    metalness: 0.7,
    transparent: true,
    opacity: 0.78,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfffae6,
    roughness: 0.2,
    emissive: 0xfff0aa,
    emissiveIntensity: 0.6,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xcc1111,
    roughness: 0.3,
    emissive: 0xaa0000,
    emissiveIntensity: 0.5,
  });

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.3, metalness: 0.7 });

  const body = new THREE.Group();
  body.name = 'bus-body';
  group.add(body);

  const L = 9.8, W = 2.65, H = 4.25;

  // 1. Lower Deck (y: 0.5 to 2.3)
  const lowerGeo = new THREE.BoxGeometry(W, 1.8, L);
  lowerGeo.translate(0, 1.4, -0.5);
  const lowerMesh = new THREE.Mesh(lowerGeo, busRed);
  lowerMesh.castShadow = lowerMesh.receiveShadow = true;
  body.add(lowerMesh);

  // Cream belt dividing line between decks (y: 2.2 to 2.45)
  const beltGeo = new THREE.BoxGeometry(W + 0.04, 0.25, L + 0.02);
  beltGeo.translate(0, 2.32, -0.5);
  const beltMesh = new THREE.Mesh(beltGeo, creamStripe);
  body.add(beltMesh);

  // University banner decals on sides of belt
  const decalTex = createBusSideDecal();
  if (decalTex) {
    const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, roughness: 0.4 });
    const decalPlane = new THREE.PlaneGeometry(5.2, 0.24);

    // Left side
    const decalL = new THREE.Mesh(decalPlane, decalMat);
    decalL.position.set(-W / 2 - 0.03, 2.32, -0.5);
    decalL.rotation.y = -Math.PI / 2;
    body.add(decalL);

    // Right side
    const decalR = new THREE.Mesh(decalPlane, decalMat);
    decalR.position.set(W / 2 + 0.03, 2.32, -0.5);
    decalR.rotation.y = Math.PI / 2;
    body.add(decalR);
  }

  // 2. Upper Deck (y: 2.45 to 4.25)
  const upperGeo = new THREE.BoxGeometry(W, 1.8, L);
  upperGeo.translate(0, 3.35, -0.5);
  const upperMesh = new THREE.Mesh(upperGeo, busRed);
  upperMesh.castShadow = upperMesh.receiveShadow = true;
  body.add(upperMesh);

  // Curved roof cap
  const roofGeo = new THREE.BoxGeometry(W - 0.1, 0.25, L - 0.2);
  roofGeo.translate(0, 4.35, -0.5);
  body.add(new THREE.Mesh(roofGeo, creamStripe));

  // AC/Ventilation rooftop pods
  for (const z of [-1.5, 0.8]) {
    const podGeo = new THREE.BoxGeometry(1.6, 0.28, 1.4);
    podGeo.translate(0, 4.58, z);
    body.add(new THREE.Mesh(podGeo, chromeTrim));
  }

  // 3. Glazing & Windows
  // Lower Deck Windshield (front: -z)
  const frontWindshieldGeo = new THREE.BoxGeometry(W - 0.3, 0.95, 0.1);
  frontWindshieldGeo.translate(0, 1.55, -L / 2 - 0.52);
  body.add(new THREE.Mesh(frontWindshieldGeo, glassMat));

  // Upper Deck Panoramic Windshield
  const upperWindshieldGeo = new THREE.BoxGeometry(W - 0.3, 1.15, 0.1);
  upperWindshieldGeo.translate(0, 3.4, -L / 2 - 0.52);
  body.add(new THREE.Mesh(upperWindshieldGeo, glassMat));

  // Side Passenger Windows (Lower Deck)
  const sideWinLowerGeo = new THREE.BoxGeometry(W + 0.05, 0.75, L - 2.4);
  sideWinLowerGeo.translate(0, 1.6, 0.1);
  body.add(new THREE.Mesh(sideWinLowerGeo, glassMat));

  // Side Passenger Windows (Upper Deck)
  const sideWinUpperGeo = new THREE.BoxGeometry(W + 0.05, 0.95, L - 1.2);
  sideWinUpperGeo.translate(0, 3.4, -0.3);
  body.add(new THREE.Mesh(sideWinUpperGeo, glassMat));

  // Destination Board Lightbox (Front top: -z)
  const destTex = createDestinationTexture();
  const destMat = destTex
    ? new THREE.MeshStandardMaterial({ map: destTex, roughness: 0.3, emissive: 0x442200, emissiveIntensity: 0.4 })
    : darkRubber;
  const destGeo = new THREE.PlaneGeometry(1.8, 0.45);
  const destMesh = new THREE.Mesh(destGeo, destMat);
  destMesh.position.set(0, 4.12, -L / 2 - 0.53);
  destMesh.rotation.y = Math.PI;
  body.add(destMesh);

  // 4. Front Details: Grille, Headlights, Bumper
  const grilleGeo = new THREE.BoxGeometry(1.6, 0.55, 0.1);
  grilleGeo.translate(0, 0.85, -L / 2 - 0.52);
  body.add(new THREE.Mesh(grilleGeo, darkRubber));

  // Headlights
  for (const sign of [-1, 1]) {
    const lightGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12);
    lightGeo.rotateX(Math.PI / 2);
    const light = new THREE.Mesh(lightGeo, headlightMat);
    light.position.set(sign * 0.95, 0.85, -L / 2 - 0.53);
    body.add(light);
  }

  // Front Bumper
  const fdBumperGeo = new THREE.BoxGeometry(W + 0.1, 0.35, 0.35);
  fdBumperGeo.translate(0, 0.45, -L / 2 - 0.55);
  body.add(new THREE.Mesh(fdBumperGeo, darkRubber));

  // Rear Bumper
  const rdBumperGeo = new THREE.BoxGeometry(W + 0.1, 0.35, 0.35);
  rdBumperGeo.translate(0, 0.45, L / 2 - 0.45);
  body.add(new THREE.Mesh(rdBumperGeo, darkRubber));

  // Taillights
  for (const sign of [-1, 1]) {
    const tailGeo = new THREE.BoxGeometry(0.2, 0.45, 0.08);
    const tail = new THREE.Mesh(tailGeo, taillightMat);
    tail.position.set(sign * 1.05, 1.1, L / 2 - 0.46);
    body.add(tail);
  }

  // 5. Wheels & Steering Axles
  const steering = new THREE.Group();
  steering.name = 'bus-steering';
  group.add(steering);

  const wheels = [];
  const rearWheels = [];

  const makeWheel = (isFront = false) => {
    const wGroup = new THREE.Group();
    // Tire
    const tireGeo = new THREE.CylinderGeometry(BUS_CONFIG.wheelRadius, BUS_CONFIG.wheelRadius, 0.34, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const tire = new THREE.Mesh(tireGeo, wheelMat);
    tire.castShadow = true;
    wGroup.add(tire);

    // Rim
    const rimGeo = new THREE.CylinderGeometry(BUS_CONFIG.wheelRadius * 0.58, BUS_CONFIG.wheelRadius * 0.58, 0.36, 12);
    rimGeo.rotateZ(Math.PI / 2);
    wGroup.add(new THREE.Mesh(rimGeo, rimMat));

    return wGroup;
  };

  // Front steering wheels (Z = -2.7)
  const frontZ = -2.7;
  for (const sign of [-1, 1]) {
    const wheel = makeWheel(true);
    wheel.position.set(sign * (W / 2 - 0.1), BUS_CONFIG.wheelRadius, frontZ);
    steering.add(wheel);
    wheels.push(wheel);
  }

  // Rear dual axle wheels (Z = 2.4 and Z = 3.6)
  for (const rz of [2.4, 3.6]) {
    for (const sign of [-1, 1]) {
      const wheel = makeWheel(false);
      wheel.position.set(sign * (W / 2 - 0.1), BUS_CONFIG.wheelRadius, rz);
      group.add(wheel);
      rearWheels.push(wheel);
      wheels.push(wheel);
    }
  }

  return {
    group,
    body,
    steering,
    wheels,
    rearWheels,
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
 * DoubleDeckerBus entity controller.
 * Handles physics simulation, driver controls, collision responses, and visual synchronization.
 */
export class DoubleDeckerBus {
  constructor({ queries, spawn, config = {} } = {}) {
    this.queries = queries;
    this.config = { ...BUS_CONFIG, ...config };
    this.model = createDoubleDeckerBusModel();
    this.group = this.model.group;

    this.position = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.steering = 0;
    this.wheelAngle = 0;
    this.acceleration = 0;
    this.visualLean = 0;
    this.visualPitch = 0;

    this.isBus = true;
    this.id = 'iu-red-bus';
    this.name = 'IU Red Bus (লাল বাস)';
    this.durability = 150;
    this.maxDurability = 150;
    this.occupied = false;
    this.autonomous = false;
    this.hitObstacle = false;
    this.yieldingToPedestrian = false;

    this.driveAcceleration = 0;
    this.impactAge = 0;
    this.impactStrength = 0;
    this.impactRoll = 0;

    this.spawn = { ...spawn };
    this.reset();
  }

  reset(spawn = this.spawn) {
    const y = this.queries ? this.queries.groundHeight(spawn.x ?? 0, spawn.z ?? 0) : 0;
    this.position.set(spawn.x ?? 0, y, spawn.z ?? 0);
    this.yaw = spawn.yaw ?? 0;
    this.speed = this.steering = this.wheelAngle = this.acceleration = this.visualLean = this.visualPitch = 0;
    this.driveAcceleration = this.impactAge = this.impactStrength = this.impactRoll = 0;
    this.durability = this.maxDurability;
    this.occupied = this.autonomous = this.hitObstacle = this.yieldingToPedestrian = false;
    this.syncVisuals(0);
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
    this.impactRoll = Math.sign(local[0]) * this.impactStrength * 0.6;
    if (this.disabled) this.speed = this.driveAcceleration = 0;
  }

  update(dt, input = {}, { emergencyBrake = false, pedestrians = [], vans = [], onImpact } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, 0.1);
    const ticks = Math.ceil(duration * 60);
    this.hitObstacle = this.yieldingToPedestrian = false;

    for (let i = 0; i < ticks; i++) {
      this.step(
        duration / ticks,
        this.occupied && !this.disabled ? input : {},
        emergencyBrake || this.disabled,
        pedestrians,
        vans,
        onImpact
      );
    }
  }

  step(dt, input, emergencyBrake, pedestrians, vans, onImpact) {
    const cfg = this.config;
    const before = this.speed;
    const brake = input.brake || input.jump || emergencyBrake;
    const force =
      input.forward && !input.back
        ? cfg.acceleration
        : input.back && !input.forward
        ? -cfg.reverseAcceleration
        : 0;

    this.driveAcceleration = THREE.MathUtils.lerp(this.driveAcceleration, force, 1 - Math.exp(-12 * dt));

    if (brake) {
      this.speed = approach(this.speed, 0, cfg.braking * dt);
    } else if (input.forward && !input.back) {
      this.speed =
        this.speed < -0.05
          ? approach(this.speed, 0, cfg.braking * dt)
          : Math.max(0, Math.min(cfg.maxSpeed, this.speed + Math.max(0, this.driveAcceleration) * dt));
    } else if (input.back && !input.forward) {
      this.speed =
        this.speed > 0.05
          ? approach(this.speed, 0, cfg.braking * dt)
          : Math.min(0, Math.max(-cfg.reverseSpeed, this.speed + Math.min(0, this.driveAcceleration) * dt));
    } else {
      this.speed = approach(this.speed, 0, (cfg.rolling + cfg.drag * this.speed * this.speed) * dt);
    }

    if (Math.abs(this.speed) < 0.01 && (!input.forward && !input.back || brake)) this.speed = 0;

    const steer = Number.isFinite(input.steer)
      ? THREE.MathUtils.clamp(input.steer, -1, 1)
      : Number(!!input.left) - Number(!!input.right);
    const steeringTarget = (steer * cfg.maxSteer) / (1 + Math.abs(this.speed) * 0.05);
    this.steering = approach(this.steering, steeringTarget, 1.4 * dt);

    const yawRate = (this.speed / cfg.wheelbase) * Math.tan(this.steering);
    const steps = Math.max(1, Math.ceil((Math.abs(this.speed) + Math.abs(yawRate) * 3.0) * (dt / 0.065)));
    const subDt = dt / steps;

    for (let i = 0; i < steps; i++) {
      const nextYaw = this.yaw + yawRate * subDt;
      const midYaw = (this.yaw + nextYaw) / 2;
      const candidate = {
        x: this.position.x - Math.sin(midYaw) * this.speed * subDt,
        z: this.position.z - Math.cos(midYaw) * this.speed * subDt,
        y: this.position.y,
      };

      const contacts = pedestrians.filter(p => touchesPedestrian(candidate, nextYaw, cfg, p));
      const other = vans.find(
        v => v !== this && Math.hypot(v.position.x - candidate.x, v.position.z - candidate.z) < 8 && vansOverlap(candidate, nextYaw, cfg, v)
      );
      const worldBlocked = this.queries ? !this.queries.rectangleClear(candidate, nextYaw, cfg) : false;

      if (worldBlocked || other || contacts.length) {
        const impactSpeed = Math.abs(this.speed);
        const forward = {
          x: -Math.sin(nextYaw) * Math.sign(this.speed || 1),
          z: -Math.cos(nextYaw) * Math.sign(this.speed || 1),
        };
        if (worldBlocked || other) {
          onImpact?.({ type: other ? 'vehicle' : 'static', van: this, other, speed: impactSpeed, normal: forward });
        } else {
          for (const pedestrian of contacts) {
            onImpact?.({
              type: 'pedestrian',
              van: this,
              pedestrian,
              speed: impactSpeed,
              normal: pedestrianContact(candidate, nextYaw, cfg, pedestrian) ?? forward,
            });
          }
        }
        this.speed = 0;
        this.hitObstacle = true;
        this.driveAcceleration = 0;
        break;
      }

      this.position.x = candidate.x;
      this.position.z = candidate.z;
      this.yaw = nextYaw;
      this.wheelAngle -= (this.speed * subDt) / cfg.wheelRadius;
    }

    this.acceleration = THREE.MathUtils.lerp(this.acceleration, (this.speed - before) / dt, 1 - Math.exp(-8 * dt));
    if (this.queries) this.position.y = this.queries.groundHeight(this.position.x, this.position.z);
  }

  syncVisuals(dt) {
    this.impactAge += Math.max(0, Math.min(dt, 0.1));
    const front = localToWorld(0, -this.config.front, this.position, this.yaw);
    const rear = localToWorld(0, this.config.rear, this.position, this.yaw);
    const frontY = this.queries ? this.queries.groundHeight(...front) : this.position.y;
    const rearY = this.queries ? this.queries.groundHeight(...rear) : this.position.y;
    this.position.y = (frontY + rearY) / 2;

    const rebound = Math.sin(this.impactAge * 18) * Math.exp(-this.impactAge * 4.5);
    const targetLean = THREE.MathUtils.clamp(
      this.speed * this.speed * Math.tan(this.steering) * 0.005 + this.impactRoll * rebound,
      -0.08,
      0.08
    );
    const targetPitch = THREE.MathUtils.clamp(
      Math.atan2(frontY - rearY, this.config.wheelbase) + this.acceleration * 0.008,
      -0.15,
      0.15
    );

    const blend = dt > 0 ? 1 - Math.exp(-8 * Math.min(dt, 0.1)) : 1;
    this.visualLean = THREE.MathUtils.lerp(this.visualLean, targetLean, blend);
    this.visualPitch = THREE.MathUtils.lerp(this.visualPitch, targetPitch, blend);

    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);

    this.model.body.rotation.set(
      THREE.MathUtils.clamp(this.visualPitch + rebound * this.impactStrength, -0.15, 0.15),
      0,
      this.visualLean
    );
    this.model.steering.rotation.y = this.steering;

    for (const wheel of this.model.wheels) {
      wheel.rotation.x = this.wheelAngle;
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

  createParkedCollider() {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    // Heavy bus box collider
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.config.halfWidth * 2, 4.2, this.config.front + this.config.rear),
      material
    );
    mesh.position.set(0, 2.1, (-this.config.front + this.config.rear) / 2);
    group.add(mesh);
    group.position.copy(this.position);
    group.rotation.y = this.yaw;
    group.updateMatrixWorld(true);
    return group;
  }

  dispose() {
    this.model.dispose();
  }
}
