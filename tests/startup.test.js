import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacterSelection } from '../src/ui/startup.js';

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
