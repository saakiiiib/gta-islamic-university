/**
 * Vehicle Horn and Emergency Ambulance Siren Audio System using Web Audio API.
 * Supports:
 * - Red Double Decker Bus: Deep dual-tone pneumatic air horn (174.6 Hz / 220.0 Hz)
 * - Electric Van: Dual-tone city horn (392.0 Hz / 440.0 Hz)
 * - IU Ambulance: Emergency wailing siren with distance attenuation and auto-timeout
 */

let sharedContext = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedContext) {
    try {
      sharedContext = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedContext.state === 'suspended') {
    sharedContext.resume().catch(() => {});
  }
  return sharedContext;
}

export class VehicleHornAudio {
  constructor() {
    this.sirenActive = false;
    this.sirenNodes = null;
    this.lastHonkAt = -Infinity;
    this.sirenTimeout = null;
  }

  /**
   * Sound vehicle horn.
   * @param {boolean} isBus Whether sounding for the Red Bus or a smaller van
   */
  honk(isBus = false) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (now - this.lastHonkAt < 0.22) return;
    this.lastHonkAt = now;

    const duration = isBus ? 0.45 : 0.3;
    const freqs = isBus ? [174.61, 220.00] : [392.00, 440.00];

    try {
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(isBus ? 0.35 : 0.24, now + 0.03);
      masterGain.gain.setValueAtTime(isBus ? 0.35 : 0.24, now + duration - 0.06);
      masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

      const filter = ctx.createBiquadFilter();
      filter.type = isBus ? 'lowpass' : 'bandpass';
      filter.frequency.setValueAtTime(isBus ? 1400 : 1800, now);

      masterGain.connect(filter);
      filter.connect(ctx.destination);

      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        osc.type = isBus ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

        osc.connect(masterGain);
        osc.start(now);
        osc.stop(now + duration + 0.04);
      }
    } catch {}
  }

  /**
   * Starts emergency ambulance siren with auto-timeout.
   */
  startSiren() {
    if (this.sirenActive && this.sirenNodes) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    this.stopSiren(); // Clear any existing instance
    this.sirenActive = true;

    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.2);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700, now);

      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(0.75, now); // ~1.3s wail cycle

      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(160, now); // ±160 Hz sweep (540 to 860 Hz)

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(850, now);
      filter.Q.setValueAtTime(1.6, now);

      osc.connect(gain);
      gain.connect(filter);
      filter.connect(ctx.destination);

      osc.start(now);
      lfo.start(now);

      this.sirenNodes = { osc, lfo, gain, filter };

      // Safety timeout: Siren automatically shuts off after 10 seconds max
      this.sirenTimeout = setTimeout(() => {
        if (this.sirenActive) this.stopSiren();
      }, 10000);
    } catch {
      this.sirenActive = false;
    }
  }

  /**
   * Distance-based acoustic attenuation so siren fades smoothly away from player.
   */
  updateSiren(ambulancePos, playerPos) {
    if (!this.sirenActive || !this.sirenNodes?.gain || !ambulancePos || !playerPos) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const dist = Math.hypot(ambulancePos.x - playerPos.x, ambulancePos.z - playerPos.z);
      // Full volume within 12m, fades to inaudible beyond 65m
      const factor = Math.max(0, Math.min(1, 1 - (dist - 12) / 53));
      const targetGain = 0.22 * factor * factor;
      const now = ctx.currentTime;
      this.sirenNodes.gain.gain.linearRampToValueAtTime(Math.max(0.0001, targetGain), now + 0.1);
    } catch {}
  }

  /**
   * Stops emergency ambulance siren immediately with a clean ramp.
   */
  stopSiren() {
    this.sirenActive = false;
    if (this.sirenTimeout) {
      clearTimeout(this.sirenTimeout);
      this.sirenTimeout = null;
    }

    if (!this.sirenNodes) return;
    const nodes = this.sirenNodes;
    this.sirenNodes = null;

    const ctx = getAudioContext();
    if (ctx && nodes.gain) {
      try {
        const now = ctx.currentTime;
        nodes.gain.gain.cancelScheduledValues(now);
        nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
        nodes.gain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      } catch {}
    }

    setTimeout(() => {
      try { nodes.osc.stop(); nodes.osc.disconnect(); } catch {}
      try { nodes.lfo.stop(); nodes.lfo.disconnect(); } catch {}
      try { nodes.gain.disconnect(); } catch {}
      try { nodes.filter.disconnect(); } catch {}
    }, 250);
  }

  dispose() {
    this.stopSiren();
  }
}

export const hornAudio = new VehicleHornAudio();
