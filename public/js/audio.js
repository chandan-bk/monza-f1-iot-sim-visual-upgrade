/**
 * ============================================================================
 * PROCEDURAL AUDIO SYNTHESIZER (WEB AUDIO API)
 * Formula 1 IoT Telemetry & Race Simulator
 * ============================================================================
 * Generates dynamic audio directly from physics parameters:
 *  - V6 1.6L Turbo-hybrid ICE engine harmonics & exhaust resonance
 *  - Turbocharger high-pitch compressor whistle
 *  - Rev-limiter ignition cut stutter
 *  - Tire screech / slip friction noise
 *  - Kerb rumble vibration oscillator
 *  - Pitwall radio telemetry beep alerts
 * ============================================================================
 */

class F1AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Engine Nodes
    this.engineGain = null;
    this.osc1 = null;
    this.osc2 = null;
    this.subOsc = null;
    this.distortion = null;

    // Turbo Whistle
    this.turboOsc = null;
    this.turboGain = null;

    // Tire Screech
    this.tireNoiseNode = null;
    this.tireNoiseGain = null;

    // Kerb Rumble
    this.kerbOsc = null;
    this.kerbGain = null;
  }

  init() {
    if (this.isInitialized) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Distortion wave shaper for aggressive exhaust bite
      this.distortion = this.ctx.createWaveShaper();
      this.distortion.curve = this.makeDistortionCurve(18);
      this.distortion.oversample = '2x';

      // Engine fundamental & harmonics
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';

      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'sine';

      this.osc1.connect(this.distortion);
      this.osc2.connect(this.distortion);
      this.subOsc.connect(this.distortion);
      this.distortion.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.osc1.start();
      this.osc2.start();
      this.subOsc.start();

      // Turbo whistle
      this.turboGain = this.ctx.createGain();
      this.turboGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
      this.turboOsc = this.ctx.createOscillator();
      this.turboOsc.type = 'sine';
      this.turboOsc.frequency.setValueAtTime(2400, this.ctx.currentTime);
      this.turboOsc.connect(this.turboGain);
      this.turboGain.connect(this.masterGain);
      this.turboOsc.start();

      // Tire screech white noise generator
      this.setupTireNoise();

      // Kerb rumble
      this.kerbGain = this.ctx.createGain();
      this.kerbGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
      this.kerbOsc = this.ctx.createOscillator();
      this.kerbOsc.type = 'sawtooth';
      this.kerbOsc.frequency.setValueAtTime(45, this.ctx.currentTime);
      this.kerbOsc.connect(this.kerbGain);
      this.kerbGain.connect(this.masterGain);
      this.kerbOsc.start();

      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported or blocked by user gesture:", e);
    }
  }

  makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  setupTireNoise() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Highpass filter for tire squeal
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, this.ctx.currentTime);
    filter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.tireNoiseGain = this.ctx.createGain();
    this.tireNoiseGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(this.tireNoiseGain);
    this.tireNoiseGain.connect(this.masterGain);

    whiteNoise.start();
  }

  update(rpm, speedKmh, throttle, brake, wheelSlip, isOnKerb) {
    if (!this.isInitialized || this.isMuted) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;

    // 1. Engine Pitch (1.6L V6: 3 firings per rev -> fundamental freq = (rpm/60) * 3)
    const baseFreq = (rpm / 60) * 3.0; // ~200Hz at idle (4000 RPM), up to 750Hz at 15000 RPM
    this.osc1.frequency.setTargetAtTime(baseFreq, t, 0.04);
    this.osc2.frequency.setTargetAtTime(baseFreq * 2.01, t, 0.04); // 2nd harmonic
    this.subOsc.frequency.setTargetAtTime(baseFreq * 0.5, t, 0.04); // Sub octave

    // Engine volume based on load
    const loadVol = 0.15 + (throttle * 0.35) + ((rpm / 15000) * 0.25);
    this.engineGain.gain.setTargetAtTime(loadVol, t, 0.05);

    // 2. Turbocharger whistle
    const turboFreq = 1800 + (throttle * 1400) + ((rpm / 15000) * 800);
    const turboVol = throttle * 0.08;
    this.turboOsc.frequency.setTargetAtTime(turboFreq, t, 0.06);
    this.turboGain.gain.setTargetAtTime(turboVol, t, 0.06);

    // 3. Tire squeal on slip or heavy lockup
    const slipIntensity = THREE.MathUtils.clamp((wheelSlip - 0.15) * 3.5 + (brake > 0.8 && speedKmh > 30 ? 0.3 : 0), 0, 1);
    this.tireNoiseGain.gain.setTargetAtTime(slipIntensity * 0.28, t, 0.04);

    // 4. Kerb Rumble
    const kerbVol = (isOnKerb && speedKmh > 20) ? 0.22 : 0.0;
    this.kerbGain.gain.setTargetAtTime(kerbVol, t, 0.04);
  }

  playBeep(freq = 880, duration = 0.12) {
    if (!this.isInitialized || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }

  playPitRadioAlert() {
    this.playBeep(1200, 0.08);
    setTimeout(() => this.playBeep(1600, 0.12), 100);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

window.F1AudioEngine = F1AudioEngine;
