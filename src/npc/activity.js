import { buildActivityHubs } from '../activity/hubs.js';

export const ACTIVITY_ALLOCATION = Object.freeze({ primary: 18, secondary: 8, background: 4 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const positionOf = candidate => ({ x: candidate.x, y: candidate.y ?? 0, z: candidate.z });

/** Samples stay on accepted graph edges, rather than treating a building label as a spawn. */
export function activityCandidates(graph, queries) {
  const points = [], occupied = new Set();
  for (const edge of graph.edges) {
    if (edge.walkingKind === 'crossing') continue;
    const from = graph.nodes[edge.a], to = graph.nodes[edge.b];
    const samples = Math.max(1, Math.ceil(edge.length / 1.5));
    for (let i = 0; i < samples; i++) {
      const progress = i / samples, x = from.x + (to.x - from.x) * progress, z = from.z + (to.z - from.z) * progress;
      const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
      if (occupied.has(key) || !queries.discClear(x, z, .3) || !graph.isWalkable(x, z, .28)) continue;
      const route = from.neighbors.find(n => n.to === to.id);
      if (!route) continue;
      occupied.add(key); points.push({ x, z, current: from.id, target: to.id, progress, edge: route });
    }
  }
  return points;
}

/** A fixed identity pool is redistributed only while completely hidden. */
export class CampusActivity {
  constructor(map, queries, graph, { count = 30, avoid = [], hubs = buildActivityHubs(map) } = {}) {
    this.queries = queries; this.graph = graph; this.spawn = map.spawn ?? { x: 0, z: 0, yaw: 0 };
    this.candidates = activityCandidates(graph, queries);
    if (!this.candidates.length) throw new Error('The supplied map has no safe pedestrian activity points.');
    this.hubs = hubs.filter(hub => this.candidates.some(p => distance(p, hub) < 100));
    // Small synthetic maps retain the same graph-only navigation API in tests.
    if (!this.hubs.length) this.hubs = [{ id: 'route-start', name: 'Pedestrian route', kind: 'route', ...this.candidates[0] }];
    this.primary = this.nearestHub(this.spawn); this.secondary = this.nearestHub(this.primary, this.primary.id);
    this.view = null; this.nextUpdate = 0; this.reassignments = 0; this.count = count; this.routeCosts = new Map();
    this.placements = []; this.avoid = avoid;
    for (let i = 0; i < count; i++) {
      const hub = this.desiredHub(i), placement = this.findPlacement(hub, this.placements, { startup: hub.id === this.primary.id });
      if (!placement) throw new Error('The supplied map does not contain enough clear pedestrian activity points.');
      this.placements.push({ ...placement, hubId: hub.id });
    }
    this.stats = { primaryHub: this.primary.name, walking: 0, pairs: 0, conversation: 0, waiting: 0, reassignments: 0 };
  }
  nearestHub(point, except = null) {
    return this.hubs.filter(h => h.id !== except).sort((a, b) => distance(a, point) - distance(b, point))[0] ?? this.hubs[0];
  }
  desiredHub(index) {
    if (index < Math.min(ACTIVITY_ALLOCATION.primary, this.count)) return this.primary;
    if (index < ACTIVITY_ALLOCATION.primary + ACTIVITY_ALLOCATION.secondary) return this.secondary;
    const background = this.hubs.filter(h => h.id !== this.primary.id && h.id !== this.secondary.id);
    return background.length ? background[(index - 26) % background.length] : this.primary;
  }
  findPlacement(hub, occupied, { startup = false, hidden = false, fleet = [] } = {}) {
    const forward = { x: -Math.sin(this.spawn.yaw ?? 0), z: -Math.cos(this.spawn.yaw ?? 0) };
    const score = point => {
      if (hidden && this.view?.position && hub.id === this.primary.id) {
        const player = this.view.position, forward = this.forward();
        const dx = point.x - player.x, dz = point.z - player.z, ahead = dx * forward.x + dz * forward.z;
        const origin = this.view.camera?.position ?? player;
        const blocked = !this.queries.segmentClear([origin.x, origin.z], [point.x, point.z], .01);
        const costs = this.costsToView(), length = point.edge.length;
        const arrival = Math.min(costs[point.current] + point.progress * length, costs[point.target] + (1 - point.progress) * length);
        // Arrivals enter from an unseen, open approach beside/behind the camera,
        // rather than filling the invisible rear of a library building.
        return (Number.isFinite(arrival) ? arrival * 1.2 : 500) + Math.hypot(dx, dz) * .25
          + Math.abs(ahead + 12) * .08 + distance(point, hub) * .08 + (blocked ? 20 : 0);
      }
      const d = distance(point, startup ? this.spawn : hub);
      const ahead = (point.x - this.spawn.x) * forward.x + (point.z - this.spawn.z) * forward.z;
      const side = Math.abs((point.x - this.spawn.x) * forward.z - (point.z - this.spawn.z) * forward.x);
      const occluded = startup && !this.queries.segmentClear([this.spawn.x, this.spawn.z], [point.x, point.z], .01);
      return d + (startup ? (ahead < 7 ? 160 : 0) + side * .45 + (occluded ? 180 : 0) : 0)
        + (point.edge.walkingKind === 'footpath' ? -3 : 0);
    };
    const valid = this.candidates.filter(p => distance(p, hub) < (startup ? 130 : 100)
      && (!startup || distance(p, this.spawn) > 9)
      && occupied.every(other => distance(p, other.position ?? other) >= 2.5)
      && this.avoid.every(other => distance(p, other) > (other.radius ?? 4))
      && fleet.every(van => (van.distanceFrom?.(p.x, p.z) ?? distance(van.position, p)) > 1.5)
      && this.queries.discClear(p.x, p.z, .3)
      && (!hidden || !this.view?.position || distance(p, this.view.position) >= 12)
      && (!hidden || !this.visible(p)));
    // Only fixture maps without multiple hubs need the wider fallback pool.
    if (!valid.length && this.hubs.length === 1 && !hidden) return this.candidates.filter(p => occupied.every(o => distance(p, o.position ?? o) >= 2.5)
      && this.avoid.every(o => distance(p, o) > (o.radius ?? 4))).sort((a, b) => score(a) - score(b))[0];
    return valid.sort((a, b) => score(a) - score(b))[0];
  }
  attach(agents) {
    this.agents = agents;
    for (const agent of agents) {
      agent.activityHub = this.placements[agent.id].hubId;
      agent.activityRole = 'walk'; agent.partnerId = null; agent.socialUntil = 0;
      agent.nextSocialAt = 32 + (agent.id % 6) * 3;
      agent.behavior = 'walk'; agent.hiddenSince = null; agent.lastVoiceAt = -Infinity;
    }
    // Match neighbours on the same pavement, not array neighbours across a road.
    for (let first = 0; this.hubs[0].kind !== 'route' && first < agents.length && agents.length >= 6; first += 10) {
      const group = agents.slice(first, first + 10);
      for (const role of ['pair', 'conversation']) {
        const free = group.filter(agent => agent.activityRole === 'walk');
        const matches = free.flatMap((a, i) => free.slice(i + 1).filter(b => a.activityHub === b.activityHub).map(b => [a, b]));
        matches.sort((a, b) => distance(a[0].position, a[1].position) - distance(b[0].position, b[1].position));
        const [a, b] = matches[0] ?? [];
        if (!b || distance(a.position, b.position) > 4.1) continue;
        for (const [member, partner] of [[a, b], [b, a]]) {
          member.activityRole = role; member.partnerId = partner.id;
          member.socialUntil = role === 'conversation' ? 8 + first % 3 : 0;
        }
        if (role === 'pair') {
          const from = this.graph.nodes[a.current], to = this.graph.nodes[a.target], dx = to.x - from.x, dz = to.z - from.z;
          const bFrom = this.graph.nodes[b.current], bTo = this.graph.nodes[b.target];
          if ((bTo.x - bFrom.x) * dx + (bTo.z - bFrom.z) * dz < 0) {
            [b.current, b.target] = [b.target, b.current]; b.progress = 1 - b.progress;
            b.edge = this.graph.nodes[b.current].neighbors.find(edge => edge.to === b.target);
          }
          const leader = (a.position.x - b.position.x) * dx + (a.position.z - b.position.z) * dz > 0 ? a.id : b.id;
          a.pairLeaderId = b.pairLeaderId = leader; a.walkSpeed = b.walkSpeed = Math.min(a.walkSpeed, b.walkSpeed);
        }
      }
      const waiting = group.find(agent => agent.activityRole === 'walk');
      if (waiting) { waiting.activityRole = 'waiting'; waiting.socialUntil = 6; }
    }
  }
  setView(view) { this.view = view; this.visibilityCache = null; }
  forward() {
    const matrix = this.view?.camera?.matrixWorld?.elements;
    if (matrix) {
      const x = -matrix[8], z = -matrix[10], length = Math.hypot(x, z) || 1;
      return { x: x / length, z: z / length };
    }
    return { x: -Math.sin(this.spawn.yaw ?? 0), z: -Math.cos(this.spawn.yaw ?? 0) };
  }
  visible(point) {
    if (!this.view) return true; // Unknown visibility must never authorize a relocation.
    if (typeof this.view.visible === 'function') {
      const key = `${Math.round(point.x * 1000)}:${Math.round(point.z * 1000)}:${point.y ?? 0}`;
      if (this.visibilityCache?.has(key)) return this.visibilityCache.get(key);
      const visible = !!this.view.visible(positionOf(point)); this.visibilityCache?.set(key, visible); return visible;
    }
    return true;
  }
  canReassign(agent, time) {
    const position = this.view?.position;
    return !!position && distance(agent.position, position) > 160 && agent.hiddenSince != null && time - agent.hiddenSince >= 3
      && agent.health >= 99.5 && !agent.reactionTime && !agent.yielding && !agent.voicePlaying
      && !['stumble', 'startled', 'fallen', 'recover'].includes(agent.reactionState)
      && time - agent.lastImpactAt > 12 && time - agent.lastNearMissAt > 8 && time - (agent.lastVoiceAt ?? -Infinity) > 8;
  }
  update(time, fleet = []) {
    if (time + 1e-8 < this.nextUpdate) return;
    this.nextUpdate = time + .5; this.visibilityCache = new Map(); this.arrivalCosts = null;
    const position = this.view?.position;
    if (position) {
      const next = this.nearestHub(position);
      if (next.id !== this.primary.id && distance(this.primary, position) > 45 && distance(next, position) + 20 < distance(this.primary, position)) {
        this.primary = next; this.secondary = this.nearestHub(position, next.id);
      }
    }
    let changed = 0;
    for (const agent of this.agents) {
      if (this.visible(agent.position)) agent.hiddenSince = null;
      else agent.hiddenSince ??= time;
      const hub = this.desiredHub(agent.id);
      // Nearby identities change destination by walking. Teleportation is never
      // necessary to cover adjacent library/faculty hubs less than 160m apart.
      if (!position || distance(agent.position, position) <= 160 || distance(agent.position, hub) < 100) {
        if (agent.activityHub !== hub.id) {
          agent.activityHub = hub.id; agent.ingressUntil = 0; agent.ingressDirection = agent.ingressCosts = null;
          agent.transferActive = true;
          agent.socialUntil = 0; agent.nextSocialAt = Math.max(agent.nextSocialAt, time + 20);
          // Lock an arrival approach when the activity hub changes, rather than
          // steering the crowd to an interior label anchor behind its building.
          const arrival = hub.id === this.primary.id && this.view?.camera ? this.costsToView() : null;
          if (arrival && Number.isFinite(arrival[agent.current]) && arrival[agent.current] > 8) {
            agent.ingressCosts = arrival; agent.ingressUntil = time + 120; agent.ingressDirection = this.forward();
          }
          const costs = agent.ingressCosts ?? this.costsToHub(hub);
          if (Number.isFinite(costs[agent.current]) && costs[agent.target] > costs[agent.current]) {
            const from = agent.current; agent.current = agent.target; agent.target = from; agent.progress = 1 - agent.progress;
            agent.edge = this.graph.nodes[agent.current].neighbors.find(edge => edge.to === agent.target);
          }
        }
        continue;
      }
      if (changed >= 2 || !this.canReassign(agent, time)) continue;
      const candidate = this.findPlacement(hub, this.agents.filter(a => a !== agent), { hidden: true, fleet });
      const point = candidate && { ...candidate };
      if (!point || distance(point, position) < 12) continue;
      const forward = this.forward(), from = this.graph.nodes[point.current], to = this.graph.nodes[point.target];
      if ((to.x - from.x) * forward.x + (to.z - from.z) * forward.z < 0) {
        [point.current, point.target] = [point.target, point.current]; point.progress = 1 - point.progress;
        point.edge = this.graph.nodes[point.current].neighbors.find(edge => edge.to === point.target);
      }
      agent.current = point.current; agent.target = point.target; agent.edge = point.edge; agent.progress = point.progress;
      agent.previous = -1; agent.speed = 0; agent.idleTime = .3;
      agent.offset.x = agent.offset.z = agent.impulse.x = agent.impulse.z = 0;
      agent.passTime = agent.blockedTime = agent.avoidSpeed = agent.routeStallTime = agent.retreatUntil = 0; agent.blockedReason = null;
      agent.position.set(point.x, this.queries.groundHeight(point.x, point.z), point.z);
      agent.yaw = Math.atan2(this.graph.nodes[point.current].x - this.graph.nodes[point.target].x, this.graph.nodes[point.current].z - this.graph.nodes[point.target].z);
      agent.activityHub = hub.id; agent.hiddenSince = time; agent.socialUntil = 0;
      agent.transferActive = true;
      agent.ingressDirection = forward; agent.ingressUntil = time + 22;
      agent.ingressCosts = hub.id === this.primary.id ? this.costsToView() : null;
      if (agent.ingressCosts && agent.ingressCosts[point.target] > agent.ingressCosts[point.current]) {
        const from = agent.current; agent.current = agent.target; agent.target = from; agent.progress = 1 - agent.progress;
        agent.edge = this.graph.nodes[agent.current].neighbors.find(edge => edge.to === agent.target);
      }
      agent.rig && (agent.rig.phase = 0); this.reassignments++; changed++;
    }
    this.stats = { primaryHub: this.primary.name, walking: this.agents.filter(a => a.behavior === 'walk').length,
      pairs: this.agents.filter(a => a.behavior === 'pair').length, conversation: this.agents.filter(a => a.behavior === 'conversation').length,
      waiting: this.agents.filter(a => a.behavior === 'waiting').length, reassignments: this.reassignments };
  }
  /** Social intent stays separate from injury and always yields to physical reactions. */
  behavior(agent, time) {
    agent.activityLookYaw = null;
    if (time < (agent.ingressUntil ?? 0)) { agent.socialUntil = 0; agent.nextSocialAt = Math.max(agent.nextSocialAt, agent.ingressUntil + 8); }
    if (agent.reactionTime > 0 || agent.yielding || time - agent.lastImpactAt < 2 || time - agent.lastNearMissAt < 1) {
      agent.socialUntil = 0; agent.behavior = 'walk'; return { stop: false, speed: 1 };
    }
    const partner = this.agents[agent.partnerId], nearPartner = partner && distance(agent.position, partner.position) < 4.2;
    if (time >= agent.nextSocialAt && agent.activityRole !== 'pair') {
      agent.nextSocialAt = time + 38 + agent.id % 7;
      if (agent.activityRole === 'waiting' || (agent.activityRole === 'conversation' && nearPartner)) agent.socialUntil = time + 8 + agent.id % 5;
    }
    const stop = time < agent.socialUntil && (agent.activityRole === 'waiting' || (agent.activityRole === 'conversation' && nearPartner));
    agent.behavior = stop ? agent.activityRole : agent.activityRole === 'pair' && nearPartner ? 'pair' : 'walk';
    if (stop && nearPartner) agent.activityLookYaw = Math.atan2(agent.position.x - partner.position.x, agent.position.z - partner.position.z);
    // A follower eases behind the leader on narrow paths, without bypassing safeMove.
    const leader = agent.activityRole === 'pair' && agent.pairLeaderId !== agent.id && nearPartner ? partner : null;
    const gap = leader ? distance(agent.position, leader.position) : 0;
    return { stop, speed: leader && agent.edge.width < 2 ? (gap < 1.1 ? .5 : gap > 2.5 ? 1.08 : 1) : 1 };
  }
  edgeWeight(agent, edge) {
    const hub = this.hubs.find(h => h.id === agent.activityHub) ?? this.primary;
    const current = this.graph.nodes[agent.current], next = this.graph.nodes[edge.to];
    const costs = this.costsToHub(hub), outward = costs[next.id] - costs[current.id];
    const confined = distance(current, hub) > 45;
    const partner = this.agents[agent.partnerId];
    const partnerChoice = agent.activityRole === 'pair' && partner && distance(agent.position, partner.position) < 6
      && (partner.current === edge.to || partner.target === edge.to);
    const ingress = agent._crowd.time < (agent.ingressUntil ?? 0) ? agent.ingressDirection : null;
    const alignment = ingress ? ((next.x - current.x) * ingress.x + (next.z - current.z) * ingress.z) / Math.max(.01, edge.length) : 0;
    const ingressStep = ingress && agent.ingressCosts ? agent.ingressCosts[next.id] - agent.ingressCosts[current.id] : NaN;
    return (edge.walkingKind === 'footpath' ? 5 : edge.walkingKind === 'crossing' ? .3 : 1)
      * (ingress ? Number.isFinite(ingressStep) ? ingressStep < 0 ? 12 : .02 : Math.exp(alignment * 2)
        : confined && Number.isFinite(outward) ? outward > 0 ? .04 : 8 : 1) * (partnerChoice ? 5 : 1);
  }
  costsToView() {
    if (this.arrivalCosts) return this.arrivalCosts;
    const player = this.view?.position, forward = this.forward();
    if (!player) return new Float64Array(this.graph.nodes.length).fill(Infinity);
    const targets = this.graph.nodes.filter(node => distance(node, player) < 80
      && (node.x - player.x) * forward.x + (node.z - player.z) * forward.z > 8 && this.visible(node));
    this.arrivalCosts = this.costsFromNodes(targets); return this.arrivalCosts;
  }
  costsToHub(hub) {
    if (this.routeCosts.has(hub.id)) return this.routeCosts.get(hub.id);
    const nearest = Math.min(...this.graph.nodes.map(node => distance(node, hub)));
    const costs = this.costsFromNodes(this.graph.nodes.filter(node => distance(node, hub) < nearest + 8));
    this.routeCosts.set(hub.id, costs); return costs;
  }
  costsFromNodes(targets) {
    const costs = new Float64Array(this.graph.nodes.length).fill(Infinity), queue = [];
    for (const node of targets) { costs[node.id] = 0; queue.push({ id: node.id, cost: 0 }); }
    while (queue.length) {
      queue.sort((a, b) => b.cost - a.cost);
      const item = queue.pop(); if (costs[item.id] !== item.cost) continue;
      for (const edge of this.graph.nodes[item.id].neighbors) {
        const cost = item.cost + edge.length * (edge.walkingKind === 'crossing' ? 2 : edge.walkingKind === 'footpath' ? 1 : 1.2);
        if (cost < costs[edge.to]) { costs[edge.to] = cost; queue.push({ id: edge.to, cost }); }
      }
    }
    return costs;
  }
}
