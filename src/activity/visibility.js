import { Frustum, Matrix4, Ray, Vector3 } from 'three';

/** Bounded, camera-based estimates; totals and "nearby" are never called visible. */
export class CampusVisibility {
  constructor(collisionWorlds = []) {
    this.worlds = collisionWorlds.filter(Boolean);
    this.frustum = new Frustum(); this.matrix = new Matrix4(); this.origin = new Vector3();
    this.point = new Vector3(); this.direction = new Vector3(); this.ray = new Ray();
    this.elapsed = Infinity; this.ready = false; this.stats = {};
    this.visible = point => this.isVisible(point);
  }
  prepare(camera) {
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    camera.getWorldPosition(this.origin); this.ready = true;
  }
  isVisible(point, height = 1.45) {
    if (!this.ready || !point) return false;
    this.point.set(point.x, (point.y ?? 0) + height, point.z);
    if (!this.frustum.containsPoint(this.point)) return false;
    this.direction.subVectors(this.point, this.origin);
    const distance = this.direction.length();
    if (distance < .1) return true;
    this.direction.multiplyScalar(1 / distance); this.ray.set(this.origin, this.direction);
    return !this.worlds.some(world => {
      const hit = world.octree.rayIntersect(this.ray);
      return hit && hit.distance < distance - .35;
    });
  }
  sample(dt, simulation, position) {
    this.elapsed += Math.max(0, dt);
    if (this.elapsed < .2 || !this.ready) return this.stats;
    this.elapsed = 0;
    const nearby = p => Math.hypot(p.x - position.x, p.z - position.z) <= 80;
    const onScreen = (entity, height) => Math.hypot(entity.position.x - position.x, entity.position.z - position.z) <= 160 &&
      (this.isVisible(entity.position, height) || this.isVisible(entity.position, height * .55));
    const agents = simulation.crowd.agents, vans = simulation.vans;
    this.stats = {
      npcTotal: agents.length, npcNearby: agents.filter(a => nearby(a.position)).length,
      npcVisible: agents.filter(a => onScreen(a, 1.5)).length,
      vanTotal: vans.length, vanNearby: vans.filter(v => nearby(v.position)).length,
      vanVisible: vans.filter(v => onScreen(v, 1.4)).length,
      vanMoving: vans.filter(v => Math.abs(v.speed) > .15).length,
      vanParked: vans.filter(v => !v.autonomous && !v.occupied).length,
      vanYielding: simulation.driverController?.diagnostics.yielding ?? vans.filter(v => v.autonomous && Math.abs(v.speed) <= .15).length,
    };
    return this.stats;
  }
}
