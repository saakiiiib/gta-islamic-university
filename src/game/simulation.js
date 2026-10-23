import { PlayerController } from '../player/controller.js';
import { CampusQueries } from '../navigation/campusQueries.js';
import { buildPedestrianGraph } from '../navigation/graph.js';
import { ElectricVan, findVanSpawn } from '../vehicle/controller.js';
import { VehicleSession } from '../vehicle/session.js';
import { PedestrianSystem } from '../npc/pedestrians.js';

/** All moving campus entities share this fixed-step, explicitly suspended simulation. */
export class CampusSimulation {
  constructor(mapData, collisionGroup, { renderCrowd = true } = {}) {
    this.map = mapData; this.suspended = false; this.yieldingForPedestrian = false;
    this.queries = new CampusQueries(mapData);
    this.player = new PlayerController({ collisionGroup, mapData });
    this.van = new ElectricVan({ queries: this.queries, spawn: findVanSpawn(mapData, this.queries) });
    this.session = new VehicleSession(this.player, this.van, this.queries);
    this.player.update(1 / 60); this.player.rig.pose = null; this.player.animate(0);
    this.graph = buildPedestrianGraph(mapData, this.queries);
    this.crowd = new PedestrianSystem(mapData, this.queries, this.graph, { count: 12, render: renderCrowd, avoid: [{ ...this.van.position, radius: 5 }] });
  }
  setSuspended(suspended) { this.suspended = !!suspended; }
  update(dt, input = {}, cameraYaw = 0) {
    if (this.suspended || !Number.isFinite(dt) || dt <= 0) return {};
    if (input.reset) { this.reset(); return { reset: true, changed: true, message: 'Back at Main Gate. Your electric van is parked nearby.' }; }
    let event = {};
    if (input.interact) {
      event = this.session.interact(this.crowd.agents);
      if (event.changed) input = {};
    }
    const duration = Math.min(dt, .1), ticks = Math.ceil(duration * 60);
    for (let i = 0; i < ticks; i++) {
      const step = duration / ticks;
      this.crowd.update(step, this.van);
      this.yieldingForPedestrian = this.session.driving && this.crowd.shouldBrake(this.van);
      this.van.update(step, this.session.driving ? input : {}, { emergencyBrake: this.yieldingForPedestrian, pedestrians: this.crowd.agents });
      this.yieldingForPedestrian ||= this.van.yieldingToPedestrian;
      if (!this.session.driving) this.player.update(step, { ...input, jump: i === 0 && input.jump }, cameraYaw);
    }
    return event;
  }
  animate(dt) {
    if (this.suspended) return;
    if (!this.session.driving) this.player.animate(dt);
    this.van.syncVisuals(dt); this.crowd.animate(dt);
  }
  reset() { this.session.reset(this.map.spawn); this.crowd.clearAround(this.van); this.yieldingForPedestrian = false; }
  get entity() { return this.session.entity; }
  dispose() { this.player.dispose(); this.van.dispose(); this.crowd.dispose(); }
}
