import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPlaceSearch } from '../src/ui/placeSearch.js';
import { InputController } from '../src/player/input.js';

// Small EventTarget-based DOM surface: only browser behavior used by the real
// search control is modeled. In particular, keyboard releases bubble to window.
class Surface extends EventTarget {
  constructor() { super(); this.parentNode = null; this.listeners = new Map(); }
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options); this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event) {
    if (!event.target) Object.defineProperty(event, 'target', { value: this });
    super.dispatchEvent(event);
    if (event.bubbles && !event.cancelBubble && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}
class Element extends Surface {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
    this.children = []; this.attributes = new Map(); this._text = '';
    this.id = ''; this.className = ''; this.value = ''; this.hidden = false;
  }
  set innerHTML(_) { throw new Error('Search must not parse source data as HTML'); }
  get innerHTML() { throw new Error('Search must not depend on innerHTML'); }
  set textContent(value) { this.replaceChildren(); this._text = String(value ?? ''); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...elements) {
    for (const element of elements) { element.remove(); element.parentNode = this; this.children.push(element); }
  }
  replaceChildren(...elements) {
    for (const child of this.children) child.parentNode = null;
    this.children = []; this._text = ''; this.append(...elements);
  }
  remove() {
    if (this.parentNode?.children) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  contains(element) {
    for (let current = element; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() {
    if (this.ownerDocument.activeElement === this) return;
    this.ownerDocument.activeElement?.blur(); this.ownerDocument.activeElement = this;
    this.dispatchEvent(new Event('focus'));
  }
  blur() {
    if (this.ownerDocument.activeElement !== this) return;
    this.ownerDocument.activeElement = null; this.dispatchEvent(new Event('blur'));
  }
  scrollIntoView() { this.scrolledIntoView = true; }
}
function environment() {
  const win = new Surface(), doc = new Surface();
  doc.defaultView = win; doc.parentNode = win; doc.activeElement = null; doc.pointerLockElement = null; doc.hidden = false;
  doc.createdTags = []; doc.createElement = tag => { doc.createdTags.push(tag.toUpperCase()); return new Element(tag, doc); };
  doc.body = doc.createElement('body'); doc.body.parentNode = doc;
  return { win, doc, parent: doc.body };
}
function fire(target, type, fields = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true }); Object.assign(event, fields);
  target.dispatchEvent(event); return event;
}
const keyboard = (input, key, fields = {}) => fire(input, 'keydown', { key, code: key, repeat: false, ...fields });
const fixtures = () => [
  { id: 'july', kind: 'building', name: 'Deshratna Sheikh Hasina Hall', names: { en: 'July-36 Hall', bn: 'জুলাই-৩৬ হল' },
    displayName: 'July-36 Hall · জুলাই-৩৬ হল', aliases: ['Deshratna Sheikh Hasina Hall'], x: 1, y: 2, z: 3 },
  { id: 'library', kind: 'building', name: 'Central Library', names: { en: 'Central Library', bn: 'কেন্দ্রীয় গ্রন্থাগার' },
    displayName: 'Central Library · কেন্দ্রীয় গ্রন্থাগার', aliases: [], x: 4, y: 5, z: 6 },
];
const listOf = ui => ui.element.children.find(element => element.getAttribute('role') === 'listbox');
const statusOf = ui => ui.element.children.find(element => element.getAttribute('role') === 'status');

test('real search mounts linked accessible controls and displays untrusted names literally in both languages', () => {
  const { doc, parent } = environment(), selected = [], malicious = '<img src=x onerror=alert(1)>';
  const places = [{ id: 'literal', kind: 'building', name: malicious, displayName: malicious,
    names: { en: malicious, bn: 'অজানা ভবন' }, aliases: [], x: 1, y: 2, z: 3 }];
  const before = structuredClone(places), ui = mountPlaceSearch({ places, onSelect: place => selected.push(place), parent });
  try {
    const list = listOf(ui), label = ui.element.children[0];
    assert.equal(ui.element.getAttribute('role'), 'search'); assert.equal(label.htmlFor, ui.input.id);
    assert.match(label.textContent, /স্থান খুঁজুন/); assert.equal(ui.input.getAttribute('role'), 'combobox');
    assert.equal(ui.input.getAttribute('aria-controls'), list.id);
    assert.equal(ui.input.getAttribute('aria-describedby'), statusOf(ui).id);
    assert.equal(list.hidden, true); assert.equal(ui.input.getAttribute('aria-expanded'), 'false');
    ui.focus(); assert.equal(doc.activeElement, ui.input); assert.equal(list.hidden, false);
    const option = list.children[0];
    assert.equal(option.getAttribute('role'), 'option'); assert.equal(option.children[0].textContent, malicious);
    assert.equal(option.children[1].textContent, 'অজানা ভবন'); assert.equal(option.children[1].lang, 'bn');
    assert.equal(doc.createdTags.includes('IMG'), false);
    assert.equal(fire(option, 'pointerdown').defaultPrevented, true, 'option pointerdown preserves input focus');
    fire(option, 'click'); assert.equal(selected.length, 1); assert.equal(selected[0], places[0]);
    assert.deepEqual(places, before, 'selection never changes source coordinates or metadata');
    assert.equal(ui.input.value, malicious); assert.equal(list.hidden, true);
  } finally { ui.destroy(); }
});

test('English, Bangla and historical queries use keyboard options while IME Enter preserves composition', () => {
  const { parent } = environment(), places = fixtures(), selected = [];
  const ui = mountPlaceSearch({ places, onSelect: place => selected.push(place), parent }), list = listOf(ui);
  try {
    ui.focus(); keyboard(ui.input, 'ArrowDown'); keyboard(ui.input, 'ArrowDown');
    assert.equal(ui.input.getAttribute('aria-activedescendant'), list.children[1].id);
    assert.equal(list.children[1].getAttribute('aria-selected'), 'true');
    keyboard(ui.input, 'ArrowUp'); keyboard(ui.input, 'Enter'); assert.equal(selected[0], places[0]);
    for (const query of ['July', 'জুলাই', 'Sheikh Hasina']) {
      ui.input.value = query; fire(ui.input, 'input'); assert.equal(list.children.length, 1);
      const count = selected.length;
      const composing = keyboard(ui.input, 'Enter', { isComposing: true });
      assert.equal(selected.length, count); assert.equal(composing.defaultPrevented, false);
      keyboard(ui.input, 'Enter', { keyCode: 229 }); assert.equal(selected.length, count);
      keyboard(ui.input, 'ArrowUp'); assert.equal(list.children[0].getAttribute('aria-selected'), 'true');
      keyboard(ui.input, 'Enter'); assert.equal(selected.length, count + 1); assert.equal(selected.at(-1), places[0]);
      assert.equal(list.hidden, true);
    }
  } finally { ui.destroy(); }
});

test('Escape, outside interaction and visibility close results; replacing places and destroy clean up lifecycle', () => {
  const { doc, parent } = environment(), selected = [];
  const ui = mountPlaceSearch({ places: fixtures(), onSelect: place => selected.push(place), parent }), list = listOf(ui);
  ui.focus(); keyboard(ui.input, 'ArrowDown'); keyboard(ui.input, 'Escape');
  assert.equal(list.hidden, true); assert.equal(ui.input.getAttribute('aria-activedescendant'), null);
  fire(ui.input, 'input'); assert.equal(list.hidden, false);
  ui.setVisible(false); assert.equal(ui.element.hidden, true); assert.equal(doc.activeElement, null); assert.equal(list.hidden, true);
  ui.setVisible(true); ui.focus(); assert.equal(list.hidden, false);
  fire(parent, 'pointerdown'); assert.equal(list.hidden, true);
  ui.input.value = 'does not exist'; fire(ui.input, 'input');
  assert.equal(list.children.length, 0); assert.match(statusOf(ui).textContent, /কোনো স্থান পাওয়া যায়নি/);
  const replacement = { id: 'replacement', kind: 'building', name: 'Does not exist annex', aliases: [] };
  ui.setPlaces([replacement]); fire(ui.input, 'input'); assert.equal(list.children.length, 1);
  const detachedOption = list.children[0];
  assert.throws(() => ui.setPlaces(null), /place array/);
  ui.destroy(); ui.destroy(); assert.equal(parent.children.length, 0);
  assert.equal(ui.input.listenerCount('keydown'), 0); assert.equal(ui.input.listenerCount('input'), 0);
  assert.equal(doc.listenerCount('pointerdown'), 0);
  fire(detachedOption, 'click'); fire(ui.input, 'input'); ui.focus();
  assert.equal(selected.length, 0, 'destroyed controls cannot select or remount results');
});

test('held movement key releases reach the actual InputController while typing and Escape stay isolated', () => {
  const { doc, parent } = environment(), canvas = doc.createElement('canvas'); parent.append(canvas);
  let pauses = 0; const controller = new InputController(canvas, { onPause() { pauses++; } }); controller.setEnabled(true);
  const ui = mountPlaceSearch({ places: fixtures(), onSelect() {}, parent });
  try {
    fire(canvas, 'keydown', { key: 'w', code: 'KeyW', repeat: false }); assert.equal(controller.snapshot().forward, true);
    ui.focus(); fire(ui.input, 'keyup', { key: 'w', code: 'KeyW' });
    assert.equal(controller.snapshot().forward, false, 'release must bubble to window cleanup even after search receives focus');
    keyboard(ui.input, 'w', { code: 'KeyW' }); assert.equal(controller.snapshot().forward, false, 'typing must not restart movement');
    keyboard(ui.input, 'Escape', { code: 'Escape' }); assert.equal(pauses, 0, 'closing search must not also pause the game');
    assert.equal(listOf(ui).hidden, true);
  } finally { ui.destroy(); controller.dispose(); }
});
