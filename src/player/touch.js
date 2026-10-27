const ACTIONS = ['jump', 'sprint', 'interact', 'accelerate', 'reverse', 'pause', 'horn'];

export class TouchControls {
  constructor({ root, canvas, onPause = () => {}, onGesture = () => {}, allowMouse = false }) {
    this.root = root;
    this.canvas = canvas;
    this.document = root.ownerDocument;
    this.window = this.document.defaultView;
    this.onPause = onPause;
    this.onGesture = onGesture;
    this.allowMouse = allowMouse;
    this.available = true;
    this.enabled = false;
    this.mode = 'foot';
    this.stick = root.querySelector('#touch-stick');
    this.thumb = root.querySelector('#touch-stick-thumb');
    this.caption = root.querySelector('#touch-stick-caption');
    this.look = root.querySelector('#touch-look');
    this.buttons = Object.fromEntries(ACTIONS.map(action => [action, root.querySelector(`[data-touch-action="${action}"]`)]));
    this.pointers = new Map();
    this.owners = new Map();
    this.moveX = this.moveZ = 0;
    this.lookDelta = { dx: 0, dy: 0 };
    this.jumpQueued = this.interactQueued = this.hornQueued = this.sprint = false;
    this.listeners = [];
    this.listen(this.stick, 'pointerdown', event => this.start(event, 'stick'));
    this.listen(this.look, 'pointerdown', event => {
      if (event.target?.closest?.('button, a, input, select, textarea, [data-touch-action]')) return;
      this.start(event, 'look');
    });
    for (const action of ACTIONS) {
      const button = this.buttons[action];
      if (!button) continue;
      this.listen(button, 'pointerdown', event => this.start(event, action));
      this.listen(button, 'click', event => { if (event.detail) event.preventDefault(); });
    }
    this.listen(this.root, 'pointermove', event => this.move(event));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.listen(this.root, type, event => this.end(event));
    this.listen(this.window, 'blur', () => this.clear());
    this.listen(this.document, 'visibilitychange', () => { if (this.document.hidden) this.clear(); });
    this.root.hidden = true;
    this.updateMode();
  }

  listen(target, type, listener) {
    target?.addEventListener(type, listener);
    if (target) this.listeners.push([target, type, listener]);
  }

  start(event, action) {
    if (!this.enabled || this.pointers.has(event.pointerId) || this.owners.has(action)) return;
    if (event.pointerType === 'mouse' && !this.allowMouse) return;
    event.preventDefault();
    event.stopPropagation?.();
    const target = event.currentTarget;
    try { target.setPointerCapture?.(event.pointerId); } catch { /* A touch may disappear before capture is granted. */ }
    this.pointers.set(event.pointerId, { action, target, x: event.clientX, y: event.clientY });
    this.owners.set(action, event.pointerId);
    if (this.buttons[action]) target.classList?.add('is-held');
    if (event.pointerType === 'touch') this.onGesture();
    if (action === 'stick') this.updateStick(event);
    else if (action === 'jump') this.jumpQueued = true;
    else if (action === 'interact') this.interactQueued = true;
    else if (action === 'horn') this.hornQueued = true;
    else if (action === 'sprint') { this.sprint = !this.sprint; this.updateSprint(); }
    else if (action === 'pause') { this.clear(); this.onPause('touch'); }
  }

  move(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    if (pointer.action === 'stick') this.updateStick(event);
    if (pointer.action === 'look') {
      this.lookDelta.dx += event.clientX - pointer.x;
      this.lookDelta.dy += event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
  }

  updateStick(event) {
    const bounds = this.stick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const x = (event.clientX - (bounds.left + bounds.width / 2)) / radius;
    const y = (event.clientY - (bounds.top + bounds.height / 2)) / radius;
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    const nx = x * scale, ny = y * scale;
    const deadZone = 0.12;
    const magnitude = Math.hypot(nx, ny);
    const adjusted = magnitude <= deadZone ? 0 : (magnitude - deadZone) / (1 - deadZone);
    this.moveX = magnitude ? nx / magnitude * adjusted : 0;
    this.moveZ = magnitude ? ny / magnitude * adjusted : 0;
    if (this.thumb) this.thumb.style.transform = `translate(${nx * radius}px, ${ny * radius}px)`;
  }

  end(event) {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    this.pointers.delete(event.pointerId);
    this.owners.delete(pointer.action);
    pointer.target.classList?.remove('is-held');
    if (event.type !== 'pointerup') {
      if (pointer.action === 'jump') this.jumpQueued = false;
      if (pointer.action === 'interact') this.interactQueued = false;
    }
    if (pointer.action === 'stick') {
      this.moveX = this.moveZ = 0;
      if (this.thumb) this.thumb.style.transform = '';
    }
    if (event.type !== 'lostpointercapture') {
      try {
        if (pointer.target.hasPointerCapture?.(event.pointerId)) pointer.target.releasePointerCapture(event.pointerId);
      } catch { /* Pointer capture may already have been released by the browser. */ }
    }
  }

  updateSprint() { this.buttons.sprint?.setAttribute('aria-pressed', String(this.sprint)); }

  updateMode() {
    this.root.dataset.mode = this.mode;
    if (this.caption) this.caption.textContent = this.mode === 'van' ? 'STEER' : this.mode === 'inspection' ? 'PAN' : 'MOVE';
    for (const action of ACTIONS) {
      const button = this.buttons[action];
      if (!button) continue;
      button.hidden = this.mode === 'inspection' ? !['pause', 'accelerate', 'reverse'].includes(action) : this.mode === 'van' ? ['jump', 'sprint'].includes(action) : ['accelerate', 'reverse', 'horn'].includes(action);
    }
    if (this.buttons.interact) this.buttons.interact.textContent = this.mode === 'van' ? 'EXIT' : 'ENTER';
    if (this.buttons.accelerate) this.buttons.accelerate.textContent = this.mode === 'inspection' ? 'ZOOM +' : 'GO';
    if (this.buttons.reverse) this.buttons.reverse.textContent = this.mode === 'inspection' ? 'ZOOM −' : 'BRAKE / REVERSE';
    this.updateSprint();
  }

  setMode(mode) {
    if (!['foot', 'van', 'inspection'].includes(mode)) throw new RangeError(`Unknown touch mode: ${mode}`);
    if (this.mode !== mode) { this.clear(); this.mode = mode; this.updateMode(); }
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.clear();
    this.root.hidden = !this.enabled;
  }

  clear() {
    for (const [id, pointer] of this.pointers) {
      pointer.target.classList?.remove('is-held');
      try {
        if (pointer.target.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id);
      } catch { /* A vanished touch need not block clearing other controls. */ }
    }
    this.pointers.clear(); this.owners.clear();
    this.moveX = this.moveZ = 0;
    this.lookDelta.dx = this.lookDelta.dy = 0;
    this.jumpQueued = this.interactQueued = this.sprint = false;
    if (this.thumb) this.thumb.style.transform = '';
    this.updateSprint();
  }

  snapshot() {
    const result = {
      moveX: this.moveX,
      moveZ: this.moveZ,
      steer: this.mode === 'van' ? -this.moveX : 0,
      zoom: this.mode === 'inspection' ? Number(this.owners.has('reverse')) - Number(this.owners.has('accelerate')) : 0,
      forward: this.mode === 'van' && this.owners.has('accelerate'),
      back: this.mode === 'van' && this.owners.has('reverse'),
      sprint: this.mode === 'foot' && this.sprint,
      jump: this.mode === 'foot' && this.jumpQueued,
      interact: this.mode !== 'inspection' && this.interactQueued,
    };
    this.jumpQueued = this.interactQueued = this.hornQueued = false;
    return result;
  }

  consumeLook() {
    const result = { ...this.lookDelta };
    this.lookDelta.dx = this.lookDelta.dy = 0;
    return result;
  }

  dispose() {
    this.setEnabled(false);
    for (const [target, type, listener] of this.listeners) target.removeEventListener(type, listener);
    this.listeners.length = 0;
  }
}
