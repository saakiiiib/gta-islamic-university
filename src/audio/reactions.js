/** Bengali pedestrian reactions. No speech is queued: a voice discovered later only
 * affects future events, so pausing or muting cannot release stale dialogue. */
const DIALOGUE = {
  nearMiss: [
    { id: 'near_watch', text: 'কিরে, চোখে দেখিস না?', english: 'Hey, can’t you see?' },
    { id: 'near_drive', text: 'দেখে চালাতে পারিস না?', english: 'Can’t you watch where you’re going?' },
    { id: 'near_angry', text: 'এই মাদারচোদ!', english: 'Hey, you bastard!' },
    { id: 'near_careful', text: 'এই! সাবধানে চালাও!', english: 'Hey! Drive carefully!' },
  ],
  collision: [
    { id: 'hit_drive', text: 'মাদারচোদ, দেখে গাড়ি চালা!', english: 'Bastard, watch where you’re driving!' },
    { id: 'hit_watch', text: 'কিরে, চোখে দেখিস না?', english: 'Hey, can’t you see?' },
    { id: 'hit_stop', text: 'এই! গাড়িটা থামাও!', english: 'Hey! Stop the van!' },
    { id: 'hit_pain', text: 'আহ! খুব লেগেছে!', english: 'Ow! That hurt!' },
  ],
  strong: [
    { id: 'strong_pain', text: 'আহ! খুব লেগেছে! কেউ সাহায্য করো!', english: 'Ow! I’m hurt! Somebody help!' },
    { id: 'strong_help', text: 'আহ! দাঁড়াও, আমার সাহায্য লাগবে!', english: 'Ow! Wait, I need help!' },
    { id: 'strong_concern', text: 'তুমি ঠিক আছো? কেউ সাহায্য করো!', english: 'Are you okay? Somebody help!' },
  ],
};

const MAX_DISTANCE = 35;
const MAX_EVENTS_PER_BATCH = 16;
const NPC_COOLDOWN_MS = 8000;
const GLOBAL_COOLDOWN_MS = 2400;
const MAX_VOICE_SECONDS = 7;

function coordinates(value) {
  if (Array.isArray(value)) return { x: Number(value[0]), z: Number(value[2] ?? value[1]) };
  return { x: Number(value?.x), z: Number(value?.z ?? value?.y) };
}

function clipName(value) {
  return typeof value === 'string' && value.length <= 120 && /^[\w .\-/]+$/u.test(value)
    && !value.startsWith('/') && !value.startsWith('.') && !value.includes('..') ? value : null;
}

function preferredVoice(voices) {
  if (!Array.isArray(voices)) return null;
  const bengali = voices.filter(voice => /^bn(?:-|$)/i.test(voice?.lang ?? ''));
  return bengali.sort((a, b) => {
    const rank = voice => /^bn-bd$/i.test(voice.lang) ? 0 : /^bn-in$/i.test(voice.lang) ? 1 : 2;
    return rank(a) - rank(b);
  })[0] ?? null;
}

const voiceKey = voice => `${voice?.lang ?? ''}|${voice?.voiceURI ?? ''}|${voice?.name ?? ''}`;

export class ReactionAudio {
  constructor({ host = globalThis, onSubtitle = () => {}, onStatus = () => {}, baseURL = './audio/' } = {}) {
    this.host = host;
    this.onSubtitle = onSubtitle;
    this.onStatus = onStatus;
    this.baseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    this.volume = .5;
    this.muted = false;
    this.suspended = false;
    this.unlocked = false;
    this.disposed = false;
    this.context = null;
    this.effects = new Set();
    this.lastImpact = -Infinity;
    this.synth = null;
    this.voice = null;
    this.failedVoice = null;
    this.active = null;
    this.activeSince = 0;
    this.clips = {};
    this.manifestLoaded = false;
    this.manifestPromise = null;
    this.npcTimes = new Map();
    this.lastGlobal = -Infinity;
    this.lastId = null;
    this.nextIndex = { nearMiss: 0, collision: 0, strong: 0 };
    this.generation = 0;
    this.lastError = null;
    this.removeVoicesListener = null;
  }

  get canSpeak() {
    return !!this.voice && this.failedVoice !== voiceKey(this.voice)
      && typeof this.host.SpeechSynthesisUtterance === 'function';
  }

  get status() {
    return {
      unlocked: this.unlocked, muted: this.muted, suspended: this.suspended,
      volume: this.volume, mode: this.canSpeak ? 'bengali-speech' : Object.keys(this.clips).length && typeof this.host.Audio === 'function'
        ? 'recorded-clips' : 'subtitles-only',
      voice: this.voice?.name ?? null, clipsAvailable: Object.keys(this.clips).length,
      lastError: this.lastError,
    };
  }

  emitStatus() { try { this.onStatus(this.status); } catch { /* UI callbacks cannot interrupt audio */ } }
  now() {
    try { return this.host.performance?.now?.() ?? Date.now(); }
    catch { return Date.now(); }
  }

  refreshVoices() {
    try { this.voice = preferredVoice(this.synth?.getVoices?.()); }
    catch { this.voice = null; }
    this.emitStatus();
  }

  listenForVoices() {
    if (!this.synth || this.removeVoicesListener) return;
    const changed = () => { if (!this.disposed) this.refreshVoices(); };
    try {
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', changed);
        this.removeVoicesListener = () => this.synth.removeEventListener?.('voiceschanged', changed);
      } else {
        const previous = this.synth.onvoiceschanged;
        const wrapped = (...args) => { try { previous?.(...args); } finally { changed(); } };
        this.synth.onvoiceschanged = wrapped;
        this.removeVoicesListener = () => { if (this.synth.onvoiceschanged === wrapped) this.synth.onvoiceschanged = previous; };
      }
    } catch { /* Some browser implementations expose a partial synthesis API. */ }
  }

  async loadManifest() {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = (async () => {
      try {
        if (typeof this.host.fetch !== 'function') return;
        const response = await this.host.fetch(`${this.baseURL}reactions.json`);
        if (!response?.ok) return;
        const manifest = await response.json();
        if (!manifest || typeof manifest.clips !== 'object' || Array.isArray(manifest.clips)) return;
        this.clips = Object.fromEntries(Object.entries(manifest.clips)
          .filter(([id, name]) => /^[\w-]+$/.test(id) && clipName(name)));
      } catch { /* Local recordings are optional; subtitles remain available. */ }
      finally { this.manifestLoaded = true; this.emitStatus(); }
    })();
    return this.manifestPromise;
  }

  /** Call from a click/key gesture. Context creation and resume start synchronously. */
  async unlock() {
    if (this.disposed || this.suspended) return false;
    if (!this.synth) {
      try { this.synth = this.host.speechSynthesis ?? null; } catch { this.synth = null; }
      this.listenForVoices();
    }
    this.refreshVoices();
    let resume = null;
    try {
      if (!this.context) {
        const AudioContext = this.host.AudioContext ?? this.host.webkitAudioContext;
        if (AudioContext) this.context = new AudioContext();
      }
      if (this.context?.state === 'suspended') resume = this.context.resume?.();
    } catch (error) { this.lastError = String(error); }
    this.unlocked = !this.muted;
    const manifest = this.loadManifest();
    try { await resume; } catch (error) { this.lastError = String(error); }
    await manifest;
    this.emitStatus();
    return this.unlocked;
  }

  stopActive() {
    this.generation++;
    const active = this.active;
    this.active = null;
    if (active?.kind === 'clip') {
      try { active.audio.pause(); active.audio.currentTime = 0; } catch { /* already gone */ }
    } else if (active?.kind === 'speech') {
      try { this.synth?.cancel?.(); } catch { /* browser may reject cancel */ }
    }
    for (const effect of this.effects) {
      try { effect.oscillator.stop(); } catch { /* may have ended already */ }
      try { effect.oscillator.disconnect(); effect.gain.disconnect(); effect.pan?.disconnect(); } catch { /* optional */ }
    }
    this.effects.clear();
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.muted) { this.stopActive(); this.unlocked = false; try { this.context?.suspend?.(); } catch { /* optional */ } }
    this.emitStatus();
  }
  setVolume(value) {
    this.volume = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : this.volume;
    if (this.volume === 0) this.stopActive();
    this.emitStatus();
  }
  setSuspended(value) {
    this.suspended = !!value;
    if (this.suspended) { this.stopActive(); this.unlocked = false; try { this.context?.suspend?.(); } catch { /* optional */ } }
    this.emitStatus();
  }

  selectDialogue(category) {
    const bank = DIALOGUE[category];
    let index = this.nextIndex[category] % bank.length;
    let onlyOneClip = false;
    if (!this.canSpeak && Object.keys(this.clips).length) {
      const available = bank.map((line, offset) => ({ line, index: offset })).filter(item => clipName(this.clips[item.line.id]));
      if (available.length) {
        index = available.find(item => item.index >= index && item.line.id !== this.lastId)?.index
          ?? available.find(item => item.line.id !== this.lastId)?.index ?? available[0].index;
        onlyOneClip = available.length === 1;
      }
    }
    if (bank[index].id === this.lastId && !onlyOneClip) index = (index + 1) % bank.length;
    const line = bank[index];
    this.nextIndex[category] = (index + 1) % bank.length;
    this.lastId = line.id;
    return line;
  }

  speak(line, distance) {
    if (!this.canSpeak || !this.synth) return false;
    try {
      const chosenVoice = this.voice;
      const utterance = new this.host.SpeechSynthesisUtterance(line.text);
      utterance.voice = chosenVoice;
      utterance.lang = chosenVoice.lang || 'bn-BD';
      utterance.volume = Math.min(.7, this.volume * .7);
      utterance.rate = 1;
      const generation = ++this.generation;
      utterance.onend = () => {
        if (generation === this.generation && this.active?.utterance === utterance) this.active = null;
      };
      utterance.onerror = error => {
        if (generation !== this.generation || this.active?.utterance !== utterance) return;
        this.active = null;
        this.failedVoice = voiceKey(chosenVoice);
        this.lastError = String(error?.error ?? 'Speech synthesis failed');
        if (this.unlocked && !this.muted && !this.suspended && this.volume > 0) this.playClip(line, distance);
        this.emitStatus();
      };
      this.active = { kind: 'speech', utterance };
      this.activeSince = this.now();
      this.synth.speak(utterance);
      return true;
    } catch (error) {
      this.active = null;
      this.failedVoice = voiceKey(this.voice);
      this.lastError = String(error);
      this.emitStatus();
      return false;
    }
  }

  playClip(line, distance) {
    const name = clipName(this.clips[line.id]);
    if (!name || typeof this.host.Audio !== 'function') return false;
    try {
      const audio = new this.host.Audio(`${this.baseURL}${name}`);
      audio.volume = Math.min(.7, this.volume * .7 * (1 - distance / (MAX_DISTANCE * 1.4)));
      const generation = ++this.generation;
      audio.onended = audio.onerror = () => { if (generation === this.generation) this.active = null; };
      this.active = { kind: 'clip', audio };
      this.activeSince = this.now();
      const playing = audio.play();
      playing?.catch?.(() => { if (generation === this.generation) this.active = null; });
      return true;
    } catch (error) { this.active = null; this.lastError = String(error); this.emitStatus(); return false; }
  }

  playImpact(event, listener, distance) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || !Number.isFinite(distance) || distance > MAX_DISTANCE
      || this.now() - this.lastImpact < 180) return;
    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner?.();
      const time = ctx.currentTime;
      const severity = { low: .25, medium: .55, high: 1 }[event.severity] ?? Number(event.severity);
      const magnitude = Math.max(.15, Math.min(1, severity || Math.abs(Number(event.speed)) / 12 || .3));
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(125, time);
      oscillator.frequency.exponentialRampToValueAtTime(48, time + .17);
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(Math.max(.001, this.volume * .11 * magnitude * (1 - distance / MAX_DISTANCE)), time + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .2);
      oscillator.connect(gain);
      if (pan) {
        const x = coordinates(event.position).x - listener.x;
        pan.pan.value = Math.max(-.85, Math.min(.85, x / 15));
        gain.connect(pan); pan.connect(ctx.destination);
      } else gain.connect(ctx.destination);
      oscillator.start(time); oscillator.stop(time + .21);
      const effect = { oscillator, gain, pan };
      this.effects.add(effect);
      this.lastImpact = this.now();
      oscillator.onended = () => {
        this.effects.delete(effect);
        oscillator.disconnect(); gain.disconnect(); pan?.disconnect();
      };
    } catch { /* Effects are optional on partially implemented audio contexts. */ }
  }

  consume(events, listenerPosition) {
    if (this.suspended || this.disposed || !Array.isArray(events)) return;
    const listener = coordinates(listenerPosition);
    if (!Number.isFinite(listener.x) || !Number.isFinite(listener.z)) return;
    const now = this.now();
    const canPlay = this.unlocked && !this.muted && this.volume > 0;
    for (const event of events.slice(0, MAX_EVENTS_PER_BATCH)) {
      if (!event || !['nearMiss', 'collision', 'worldImpact'].includes(event.type)) continue;
      const position = coordinates(event.position);
      const distance = Math.hypot(position.x - listener.x, position.z - listener.z);
      if (!Number.isFinite(distance) || distance > MAX_DISTANCE) continue;
      if (canPlay && event.type !== 'nearMiss') this.playImpact(event, listener, distance);
      if (event.npcId == null || this.active || now - this.lastGlobal < GLOBAL_COOLDOWN_MS) continue;
      const npcId = String(event.npcId);
      if (now - (this.npcTimes.get(npcId) ?? -Infinity) < NPC_COOLDOWN_MS) continue;
      const strong = event.severity === 'strong' || event.severity === 'high'
        || Number(event.severity) >= .65 || Number(event.speed) >= 9;
      const category = event.type === 'nearMiss' ? 'nearMiss' : strong ? 'strong' : 'collision';
      const line = this.selectDialogue(category);
      this.lastGlobal = now;
      this.npcTimes.set(npcId, now);
      if (this.npcTimes.size > 128) this.npcTimes.delete(this.npcTimes.keys().next().value);
      try { this.onSubtitle({ text: line.text, bengali: line.text, textEnglish: line.english, npcId: event.npcId, duration: 3.5 }); }
      catch { /* Subtitle UI is optional. */ }
      if (canPlay) this.speak(line, distance) || this.playClip(line, distance);
      break;
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt < 0 || !this.active) return;
    if (this.now() - this.activeSince > MAX_VOICE_SECONDS * 1000) this.stopActive();
  }

  reset() {
    this.stopActive();
    this.npcTimes.clear();
    this.lastGlobal = -Infinity;
    this.lastImpact = -Infinity;
    this.lastId = null;
    this.nextIndex = { nearMiss: 0, collision: 0, strong: 0 };
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.disposed = true;
    try { this.removeVoicesListener?.(); } catch { /* already removed */ }
    try { this.context?.close?.(); } catch { /* browser may reject close */ }
    this.context = null;
    this.emitStatus();
  }
}
