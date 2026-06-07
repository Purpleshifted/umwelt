// Magenta music imports are dynamically loaded in initialize() to avoid SSR 'self is undefined' errors.
import type { INoteSequence } from '@magenta/music/es6/protobuf';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from './NoiseCraftBridge';
import { getMoodProgression } from './chord_library';
import { getSamplerEngine } from './SamplerEngine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModulePlaybackState {
  cursor: number;
  seqLength: number;
  isGenerating: boolean;
}

/** Data produced by a chord_progression node. */
interface ChordData {
  root: number;       // absolute MIDI root of the current chord (key-relative root + key offset)
  notes: number[];    // semitone offsets from 0 (NOT from root) for each chord tone
  key: number;        // 0-11
  mode: string;
  scaleIntervals?: number[];
  degree?: number;
}

/** Monophonic sequence – one note per step. */
interface MonoSequence {
  pitches: number[];
  gates: number[];
}

/** Polyphonic sequence – up to N notes per step. */
interface PolySequence {
  pitches: number[][];
  gates: number[][];
}

// ---------------------------------------------------------------------------
// Scale / Chord tables
// ---------------------------------------------------------------------------

const MODE_INTERVALS: Record<string, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  dorian:      [0, 2, 3, 5, 7, 9, 10],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10],
};

/** Return the scale degrees (semitone offsets from root) for a mode. */
function getScaleIntervals(mode: string): number[] {
  return MODE_INTERVALS[mode] ?? MODE_INTERVALS.major;
}

/**
 * Build a triad (or extended chord) from a scale starting at a given scale degree.
 * `degree` is 0-indexed into the scale intervals array.
 * Returns semitone offsets relative to the key root (not relative to the chord root).
 */
function buildChordFromDegree(scale: number[], degree: number, extensions: number): number[] {
  const notes: number[] = [];
  for (let i = 0; i < extensions; i++) {
    const idx = (degree + i * 2) % scale.length;
    const octaveWrap = Math.floor((degree + i * 2) / scale.length);
    notes.push(scale[idx] + octaveWrap * 12);
  }
  return notes;
}

/**
 * Deterministically pick chord progressions based on tension.
 * Returns an array of chord objects, each with `root` (semitone offset from key)
 * and `notes` (semitone offsets from 0/key root).
 */
function generateChordProgression(
  key: number,
  mode: string,
  tension: number,
  rate: number,
  seqLength: number,
  seed: number,
): ChordData[] {
  const scale = getScaleIntervals(mode);

  // Use a simple seeded PRNG so the same seed yields the same progression within a cycle
  let s = (seed * 2654435761) >>> 0;
  const rand = (): number => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };

  // Determine how many steps per chord based on rate (0 = long holds, 1 = rapid changes)
  // rate 0 → 16 steps (one chord for the whole bar)
  // rate 1 → 2 steps (chord changes every 2 steps)
  const stepsPerChord = Math.max(2, Math.round(16 - rate * 14));

  // Determine which scale degrees are available based on tension
  let availableDegrees: number[];
  let chordSize: number; // how many notes per chord (3 = triad, 4 = 7th)

  if (tension < 0.2) {
    // Simple triads: I, IV, V
    availableDegrees = [0, 3, 4]; // scale degrees
    chordSize = 3;
  } else if (tension < 0.5) {
    // Extended diatonic: I, ii, IV, V, vi
    availableDegrees = [0, 1, 3, 4, 5];
    chordSize = 3;
  } else if (tension < 0.7) {
    // 7th chords with secondary dominants: I, ii, iii, IV, V, vi
    availableDegrees = [0, 1, 2, 3, 4, 5];
    chordSize = 4;
  } else {
    // Altered / diminished: all 7 degrees including vii°
    availableDegrees = [0, 1, 2, 3, 4, 5, 6];
    chordSize = 4;
  }

  const chords: ChordData[] = [];
  let prevDegree = 0;

  for (let step = 0; step < seqLength; step++) {
    if (step % stepsPerChord === 0) {
      // Pick a new chord degree, preferring movement from previous
      let degree: number;
      if (step === 0) {
        degree = 0; // always start on I
      } else {
        // Weighted random – prefer common progressions
        const idx = Math.floor(rand() * availableDegrees.length);
        degree = availableDegrees[idx];
        // Avoid repeating the same degree (try once more)
        if (degree === prevDegree && availableDegrees.length > 1) {
          const idx2 = (idx + 1 + Math.floor(rand() * (availableDegrees.length - 1))) % availableDegrees.length;
          degree = availableDegrees[idx2];
        }
      }
      prevDegree = degree;

      const notes = buildChordFromDegree(scale, degree, chordSize);

      // For high tension (>= 0.7), occasionally alter a note by ±1 semitone
      if (tension >= 0.7 && rand() < 0.3) {
        const alterIdx = 1 + Math.floor(rand() * (notes.length - 1)); // don't alter root
        notes[alterIdx] += rand() < 0.5 ? 1 : -1;
      }

      chords.push({
        root: scale[degree],
        notes,
        key,
        mode,
      });
    } else {
      // Sustain previous chord
      chords.push(chords[chords.length - 1]);
    }
  }

  return chords;
}

// ---------------------------------------------------------------------------
// DAG evaluation helpers
// ---------------------------------------------------------------------------

/**
 * Topologically sort the music modules so that dependencies are evaluated
 * before their consumers. Returns module IDs in evaluation order.
 */
function topologicalSort(modules: MusicModule[], edges: any[]): string[] {
  const moduleIds = new Set(modules.map(m => m.id));
  const adj = new Map<string, string[]>();   // source → targets
  const inDeg = new Map<string, number>();

  for (const id of moduleIds) {
    adj.set(id, []);
    inDeg.set(id, 0);
  }

  // Only count edges where BOTH ends are modules in our set and the edge
  // carries music data (not slider/knob control edges – those are read inline).
  const dataHandles = new Set([
    'chordData', 'sequence', 'voice_0', 'voice_1', 'voice_2', 'voice_3',
  ]);

  for (const e of edges) {
    if (!moduleIds.has(e.source) || !moduleIds.has(e.target)) continue;
    if (!dataHandles.has(e.sourceHandle ?? '')) continue;
    adj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    sorted.push(id);
    for (const next of (adj.get(id) ?? [])) {
      const nd = (inDeg.get(next) ?? 1) - 1;
      inDeg.set(next, nd);
      if (nd === 0) queue.push(next);
    }
  }

  // Append any modules not reachable (islands) – shouldn't happen normally
  for (const id of moduleIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// MusicEngine
// ---------------------------------------------------------------------------

class MusicEngine {
  private static instance: MusicEngine;
  private isRunning = false;
  private rnn: any = null;
  private drumRnn: any = null;
  private vae: any;
  private initialized = false;
  
  // Tone.js references
  public Tone: typeof import('tone') | null = null;
  private activeToneNodes: any[] = [];
  private activeToneParts: any[] = [];
  private previewActiveNodes: any[] = [];
  private previewIntervals: any[] = [];
  private qpm = 120;
  private updateTimer: NodeJS.Timeout | null = null;
  private globalStepCount = 0;
  private audioCtx: AudioContext | null = null;
  
  // Magenta imports
  private MusicRNN: any;
  private MusicVAE: any;
  private sequences: any;

  // State per generator module
  private moduleStates = new Map<string, ModulePlaybackState>();

  private constructor() {}

  static getInstance(): MusicEngine {
    if (!MusicEngine.instance) {
      MusicEngine.instance = new MusicEngine();
    }
    return MusicEngine.instance;
  }

  async initialize() {
    if (this.initialized) return;

    if (typeof window !== 'undefined') {
      const rnnModule = await import('@magenta/music/es6/music_rnn');
      const vaeModule = await import('@magenta/music/es6/music_vae');
      const coreModule = await import('@magenta/music/es6/core');

      this.Tone = await import('tone');
      const { useAudioGraphStore } = await import('@/store/audioGraphStore');
      const audioCtx = useAudioGraphStore.getState().audioContext || useAudioGraphStore.getState().initAudioContext();
      this.Tone.setContext(audioCtx);

      this.MusicRNN = rnnModule.MusicRNN;
      this.MusicVAE = vaeModule.MusicVAE;
      this.sequences = coreModule.sequences;
    }

    // Basic drum RNN
    this.drumRnn = new this.MusicRNN(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn'
    );
    // Basic melody RNN
    this.rnn = new this.MusicRNN(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn'
    );
    // Basic VAE for melody interpolation/generation
    this.vae = new this.MusicVAE(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_small_q2'
    );
    
    // Lazily create AudioContext if needed
    this.getAudioContext();
    
    // Start Magenta initialization in the background
    this.rnn = new this.MusicRNN(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improviser',
    );
    this.drumRnn = new this.MusicRNN(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn'
    );
    this.vae = new this.MusicVAE(
      'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_2bar_small'
    );
    Promise.all([
      this.rnn.initialize(),
      this.drumRnn.initialize(),
      this.vae.initialize()
    ]).then(() => {
      this.initialized = true;
      console.log('[MusicEngine] All Magenta models loaded successfully');
    }).catch((err) => {
      console.warn('Failed to load some Magenta models', err);
    });
  }

  public getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioCtx;
  }

  public async resumeAudioContext() {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  private sendSequenceToAI(targetId: string, seq: { pitches: any[]; gates: any[] }) {
    const bridge = getNoiseCraftBridge();
    bridge.setSequence(targetId, seq.pitches, seq.gates);
  }

  // -----------------------------------------------------------------------
  // Start / Stop
  // -----------------------------------------------------------------------

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    const bridge = getNoiseCraftBridge();

    const syncModules = () => {
      const state = useMusicStore.getState();
      const outModules = state.modules
        .filter((m) => m.type === 'ai_seq_out' || m.type === 'seq_out')
        .map((m) => ({ 
          id: m.id, 
          name: m.type === 'seq_out' ? `Channel ${m.seqOutConfig?.channel || '?'}` : m.name 
        }));
      bridge.postMessage({ type: 'noiseCraft:updateModules', modules: outModules });
    };
    syncModules();
    useMusicStore.subscribe(syncModules);

    let lastTick = performance.now();
    let accumulatedPulses = 0;

    const tickPulses = () => {
      this.globalStepCount++;
      this.tickAllModules();
    };

    let wasBridgeRunning = false;

    this.updateTimer = setInterval(() => {
      if (!this.isRunning) return;

      const bridge = getNoiseCraftBridge();
      const isBridgeRunning = bridge.running;
      
      const state = useMusicStore.getState();
      const isPreviewPlaying = state.modules.some(m => m.type === 'score_out' && m.scoreOutConfig?.isPlaying);

      if (!isBridgeRunning && !isPreviewPlaying) {
        if (wasBridgeRunning) {
          // Just stopped
          wasBridgeRunning = false;
        }
        lastTick = performance.now();
        return;
      }
      wasBridgeRunning = true;

      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      const bpm = 120;
      const pulsesPerSec = (bpm / 60) * 24;
      accumulatedPulses += dt * pulsesPerSec;

      while (accumulatedPulses >= 1) {
        accumulatedPulses -= 1;
        tickPulses();
      }
    }, 1000 / 60);
  }

  stop() {
    this.isRunning = false;
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Per-tick entry point
  // -----------------------------------------------------------------------

  private tickAllModules() {
    const musicState = useMusicStore.getState();
    const audioState = useAudioMapStore.getState();

    // --- DAG-based generators ----------------------------------------------
    const dagTypes = new Set([
      'chord_progression',
      'harmonic_progressor',
      'melody_gen',
      'chord_gen',
      'voice_splitter',
      'sequence_adder',
      'register_shifter',
      'score_out',
      'ai_seq_out',
      'module_output',
      'sequence_morpher',
      'seq_out',
      'virtual_instrument',
      'track_out',
      'polysynth',
      'oscillator',
      'mix_node',
      'seq_to_freq',
      'filter',
      'adsr_envelope'
    ]);

    const dagModules = musicState.modules.filter((m) => dagTypes.has(m.type));
    if (dagModules.length === 0) return;

    // We only need to regenerate once per sequence cycle. Use a synthetic
    // "dag" playback state to track cursor across the whole DAG.
    const dagStateKey = '__dag__';
    let dagState = this.moduleStates.get(dagStateKey);
    if (!dagState) {
      dagState = { cursor: 0, seqLength: 0, isGenerating: false };
      this.moduleStates.set(dagStateKey, dagState);
    }

    dagState.cursor++;
    const dagPulsesNeeded = dagState.seqLength * 6;

    if (dagState.cursor >= dagPulsesNeeded && !dagState.isGenerating) {
      dagState.isGenerating = true;
      this.evaluateDAG(dagModules, musicState, audioState).then(() => {
        dagState!.seqLength = 16;
        dagState!.cursor = 0;
        dagState!.isGenerating = false;
      }).catch((e) => {
        console.error('DAG evaluation failed:', e);
        dagState!.isGenerating = false;
      });
    }
  }

  // -----------------------------------------------------------------------
  // DAG evaluation
  // -----------------------------------------------------------------------

  private async evaluateDAG(dagModules: MusicModule[], musicState: any, audioState: any) {
    const seqLength = 16;
    const results = new Map<string, any>();

    // Topological order
    const order = topologicalSort(dagModules, musicState.edges);

    for (const moduleId of order) {
      const mod = dagModules.find((m) => m.id === moduleId);
      if (!mod) continue;

      switch (mod.type) {
        case 'chord_progression':
          this.evalChordProgression(mod, musicState, audioState, results, seqLength);
          break;
        case 'harmonic_progressor':
          this.evalHarmonicProgressor(mod, musicState, audioState, results, seqLength);
          break;
        case 'melody_gen':
          await this.evalMelodyGen(mod, musicState, audioState, results, seqLength);
          break;
        case 'chord_gen':
          this.evalChordGen(mod, musicState, audioState, results, seqLength);
          break;
        case 'voice_splitter':
          this.evalVoiceSplitter(mod, musicState, results, seqLength);
          break;
        case 'sequence_adder':
          this.evalSequenceAdder(mod, musicState, results, seqLength);
          break;
        case 'register_shifter':
          this.evalRegisterShifter(mod, musicState, results, seqLength);
          break;
        case 'score_out':
          this.evalScoreOut(mod, musicState, results, seqLength);
          break;
        case 'ai_seq_out':
          this.evalAiSeqOut(mod, musicState, results, seqLength);
          break;
        case 'seq_out':
          this.evalSeqOut(mod, musicState, results, seqLength);
          break;
        case 'virtual_instrument':
          this.evalVirtualInstrument(mod, musicState, results, seqLength);
          break;
        case 'track_out':
          this.evalTrackOut(mod, musicState, results, seqLength);
          break;
        case 'polysynth':
          this.evalPolysynth(mod, musicState, results);
          break;
        case 'oscillator':
          this.evalOscillator(mod, musicState, results);
          break;
        case 'adsr_envelope':
          this.evalAdsrEnvelope(mod, musicState, results);
          break;
        case 'filter':
          this.evalFilter(mod, musicState, results);
          break;
        case 'reverb':
          this.evalReverb(mod, musicState, results);
          break;
        case 'mix_node':
          this.evalMixNode(mod, musicState, results);
          break;
        case 'seq_to_freq':
          this.evalSeqToFreq(mod, musicState, results);
          break;
        case 'sequence_morpher':
          await this.evalSequenceMorpher(mod, musicState, audioState, results, seqLength);
          break;
        case 'module_output':
          this.evalModuleOutput(mod, musicState, results);
          break;
      }
    }
    
    // Save evaluated data to store for UI visualization
    useMusicStore.getState().setNodeOutputs(Object.fromEntries(results));
  }

  // ---- chord_progression -------------------------------------------------

  private evalChordProgression(
    mod: MusicModule,
    musicState: any,
    audioState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const tension = this.getParamValue(mod, 'tension', 0.3, musicState, audioState);
    const rate = this.getParamValue(mod, 'rate', 0.3, musicState, audioState);
    const key = Math.round(this.getParamValue(mod, 'key', 0, musicState, audioState)) % 12;
    const mode: string = (mod as any).config?.mode ?? (mod as any).chordConfig?.mode ?? 'major';

    const seed = this.globalStepCount; // changes every cycle
    const chords = generateChordProgression(key, mode, tension, rate, seqLength, seed);

    // Store per-step chord data under the module id
    results.set(mod.id, chords);
  }

  // ---- harmonic_progressor -----------------------------------------------

  private harmonicProgressorStates = new Map<string, any>();

  private evalHarmonicProgressor(
    mod: MusicModule,
    musicState: any,
    audioState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const defaultValence = mod.harmonicProgressorConfig?.valence ?? 0.5;
    const defaultArousal = mod.harmonicProgressorConfig?.arousal ?? 0.5;
    
    const valence = this.getParamValue(mod, 'valence', defaultValence, musicState, audioState);
    const arousal = this.getParamValue(mod, 'arousal', defaultArousal, musicState, audioState);

    const currentState = this.harmonicProgressorStates.get(mod.id);
    const { chords, newState, categoryName } = getMoodProgression(valence, arousal, seqLength, currentState);
    
    this.harmonicProgressorStates.set(mod.id, newState);
    results.set(mod.id, chords); // chords is now basically HarmonyContext

    // Save the category name to display in the UI
    if (mod.harmonicProgressorConfig) {
        mod.harmonicProgressorConfig.currentCategoryName = categoryName;
    }
  }

  // ---- melody_gen --------------------------------------------------------

  private async evalMelodyGen(
    mod: MusicModule,
    musicState: any,
    audioState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    // Resolve chordData input
    const chordDataInput = this.resolveInputData(mod, 'chordData', musicState, results);
    const chords: ChordData[] = chordDataInput ?? this.fallbackChords(seqLength);

    const temperature = this.getParamValue(mod, 'temperature', 0.5, musicState, audioState);
    const rhythmicComplexity = mod.melodyGenConfig?.rhythmicComplexity ?? 0.5;
    const density = this.getParamValue(mod, 'density', rhythmicComplexity, musicState, audioState);
    const register: number = mod.melodyGenConfig?.register ?? 0;
    const algorithm = mod.melodyGenConfig?.algorithm ?? 'procedural';

    const pitches: number[] = [];
    const gates: number[] = [];
    const baseNote = 60; // C4

    if (algorithm === 'magenta' && this.rnn && this.initialized) {
      const root = baseNote + register;
      const seedChord = chords[0] || { key: 0, notes: [0, 4, 7] };
      
      const seed: INoteSequence = {
        ticksPerQuarter: 220,
        totalTime: 1.0,
        timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
        tempos: [{ time: 0, qpm: this.qpm }],
        notes: [
          {
            pitch: root + seedChord.key + seedChord.notes[0],
            startTime: 0.0,
            endTime: 0.5,
            velocity: 80,
          },
        ],
      };

      const qns = this.sequences.quantizeNoteSequence(seed, 4);
      const cacheKey = JSON.stringify({ algorithm, temperature, rhythmicComplexity, register, chords: chords.map(c => `${c.key}-${c.root}-${c.mode}`) });
      
      if (mod.aiCacheKey === cacheKey && mod.aiCacheResult) {
        results.set(mod.id, mod.aiCacheResult);
        return;
      }
      
      try {
        // Temperature controls randomness; 1.0 is default, higher is more random.
        
        // Build chord progression array for chord_pitches_improviser
        const pitchNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
        const chordProgressionStrings: string[] = [];
        
        for (let i = 0; i < seqLength; i++) {
          const chord = chords[i % chords.length];
          const rootAbs = (chord.key + chord.root) % 12;
          const rootName = pitchNames[rootAbs];
          const thirdInterval = chord.notes[1] - chord.notes[0];
          let quality = '';
          if (thirdInterval === 3) quality = 'm';
          if (chord.notes.length >= 4) {
            const seventhInterval = chord.notes[3] - chord.notes[0];
            if (thirdInterval === 3 && seventhInterval === 10) quality = 'm7';
            else if (thirdInterval === 4 && seventhInterval === 10) quality = '7';
            else if (thirdInterval === 4 && seventhInterval === 11) quality = 'maj7';
          }
          chordProgressionStrings.push(`${rootName}${quality}`);
        }

        const result = await this.rnn.continueSequence(qns, seqLength, temperature, chordProgressionStrings);
        const unquantized = this.sequences.unquantizeSequence(result, this.qpm);

        let drumPattern: boolean[] | null = null;
        try {
          if (this.drumRnn && this.initialized) {
            const drumSeed: INoteSequence = {
              ticksPerQuarter: 220,
              totalTime: 1.0,
              timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
              tempos: [{ time: 0, qpm: this.qpm }],
              notes: [{ pitch: 36, startTime: 0, endTime: 0.5, velocity: 80 }]
            };
            const drumQns = this.sequences.quantizeNoteSequence(drumSeed, 4);
            // Higher rhythmic complexity -> higher temperature for drums
            const drumTemp = 0.5 + (rhythmicComplexity * 1.5);
            const drumRes = await this.drumRnn.continueSequence(drumQns, seqLength, drumTemp);
            const drumUnq = this.sequences.unquantizeSequence(drumRes, this.qpm);
            
            drumPattern = [];
            const stepTime = 60 / this.qpm / 4;
            for (let i = 0; i < seqLength; i++) {
              const stepStart = i * stepTime;
              const hit = drumUnq.notes?.some((n: any) => (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart);
              drumPattern.push(!!hit);
            }
          }
        } catch (e) {
          console.warn('[MusicEngine] DrumRNN failed', e);
        }

        const stepTime = 60 / this.qpm / 4;
        let lastPitch = root;
        for (let i = 0; i < seqLength; i++) {
          const stepStart = i * stepTime;
          const note = unquantized.notes?.find(
            (n: any) => (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart,
          );

          // Get pitch
          let target = lastPitch;
          if (note) {
            target = note.pitch ?? root;
            const chord = chords[i % chords.length];
            if (chord) {
              if (chord.scaleIntervals) {
                const scaleTones = chord.scaleIntervals.map((n) => baseNote + chord.key + n);
                if (Math.random() > 0.15) {
                  target = this.snapToNearestChordTone(target, scaleTones);
                }
              } else {
                const keyDiff = chord.key - seedChord.key;
                target += keyDiff;
              }
            }
            lastPitch = target;
          }

          // Use drum pattern for gate if available, else use original note timing
          const isGateOn = drumPattern ? drumPattern[i] : !!note;
          
          pitches.push(target);
          gates.push(isGateOn ? 1 : 0);
        }
        mod.aiCacheKey = cacheKey;
        mod.aiCacheResult = { pitches, gates };
      } catch (e) {
        console.error('[MusicEngine] Magenta failed, falling back to procedural:', e);
        for(let i=0; i<seqLength; i++) { pitches.push(root); gates.push(0); }
      }
    } else {
      // Algorithmic melody generation biased by current chord
      let prevPitch = baseNote + register;

    for (let i = 0; i < seqLength; i++) {
      const chord = chords[i % chords.length];
      const chordTones = chord.notes.map((n) => baseNote + chord.key + n);

      if (Math.random() < density) {
        // Choose a target from chord tones, with temperature controlling leap probability
        let target: number;
        if (Math.random() < temperature * 0.5) {
          // Leap: pick a random chord tone in a random octave
          const octaveShift = Math.floor(Math.random() * 2) * 12 * (Math.random() < 0.5 ? -1 : 1);
          target = chordTones[Math.floor(Math.random() * chordTones.length)] + octaveShift;
        } else {
          // Step: move toward the nearest chord tone from prevPitch
          let nearest = chordTones[0];
          let nearestDist = Math.abs(prevPitch - chordTones[0]);
          for (const ct of chordTones) {
            // Check nearby octaves too
            for (const oct of [-12, 0, 12]) {
              const d = Math.abs(prevPitch - (ct + oct));
              if (d < nearestDist) {
                nearestDist = d;
                nearest = ct + oct;
              }
            }
          }
          // Add small random step toward the target
          const direction = nearest > prevPitch ? 1 : nearest < prevPitch ? -1 : 0;
          const stepSize = 1 + Math.floor(Math.random() * 3); // 1-3 semitones
          target = prevPitch + direction * stepSize;
        // Snap to full scale using the new scaleIntervals from HarmonyContext
        if (Math.random() > temperature * 0.3 && chord.scaleIntervals) {
          const scaleTones = chord.scaleIntervals.map((n) => baseNote + chord.key + n);
          target = this.snapToNearestChordTone(target, scaleTones);
        } else {
          target = this.snapToNearestChordTone(target, chordTones);
        }
        }
        
        target += register;
        pitches.push(target);
        gates.push(1);
        prevPitch = target;
      } else {
        pitches.push(prevPitch);
        gates.push(0);
      }
    }
    }

    const mono: MonoSequence = { pitches, gates };
    results.set(mod.id, mono);
  }

  // ---- chord_gen ---------------------------------------------------------

  private evalChordGen(
    mod: MusicModule,
    musicState: any,
    audioState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const chordDataInput = this.resolveInputData(mod, 'chordData', musicState, results);
    const chords: ChordData[] = chordDataInput ?? this.fallbackChords(seqLength);

    const rhythm = this.getParamValue(mod, 'rhythm', 0.0, musicState, audioState); // Default to 0 for block chords (정박)
    const voicingSpread = this.getParamValue(mod, 'voicing', 0.5, musicState, audioState);
    const register: number = mod.chordGenConfig?.register ?? 0;
    const style: string = mod.chordGenConfig?.style ?? 'block';

    const baseNote = 48; // C3 – chords sit lower
    const pitches: number[][] = [];
    const gates: number[][] = [];

    for (let i = 0; i < seqLength; i++) {
      const chord = chords[i % chords.length];
      const rawNotes = chord.notes.map((n) => baseNote + chord.key + n + register);

      // Apply voicing spread: 0 = close voicing, 1 = wide spread across octaves
      const voiced = this.applyVoicing(rawNotes, voicingSpread);

      // Pad or trim to 4 voices
      while (voiced.length < 4) voiced.push(voiced[voiced.length - 1]);
      const finalNotes = voiced.slice(0, 4);

      if (style === 'arpeggio') {
        // Arpeggio: only one note sounds per step, cycling through voices
        const voiceIdx = i % finalNotes.length;
        const stepPitches = [finalNotes[voiceIdx], 0, 0, 0];
        const stepGates = [1, 0, 0, 0];

        // Rhythmic variation: sometimes skip
        if (Math.random() > (1 - rhythm * 0.3)) {
          stepGates[0] = 0;
        }

        pitches.push(stepPitches);
        gates.push(stepGates);
      } else if (style === 'broken') {
        // Broken chord: play subsets of notes
        const noteCount = 1 + Math.floor(Math.random() * 3); // 1-3 notes at a time
        const stepGates = finalNotes.map((_, idx) => (idx < noteCount ? 1 : 0));

        // Rhythmic variation
        const shouldPlay = i % 4 === 0 || Math.random() < (0.3 + rhythm * 0.5);
        if (!shouldPlay) {
          pitches.push(finalNotes);
          gates.push([0, 0, 0, 0]);
        } else {
          pitches.push(finalNotes);
          gates.push(stepGates);
        }
      } else {
        // Block chords
        // Rhythmic pattern: always play on downbeats, vary others with rhythm param
        const isDownbeat = i % 4 === 0;
        const shouldPlay = isDownbeat || Math.random() < rhythm * 0.6;

        if (shouldPlay) {
          pitches.push(finalNotes);
          gates.push([1, 1, 1, 1]);
        } else {
          pitches.push(finalNotes);
          gates.push([0, 0, 0, 0]);
        }
      }
    }

    const poly: PolySequence = { pitches, gates };
    results.set(mod.id, poly);
  }

  // ---- sequence_morpher --------------------------------------------------

  private async evalSequenceMorpher(
    mod: MusicModule,
    musicState: any,
    audioState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const seqA = this.resolveInputData(mod, 'seqA', musicState, results) as PolySequence | MonoSequence | null;
    const seqB = this.resolveInputData(mod, 'seqB', musicState, results) as PolySequence | MonoSequence | null;
    const morphAmount = mod.sequenceMorpherConfig?.morphAmount ?? 0.5;
    
    if (!seqA || !seqB || !this.vae || !this.initialized) {
      results.set(mod.id, seqA || seqB || { pitches: Array(seqLength).fill(60), gates: Array(seqLength).fill(0) });
      return;
    }

    try {
      const convertToNoteSeq = (seq: any): INoteSequence => {
        const notes = [];
        const stepTime = 60 / this.qpm / 4;
        for (let i = 0; i < seqLength; i++) {
          if (seq.gates[i]) {
            const pitch = Array.isArray(seq.pitches[i]) ? seq.pitches[i][0] : seq.pitches[i];
            notes.push({ pitch: pitch || 60, startTime: i * stepTime, endTime: (i + 1) * stepTime, velocity: 80 });
          }
        }
        return {
          ticksPerQuarter: 220,
          totalTime: seqLength * stepTime,
          timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
          tempos: [{ time: 0, qpm: this.qpm }],
          notes
        };
      };

      const qnsA = this.sequences.quantizeNoteSequence(convertToNoteSeq(seqA), 4);
      const qnsB = this.sequences.quantizeNoteSequence(convertToNoteSeq(seqB), 4);
      
      const interpolated = await this.vae.interpolate([qnsA, qnsB], 3);
      // interpolated will contain [qnsA, middle, qnsB]
      const targetSeq = morphAmount < 0.33 ? interpolated[0] : (morphAmount < 0.66 ? interpolated[1] : interpolated[2]);
      
      const unquantized = this.sequences.unquantizeSequence(targetSeq, this.qpm);
      
      const pitches: number[] = [];
      const gates: number[] = [];
      const stepTime = 60 / this.qpm / 4;
      
      for (let i = 0; i < seqLength; i++) {
        const stepStart = i * stepTime;
        const note = unquantized.notes?.find((n: any) => (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart);
        if (note) {
          pitches.push(note.pitch ?? 60);
          gates.push(1);
        } else {
          pitches.push(60);
          gates.push(0);
        }
      }
      
      results.set(mod.id, { pitches, gates });
    } catch(e) {
      console.warn('[MusicEngine] VAE interpolation failed', e);
      results.set(mod.id, morphAmount < 0.5 ? seqA : seqB);
    }
  }

  // ---- virtual_instrument ------------------------------------------------

  private evalVirtualInstrument(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results);
    let volume = mod.virtualInstrumentConfig?.volume ?? 0.8;
    const volEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'volume');
    if (volEdge) {
      const volVal = results.get(volEdge.source);
      let rawVol = volume;
      if (typeof volVal?.value === 'number') rawVol = volVal.value;
      else if (typeof volVal === 'number') rawVol = volVal;
      volume = Math.max(0, Math.min(1, rawVol));
    }

    results.set(mod.id, {
      type: 'virtual_instrument',
      sequence: inputSeq,
      instrument: mod.virtualInstrumentConfig?.instrument ?? 'acoustic_grand_piano',
      volume,
    });
  }

  // ---- track_out and synth modules ---------------------------------------

  private evalTrackOut(mod: MusicModule, musicState: any, results: Map<string, any>, seqLength: number) {
    const sequence = this.resolveInputData(mod, 'sequence', musicState, results);
    const instrumentEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'instrument');
    const instrumentId = instrumentEdge ? instrumentEdge.source : null;
    
    results.set(mod.id, {
      type: 'track_out',
      sequence,
      instrumentId,
    });
  }

  private evalPolysynth(mod: MusicModule, musicState: any, results: Map<string, any>) {
    let config = { ...mod.polysynthConfig } as any;

    const getEdgeVal = (handleId: string) => {
      const edge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === handleId);
      if (edge) {
        const val = results.get(edge.source);
        if (typeof val?.value === 'number') return val.value;
        if (typeof val === 'number') return val;
      }
      return null;
    };

    const mapVal = (val: number, min: number, max: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      return min + clamped * (max - min);
    };

    const a = getEdgeVal('attack'); if (a !== null) config.attack = mapVal(a, 0.001, 2.0);
    const d = getEdgeVal('decay'); if (d !== null) config.decay = mapVal(d, 0.001, 2.0);
    const s = getEdgeVal('sustain'); if (s !== null) config.sustain = mapVal(s, 0.0, 1.0);
    const r = getEdgeVal('release'); if (r !== null) config.release = mapVal(r, 0.001, 4.0);
    
    // PolySynth Tone.js requires it structured as envelope
    config.envelope = {
      attack: config.attack ?? 0.1,
      decay: config.decay ?? 0.2,
      sustain: config.sustain ?? 0.5,
      release: config.release ?? 1.0,
    };

    results.set(mod.id, {
      type: 'polysynth',
      config
    });
  }

  private evalOscillator(mod: MusicModule, musicState: any, results: Map<string, any>) {
    results.set(mod.id, {
      type: 'oscillator',
      config: mod.oscillatorConfig
    });
  }

  private evalAdsrEnvelope(mod: MusicModule, musicState: any, results: Map<string, any>) {
    let config = { ...mod.adsrEnvelopeConfig } as any;

    const getEdgeVal = (handleId: string) => {
      const edge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === handleId);
      if (edge) {
        const val = results.get(edge.source);
        if (typeof val?.value === 'number') return val.value;
        if (typeof val === 'number') return val;
      }
      return null;
    };

    const mapVal = (val: number, min: number, max: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      return min + clamped * (max - min);
    };

    const a = getEdgeVal('attack'); if (a !== null) config.attack = mapVal(a, 0.001, 2.0);
    const d = getEdgeVal('decay'); if (d !== null) config.decay = mapVal(d, 0.001, 2.0);
    const s = getEdgeVal('sustain'); if (s !== null) config.sustain = mapVal(s, 0.0, 1.0);
    const r = getEdgeVal('release'); if (r !== null) config.release = mapVal(r, 0.001, 4.0);

    const inputEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'in_instrument');
    results.set(mod.id, {
      type: 'adsr_envelope',
      config,
    });
  }

  private evalSeqToFreq(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const seqInEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'sequence');
    if (seqInEdge && results.has(seqInEdge.source)) {
      results.set(mod.id, { type: 'seq_to_freq', sequence: results.get(seqInEdge.source).sequence || results.get(seqInEdge.source) });
    }
  }

  private evalFilter(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const inputEdge = musicState.edges.find((e: any) => e.target === mod.id && (e.targetHandle === 'source' || e.targetHandle === 'in_instrument'));
    
    const getEdgeVal = (handleId: string) => {
      const edge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === handleId);
      if (edge) {
        const val = results.get(edge.source);
        if (typeof val?.value === 'number') return val.value;
        if (val?.type === 'seq_to_freq') return val.sequence;
        if (typeof val === 'number') return val;
      }
      return undefined;
    };

    let freqSeq = undefined;
    let freq = mod.filterConfig?.frequency ?? 1000;
    const freqRaw = getEdgeVal('frequency');
    if (freqRaw && typeof freqRaw === 'object' && ('pitches' in freqRaw)) {
       freqSeq = freqRaw;
    } else if (freqRaw !== undefined) {
       freq = 20 + (freqRaw as number) * (20000 - 20);
    }

    let q = mod.filterConfig?.Q ?? 1;
    const qRaw = getEdgeVal('q');
    if (typeof qRaw === 'number') q = 0.1 + qRaw * (20 - 0.1);

    results.set(mod.id, {
      type: 'filter',
      config: mod.filterConfig,
      sourceId: inputEdge ? inputEdge.source : null,
      freq,
      q,
      freqSeq
    });
  }

  private evalReverb(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const inputEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'source');
    results.set(mod.id, {
      type: 'reverb',
      config: mod.reverbConfig,
      sourceId: inputEdge ? inputEdge.source : null
    });
  }

  private evalMixNode(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const inputAEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'input_a');
    const inputBEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'input_b');
    results.set(mod.id, {
      type: 'mix_node',
      config: mod.mixNodeConfig,
      sourceAId: inputAEdge ? inputAEdge.source : null,
      sourceBId: inputBEdge ? inputBEdge.source : null
    });
  }

  // ---- voice_splitter ----------------------------------------------------

  private evalVoiceSplitter(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as
      | PolySequence
      | null;

    // Produce 4 mono voices
    const voices: MonoSequence[] = [];
    for (let v = 0; v < 4; v++) {
      const pitches: number[] = [];
      const gates: number[] = [];
      for (let i = 0; i < seqLength; i++) {
        if (inputSeq && i < inputSeq.pitches.length) {
          const stepPitches = inputSeq.pitches[i];
          const stepGates = inputSeq.gates[i];
          if (Array.isArray(stepPitches)) {
            pitches.push(stepPitches[v] ?? stepPitches[0] ?? 60);
            gates.push(Array.isArray(stepGates) ? (stepGates[v] ?? 0) : (stepGates as any));
          } else {
            // Input is actually mono – only voice 0 gets data
            pitches.push(v === 0 ? (stepPitches as number) : 60);
            gates.push(v === 0 ? ((stepGates as any) as number) : 0);
          }
        } else {
          pitches.push(60);
          gates.push(0);
        }
      }
      voices.push({ pitches, gates });
    }

    // Store each voice under its output handle key so downstream can find it
    results.set(`${mod.id}:voice_0`, voices[0]);
    results.set(`${mod.id}:voice_1`, voices[1]);
    results.set(`${mod.id}:voice_2`, voices[2]);
    results.set(`${mod.id}:voice_3`, voices[3]);
    // Also store the first voice as the module's "default" result
    results.set(mod.id, voices[0]);
  }

  // ---- sequence_adder ----------------------------------------------------

  private evalSequenceAdder(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const seq0 = this.resolveInputData(mod, 'in_0', musicState, results);
    const seq1 = this.resolveInputData(mod, 'in_1', musicState, results);
    const seq2 = this.resolveInputData(mod, 'in_2', musicState, results);

    const inputs = [seq0, seq1, seq2].filter(Boolean) as (MonoSequence | PolySequence)[];

    const pitches: number[][] = [];
    const gates: number[][] = [];

    for (let i = 0; i < seqLength; i++) {
      const stepPitches: number[] = [];
      const stepGates: number[] = [];

      for (const input of inputs) {
        if (i < input.pitches.length) {
          const p = input.pitches[i];
          const g = input.gates[i];
          if (Array.isArray(p)) {
            for (let v = 0; v < p.length; v++) {
              stepPitches.push(p[v]);
              stepGates.push((g as number[])[v] ?? 0);
            }
          } else {
            stepPitches.push(p as number);
            stepGates.push((g as number) ?? 0);
          }
        }
      }

      if (stepPitches.length === 0) {
        pitches.push([60]);
        gates.push([0]);
      } else {
        pitches.push(stepPitches);
        gates.push(stepGates);
      }
    }

    const poly: PolySequence = { pitches, gates };
    results.set(mod.id, poly);
  }

  // ---- register_shifter --------------------------------------------------

  private evalRegisterShifter(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as
      | MonoSequence
      | null;

    const shift = mod.registerShifterConfig?.semitones ?? 0;

    const pitches: number[] = [];
    const gates: number[] = [];

    for (let i = 0; i < seqLength; i++) {
      if (inputSeq && i < inputSeq.pitches.length) {
        pitches.push((inputSeq.pitches[i] as number) + shift);
        gates.push(inputSeq.gates[i]);
      } else {
        pitches.push(60 + shift);
        gates.push(0);
      }
    }

    const mono: MonoSequence = { pitches, gates };
    results.set(mod.id, mono);
  }

  // ---- score_out ---------------------------------------------------------

  private evalScoreOut(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    if (!mod.scoreOutConfig?.isPlaying) return;

    const edges = musicState.edges.filter(
      (e: any) => e.target === mod.id && e.targetHandle === 'sequence',
    );
    const inputSeqs = edges.map((e: any) => results.get(e.source)).filter(Boolean);
    if (inputSeqs.length === 0) return;

    const ctx = this.getAudioContext();
    if (ctx.state === 'closed') return;

    const instrument = mod.scoreOutConfig.instrument || 'synth';
    const beatDuration = 60 / this.qpm;
    const stepDuration = beatDuration / 4; // 16th notes
    const startTime = ctx.currentTime + 0.1;

    for (let i = 0; i < seqLength; i++) {
      let isGateOn = false;
      let notesToPlay: number[] = [];

      for (const inputSeq of inputSeqs) {
        if (!inputSeq || !inputSeq.pitches) continue;
        
        if (Array.isArray(inputSeq.pitches[0])) {
          const poly = inputSeq as PolySequence;
          for (let j = 0; j < (poly.gates[i] || []).length; j++) {
            if (poly.gates[i][j]) {
              isGateOn = true;
              notesToPlay.push(poly.pitches[i][j]);
            }
          }
        } else {
          const mono = inputSeq as MonoSequence;
          if (mono.gates[i]) {
            isGateOn = true;
            notesToPlay.push(mono.pitches[i]);
          }
        }
      }

      if (isGateOn && notesToPlay.length > 0) {
        const t = startTime + i * stepDuration;
        for (const midiPitch of notesToPlay) {
          if (midiPitch <= 0) continue;
          const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          if (instrument === 'synth') osc.type = 'sawtooth';
          else if (instrument === 'piano') osc.type = 'sine';
          else if (instrument === 'marimba') osc.type = 'triangle';
          
          osc.frequency.value = freq;
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.2 / notesToPlay.length, t + 0.01);
          
          if (instrument === 'marimba') {
            gain.gain.exponentialRampToValueAtTime(0.001, t + stepDuration);
          } else {
            gain.gain.setValueAtTime(0.2 / notesToPlay.length, t + stepDuration - 0.05);
            gain.gain.linearRampToValueAtTime(0, t + stepDuration);
          }
          
          osc.start(t);
          osc.stop(t + stepDuration);
        }
      }
    }
  }

  // ---- ai_seq_out --------------------------------------------------------

  private evalAiSeqOut(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as MonoSequence | PolySequence | null;
    if (!inputSeq) return;

    if (inputSeq.pitches && inputSeq.pitches.length > 0) {
      this.sendSequenceToAI(mod.id, { pitches: inputSeq.pitches as any[], gates: inputSeq.gates as any[] });
    }
  }

  // ---- seq_out -----------------------------------------------------------

  private evalSeqOut(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as MonoSequence | PolySequence | null;
    if (!inputSeq) return;

    if (inputSeq.pitches && inputSeq.pitches.length > 0 && mod.seqOutConfig?.channel) {
      // 1. Send to visual map (optional, but good for UI)
      import('@/store/audioMapStore').then(({ useAudioMapStore }) => {
        useAudioMapStore.getState().setSequence(mod.seqOutConfig!.channel, { pitches: inputSeq.pitches as any[], gates: inputSeq.gates as any[] });
      });

      // 2. Broadcast sequence to NoiseCraft iframes
      this.sendSequenceToAI(mod.id, { pitches: inputSeq.pitches as any[], gates: inputSeq.gates as any[] });

      // 3. Play Audio via Audio Editor's Graph
      import('@/store/audioGraphStore').then(({ useAudioGraphStore }) => {
        const agState = useAudioGraphStore.getState();
        const ctx = agState.audioContext;
        if (!ctx || ctx.state === 'closed') return;

        // Find all score_in nodes matching this channel, plus legacy virtual_instrument nodes
        const scoreInNodes = agState.nodes.filter(n => 
          n.type === 'score_in' && n.params.channel === mod.seqOutConfig!.channel
        );
        const viNodes = agState.nodes.filter(n => 
          n.type === 'virtual_instrument' && n.params.channel === mod.seqOutConfig!.channel
        );

        // Find connected vst_instruments and legacy virtual_instruments
        const targetsToPlay: any[] = [...viNodes];
        for (const si of scoreInNodes) {
          const connectedEdges = agState.edges.filter(e => e.source === si.id);
          for (const e of connectedEdges) {
            const tgt = agState.nodes.find((n: any) => n.id === e.target);
            if (tgt && (tgt.type === 'vst_instrument' || tgt.type === 'virtual_instrument')) {
              targetsToPlay.push(tgt);
            }
          }
        }

        if (targetsToPlay.length === 0) return;

        const beatDuration = 60 / this.qpm;
        const stepDuration = beatDuration / 4; // 16th notes
        const startTime = ctx.currentTime + 0.1;

        for (let i = 0; i < seqLength; i++) {
          let isGateOn = false;
          let notesToPlay: number[] = [];

          if (Array.isArray(inputSeq.pitches[0])) {
            const poly = inputSeq as PolySequence;
            for (let j = 0; j < (poly.gates[i] || []).length; j++) {
              if (poly.gates[i][j]) {
                isGateOn = true;
                notesToPlay.push(poly.pitches[i][j]);
              }
            }
          } else {
            const mono = inputSeq as MonoSequence;
            if (mono.gates[i]) {
              isGateOn = true;
              notesToPlay.push(mono.pitches[i]);
            }
          }

          if (isGateOn && notesToPlay.length > 0) {
            const t = startTime + i * stepDuration;
            for (const midiPitch of notesToPlay) {
              if (midiPitch <= 0) continue;
              const freq = 440 * Math.pow(2, (midiPitch - 69) / 12);
              
              for (const tgtNode of targetsToPlay) {
                // Check if it's a VST Instrument (Tone.js)
                const w = window as any;
                if (tgtNode.type === 'vst_instrument' && w.__toneSynths && w.__toneSynths.has(tgtNode.id)) {
                  const synth = w.__toneSynths.get(tgtNode.id);
                  // Tone.js triggerAttackRelease
                  synth.triggerAttackRelease(freq, stepDuration, t, (tgtNode.params.gain as number) ?? 0.5);
                  continue;
                }

                // Fallback to legacy Web Audio oscillators
                const targetAudioNode = agState.liveNodes.get(tgtNode.id);
                if (!targetAudioNode) continue;
                
                const instrument = tgtNode.params.instrument as string || 'synth';
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                if (instrument === 'synth') osc.type = 'sawtooth';
                else if (instrument === 'piano') osc.type = 'sine';
                else if (instrument === 'marimba') osc.type = 'triangle';
                
                osc.frequency.value = freq;
                
                osc.connect(gain);
                gain.connect(targetAudioNode);
                
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.2 / notesToPlay.length, t + 0.01);
                
                if (instrument === 'marimba') {
                  gain.gain.exponentialRampToValueAtTime(0.001, t + stepDuration);
                } else {
                  gain.gain.setValueAtTime(0.2 / notesToPlay.length, t + stepDuration - 0.05);
                  gain.gain.linearRampToValueAtTime(0, t + stepDuration);
                }
                
                osc.start(t);
                osc.stop(t + stepDuration);
              }
            }
          }
        }
      });
    }
  }

  // ---- module_output -----------------------------------------------------

  private evalModuleOutput(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
  ) {
    // Find what's connected to this module_output's input
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results);
    if (!inputSeq) return;

    // Also check voice_0..3 handles (from voice_splitter)
    const seq = inputSeq as MonoSequence | PolySequence;
    if (seq.pitches && seq.pitches.length > 0) {
      this.sendSequenceToAI(mod.id, { pitches: seq.pitches as any[], gates: seq.gates as any[] });
    }
  }

  // -----------------------------------------------------------------------
  // DAG helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the data flowing into `targetHandle` on `mod` by looking at edges
   * and reading from the results map.
   */
  private resolveInputData(
    mod: MusicModule,
    targetHandle: string,
    musicState: any,
    results: Map<string, any>,
  ): any | null {
    const edge = musicState.edges.find(
      (e: any) => e.target === mod.id && e.targetHandle === targetHandle,
    );
    if (!edge) return null;

    const sourceId = edge.source;
    const sourceHandle: string = edge.sourceHandle ?? '';

    // If the source handle contains a colon-qualified key (from voice_splitter),
    // look that up directly.
    if (
      sourceHandle === 'voice_0' ||
      sourceHandle === 'voice_1' ||
      sourceHandle === 'voice_2' ||
      sourceHandle === 'voice_3'
    ) {
      return results.get(`${sourceId}:${sourceHandle}`) ?? results.get(sourceId) ?? null;
    }

    return results.get(sourceId) ?? null;
  }

  /**
   * Snap a pitch to the nearest tone from a set of chord tones (checking ±1 octave).
   */
  private snapToNearestChordTone(pitch: number, chordTones: number[]): number {
    let best = chordTones[0];
    let bestDist = Infinity;
    for (const ct of chordTones) {
      for (const oct of [-12, 0, 12]) {
        const d = Math.abs(pitch - (ct + oct));
        if (d < bestDist) {
          bestDist = d;
          best = ct + oct;
        }
      }
    }
    return best;
  }

  /**
   * Apply voicing spread to a set of notes.
   * spread 0 → close position, spread 1 → spread across 2+ octaves.
   */
  private applyVoicing(notes: number[], spread: number): number[] {
    if (notes.length <= 1) return [...notes];
    const sorted = [...notes].sort((a, b) => a - b);

    // Close voicing: keep as-is. Open voicing: raise upper voices by octaves.
    const result = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const octaveAdd = Math.round(spread * i * 0.5) * 12;
      result.push(sorted[i] + octaveAdd);
    }
    return result;
  }

  /**
   * Produce a minimal fallback chord progression when no chordData input is connected.
   */
  private fallbackChords(seqLength: number): ChordData[] {
    const chords: ChordData[] = [];
    const defaults = [
      { root: 0, notes: [0, 4, 7], key: 0, mode: 'major' },
      { root: 5, notes: [5, 9, 12], key: 0, mode: 'major' },
    ];
    for (let i = 0; i < seqLength; i++) {
      chords.push(defaults[Math.floor(i / 8) % defaults.length]);
    }
    return chords;
  }

  // -----------------------------------------------------------------------
  // Param reading (same as before – supports slider, knob, virtual_stream)
  // -----------------------------------------------------------------------

  private getParamValue(
    module: MusicModule,
    paramName: string,
    defaultValue: number,
    musicState: any,
    audioState: any,
  ): number {
    const inputEdge = musicState.edges.find(
      (e: any) => e.target === module.id && e.targetHandle === paramName,
    );
    if (inputEdge) {
      const inputModule = musicState.modules.find((m: any) => m.id === inputEdge.source);
      if (inputModule) {
        if (inputModule.type === 'slider') return inputModule.sliderConfig?.value ?? defaultValue;
        if (inputModule.type === 'knob') return inputModule.knobConfig?.value ?? defaultValue;
        if (inputModule.type === 'virtual_stream' && inputModule.inputStreamId) {
          const sensors = useSensorStore.getState();
          const sensorValues = {
            ppg: sensors.ppg,
            emg: sensors.emg,
            ecg: sensors.ecg,
            gsr: sensors.gsr,
            mouseX: sensors.mouseX,
            mouseY: sensors.mouseY,
          };
          return evaluateStreamValue(inputModule.inputStreamId, audioState.streams, sensorValues);
        }
      }
    }
    return defaultValue;
  }

  // -----------------------------------------------------------------------
  // Tone.js Playback Engine
  // -----------------------------------------------------------------------

  public async playTracks() {
    if (!this.Tone) return;
    this.stopTracks();

    const { useMusicStore } = await import('@/store/musicStore');
    const { useAudioMapStore } = await import('@/store/audioMapStore');
    const musicState = useMusicStore.getState();
    const audioState = useAudioMapStore.getState();
    
    const dagTypes = new Set([
      'chord_progression', 'harmonic_progressor', 'melody_gen', 'chord_gen',
      'voice_splitter', 'sequence_adder', 'register_shifter', 'score_out',
      'ai_seq_out', 'module_output', 'sequence_morpher', 'seq_out',
      'virtual_instrument', 'track_out', 'polysynth', 'oscillator',
      'mix_node', 'seq_to_freq', 'filter', 'adsr_envelope'
    ]);
    const dagModules = musicState.modules.filter((m) => dagTypes.has(m.type));
    await this.evaluateDAG(dagModules, musicState, audioState);

    const state = useMusicStore.getState();
    const results = state.nodeOutputs;
    if (!results) return;

    await this.Tone.start();
    this.Tone.Transport.bpm.value = this.qpm;

    const playouts = state.modules.filter(m => m.type === 'track_out' || m.type === 'score_out');
    for (const outNode of playouts) {
      const config = results[outNode.id];
      if (!config) continue;

      let triggerNode: any = null;
      if (outNode.type === 'track_out' && config.instrumentId) {
        const chain = this.buildInstrumentChain(config.instrumentId, results);
        if (chain && chain.triggerNode && chain.outputNode) {
          triggerNode = chain.triggerNode;
          const trackName = outNode.trackOutConfig?.trackName || 'Track 1';
          const { useAudioGraphStore, getTrackBus } = await import('@/store/audioGraphStore');
          const audioCtx = useAudioGraphStore.getState().audioContext;
          if (audioCtx) {
             const bus = getTrackBus(audioCtx, trackName);
             this.Tone.connect(chain.outputNode, bus);
          } else {
             chain.outputNode.toDestination();
          }
        }
      }
      
      // Sequence playing logic ONLY if sequence exists
      if (!config.sequence) continue;
      if (!triggerNode && outNode.type === 'track_out') continue;
      
      const isScoreOut = outNode.type === 'score_out';
      if (isScoreOut && outNode.scoreOutConfig?.isPlaying === false) continue;
      const channel = outNode.scoreOutConfig?.channel ?? 'A';

      const seq = config.sequence as MonoSequence | PolySequence;
      const beatDuration = 60 / this.qpm;
      const stepDuration = beatDuration / 4; 
      const seqLength = Array.isArray(seq.pitches[0]) ? seq.pitches.length : seq.pitches.length;

      const events: any[] = [];
      for (let i = 0; i < seqLength; i++) {
        const time = i * stepDuration;
        let isGateOn = false;
        let notesToPlay: number[] = [];

        if (Array.isArray(seq.pitches[0])) {
          const poly = seq as PolySequence;
          for (let j = 0; j < (poly.gates[i] || []).length; j++) {
            if (poly.gates[i][j]) {
              isGateOn = true;
              notesToPlay.push(poly.pitches[i][j]);
            }
          }
        } else {
          const mono = seq as MonoSequence;
          if (mono.gates[i]) {
            isGateOn = true;
            notesToPlay.push(mono.pitches[i]);
          }
        }

        if (isGateOn && notesToPlay.length > 0) {
          events.push({ time, notes: notesToPlay });
        }
      }

      const part = new this.Tone.Part((time, value) => {
        const freqs = value.notes.map((midi: number) => this.Tone!.Frequency(midi, "midi").toFrequency());
        
        if (triggerNode?.triggerAttackRelease) {
          triggerNode.triggerAttackRelease(freqs, "16n", time);
        }
        
        if (isScoreOut && typeof window !== 'undefined') {
          const w = window as any;
          if (w.__trackInSynths) {
            w.__trackInSynths.forEach((item: any) => {
              if (item.channel === channel && item.synth.triggerAttackRelease) {
                item.synth.triggerAttackRelease(freqs, "16n", time);
              }
            });
          }
        }
      }, events);

      part.loop = true;
      part.loopEnd = seqLength * stepDuration;
      part.start(0);
      this.activeToneParts.push(part);
    }

    this.Tone.Transport.start();
  }

  public stopTracks() {
    if (!this.Tone) return;
    this.Tone.Transport.stop();
    this.Tone.Transport.cancel(0);

    for (const part of this.activeToneParts) {
      part.dispose();
    }
    this.activeToneParts = [];

    this.activeToneNodes = [];
  }

  public stopPreviewSynths() {
    for (const node of this.previewActiveNodes) {
      if (node && typeof node.dispose === 'function') {
        try { node.dispose(); } catch (e) {}
      } else if (node && typeof node.stop === 'function') {
        try { node.stop(); } catch (e) {}
      }
    }
    this.previewActiveNodes = [];
    this.previewIntervals.forEach(clearInterval);
    this.previewIntervals = [];
  }

  public async togglePreviewUtil(previewNodeId: string, playing: boolean) {
    if (!this.Tone) return;
    
    if (this.Tone.context.state !== 'running') {
      try {
        await this.Tone.start();
      } catch (e) {
        console.warn('Failed to start Tone.js context:', e);
      }
    }

    const { useMusicStore } = await import('@/store/musicStore');
    const state = useMusicStore.getState();
    const previewMod = state.modules.find(m => m.id === previewNodeId);
    if (!previewMod) return;

    if (!playing) {
      this.stopPreviewSynths();
      return;
    }

    const edge = state.edges.find(e => e.target === previewNodeId && e.targetHandle === 'audio_in');
    if (!edge) {
      // Auto turn off
      setTimeout(() => useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } }), 100);
      return;
    }

    const sourceId = edge.source;
    const sourceMod = state.modules.find(m => m.id === sourceId);
    if (!sourceMod) return;

    const results = {} as any;
    state.modules.forEach(m => {
      if (m.type === 'polysynth') results[m.id] = { type: 'polysynth', config: m.polysynthConfig };
      if (m.type === 'oscillator') results[m.id] = { type: 'oscillator', config: m.oscillatorConfig };
      if (m.type === 'virtual_instrument') results[m.id] = { type: 'virtual_instrument', config: m.virtualInstrumentConfig };
      if (m.type === 'adsr_envelope') {
         const inEdge = state.edges.find(e => e.target === m.id && e.targetHandle === 'in_instrument');
         const sourceOsc = state.modules.find(o => o.id === inEdge?.source);
         results[m.id] = { type: 'polysynth', config: { oscillatorType: sourceOsc?.oscillatorConfig?.type || 'sine', envelope: m.adsrEnvelopeConfig } };
      }
      if (m.type === 'filter') {
         const inEdge = state.edges.find(e => e.target === m.id && (e.targetHandle === 'source' || e.targetHandle === 'in_instrument'));
         const getVal = (handleId: string) => {
            const e = state.edges.find(e => e.target === m.id && e.targetHandle === handleId);
            if (e) {
               const src = state.modules.find(x => x.id === e.source);
               if (src?.type === 'slider') return src.sliderConfig?.value;
               if (src?.type === 'seq_to_freq') {
                 const seqEdge = state.edges.find(se => se.target === src.id && se.targetHandle === 'sequence');
                 if (seqEdge && state.nodeOutputs) {
                    const out = state.nodeOutputs[seqEdge.source];
                    return out?.sequence || out;
                 }
               }
            }
            return undefined;
         };
         let freqSeq = undefined;
         let freq = m.filterConfig?.frequency ?? 1000;
         let freqRaw = getVal('frequency');
         if (freqRaw && typeof freqRaw === 'object' && ('pitches' in freqRaw)) {
             freqSeq = freqRaw;
         } else if (freqRaw !== undefined) {
             freq = 20 + (freqRaw as number) * (20000 - 20);
         }
         
         let q = m.filterConfig?.Q ?? 1;
         let qRaw = getVal('q');
         if (typeof qRaw === 'number') q = 0.1 + qRaw * (20 - 0.1);

         results[m.id] = { type: 'filter', config: m.filterConfig, sourceId: inEdge?.source, freq, q, freqSeq };
      }
      if (m.type === 'mix_node') {
         const inA = state.edges.find(e => e.target === m.id && e.targetHandle === 'in_instrument_a');
         const inB = state.edges.find(e => e.target === m.id && e.targetHandle === 'in_instrument_b');
         results[m.id] = { type: 'mix_node', sourceAId: inA?.source, sourceBId: inB?.source, config: m.mixNodeConfig };
      }
      if (m.type === 'reverb') {
         const inEdge = state.edges.find(e => e.target === m.id && e.targetHandle === 'in_instrument');
         results[m.id] = { type: 'reverb', config: m.reverbConfig, sourceId: inEdge?.source };
      }
      if (m.type === 'track_out') {
         const inEdge = state.edges.find(e => e.target === m.id && e.targetHandle === 'instrument');
         results[m.id] = { type: 'track_out', config: m.trackOutConfig, sourceId: inEdge?.source };
      }
    });

    const chain = this.buildInstrumentChain(sourceId, results);
    if (!chain) {
      setTimeout(() => useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } }), 100);
      return;
    }

    chain.outputNode.toDestination();
    this.previewActiveNodes.push(chain.triggerNode, chain.outputNode);

    let isContinuous = true;
    let curr: typeof sourceMod | undefined = sourceMod;
    while (curr) {
      if (['polysynth', 'adsr_envelope', 'virtual_instrument'].includes(curr.type)) {
        isContinuous = false;
        break;
      }
      const prevEdge = state.edges.find(e => e.target === curr!.id && (e.targetHandle === 'in_instrument' || e.targetHandle === 'in_instrument_a' || e.targetHandle === 'in_instrument_b' || e.targetHandle === 'source'));
      if (prevEdge) {
        curr = state.modules.find(m => m.id === prevEdge.source);
      } else {
        break;
      }
    }

    if (isContinuous) {
      if (chain.triggerNode?.triggerAttack) {
        chain.triggerNode.triggerAttack(this.Tone.Frequency("C4").toFrequency());
      } else if (chain.triggerNode?.start) {
        chain.triggerNode.start();
      }

      const volEdge = state.edges.find(e => e.target === sourceMod.id && e.targetHandle === 'volume');
      if (volEdge) {
         const srcMod = state.modules.find(x => x.id === volEdge.source);
         if (srcMod?.type === 'virtual_stream' && srcMod.inputStreamId) {
            const interval = setInterval(() => {
               const sensors = useSensorStore.getState();
               const sensorValues = { ppg: sensors.ppg, emg: sensors.emg, ecg: sensors.ecg, gsr: sensors.gsr, mouseX: sensors.mouseX, mouseY: sensors.mouseY };
               const streamVal = evaluateStreamValue(srcMod.inputStreamId!, useAudioMapStore.getState().streams, sensorValues);
               if (chain.outputNode && chain.outputNode.volume) {
                  chain.outputNode.volume.rampTo(this.Tone!.gainToDb(Math.max(0.0001, streamVal)), 0.05);
               }
            }, 30);
            this.previewIntervals.push(interval);
         }
      }
      const seq = state.nodeOutputs?.[sourceId]?.sequence as MonoSequence | PolySequence | undefined;
      
      if (seq && seq.pitches && seq.pitches.length > 0) {
        // Play the actual sequence for preview!
        this.Tone.Transport.bpm.value = this.qpm;
        const beatDuration = 60 / this.qpm;
        const stepDuration = beatDuration / 4;
        const seqLength = Array.isArray(seq.pitches[0]) ? seq.pitches.length : seq.pitches.length;
        
        const events: any[] = [];
        for (let i = 0; i < seqLength; i++) {
          const time = i * stepDuration;
          let isGateOn = false;
          let notesToPlay: number[] = [];
          if (Array.isArray(seq.pitches[0])) {
            const poly = seq as PolySequence;
            for (let j = 0; j < (poly.gates[i] || []).length; j++) {
              if (poly.gates[i][j]) { isGateOn = true; notesToPlay.push(poly.pitches[i][j]); }
            }
          } else {
            const mono = seq as MonoSequence;
            if (mono.gates[i]) { isGateOn = true; notesToPlay.push(mono.pitches[i]); }
          }
          if (isGateOn && notesToPlay.length > 0) {
            events.push({ time, notes: notesToPlay });
          }
        }
        
        const part = new this.Tone.Part((time, value) => {
          const freqs = value.notes.map((midi: number) => this.Tone!.Frequency(midi, "midi").toFrequency());
          if (chain.triggerNode?.triggerAttackRelease) {
            chain.triggerNode.triggerAttackRelease(freqs, "16n", time);
          }
        }, events);
        
        part.start(0);
        this.Tone.Transport.start();
        this.previewActiveNodes.push(part as any);
        
        const totalDuration = seqLength * stepDuration;
        setTimeout(() => {
          part.stop();
          part.dispose();
          useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } });
          this.stopPreviewSynths();
        }, (totalDuration + 0.5) * 1000);
        
      } else {
        const config = results[sourceId];
        if (config && config.type === 'virtual_instrument') {
          import('./SamplerEngine').then(async sampler => {
            const instr = config.config?.instrument ?? 'acoustic_grand_piano';
            const vol = config.config?.volume ?? 0.8;
            
            const engine = sampler.getSamplerEngine();
            // Ensure it's loaded before playing
            await engine.getInstrument(instr);
            
            engine.playNote(instr, 60, this.Tone!.now(), 2, vol * 127);
            
            setTimeout(() => {
              useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } });
            }, 2000);
          });
        } else if (chain.triggerNode?.triggerAttackRelease) {
          chain.triggerNode.triggerAttackRelease(this.Tone!.Frequency("C4").toFrequency(), "4n");
          setTimeout(() => {
            useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } });
            this.stopPreviewSynths();
          }, 3000);
        } else {
          // Fallback: Just stop it after 3s if no triggerNode
          setTimeout(() => {
            useMusicStore.getState().updateModule(previewNodeId, { previewUtilConfig: { playing: false } });
            this.stopPreviewSynths();
          }, 3000);
        }
      }
    }
  }

  private getOscillatorConfig(config: any) {
    const baseType = config?.type ?? config?.oscillatorType ?? 'sine';
    const cat = config?.oscillatorCategory ?? 'basic';
    const partials = config?.partialsCount ?? 0;
    
    let typeStr = baseType;
    if (cat !== 'basic') {
      typeStr = `${cat}${baseType}`;
    } else if (partials > 0) {
      typeStr = `${baseType}${partials}`;
    }

    const oscOpts: any = { type: typeStr };
    if (cat === 'fat') {
      oscOpts.count = config?.fatCount ?? 3;
      oscOpts.spread = config?.fatSpread ?? 30;
    }
    return oscOpts;
  }

  private buildInstrumentChain(nodeId: string, results: any): { triggerNode: any, outputNode: any } | null {
    if (!this.Tone) return null;
    const config = results[nodeId];
    if (!config) return null;

    if (config.type === 'track_out') {
      return this.buildInstrumentChain(config.sourceId, results);
    }
      let triggerNode: any = null;
      let outputNode: any = null;
      let effectNode: any = null;

    switch (config.type) {
      case 'noisecraft': {
        const dummyNode = new this.Tone.Gain(1);
        import('./NoiseCraftBridge').then(({ getNoiseCraftBridge }) => {
            const bridge = getNoiseCraftBridge();
            const iframeWindow = bridge.getIframe()?.contentWindow as any;
            if (iframeWindow && iframeWindow.noiseCraftMediaStream) {
                const nativeGain = dummyNode.context.rawContext.createGain();
                const rawAudioCtx = dummyNode.context.rawContext as AudioContext;
                if (rawAudioCtx.createMediaStreamSource) {
                    const srcNode = rawAudioCtx.createMediaStreamSource(iframeWindow.noiseCraftMediaStream);
                    srcNode.connect(nativeGain);
                    if ((dummyNode as any).input) {
                        nativeGain.connect((dummyNode as any).input);
                    } else {
                        nativeGain.connect(dummyNode as any);
                    }
                }
            }
        });
        return { triggerNode: dummyNode, outputNode: dummyNode };
      }
      case 'virtual_instrument': {
        const instrName = config.config?.instrument ?? 'acoustic_grand_piano';
        const vol = config.config?.volume ?? 0.8;
        const dummyNode = new this.Tone.Gain(1);
        
        const triggerAttackRelease = (freqs: any, duration: any, time: any) => {
           import('./SamplerEngine').then(sampler => {
              const engine = sampler.getSamplerEngine();
              const durSec = this.Tone!.Time(duration).toSeconds();
              const fArray = Array.isArray(freqs) ? freqs : [freqs];
              fArray.forEach(f => {
                 const midi = Math.round(12 * Math.log2(f / 440) + 69);
                 // We pass dummyNode context as the output so smplr routes to Track Bus
                 engine.playNote(instrName, midi, time, durSec, vol * 127, dummyNode.context.rawContext.createGain());
              });
           });
        };

        // Preload instrument with output node context
        import('./SamplerEngine').then(sampler => {
           const engine = sampler.getSamplerEngine();
           // We pass a dummy native node for smplr to route to 
           const nativeGain = dummyNode.context.rawContext.createGain();
           if ((dummyNode as any).input) {
               nativeGain.connect((dummyNode as any).input);
           } else {
               nativeGain.connect(dummyNode as any);
           }
           engine.getInstrument(instrName, nativeGain);
           
           // Override triggerAttackRelease to use the exact same nativeGain 
           triggerNode = { 
               triggerAttackRelease: (freqs: any, duration: any, time: any) => {
                   const durSec = this.Tone!.Time(duration).toSeconds();
                   const fArray = Array.isArray(freqs) ? freqs : [freqs];
                   fArray.forEach((f: any) => {
                       const midi = Math.round(12 * Math.log2(f / 440) + 69);
                       engine.playNote(instrName, midi, time, durSec, vol * 127, nativeGain);
                   });
               }
           };
        });

        // We return a proxy triggerNode since import is async
        let tempTriggerNode = {
            triggerAttackRelease: (freqs: any, duration: any, time: any) => {
                if (triggerNode && triggerNode !== tempTriggerNode) {
                    triggerNode.triggerAttackRelease(freqs, duration, time);
                }
            }
        };

        return { triggerNode: tempTriggerNode, outputNode: dummyNode };
      }
      case 'polysynth': {
        const oscOpts = this.getOscillatorConfig(config.config);
        const adsr = config.config?.envelope ?? { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 };
        const poly = new this.Tone.PolySynth(this.Tone.Synth, {
          oscillator: oscOpts,
          envelope: adsr
        });
        triggerNode = poly;
        outputNode = poly;
        break;
      }
      case 'oscillator': {
        const baseType = config.config?.type ?? 'sine';
        if (baseType === 'pinknoise' || baseType === 'whitenoise') {
          const synth = new this.Tone!.NoiseSynth({ noise: { type: baseType === 'pinknoise' ? 'pink' : 'white' }, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.1 } });
          triggerNode = { start: () => synth.triggerAttack(this.Tone!.now()), stop: () => synth.triggerRelease(this.Tone!.now()), triggerAttackRelease: (f: any, d: any) => synth.triggerAttackRelease(d, this.Tone!.now()) };
          outputNode = synth;
        } else {
          const oscOpts = this.getOscillatorConfig(config.config);
          const synth = new this.Tone!.PolySynth(this.Tone!.Synth, { oscillator: oscOpts, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.1 } });
          triggerNode = synth;
          outputNode = synth;
        }
        break;
      }
      case 'filter': {
        effectNode = new this.Tone.Filter({
          type: config.config?.type ?? 'lowpass',
          frequency: config.freq ?? config.config?.frequency ?? 1000,
          Q: config.q ?? config.config?.Q ?? 1
        });
        if (config.freqSeq) {
          const seq = config.freqSeq;
          const beatDuration = 60 / this.qpm;
          const stepDuration = beatDuration / 4; 
          const seqLength = Array.isArray(seq.pitches[0]) ? seq.pitches.length : seq.pitches.length;

          const events: any[] = [];
          for (let i = 0; i < seqLength; i++) {
            const time = i * stepDuration;
            let p = 0;
            if (Array.isArray(seq.pitches[0])) {
               const poly = seq.pitches[i];
               if (poly && poly.length > 0) p = poly[0];
            } else {
               p = seq.pitches[i];
            }
            if (p > 0) {
               events.push({ time, freq: this.Tone.Frequency(p, "midi").toFrequency() });
            }
          }
          const part = new this.Tone.Part((time, value) => {
             effectNode.frequency.setValueAtTime(value.freq, time);
          }, events);
          part.loop = true;
          part.loopEnd = seqLength * stepDuration;
          part.start(0);
          this.activeToneParts.push(part);
        }
        break;
      }
      case 'reverb': {
        effectNode = new this.Tone.Reverb({
          decay: config.config?.decay ?? 2,
          preDelay: config.config?.preDelay ?? 0.01
        });
        break;
      }
      case 'mix_node': {
        const gainA = new this.Tone.Gain(config.config?.volA ?? 1.0);
        const gainB = new this.Tone.Gain(config.config?.volB ?? 1.0);
        const masterGain = new this.Tone.Gain(1.0);
        gainA.connect(masterGain);
        gainB.connect(masterGain);
        this.activeToneNodes.push(gainA, gainB, masterGain);

        let trigA: any = null;
        let trigB: any = null;

        if (config.sourceAId) {
          const upstreamA = this.buildInstrumentChain(config.sourceAId, results);
          if (upstreamA) {
            trigA = upstreamA.triggerNode;
            upstreamA.outputNode.connect(gainA);
          }
        }
        if (config.sourceBId) {
          const upstreamB = this.buildInstrumentChain(config.sourceBId, results);
          if (upstreamB) {
            trigB = upstreamB.triggerNode;
            upstreamB.outputNode.connect(gainB);
          }
        }

        return {
          triggerNode: {
            start: () => { trigA?.start?.(); trigB?.start?.(); },
            stop: () => { trigA?.stop?.(); trigB?.stop?.(); },
            triggerAttack: (freq: any) => { trigA?.triggerAttack?.(freq); trigB?.triggerAttack?.(freq); },
            triggerRelease: () => { trigA?.triggerRelease?.(); trigB?.triggerRelease?.(); },
            triggerAttackRelease: (freq: any, dur: any) => { trigA?.triggerAttackRelease?.(freq, dur); trigB?.triggerAttackRelease?.(freq, dur); }
          },
          outputNode: masterGain
        };
      }
    }

    if (effectNode) {
      this.activeToneNodes.push(effectNode);
      if (config.sourceId) {
        const upstream = this.buildInstrumentChain(config.sourceId, results);
        if (upstream) {
          triggerNode = upstream.triggerNode;
          upstream.outputNode.connect(effectNode);
          outputNode = effectNode;
        } else {
          outputNode = effectNode;
        }
      } else {
        outputNode = effectNode;
      }
    } else if (outputNode) {
      this.activeToneNodes.push(outputNode);
    }

    if (!triggerNode && !outputNode) return null;
    return { triggerNode, outputNode };
  }

  // -----------------------------------------------------------------------
  // Legacy helpers (for magenta_ai / harmonic_array)
  // -----------------------------------------------------------------------

  private getTargetOutputNodeId(module: MusicModule, musicState: any): string | null {
    const outputEdge = musicState.edges.find(
      (e: any) => e.source === module.id && e.sourceHandle === 'sequence',
    );
    if (outputEdge) {
      return outputEdge.target;
    }
    return module.id; // fallback
  }

  /**
   * Legacy sequence generation for magenta_ai and harmonic_array.
   * These bypass the DAG and produce sequences directly using their own
   * internal scale logic (no hardcoded global chord progression).
   */

}

export const musicEngine = MusicEngine.getInstance();
