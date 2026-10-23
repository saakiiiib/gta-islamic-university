import { localToWorld } from '../navigation/campusQueries.js';
const STOP_SPEED = .08;

function disposeProxy(group) {
  const materials = new Set();
  group.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
  materials.forEach(m => m.dispose());
}

export class VehicleSession {
  constructor(player, van, queries) {
    this.player = player; this.van = van; this.queries = queries; this.driving = false;
    this.refreshParkedCollision();
  }
  refreshParkedCollision() {
    const proxy = this.van.createParkedCollider(); this.player.setDynamicObstacles(proxy); disposeProxy(proxy);
  }
  canEnter() {
    const seat = localToWorld(0, -.4, this.van.position, this.van.yaw);
    return !this.driving && Math.abs(this.van.speed) < STOP_SPEED && this.player.grounded
      && Math.abs(this.player.position.y - this.van.position.y) < .65
      && Math.hypot(this.player.position.x - this.van.position.x, this.player.position.z - this.van.position.z) < 2.7
      && this.van.distanceFrom(this.player.position.x, this.player.position.z) < 1.4
      && this.queries.segmentClear([this.player.position.x, this.player.position.z], seat, this.player.config.radius);
  }
  safeExit(pedestrians = []) {
    const van = this.van, radius = this.player.config.radius;
    for (const [u, v] of [[-1.5, -.4], [1.5, -.4], [-1.6, .9], [1.6, .9], [0, 2.65], [0, -2.5]]) {
      const [x, z] = localToWorld(u, v, van.position, van.yaw);
      if (!this.queries.discClear(x, z, radius + .12) || van.distanceFrom(x, z) < radius + .15) continue;
      if (!this.queries.segmentClear(localToWorld(0, -.4, van.position, van.yaw), [x, z], radius + .08)) continue;
      if (pedestrians.some(p => Math.hypot(p.position.x - x, p.position.z - z) < radius + .6)) continue;
      return { x, y: this.queries.groundHeight(x, z) + .015, z };
    }
    return null;
  }
  interact(pedestrians = []) {
    if (!this.driving) {
      if (!this.canEnter()) return { changed: false, message: '' };
      this.driving = this.van.occupied = true;
      this.player.velocity.set(0, 0, 0); this.player.speed = 0; this.player.group.visible = false; this.player.setDynamicObstacles(null);
      return { changed: true, message: 'Electric van · W drive · S brake / reverse · A/D steer · Space brake · E exit when stopped.' };
    }
    if (Math.abs(this.van.speed) > STOP_SPEED) return { changed: false, message: 'Stop the van before stepping off. Hold Space to brake.' };
    const exit = this.safeExit(pedestrians);
    if (!exit) return { changed: false, message: 'No clear place to step off. Move to an open area and stop.' };
    this.van.speed = 0; this.driving = this.van.occupied = false;
    this.player.teleport(exit, this.van.yaw); this.player.group.visible = true; this.refreshParkedCollision();
    return { changed: true, message: 'Back on foot. The van stays where you parked it.' };
  }
  reset(spawn) {
    this.driving = this.van.occupied = false; this.van.reset(); this.player.reset(spawn); this.player.group.visible = true; this.refreshParkedCollision();
  }
  get entity() {
    return this.driving ? { position: this.van.position, yaw: this.van.yaw, speed: Math.abs(this.van.speed), grounded: true, driving: true, reversing: this.van.speed < -.05 } : this.player;
  }
  get hint() {
    if (this.driving) return Math.abs(this.van.speed) > STOP_SPEED ? 'Hold SPACE to stop · E exits when stopped' : 'Press E to exit van';
    return this.canEnter() ? 'Press E to enter electric van' : '';
  }
}
