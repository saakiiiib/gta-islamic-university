import { MathUtils } from 'three';
import { ThirdPersonCamera } from '../player/camera.js';

/** One continuous chase rig transitions between student and electric van profiles. */
export class TravelCamera extends ThirdPersonCamera {
  constructor(camera, colliders) { super(camera, colliders, { distance: 6 }); this.driving = false; this.orbitHold = 0; }
  setDriving(driving) { this.driving = !!driving; }
  reset(spawn) { this.distance = this.driving ? 8.6 : 6; this.targetHeight = this.driving ? 1.08 : 1.35; this.orbitHold = 0; super.reset(spawn); }
  updateTravel(dt, entity, look = { dx: 0, dy: 0 }) {
    if (dt > 0) {
      const blend = 1 - Math.exp(-4 * Math.min(dt, .1));
      this.distance = MathUtils.lerp(this.distance, this.driving ? 8.6 : 6, blend);
      this.targetHeight = MathUtils.lerp(this.targetHeight, this.driving ? 1.08 : 1.35, blend);
      this.followRate = this.driving ? 9 : 14;
      if (Math.abs(look.dx) + Math.abs(look.dy) > .1) this.orbitHold = 2.5;
      else this.orbitHold = Math.max(0, this.orbitHold - dt);
      if (this.driving && entity.speed > .8 && !this.orbitHold) {
        const angle = Math.atan2(Math.sin(entity.yaw - this.yaw), Math.cos(entity.yaw - this.yaw));
        this.yaw += angle * (1 - Math.exp(-1.5 * dt));
      }
    }
    super.update(dt, entity.position, look);
  }
}
