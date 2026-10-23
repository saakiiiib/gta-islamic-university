import { Group, Vector3, MathUtils } from 'three';
import { CrowdRenderer } from './crowdRenderer.js';
import { worldToLocal } from '../navigation/campusQueries.js';

const approach = (a, b, rate) => a < b ? Math.min(b, a + rate) : Math.max(b, a - rate);
function random(agent) { agent.seed = (Math.imul(agent.seed, 1664525) + 1013904223) >>> 0; return agent.seed / 4294967296; }

export class PedestrianSystem {
  constructor(map, queries, graph, { count = 12, render = true, avoid = [] } = {}) {
    this.queries = queries; this.graph = graph; this.agents = []; this.time = 0;
    const nodes = graph.nodes.filter(n => n.neighbors.length);
    if (!nodes.length) throw new Error('The supplied map has no safe pedestrian routes.');
    const spawn = map.spawn ?? { x: 0, z: 0, yaw: 0 }, selected = [];
    const eligible = nodes.filter(n => Math.hypot(n.x - spawn.x, n.z - spawn.z) > 14 && avoid.every(p => Math.hypot(n.x - p.x, n.z - p.z) > (p.radius ?? 4)));
    const pool = eligible;
    for (let i = 0; i < Math.min(15, Math.max(10, count)); i++) {
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
      this.agents.push({ id: i, seed: 77321 + i * 7919, current: node.id, target: next.to, previous: -1, progress: 0, edge: next,
        position: new Vector3(node.x, queries.groundHeight(node.x, node.z), node.z), yaw: 0, speed: 0, idleTime: .25 + (i % 4) * .45,
        walkSpeed: 1.12 + (i % 5) * .065, turnRate: 0, rig: null, yielding: false, visited: new Set([node.id]) });
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
  update(dt, van = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(.1, dt), ticks = Math.ceil(duration * 60);
    for (let tick = 0; tick < ticks; tick++) for (const agent of this.agents) this.step(agent, duration / ticks, van);
  }
  step(agent, dt, van) {
    const nodes = this.graph.nodes;
    agent.idleTime = Math.max(0, agent.idleTime - dt); agent.yielding = false;
    if (van && van.distanceFrom(agent.position.x, agent.position.z) < 2.8) {
      const from = nodes[agent.current], to = nodes[agent.target]; agent.yielding = true; agent.idleTime = 0;
      if (van.distanceFrom(to.x, to.z) + .15 < van.distanceFrom(from.x, from.z)) this.reverse(agent);
    }
    const targetSpeed = agent.idleTime > 0 ? 0 : agent.walkSpeed * (agent.yielding ? 1.12 : 1);
    agent.speed = approach(agent.speed, targetSpeed, (targetSpeed ? 2.2 : 3) * dt);
    if (!agent.speed) return;
    const a = nodes[agent.current], b = nodes[agent.target], distance = Math.hypot(b.x - a.x, b.z - a.z);
    const progress = Math.min(1, agent.progress + agent.speed * dt / Math.max(.01, distance));
    const x = MathUtils.lerp(a.x, b.x, progress), z = MathUtils.lerp(a.z, b.z, progress);
    if (!this.queries.segmentClear([agent.position.x, agent.position.z], [x, z], .28) || (van && van.distanceFrom(x, z) < .55)) {
      agent.speed = 0; agent.idleTime = .3;
      return;
    }
    const oldYaw = agent.yaw, desiredYaw = Math.atan2(a.x - b.x, a.z - b.z);
    agent.yaw += Math.atan2(Math.sin(desiredYaw - agent.yaw), Math.cos(desiredYaw - agent.yaw)) * (1 - Math.exp(-10 * dt));
    agent.turnRate = (agent.yaw - oldYaw) / dt;
    agent.position.set(x, this.queries.groundHeight(x, z), z); agent.progress = progress;
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
  clearAround(van) {
    // Reset may return the van to a spot a walker has since reached. Move only
    // that walker to a nearby safe graph node instead of spawning an overlap.
    for (const agent of this.agents) {
      if (van.distanceFrom(agent.position.x, agent.position.z) >= .8) continue;
      const nodes = this.graph.nodes.filter(n => n.neighbors.length && van.distanceFrom(n.x, n.z) > 1.2
        && this.agents.every(other => other === agent || Math.hypot(other.position.x - n.x, other.position.z - n.z) > 1));
      nodes.sort((a, b) => Math.hypot(a.x - agent.position.x, a.z - agent.position.z) - Math.hypot(b.x - agent.position.x, b.z - agent.position.z));
      const node = nodes[0]; if (!node) continue;
      agent.current = node.id; agent.previous = -1; agent.progress = 0; agent.speed = 0; agent.idleTime = .6;
      agent.edge = node.neighbors[0]; agent.target = agent.edge.to; agent.position.set(node.x, this.queries.groundHeight(node.x, node.z), node.z);
    }
    this.renderer?.update(0);
  }
  animate(dt) { this.renderer?.update(dt); }
  dispose() { this.renderer?.dispose(); this.group.clear(); }
}
