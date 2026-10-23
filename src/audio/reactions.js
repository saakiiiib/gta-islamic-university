/** Human-recorded Bengali NPC reactions. No synthesized voice or text fallback. */
const CATEGORIES = {
  nearMiss: ['near_01', 'near_02'],
  collision: ['hit_01', 'hit_02'],
};
const MAX_DISTANCE = 35;
const NPC_COOLDOWN_MS = 8000;
const GLOBAL_COOLDOWN_MS = 2400;
const MAX_VOICE_MS = 7000;

function coordinates(value) {
  if (Array.isArray(value)) return { x: Number(value[0]), z: Number(value[2] ?? value[1]) };
  return { x: Number(value?.x), z: Number(value?.z ?? value?.y) };
}

function validClipFile(value) {
  return typeof value === 'string' && /^npc\/[\w-]+\.mp3$/.test(value) && !value.includes('..');
}

function setPosition(node, x, y, z, time) {
  if (node?.positionX?.setValueAtTime && node?.positionY?.setValueAtTime && node?.positionZ?.setValueAtTime) {
    node.positionX.setValueAtTime(x, time);
    node.positionY.setValueAtTime(y, time);
    node.positionZ.setValueAtTime(z, time);
  } else node?.setPosition?.(x, y, z);
}

export class ReactionAudio {
  constructor({ host = globalThis, onSubtitle = () => {}, onStatus = () => {}, baseURL = './audio/', random = Math.random } = {}) {
    this.host = host;
    this.onSubtitle = onSubtitle; // Retained for callers using the existing constructor shape; never invoked.
    this.onStatus = onStatus;
    this.baseURL = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    this.random = random;
    this.volume = .5;
    this.muted = false;
    this.suspended = false;
    this.unlocked = false;
    this.disposed = false;
    this.context = null;
    this.effects = new Set();
    this.lastImpact = -Infinity;
    this.active = null;
    this.activeSince = 0;
    this.clipFiles = new Map();
    this.clips = new Map();
    this.manifestLoaded = false;
    this.manifestPromise = null;
    this.npcTimes = new Map();
    this.npcCategories = new Map();
    this.lastGlobal = -Infinity;
    this.lastGlobalCategory = null;
    this.lastId = null;
    this.lastListener = null;
    this.lastError = null;
  }

  get status() {
    return {
      unlocked: this.unlocked, muted: this.muted, suspended: this.suspended,
      volume: this.volume, mode: this.clips.size && this.context ? 'recorded-clips' : 'voice-unavailable',
      voice: null, clipsAvailable: this.clips.size, lastError: this.lastError,
    };
  }
  emitStatus() { try { this.onStatus(this.status); } catch { /* UI callback cannot interrupt audio. */ } }
  now() {
    try { return this.host.performance?.now?.() ?? Date.now(); }
    catch { return Date.now(); }
  }

  async loadManifest() {
    if (this.manifestPromise) return this.manifestPromise;
    this.manifestPromise = (async () => {
      try {
        if (typeof this.host.fetch !== 'function' || !this.context?.decodeAudioData) return;
        const response = await this.host.fetch(`${this.baseURL}reactions.json`);
        if (!response?.ok) return;
        const manifest = await response.json();
        if (!manifest || typeof manifest.clips !== 'object' || !manifest.categories) return;
        for (const category of Object.keys(CATEGORIES)) {
          const ids = manifest.categories[category];
          if (!Array.isArray(ids)) return;
          for (const id of ids) {
            if (!CATEGORIES[category].includes(id)) continue;
            const file = manifest.clips[id]?.file;
            if (validClipFile(file)) this.clipFiles.set(id, file);
          }
        }
        await Promise.all([...this.clipFiles].map(async ([id, file]) => {
          try {
            const clipResponse = await this.host.fetch(`${this.baseURL}${file}`);
            if (!clipResponse?.ok) return;
            const bytes = await clipResponse.arrayBuffer();
            const buffer = await this.context.decodeAudioData(bytes);
            if (buffer) this.clips.set(id, buffer);
          } catch (error) { this.lastError = String(error); }
        }));
      } catch (error) { this.lastError = String(error); }
      finally { this.manifestLoaded = true; this.emitStatus(); }
    })();
    return this.manifestPromise;
  }

  /** Call from a user gesture so context creation and resume begin synchronously. */
  async unlock() {
    if (this.disposed || this.suspended || this.muted) return false;
    let resume = null;
    try {
      if (!this.context) {
        const AudioContext = this.host.AudioContext ?? this.host.webkitAudioContext;
        if (AudioContext) this.context = new AudioContext();
      }
      if (this.context?.state === 'suspended') resume = this.context.resume?.();
    } catch (error) { this.lastError = String(error); }
    try { await resume; } catch (error) { this.lastError = String(error); }
    this.unlocked = this.context?.state === 'running';
    await this.loadManifest();
    this.emitStatus();
    return this.unlocked;
  }

  stopActive() {
    const active = this.active;
    this.active = null;
    if (active) {
      try { active.source.stop(); } catch { /* Already ended. */ }
      try { active.source.disconnect(); active.panner?.disconnect(); active.gain.disconnect(); } catch { /* Optional. */ }
    }
    for (const effect of this.effects) {
      try { effect.oscillator.stop(); } catch { /* Already ended. */ }
      try { effect.oscillator.disconnect(); effect.gain.disconnect(); effect.pan?.disconnect(); } catch { /* Optional. */ }
    }
    this.effects.clear();
  }
  setMuted(value) {
    this.muted = !!value;
    if (this.muted) { this.stopActive(); this.unlocked = false; try { this.context?.suspend?.(); } catch { /* Optional. */ } }
    this.emitStatus();
  }
  setVolume(value) {
    this.volume = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : this.volume;
    if (this.volume === 0) this.stopActive();
    else if (this.active) this.active.gain.gain.value = this.volume * .7;
    this.emitStatus();
  }
  setSuspended(value) {
    this.suspended = !!value;
    if (this.suspended) { this.stopActive(); this.unlocked = false; try { this.context?.suspend?.(); } catch { /* Optional. */ } }
    this.emitStatus();
  }

  selectClip(category) {
    const available = CATEGORIES[category].filter(id => this.clips.has(id));
    if (!available.length) return null;
    const alternatives = available.filter(id => id !== this.lastId);
    const pool = alternatives.length ? alternatives : available;
    const random = Number(this.random());
    const index = Number.isFinite(random) ? Math.min(pool.length - 1, Math.max(0, Math.floor(random * pool.length))) : 0;
    const id = pool[index];
    this.lastId = id;
    return id;
  }

  positionListener(position, heading = 0) {
    const listener = coordinates(position);
    if (!Number.isFinite(listener.x) || !Number.isFinite(listener.z)) return null;
    const yaw = Number.isFinite(Number(heading)) ? Number(heading) : 0;
    this.lastListener = { ...listener, heading: yaw };
    const audioListener = this.context?.listener;
    if (audioListener) {
      setPosition(audioListener, listener.x, 0, listener.z, this.context.currentTime);
      const orientation = [-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0];
      const params = ['forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(key => audioListener[key]);
      if (params.every(param => param?.setValueAtTime)) params.forEach((param, index) => param.setValueAtTime(orientation[index], this.context.currentTime));
      else audioListener.setOrientation?.(...orientation);
    }
    return listener;
  }

  playClip(id, position, listener, npcId) {
    const ctx = this.context;
    const buffer = this.clips.get(id);
    if (!buffer || !ctx || ctx.state !== 'running' || !ctx.createBufferSource || !ctx.createGain) return false;
    let source, panner, gain;
    try {
      source = ctx.createBufferSource(); source.buffer = buffer;
      gain = ctx.createGain(); gain.gain.value = this.volume * .7;
      if (ctx.createPanner) {
        panner = ctx.createPanner();
        panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse';
        panner.refDistance = 2; panner.maxDistance = MAX_DISTANCE; panner.rolloffFactor = 1;
        const height = Number(position.y);
        setPosition(panner, position.x, Number.isFinite(height) ? height : 0, position.z, ctx.currentTime);
        source.connect(panner); panner.connect(gain);
      } else if (ctx.createStereoPanner) {
        panner = ctx.createStereoPanner();
        const dx = position.x - listener.x, dz = position.z - listener.z;
        const heading = this.lastListener?.heading ?? 0;
        const right = Math.cos(heading) * dx - Math.sin(heading) * dz;
        panner.pan.value = Math.max(-1, Math.min(1, right / 8));
        gain.gain.value *= Math.max(0, 1 - Math.hypot(dx, dz) / MAX_DISTANCE);
        source.connect(panner); panner.connect(gain);
      } else source.connect(gain);
      gain.connect(ctx.destination);
      const active = { source, panner, gain, npcId: String(npcId), spatialMode: ctx.createPanner ? 'hrtf' : 'stereo' };
      source.onended = () => {
        if (this.active === active) this.active = null;
        try { source.disconnect(); panner?.disconnect(); gain.disconnect(); } catch { /* Optional. */ }
      };
      source.start(); this.active = active; this.activeSince = this.now();
      return true;
    } catch (error) {
      this.lastError = String(error);
      try { source?.disconnect(); panner?.disconnect(); gain?.disconnect(); } catch { /* Optional. */ }
      this.emitStatus();
      return false;
    }
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
    } catch { /* Effect is optional on partial audio contexts. */ }
  }

  consume(events, listenerPosition, listenerHeading = 0) {
    if (this.suspended || this.disposed || !Array.isArray(events)) return;
    const listener = this.positionListener(listenerPosition, listenerHeading);
    if (!listener) return;
    const now = this.now();
    const canPlay = this.unlocked && !this.muted && this.volume > 0;
    const ordered = events.slice(0, 16).sort((a, b) => Number(b?.type === 'collision') - Number(a?.type === 'collision'));
    for (const event of ordered) {
      if (!event || !['nearMiss', 'collision', 'worldImpact'].includes(event.type)) continue;
      const position = coordinates(event.position);
      const distance = Math.hypot(position.x - listener.x, position.z - listener.z);
      if (!Number.isFinite(distance) || distance > MAX_DISTANCE) continue;
      if (canPlay && event.type !== 'nearMiss') this.playImpact(event, listener, distance);
      if (!canPlay || event.npcId == null) continue;
      const npcId = String(event.npcId);
      const category = event.type === 'nearMiss' ? 'nearMiss' : 'collision';
      const coolingDown = now - (this.npcTimes.get(npcId) ?? -Infinity) < NPC_COOLDOWN_MS;
      const upgrade = category === 'collision' && coolingDown && this.npcCategories.get(npcId) === 'nearMiss';
      const priority = category === 'collision' && (this.active?.category === 'nearMiss' || (!this.active && this.lastGlobalCategory === 'nearMiss' && upgrade));
      if (coolingDown && !upgrade || this.active && !priority || now - this.lastGlobal < GLOBAL_COOLDOWN_MS && !priority) continue;
      const id = this.selectClip(category);
      if (!id) continue;
      if (priority && this.active) this.stopActive();
      const height = Array.isArray(event.position) ? event.position[1] : event.position?.y;
      if (!this.playClip(id, { ...position, y: height }, listener, event.npcId)) continue;
      this.active.category = category;
      this.lastGlobal = now;
      this.lastGlobalCategory = category;
      this.npcTimes.set(npcId, now);
      this.npcCategories.set(npcId, category);
      if (this.npcTimes.size > 128) { const first = this.npcTimes.keys().next().value; this.npcTimes.delete(first); this.npcCategories.delete(first); }
      break;
    }
  }

  update(dt, listenerPosition, listenerHeading = 0, agents) {
    if (listenerPosition) this.positionListener(listenerPosition, listenerHeading);
    if (!Number.isFinite(dt) || dt < 0 || !this.active) return;
    if (this.now() - this.activeSince > MAX_VOICE_MS) { this.stopActive(); return; }
    if (!Array.isArray(agents)) return;
    const agent = agents.find(candidate => String(candidate?.id) === this.active.npcId);
    const position = coordinates(agent?.position);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) return;
    if (this.active.spatialMode === 'hrtf') {
      const height = Number(agent.position.y);
      setPosition(this.active.panner, position.x, Number.isFinite(height) ? height : 0, position.z, this.context.currentTime);
    } else if (this.active.panner && this.lastListener) {
      const dx = position.x - this.lastListener.x, dz = position.z - this.lastListener.z;
      const heading = this.lastListener.heading;
      this.active.panner.pan.value = Math.max(-1, Math.min(1, (Math.cos(heading) * dx - Math.sin(heading) * dz) / 8));
      this.active.gain.gain.value = this.volume * .7 * Math.max(0, 1 - Math.hypot(dx, dz) / MAX_DISTANCE);
    }
  }
  reset() {
    this.stopActive(); this.npcTimes.clear(); this.npcCategories.clear(); this.lastGlobal = -Infinity; this.lastGlobalCategory = null;
    this.lastImpact = -Infinity; this.lastId = null;
  }
  dispose() {
    if (this.disposed) return;
    this.reset(); this.disposed = true;
    try { this.context?.close?.(); } catch { /* Browser may reject close. */ }
    this.context = null; this.emitStatus();
  }
}
