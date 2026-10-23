import { Vector3, MathUtils } from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { PLAYER_CONFIG } from '../config.js';
import { CollisionWorld, isWaterBlocked } from './collision.js';
import { createStudent, animateStudent } from './character.js';

export function movementDirection(input = {}, cameraYaw = 0) {
  const x = Number(Boolean(input.right)) - Number(Boolean(input.left));
  const z = Number(Boolean(input.back)) - Number(Boolean(input.forward));
  return new Vector3(x * Math.cos(cameraYaw) + z * Math.sin(cameraYaw), 0, -x * Math.sin(cameraYaw) + z * Math.cos(cameraYaw)).normalize();
}

export class PlayerController {
  constructor({ collisionGroup, mapData, config = PLAYER_CONFIG }) {
    this.config = { ...PLAYER_CONFIG, ...config };
    this.mapData = mapData ?? {};
    this.world = new CollisionWorld(collisionGroup);
    this.rig = createStudent();
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
    this.spawn = { x: 0, y: 0, z: 0, yaw: 0 };
    this.reset(this.mapData.spawn ?? this.spawn);
  }

  reset(spawn = this.spawn) {
    this.spawn = { ...spawn };
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
      motionState: !this.grounded ? 'jump' : this.landingTime > 0 ? 'land' : this.speed > 4.5 ? 'run' : this.speed > .12 ? 'walk' : 'idle', landingBlend: this.landingTime / .2, turnRate: this.turnRate };
  }

  setDynamicObstacles(group) { this.dynamicWorld = group ? new CollisionWorld(group) : null; }

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
    this.landingTime = Math.max(0, this.landingTime - dt);
    const direction = movementDirection(input, cameraYaw);
    const desiredSpeed = input.sprint ? cfg.sprintSpeed : cfg.walkSpeed;
    const targetVelocity = direction.multiplyScalar(desiredSpeed);
    const difference = new Vector3(targetVelocity.x - this.velocity.x, 0, targetVelocity.z - this.velocity.z);
    const turning = this.velocity.x * targetVelocity.x + this.velocity.z * targetVelocity.z < 0;
    const acceleration = targetVelocity.lengthSq() < .01 ? cfg.deceleration : turning ? cfg.turnAcceleration : cfg.acceleration;
    if (difference.length() > acceleration * dt) difference.setLength(acceleration * dt);
    this.velocity.add(difference);
    if (input.jump && this.grounded) {
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
      grounded = this.world.resolve(this.capsule, this.velocity) || grounded;
      if (this.dynamicWorld) {
        grounded = this.dynamicWorld.resolve(this.capsule, this.velocity) || grounded;
        grounded = this.world.resolve(this.capsule, this.velocity) || grounded;
      }
      this.position.copy(this.capsule.start).y -= cfg.radius;
    }
    this.grounded = grounded;
    if (!wasGrounded && grounded && fallSpeed < -1.4) this.landingTime = .2;
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

  dispose() {
    const materials = new Set();
    this.group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) materials.add(object.material);
    });
    for (const material of materials) material.dispose();
  }
}
