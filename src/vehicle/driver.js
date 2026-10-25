import { rectangleFootprint } from '../navigation/campusQueries.js';
import { getVehicleNetwork, closestRoutePosition, routeSample, buildPickupApproach } from './routes.js';
import { findPickupCandidates } from './fleet.js';
import { touchesPedestrian, vansOverlap } from './contacts.js';

const VEHICLE_ROAD = /^(service|unclassified|tertiary|residential)$/;
const CRUISE_SPEED = 3.2;
const END_TOLERANCE = .45;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const heading = (a, b) => Math.atan2(a[0] - b[0], a[1] - b[1]);
const unit = (a, b) => { const length = distance(a, b); return length > 1e-6 ? [(b[0] - a[0]) / length, (b[1] - a[1]) / length] : [0, 0]; };

/** Continue an existing van along surveyed vehicle roads after its passenger steps off. */
export class DriverContinuation {
  constructor(map, queries, vans) {
    this.map = map; this.queries = queries; this.vans = Array.from(vans);
    this.active = new Map();
    this.network = getVehicleNetwork(map, queries); this.time = 0; this.reservations = new Map();
    this.pickups = findPickupCandidates(map, queries);
    this.segments = [];
    for (const road of map.roads ?? []) {
      if (!VEHICLE_ROAD.test(road.kind)) continue;
      for (const path of road.paths ?? []) for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], length = distance(a, b);
        if (length > .05) this.segments.push({ a, b, length, road });
      }
    }
    // Indexed endpoints give a connection only where source paths really meet.
    this.ends = new Map();
    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i];
      for (const [point, dir] of [[segment.a, 1], [segment.b, -1]]) {
        const key = `${Math.round(point[0])},${Math.round(point[1])}`;
        if (!this.ends.has(key)) this.ends.set(key, []);
        this.ends.get(key).push({ index: i, dir, point });
      }
    }
  }

  isActive(van) { return this.active.has(van); }

  startServices() {
    for (const van of this.vans) {
      if (van.role !== 'service' || van.occupied || van.disabled) continue;
      const atOriginalStop = Math.hypot(van.position.x - van.spawn.x, van.position.z - van.spawn.z) < .1;
      const routeId = atOriginalStop ? van.spawn.routeId ?? van.serviceRouteId : van.serviceRouteId;
      const circuit = this.network.routes.find(r => r.id === routeId);
      if (!circuit) continue;
      const closest = closestRoutePosition(circuit, van.position);
      van.autonomous = true;
      van.serviceRouteId = circuit.id;
      this.active.set(van, { circuit, index: closest.index, progress: closest.s, travelled: 0, laps: 0,
        blockedTime: 0, retryAt: 8, status: 'driving', service: true });
    }
    return [...this.active.values()].filter(s => s.service).length;
  }

  nearestRoute(van) {
    const position = [van.position.x, van.position.z];
    const facing = [-Math.sin(van.yaw), -Math.cos(van.yaw)];
    let best = null, score = Infinity;
    for (let index = 0; index < this.segments.length; index++) {
      const segment = this.segments[index], dx = segment.b[0] - segment.a[0], dz = segment.b[1] - segment.a[1];
      const t = clamp(((position[0] - segment.a[0]) * dx + (position[1] - segment.a[1]) * dz) / (segment.length ** 2), 0, 1);
      const separation = Math.hypot(position[0] - segment.a[0] - dx * t, position[1] - segment.a[1] - dz * t);
      if (separation > Math.max(3.2, (segment.road.width ?? 6) / 2 + .5)) continue;
      for (const dir of [1, -1]) {
        const along = unit(dir === 1 ? segment.a : segment.b, dir === 1 ? segment.b : segment.a);
        const alignment = facing[0] * along[0] + facing[1] * along[1];
        if (alignment < .32) continue;
        const remaining = dir === 1 ? segment.length * (1 - t) : segment.length * t;
        const candidate = separation + (1 - alignment) * 2 + (remaining < 3 ? (3 - remaining) * .5 : 0);
        if (candidate < score) { best = { index, dir }; score = candidate; }
      }
    }
    return best;
  }

  depart(van) {
    if (!this.vans.includes(van) || van.disabled) return false;
    van.occupied = false;
    van.autonomous = true;
    const circuit = van.role === 'service' ? this.network.routes.find(r => r.id === van.serviceRouteId) : null;
    const near = circuit ? closestRoutePosition(circuit, van.position) : null;
    const state = near && near.distance < 5 ? { circuit, index: near.index, progress: near.s,
      travelled: 0, laps: 0, blockedTime: 0, retryAt: 8, status: 'driving', service: true }
      : { route: this.nearestRoute(van), blockedTime: 0, retryAt: 8, status: 'driving', travelled: 0, service: van.role === 'service' };
    if (van.role === 'pickup') this.planPickup(van, state);
    this.active.set(van, state);
    return true;
  }

  planPickup(van, state) {
    const candidates = this.pickups.filter(p => this.vans.every(other => other === van || Math.hypot(other.position.x - p.x, other.position.z - p.z) > 9));
    candidates.sort((a, b) => Math.hypot(a.x - van.position.x, a.z - van.position.z) - Math.hypot(b.x - van.position.x, b.z - van.position.z));
    for (const pickup of candidates) {
      const circuit = buildPickupApproach(van, pickup, this.queries);
      if (!circuit) continue;
      state.circuit = circuit; state.index = 0; state.progress = 0; state.travelled = 0;
      return true;
    }
    return false;
  }

  circuitTarget(van, state) {
    let near = closestRoutePosition(state.circuit, van.position, state.index);
    if (near.distance > 8) near = closestRoutePosition(state.circuit, van.position);
    const delta = state.circuit.closed === false ? near.s - state.progress
      : (near.s - state.progress + state.circuit.length * 1.5) % state.circuit.length - state.circuit.length / 2;
    if (delta > 0 && delta < 5) state.travelled += delta;
    state.index = near.index; state.progress = near.s; state.laps = Math.floor(state.travelled / state.circuit.length);
    const lookahead = clamp(2.2 + Math.abs(van.speed) * .6, 2.2, 4.2);
    const sample = routeSample(state.circuit, near.s + lookahead);
    let curvature = 0;
    for (const advance of [0, 3, 6, 9]) {
      const a = routeSample(state.circuit, near.s + advance), b = routeSample(state.circuit, near.s + advance + 2);
      curvature = Math.max(curvature, Math.abs(angleDelta(b.yaw, a.yaw)) / 2);
    }
    const remaining = state.circuit.closed === false ? state.circuit.length - near.s : Infinity;
    const speed = Math.min(curvature > .19 ? 1.15 : curvature > .14 ? 1.65 : curvature > .08 ? 2.15 : 3.05, Math.sqrt(Math.max(0, remaining - .23) * 3.2));
    return { point: sample.point, remaining, deadEnd: state.circuit.closed === false, lookahead, speed };
  }

  // Select the gentlest outgoing source segment. An endpoint is never joined across a gap.
  continuation(route) {
    const segment = this.segments[route.index];
    const end = route.dir === 1 ? segment.b : segment.a;
    const incoming = unit(route.dir === 1 ? segment.a : segment.b, end);
    let best = null, bestDot = -.1;
    for (let x = Math.round(end[0]) - 1; x <= Math.round(end[0]) + 1; x++) {
      for (let z = Math.round(end[1]) - 1; z <= Math.round(end[1]) + 1; z++) {
        for (const candidate of this.ends.get(`${x},${z}`) ?? []) {
          if (candidate.index === route.index || distance(end, candidate.point) > END_TOLERANCE) continue;
          const next = this.segments[candidate.index];
          const outgoing = unit(candidate.dir === 1 ? next.a : next.b, candidate.dir === 1 ? next.b : next.a);
          const dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1];
          if (dot > bestDot) { best = { index: candidate.index, dir: candidate.dir }; bestDot = dot; }
        }
      }
    }
    return best;
  }

  routeTarget(van, state) {
    if (!state.route) return null;
    let route = state.route;
    const point = [van.position.x, van.position.z];
    let segment = this.segments[route.index];
    let start = route.dir === 1 ? segment.a : segment.b;
    let end = route.dir === 1 ? segment.b : segment.a;
    let forward = unit(start, end);
    let progress = clamp((point[0] - start[0]) * forward[0] + (point[1] - start[1]) * forward[1], 0, segment.length);
    if (segment.length - progress < 1.6) {
      const next = this.continuation(route);
      if (next) {
        state.route = route = next;
        segment = this.segments[route.index];
        start = route.dir === 1 ? segment.a : segment.b;
        end = route.dir === 1 ? segment.b : segment.a;
        forward = unit(start, end);
        progress = 0;
      }
    }
    const remaining = segment.length - progress;
    const lookahead = van.role === 'pickup' ? clamp(6 + Math.abs(van.speed) * .5, 6, 8)
      : clamp(2.5 + Math.abs(van.speed) * .65, 2.5, 5.5);
    if (remaining >= lookahead) return { point: [start[0] + forward[0] * (progress + lookahead), start[1] + forward[1] * (progress + lookahead)], remaining, deadEnd: false };
    const next = this.continuation(route);
    if (next) {
      const joined = this.segments[next.index];
      const a = next.dir === 1 ? joined.a : joined.b;
      const b = next.dir === 1 ? joined.b : joined.a;
      const along = unit(a, b), advance = Math.min(joined.length, lookahead - remaining);
      return { point: [a[0] + along[0] * advance, a[1] + along[1] * advance], remaining, deadEnd: false };
    }
    return { point: end, remaining, deadEnd: true };
  }

  roadFootprintClear(position, yaw, config) {
    if (!this.queries.rectangleClear(position, yaw, config)) return false;
    return rectangleFootprint(position, yaw, config).every(([x, z]) => this.queries.onRoad(x, z));
  }

  park(van) {
    van.speed = 0;
    van.autonomous = false;
    this.active.delete(van);
  }

  obstacleAhead(van, pedestrians, player, state) {
    const hx = -Math.sin(van.yaw), hz = -Math.cos(van.yaw);
    const stopping = Math.max(2.1, van.speed * van.speed / (2 * van.config.braking) + 1.1);
    for (const obstacle of [...pedestrians, ...(player?.position ? [player] : []), ...this.vans.filter(v => v !== van)]) {
      const position = obstacle.position;
      if (!position || Math.abs((position.y ?? 0) - van.position.y) > 1.1) continue;
      const dx = position.x - van.position.x, dz = position.z - van.position.z, forward = dx * hx + dz * hz;
      const side = Math.abs(dx * hz - dz * hx), isVan = !!obstacle.config?.halfWidth;
      if (state.circuit) {
        if (Math.hypot(dx, dz) > stopping + 6) continue;
        // Follow the validated bend rather than an imaginary straight ray:
        // the standing Gate student must not block a van that curves past.
        for (let d = 0; d <= stopping + .2; d += .35) {
          const sample = routeSample(state.circuit, state.progress + d);
          const predicted = d === 0 ? van.position : { x: sample.point[0], y: van.position.y, z: sample.point[1] };
          const yaw = d === 0 ? van.yaw : sample.yaw;
          if (isVan ? vansOverlap(predicted, yaw, van.config, obstacle, .1)
            : touchesPedestrian(predicted, yaw, van.config, obstacle, (obstacle.config?.radius ?? .36) + .14)) return obstacle;
        }
        continue;
      }
      const radius = isVan ? obstacle.config.halfWidth + .16 : (obstacle.config?.radius ?? .28) + .22;
      const allowance = isVan ? Math.max(obstacle.config.front, obstacle.config.rear) : .35;
      if (forward > -.1 && forward < stopping + van.config.front + allowance && side < van.config.halfWidth + radius) return obstacle;
    }
    return null;
  }

  reserveIntersection(van, state) {
    if (!state.circuit) return false;
    // A source junction is shared only while a van actually approaches it.
    let nearest = null, distanceTo = Infinity;
    for (const id of state.circuit.sourceNodes ?? []) {
      const node = this.network.graph.nodes[id];
      if (!node || node.edges.length < 3) continue;
      const dx = node.point[0] - van.position.x, dz = node.point[1] - van.position.z;
      const d = Math.hypot(dx, dz), forward = dx * -Math.sin(van.yaw) + dz * -Math.cos(van.yaw);
      if (d < 9 && forward > -2 && d < distanceTo) { nearest = node; distanceTo = d; }
    }
    if (!nearest) return false;
    const current = this.reservations.get(nearest.id);
    if (current && current.van !== van && this.time - current.time < 1.1) return distanceTo > 3;
    this.reservations.set(nearest.id, { van, time: this.time });
    return false;
  }

  retryRoute(van, state) {
    const candidates = this.network.routes.map(circuit => ({ circuit, near: closestRoutePosition(circuit, van.position) }))
      .filter(({ circuit, near }) => circuit !== state.circuit && near.distance < 1.2
        && Math.abs(angleDelta(routeSample(circuit, near.s).yaw, van.yaw)) < .42)
      .sort((a, b) => a.near.distance - b.near.distance || a.circuit.length - b.circuit.length);
    const candidate = candidates[0];
    if (!candidate) return false;
    state.circuit = candidate.circuit; state.index = candidate.near.index; state.progress = candidate.near.s;
    van.serviceRouteId = candidate.circuit.id;
    state.status = 'retrying'; state.blockedTime = 0; state.retryAt += 8;
    return true;
  }

  rejoinService(van, state) {
    const candidates = this.network.routes.map(circuit => ({ circuit, near: closestRoutePosition(circuit, van.position) }))
      .filter(({ circuit, near }) => near.distance < 1.2
        && Math.abs(angleDelta(routeSample(circuit, near.s).yaw, van.yaw)) < .42)
      .sort((a, b) => Number(b.circuit.id === van.serviceRouteId) - Number(a.circuit.id === van.serviceRouteId)
        || a.near.distance - b.near.distance);
    const candidate = candidates[0];
    if (!candidate) return false;
    state.circuit = candidate.circuit; state.index = candidate.near.index; state.progress = candidate.near.s;
    van.serviceRouteId = candidate.circuit.id;
    return true;
  }

  update(dt, { pedestrians = [], onImpact, player } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, .1);
    this.time += duration;
    for (const [van, state] of this.active) {
      if (van.occupied || !van.autonomous) { this.active.delete(van); continue; }
      if (van.disabled) { this.park(van); continue; }
      if (state.service && !state.circuit && this.time >= (state.nextServicePlan ?? 0)) {
        this.rejoinService(van, state); state.nextServicePlan = this.time + 1;
      }
      const target = state.circuit ? this.circuitTarget(van, state) : this.routeTarget(van, state);
      const input = {};
      let brake = !target, reason = brake ? 'no-route' : null;
      if (target) {
        const [tx, tz] = target.point;
        const desired = heading([van.position.x, van.position.z], [tx, tz]);
        const error = angleDelta(desired, van.yaw);
        if (state.circuit || van.role === 'pickup') {
          const lookahead = target.lookahead ?? Math.max(3, Math.hypot(tx - van.position.x, tz - van.position.z));
          const steerAngle = Math.atan2(2 * van.config.wheelbase * Math.sin(error), lookahead);
          input.steer = clamp(steerAngle / (van.config.maxSteer / (1 + Math.abs(van.speed) * .065)), -1, 1);
        } else if (error > .055) input.left = true;
        else if (error < -.055) input.right = true;
        if (Math.abs(error) > 1.1) brake = true;
        if (target.deadEnd && target.remaining < (state.circuit ? .3 : Math.max(2.5, van.speed * van.speed / (2 * van.config.braking) + 2))) brake = true;
        const speed = target.speed ?? CRUISE_SPEED;
        if (van.speed > speed + .08) brake = true;
        if (!brake && van.speed < speed) input.forward = true;
        if (target.deadEnd && brake) reason = 'end';
      }
      const obstacle = this.obstacleAhead(van, pedestrians, player, state);
      if (obstacle) { brake = true; reason = obstacle.config?.halfWidth ? 'traffic' : 'pedestrian'; }
      if (this.reserveIntersection(van, state)) { brake = true; reason = 'junction'; }
      // Proactive pavement checks leave contacts/damage entirely with ElectricVan.
      const travel = Math.max(.5, Math.abs(van.speed) * duration + .25);
      for (let d = .25; d <= travel + 1e-6; d += .25) {
        const yaw = van.yaw + d / van.config.wheelbase * Math.tan(van.steering);
        const candidate = { x: van.position.x - Math.sin(yaw) * d, z: van.position.z - Math.cos(yaw) * d };
        if (!this.roadFootprintClear(candidate, yaw, van.config)) { brake = true; reason = 'pavement'; break; }
      }
      input.brake = brake;
      van.update(duration, input, { pedestrians, vans: this.vans, onImpact });
      if (van.hitObstacle) state.blockedTime += duration;
      else if (brake && Math.abs(van.speed) < .08) state.blockedTime += duration;
      else if (!brake) state.blockedTime = 0;
      state.status = brake && Math.abs(van.speed) < .12 ? reason === 'pedestrian' ? 'yielding' : 'waiting' : 'driving';
      state.reason = reason;
      if ((!state.circuit && !state.route || reason === 'end') && Math.abs(van.speed) < .08) this.park(van);
      if (van.role === 'pickup' && !state.circuit && this.time >= (state.nextPickupPlan ?? 0)) { this.planPickup(van, state); state.nextPickupPlan = this.time + 2; }
      // Temporary traffic never parks a service. Retry a physically connected,
      // already aligned circuit after a prolonged obstruction, without resetting.
      if (state.service && state.blockedTime > state.retryAt) { this.retryRoute(van, state); state.retryAt = state.blockedTime + 8; }
    }
  }

  get diagnostics() {
    const states = [...this.active.values()];
    return { active: states.length, moving: [...this.active.keys()].filter(v => Math.abs(v.speed) > .1).length,
      parked: this.vans.filter(v => !v.autonomous && !v.occupied).length,
      yielding: states.filter(s => s.status === 'yielding' || s.status === 'waiting').length,
      travelled: states.reduce((sum, s) => sum + s.travelled, 0), laps: states.reduce((sum, s) => sum + (s.laps ?? 0), 0) };
  }

  reset() {
    this.active.clear();
    this.reservations.clear(); this.time = 0;
    for (const van of this.vans) van.autonomous = false;
  }

  dispose() { this.reset(); }
}
