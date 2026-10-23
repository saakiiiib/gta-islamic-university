import { Vector3, Raycaster, MathUtils } from 'three';

/** Orbiting third-person camera, looking along -Z at yaw zero. */
export class ThirdPersonCamera {
  constructor(camera, collisionGroup, { distance = 6 } = {}) {
    this.camera = camera;
    this.collisionGroup = collisionGroup;
    this.distance = distance;
    this.yaw = 0;
    this.pitch = 0.32;
    this.raycaster = new Raycaster();
    this.target = new Vector3();
    this.initialized = false;
    this.currentDistance = distance;
  }

  reset(spawn) {
    this.yaw = spawn.yaw ?? 0;
    this.pitch = 0.32;
    this.initialized = false;
    this.currentDistance = this.distance;
    this.update(0, new Vector3(spawn.x ?? 0, spawn.y ?? 0, spawn.z ?? 0), { dx: 0, dy: 0 });
  }

  obstructionDistance(target, direction, maximum) {
    if (!this.collisionGroup) return maximum;
    const right = new Vector3().crossVectors(direction, new Vector3(0, 1, 0)).normalize();
    const up = new Vector3().crossVectors(right, direction).normalize();
    let clearDistance = maximum;
    for (const [horizontal, vertical] of [[0, 0], [-0.24, -0.18], [-0.24, 0.18], [0.24, -0.18], [0.24, 0.18]]) {
      const origin = target.clone().addScaledVector(right, horizontal).addScaledVector(up, vertical);
      this.raycaster.set(origin, direction);
      this.raycaster.near = 0.03;
      this.raycaster.far = maximum + 0.25;
      const hit = this.raycaster.intersectObject(this.collisionGroup, true)[0];
      if (hit) clearDistance = Math.min(clearDistance, Math.max(0.25, hit.distance - 0.28));
    }
    return clearDistance;
  }

  update(dt, playerPosition, lookDelta = { dx: 0, dy: 0 }) {
    this.yaw -= (lookDelta.dx ?? 0) * 0.0025;
    this.pitch = MathUtils.clamp(this.pitch + (lookDelta.dy ?? 0) * 0.0025, 0.1, 1.05);
    const desiredTarget = playerPosition.clone().add(new Vector3(0, 1.35, 0));
    if (!this.initialized) this.target.copy(desiredTarget);
    else this.target.lerp(desiredTarget, 1 - Math.exp(-14 * Math.max(0, dt)));
    const direction = new Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const allowed = this.obstructionDistance(this.target, direction, this.distance);
    if (allowed < this.currentDistance || !this.initialized) this.currentDistance = allowed;
    else this.currentDistance = MathUtils.lerp(this.currentDistance, allowed, 1 - Math.exp(-5 * Math.max(0, dt)));
    this.camera.position.copy(this.target).addScaledVector(direction, this.currentDistance);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.initialized = true;
  }
}
