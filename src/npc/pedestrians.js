import { Group, Vector3, MathUtils } from 'three';
import { CrowdRenderer } from './crowdRenderer.js';
import { worldToLocal } from '../navigation/campusQueries.js';

const approach = (a, b, rate) => a < b ? Math.min(b, a + rate) : Math.max(b, a - rate);
const MAX_OFFSET = .78;
const fleetOf = value => (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
const vanDistance = (van, x, z) => typeof van.distanceFrom === 'function' ? van.distanceFrom(x, z) : Math.hypot(x - van.position.x, z - van.position.z);
const offsetFits = (agent, dx, dz) => Math.hypot(agent.offset.x + dx, agent.offset.z + dz) <= MAX_OFFSET + 1e-8;
function random(agent) { agent.seed = (Math.imul(agent.seed, 1664525) + 1013904223) >>> 0; return agent.seed / 4294967296; }

function react(agent, state, time, strength = 1) {
  agent.reactionState = state; agent.reactionTime = time; agent.reactionDuration = time; agent.reactionStrength = strength;
}

/** Nonlethal impact; normal points away from the van. */
export function applyImpact(agent, { speed = 0, normal = { x: 0, z: 0 }, vanId = null, damage } = {}) {
  const crowd = agent?._crowd;
  if (!crowd || crowd.time - agent.lastImpactAt < 1.1) return false;
  const velocity = Math.abs(Number(speed) || 0);
  const injury = Math.max(1, Number.isFinite(damage) ? damage * MathUtils.clamp(.6 + velocity / 7, .6, 1.7) : 3 + velocity * 5);
  agent.health = Math.max(0, agent.health - injury);
  agent.lastImpactAt = crowd.time;
  const high = velocity >= 4 || agent.health <= 25;
  react(agent, high ? 'fallen' : 'stumble', high ? 2.15 : velocity >= 1.8 ? .9 : .6,
    MathUtils.clamp(velocity / 5, .35, 1));
  agent.speed = 0; agent.idleTime = Math.max(agent.idleTime, high ? .8 : .25);
  agent.passTime = 0; agent.blockedTime = 0; agent.blockedReason = null; agent.avoidSpeed = 0;
  let nx = Number(normal?.x) || 0, nz = Number(normal?.z) || 0;
  const length = Math.hypot(nx, nz);
  if (length > 1e-5) { nx /= length; nz /= length; }
  else { nx = -Math.sin(agent.yaw); nz = -Math.cos(agent.yaw); }
  const impulse = MathUtils.clamp(.35 + velocity * .1, .35, MAX_OFFSET);
  agent.impulse.x = nx * impulse; agent.impulse.z = nz * impulse;
  crowd.queueEvent({ type: 'collision', npcId: agent.id, vanId,
    position: { x: agent.position.x, y: agent.position.y, z: agent.position.z },
    severity: high ? 'high' : velocity >= 1.8 ? 'medium' : 'low', speed: velocity });
  return true;
}

export class PedestrianSystem {
  constructor(map, queries, graph, { count = 30, render = true, avoid = [] } = {}) {
    this.queries = queries; this.graph = graph; this.agents = []; this.time = 0; this.events = [];
    const nodes = graph.nodes.filter(n => n.neighbors.length);
    if (!nodes.length) throw new Error('The supplied map has no safe pedestrian routes.');
    const spawn = map.spawn ?? { x: 0, z: 0, yaw: 0 }, selected = [];
    const eligible = nodes.filter(n => Math.hypot(n.x - spawn.x, n.z - spawn.z) > 14 && avoid.every(p => Math.hypot(n.x - p.x, n.z - p.z) > (p.radius ?? 4)));
    const pool = eligible;
    for (let i = 0; i < count; i++) {
      const candidates = [...pool].filter(n => selected.every(p => Math.hypot(n.x - p.x, n.z - p.z) > 5));
      if (!candidates.length) throw new Error('The supplied map does not contain enough clear, separated pedestrian spawn points.');
      const ranked = candidates;
      ranked.sort((a, b) => {
        if (i < 4) {
          const score = n => Math.hypot(n.x - spawn.x, n.z - spawn.z) + (((n.x - spawn.x) * -Math.sin(spawn.yaw) + (n.z - spawn.z) * -Math.cos(spawn.yaw)) < 0 ? 100 : 0);
          return score(a) - score(b);
        }
        const score = n => Math.min(...selected.map(p => Math.hypot(n.x - p.x, n.z - p.z))) + Math.sin(n.id * 14.13 + i) * 8;
        return score(b) - score(a);
      });
      const node = ranked[0]; selected.push(node);
      const next = node.neighbors[(i * 3) % node.neighbors.length];
      this.agents.push({ id: i, _crowd: this, seed: 77321 + i * 7919, current: node.id, target: next.to, previous: -1, progress: 0, edge: next,
        position: new Vector3(node.x, queries.groundHeight(node.x, node.z), node.z), yaw: 0, speed: 0, idleTime: .25 + (i % 4) * .45,
        walkSpeed: 1.12 + (i % 5) * .065, turnRate: 0, rig: null, yielding: false, visited: new Set([node.id]),
        health: 100, reactionState: 'idle', reactionTime: 0, reactionDuration: 0, reactionStrength: 0,
        lastImpactAt: -Infinity, lastNearMissAt: -Infinity, impulse: { x: 0, z: 0 }, offset: { x: 0, z: 0 }, lookYaw: null,
        passTime: 0, blockedTime: 0, blockedReason: null, avoidSpeed: 0 });
    }
    this.renderer = render ? new CrowdRenderer(this.agents) : null;
    this.group = this.renderer?.group ?? new Group(); this.group.name = 'campus-pedestrians';
  }
  reverse(agent) {
    const from = agent.current; agent.current = agent.target; agent.target = from; agent.progress = 1 - agent.progress;
    agent.edge = this.graph.nodes[agent.current].neighbors.find(n => n.to === agent.target);
  }
  nextEdge(agent) {
    const node = this.graph.nodes[agent.current], options = node.neighbors.filter(n => n.to !== agent.previous);
    const choices = options.length ? options : node.neighbors;
    agent.edge = choices[Math.floor(random(agent) * choices.length)]; agent.target = agent.edge.to; agent.progress = 0;
    if (node.neighbors.length !== 2 && random(agent) < .45) agent.idleTime = .7 + random(agent) * 1.8;
  }
  applyImpact(agent, impact) { return applyImpact(agent, impact); }
  queueEvent(event) { this.events.push(event); if (this.events.length > 128) this.events.shift(); }
  drainEvents() { return this.events.splice(0); }
  update(dt, vanOrArray = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(.1, dt), ticks = Math.ceil(duration * 60), fleet = fleetOf(vanOrArray);
    for (let tick = 0; tick < ticks; tick++) {
      const subDt = duration / ticks; this.time += subDt;
      for (const agent of this.agents) this.step(agent, subDt, fleet);
    }
  }
  safeMove(agent, x, z) {
    if (!this.queries.onRoad(x, z) || !this.queries.segmentClear([agent.position.x, agent.position.z], [x, z], .28)) return false;
    if (this.agents.some(other => other !== agent && Math.hypot(other.position.x - x, other.position.z - z) < .52)) return false;
    agent.position.set(x, this.queries.groundHeight(x, z), z);
    return true;
  }
  step(agent, dt, fleet) {
    const nodes = this.graph.nodes;
    agent.idleTime = Math.max(0, agent.idleTime - dt); agent.passTime = Math.max(0, agent.passTime - dt); agent.yielding = false;
    if (agent.blockedReason) agent.blockedTime += dt;
    agent.avoidSpeed = 0;
    if (agent.reactionTime > 0) {
      agent.reactionTime = Math.max(0, agent.reactionTime - dt);
      if (!agent.reactionTime) {
        if (agent.reactionState === 'fallen') react(agent, 'recover', 1.15);
        else agent.reactionState = agent.idleTime ? 'idle' : 'walk';
      }
    }
    if (agent.reactionState === 'recover') agent.health = Math.max(25, Math.min(100, agent.health + 14 * dt));
    else if (agent.reactionState !== 'fallen') agent.health = Math.min(100, agent.health + 2.8 * dt);
    agent.lookYaw = null;
    for (let i = 0; i < fleet.length; i++) {
      const van = fleet[i], proximity = vanDistance(van, agent.position.x, agent.position.z);
      if (proximity >= 3.2) continue;
      const legacy = !Number.isFinite(van.speed) || !van.position;
      let approaching = legacy;
      if (!legacy && Math.abs(van.speed) > .7) {
        const [side, forward] = worldToLocal(agent.position.x, agent.position.z, van.position, van.yaw ?? 0);
        const ahead = van.speed >= 0 ? -forward - (van.config?.front ?? 1.7) : forward - (van.config?.rear ?? 1.82);
        approaching = ahead > -.45 && ahead < 3.1 && Math.abs(side) < (van.config?.halfWidth ?? .82) + 1.15;
      }
      if (!approaching || proximity >= 3 || ['stumble', 'fallen', 'recover'].includes(agent.reactionState)) continue;
      agent.yielding = true; agent.idleTime = 0;
      if (van.position) agent.lookYaw = Math.atan2(agent.position.x - van.position.x, agent.position.z - van.position.z);
      if (!legacy && this.time - agent.lastNearMissAt >= 8) {
        agent.lastNearMissAt = this.time;
        react(agent, 'startled', .65, MathUtils.clamp(Math.abs(van.speed) / 5, .4, 1));
        this.queueEvent({ type: 'nearMiss', npcId: agent.id, vanId: van.id ?? van.vanId ?? i,
          position: { x: agent.position.x, y: agent.position.y, z: agent.position.z },
          severity: proximity < 1 ? 'high' : 'medium', speed: Math.abs(van.speed) });
      }
      const from = nodes[agent.current], to = nodes[agent.target];
      if (vanDistance(van, to.x, to.z) + .15 < vanDistance(van, from.x, from.z)) this.reverse(agent);
      if (!legacy && proximity < 2.1) {
        const dx = agent.position.x - van.position.x, dz = agent.position.z - van.position.z, d = Math.hypot(dx, dz) || 1;
        const sx = dx / d * .35 * dt, sz = dz / d * .35 * dt;
        if (offsetFits(agent, sx, sz) && this.safeMove(agent, agent.position.x + sx, agent.position.z + sz)) { agent.offset.x += sx; agent.offset.z += sz; }
      }
    }
    const impulseLength = Math.hypot(agent.impulse.x, agent.impulse.z);
    if (impulseLength > .002) {
      const dx = agent.impulse.x * Math.min(1, dt * 7), dz = agent.impulse.z * Math.min(1, dt * 7);
      if (offsetFits(agent, dx, dz) && this.safeMove(agent, agent.position.x + dx, agent.position.z + dz)) {
        agent.offset.x += dx; agent.offset.z += dz; agent.impulse.x -= dx; agent.impulse.z -= dz;
      } else { agent.impulse.x = 0; agent.impulse.z = 0; }
    }
    if (agent.reactionState === 'fallen' || agent.reactionState === 'recover') { agent.speed = 0; return; }
    const targetSpeed = agent.idleTime > 0 || agent.reactionState === 'startled' ? 0 : agent.walkSpeed * (agent.reactionState === 'stumble' ? .38 : agent.yielding ? 1.1 : 1);
    agent.speed = approach(agent.speed, targetSpeed, (targetSpeed ? 2.2 : 3) * dt);
    if (!agent.speed) { if (!agent.reactionTime) agent.reactionState = 'idle'; return; }
    if (!agent.reactionTime) agent.reactionState = 'walk';
    const a = nodes[agent.current], b = nodes[agent.target], length = Math.hypot(b.x - a.x, b.z - a.z);
    const progress = Math.min(1, agent.progress + agent.speed * dt / Math.max(.01, length));
    const retain = agent.passTime > 0 ? 1 : Math.max(0, 1 - dt * 1.8), ox = agent.offset.x * retain, oz = agent.offset.z * retain;
    const x = MathUtils.lerp(a.x, b.x, progress) + ox, z = MathUtils.lerp(a.z, b.z, progress) + oz;
    const blockingPeer = this.agents.find(other => other !== agent && Math.hypot(other.position.x - x, other.position.z - z) < .52);
    const blockingVan = fleet.find(van => vanDistance(van, x, z) < .55);
    if (blockingPeer || blockingVan || !this.safeMove(agent, x, z)) {
      const reason = blockingPeer ? 'peer' : blockingVan ? 'van' : 'geometry';
      if (agent.blockedReason !== reason) { agent.blockedReason = reason; agent.blockedTime = 0; }
      if (blockingPeer) {
        // Both walkers choose their own right. Opposing headings therefore
        // lead to opposite sides of the mapped pavement.
        const rightX = -(b.z - a.z) / length, rightZ = (b.x - a.x) / length;
        const side = agent.offset.x * rightX + agent.offset.z * rightZ;
        let shift = Math.min(1.2 * dt, Math.max(0, .48 - side));
        while (shift > .01 && !offsetFits(agent, rightX * shift, rightZ * shift)) shift *= .5;
        if (shift > .01 && this.safeMove(agent, agent.position.x + rightX * shift, agent.position.z + rightZ * shift)) {
          agent.offset.x += rightX * shift; agent.offset.z += rightZ * shift;
          agent.passTime = 1.7; agent.blockedTime = 0; agent.blockedReason = null; agent.idleTime = 0; agent.speed = 0;
          agent.avoidSpeed = shift / dt;
          return;
        }
      }
      if ((blockingPeer || blockingVan) && agent.blockedTime >= 1.2) {
        this.reverse(agent); agent.blockedTime = 0; agent.blockedReason = null; agent.passTime = 0; agent.idleTime = .15; agent.speed = 0;
        return;
      }
      // If the shifted next edge is blocked, unwind the offset along the
      // already checked impact path before trying to advance again.
      const rx = MathUtils.lerp(a.x, b.x, agent.progress) + ox;
      const rz = MathUtils.lerp(a.z, b.z, agent.progress) + oz;
      if (fleet.every(van => vanDistance(van, rx, rz) >= .55) && this.safeMove(agent, rx, rz)) {
        agent.offset.x = ox; agent.offset.z = oz;
      }
      agent.speed = 0; agent.idleTime = .3;
      return;
    }
    agent.blockedTime = 0; agent.blockedReason = null;
    const oldYaw = agent.yaw, desiredYaw = Math.atan2(a.x - b.x, a.z - b.z);
    agent.yaw += Math.atan2(Math.sin(desiredYaw - agent.yaw), Math.cos(desiredYaw - agent.yaw)) * (1 - Math.exp(-10 * dt));
    agent.turnRate = Math.atan2(Math.sin(agent.yaw - oldYaw), Math.cos(agent.yaw - oldYaw)) / dt;
    agent.progress = progress; agent.offset.x = ox; agent.offset.z = oz;
    if (progress >= 1) {
      agent.previous = agent.current; agent.current = agent.target; agent.visited.add(agent.current); this.nextEdge(agent);
    }
  }
  shouldBrake(van) {
    if (!van.occupied || Math.abs(van.speed) < .08) return false;
    const distance = .9 + van.speed * van.speed / (2 * van.config.braking);
    return this.agents.some(agent => {
      const [x, z] = worldToLocal(agent.position.x, agent.position.z, van.position, van.yaw);
      const ahead = van.speed >= 0 ? -z - van.config.front : z - van.config.rear;
      return Math.abs(x) < van.config.halfWidth + .5 && ahead > -.7 && ahead < distance;
    });
  }
  clearAround(vanOrArray) {
    // Reset may return the van to a spot a walker has since reached. Move only
    // that walker to a nearby safe graph node instead of spawning an overlap.
    const fleet = fleetOf(vanOrArray);
    for (const agent of this.agents) {
      if (fleet.every(van => vanDistance(van, agent.position.x, agent.position.z) >= .8)) continue;
      const nodes = this.graph.nodes.filter(n => n.neighbors.length && fleet.every(van => vanDistance(van, n.x, n.z) > 1.2)
        && this.agents.every(other => other === agent || Math.hypot(other.position.x - n.x, other.position.z - n.z) > 1));
      nodes.sort((a, b) => Math.hypot(a.x - agent.position.x, a.z - agent.position.z) - Math.hypot(b.x - agent.position.x, b.z - agent.position.z));
      const node = nodes[0]; if (!node) continue;
      agent.current = node.id; agent.previous = -1; agent.progress = 0; agent.speed = 0; agent.idleTime = .6;
      agent.offset.x = agent.offset.z = agent.impulse.x = agent.impulse.z = 0;
      agent.passTime = agent.blockedTime = agent.avoidSpeed = 0; agent.blockedReason = null;
      agent.edge = node.neighbors[0]; agent.target = agent.edge.to; agent.position.set(node.x, this.queries.groundHeight(node.x, node.z), node.z);
    }
    this.renderer?.update(0);
  }
  animate(dt) { this.renderer?.update(dt); }
  dispose() { this.renderer?.dispose(); this.group.clear(); }
}
