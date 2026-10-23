import { MathUtils, Vector3 } from 'three';

/** Separate camera: never writes the student, capsule, or chase-camera state. */
export class InspectionCamera {
  constructor(camera, bounds) {
    this.camera = camera; this.bounds = bounds;
    this.target = new Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    this.yaw = -.35; this.pitch = 1.03; this.distance = 1000;
    this.adjusted = false; this.enabled = false; this.keys = new Set(); this.listeners = [];
    this.drag = null; this.last = null;
    this.baseFov = camera.fov; this.camera.far = 3500;
    this.resize(camera.aspect);
  }
  fit() {
    const width = this.bounds.maxX - this.bounds.minX, depth = this.bounds.maxZ - this.bounds.minZ;
    const radius = Math.hypot(width, depth) / 2 + 18;
    const vertical = MathUtils.degToRad(this.camera.fov) / 2, horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
    this.distance = radius / Math.sin(Math.min(vertical, horizontal)) * 1.06;
    this.distance = Math.min(2900, this.distance);
    this.apply();
  }
  resize(aspect) {
    this.camera.aspect = aspect;
    // Preserve horizontal coverage when the window becomes narrow.
    this.camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(this.baseFov) / 2) / Math.min(1, Math.max(.25, aspect))));
    this.camera.updateProjectionMatrix();
    if (!this.adjusted) this.fit(); else this.apply();
  }
  orbit(dx, dy) {
    this.adjusted = true;
    this.yaw -= dx * .004;
    this.pitch = MathUtils.clamp(this.pitch + dy * .004, .22, 1.48);
    this.apply();
  }
  pan(right, forward) {
    this.adjusted = true;
    this.target.x += Math.cos(this.yaw) * right - Math.sin(this.yaw) * forward;
    this.target.z += -Math.sin(this.yaw) * right - Math.cos(this.yaw) * forward;
    this.target.x = MathUtils.clamp(this.target.x, this.bounds.minX - 150, this.bounds.maxX + 150);
    this.target.z = MathUtils.clamp(this.target.z, this.bounds.minZ - 150, this.bounds.maxZ + 150);
    this.apply();
  }
  zoom(delta) { this.adjusted = true; this.distance = MathUtils.clamp(this.distance * Math.exp(delta * .001), 35, 2900); this.apply(); }
  apply() {
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch)).multiplyScalar(this.distance).add(this.target);
    this.camera.lookAt(this.target); this.camera.updateMatrixWorld();
  }
  update(dt) {
    if (!this.enabled) return;
    const elapsed = Math.max(0, Math.min(dt, .1)), speed = this.distance * .35 * elapsed;
    const right = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const length = Math.hypot(right, forward);
    if (length) this.pan(right / length * speed, forward / length * speed);
    const dx = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'));
    const dy = Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'));
    if (dx || dy) this.orbit(dx * 180 * elapsed, dy * 180 * elapsed);
  }
  clear() { this.keys.clear(); this.drag = this.last = null; }
  setEnabled(enabled) { this.enabled = !!enabled; this.clear(); }
  attach(canvas, onFocusLoss) {
    this.canvas = canvas;
    const doc = canvas.ownerDocument, win = doc.defaultView;
    const listen = (target, type, listener, options) => { target.addEventListener(type, listener, options); this.listeners.push([target, type, listener, options]); };
    listen(win, 'keydown', event => {
      if (!this.enabled || !/^(Key[WASD]|Arrow(Left|Right|Up|Down))$/.test(event.code) || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName ?? '')) return;
      if (event.repeat && !this.keys.has(event.code)) return;
      event.preventDefault(); this.keys.add(event.code);
    });
    listen(win, 'keyup', event => this.keys.delete(event.code));
    listen(canvas, 'mousedown', event => {
      if (!this.enabled || ![0, 2].includes(event.button)) return;
      event.preventDefault(); this.drag = event.button === 2 ? 'pan' : 'orbit'; this.last = [event.clientX, event.clientY];
    });
    listen(win, 'mouseup', () => { this.drag = this.last = null; });
    listen(win, 'mousemove', event => {
      if (!this.enabled || !this.drag || !this.last) return;
      const dx = event.clientX - this.last[0], dy = event.clientY - this.last[1]; this.last = [event.clientX, event.clientY];
      if (this.drag === 'orbit') this.orbit(dx, dy);
      else { const scale = this.distance * .0015; this.pan(-dx * scale, dy * scale); }
    });
    listen(canvas, 'wheel', event => { if (this.enabled) { event.preventDefault(); this.zoom(event.deltaY); } }, { passive: false });
    listen(canvas, 'contextmenu', event => { if (this.enabled) event.preventDefault(); });
    listen(win, 'blur', () => { this.clear(); if (this.enabled) onFocusLoss?.('focus'); });
    listen(doc, 'visibilitychange', () => { if (doc.hidden) { this.clear(); if (this.enabled) onFocusLoss?.('focus'); } });
  }
  dispose() { this.setEnabled(false); for (const args of this.listeners) { const [target, ...rest] = args; target.removeEventListener(...rest); } this.listeners.length = 0; }
}

/** The transition order suppresses the intentional pointer-lock-loss pause. */
export class InspectionSession {
  constructor(input, inspection, document) { this.input = input; this.inspection = inspection; this.document = document; this.active = false; }
  enter() {
    if (this.active) return;
    this.input.setEnabled(false); this.input.clear();
    this.active = true; this.inspection.setEnabled(true);
    this.input.releasePointerLock();
  }
  suspend() { this.input.setEnabled(false); this.inspection.setEnabled(false); }
  resume() { this.input.clear(); this.inspection.setEnabled(this.active); this.input.setEnabled(!this.active); }
  exit() { this.inspection.setEnabled(false); this.active = false; this.input.clear(); this.input.setEnabled(true); }
}
