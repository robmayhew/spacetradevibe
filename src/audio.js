// Tiny WebAudio synth for sound effects; no audio assets.
import { loadPrefs, savePrefs } from './prefs.js';

const MASTER = 0.3;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.last = {};
    const prefs = loadPrefs();
    this.muted = prefs.muted;
    this.volume = prefs.volume;
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  gainLevel() {
    return this.muted ? 0 : MASTER * this.volume;
  }

  applyGain() {
    if (this.master) this.master.gain.value = this.gainLevel();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.gainLevel();
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setMuted(muted) {
    this.muted = !!muted;
    savePrefs({ muted: this.muted });
    this.applyGain();
    if (this.muted) this.beam(false);
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  setVolume(volume) {
    const v = Math.max(0, Math.min(1, Number(volume) || 0));
    this.volume = v;
    savePrefs({ volume: v });
    this.applyGain();
    return this.volume;
  }

  tone({ type = 'square', freq = 440, freqEnd = freq, dur = 0.1, vol = 0.2, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.3, vol = 0.3, freq = 1200, freqEnd = 100, delay = 0 }) {
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < 45) return; // throttle rapid repeats
    this.last[name] = now;
    switch (name) {
      case 'pulse': return this.tone({ freq: 880, freqEnd: 440, dur: 0.07, vol: 0.06 });
      case 'scatter': return this.noise({ dur: 0.12, vol: 0.12, freq: 3000, freqEnd: 400 });
      case 'seeker': return this.tone({ type: 'sawtooth', freq: 300, freqEnd: 900, dur: 0.18, vol: 0.05 });
      case 'enemyShot': return this.tone({ type: 'triangle', freq: 520, freqEnd: 260, dur: 0.09, vol: 0.05 });
      case 'hit': return this.tone({ type: 'square', freq: 220, freqEnd: 120, dur: 0.04, vol: 0.04 });
      case 'explode': return this.noise({ dur: 0.35, vol: 0.25, freq: 1500, freqEnd: 60 });
      case 'bigExplode':
        this.noise({ dur: 1.4, vol: 0.45, freq: 900, freqEnd: 30 });
        return this.tone({ type: 'sine', freq: 90, freqEnd: 25, dur: 1.2, vol: 0.3 });
      case 'playerHit':
        this.noise({ dur: 0.25, vol: 0.3, freq: 800, freqEnd: 80 });
        return this.tone({ type: 'sawtooth', freq: 160, freqEnd: 60, dur: 0.2, vol: 0.12 });
      case 'shieldHit': return this.tone({ type: 'sine', freq: 1200, freqEnd: 600, dur: 0.15, vol: 0.1 });
      case 'bump':
        this.noise({ dur: 0.18, vol: 0.25, freq: 600, freqEnd: 80 });
        return this.tone({ type: 'square', freq: 110, freqEnd: 70, dur: 0.12, vol: 0.1 });
      case 'beep': return this.tone({ type: 'sine', freq: 1320, dur: 0.06, vol: 0.06 });
      case 'click': return this.tone({ type: 'square', freq: 660, dur: 0.04, vol: 0.05 });
      case 'buy':
        this.tone({ type: 'square', freq: 660, dur: 0.08, vol: 0.06 });
        return this.tone({ type: 'square', freq: 990, dur: 0.12, vol: 0.06, delay: 0.08 });
      case 'deny': return this.tone({ type: 'sawtooth', freq: 140, dur: 0.18, vol: 0.08 });
      case 'wave':
        this.tone({ type: 'triangle', freq: 440, dur: 0.12, vol: 0.1 });
        return this.tone({ type: 'triangle', freq: 660, dur: 0.2, vol: 0.1, delay: 0.12 });
      case 'bossWarn':
        for (let i = 0; i < 3; i++) this.tone({ type: 'sawtooth', freq: 180, freqEnd: 120, dur: 0.35, vol: 0.12, delay: i * 0.5 });
        return;
      case 'dock':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.25, vol: 0.09, delay: i * 0.12 }));
        return;
      case 'death':
        this.noise({ dur: 2, vol: 0.5, freq: 700, freqEnd: 20 });
        return this.tone({ type: 'sawtooth', freq: 300, freqEnd: 30, dur: 1.6, vol: 0.15 });
      case 'launch': return this.noise({ dur: 1.2, vol: 0.2, freq: 200, freqEnd: 2000 });
      case 'victory':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.1, delay: i * 0.16 }));
        return;
    }
  }

  // Sustained hum for the Ion Beam.
  beam(on) {
    if (!this.ctx) return;
    if (on && !this.beamNode && !this.muted) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 110;
      g.gain.value = 0.035;
      o.connect(g).connect(this.master);
      o.start();
      this.beamNode = { o, g };
    } else if (!on && this.beamNode) {
      this.beamNode.o.stop();
      this.beamNode = null;
    }
  }
}
