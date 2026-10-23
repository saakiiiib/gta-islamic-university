import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ReactionAudio } from '../src/audio/reactions.js';

const manifest = JSON.parse(readFileSync(new URL('../public/audio/reactions.json', import.meta.url), 'utf8'));
const event = (npcId, type = 'nearMiss', position = { x: 2, z: 0 }, extra = {}) =>
  ({ npcId, type, position, ...extra });

function harness({ missing = [], decodeFailure = [], noContext = false } = {}) {
  let time = 1000;
  const sources = [], panners = [], gains = [], listeners = [], fetched = [], effects = [];
  const param = () => ({ value: 0, setValueAtTime(value) { this.value = value; } });
  const node = () => ({ connected: [], connect(other) { this.connected.push(other); }, disconnect() {} });
  class AudioContext {
    constructor() {
      this.state = 'running'; this.currentTime = 1; this.destination = {};
      this.listener = { positionX: param(), positionY: param(), positionZ: param(),
        forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() };
      listeners.push(this.listener);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData(bytes) {
      const marker = new Uint8Array(bytes)[0];
      if (decodeFailure.includes(marker)) return Promise.reject(new Error('decode failure'));
      return Promise.resolve({ marker });
    }
    createBufferSource() {
      const source = { ...node(), buffer: null, started: false, stopped: false,
        start() { this.started = true; }, stop() { this.stopped = true; } };
      sources.push(source); return source;
    }
    createPanner() {
      const panner = { ...node(), positionX: param(), positionY: param(), positionZ: param() };
      panners.push(panner); return panner;
    }
    createGain() { const gain = { ...node(), gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }; gains.push(gain); return gain; }
    createStereoPanner() { return { ...node(), pan: { value: 0 } }; }
    createOscillator() {
      const oscillator = { ...node(), frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        start() { effects.push('start'); }, stop() {} };
      return oscillator;
    }
  }
  const host = {
    performance: { now: () => time },
    fetch: async url => {
      fetched.push(url);
      if (url.endsWith('reactions.json')) return { ok: true, json: async () => manifest };
      const id = Object.entries(manifest.clips).find(([, clip]) => url.endsWith(clip.file))?.[0];
      const marker = id ? (id.startsWith('near') ? 10 : 20) + Number(id.split('_')[1]) : 0;
      return missing.includes(id) ? { ok: false } : { ok: !!id, arrayBuffer: async () => Uint8Array.of(marker).buffer };
    },
    ...(!noContext ? { AudioContext } : {}),
  };
  return { host, sources, panners, gains, listeners, fetched, effects, advance(ms) { time += ms; } };
}

test('bundles only the four supplied MP3s, in the expected categories', () => {
  assert.deepEqual(manifest.categories.nearMiss, ['near_01', 'near_02']);
  assert.deepEqual(manifest.categories.collision, ['hit_01', 'hit_02']);
  assert.equal(Object.keys(manifest.clips).length, 4);
  const expectedHashes = {
    near_01: 'b4cf500847148466f1f3e68909a14359c38a39e121de09f40c905a72467a3289',
    near_02: '309affd562c0b2992d9b8f63df3f0f4ea1373918a145211a081272a4bb50d43d',
    hit_01: 'de0a7b7074efb3fad9819bd955ec048c6e561d17ddacf85fb19677571bce5592',
    hit_02: '6075719770fe8611024fc973093d540145ac14dc693257f26587ea3b2e5a6def',
  };
  for (const [id, clip] of Object.entries(manifest.clips)) {
    const bundled = readFileSync(new URL(`../public/audio/${clip.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(bundled).digest('hex'), expectedHashes[id]);
    assert.ok(bundled.length > 10000);
    assert.ok(bundled.subarray(0, 3).toString() === 'ID3' || (bundled[0] === 0xff && (bundled[1] & 0xe0) === 0xe0));
    assert.equal(clip.transcriptVerified, false);
  }
  for (const name of ['near_watch', 'near_drive', 'near_careful', 'near_angry', 'hit_watch', 'hit_stop', 'hit_pain', 'hit_drive', 'strong_pain', 'strong_help', 'strong_concern']) {
    assert.equal(existsSync(new URL(`../public/audio/${name}.wav`, import.meta.url)), false);
  }
});

test('loads and decodes the recorded clips relative to baseURL', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host, baseURL: '/game/audio/' });
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.status.mode, 'recorded-clips');
  assert.equal(audio.status.clipsAvailable, 4);
  assert.deepEqual(h.fetched, ['/game/audio/reactions.json',
    '/game/audio/npc/near_01.mp3', '/game/audio/npc/near_02.mp3',
    '/game/audio/npc/hit_01.mp3', '/game/audio/npc/hit_02.mp3']);
  audio.dispose();
});

test('a collision replaces a near-miss shout once without overlapping or bypassing repeated-hit cooldowns', async () => {
  const h = harness(), audio = new ReactionAudio({ host: h.host }); await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 }); assert.equal(h.sources.length, 1);
  h.advance(200); audio.consume([event(1, 'collision')], { x: 0, z: 0 });
  assert.equal(h.sources.length, 2); assert.equal(h.sources[0].stopped, true);
  assert.ok(h.sources[1].buffer.marker >= 21); assert.equal(audio.active.category, 'collision');
  h.advance(200); audio.consume([event(2, 'collision'), event(1, 'collision')], { x: 0, z: 0 });
  assert.equal(h.sources.length, 2); assert.equal(h.sources[1].stopped, false);
  h.sources[1].onended(); h.advance(2600); audio.consume([event(1, 'collision')], { x: 0, z: 0 });
  assert.equal(h.sources.length, 2); audio.dispose();
});

test('a simultaneous collision selects its collision recording before a near-miss line', async () => {
  const h = harness(), audio = new ReactionAudio({ host: h.host }); await audio.unlock();
  audio.consume([event(1), event(1, 'collision')], { x: 0, z: 0 });
  assert.equal(h.sources.length, 1); assert.ok(h.sources[0].buffer.marker >= 21); audio.dispose();
});

test('near miss and collision voices come from separate categories without immediate repeats or overlap', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host, random: () => 0 });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(h.sources[0].buffer.marker, 11);
  h.advance(9000);
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 1);
  h.sources[0].onended();
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(h.sources[1].buffer.marker, 12);
  h.sources[1].onended(); h.advance(2500);
  audio.consume([event(3, 'collision')], { x: 0, z: 0 });
  assert.equal(h.sources[2].buffer.marker, 21);
  assert.equal(h.effects.length, 1);
  audio.dispose();
});

test('positions recorded voice at NPC and updates listener location and heading', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host });
  await audio.unlock();
  audio.consume([event(1, 'nearMiss', { x: 10, z: 7 })], { x: 2, z: 3 }, Math.PI / 2);
  const panner = h.panners[0], listener = h.listeners[0];
  assert.equal(panner.panningModel, 'HRTF');
  assert.equal(panner.distanceModel, 'inverse');
  assert.equal(panner.positionX.value, 10);
  assert.equal(panner.positionZ.value, 7);
  assert.equal(listener.positionX.value, 2);
  assert.equal(listener.positionZ.value, 3);
  assert.ok(Math.abs(listener.forwardX.value + 1) < 1e-9);
  audio.update(.016, { x: 5, z: 6 }, 0);
  assert.equal(listener.positionX.value, 5);
  assert.equal(listener.forwardZ.value, -1);
  audio.dispose();
});

test('active recording follows its NPC position and height while it plays', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host });
  await audio.unlock();
  audio.consume([event(7, 'nearMiss', { x: 3, y: 1, z: 4 })], { x: 0, z: 0 });
  const panner = h.panners[0];
  assert.equal(panner.positionY.value, 1);
  audio.update(.016, { x: 0, z: 0 }, 0, [
    { id: 8, position: { x: 20, y: 0, z: 20 } },
    { id: 7, position: { x: 5, y: 2, z: 6 } },
  ]);
  assert.equal(panner.positionX.value, 5);
  assert.equal(panner.positionY.value, 2);
  assert.equal(panner.positionZ.value, 6);
  audio.update(.016, { x: 0, z: 0 }, 0, [{ id: 8, position: { x: 30, z: 30 } }]);
  assert.equal(panner.positionX.value, 5);
  h.sources[0].onended();
  audio.update(.016, { x: 0, z: 0 }, 0, [{ id: 7, position: { x: 9, z: 9 } }]);
  assert.equal(panner.positionX.value, 5);
  audio.dispose();
});

test('missing files and decode failures stay silent; no subtitles or synthesized speech are emitted', async () => {
  const h = harness({ missing: ['near_01', 'near_02'], decodeFailure: [22] });
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: x => subtitles.push(x) });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 0);
  assert.equal(subtitles.length, 0);
  assert.equal(audio.status.clipsAvailable, 1);
  assert.equal(audio.status.voice, null);
  audio.dispose();

  const noWebAudio = harness({ noContext: true });
  const silent = new ReactionAudio({ host: noWebAudio.host });
  await silent.unlock();
  silent.consume([event(1)], { x: 0, z: 0 });
  assert.equal(silent.status.mode, 'voice-unavailable');
  assert.equal(noWebAudio.sources.length, 0);
  silent.dispose();
});

test('mute, pause, cooldowns and range stop or suppress playback', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host });
  await audio.unlock();
  audio.consume([event(1, 'nearMiss', { x: 40, z: 0 })], { x: 0, z: 0 });
  assert.equal(h.sources.length, 0);
  audio.consume([event(1)], { x: 0, z: 0 });
  audio.setMuted(true);
  assert.equal(h.sources[0].stopped, true);
  h.advance(9000);
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 1);
  audio.setMuted(false); await audio.unlock();
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 2);
  audio.setSuspended(true);
  assert.equal(h.sources[1].stopped, true);
  audio.setSuspended(false);
  h.advance(9000);
  audio.consume([event(3)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 2);
  await audio.unlock();
  audio.reset();
  audio.consume([event(3)], { x: 0, z: 0 });
  assert.equal(h.sources.length, 3);
  audio.dispose();
});
