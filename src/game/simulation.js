import { PlayerController } from '../player/controller.js';
import { CampusQueries } from '../navigation/campusQueries.js';
import { buildPedestrianGraph } from '../navigation/graph.js';
import { createVanFleet } from '../vehicle/fleet.js';
import { VehicleSession } from '../vehicle/session.js';
import { PedestrianSystem } from '../npc/pedestrians.js';
import { VanOccupants } from '../vehicle/occupants.js';
import { ImpactSystem } from './impacts.js';
import { DriverContinuation } from '../vehicle/driver.js';
import { DoubleDeckerBus } from '../vehicle/busModel.js';
import { AmbulanceController } from '../vehicle/ambulance.js';
import { MAIN_GATE_CONFIG } from '../world/mainGate.js';
import { hornAudio } from '../audio/horn.js';

/** All moving campus entities share this fixed-step, explicitly suspended simulation. */
export class CampusSimulation {
  constructor(mapData, collisionGroup, { renderCrowd = true, scenery = null } = {}) {
    this.map = mapData; this.suspended = false; this.yieldingForPedestrian = false; this.events = []; this.lastCollision = null;
    this.queries = new CampusQueries(mapData, { obstacles: scenery?.obstacles ?? [] });
    this.player = new PlayerController({ collisionGroup, sceneryCollisionGroup: scenery?.collisionGroup, mapData });
    const fleet = createVanFleet(mapData, this.queries);
    this.vans = fleet.vans; this.fleetGroup = fleet.group;
    this.bus = new DoubleDeckerBus({ queries: this.queries, spawn: { ...MAIN_GATE_CONFIG.busParking, y: 0 } });
    this.busGroup = this.bus.group;
    this.ambulance = new AmbulanceController(mapData, this.queries);
    this.ambulanceGroup = this.ambulance.group;
    this.driverController = new DriverContinuation(mapData, this.queries, this.vans);
    this.session = new VehicleSession(this.player, this.vans, this.queries, {
      onDepart: van => this.driverController.depart(van),
      bus: this.bus,
    });
    this.player.update(1 / 60); this.player.rig.pose = null; this.player.animate(0);
    this.graph = buildPedestrianGraph(mapData, this.queries);
    const avoidList = [...this.vans.map(v => ({ ...v.position, radius: 5 })), { ...this.bus.position, radius: 7 }];
    this.crowd = new PedestrianSystem(mapData, this.queries, this.graph, { count: 30, render: renderCrowd, avoid: avoidList });
    this.impacts = new ImpactSystem(this.crowd);
    this.occupants = new VanOccupants(this.vans, this.player, { render: renderCrowd });
    this.driverController.startServices?.();
  }
  setSuspended(suspended) { this.suspended = !!suspended; }
  get allVehicles() {
    const list = [...this.vans];
    if (this.bus) list.push(this.bus);
    if (this.ambulance) list.push(this.ambulance);
    return list;
  }
  update(dt, input = {}, cameraYaw = 0) {
    if (this.suspended || !Number.isFinite(dt) || dt <= 0) return {};
    if (input.reset) { this.reset(); return { reset: true, changed: true, message: 'Back at Main Gate. Campus traffic and red bus ready.' }; }
    let event = {};
    if (input.interact) {
      event = this.session.interact(this.crowd.agents);
      if (event.changed) { input = {}; this.occupants.update(0, this.session); }
    }
    if (input.horn && this.session.driving) {
      hornAudio.honk(this.session.van.isBus);
      this.crowd.honkAt(this.session.van.position, this.session.van.yaw);
      event.horn = true;
    }
    const duration = Math.min(dt, .1), ticks = Math.ceil(duration * 60);
    for (let i = 0; i < ticks; i++) {
      const step = duration / ticks;
      this.impacts.update(step); this.crowd.update(step, this.allVehicles);
      if (this.session.driving) {
        this.session.van.update(step, input, {
          pedestrians: this.crowd.agents,
          vans: this.allVehicles,
          onImpact: impact => this.impacts.handle(impact),
        });
      }
      if (this.bus && this.session.van !== this.bus) {
        this.bus.update(step, {}, {
          pedestrians: this.crowd.agents,
          vans: this.vans,
          onImpact: impact => this.impacts.handle(impact),
        });
      }
      if (this.ambulance) {
        const ambEvent = this.ambulance.update(step, { crowd: this.crowd });
        if (ambEvent) this.events.push(ambEvent);
      }
      this.driverController.update(step, { pedestrians: this.crowd.agents, onImpact: impact => this.impacts.handle(impact), player: this.session.driving ? null : this.player });
      if (!this.session.driving) this.player.update(step, { ...input, jump: i === 0 && input.jump }, cameraYaw);
      const events = [...this.crowd.drainEvents(), ...this.impacts.drainEvents()];
      for (const reaction of events) {
        if (reaction.type === 'collision') {
          this.lastCollision = { npcId: reaction.npcId, time: this.impacts.time };
          if (reaction.npcId != null) {
            this.ambulance.dispatch(reaction.position, reaction.npcId);
            this.events.push({ type: 'ambulanceDispatched', npcId: reaction.npcId, position: reaction.position });
          }
        }
        this.events.push(reaction); if (this.events.length > 128) this.events.shift();
      }
    }
    if (this.ambulance) {
      hornAudio.updateSiren(this.ambulance.position, this.session.entity.position);
    }
    return event;
  }
  animate(dt) {
    if (this.suspended) return;
    if (!this.session.driving) this.player.animate(dt);
    for (const van of this.vans) van.syncVisuals(dt);
    if (this.bus) this.bus.syncVisuals(dt);
    if (this.ambulance) this.ambulance.syncVisuals(dt);
    this.occupants.update(dt, this.session); this.crowd.animate(dt);
  }
  reset() {
    this.driverController.reset();
    this.session.reset(this.map.spawn);
    if (this.bus) this.bus.reset();
    if (this.ambulance) this.ambulance.reset();
    this.crowd.resetActivity?.();
    this.crowd.clearAround(this.allVehicles);
    this.impacts.reset();
    this.events.length = 0;
    this.lastCollision = null;
    this.driverController.startServices?.();
    this.occupants.update(0, this.session);
    this.yieldingForPedestrian = false;
  }
  drainEvents() { return this.events.splice(0); }
  get van() { return this.session.driving ? this.session.van : this.session.nearestVan() ?? this.vans[0]; }
  get entity() { return this.session.entity; }
  dispose() {
    this.driverController.dispose();
    this.occupants.dispose();
    this.player.dispose();
    for (const van of this.vans) van.dispose();
    if (this.bus) this.bus.dispose();
    if (this.ambulance) this.ambulance.dispose();
    this.crowd.dispose();
    this.fleetGroup.clear();
    if (this.busGroup) this.busGroup.clear();
    if (this.ambulanceGroup) this.ambulanceGroup.clear();
  }
}
