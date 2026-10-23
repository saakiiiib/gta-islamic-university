import { rectangleFootprint } from '../navigation/campusQueries.js';

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
    this.active.set(van, { route: this.nearestRoute(van), blockedTime: 0 });
    return true;
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
    const lookahead = clamp(2.5 + Math.abs(van.speed) * .65, 2.5, 5.5);
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

  update(dt, { pedestrians = [], onImpact, player } = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const duration = Math.min(dt, .1);
    for (const [van, state] of this.active) {
      if (van.occupied || !van.autonomous) { this.active.delete(van); continue; }
      if (van.disabled) { this.park(van); continue; }
      const target = this.routeTarget(van, state);
      const input = {};
      let brake = !target;
      if (target) {
        const [tx, tz] = target.point;
        const desired = heading([van.position.x, van.position.z], [tx, tz]);
        const error = angleDelta(desired, van.yaw);
        if (error > .055) input.left = true;
        else if (error < -.055) input.right = true;
        if (Math.abs(error) > 1.1) brake = true;
        if (target.deadEnd && target.remaining < Math.max(2.5, van.speed * van.speed / (2 * van.config.braking) + 2)) brake = true;
        if (van.speed > CRUISE_SPEED + .3) brake = true;
        if (!brake && van.speed < CRUISE_SPEED) input.forward = true;
      }
      // Brake for a person or another van in the lane. The controller still owns actual contacts.
      const headingX = -Math.sin(van.yaw), headingZ = -Math.cos(van.yaw);
      const stopping = Math.max(3.8, van.speed * van.speed / (2 * van.config.braking) + 2.6);
      for (const obstacle of [...pedestrians, ...(player?.position ? [player] : []), ...this.vans.filter(v => v !== van)]) {
        const position = obstacle.position;
        if (!position || Math.abs((position.y ?? 0) - van.position.y) > 1.1) continue;
        const dx = position.x - van.position.x, dz = position.z - van.position.z;
        const forward = dx * headingX + dz * headingZ;
        const side = Math.abs(dx * headingZ - dz * headingX);
        const radius = (obstacle.config?.halfWidth ?? obstacle.config?.radius ?? .3) + .6;
        if (forward > 0 && forward < stopping + van.config.front && side < van.config.halfWidth + radius) { brake = true; break; }
      }
      // A route can bend beyond the available road width. Park before its footprint leaves pavement.
      const travel = Math.max(.5, Math.abs(van.speed) * duration + .25);
      for (let d = .25; d <= travel + 1e-6; d += .25) {
        const yaw = van.yaw + d / van.config.wheelbase * Math.tan(van.steering);
        const candidate = { x: van.position.x - Math.sin(yaw) * d, z: van.position.z - Math.cos(yaw) * d };
        if (!this.roadFootprintClear(candidate, yaw, van.config)) { brake = true; state.blockedTime += duration; break; }
      }
      input.brake = brake;
      van.update(duration, input, { pedestrians, vans: this.vans, onImpact });
      if (van.hitObstacle) state.blockedTime += duration;
      else if (brake && Math.abs(van.speed) < .08) state.blockedTime += duration;
      else if (!brake) state.blockedTime = 0;
      if (state.blockedTime > .65) this.park(van);
    }
  }

  reset() {
    this.active.clear();
    for (const van of this.vans) van.autonomous = false;
  }

  dispose() { this.reset(); }
}
