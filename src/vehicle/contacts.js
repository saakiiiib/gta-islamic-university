import { rectangleFootprint, worldToLocal } from '../navigation/campusQueries.js';

/** Oriented footprint SAT, shared by parking, traffic contacts and safe exits. */
export function vansOverlap(position, yaw, dimensions, other, margin = .04) {
  const a = rectangleFootprint(position, yaw, dimensions, margin).slice(0, -1);
  const b = rectangleFootprint(other.position, other.yaw, other.config, margin).slice(0, -1);
  for (const angle of [yaw, other.yaw]) for (const axis of [[Math.cos(angle), -Math.sin(angle)], [Math.sin(angle), Math.cos(angle)]]) {
    const pa = a.map(p => p[0] * axis[0] + p[1] * axis[1]), pb = b.map(p => p[0] * axis[0] + p[1] * axis[1]);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

export function pedestrianContact(position, yaw, dimensions, pedestrian, radius = .36) {
  if (Math.abs((pedestrian.position.y ?? 0) - (position.y ?? 0)) > 1) return null;
  const [x, z] = worldToLocal(pedestrian.position.x, pedestrian.position.z, position, yaw);
  const dx = x - Math.max(-dimensions.halfWidth, Math.min(dimensions.halfWidth, x));
  const dz = z - Math.max(-dimensions.front, Math.min(dimensions.rear, z));
  if (Math.hypot(dx, dz) >= radius) return null;
  const length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: (dx * Math.cos(yaw) + dz * Math.sin(yaw)) / length, z: (-dx * Math.sin(yaw) + dz * Math.cos(yaw)) / length } : null;
}

export function touchesPedestrian(position, yaw, dimensions, pedestrian, radius = .36) {
  if (Math.abs((pedestrian.position.y ?? 0) - (position.y ?? 0)) > 1) return false;
  const [x, z] = worldToLocal(pedestrian.position.x, pedestrian.position.z, position, yaw);
  return Math.hypot(Math.max(0, Math.abs(x) - dimensions.halfWidth), Math.max(0, -dimensions.front - z, z - dimensions.rear)) < radius;
}
