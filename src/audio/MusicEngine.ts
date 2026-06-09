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

  // Only count edges where BOTH ends are modules in our set.
  // Ignore 'fx_in' target handles because they create insert loops (cycles)
  // which break topological sort. Also ensure we only use data flow handles.
  const dataHandles = new Set([
    'chordData', 'sequence', 'voice_0', 'voice_1', 'voice_2', 'voice_3',
    'instrument', 'audio_out', 'envelope', 'audio_in', 'trigger_in'
  ]);

  for (const e of edges) {
    if (!moduleIds.has(e.source) || !moduleIds.has(e.target)) continue;
    if (e.targetHandle === 'fx_in') continue; // Break FX loops!
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
  private activeTonePartsMap = new Map<string, any>();
  private previewActiveNodes: any[] = [];
  private previewIntervals: any[] = [];
  private activeNodesMap = new Map<string, any>();
  private qpm = 120;
  private updateTimer: NodeJS.Timeout | null = null;
  private globalStepCount = 0;
  private audioCtx: AudioContext | null = null;
  
  // Magenta imports
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

      this.sequences = coreModule.sequences;
      
      this.rnn = new rnnModule.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv');
      this.drumRnn = new rnnModule.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/drum_kit_rnn');
      
      try {
        await Promise.all([
          this.rnn.initialize(),
          this.drumRnn.initialize()
        ]);
        this.initialized = true;
        console.log('[MusicEngine] Magenta initialized in main thread');
      } catch (err) {
        console.error('[MusicEngine] Magenta initialization failed', err);
      }
    }
    
    // Lazily create AudioContext if needed
    this.getAudioContext();
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

    if (!this.initialized) {
      this.initialize();
    }

    const bridge = getNoiseCraftBridge();

    let lastSyncedModules = '';
    const syncModules = () => {
      const state = useMusicStore.getState();
      const outModules = state.modules
        .filter((m) => m.type === 'ai_seq_out' || m.type === 'seq_out')
        .map((m) => ({ 
          id: m.id, 
          name: m.type === 'seq_out' ? `Channel ${m.seqOutConfig?.channel || '?'}` : m.name 
        }));
      
      const newStr = JSON.stringify(outModules);
      if (newStr !== lastSyncedModules) {
        lastSyncedModules = newStr;
        bridge.postMessage({ type: 'noiseCraft:updateModules', modules: outModules });
      }
    };
    syncModules();
    useMusicStore.subscribe(syncModules);

    let lastTick = performance.now();
    let accumulatedPulses = 0;

    const tickPulses = () => {
      this.globalStepCount++;
      this.tickAllModules();
    };

    this.updateTimer = setInterval(() => {
      if (!this.isRunning) return;
      // Engine always runs to keep sequences fresh
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      // Sync with Tone.js Transport if available
      if (this.Tone && this.Tone.Transport.state === 'started') {
        accumulatedPulses += (dt * (this.Tone.Transport.bpm.value / 60) * 24);
      } else {
        const bpm = useMusicStore.getState().bpm || 120;
        accumulatedPulses += (dt * (bpm / 60) * 24);
      }

      while (accumulatedPulses >= 1) {
        accumulatedPulses -= 1;
        tickPulses();
      }
      
      this.updateDynamicParameters();
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
      'adsr_envelope',
      'pedal_fx',
      'effect_chain'
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
      // Prevent drift by subtracting the exact needed pulses, rather than resetting to 0
      dagState.cursor -= dagPulsesNeeded;
      
      this.evaluateDAG(dagModules, musicState, audioState).then(() => {
        dagState!.seqLength = 16;
        dagState!.isGenerating = false;
        
        // Update Tone.Part instances dynamically with the newly generated sequences
        const state = useMusicStore.getState();
        const results = state.nodeOutputs;
        
        for (const [nodeId, part] of this.activeTonePartsMap.entries()) {
           const config = results[nodeId];
           if (config && config.sequence) {
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
             
             part.clear();
             events.forEach(ev => {
               part.add(ev.time, ev);
             });
           }
        }
        
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
        case 'player_out':
          this.evalPlayerOut(mod, musicState, results, seqLength);
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
        case 'pedal_fx':
          this.evalPedalFx(mod, musicState, results);
          break;
        case 'effect_chain':
          this.evalEffectChain(mod, musicState, results);
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

    const temperature = this.getParamValue(mod, 'temperature', 1.1, musicState, audioState);
    const rhythmicComplexity = mod.melodyGenConfig?.rhythmicComplexity ?? 0.5;
    const density = this.getParamValue(mod, 'density', rhythmicComplexity, musicState, audioState);
    const register: number = mod.melodyGenConfig?.register ?? 0;
    const algorithm = mod.melodyGenConfig?.algorithm ?? 'procedural';

    const pitches: number[] = [];
    const gates: number[] = [];
    const baseNote = 60; // C4

    if (algorithm === 'magenta' && this.initialized) {
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

        const payload = {
          qns,
          seqLength,
          temperature,
          chordProgressionStrings
        };

        let melodyResult = null;
        
        if (this.rnn) {
          melodyResult = await this.rnn.continueSequence(qns, seqLength, temperature, chordProgressionStrings);
        }
        
        if (!melodyResult) throw new Error('Magenta failed to return melody');

        const firstStep = melodyResult.notes && melodyResult.notes.length > 0 
          ? melodyResult.notes[0].quantizedStartStep ?? 0 
          : 0;

        let lastPitch = root;
        
        for (let i = 0; i < seqLength; i++) {
          const currentStep = firstStep + i;
          const note = melodyResult.notes?.find(
            (n: any) => (n.quantizedStartStep ?? 0) <= currentStep && (n.quantizedEndStep ?? 0) > currentStep
          );

          // Get pitch
          let target = lastPitch;
          if (note) {
            target = note.pitch ?? root;
            lastPitch = target;
          }

          // Use drum pattern for gate if available, else use original note timing
          // Only trigger gate if the note starts exactly on this step
          const isGateOn = note && note.quantizedStartStep === currentStep;
          
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
    const audioInEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'audio_in');
    
    results.set(mod.id, {
      type: 'track_out',
      sourceId: audioInEdge ? audioInEdge.source : null,
    });
  }

  private evalPlayerOut(mod: MusicModule, musicState: any, results: Map<string, any>, seqLength: number) {
    const sequence = this.resolveInputData(mod, 'sequence', musicState, results);
    const instrumentEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'instrument');
    const instrumentId = instrumentEdge ? instrumentEdge.source : null;
    
    results.set(mod.id, {
      type: 'player_out',
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
        if (val?.type === 'adsr_envelope') {
          if (handleId === 'envelope' || edge.sourceHandle === 'envelope') return val.config;
          return val.config?.[edge.sourceHandle as string];
        }
        if (typeof val?.value === 'number') return val.value;
        if (typeof val === 'number') return val;
      }
      return null;
    };

    const mapVal = (val: number, min: number, max: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      return min + clamped * (max - min);
    };

    const envVal = getEdgeVal('envelope');
    if (envVal && typeof envVal === 'object') {
       config.attack = envVal.attack;
       config.decay = envVal.decay;
       config.sustain = envVal.sustain;
       config.release = envVal.release;
    } else {
      const a = getEdgeVal('attack'); if (a !== null) config.attack = mapVal(a, 0.001, 2.0);
      const d = getEdgeVal('decay'); if (d !== null) config.decay = mapVal(d, 0.001, 2.0);
      const s = getEdgeVal('sustain'); if (s !== null) config.sustain = mapVal(s, 0.0, 1.0);
      const r = getEdgeVal('release'); if (r !== null) config.release = mapVal(r, 0.001, 4.0);
    }
    
    // PolySynth Tone.js requires it structured as envelope
    config.envelope = {
      attack: config.attack ?? 0.1,
      decay: config.decay ?? 0.2,
      sustain: config.sustain ?? 0.5,
      release: config.release ?? 1.0,
    };

    const sequence = this.resolveInputData(mod, 'sequence', musicState, results);
    const fxInEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'fx_in');
    const fxSourceId = fxInEdge ? fxInEdge.source : null;

    results.set(mod.id, {
      type: 'polysynth',
      config,
      sequence,
      fxSourceId
    });
  }

  private evalOscillator(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const sequence = this.resolveInputData(mod, 'sequence', musicState, results);
    results.set(mod.id, {
      type: 'oscillator',
      config: mod.oscillatorConfig,
      sequence
    });
  }

  private evalAdsrEnvelope(mod: MusicModule, musicState: any, results: Map<string, any>) {
    let config = { ...mod.adsrEnvelopeConfig } as any;

    const getEdgeVal = (handleId: string) => {
      const edge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === handleId);
      if (edge) {
        const val = results.get(edge.source);
        if (val?.type === 'adsr_envelope') {
          return val.config?.[edge.sourceHandle as string];
        }
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

    const sourceId = inputEdge ? inputEdge.source : null;
    let sequence = null;
    if (sourceId && results.has(sourceId)) {
        sequence = results.get(sourceId).sequence;
    }

    results.set(mod.id, {
      type: 'filter',
      config: mod.filterConfig,
      sourceId,
      freq,
      q,
      freqSeq,
      sequence
    });
  }

  private evalReverb(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const inputEdge = musicState.edges.find((e: any) => e.target === mod.id && (e.targetHandle === 'source' || e.targetHandle === 'in_instrument'));
    const sourceId = inputEdge ? inputEdge.source : null;
    let sequence = null;
    if (sourceId && results.has(sourceId)) {
        sequence = results.get(sourceId).sequence;
    }
    results.set(mod.id, {
      type: 'reverb',
      config: mod.reverbConfig,
      sourceId,
      sequence
    });
  }

  private evalPedalFx(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const inputEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'audio_in');
    const sourceId = inputEdge ? inputEdge.source : null;
    let sequence = null;
    if (sourceId && results.has(sourceId)) {
        sequence = results.get(sourceId).sequence;
    }
    results.set(mod.id, {
      type: 'pedal_fx',
      config: mod.pedalFxConfig,
      sourceId,
      sequence
    });
  }

  private evalEffectChain(mod: MusicModule, musicState: any, results: Map<string, any>) {
    // Only difference from pedal_fx is the config, but we pass sequence through similarly.
    // However, it has NO targetHandle='audio_in'. It's only attached to fx_in!
    // Wait, since it's only attached to fx_in, the sourceId of effect_chain is NULL.
    // Because effect_chain doesn't have an audio_in! It receives signal from PolySynth!
    // Wait, PolySynth uses the effect_chain. So effect_chain doesn't need to know its source.
    results.set(mod.id, {
      type: 'effect_chain',
      config: mod.effectChainConfig
    });
  }

  private evalMixNode(mod: MusicModule, musicState: any, results: Map<string, any>) {
    const edgeA = musicState.edges.find((e: any) => e.target === mod.id && (e.targetHandle === 'inA' || e.targetHandle === 'in_instrument_a'));
    const edgeB = musicState.edges.find((e: any) => e.target === mod.id && (e.targetHandle === 'inB' || e.targetHandle === 'in_instrument_b'));
    
    results.set(mod.id, {
      type: 'mix_node',
      config: mod.mixNodeConfig,
      sourceAId: edgeA ? edgeA.source : null,
      sourceBId: edgeB ? edgeB.source : null
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

    results.set(mod.id, inputSeq); // Set results so UI preview works!

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
    const audioEdge = musicState.edges.find((e: any) => e.target === mod.id && e.targetHandle === 'audio_in');
    const sourceId = audioEdge ? audioEdge.source : null;
    
    let sequence = this.resolveInputData(mod, 'trigger_in', musicState, results);
    if (!sequence && sourceId && results.has(sourceId)) {
        sequence = results.get(sourceId).sequence;
    }

    results.set(mod.id, {
      type: 'module_output',
      sourceId,
      sequence
    });
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
  // Dynamic Parameter Updates (Runs at 60fps)
  // -----------------------------------------------------------------------

  private updateDynamicParameters() {
    if (!this.Tone) return;
    const { useMusicStore } = require('@/store/musicStore');
    const { useAudioMapStore } = require('@/store/audioMapStore');
    const musicState = useMusicStore.getState();
    const audioState = useAudioMapStore.getState();

    for (const [nodeId, node] of this.activeNodesMap.entries()) {
      const module = musicState.modules.find((m: any) => m.id === nodeId);
      if (!module) continue;

      const getEdgeVal = (handleId: string) => {
        const edge = musicState.edges.find((e: any) => e.target === module.id && e.targetHandle === handleId);
        if (edge) {
          const srcMod = musicState.modules.find((m: any) => m.id === edge.source);
          if (srcMod) {
             if (srcMod.type === 'slider') return srcMod.sliderConfig?.value;
             if (srcMod.type === 'knob') return srcMod.knobConfig?.value;
             if (srcMod.type === 'adsr_envelope') {
                 if (handleId === 'envelope' || edge.sourceHandle === 'envelope') return srcMod.adsrEnvelopeConfig;
                 return srcMod.adsrEnvelopeConfig?.[edge.sourceHandle as string];
             }
             if (srcMod.type === 'virtual_stream' && srcMod.inputStreamId) {
                const sensors = require('@/store/sensorStore').useSensorStore.getState();
                const sensorValues = { ppg: sensors.ppg, emg: sensors.emg, ecg: sensors.ecg, gsr: sensors.gsr, mouseX: sensors.mouseX, mouseY: sensors.mouseY };
                return evaluateStreamValue(srcMod.inputStreamId, audioState.streams, sensorValues);
             }
          }
        }
        return null;
      };

      if (module.type === 'polysynth') {
        const config = module.polysynthConfig || {};
        const mapVal = (val: number, min: number, max: number) => {
          const clamped = Math.max(0, Math.min(1, val));
          return min + clamped * (max - min);
        };
        
        const envVal = getEdgeVal('envelope');
        if (envVal && typeof envVal === 'object') {
           config.attack = envVal.attack;
           config.decay = envVal.decay;
           config.sustain = envVal.sustain;
           config.release = envVal.release;
        } else {
           const a = getEdgeVal('attack'); if (a !== null) config.attack = mapVal(a, 0.001, 2.0);
           const d = getEdgeVal('decay'); if (d !== null) config.decay = mapVal(d, 0.001, 2.0);
           const s = getEdgeVal('sustain'); if (s !== null) config.sustain = mapVal(s, 0.0, 1.0);
           const r = getEdgeVal('release'); if (r !== null) config.release = mapVal(r, 0.001, 4.0);
        }
        
        try {
          const currentEnv = node.get().envelope;
          const newEnv: any = {};
          if (config.attack !== undefined && Math.abs(config.attack - currentEnv.attack) > 0.001) newEnv.attack = config.attack;
          if (config.decay !== undefined && Math.abs(config.decay - currentEnv.decay) > 0.001) newEnv.decay = config.decay;
          if (config.sustain !== undefined && Math.abs(config.sustain - currentEnv.sustain) > 0.001) newEnv.sustain = config.sustain;
          if (config.release !== undefined && Math.abs(config.release - currentEnv.release) > 0.001) newEnv.release = config.release;
          
          if (Object.keys(newEnv).length > 0) {
            node.set({ envelope: newEnv });
          }
          
          const vol = getEdgeVal('volume');
          if (vol !== null) {
            node.volume.rampTo(this.Tone.gainToDb(Math.max(0.0001, vol)), 0.05);
          }
        } catch (e) {}
      }

      if (module.type === 'filter') {
        let freq = module.filterConfig?.frequency ?? 1000;
        const freqRaw = getEdgeVal('frequency');
        if (freqRaw !== null && typeof freqRaw === 'number') {
           freq = 20 + freqRaw * (20000 - 20);
        }
        let q = module.filterConfig?.Q ?? 1;
        const qRaw = getEdgeVal('q');
        if (qRaw !== null && typeof qRaw === 'number') {
           q = 0.1 + qRaw * (20 - 0.1);
        }
        try {
          node.frequency.rampTo(freq, 0.05);
          node.Q.rampTo(q, 0.05);
        } catch (e) {}
      }

      if (module.type === 'pedal_fx' && node && !node.isEffectChain) {
        const fxType = module.pedalFxConfig?.effectType ?? 'chorus';
        try {
          if (fxType === 'chorus') {
            node.frequency.rampTo(Math.max(0.01, module.pedalFxConfig?.param1 ?? 4), 0.05);
            node.depth = module.pedalFxConfig?.param2 ?? 0.5;
            node.wet.rampTo(Math.max(0, module.pedalFxConfig?.mix ?? 0.5), 0.05);
          } else if (fxType === 'distort') {
            node.distortion = module.pedalFxConfig?.param1 ?? 0.4;
            node.wet.rampTo(Math.max(0, module.pedalFxConfig?.mix ?? 0.5), 0.05);
          } else if (fxType === 'reverb') {
            node.decay = Math.max(0.1, (module.pedalFxConfig?.param1 ?? 0.2) * 10);
            node.wet.rampTo(Math.max(0, module.pedalFxConfig?.mix ?? 0.5), 0.05);
          }
        } catch (e) {}
      }

      if (module.type === 'effect_chain' && node && node.isEffectChain) {
        const effectsConfig = module.effectChainConfig?.effects ?? [];
        const enabledConfigs = effectsConfig.filter((f: any) => f.enabled !== false);
        // The array of nodes was built from end to start (index N-1 to 0).
        // Let's match them up.
        if (enabledConfigs.length === node.nodes.length) {
          for (let i = 0; i < enabledConfigs.length; i++) {
            // Because we built it backwards in buildInstrumentChain:
            // nodes[j] corresponds to enabledConfigs[enabledConfigs.length - 1 - j]
            const fx = enabledConfigs[enabledConfigs.length - 1 - i];
            const toneNode = node.nodes[i];
            
            try {
              if (fx.type === 'chorus') {
                toneNode.frequency.rampTo(Math.max(0.01, fx.param1), 0.05);
                toneNode.depth = fx.param2; // no rampTo for depth in Tone.Chorus
                toneNode.wet.rampTo(Math.max(0, fx.mix), 0.05);
              } else if (fx.type === 'distortion') {
                toneNode.distortion = fx.param1; // no rampTo
                toneNode.wet.rampTo(Math.max(0, fx.mix), 0.05);
              } else if (fx.type === 'delay') {
                toneNode.delayTime.rampTo(Math.max(0.01, fx.param1), 0.05);
                toneNode.feedback.rampTo(Math.max(0, fx.param2), 0.05);
                toneNode.wet.rampTo(Math.max(0, fx.mix), 0.05);
              } else if (fx.type === 'reverb') {
                toneNode.decay = Math.max(0.1, fx.param1 * 10); // Reverb decay must be re-generated, no rampTo
                toneNode.preDelay = Math.max(0, fx.param2 * 0.1);
                toneNode.wet.rampTo(Math.max(0, fx.mix), 0.05);
              }
            } catch (e) {}
          }
        }
      }
    }
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
      'virtual_instrument', 'track_out', 'player_out', 'polysynth', 'oscillator',
      'mix_node', 'seq_to_freq', 'filter', 'adsr_envelope'
    ]);
    const dagModules = musicState.modules.filter((m) => dagTypes.has(m.type));
    await this.evaluateDAG(dagModules, musicState, audioState);

    const state = useMusicStore.getState();
    const results = state.nodeOutputs;
    if (!results) return;

    await this.Tone.start();
    this.Tone.Transport.bpm.value = this.qpm;

    const playouts = state.modules.filter(m => m.type === 'track_out' || m.type === 'player_out' || m.type === 'score_out' || m.type === 'module_output');
    for (const outNode of playouts) {
      const config = results[outNode.id];
      if (!config) continue;

      let triggerNode: any = null;
      
      // 1. Raw Audio Routing for track_out and module_output
      if (outNode.type === 'track_out' || outNode.type === 'module_output') {
        if (outNode.type === 'module_output' && outNode.outConfig?.muted) continue;

        if (config.sourceId) {
          const chain = this.buildInstrumentChain(config.sourceId, results);
          if (chain && chain.outputNode) {
            if (outNode.type === 'track_out') {
              const trackName = outNode.trackOutConfig?.trackName || 'Track 1';
              const { useAudioGraphStore, getTrackBus } = await import('@/store/audioGraphStore');
              const audioCtx = useAudioGraphStore.getState().audioContext;
              if (audioCtx) {
                 const bus = getTrackBus(audioCtx, trackName);
                 this.Tone.connect(chain.outputNode, bus);
              } else {
                 chain.outputNode.toDestination();
              }
            } else {
              chain.outputNode.toDestination();
            }
            
            triggerNode = chain.triggerNode;
            
            if (!config.sequence && chain.triggerNode) {
              if (chain.triggerNode.triggerAttack) {
                chain.triggerNode.triggerAttack(this.Tone!.Frequency("C4").toFrequency(), this.Tone!.now());
                this.activeToneNodes.push(chain.triggerNode);
              } else if (chain.triggerNode.start) {
                chain.triggerNode.start(this.Tone!.now());
                this.activeToneNodes.push(chain.triggerNode);
              }
            }
          }
        }
      }

      // 2. Sequenced Player output
      if (outNode.type === 'player_out') {
        if (outNode.playerOutConfig?.isPlaying === false) continue;
        if (config.instrumentId) {
          const chain = this.buildInstrumentChain(config.instrumentId, results);
          if (chain && chain.triggerNode && chain.outputNode) {
            triggerNode = chain.triggerNode;
            const trackName = outNode.playerOutConfig?.trackName || 'Track 1';
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
      }
      
      if (!config.sequence) continue;
      
      if (!triggerNode && outNode.type === 'player_out') continue;
      
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
      this.activeTonePartsMap.set(outNode.id, part);
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
    this.activeTonePartsMap.clear();
    this.activeToneParts = [];

    this.activeToneNodes = [];
    this.activeNodesMap.clear();
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

  private previewSynthRef: any = null;

  public async previewInstrument(moduleId: string, playing: boolean, note: number = 60) {
    if (!this.Tone) return;

    if (!playing) {
       if (this.previewSynthRef) {
          if (this.previewSynthRef.triggerRelease) {
             this.previewSynthRef.triggerRelease(this.Tone.now());
          } else if (this.previewSynthRef.stop) {
             this.previewSynthRef.stop(this.Tone.now());
          }
       }
       return;
    }

    this.stopPreviewSynths();
    if (this.Tone.context.state !== 'running') {
      await this.Tone.start();
    }

    const { useMusicStore } = await import('@/store/musicStore');
    const state = useMusicStore.getState();
    const results = state.nodeOutputs;
    
    if (!results[moduleId]) {
      const mod = state.modules.find(m => m.id === moduleId);
      if (mod) {
        const tempMap = new Map<string, any>(Object.entries(results));
        if (mod.type === 'polysynth') this.evalPolysynth(mod, state, tempMap);
        if (mod.type === 'oscillator') this.evalOscillator(mod, state, tempMap);
        
        // merge back
        for (const [k, v] of tempMap.entries()) {
          results[k] = v;
        }
      }
    }

    const chain = this.buildInstrumentChain(moduleId, results);
    if (!chain || !chain.triggerNode || !chain.outputNode) return;

    chain.outputNode.toDestination();
    this.previewActiveNodes.push(chain.triggerNode, chain.outputNode);
    this.previewSynthRef = chain.triggerNode;

    const freq = this.Tone.Frequency(note, "midi").toFrequency();
    if (chain.triggerNode.triggerAttack) {
      chain.triggerNode.triggerAttack(freq, this.Tone.now());
    } else if (chain.triggerNode.start) {
      chain.triggerNode.start(this.Tone.now());
    }
  }

  public async toggleUniversalPreview(previewNodeId: string, playing: boolean) {
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

    const edgeAudio = state.edges.find(e => e.target === previewNodeId && e.targetHandle === 'audio_in');
    const edgeSeq = state.edges.find(e => e.target === previewNodeId && e.targetHandle === 'seq_in');
    const edgeCtrl = state.edges.find(e => e.target === previewNodeId && e.targetHandle === 'control_in');

    const edge = edgeAudio || edgeSeq || edgeCtrl;
    if (!edge) {
      setTimeout(() => useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { ...previewMod.universalPreviewConfig!, playing: false } }), 100);
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
      setTimeout(() => useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { playing: false, activeType: null } }), 100);
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
      let seq = state.nodeOutputs?.[sourceId]?.sequence as MonoSequence | PolySequence | undefined;
      
      // If the source itself doesn't have a sequence (e.g. virtual_instrument), 
      // look ahead to see if it's connected to a track_out that HAS a sequence!
      if (!seq || !seq.pitches || seq.pitches.length === 0) {
         const trackOutEdge = state.edges.find(e => e.source === sourceId && (e.sourceHandle === 'instrument' || e.targetHandle === 'instrument'));
         if (trackOutEdge) {
            const trackOutId = trackOutEdge.target;
            const seqEdge = state.edges.find(e => e.target === trackOutId && e.targetHandle === 'sequence');
            if (seqEdge) {
                const seqOut = state.nodeOutputs?.[seqEdge.source];
                seq = seqOut?.sequence || seqOut;
            }
         }
      }
      
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
          useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { playing: false, activeType: null } });
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
              useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { playing: false, activeType: null } });
            }, 2000);
          });
        } else if (chain.triggerNode?.triggerAttackRelease) {
          chain.triggerNode.triggerAttackRelease(this.Tone!.Frequency("C4").toFrequency(), "4n");
          if (this.Tone.Transport.state !== 'started') {
             this.Tone.Transport.start();
          }
          setTimeout(() => {
            useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { playing: false, activeType: null } });
            this.stopPreviewSynths();
          }, 3000);
        } else {
          // Fallback: Just stop it after 3s if no triggerNode
          setTimeout(() => {
            useMusicStore.getState().updateModule(previewNodeId, { universalPreviewConfig: { playing: false, activeType: null } });
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
        
        // Create nativeGain ONCE and connect it to dummyNode
        const nativeGain = dummyNode.context.rawContext.createGain();
        if ((dummyNode as any).input) {
            nativeGain.connect((dummyNode as any).input);
        } else {
            nativeGain.connect(dummyNode as any);
        }
        
        const triggerAttackRelease = (freqs: any, duration: any, time: any) => {
           import('./SamplerEngine').then(sampler => {
              const engine = sampler.getSamplerEngine();
              const durSec = this.Tone!.Time(duration).toSeconds();
              const fArray = Array.isArray(freqs) ? freqs : [freqs];
              fArray.forEach(f => {
                 const midi = Math.round(12 * Math.log2(f / 440) + 69);
                 // Reuse nativeGain!
                 engine.playNote(instrName, midi, time, durSec, vol * 127, nativeGain);
              });
           });
        };

        // Preload instrument
        import('./SamplerEngine').then(sampler => {
           const engine = sampler.getSamplerEngine();
           engine.getInstrument(instrName, nativeGain);
        });

        return { triggerNode: { triggerAttackRelease }, outputNode: dummyNode };
      }
      case 'polysynth': {
        const oscOpts = this.getOscillatorConfig(config.config);
        const adsr = config.config?.envelope ?? { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 };
        const poly = new this.Tone.PolySynth(this.Tone.Synth, {
          oscillator: oscOpts,
          envelope: adsr
        });
        if (config.config?.volume !== undefined) {
           poly.volume.value = this.Tone.gainToDb(Math.max(0.0001, config.config.volume));
        }
        this.activeNodesMap.set(nodeId, poly);
        triggerNode = poly;
        
        if (config.fxSourceId) {
            const fxChain = this.buildInstrumentChain(config.fxSourceId, results);
            if (fxChain && fxChain.outputNode) {
               poly.connect(fxChain.triggerNode);
               outputNode = fxChain.outputNode;
            } else {
               outputNode = poly;
            }
        } else {
            outputNode = poly;
        }
        break;
      }
      case 'oscillator': {
        const baseType = config.config?.type ?? 'sine';
        if (baseType === 'pinknoise' || baseType === 'whitenoise') {
          const synth = new this.Tone!.NoiseSynth({ noise: { type: baseType === 'pinknoise' ? 'pink' : 'white' }, envelope: { attack: 0.1, decay: 0, sustain: 1, release: 0.1 } });
          triggerNode = { 
            start: (time?: any) => synth.triggerAttack((time ?? this.Tone!.now()) + 0.05), 
            stop: (time?: any) => synth.triggerRelease((time ?? this.Tone!.now()) + 0.05), 
            triggerAttackRelease: (f: any, d: any, t?: any) => synth.triggerAttackRelease(d, (t ?? this.Tone!.now()) + 0.05) 
          };
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
        this.activeNodesMap.set(nodeId, effectNode);
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
        if (effectNode.generate) effectNode.generate();
        break;
      }
      case 'pedal_fx': {
        const fxType = config.config?.effectType ?? 'chorus';
        if (fxType === 'chorus') {
            effectNode = new this.Tone.Chorus({
               frequency: config.config?.param1 ?? 4,
               depth: config.config?.param2 ?? 0.5,
               wet: config.config?.mix ?? 0.5
            }).start();
        } else if (fxType === 'distort') {
            effectNode = new this.Tone.Distortion({
               distortion: config.config?.param1 ?? 0.4,
               wet: config.config?.mix ?? 0.5
            });
        } else if (fxType === 'reverb') {
            effectNode = new this.Tone.Reverb({
               decay: config.config?.param1 ? (config.config.param1 * 10) : 2,
               wet: config.config?.mix ?? 0.5
            });
            if (effectNode.generate) effectNode.generate();
        } else {
            effectNode = new this.Tone.Gain(1);
        }
        this.activeNodesMap.set(nodeId, effectNode);
        break;
      }
      case 'effect_chain': {
        const effectsConfig = config.config?.effects ?? [];
        if (effectsConfig.length === 0) {
            effectNode = new this.Tone.Gain(1);
            break;
        }

        const nodes: any[] = [];
        // Loop backwards: Top in UI (index 0) is applied LAST!
        // So signal goes from index N-1 to 0
        for (let i = effectsConfig.length - 1; i >= 0; i--) {
            const fx = effectsConfig[i];
            if (fx.enabled === false) continue;
            
            let toneNode = null;
            if (fx.type === 'chorus') {
                toneNode = new this.Tone.Chorus({ frequency: fx.param1, depth: fx.param2, wet: fx.mix }).start();
            } else if (fx.type === 'distortion') {
                toneNode = new this.Tone.Distortion({ distortion: fx.param1, wet: fx.mix });
            } else if (fx.type === 'delay') {
                toneNode = new this.Tone.FeedbackDelay({ delayTime: fx.param1, feedback: fx.param2, wet: fx.mix });
            } else if (fx.type === 'reverb') {
                toneNode = new this.Tone.Reverb({ decay: fx.param1 * 10, preDelay: fx.param2 * 0.1, wet: fx.mix });
                if (toneNode.generate) toneNode.generate();
            }
            if (toneNode) {
                nodes.push(toneNode);
                this.activeToneNodes.push(toneNode);
            }
        }

        this.activeNodesMap.set(nodeId, { isEffectChain: true, nodes });

        if (nodes.length === 0) {
            effectNode = new this.Tone.Gain(1);
        } else if (nodes.length === 1) {
            effectNode = nodes[0];
        } else {
            // Chain them: nodes[0] -> nodes[1] -> ... -> nodes[last]
            // nodes[0] is the FIRST effect applied (which was index N-1 in UI)
            // nodes[last] is the LAST effect applied (which was index 0 in UI)
            for (let i = 0; i < nodes.length - 1; i++) {
                nodes[i].connect(nodes[i + 1]);
            }
            // Return a wrapper object that exposes input on first and output on last
            // buildInstrumentChain will connect TO triggerNode (which is input) and FROM outputNode (which is output)
            // Wait, for effectNode, the caller uses effectNode directly.
            // If effectNode is an array of chained nodes, we need to create a dummy Gain for input/output?
            // Actually, we can return `{ triggerNode: nodes[0], outputNode: nodes[nodes.length - 1] }` directly.
            return { triggerNode: nodes[0], outputNode: nodes[nodes.length - 1] };
        }
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
