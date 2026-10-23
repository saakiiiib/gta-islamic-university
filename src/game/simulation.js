import { PlayerController } from '../player/controller.js';
import { CampusQueries } from '../navigation/campusQueries.js';
import { buildPedestrianGraph } from '../navigation/graph.js';
import { createVanFleet } from '../vehicle/fleet.js';
import { VehicleSession } from '../vehicle/session.js';
import { PedestrianSystem } from '../npc/pedestrians.js';
import { VanOccupants } from '../vehicle/occupants.js';
import { ImpactSystem } from './impacts.js';

/** All moving campus entities share this fixed-step, explicitly suspended simulation. */
export class CampusSimulation {
  constructor(mapData, collisionGroup, { renderCrowd = true } = {}) {
    this.map = mapData; this.suspended = false; this.yieldingForPedestrian = false; this.events = []; this.lastCollision = null;
    this.queries = new CampusQueries(mapData);
    this.player = new PlayerController({ collisionGroup, mapData });
    const fleet = createVanFleet(mapData, this.queries);
    this.vans = fleet.vans; this.fleetGroup = fleet.group;
    this.session = new VehicleSession(this.player, this.vans, this.queries);
    this.player.update(1 / 60); this.player.rig.pose = null; this.player.animate(0);
    this.graph = buildPedestrianGraph(mapData, this.queries);
    this.crowd = new PedestrianSystem(mapData, this.queries, this.graph, { count: 30, render: renderCrowd, avoid: this.vans.map(v => ({ ...v.position, radius: 5 })) });
    this.impacts = new ImpactSystem(this.crowd);
    this.occupants = new VanOccupants(this.vans, this.player, { render: renderCrowd });
  }
  setSuspended(suspended) { this.suspended = !!suspended; }
  update(dt, input = {}, cameraYaw = 0) {
    if (this.suspended || !Number.isFinite(dt) || dt <= 0) return {};
    if (input.reset) { this.reset(); return { reset: true, changed: true, message: 'Back at Main Gate. Eight vans repaired and parked.' }; }
    let event = {};
    if (input.interact) {
      event = this.session.interact(this.crowd.agents);
      if (event.changed) { input = {}; this.occupants.update(0, this.session); }
    }
    const duration = Math.min(dt, .1), ticks = Math.ceil(duration * 60);
    for (let i = 0; i < ticks; i++) {
      const step = duration / ticks;
      this.impacts.update(step); this.crowd.update(step, this.vans);
      if (this.session.driving) this.session.van.update(step, input, { pedestrians: this.crowd.agents, vans: this.vans, onImpact: impact => this.impacts.handle(impact) });
      if (!this.session.driving) this.player.update(step, { ...input, jump: i === 0 && input.jump }, cameraYaw);
      const events = [...this.crowd.drainEvents(), ...this.impacts.drainEvents()];
      for (const reaction of events) {
        if (reaction.type === 'collision') this.lastCollision = { npcId: reaction.npcId, time: this.impacts.time };
        this.events.push(reaction); if (this.events.length > 128) this.events.shift();
      }
    }
    return event;
  }
  animate(dt) {
    if (this.suspended) return;
    if (!this.session.driving) this.player.animate(dt);
    for (const van of this.vans) van.syncVisuals(dt);
    this.occupants.update(dt, this.session); this.crowd.animate(dt);
  }
  reset() {
    this.session.reset(this.map.spawn); this.crowd.clearAround(this.vans); this.impacts.reset(); this.events.length = 0; this.lastCollision = null;
    this.occupants.update(0, this.session); this.yieldingForPedestrian = false;
  }
  drainEvents() { return this.events.splice(0); }
  get van() { return this.session.driving ? this.session.van : this.session.nearestVan() ?? this.vans[0]; }
  get entity() { return this.session.entity; }
  dispose() { this.occupants.dispose(); this.player.dispose(); for (const van of this.vans) van.dispose(); this.crowd.dispose(); this.fleetGroup.clear(); }
}
