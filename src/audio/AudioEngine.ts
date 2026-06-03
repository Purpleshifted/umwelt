/**
 * Umwelt Audio Engine
 * 
 * Subtractive synthesis chain with biosensor-mapped parameters.
 * Architecture: Oscillators → Filter → LFO modulation → Reverb → Analyser → Output
 * 
 * The engine translates somatic signals into acoustic sculpture:
 * - PPG → filter cutoff & resonance (the breath of circulation shapes timbre)
 * - EMG → LFO rate & noise mix (muscle micro-tension becomes rhythmic texture)
 * - ECG → reverb depth & oscillator detune (cardiac variability as spatial depth)
 */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  
  // Oscillators
  private osc1: OscillatorNode | null = null; // Primary saw
  private osc2: OscillatorNode | null = null; // Secondary sine (sub)
  private osc3: OscillatorNode | null = null; // Tertiary sine (harmonic)
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  
  // Filter chain
  private filter: BiquadFilterNode | null = null;
  
  // LFO
  private lfo: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  
  // Reverb
  private convolver: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  
  // Stereo panning
  private panner: StereoPannerNode | null = null;
  
  // Delay
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayGain: GainNode | null = null;
  
  // Analysis data
  private frequencyData: Float32Array | null = null;
  private fftSize = 256;
  
  private isRunning = false;
  private baseFrequency = 55; // A1 — deep fundamental

  async init(): Promise<void> {
    if (this.isRunning) return;
    
    this.ctx = new AudioContext();
    
    // Create master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.15;
    
    // Create analyser
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0.85;
    this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
    
    // Create stereo panner
    this.panner = this.ctx.createStereoPanner();
    this.panner.pan.value = 0;
    
    // === Oscillators ===
    this.osc1 = this.ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc1.frequency.value = this.baseFrequency;
    
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = 'sine';
    this.osc2.frequency.value = this.baseFrequency * 0.5; // Sub octave
    
    this.osc3 = this.ctx.createOscillator();
    this.osc3.type = 'sine';
    this.osc3.frequency.value = this.baseFrequency * 1.5; // Perfect fifth
    
    const osc1Gain = this.ctx.createGain();
    osc1Gain.gain.value = 0.3;
    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.25;
    const osc3Gain = this.ctx.createGain();
    osc3Gain.gain.value = 0.1;
    
    // === Noise generator ===
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.02;
    this.createNoiseSource();
    
    // === Filter ===
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 800;
    this.filter.Q.value = 2;
    
    // === LFO ===
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5;
    
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 200; // LFO depth in Hz for filter modulation
    
    // === Delay ===
    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.4;
    
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.3;
    
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.value = 0.2;
    
    // === Reverb ===
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.createReverbIR(3.0, 2.0);
    
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.4;
    
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.6;
    
    // === Signal routing ===
    // Oscillators → filter
    this.osc1.connect(osc1Gain);
    this.osc2.connect(osc2Gain);
    this.osc3.connect(osc3Gain);
    osc1Gain.connect(this.filter);
    osc2Gain.connect(this.filter);
    osc3Gain.connect(this.filter);
    this.noiseSource!.connect(this.noiseGain);
    this.noiseGain.connect(this.filter);
    
    // LFO → filter frequency
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    
    // Filter → panner → dry + delay + reverb paths
    this.filter.connect(this.panner);
    
    // Dry path
    this.panner.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);
    
    // Delay path
    this.panner.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay); // feedback loop
    this.delay.connect(this.delayGain);
    this.delayGain.connect(this.masterGain);
    
    // Reverb path
    this.panner.connect(this.convolver);
    this.convolver.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
    
    // Master → analyser → output
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    
    // Start all oscillators
    this.osc1.start();
    this.osc2.start();
    this.osc3.start();
    this.lfo.start();
    this.noiseSource!.start();
    
    this.isRunning = true;
  }

  private createNoiseSource(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // Pink-ish noise (filtered white noise approximation)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    
    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;
  }

  private createReverbIR(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.ctx!.sampleRate;
    const length = sampleRate * duration;
    const buffer = this.ctx!.createBuffer(2, length, sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    
    return buffer;
  }

  /**
   * Update audio parameters from sensor values.
   * All inputs are 0-1 normalized.
   */
  update(ppg: number, emg: number, ecg: number, mouseX: number, mouseY: number): void {
    if (!this.isRunning || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    const smoothTime = 0.08; // 80ms parameter smoothing
    
    // === PPG → Filter (circulation shapes timbre) ===
    // Cutoff: 120Hz (low ppg) → 6000Hz (high ppg) — exponential mapping
    const cutoff = 120 * Math.pow(50, ppg);
    this.filter!.frequency.setTargetAtTime(cutoff, now, smoothTime);
    
    // Resonance: 0.5 (relaxed) → 12 (intense)
    const resonance = 0.5 + ppg * 11.5;
    this.filter!.Q.setTargetAtTime(resonance, now, smoothTime);
    
    // === EMG → LFO + Noise (muscle tension as texture) ===
    // LFO rate: 0.05Hz (calm) → 18Hz (tense) — exponential
    const lfoRate = 0.05 * Math.pow(360, emg);
    this.lfo!.frequency.setTargetAtTime(lfoRate, now, smoothTime);
    
    // LFO depth: scales with EMG
    const lfoDepth = 50 + emg * 800;
    this.lfoGain!.gain.setTargetAtTime(lfoDepth, now, smoothTime);
    
    // Noise mix: 0 (silent) → 0.15 (textured)
    const noiseMix = emg * 0.15;
    this.noiseGain!.gain.setTargetAtTime(noiseMix, now, smoothTime);
    
    // === ECG → Reverb + Detune (cardiac variability as spatial depth) ===
    // Reverb wet/dry balance
    const reverbWet = 0.1 + ecg * 0.7;
    const dryLevel = 1 - reverbWet * 0.6;
    this.reverbGain!.gain.setTargetAtTime(reverbWet, now, smoothTime);
    this.dryGain!.gain.setTargetAtTime(dryLevel, now, smoothTime);
    
    // Oscillator detune spread: 0 (unison) → 30 cents (wide)
    const detune = ecg * 30;
    this.osc1!.detune.setTargetAtTime(detune, now, smoothTime);
    this.osc2!.detune.setTargetAtTime(-detune * 0.5, now, smoothTime);
    this.osc3!.detune.setTargetAtTime(detune * 0.7, now, smoothTime);
    
    // Delay feedback: subtle → pronounced
    const feedback = 0.1 + ecg * 0.5;
    this.delayFeedback!.gain.setTargetAtTime(feedback, now, smoothTime);
    
    // === Mouse → Spatial ===
    // Pan: -1 (left) → 1 (right)
    const pan = (mouseX - 0.5) * 2;
    this.panner!.pan.setTargetAtTime(pan, now, smoothTime);
    
    // Delay time modulation from mouseY
    const delayTime = 0.1 + mouseY * 0.6;
    this.delay!.delayTime.setTargetAtTime(delayTime, now, smoothTime);
  }

  /**
   * Get spectral analysis data.
   * Returns { low, mid, high, bands } where low/mid/high are 0-1 normalized.
   */
  getSpectralData(): { low: number; mid: number; high: number; bands: Float32Array } {
    if (!this.analyser || !this.frequencyData) {
      return { low: 0, mid: 0, high: 0, bands: new Float32Array(0) };
    }
    
    this.analyser.getFloatFrequencyData(this.frequencyData as Float32Array<ArrayBuffer>);
    
    const binCount = this.frequencyData.length;
    const lowEnd = Math.floor(binCount * 0.15);    // ~0-1.5kHz
    const midEnd = Math.floor(binCount * 0.5);     // ~1.5-5kHz
    
    let lowSum = 0, midSum = 0, highSum = 0;
    
    for (let i = 0; i < binCount; i++) {
      // Convert dB to linear (roughly), clamp to 0-1
      const val = Math.max(0, Math.min(1, (this.frequencyData[i] + 100) / 100));
      
      if (i < lowEnd) lowSum += val;
      else if (i < midEnd) midSum += val;
      else highSum += val;
    }
    
    const low = lowSum / lowEnd;
    const mid = midSum / (midEnd - lowEnd);
    const high = highSum / (binCount - midEnd);
    
    return { low, mid, high, bands: this.frequencyData };
  }

  setMasterVolume(v: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(v * 0.2, this.ctx.currentTime, 0.05);
    }
  }

  destroy(): void {
    if (this.ctx) {
      this.osc1?.stop();
      this.osc2?.stop();
      this.osc3?.stop();
      this.lfo?.stop();
      this.noiseSource?.stop();
      this.ctx.close();
      this.isRunning = false;
    }
  }

  get running(): boolean {
    return this.isRunning;
  }
}

// Singleton
let engineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine();
  }
  return engineInstance;
}
