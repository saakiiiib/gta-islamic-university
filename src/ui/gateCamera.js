import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { MAIN_GATE_CONFIG } from '../world/mainGate.js';

// Includes the full 20.4 m cornice, 10.725 m crown, pillar feet and crest island.
// These are architecture bounds, independent of the student spawn or road boundary.
const GATE_BOUNDS = { minX: -10.3, maxX: 10.3, minY: -.1, maxY: 10.85, minZ: -1.2, maxZ: 3.4 };
const SAFE_FRAME = .84;
const UP = new Vector3(0, 1, 0);

/** A fixed exterior gate portrait, fitted to the visible menu stage (not the window). */
export class GateMenuCamera {
  constructor(config = MAIN_GATE_CONFIG) {
    this.camera = new PerspectiveCamera(45, 1, .08, 2200);
    this.camera.name = 'main-gate-menu-camera';
    this.target = new Vector3(0, 5.1, .4);
    this.outward = new Vector3(0, .11, 1).normalize();
    this.offsets = [];
    const vertical = new Vector3().crossVectors(this.outward, new Vector3(1, 0, 0));
    for (const x of [GATE_BOUNDS.minX, GATE_BOUNDS.maxX]) {
      for (const y of [GATE_BOUNDS.minY, GATE_BOUNDS.maxY]) {
        for (const z of [GATE_BOUNDS.minZ, GATE_BOUNDS.maxZ]) {
          const offset = new Vector3(x, y, z).sub(this.target);
          this.offsets.push({ x: offset.x, y: offset.dot(vertical), depth: offset.dot(this.outward) });
        }
      }
    }
    this.target.applyAxisAngle(UP, config.yaw).add(new Vector3(config.position.x, config.position.y, config.position.z));
    this.outward.applyAxisAngle(UP, config.yaw);
    this.fit(1);
  }

  /** Recompute the stationary pose on stage resize. Invalid/hidden dimensions use a square. */
  fit(aspect) {
    this.camera.aspect = Number.isFinite(aspect) && aspect > 0 ? MathUtils.clamp(aspect, .1, 10) : 1;
    const tangent = Math.tan(MathUtils.degToRad(this.camera.fov / 2));
    // Solve the horizontal and vertical frustum inequalities for every corner;
    // including depth keeps the nearer cornice and island clear of stage edges.
    let distance = 18;
    for (const point of this.offsets) {
      distance = Math.max(distance, point.depth + Math.abs(point.x) / (tangent * this.camera.aspect * SAFE_FRAME),
        point.depth + Math.abs(point.y) / (tangent * SAFE_FRAME));
    }
    this.camera.position.copy(this.target).addScaledVector(this.outward, distance);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    return this.camera;
  }
}

/** A short, render-only bridge to the live chase pose. Neither input camera is changed. */
export class CameraHandoff {
  constructor(duration = .65) {
    this.duration = Number.isFinite(duration) && duration >= 0 ? duration : .65;
    this.elapsed = 0;
    this.active = false;
    this.camera = new PerspectiveCamera();
    this.source = new PerspectiveCamera();
  }

  /** Call after chase.reset(); reduced motion immediately returns the chase camera. */
  begin(source, destination, { reducedMotion = false } = {}) {
    this.source.copy(source, false);
    this.elapsed = 0;
    this.active = !reducedMotion && this.duration > 0;
    return this.update(0, destination);
  }

  /** Call once per visible render, after updating chase. Destination may keep moving. */
  update(dt, destination) {
    if (!this.active) return destination;
    this.elapsed = Math.min(this.duration, this.elapsed + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
    const progress = this.elapsed / this.duration;
    const blend = progress * progress * (3 - 2 * progress);
    // Projection uses the gameplay viewport from the first frame, avoiding an
    // aspect-ratio stretch when the menu stage expands to the full canvas.
    this.camera.copy(destination, false);
    this.camera.position.lerpVectors(this.source.position, destination.position, blend);
    this.camera.quaternion.slerpQuaternions(this.source.quaternion, destination.quaternion, blend);
    this.camera.fov = MathUtils.lerp(this.source.fov, destination.fov, blend);
    this.camera.zoom = MathUtils.lerp(this.source.zoom, destination.zoom, blend);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    if (progress === 1) {
      this.active = false;
      return destination;
    }
    return this.camera;
  }

  /** Inspection, reset, or cancellation can immediately resume the normal camera. */
  cancel() {
    this.active = false;
    this.elapsed = 0;
  }
}
