const TRACKED_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyR', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Browser listeners are installed only when instantiated, keeping imports testable. */
export class InputController {
  constructor(canvas, { onPause = () => {} } = {}) {
    this.canvas = canvas;
    this.document = canvas.ownerDocument;
    this.window = this.document.defaultView;
    this.onPause = onPause;
    this.enabled = false;
    this.keys = new Set();
    this.jumpQueued = false;
    this.resetQueued = false;
    this.lookDelta = { dx: 0, dy: 0 };
    this.dragging = false;
    this.lastMouse = null;
    this.hadPointerLock = false;
    this.listeners = [];
    this.listen(this.window, 'keydown', event => {
      if (event.code === 'Escape') {
        if (!event.repeat) { this.clear(); this.onPause('escape'); }
        return;
      }
      if (!this.enabled) return;
      if (!TRACKED_KEYS.has(event.code)) return;
      if (/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName ?? '')) return;
      event.preventDefault();
      if (event.repeat && !this.keys.has(event.code)) return;
      if (!event.repeat && !this.keys.has(event.code)) {
        if (event.code === 'Space') this.jumpQueued = true;
        if (event.code === 'KeyR') this.resetQueued = true;
      }
      this.keys.add(event.code);
    });
    this.listen(this.window, 'keyup', event => { this.keys.delete(event.code); });
    this.listen(this.canvas, 'contextmenu', event => { if (this.enabled) event.preventDefault(); });
    this.listen(this.canvas, 'mousedown', event => {
      if (!this.enabled) return;
      if (event.button === 2) { this.dragging = true; this.lastMouse = { x: event.clientX, y: event.clientY }; event.preventDefault(); }
    });
    this.listen(this.window, 'mouseup', event => { if (event.button === 2) { this.dragging = false; this.lastMouse = null; } });
    this.listen(this.window, 'mousemove', event => {
      if (!this.enabled) return;
      const locked = this.document.pointerLockElement === this.canvas;
      if (locked) { this.lookDelta.dx += event.movementX ?? 0; this.lookDelta.dy += event.movementY ?? 0; }
      else if (this.dragging) {
        if (this.lastMouse) { this.lookDelta.dx += event.clientX - this.lastMouse.x; this.lookDelta.dy += event.clientY - this.lastMouse.y; }
        this.lastMouse = { x: event.clientX, y: event.clientY };
      }
    });
    this.listen(this.document, 'pointerlockchange', () => {
      const locked = this.document.pointerLockElement === this.canvas;
      const lost = this.hadPointerLock && !locked;
      this.hadPointerLock = locked;
      if (lost && this.enabled) { this.clear(); this.onPause('pointerlock'); }
    });
    this.listen(this.window, 'blur', () => { this.clear(); if (this.enabled) this.onPause('focus'); });
    this.listen(this.document, 'visibilitychange', () => { if (this.document.hidden) { this.clear(); if (this.enabled) this.onPause('focus'); } });
  }

  listen(target, type, listener) {
    target.addEventListener(type, listener);
    this.listeners.push([target, type, listener]);
  }

  snapshot() {
    const input = {
      forward: this.keys.has('KeyW'), back: this.keys.has('KeyS'),
      left: this.keys.has('KeyA'), right: this.keys.has('KeyD'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      jump: this.jumpQueued, reset: this.resetQueued,
    };
    this.jumpQueued = false;
    this.resetQueued = false;
    return input;
  }

  consumeLook(dt = 1 / 60) {
    const result = { ...this.lookDelta };
    this.lookDelta.dx = this.lookDelta.dy = 0;
    const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (this.enabled) {
      result.dx += (Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'))) * 600 * elapsed;
      result.dy += (Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'))) * 450 * elapsed;
    }
    return result;
  }

  clear() {
    this.keys.clear();
    this.jumpQueued = this.resetQueued = this.dragging = false;
    this.lookDelta.dx = this.lookDelta.dy = 0;
    this.lastMouse = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
  }

  async requestPointerLock() {
    try {
      if (!this.enabled || !this.canvas.requestPointerLock) return false;
      await this.canvas.requestPointerLock();
      if (!this.enabled) { this.releasePointerLock(); return false; }
      return this.document.pointerLockElement === this.canvas;
    } catch { return false; }
  }

  releasePointerLock() {
    this.hadPointerLock = false;
    if (this.document.pointerLockElement === this.canvas) this.document.exitPointerLock?.();
  }

  dispose() {
    this.setEnabled(false);
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
  }
}
