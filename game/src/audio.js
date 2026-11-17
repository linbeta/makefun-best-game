// Giltwake — sound, all synthesized with Web Audio: lapping water, the dock bell, leaf chimes,
// hull knocks, a short title motif and the flood drone. M mutes everything at the master gain.

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export function createAudio() {
  let ctx = null;
  let master = null;
  let waterGain = null;
  let droneGain = null;
  let droneOsc = null;
  let muted = false;

  /** Audio may only start after a user gesture; call this from the first key or click. */
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    startWater();
    startFloodDrone();
  }

  function startWater() {
    // looping filtered noise, its brightness slowly swaying like lapping water
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
      data[i] = last * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.23;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 260;
    lfo.connect(lfoDepth).connect(filter.frequency);
    waterGain = ctx.createGain();
    waterGain.gain.value = 0.22;
    noise.connect(filter).connect(waterGain).connect(master);
    noise.start();
    lfo.start();
  }

  function startFloodDrone() {
    droneOsc = ctx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55;
    const second = ctx.createOscillator();
    second.type = 'sawtooth';
    second.frequency.value = 55 * 1.498;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneOsc.connect(filter);
    second.connect(filter);
    filter.connect(droneGain).connect(master);
    droneOsc.start();
    second.start();
  }

  function tone(freq, start, duration, { type = 'sine', volume = 0.2, attack = 0.005, bend = 0 } = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const now = () => (ctx ? ctx.currentTime : 0);

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, now(), 0.03);
      return muted;
    },

    /** Leaf chime: climbs the pentatonic scale as the chain grows. */
    leafChime(chain) {
      const step = PENTATONIC[Math.min(chain - 1, PENTATONIC.length - 1)];
      const t = now();
      tone(midi(79 + step), t, 0.35, { type: 'triangle', volume: 0.16 });
      tone(midi(91 + step), t + 0.03, 0.25, { type: 'sine', volume: 0.06 });
    },

    /** Dock bell: inharmonic partials with a long ring. */
    dockBell() {
      const t = now();
      const base = 392;
      [1, 2.01, 2.76, 4.07, 5.4].forEach((ratio, i) => {
        tone(base * ratio, t, 2.4 - i * 0.35, { volume: 0.22 / (i + 1), attack: 0.003 });
      });
      tone(base * 1.5, t + 0.35, 1.6, { volume: 0.08 });
    },

    hullKnock() {
      const t = now();
      tone(140, t, 0.3, { type: 'square', volume: 0.18, bend: 0.4 });
      tone(70, t, 0.45, { type: 'sine', volume: 0.3, bend: 0.5 });
    },

    cogWhirr() {
      const t = now();
      tone(900, t, 0.25, { type: 'square', volume: 0.03, bend: 0.5 });
    },

    splash() {
      const t = now();
      tone(420, t, 0.18, { type: 'triangle', volume: 0.08, bend: 0.3 });
    },

    /** A short rising-and-settling motif for the title and new runs. */
    titleMotif() {
      const t = now();
      [67, 71, 74, 79, 76, 74].forEach((n, i) => {
        tone(midi(n), t + i * 0.16, 0.7, { type: 'triangle', volume: 0.12 });
        tone(midi(n - 12), t + i * 0.16, 0.5, { type: 'sine', volume: 0.06 });
      });
    },

    winFanfare() {
      const t = now();
      [72, 76, 79, 84, 88].forEach((n, i) => tone(midi(n), t + i * 0.12, 1.4, { type: 'triangle', volume: 0.14 }));
      this.dockBell();
    },

    loseToll() {
      const t = now();
      [62, 58, 55, 50].forEach((n, i) => tone(midi(n), t + i * 0.3, 1.2, { type: 'sine', volume: 0.18 }));
    },

    /** Called every frame: the water hush and the flood drone follow the game's state. */
    setAmbience(waterLevel, floodUrgency) {
      if (!ctx) return;
      const t = now();
      waterGain.gain.setTargetAtTime(0.22 * waterLevel, t, 0.3);
      droneGain.gain.setTargetAtTime(0.13 * floodUrgency, t, 0.4);
      droneOsc.frequency.setTargetAtTime(55 + floodUrgency * 10, t, 0.5);
    },
  };
}
