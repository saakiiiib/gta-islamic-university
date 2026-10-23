import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReactionAudio } from '../src/audio/reactions.js';

function harness({ voices = [{ name: 'Bangla', lang: 'bn-BD' }], clips = {}, audioContext = false } = {}) {
  let time = 1000;
  const spoken = [], cancelled = [], listeners = new Map(), played = [], effects = [];
  const synth = {
    voices,
    getVoices() { return this.voices; },
    speak(utterance) { spoken.push(utterance); },
    cancel() { cancelled.push(true); },
    addEventListener(name, fn) { listeners.set(name, fn); },
    removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  class Utterance { constructor(text) { this.text = text; } }
  class Audio {
    constructor(src) { this.src = src; played.push(this); }
    play() { this.playing = true; return Promise.resolve(); }
    pause() { this.playing = false; }
  }
  class AudioContext {
    constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createOscillator() {
      const node = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {},
        start() { effects.push('start'); }, stop() {} };
      return node;
    }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
  }
  const host = {
    performance: { now: () => time }, speechSynthesis: synth, SpeechSynthesisUtterance: Utterance, Audio,
    fetch: async () => ({ ok: true, json: async () => ({ clips }) }),
    ...(audioContext ? { AudioContext } : {}),
  };
  return { host, synth, spoken, cancelled, played, effects, listeners, advance(ms) { time += ms; } };
}

const event = (npcId, type = 'nearMiss', position = { x: 2, z: 0 }, extra = {}) =>
  ({ npcId, type, position, ...extra });

test('uses a Bengali voice and Bengali-script utterances with matching subtitles', async () => {
  const h = harness({ voices: [{ name: 'English', lang: 'en-US' }, { name: 'Indian Bangla', lang: 'bn-IN' }, { name: 'Bangladesh Bangla', lang: 'bn-BD' }] });
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: subtitle => subtitles.push(subtitle) });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 1);
  assert.equal(h.spoken[0].voice.name, 'Bangladesh Bangla');
  assert.equal(h.spoken[0].lang, 'bn-BD');
  assert.match(h.spoken[0].text, /[\u0980-\u09ff]/u);
  assert.equal(subtitles[0].text, h.spoken[0].text);
  assert.equal(subtitles[0].npcId, 1);
  assert.equal(audio.status.mode, 'bengali-speech');
  audio.dispose();
});

test('late voices change future reactions only; cooldowns and active voice prevent a queue', async () => {
  const h = harness({ voices: [] });
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: subtitle => subtitles.push(subtitle) });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 0);
  h.synth.voices = [{ name: 'Bengali', lang: 'bn' }];
  h.listeners.get('voiceschanged')();
  assert.equal(h.spoken.length, 0);
  h.advance(2500);
  audio.consume([event(1), event(2)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 1);
  assert.equal(subtitles.at(-1).npcId, 2);
  h.advance(9000);
  audio.consume(Array.from({ length: 40 }, (_, i) => event(i + 3)), { x: 0, z: 0 });
  assert.equal(h.spoken.length, 1);
  h.spoken[0].onend();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 2);
  assert.notEqual(h.spoken[1].text, h.spoken[0].text);
  audio.dispose();
  assert.equal(h.listeners.has('voiceschanged'), false);
});

test('mute, suspension, and reset cancel speech and never replay stale reactions', async () => {
  const h = harness();
  const audio = new ReactionAudio({ host: h.host });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  audio.setMuted(true);
  assert.equal(h.cancelled.length, 1);
  h.spoken[0].onend();
  h.advance(9000);
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 1);
  audio.setMuted(false);
  await audio.unlock();
  h.advance(2500);
  audio.consume([event(3)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 2);
  audio.setSuspended(true);
  assert.equal(h.cancelled.length, 2);
  audio.setSuspended(false);
  h.advance(9000);
  audio.consume([event(4)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 2);
  await audio.unlock();
  audio.reset();
  audio.consume([event(4)], { x: 0, z: 0 });
  assert.equal(h.spoken.length, 3);
  audio.dispose();
});

test('locked, muted, and zero-volume audio still produces immediate Bengali subtitles', async () => {
  const h = harness();
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: x => subtitles.push(x) });
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(subtitles.length, 1);
  assert.equal(h.spoken.length, 0);
  await audio.unlock();
  audio.setMuted(true);
  h.advance(2500);
  audio.consume([event(2)], { x: 0, z: 0 });
  assert.equal(subtitles.length, 2);
  assert.equal(h.spoken.length, 0);
  audio.setMuted(false);
  await audio.unlock();
  audio.setVolume(0);
  h.advance(2500);
  audio.consume([event(3)], { x: 0, z: 0 });
  assert.equal(subtitles.length, 3);
  assert.equal(h.spoken.length, 0);
  audio.dispose();
});

test('loads optional local recorded clips and uses subtitles when none are available', async () => {
  const h = harness({ voices: [], clips: { near_watch: 'near_watch.wav' } });
  const audio = new ReactionAudio({ host: h.host, baseURL: './audio/' });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(audio.status.mode, 'recorded-clips');
  assert.equal(h.played[0].src, './audio/near_watch.wav');
  audio.setMuted(true);
  assert.equal(h.played[0].playing, false);
  audio.dispose();

  const empty = harness({ voices: [] });
  const subtitles = [];
  const subtitleOnly = new ReactionAudio({ host: empty.host, onSubtitle: x => subtitles.push(x) });
  await subtitleOnly.unlock();
  subtitleOnly.consume([event(4)], { x: 0, z: 0 });
  assert.equal(subtitleOnly.status.mode, 'subtitles-only');
  assert.equal(subtitles.length, 1);
  assert.equal(empty.played.length, 0);
  subtitleOnly.dispose();
});

test('distant events are inaudible; nearby impacts make a quiet spatial effect', async () => {
  const h = harness({ audioContext: true });
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: x => subtitles.push(x) });
  await audio.unlock();
  audio.consume([event(1, 'collision', { x: 40, z: 0 }, { severity: 1 })], { x: 0, z: 0 });
  assert.equal(h.effects.length, 0);
  assert.equal(subtitles.length, 0);
  audio.consume([event(1, 'collision', { x: 2, z: 0 }, { severity: 1 })], { x: 0, z: 0 });
  assert.equal(h.effects.length, 1);
  assert.equal(subtitles.length, 1);
  assert.match(subtitles[0].text, /আহ|সাহায্য|ঠিক/);
  audio.dispose();
});

test('partial and throwing browser APIs degrade to subtitles', async () => {
  const h = harness();
  h.synth.getVoices = () => { throw new Error('voices unavailable'); };
  h.host.fetch = () => { throw new Error('manifest unavailable'); };
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: x => subtitles.push(x) });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  assert.equal(subtitles.length, 1);
  assert.equal(h.spoken.length, 0);
  audio.dispose();

  const broken = harness();
  broken.synth.speak = () => { throw new Error('speak blocked'); };
  const fallback = [];
  const audio2 = new ReactionAudio({ host: broken.host, onSubtitle: x => fallback.push(x) });
  await audio2.unlock();
  audio2.consume([event(1)], { x: 0, z: 0 });
  assert.equal(fallback.length, 1);
  assert.equal(audio2.active, null);
  audio2.dispose();
});

test('asynchronous browser speech errors fall back to a clip without replaying after pause', async () => {
  const h = harness({ clips: { near_watch: 'near_watch.wav', near_drive: 'near_drive.wav' } });
  const audio = new ReactionAudio({ host: h.host });
  await audio.unlock();
  audio.consume([event(1)], { x: 0, z: 0 });
  h.spoken[0].onerror({ error: 'synthesis-failed' });
  assert.equal(h.played.length, 1);
  assert.equal(h.played[0].src, './audio/near_watch.wav');
  assert.equal(audio.status.mode, 'recorded-clips');
  audio.setSuspended(true);
  h.spoken[0].onerror({ error: 'late-error' });
  assert.equal(h.played.length, 1);
  audio.dispose();
});

test('every bundled fallback entry is a nonempty local PCM WAV clip', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/reactions.json', import.meta.url), 'utf8'));
  assert.equal(Object.keys(manifest.clips).length, 11);
  for (const name of Object.values(manifest.clips)) {
    const wav = readFileSync(new URL(`../public/audio/${name}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.ok(wav.length > 20000, `${name} should contain audible PCM samples`);
    let peak = 0;
    for (let offset = 44; offset + 1 < wav.length; offset += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(offset)));
    assert.ok(peak > 1000, `${name} should contain non-silent speech`);
  }
});

test('high-severity NPC collisions use pain or concerned Bengali dialogue', async () => {
  const h = harness();
  const subtitles = [];
  const audio = new ReactionAudio({ host: h.host, onSubtitle: x => subtitles.push(x) });
  await audio.unlock();
  audio.consume([event(1, 'collision', { x: 1, z: 0 }, { severity: 'high', speed: 5 })], { x: 0, z: 0 });
  assert.match(subtitles[0].text, /আহ|সাহায্য|ঠিক/);
  audio.dispose();
});
