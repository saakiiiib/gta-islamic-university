/**
 * Vehicle Horn and Emergency Ambulance Siren Audio System using Web Audio API.
 * Supports:
 * - Red Double Decker Bus: Deep dual-tone pneumatic air horn (174.6 Hz / 220.0 Hz)
 * - Electric Van: Dual-tone city horn (392.0 Hz / 440.0 Hz)
 * - IU Ambulance: Emergency wailing siren (650 Hz - 950 Hz sweep)
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
  }

  /**
   * Sound vehicle horn.
   * @param {boolean} isBus Whether sounding for the Red Bus or a smaller van
   */
  honk(isBus = false) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    if (now - this.lastHonkAt < 0.25) return; // Debounce rapid honks
    this.lastHonkAt = now;

    const duration = isBus ? 0.48 : 0.32;

    // Frequencies: Bus air horn vs Electric van city horn
    const freqs = isBus ? [174.61, 220.00] : [392.00, 440.00];

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, now);
    masterGain.gain.linearRampToValueAtTime(isBus ? 0.32 : 0.22, now + 0.04);
    masterGain.gain.setValueAtTime(isBus ? 0.32 : 0.22, now + duration - 0.08);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Filter to warm the acoustic timbre
    const filter = ctx.createBiquadFilter();
    filter.type = isBus ? 'lowpass' : 'bandpass';
    filter.frequency.setValueAtTime(isBus ? 1400 : 1800, now);

    masterGain.connect(filter);
    filter.connect(ctx.destination);

    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = isBus ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      // Subtle detune for realism
      osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

      osc.connect(masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    }
  }

  /**
   * Starts emergency ambulance siren.
   */
  startSiren() {
    if (this.sirenActive) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    this.sirenActive = true;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.3);

    // Primary wailing siren oscillator
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, now);

    // LFO to sweep pitch between 650 Hz and 950 Hz
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.65, now); // ~1.5 second siren period

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(150, now); // Frequency modulation depth: ±150 Hz

    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    // Bandpass filter for siren loudspeaker acoustics
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.Q.setValueAtTime(1.8, now);

    osc.connect(gain);
    gain.connect(filter);
    filter.connect(ctx.destination);

    osc.start(now);
    lfo.start(now);

    this.sirenNodes = { osc, lfo, gain, filter };
  }

  /**
   * Stops emergency ambulance siren with a smooth fade-out.
   */
  stopSiren() {
    if (!this.sirenActive || !this.sirenNodes) return;
    this.sirenActive = false;

    const ctx = getAudioContext();
    if (ctx && this.sirenNodes.gain) {
      const now = ctx.currentTime;
      this.sirenNodes.gain.gain.setValueAtTime(this.sirenNodes.gain.gain.value, now);
      this.sirenNodes.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      setTimeout(() => {
        try {
          this.sirenNodes?.osc?.stop();
          this.sirenNodes?.lfo?.stop();
        } catch {}
        this.sirenNodes = null;
      }, 700);
    } else {
      this.sirenNodes = null;
    }
  }

  dispose() {
    this.stopSiren();
  }
}

export const hornAudio = new VehicleHornAudio();
