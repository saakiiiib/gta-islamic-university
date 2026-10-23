import { Vector3, MathUtils, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { localToWorld, rectangleFootprint, worldToLocal } from '../navigation/campusQueries.js';
import { createElectricVanModel } from './model.js';

export const VAN_CONFIG = Object.freeze({ maxSpeed: 8, reverseSpeed: 2.5, acceleration: 2.6, reverseAcceleration: 1.7, braking: 5.4,
  rolling: .25, drag: .018, wheelbase: 2.22, maxSteer: .52, wheelRadius: .4, halfWidth: .82, front: 1.7, rear: 1.82 });
const approach = (value, target, delta) => value < target ? Math.min(target, value + delta) : Math.max(target, value - delta);

export class ElectricVan {
  constructor({ queries, spawn, config = {}, model = createElectricVanModel() }) {
    this.queries = queries; this.config = { ...VAN_CONFIG, ...config }; this.model = model; this.group = model.group;
    this.position = new Vector3(); this.yaw = 0; this.speed = 0; this.steering = 0; this.wheelAngle = 0;
    this.occupied = false; this.hitObstacle = false; this.acceleration = 0; this.visualLean = 0; this.visualPitch = 0;
    this.spawn = { ...spawn }; this.reset();
  }
  reset(spawn = this.spawn) {
    this.position.set(spawn.x, this.queries.groundHeight(spawn.x, spawn.z), spawn.z); this.yaw = spawn.yaw ?? 0;
    this.speed = this.steering = this.wheelAngle = this.acceleration = this.visualLean = this.visualPitch = 0;
    this.occupied = false; this.hitObstacle = this.yieldingToPedestrian = false; this.syncVisuals(0);
  }
  update(dt, input = {}, { emergencyBrake = false, pedestrians = [] } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, .1), ticks = Math.ceil(duration * 60);
    for (let i = 0; i < ticks; i++) this.step(duration / ticks, this.occupied ? input : {}, emergencyBrake, pedestrians);
  }
  step(dt, input, emergencyBrake, pedestrians) {
    const cfg = this.config, before = this.speed;
    const brake = input.brake || input.jump || emergencyBrake;
    if (brake) this.speed = approach(this.speed, 0, cfg.braking * dt);
    else if (input.forward && !input.back) this.speed = this.speed < -.05 ? approach(this.speed, 0, cfg.braking * dt) : Math.min(cfg.maxSpeed, this.speed + cfg.acceleration * dt);
    else if (input.back && !input.forward) this.speed = this.speed > .05 ? approach(this.speed, 0, cfg.braking * dt) : Math.max(-cfg.reverseSpeed, this.speed - cfg.reverseAcceleration * dt);
    else this.speed = approach(this.speed, 0, (cfg.rolling + cfg.drag * this.speed * this.speed) * dt);
    if (Math.abs(this.speed) < .01 && (!input.forward && !input.back || brake)) this.speed = 0;
    const steeringTarget = (Number(!!input.left) - Number(!!input.right)) * cfg.maxSteer / (1 + Math.abs(this.speed) * .065);
    this.steering = approach(this.steering, steeringTarget, 1.65 * dt);
    const yawRate = this.speed / cfg.wheelbase * Math.tan(this.steering);
    const steps = Math.max(1, Math.ceil((Math.abs(this.speed) + Math.abs(yawRate) * 2.1) * dt / .065));
    const subDt = dt / steps;
    this.hitObstacle = false;
    this.yieldingToPedestrian = false;
    for (let i = 0; i < steps; i++) {
      const nextYaw = this.yaw + yawRate * subDt, midYaw = (this.yaw + nextYaw) / 2;
      const candidate = { x: this.position.x - Math.sin(midYaw) * this.speed * subDt, z: this.position.z - Math.cos(midYaw) * this.speed * subDt };
      const personBlocked = pedestrians.some(p => {
        const [x, z] = worldToLocal(p.position.x, p.position.z, candidate, nextYaw);
        return Math.hypot(Math.max(0, Math.abs(x) - cfg.halfWidth), Math.max(0, -cfg.front - z, z - cfg.rear)) < .36;
      });
      if (!this.queries.rectangleClear(candidate, nextYaw, cfg) || personBlocked) { this.speed = 0; this.hitObstacle = true; this.yieldingToPedestrian = personBlocked; break; }
      this.position.x = candidate.x; this.position.z = candidate.z; this.yaw = nextYaw;
      this.wheelAngle -= this.speed * subDt / cfg.wheelRadius;
    }
    this.acceleration = MathUtils.lerp(this.acceleration, (this.speed - before) / dt, 1 - Math.exp(-8 * dt));
    this.position.y = this.queries.groundHeight(this.position.x, this.position.z);
  }
  syncVisuals(dt) {
    const front = localToWorld(0, -1.27, this.position, this.yaw), rear = localToWorld(0, .95, this.position, this.yaw);
    const frontY = this.queries.groundHeight(...front), rearY = this.queries.groundHeight(...rear);
    this.position.y = (frontY + rearY) / 2;
    const targetLean = MathUtils.clamp(this.speed * this.speed * Math.tan(this.steering) * .004, -.075, .075);
    const targetPitch = MathUtils.clamp(Math.atan2(frontY - rearY, this.config.wheelbase) + this.acceleration * .009, -.19, .19);
    const blend = dt > 0 ? 1 - Math.exp(-8 * Math.min(dt, .1)) : 1;
    this.visualLean = MathUtils.lerp(this.visualLean, targetLean, blend); this.visualPitch = MathUtils.lerp(this.visualPitch, targetPitch, blend);
    this.group.position.copy(this.position); this.group.rotation.set(0, this.yaw, 0);
    this.model.body.rotation.set(this.visualPitch, 0, this.visualLean);
    this.model.steering.rotation.y = this.steering; this.model.steering.position.y = frontY - this.position.y;
    for (const wheel of this.model.wheels) wheel.rotation.x = this.wheelAngle;
    for (const wheel of this.model.rearWheels) wheel.position.y = .4 + rearY - this.position.y;
  }
  distanceFrom(x, z) {
    const [u, v] = worldToLocal(x, z, this.position, this.yaw), cfg = this.config;
    return Math.hypot(Math.max(0, Math.abs(u) - cfg.halfWidth), Math.max(0, -cfg.front - v, v - cfg.rear));
  }
  get footprint() { return rectangleFootprint(this.position, this.yaw, this.config); }
  createParkedCollider() {
    const group = new Group(), material = new MeshBasicMaterial();
    // Flatbed and chassis remain low enough for the student to jump onto them.
    for (const [size, center] of [[[1.58, .88, 1.74], [0, .44, .92]], [[.46, 1.22, 1.5], [0, .61, -.72]]]) {
      const mesh = new Mesh(new BoxGeometry(...size), material); mesh.position.set(...center); group.add(mesh);
    }
    group.position.copy(this.position); group.rotation.y = this.yaw; group.updateMatrixWorld(true);
    return group;
  }
  dispose() { this.model.dispose(); }
}

/** A parked game prop on a mapped vehicle road; it is not a surveyed OSM feature. */
export function findVanSpawn(map, queries) {
  const spawn = map.spawn, yaw = spawn.yaw ?? 0;
  for (const forward of [8, 11, 5, 15, -7]) for (const side of [1.3, -1.3, 0]) {
    const [x, z] = localToWorld(side, -forward, spawn, yaw);
    if (queries.onRoad(x, z) && queries.rectangleClear({ x, z }, yaw, VAN_CONFIG, .25)) return { x, z, yaw };
  }
  const points = (map.roads ?? []).filter(r => /^(service|unclassified)$/.test(r.kind)).flatMap(r => r.paths.flatMap(path => path.slice(1).flatMap((b, i) => {
    const a = path[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]), count = Math.max(1, Math.ceil(length / 5));
    return Array.from({ length: count }, (_, j) => ({ x: a[0] + (b[0] - a[0]) * j / count, z: a[1] + (b[1] - a[1]) * j / count, yaw: Math.atan2(a[0] - b[0], a[1] - b[1]) }));
  })));
  points.sort((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z) - Math.hypot(b.x - spawn.x, b.z - spawn.z));
  const candidate = points.find(p => Math.hypot(p.x - spawn.x, p.z - spawn.z) > 5 && queries.rectangleClear(p, p.yaw, VAN_CONFIG, .25));
  if (!candidate) throw new Error('No safe parking position found on the supplied campus roads.');
  return candidate;
}
