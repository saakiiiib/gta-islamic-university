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
  constructor(player, vanOrFleet, queries, { onDepart = () => {}, bus = null } = {}) {
    this.player = player;
    this.vans = Array.isArray(vanOrFleet) ? vanOrFleet : [vanOrFleet];
    this.bus = bus;
    this.van = this.vans[0];
    this.queries = queries;
    this.driving = false;
    this.onDepart = onDepart;
    this.refreshParkedCollision();
  }

  get allVehicles() {
    return this.bus ? [...this.vans, this.bus] : this.vans;
  }

  refreshParkedCollision() {
    if (this.player.setVanObstacles) {
      this.player.setDynamicObstacles(null);
      this.player.setVanObstacles(this.allVehicles, { ignore: this.driving ? this.van : null });
      return;
    }
    const proxy = new Group();
    for (const van of this.allVehicles) if (!this.driving || van !== this.van) proxy.add(van.createParkedCollider());
    proxy.updateMatrixWorld(true); this.player.setDynamicObstacles(proxy); disposeProxy(proxy);
  }

  nearestVehicle({ usable = true } = {}) {
    let nearest = null, distance = Infinity;
    for (const v of this.allVehicles) {
      if (usable && v.disabled) continue;
      const d = Math.hypot(this.player.position.x - v.position.x, this.player.position.z - v.position.z);
      if (d < distance) { nearest = v; distance = d; }
    }
    return nearest;
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
      if (this.allVehicles.some(v => v !== own && v.distanceFrom(x, z) < radius + .12)) return false;
    }
    return true;
  }

  canEnter(vehicle = this.nearestVehicle()) {
    if (!vehicle || vehicle.disabled || this.driving) return false;
    const seatOffset = vehicle.isBus ? -1.8 : 0.9;
    const seat = localToWorld(0, seatOffset, vehicle.position, vehicle.yaw);
    const enterDist = vehicle.isBus ? 4.5 : 2.9;
    const clearanceDist = vehicle.isBus ? 2.4 : 1.4;
    const heightDiff = vehicle.isBus ? 1.6 : 0.65;
    return Math.abs(vehicle.speed) < STOP_SPEED && this.player.grounded
      && Math.abs(this.player.position.y - vehicle.position.y) < heightDiff
      && Math.hypot(this.player.position.x - vehicle.position.x, this.player.position.z - vehicle.position.z) < enterDist
      && vehicle.distanceFrom(this.player.position.x, this.player.position.z) < clearanceDist
      && this.clearRoute([this.player.position.x, this.player.position.z], seat, vehicle);
  }

  dismountSide(position) {
    // Choose only the launch direction; never relocate to a candidate ground point.
    const van = this.van, right = { x: Math.cos(van.yaw), z: -Math.sin(van.yaw) };
    const offset = van.isBus ? 2.2 : 1.5;
    for (const sign of [-1, 1]) {
      const end = [position.x + right.x * sign * offset, position.z + right.z * sign * offset];
      if (this.queries.segmentClear([position.x, position.z], end, this.player.config.radius)) return { x: right.x * sign, z: right.z * sign };
    }
    return { x: -right.x, z: -right.z };
  }

  interact(pedestrians = []) {
    if (!this.driving) {
      const vehicle = this.nearestVehicle();
      if (!this.canEnter(vehicle)) return { changed: false, message: '' };
      this.van = vehicle;
      vehicle.autonomous = false;
      this.driving = this.van.occupied = true;
      this.player.velocity.set(0, 0, 0); this.player.speed = 0; this.player.group.visible = true; this.refreshParkedCollision();
      const message = vehicle.isBus
        ? 'IU Red Bus (লাল বাস) · W/S drive · A/D steer · SPACE brake · E step off.'
        : `Van ${(vehicle.id ?? 0) + 1} · Ride behind the driver. W/S drive · A/D steer · SPACE brake · E jump off at any speed.`;
      return { changed: true, message };
    }
    const van = this.van;
    const position = van.isBus ? { x: van.position.x, y: van.position.y + 0.5, z: van.position.z } : passengerWorldPosition(van);
    const speed = Math.abs(van.speed);
    this.player.beginDismount({ position, yaw: van.yaw, velocity: { x: -Math.sin(van.yaw) * van.speed, z: -Math.cos(van.yaw) * van.speed }, side: this.dismountSide(position), speed, van });
    this.driving = van.occupied = false;
    this.player.group.visible = true; this.refreshParkedCollision(); this.onDepart(van);
    const message = van.isBus
      ? (speed > 4 ? 'Jumped off the moving Red Bus! Watch your landing!' : 'Stepped off the IU Red Bus.')
      : (speed > 3 ? 'Jumped off with the van’s momentum. Brace for the landing!' : 'Stepping off. The driver continues along the road.');
    return { changed: true, message };
  }

  reset(spawn) {
    this.driving = false; for (const van of this.vans) van.reset();
    if (this.bus) this.bus.reset();
    this.van = this.vans[0];
    this.player.reset(spawn); this.player.group.visible = true; this.refreshParkedCollision();
  }

  get entity() {
    return this.driving ? { position: this.van.position, yaw: this.van.yaw, speed: Math.abs(this.van.speed), grounded: true, driving: true, reversing: this.van.speed < -.05, durability: this.van.durability, disabled: this.van.disabled, vanId: this.van.id, isBus: !!this.van.isBus, name: this.van.name } : this.player;
  }

  get hint() {
    if (this.driving) {
      if (this.van.isBus) return this.van.disabled ? 'Bus disabled · E to step off' : 'Press E to step off IU Red Bus';
      return this.van.disabled ? 'Van disabled · E to jump off · R repairs and returns to gate' : Math.abs(this.van.speed) > 3 ? 'Press E to jump off · A fast landing can hurt' : 'Press E to step off at any speed';
    }
    const near = this.nearestVehicle();
    if (this.canEnter(near)) {
      return near.isBus ? 'Press E to drive IU Red Bus (লাল বাস)' : 'Press E to enter electric van';
    }
    return '';
  }
}
