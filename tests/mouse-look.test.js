import test from 'node:test';
import assert from 'node:assert/strict';
import { InputController } from '../src/player/input.js';

function setup() {
  class Surface extends EventTarget {}
  const win = new Surface(), doc = new Surface(), canvas = new Surface(), hud = new Surface();
  doc.defaultView = win; doc.pointerLockElement = null; canvas.ownerDocument = doc;
  doc.exitPointerLock = () => { doc.pointerLockElement = null; doc.dispatchEvent(new Event('pointerlockchange')); };
  const pauses = [], input = new InputController(canvas, { onPause: reason => pauses.push(reason) });
  input.setEnabled(true);
  const mouse = (target, type, values = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
    if (type === 'mousemove') { Object.defineProperty(event, 'target', { value: target }); win.dispatchEvent(event); }
    else target.dispatchEvent(event);
  };
  return { win, doc, canvas, hud, input, pauses, mouse };
}

test('ordinary mouse movement rotates over the canvas without pointer-lock support', async () => {
  const s = setup();
  assert.equal(await s.input.requestPointerLock(), false);
  s.mouse(s.canvas, 'mousemove', { clientX: 100, clientY: 90 });
  s.mouse(s.canvas, 'mousemove', { clientX: 145, clientY: 72 });
  assert.deepEqual(s.input.consumeLook(), { dx: 45, dy: -18 });
  s.mouse(s.hud, 'mousemove', { clientX: 600, clientY: 400 });
  s.mouse(s.canvas, 'mousemove', { clientX: 200, clientY: 200 });
  assert.deepEqual(s.input.consumeLook(), { dx: 0, dy: 0 }, 'HUD and re-entry do not spin camera');
  s.mouse(s.canvas, 'mousemove', { clientX: 205, clientY: 204 });
  s.input.setEnabled(false);
  assert.deepEqual(s.input.consumeLook(), { dx: 0, dy: 0 });
  s.input.setEnabled(true);
  s.mouse(s.canvas, 'mousemove', { clientX: 400, clientY: 300 });
  assert.deepEqual(s.input.consumeLook(), { dx: 0, dy: 0 }, 'resume starts a fresh mouse reference');
  s.input.dispose();
});

test('right drag and locked movement still work while touchscreen motion remains isolated', () => {
  const s = setup();
  s.input.touch = { available: true, clear() {}, setEnabled() {}, dispose() {}, consumeLook: () => ({ dx: 0, dy: 0 }) };
  s.mouse(s.canvas, 'mousemove', { clientX: 10, clientY: 10 });
  s.mouse(s.canvas, 'mousemove', { clientX: 30, clientY: 25 });
  assert.deepEqual(s.input.consumeLook(), { dx: 0, dy: 0 });
  s.mouse(s.canvas, 'mousedown', { button: 2, clientX: 10, clientY: 10 });
  s.mouse(s.hud, 'mousemove', { clientX: 30, clientY: 25 });
  assert.deepEqual(s.input.consumeLook(), { dx: 20, dy: 15 });
  s.doc.pointerLockElement = s.canvas; s.doc.dispatchEvent(new Event('pointerlockchange'));
  s.mouse(s.canvas, 'mousemove', { clientX: 30, clientY: 25, movementX: 8, movementY: -4 });
  assert.deepEqual(s.input.consumeLook(), { dx: 8, dy: -4 });
  s.doc.exitPointerLock(); assert.deepEqual(s.pauses, ['pointerlock']);
  s.input.dispose();
});

test('legacy event-only pointer lock waits for a real grant and canvas clicks can recapture', async () => {
  const s = setup(); let requests = 0;
  s.canvas.requestPointerLock = () => { requests++; };
  const pending = s.input.requestPointerLock();
  assert.equal(s.input.requestPointerLock(), pending, 'simultaneous requests share completion');
  s.doc.pointerLockElement = s.canvas; s.doc.dispatchEvent(new Event('pointerlockchange'));
  assert.equal(await pending, true); assert.equal(requests, 1);
  s.input.releasePointerLock(); assert.deepEqual(s.pauses, []);
  s.mouse(s.canvas, 'mousedown', { button: 0 });
  assert.equal(requests, 2);
  s.doc.dispatchEvent(new Event('pointerlockerror'));
  assert.equal(s.input.pointerRequest, null);
  s.input.dispose();
});

test('rejected and late pointer-lock grants retain fallback and never capture while paused', async () => {
  const s = setup();
  s.canvas.requestPointerLock = () => Promise.reject(new Error('not supported'));
  assert.equal(await s.input.requestPointerLock(), false);
  s.mouse(s.canvas, 'mousemove', { clientX: 1, clientY: 2 });
  s.mouse(s.canvas, 'mousemove', { clientX: 11, clientY: 8 });
  assert.deepEqual(s.input.consumeLook(), { dx: 10, dy: 6 });
  let grant;
  s.canvas.requestPointerLock = () => new Promise(resolve => { grant = resolve; });
  const pending = s.input.requestPointerLock(); s.input.setEnabled(false);
  assert.equal(await pending, false);
  s.doc.pointerLockElement = s.canvas; s.doc.dispatchEvent(new Event('pointerlockchange')); grant();
  await Promise.resolve();
  assert.equal(s.doc.pointerLockElement, null); assert.deepEqual(s.pauses, []);
  s.input.dispose();
});

test('horn stops on release and pause clears a pending honk', () => {
  const s = setup();
  const key = (code, type) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
    s.win.dispatchEvent(event);
  };
  key('KeyH', 'keydown'); assert.equal(s.input.snapshot().horn, true);
  key('KeyH', 'keyup'); assert.equal(s.input.snapshot().horn, false);
  key('KeyH', 'keydown'); s.input.setEnabled(false);
  s.input.setEnabled(true); assert.equal(s.input.snapshot().horn, false);
  s.input.dispose();
});
