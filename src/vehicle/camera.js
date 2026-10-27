import { MathUtils } from 'three';
import { ThirdPersonCamera } from '../player/camera.js';

/** One continuous chase rig transitions between student, electric van, and double-decker bus profiles. */
export class TravelCamera extends ThirdPersonCamera {
  constructor(camera, colliders) {
    super(camera, colliders, { distance: 6 });
    this.driving = false;
    this.orbitHold = 0;
  }
  setDriving(driving) {
    this.driving = !!driving;
  }
  reset(spawn) {
    const isBus = spawn?.isBus;
    this.distance = this.driving ? (isBus ? 13.0 : 8.6) : 6;
    this.targetHeight = this.driving ? (isBus ? 3.2 : 1.08) : 1.35;
    this.orbitHold = 0;
    super.reset(spawn);
  }
  updateTravel(dt, entity, look = { dx: 0, dy: 0 }) {
    if (dt > 0) {
      const isBus = entity?.isBus;
      const targetDist = this.driving ? (isBus ? 13.0 : 8.6) : 6;
      const targetH = this.driving ? (isBus ? 3.2 : 1.08) : 1.35;
      const blend = 1 - Math.exp(-4 * Math.min(dt, .1));
      this.distance = MathUtils.lerp(this.distance, targetDist, blend);
      this.targetHeight = MathUtils.lerp(this.targetHeight, targetH, blend);
      this.followRate = this.driving ? (isBus ? 7 : 9) : 14;
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
