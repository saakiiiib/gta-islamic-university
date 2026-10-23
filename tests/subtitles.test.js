import test from 'node:test';
import assert from 'node:assert/strict';
import { Subtitles } from '../src/ui/subtitles.js';

test('Bengali subtitles reuse text nodes, expire on game time and clear immediately', () => {
  const nodes = new Map(['[data-speaker]', '[data-bangla]', '[data-english]'].map(name => [name, { textContent: '' }]));
  const element = { hidden: false, querySelector: selector => nodes.get(selector) };
  const subtitles = new Subtitles(element); assert.equal(element.hidden, true);
  subtitles.show({ text: 'দেখে চালাতে পারিস না?', textEnglish: 'Watch the road!', npcId: 4, duration: 3.5 });
  assert.equal(element.hidden, false); assert.equal(nodes.get('[data-speaker]').textContent, 'STUDENT 05');
  assert.equal(nodes.get('[data-bangla]').textContent, 'দেখে চালাতে পারিস না?');
  for (let i = 0; i < 34; i++) subtitles.update(.1); assert.equal(element.hidden, false);
  subtitles.update(.1); assert.equal(element.hidden, true);
  subtitles.show({ text: '<script>literal text</script>', npcId: 1 });
  assert.equal(nodes.get('[data-bangla]').textContent, '<script>literal text</script>');
  subtitles.hide(); assert.equal(element.hidden, true);
});
