import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacterSelection, createLanding } from '../src/ui/startup.js';

test('Male is the fresh default and early Female choice survives delayed initialization', async () => {
  const choice = createCharacterSelection();
  assert.equal(choice.value, 'hujur');
  choice.select('niqab');
  await Promise.resolve(); // Game bootstrap reads the current selection, not a captured default.
  assert.equal(choice.value, 'niqab');
  assert.equal(createCharacterSelection().value, 'hujur');
});

test('hidden Student and invalid choices cannot replace the two menu characters', () => {
  const choice = createCharacterSelection(), changes = [];
  const unsubscribe = choice.subscribe(type => changes.push(type));
  assert.equal(choice.select('student'), false);
  assert.equal(choice.select(undefined), false);
  choice.select('niqab'); choice.select('niqab'); choice.select('hujur');
  assert.deepEqual(changes, ['niqab', 'hujur']);
  unsubscribe(); choice.select('niqab');
  assert.equal(changes.length, 2);
});

test('landing keeps Student implementation hidden and loads menu before the heavy game', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /data-char="hujur" aria-pressed="true"/);
  assert.match(html, /data-char="student"[^>]+hidden disabled tabindex="-1" aria-hidden="true"/);
  assert.doesNotMatch(html, /hero__description|Explore a living re-creation/);
  assert.match(html, /src="\.\/src\/landing.js"/);
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /setCharacterType\('hujur'\)/);
});

// Minimal DOM fixture exercises state transitions without starting WebGL.
function menuFixture() {
  const element = () => {
    const classes = new Set(), attributes = {}, listeners = {};
    return { hidden: false, disabled: false, textContent: '', dataset: {}, style: {},
      classList: { contains: key => classes.has(key), remove: key => classes.delete(key),
        toggle(key, enabled = !classes.has(key)) { enabled ? classes.add(key) : classes.delete(key); return enabled; } },
      setAttribute: (key, value) => { attributes[key] = value; },
      getAttribute: key => attributes[key], removeAttribute: key => delete attributes[key],
      addEventListener: (event, callback) => { (listeners[event] ??= []).push(callback); },
      fire: (event, data = {}) => { for (const callback of listeners[event] ?? []) callback(data); },
      querySelector: () => null, focus() {},
    };
  };
  const nodes = new Map(['mainGateView','landing','selectionNumber','retry-loading','controlsDialog','controlsButton','enterButton',
    'loadingPanel','enterButtonLabel','loadingMessage','loadingPercent','loadingBar','loadingProgress','error-message'].map(id => [id, element()]));
  const pills = ['hujur', 'niqab', 'student'].map(char => ({ ...element(), dataset: { char }, hidden: char === 'student' }));
  const doc = { ...element(), body: element(), getElementById: id => nodes.get(id),
    querySelectorAll: query => query === '.char-pill' ? pills : query === '.char-pill:not([hidden])' ? pills.slice(0, 2) : [] };
  return { doc, nodes, pills };
}

test('landing preserves loading-time selection, real progress, error gating and retry', () => {
  const { doc, nodes, pills } = menuFixture(); let retries = 0;
  const menu = createLanding(doc, { reload: () => retries++ });
  pills[1].fire('click'); menu.setReady(false);
  assert.equal(menu.selection.value, 'niqab');
  assert.equal(nodes.get('selectionNumber').textContent, '02 / 02');
  assert.equal(nodes.get('enterButton').disabled, true);
  menu.progress('Downloading', { loadedBytes: 1024, totalBytes: 4096 });
  assert.equal(nodes.get('loadingProgress').getAttribute('aria-valuenow'), '25');
  menu.progress('Preparing');
  assert.equal(nodes.get('loadingProgress').getAttribute('aria-valuenow'), undefined);
  menu.setReady(true);
  assert.equal(nodes.get('enterButton').disabled, false);
  assert.equal(nodes.get('loadingPanel').hidden, true);
  menu.fail(new Error('Map unavailable'));
  assert.equal(menu.ready, false);
  assert.equal(nodes.get('error-message').textContent, 'Map unavailable');
  assert.equal(nodes.get('retry-loading').hidden, false);
  nodes.get('retry-loading').fire('click'); assert.equal(retries, 1);
  assert.equal(menu.selection.value, 'niqab');
});

test('expanded gate returns with Escape without changing selection or readiness', () => {
  const { doc, nodes } = menuFixture(), menu = createLanding(doc);
  nodes.get('mainGateView').fire('click');
  assert.equal(nodes.get('landing').classList.contains('gate-expanded'), true);
  assert.equal(nodes.get('mainGateView').getAttribute('aria-label'), 'Return to start menu');
  nodes.get('landing').classList.toggle('gate-live', true);
  doc.fire('keydown', { key: 'Escape' });
  assert.equal(nodes.get('landing').classList.contains('gate-expanded'), false);
  assert.equal(nodes.get('landing').classList.contains('gate-live'), false);
  assert.equal(menu.selection.value, 'hujur'); assert.equal(menu.ready, false);
});
