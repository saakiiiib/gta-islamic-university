import { Vector3, MathUtils } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { PLAYER_CONFIG } from '../config.js';
import { CollisionWorld, isWaterBlocked } from './collision.js';
import { createStudent, createCharacterRig, animateStudent } from './character.js';
import { resolveVanCapsule } from './vanCollisions.js';

export function movementDirection(input = {}, cameraYaw = 0) {
  const analog = Number.isFinite(input.moveX) && Number.isFinite(input.moveZ);
  let x = analog ? input.moveX : Number(Boolean(input.right)) - Number(Boolean(input.left));
  let z = analog ? input.moveZ : Number(Boolean(input.back)) - Number(Boolean(input.forward));
  const length = Math.hypot(x, z);
  // Preserve joystick magnitude; clamp diagonals without increasing walking speed.
  if (length > 1) { x /= length; z /= length; }
  return new Vector3(x * Math.cos(cameraYaw) + z * Math.sin(cameraYaw), 0, -x * Math.sin(cameraYaw) + z * Math.cos(cameraYaw));
}

export class PlayerController {
  constructor({ collisionGroup, sceneryCollisionGroup, mapData, config = PLAYER_CONFIG, characterType = 'student' }) {
    this.characterType = characterType;
    this.config = { ...PLAYER_CONFIG, ...config };
    this.mapData = mapData ?? {};
    this.world = new CollisionWorld(collisionGroup);
    this.sceneryWorld = sceneryCollisionGroup ? new CollisionWorld(sceneryCollisionGroup) : null;
    this.rig = createCharacterRig(this.characterType);
    this.group = this.rig.group;
    this.position = new Vector3();
    this.velocity = new Vector3();
    this.capsule = new Capsule(new Vector3(), new Vector3(), this.config.radius);
    this.yaw = 0;
    this.speed = 0;
    this.grounded = false;
    this.animationTime = 0;
    this.landingTime = 0;
    this.turnRate = 0;
    this.dynamicWorld = null;
    this.vanObstacles = [];
    this.dismount = null;
    this.health = 100;
    this.injury = { lastDamage: 0, lastCause: null };
    this.spawn = { x: 0, y: 0, z: 0, yaw: 0 };
    this.reset(this.mapData.spawn ?? this.spawn);
  }

  reset(spawn = this.spawn) {
    this.spawn = { ...spawn };
    this.health = 100;
    this.injury = { lastDamage: 0, lastCause: null };
    this.teleport(spawn, spawn.yaw ?? 0);
  }

  teleport(spawn, yaw = this.yaw) {
    this.position.set(spawn.x ?? 0, spawn.y ?? 0, spawn.z ?? 0);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.speed = 0;
    this.grounded = false;
    this.animationTime = 0;
    this.landingTime = this.turnRate = 0;
    this.rig.pose = null;
    this.dismount = null;
    this.syncCapsule();
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
    this.animate(0);
  }

  syncCapsule() {
    this.capsule.start.copy(this.position).y += this.config.radius;
    this.capsule.end.copy(this.position).y += this.config.height - this.config.radius;
  }

  get state() {
    return { position: this.position, yaw: this.yaw, speed: this.speed, grounded: this.grounded, verticalSpeed: this.velocity.y, sprinting: this.speed > this.config.walkSpeed + 0.2,
      motionState: this.dismount?.phase ?? (!this.grounded ? 'jump' : this.landingTime > 0 ? 'land' : this.speed > 4.5 ? 'run' : this.speed > .12 ? 'walk' : 'idle'),
      motionTime: this.dismount?.phaseTime ?? 0, landingBlend: this.landingTime / .2, turnRate: this.turnRate, health: this.health, injury: this.injury };
  }

  setDynamicObstacles(group) { this.dynamicWorld = group ? new CollisionWorld(group) : null; }

  /** Store live references so traffic collision follows vans without rebuilding an octree. */
  setVanObstacles(vans, { ignore = null } = {}) {
    this.vanObstacles = Array.from(vans ?? []);
    this.dynamicWorld = null;
    if (this.dismount && ignore) {
      this.dismount.sourceVan = ignore;
      this.dismount.ignoreSource = true;
    }
  }

  /** Launch from the passenger rig's actual world-space sole/root position. */
  beginDismount({ position, yaw = this.yaw, velocity = { x: 0, z: 0 }, side, speed = 0, van = null }) {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
    const outward = side && Number.isFinite(side.x) && Number.isFinite(side.z) ? { x: side.x, z: side.z } :
      { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const length = Math.hypot(outward.x, outward.z) || 1;
    this.position.set(position.x, position.y, position.z);
    this.velocity.set((Number.isFinite(velocity.x) ? velocity.x : 0) + outward.x / length * 3.3,
      3.8, (Number.isFinite(velocity.z) ? velocity.z : 0) + outward.z / length * 3.3);
    this.yaw = yaw;
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.grounded = false;
    this.landingTime = 0;
    this.turnRate = 0;
    this.dismount = { sourceVan: van, ignoreSource: !!van, launchSpeed: Math.abs(speed), phase: 'jumpOff', phaseTime: 0, impactCooldown: 0 };
    this.rig.pose = {
      bob: this.rig.body.position.y, bodyZ: this.rig.body.position.z,
      lean: this.rig.body.rotation.x, roll: this.rig.body.rotation.z,
      a0: this.rig.arms[0].rotation.x, a1: this.rig.arms[1].rotation.x,
      az0: this.rig.arms[0].rotation.z, az1: this.rig.arms[1].rotation.z,
      l0: this.rig.legs[0].rotation.x, l1: this.rig.legs[1].rotation.x,
      k0: this.rig.knees[0].rotation.x, k1: this.rig.knees[1].rotation.x,
    };
    this.syncCapsule();
    this.group.position.copy(this.position);
    this.group.rotation.set(0, yaw, 0);
    this.group.visible = true;
    return true;
  }

  applyInjury(amount, cause) {
    if (!(amount > 0)) return;
    const damage = Math.max(0, Math.min(this.health - 25, amount));
    this.health -= damage;
    this.injury = { lastDamage: damage, lastCause: cause };
  }

  update(dt, input = {}, cameraYaw = 0) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (input.reset) { this.reset(); return; }
    const duration = Math.min(dt, 0.1);
    const ticks = Math.ceil(duration / (1 / 60));
    for (let tick = 0; tick < ticks; tick++) this.step(duration / ticks, { ...input, jump: tick === 0 && input.jump }, cameraYaw);
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
  }

  step(dt, input, cameraYaw) {
    const cfg = this.config;
    const wasGrounded = this.grounded;
    if (this.dismount) {
      this.dismount.phaseTime += dt;
      this.dismount.impactCooldown = Math.max(0, this.dismount.impactCooldown - dt);
      if (this.dismount.phase === 'stumble' && this.dismount.phaseTime >= .55 ||
          this.dismount.phase === 'fallen' && this.dismount.phaseTime >= 1.05) {
        this.dismount.phase = 'recover'; this.dismount.phaseTime = 0;
      } else if (this.dismount.phase === 'recover' && this.dismount.phaseTime >= .6) this.dismount = null;
    }
    this.landingTime = Math.max(0, this.landingTime - dt);
    const recovering = ['fallen', 'recover'].includes(this.dismount?.phase);
    const direction = movementDirection(recovering ? {} : input, cameraYaw);
    const desiredSpeed = input.sprint ? cfg.sprintSpeed : cfg.walkSpeed;
    const targetVelocity = direction.multiplyScalar(desiredSpeed);
    const difference = new Vector3(targetVelocity.x - this.velocity.x, 0, targetVelocity.z - this.velocity.z);
    const turning = this.velocity.x * targetVelocity.x + this.velocity.z * targetVelocity.z < 0;
    const launchAir = this.dismount?.phase === 'jumpOff' && !this.grounded;
    const acceleration = launchAir ? (targetVelocity.lengthSq() < .01 ? .45 : 3.2) :
      targetVelocity.lengthSq() < .01 ? cfg.deceleration : turning ? cfg.turnAcceleration : cfg.acceleration;
    if (difference.length() > acceleration * dt) difference.setLength(acceleration * dt);
    this.velocity.add(difference);
    if (input.jump && this.grounded && !this.dismount) {
      this.velocity.y = cfg.jumpSpeed;
      this.grounded = false;
    }
    this.velocity.y -= cfg.gravity * dt;
    const fallSpeed = this.velocity.y;
    const count = Math.max(1, Math.ceil(this.velocity.length() * dt / 0.15));
    const subDt = dt / count;
    let grounded = false;
    for (let i = 0; i < count; i++) {
      const priorX = this.position.x, priorZ = this.position.z;
      let nextX = priorX + this.velocity.x * subDt;
      let nextZ = priorZ + this.velocity.z * subDt;
      const bounds = this.mapData.bounds;
      if (bounds) {
        nextX = MathUtils.clamp(nextX, bounds.minX + cfg.radius, bounds.maxX - cfg.radius);
        nextZ = MathUtils.clamp(nextZ, bounds.minZ + cfg.radius, bounds.maxZ - cfg.radius);
      }
      if (isWaterBlocked(nextX, nextZ, this.mapData, cfg.radius)) {
        if (!isWaterBlocked(nextX, priorZ, this.mapData, cfg.radius)) nextZ = priorZ;
        else if (!isWaterBlocked(priorX, nextZ, this.mapData, cfg.radius)) nextX = priorX;
        else { nextX = priorX; nextZ = priorZ; }
      }
      this.capsule.translate(new Vector3(nextX - priorX, this.velocity.y * subDt, nextZ - priorZ));
      const beforeWall = Math.hypot(this.velocity.x, this.velocity.z);
      grounded = this.world.resolve(this.capsule, this.velocity) || grounded;
      if (this.sceneryWorld) grounded = this.sceneryWorld.resolve(this.capsule, this.velocity) || grounded;
      if (this.dynamicWorld) {
        grounded = this.dynamicWorld.resolve(this.capsule, this.velocity) || grounded;
        grounded = this.world.resolve(this.capsule, this.velocity) || grounded;
        if (this.sceneryWorld) grounded = this.sceneryWorld.resolve(this.capsule, this.velocity) || grounded;
      }
      for (const van of this.vanObstacles) {
        if (this.dismount?.ignoreSource && van === this.dismount.sourceVan) {
          const x = this.capsule.start.x, z = this.capsule.start.z;
          const clearance = typeof van.distanceFrom === 'function' ? van.distanceFrom(x, z) :
            Math.hypot(x - van.position.x, z - van.position.z) - (van.config?.halfWidth ?? .82);
          if (clearance <= cfg.radius + .12) continue;
          this.dismount.ignoreSource = false;
        }
        const hit = resolveVanCapsule(this.capsule, this.velocity, van);
        grounded = hit.grounded || grounded;
      }
      if (this.vanObstacles.length) {
        // A vehicle's separation must still respect surveyed walls, water and map edges.
        grounded = this.world.resolve(this.capsule, this.velocity) || grounded;
        if (this.sceneryWorld) grounded = this.sceneryWorld.resolve(this.capsule, this.velocity) || grounded;
        const x = this.capsule.start.x, z = this.capsule.start.z;
        const bounds = this.mapData.bounds;
        const blockedX = bounds && (x < bounds.minX + cfg.radius || x > bounds.maxX - cfg.radius);
        const blockedZ = bounds && (z < bounds.minZ + cfg.radius || z > bounds.maxZ - cfg.radius);
        if (blockedX || blockedZ || isWaterBlocked(x, z, this.mapData, cfg.radius)) {
          this.capsule.translate(new Vector3(priorX - x, 0, priorZ - z));
          this.velocity.x = this.velocity.z = 0;
        }
      }
      const lostSpeed = beforeWall - Math.hypot(this.velocity.x, this.velocity.z);
      if (this.dismount?.phase === 'jumpOff' && this.dismount.impactCooldown <= 0 && lostSpeed > 2.5) {
        this.applyInjury((lostSpeed - 2.5) * 2.8, 'impact');
        this.dismount.impactCooldown = .4;
      }
      this.position.copy(this.capsule.start).y -= cfg.radius;
    }
    this.grounded = grounded;
    if (!wasGrounded && grounded && fallSpeed < -1.4) this.landingTime = .2;
    if (!wasGrounded && grounded && this.dismount?.phase === 'jumpOff') {
      const severity = Math.max(0, this.dismount.launchSpeed - 2.5) * 2.7 + Math.max(0, -fallSpeed - 7) * 3;
      this.applyInjury(severity, 'dismount');
      this.dismount.phase = severity >= 12 ? 'fallen' : 'stumble';
      this.dismount.phaseTime = 0;
    }
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.speed > 0.08) {
      const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      const angle = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
      const turn = angle * (1 - Math.exp(-(16 + Math.min(2, this.speed / 4)) * dt));
      this.yaw += turn;
      this.turnRate = MathUtils.lerp(this.turnRate, turn / dt, 1 - Math.exp(-10 * dt));
    } else this.turnRate *= Math.exp(-10 * dt);
    if (this.position.y < -8 || !Number.isFinite(this.position.lengthSq())) this.reset();
  }

  animate(dt) {
    this.animationTime += Math.max(0, Math.min(dt, 0.1));
    animateStudent(this.rig, this.state, this.animationTime, dt);
  }


  setCharacterType(type) {
    if (this.characterType === type) return;
    this.characterType = type;
    const oldGroup = this.group;
    this.rig = createCharacterRig(this.characterType);
    this.group = this.rig.group;
    this.group.position.copy(this.position);
    this.group.rotation.set(0, this.yaw, 0);
    this.group.visible = oldGroup.visible;
    if (oldGroup.parent) {
      oldGroup.parent.add(this.group);
      oldGroup.parent.remove(oldGroup);
    }
  }

  dispose() {
    const materials = new Set();
    this.group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) materials.add(object.material);
    });
    for (const material of materials) material.dispose();
  }
}
