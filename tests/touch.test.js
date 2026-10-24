import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchControls } from '../src/player/touch.js';
import { InputController } from '../src/player/input.js';

class Surface extends EventTarget {
  constructor() { super(); this.style = {}; this.dataset = {}; this.hidden = false; this.captures = new Set(); }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); }
  setAttribute(name, value) { this[name] = value; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
}

function setup() {
  const win = new Surface(), doc = new Surface(), canvas = new Surface(), root = new Surface();
  const stick = new Surface(), thumb = new Surface(), caption = new Surface(), look = new Surface();
  const actions = Object.fromEntries(['jump', 'sprint', 'interact', 'accelerate', 'reverse', 'pause'].map(a => [a, new Surface()]));
  doc.defaultView = win; canvas.ownerDocument = root.ownerDocument = doc;
  root.querySelector = selector => selector === '#touch-stick' ? stick : selector === '#touch-stick-thumb' ? thumb : selector === '#touch-stick-caption' ? caption : selector === '#touch-look' ? look : actions[selector.match(/data-touch-action="(.*?)"/)?.[1]];
  const controls = new TouchControls({ root, canvas });
  const pointer = (target, type, id, x = 50, y = 50) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' }, clientX: { value: x }, clientY: { value: y } });
    target.dispatchEvent(event);
    return event;
  };
  return { win, doc, canvas, root, stick, look, thumb, caption, actions, controls, pointer };
}

test('multiple fingers independently move, look, and queue jump; joystick is proportional', () => {
  const s = setup(); let gestures = 0; s.controls.onGesture = () => gestures++;
  s.controls.setEnabled(true);
  s.pointer(s.stick, 'pointerdown', 1, 50, 50);
  s.pointer(s.root, 'pointermove', 1, 75, 50);
  s.pointer(s.look, 'pointerdown', 2, 300, 300);
  s.pointer(s.root, 'pointermove', 2, 312, 292);
  s.pointer(s.actions.jump, 'pointerdown', 3);
  assert.equal(gestures, 3);
  const state = s.controls.snapshot();
  assert.ok(state.moveX > 0 && state.moveX < 1);
  assert.equal(state.moveZ, 0);
  assert.equal(state.jump, true);
  assert.equal(s.controls.snapshot().jump, false);
  assert.deepEqual(s.controls.consumeLook(), { dx: 12, dy: -8 });
  s.pointer(s.root, 'pointercancel', 1);
  assert.equal(s.controls.snapshot().moveX, 0);
  s.pointer(s.root, 'pointermove', 2, 315, 290);
  assert.deepEqual(s.controls.consumeLook(), { dx: 3, dy: -2 });
  s.controls.dispose();
});

test('duplicate ownership is rejected, sprint toggles, van actions hold, and mode clears input', () => {
  const s = setup(); s.controls.setEnabled(true);
  s.pointer(s.stick, 'pointerdown', 1, 100, 50);
  s.pointer(s.stick, 'pointerdown', 2, 0, 50);
  assert.equal(s.controls.pointers.has(2), false);
  s.pointer(s.actions.sprint, 'pointerdown', 3);
  assert.equal(s.controls.snapshot().sprint, true);
  assert.equal(s.actions.sprint['aria-pressed'], 'true');
  s.pointer(s.root, 'pointerup', 3);
  s.pointer(s.actions.sprint, 'pointerdown', 4);
  assert.equal(s.controls.snapshot().sprint, false);
  s.controls.setMode('van');
  assert.equal(s.controls.snapshot().moveX, 0);
  assert.equal(s.caption.textContent, 'STEER');
  s.pointer(s.stick, 'pointerdown', 5, 100, 50);
  s.pointer(s.actions.accelerate, 'pointerdown', 6);
  s.pointer(s.actions.reverse, 'pointerdown', 7);
  const van = s.controls.snapshot();
  assert.equal(van.steer, -1);
  assert.equal(van.forward, true);
  assert.equal(van.back, true);
  s.pointer(s.root, 'lostpointercapture', 6);
  assert.equal(s.controls.snapshot().forward, false);
  assert.equal(s.controls.snapshot().back, true);
  s.controls.setMode('inspection');
  assert.equal(s.controls.snapshot().back, false);
  assert.equal(s.caption.textContent, 'PAN');
  s.controls.dispose();
});

test('pause, focus loss, visibility, and disable clear all touches', () => {
  const s = setup(); const pauses = []; s.controls.onPause = reason => pauses.push(reason);
  s.controls.setEnabled(true);
  s.pointer(s.stick, 'pointerdown', 1, 100, 50);
  s.pointer(s.actions.pause, 'pointerdown', 2);
  assert.deepEqual(pauses, ['touch']);
  assert.equal(s.controls.snapshot().moveX, 0);
  s.pointer(s.stick, 'pointerdown', 3, 100, 50);
  s.win.dispatchEvent(new Event('blur'));
  assert.equal(s.controls.snapshot().moveX, 0);
  s.pointer(s.stick, 'pointerdown', 4, 100, 50);
  s.doc.hidden = true; s.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(s.controls.snapshot().moveX, 0);
  s.controls.setEnabled(false);
  assert.equal(s.root.hidden, true);
  s.controls.dispose();
});

test('InputController merges touch without breaking keyboard priority or PC look', async () => {
  const s = setup(); const input = new InputController(s.canvas);
  input.setTouchControls(s.controls); input.setEnabled(true);
  s.pointer(s.stick, 'pointerdown', 1, 75, 50);
  s.pointer(s.look, 'pointerdown', 2, 200, 200);
  s.pointer(s.root, 'pointermove', 2, 206, 197);
  const touch = input.snapshot();
  assert.ok(touch.moveX > 0 && touch.right);
  assert.deepEqual(input.consumeLook(), { dx: 6, dy: -3 });
  const key = new Event('keydown', { cancelable: true });
  Object.defineProperties(key, { code: { value: 'KeyW' }, repeat: { value: false } });
  s.win.dispatchEvent(key);
  const keyboard = input.snapshot();
  assert.equal(keyboard.forward, true);
  assert.equal(keyboard.moveX, undefined);
  assert.equal(keyboard.right, false);
  assert.equal(await input.requestPointerLock(), false);
  input.setEnabled(false);
  assert.equal(input.snapshot().forward, false);
  input.dispose();
});

test('van keyboard throttle and steering override their touch axes independently', () => {
  const s = setup(), input = new InputController(s.canvas);
  input.setTouchControls(s.controls); input.setEnabled(true); s.controls.setMode('van');
  s.pointer(s.stick, 'pointerdown', 1, 100, 50);
  s.pointer(s.actions.accelerate, 'pointerdown', 2);
  const key = (code, type = 'keydown') => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
    s.win.dispatchEvent(event);
  };
  key('KeyS');
  let state = input.snapshot();
  assert.equal(state.steer, -1, 'W/S must retain touch steering');
  assert.equal(state.back, true);
  assert.equal(state.forward, false, 'keyboard throttle overrides touch accelerator');
  key('KeyS', 'keyup'); key('KeyA');
  state = input.snapshot();
  assert.equal(state.steer, 1, 'A/D overrides touch steering');
  assert.equal(state.forward, true, 'touch throttle remains available with keyboard steering');
  key('KeyA', 'keyup');
  assert.equal(input.snapshot().steer, -1);
  input.dispose();
});

test('inspection zoom is held and mode visibility and labels follow zoom controls', () => {
  const s = setup(); s.controls.setEnabled(true); s.controls.setMode('inspection');
  assert.equal(s.actions.accelerate.hidden, false);
  assert.equal(s.actions.reverse.hidden, false);
  assert.equal(s.actions.pause.hidden, false);
  assert.equal(s.actions.interact.hidden, true);
  assert.equal(s.actions.accelerate.textContent, 'ZOOM +');
  assert.equal(s.actions.reverse.textContent, 'ZOOM −');
  s.pointer(s.actions.accelerate, 'pointerdown', 1);
  assert.equal(s.controls.snapshot().zoom, -1);
  assert.equal(s.controls.snapshot().forward, false);
  s.pointer(s.root, 'pointerup', 1);
  assert.equal(s.controls.snapshot().zoom, 0);
  s.pointer(s.actions.reverse, 'pointerdown', 2);
  assert.equal(s.controls.snapshot().zoom, 1);
  s.controls.setMode('van');
  assert.equal(s.controls.snapshot().zoom, 0);
  s.controls.dispose();
});

test('canceled queued actions do not fire, while completed presses remain queued', () => {
  const s = setup(); s.controls.setEnabled(true);
  s.pointer(s.actions.jump, 'pointerdown', 1);
  s.pointer(s.root, 'pointercancel', 1);
  assert.equal(s.controls.snapshot().jump, false);
  s.pointer(s.actions.interact, 'pointerdown', 2);
  s.pointer(s.root, 'lostpointercapture', 2);
  assert.equal(s.controls.snapshot().interact, false);
  s.pointer(s.actions.jump, 'pointerdown', 3);
  s.pointer(s.root, 'pointerup', 3);
  assert.equal(s.controls.snapshot().jump, true);
  s.controls.dispose();
});
