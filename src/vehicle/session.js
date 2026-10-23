import { localToWorld } from '../navigation/campusQueries.js';
import { Group } from 'three';
import { passengerWorldPosition } from './occupants.js';
const STOP_SPEED = .08;

function disposeProxy(group) {
  const materials = new Set();
  group.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
  materials.forEach(m => m.dispose());
}

export class VehicleSession {
  constructor(player, vanOrFleet, queries, { onDepart = () => {} } = {}) {
    this.player = player; this.vans = Array.isArray(vanOrFleet) ? vanOrFleet : [vanOrFleet]; this.van = this.vans[0]; this.queries = queries; this.driving = false;
    this.onDepart = onDepart;
    this.refreshParkedCollision();
  }
  refreshParkedCollision() {
    if (this.player.setVanObstacles) {
      this.player.setDynamicObstacles(null);
      this.player.setVanObstacles(this.vans, { ignore: this.driving ? this.van : null });
      return;
    }
    const proxy = new Group();
    for (const van of this.vans) if (!this.driving || van !== this.van) proxy.add(van.createParkedCollider());
    proxy.updateMatrixWorld(true); this.player.setDynamicObstacles(proxy); disposeProxy(proxy);
  }
  nearestVan({ usable = true } = {}) {
    let nearest = null, distance = Infinity;
    for (const van of this.vans) {
      if (usable && van.disabled) continue;
      const d = Math.hypot(this.player.position.x - van.position.x, this.player.position.z - van.position.z);
      if (d < distance) { nearest = van; distance = d; }
    }
    return nearest;
  }
  clearRoute(a, b, own) {
    const radius = this.player.config.radius;
    if (!this.queries.segmentClear(a, b, radius)) return false;
    const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / .18));
    for (let i = 0; i <= count; i++) {
      const x = a[0] + (b[0] - a[0]) * i / count, z = a[1] + (b[1] - a[1]) * i / count;
      if (this.vans.some(v => v !== own && v.distanceFrom(x, z) < radius + .12)) return false;
    }
    return true;
  }
  canEnter(van = this.nearestVan()) {
    if (!van || van.disabled || this.driving) return false;
    const seat = localToWorld(0, .9, van.position, van.yaw);
    return Math.abs(van.speed) < STOP_SPEED && this.player.grounded
      && Math.abs(this.player.position.y - van.position.y) < .65
      && Math.hypot(this.player.position.x - van.position.x, this.player.position.z - van.position.z) < 2.9
      && van.distanceFrom(this.player.position.x, this.player.position.z) < 1.4
      && this.clearRoute([this.player.position.x, this.player.position.z], seat, van);
  }
  dismountSide(position) {
    // Choose only the launch direction; never relocate to a candidate ground point.
    const van = this.van, right = { x: Math.cos(van.yaw), z: -Math.sin(van.yaw) };
    for (const sign of [-1, 1]) {
      const end = [position.x + right.x * sign * 1.5, position.z + right.z * sign * 1.5];
      if (this.queries.segmentClear([position.x, position.z], end, this.player.config.radius)) return { x: right.x * sign, z: right.z * sign };
    }
    return { x: -right.x, z: -right.z };
  }
  interact(pedestrians = []) {
    if (!this.driving) {
      const van = this.nearestVan();
      if (!this.canEnter(van)) return { changed: false, message: '' };
      this.van = van;
      van.autonomous = false;
      this.driving = this.van.occupied = true;
      this.player.velocity.set(0, 0, 0); this.player.speed = 0; this.player.group.visible = true; this.refreshParkedCollision();
      return { changed: true, message: `Van ${(van.id ?? 0) + 1} · Ride behind the driver. W/S drive · A/D steer · SPACE brake · E jump off at any speed.` };
    }
    const van = this.van, position = passengerWorldPosition(van), speed = Math.abs(van.speed);
    this.player.beginDismount({ position, yaw: van.yaw, velocity: { x: -Math.sin(van.yaw) * van.speed, z: -Math.cos(van.yaw) * van.speed }, side: this.dismountSide(position), speed, van });
    this.driving = van.occupied = false;
    this.player.group.visible = true; this.refreshParkedCollision(); this.onDepart(van);
    return { changed: true, message: speed > 3 ? 'Jumped off with the van’s momentum. Brace for the landing!' : 'Stepping off. The driver continues along the road.' };
  }
  reset(spawn) {
    this.driving = false; for (const van of this.vans) van.reset(); this.van = this.vans[0];
    this.player.reset(spawn); this.player.group.visible = true; this.refreshParkedCollision();
  }
  get entity() {
    return this.driving ? { position: this.van.position, yaw: this.van.yaw, speed: Math.abs(this.van.speed), grounded: true, driving: true, reversing: this.van.speed < -.05, durability: this.van.durability, disabled: this.van.disabled, vanId: this.van.id } : this.player;
  }
  get hint() {
    if (this.driving) return this.van.disabled ? 'Van disabled · E to jump off · R repairs and returns to gate' : Math.abs(this.van.speed) > 3 ? 'Press E to jump off · A fast landing can hurt' : 'Press E to step off at any speed';
    return this.canEnter() ? 'Press E to enter electric van' : '';
  }
}
