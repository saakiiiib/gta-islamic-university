import { localToWorld } from '../navigation/campusQueries.js';
import { Group } from 'three';
const STOP_SPEED = .08;

function disposeProxy(group) {
  const materials = new Set();
  group.traverse(o => { o.geometry?.dispose(); if (o.material) materials.add(o.material); });
  materials.forEach(m => m.dispose());
}

export class VehicleSession {
  constructor(player, vanOrFleet, queries) {
    this.player = player; this.vans = Array.isArray(vanOrFleet) ? vanOrFleet : [vanOrFleet]; this.van = this.vans[0]; this.queries = queries; this.driving = false;
    this.refreshParkedCollision();
  }
  refreshParkedCollision() {
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
  safeExit(pedestrians = []) {
    const van = this.van, radius = this.player.config.radius;
    for (const [u, v] of [[-1.5, -.4], [1.5, -.4], [-1.6, .9], [1.6, .9], [0, 2.65], [0, -2.5]]) {
      const [x, z] = localToWorld(u, v, van.position, van.yaw);
      if (!this.queries.discClear(x, z, radius + .12) || van.distanceFrom(x, z) < radius + .15) continue;
      if (!this.clearRoute(localToWorld(0, .9, van.position, van.yaw), [x, z], van)) continue;
      if (this.vans.some(other => other !== van && other.distanceFrom(x, z) < radius + .15)) continue;
      if (pedestrians.some(p => Math.hypot(p.position.x - x, p.position.z - z) < radius + .6)) continue;
      return { x, y: this.queries.groundHeight(x, z) + .015, z };
    }
    return null;
  }
  interact(pedestrians = []) {
    if (!this.driving) {
      const van = this.nearestVan();
      if (!this.canEnter(van)) return { changed: false, message: '' };
      this.van = van;
      this.driving = this.van.occupied = true;
      this.player.velocity.set(0, 0, 0); this.player.speed = 0; this.player.group.visible = true; this.refreshParkedCollision();
      return { changed: true, message: `Van ${(van.id ?? 0) + 1} · You ride behind the driver. W/S drive · A/D steer · SPACE brake · E exit stopped.` };
    }
    if (Math.abs(this.van.speed) > STOP_SPEED) return { changed: false, message: 'Stop the van before stepping off. Hold Space to brake.' };
    const exit = this.safeExit(pedestrians);
    if (!exit) return { changed: false, message: 'No clear place to step off. Move to an open area and stop.' };
    this.van.speed = 0; this.driving = this.van.occupied = false;
    this.player.teleport(exit, this.van.yaw); this.player.group.visible = true; this.refreshParkedCollision();
    return { changed: true, message: 'Back on foot. The van stays where you parked it.' };
  }
  reset(spawn) {
    this.driving = false; for (const van of this.vans) van.reset(); this.van = this.vans[0];
    this.player.reset(spawn); this.player.group.visible = true; this.refreshParkedCollision();
  }
  get entity() {
    return this.driving ? { position: this.van.position, yaw: this.van.yaw, speed: Math.abs(this.van.speed), grounded: true, driving: true, reversing: this.van.speed < -.05, durability: this.van.durability, disabled: this.van.disabled, vanId: this.van.id } : this.player;
  }
  get hint() {
    if (this.driving) return this.van.disabled ? 'Van disabled · Press E to step off · R repairs and returns to gate' : Math.abs(this.van.speed) > STOP_SPEED ? 'Hold SPACE to stop · E exits when stopped' : 'Press E to exit van';
    return this.canEnter() ? 'Press E to enter electric van' : '';
  }
}
