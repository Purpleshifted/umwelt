import { MusicRNN } from '@magenta/music/es6/music_rnn';
import { sequences } from '@magenta/music/es6/core';
import { INoteSequence } from '@magenta/music/es6/protobuf';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from './NoiseCraftBridge';

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
  private rnn: MusicRNN | null = null;
  private initialized = false;
  private qpm = 120;
  private updateTimer: NodeJS.Timeout | null = null;
  private globalStepCount = 0;
  private audioCtx: AudioContext | null = null;

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
    try {
      // Lazily create AudioContext if needed
      this.getAudioContext();
      this.rnn = new MusicRNN(
        'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn',
      );
      await this.rnn.initialize();
      this.initialized = true;
    } catch (err) {
      console.warn('Failed to load Magenta MusicRNN', err);
    }
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
        .filter(
          (m) =>
            m.type === 'module_output' ||
            m.type === 'magenta_ai' ||
            m.type === 'harmonic_array',
        )
        .map((m) => ({ id: m.id, name: m.name }));
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

      if (!isBridgeRunning) {
        if (wasBridgeRunning) {
          // Just stopped – clear sequences to silence the continuous AudioGraph
          const state = useMusicStore.getState();
          state.modules.forEach((m) => {
            if (m.type === 'magenta_ai' || m.type === 'harmonic_array') {
              const targetId = this.getTargetOutputNodeId(m, state);
              if (targetId) bridge.setSequence(targetId, [], []);
            }
          });
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

    // --- Legacy generators (magenta_ai, harmonic_array) --------------------
    const legacyGenerators = musicState.modules.filter(
      (m) => m.type === 'magenta_ai' || m.type === 'harmonic_array',
    );

    for (const gen of legacyGenerators) {
      let genState = this.moduleStates.get(gen.id);
      if (!genState) {
        genState = { cursor: 0, seqLength: 0, isGenerating: false };
        this.moduleStates.set(gen.id, genState);
      }

      genState.cursor++;
      const totalPulsesNeeded = genState.seqLength * 6; // 6 pulses per 16th note

      if (genState.cursor >= totalPulsesNeeded && !genState.isGenerating) {
        genState.isGenerating = true;

        this.generateLegacySequence(gen, musicState, audioState).then((seq) => {
          if (seq && seq.pitches.length > 0) {
            const targetId = this.getTargetOutputNodeId(gen, musicState);
            if (targetId) {
              this.sendSequenceToAI(targetId, seq);
            }
            genState!.seqLength = seq.pitches.length;
            genState!.cursor = 0;
          } else {
            genState!.seqLength = 1;
            genState!.cursor = 0;
          }
          genState!.isGenerating = false;
        });
      }
    }

    // --- DAG-based generators ----------------------------------------------
    const dagTypes = new Set([
      'chord_progression',
      'melody_gen',
      'chord_gen',
      'voice_splitter',
      'register_shift',
      'module_output',
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
      this.evaluateDAG(dagModules, musicState, audioState);
      dagState.seqLength = 16;
      dagState.cursor = 0;
      dagState.isGenerating = false;
    }
  }

  // -----------------------------------------------------------------------
  // DAG evaluation
  // -----------------------------------------------------------------------

  private evaluateDAG(dagModules: MusicModule[], musicState: any, audioState: any) {
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
        case 'melody_gen':
          this.evalMelodyGen(mod, musicState, audioState, results, seqLength);
          break;
        case 'chord_gen':
          this.evalChordGen(mod, musicState, audioState, results, seqLength);
          break;
        case 'voice_splitter':
          this.evalVoiceSplitter(mod, musicState, results, seqLength);
          break;
        case 'register_shift':
          this.evalRegisterShift(mod, musicState, results, seqLength);
          break;
        case 'audio_preview':
          this.evalAudioPreview(mod, musicState, results, seqLength);
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

  // ---- melody_gen --------------------------------------------------------

  private evalMelodyGen(
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
    const density = this.getParamValue(mod, 'density', 0.7, musicState, audioState);
    const register: number = (mod as any).config?.register ?? (mod as any).melodyConfig?.register ?? 0;

    const pitches: number[] = [];
    const gates: number[] = [];
    const baseNote = 60; // C4

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
          // Snap to scale with some probability
          if (Math.random() > temperature * 0.3) {
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

    const rhythm = this.getParamValue(mod, 'rhythm', 0.3, musicState, audioState);
    const voicingSpread = this.getParamValue(mod, 'voicing', 0.5, musicState, audioState);
    const register: number = (mod as any).config?.register ?? (mod as any).chordGenConfig?.register ?? 0;
    const style: string = (mod as any).config?.style ?? (mod as any).chordGenConfig?.style ?? 'block';

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

  // ---- register_shift ----------------------------------------------------

  private evalRegisterShift(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as
      | MonoSequence
      | null;

    const shift: number = (mod as any).config?.shift ?? (mod as any).shiftConfig?.shift ?? 0;

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

  // ---- audio_preview -----------------------------------------------------

  private evalAudioPreview(
    mod: MusicModule,
    musicState: any,
    results: Map<string, any>,
    seqLength: number,
  ) {
    if (!mod.audioPreviewConfig?.isPlaying) return;

    const inputSeq = this.resolveInputData(mod, 'sequence', musicState, results) as MonoSequence | PolySequence | null;
    if (!inputSeq || !inputSeq.pitches) return;

    const ctx = this.getAudioContext();
    if (ctx.state !== 'running') return;

    const waveType = mod.audioPreviewConfig.waveType || 'sine';
    const beatDuration = 60 / this.qpm;
    const stepDuration = beatDuration / 4; // 16th notes
    const startTime = ctx.currentTime + 0.05;

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
          
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = waveType;
          osc.frequency.value = freq;
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.2 / notesToPlay.length, t + 0.02);
          gain.gain.setValueAtTime(0.2 / notesToPlay.length, t + stepDuration - 0.02);
          gain.gain.linearRampToValueAtTime(0, t + stepDuration);
          
          osc.start(t);
          osc.stop(t + stepDuration);
        }
      }
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
  private async generateLegacySequence(
    module: MusicModule,
    musicState: any,
    audioState: any,
  ): Promise<{ pitches: any[]; gates: any[] } | null> {
    const seqLength = 16;
    const pitches: any[] = [];
    const gates: any[] = [];

    const density = this.getParamValue(module, 'density', 0.8, musicState, audioState);

    if (module.type === 'harmonic_array') {
      const config = module.harmonicConfig;
      const root = config?.rootNote ?? 60;
      const register = config?.register ?? 0;
      const scaleType = config?.scaleType ?? 'major';
      const scale = getScaleIntervals(scaleType);

      const octaveRange = this.getParamValue(
        module,
        'octaveRange',
        config?.octaveRange ?? 2,
        musicState,
        audioState,
      );

      // Build a chord from the first 3 scale degrees (I chord)
      const chordNotes = buildChordFromDegree(scale, 0, 3);

      for (let i = 0; i < seqLength; i++) {
        if (Math.random() < density) {
          const o = Math.floor(Math.random() * octaveRange);
          const melodyNote =
            root + register + chordNotes[Math.floor(Math.random() * chordNotes.length)] + o * 12;

          pitches.push([
            melodyNote,
            root + register + chordNotes[0],
            root + register + chordNotes[1],
            root + register + chordNotes[2],
          ]);
          gates.push([1, 1, 1, 1]);
        } else {
          pitches.push([root + register, root + register, root + register, root + register]);
          gates.push([0, 0, 0, 0]);
        }
      }
      return { pitches, gates };
    }

    if (module.type === 'magenta_ai') {
      const temp = this.getParamValue(module, 'temperature', 1.0, musicState, audioState);
      const register = module.magentaConfig?.register ?? 0;
      const root = 60;

      // Use a basic major triad as internal chord reference
      const chordNotes = [0, 4, 7];

      let rawPitches: number[] = [];
      let rawGates: number[] = [];

      if (!this.rnn || !this.initialized || density < 0.1) {
        // Fallback algorithmic generation
        const scaleTones = chordNotes.map((n) => root + n);
        for (let i = 0; i < seqLength; i++) {
          if (Math.random() < density && density >= 0.1) {
            const leap = Math.random() < temp - 0.5 ? Math.floor(Math.random() * 2) : 0;
            rawPitches.push(scaleTones[Math.floor(Math.random() * scaleTones.length)] + leap * 12);
            rawGates.push(1);
          } else {
            rawPitches.push(root);
            rawGates.push(0);
          }
        }
      } else {
        const seed: INoteSequence = {
          ticksPerQuarter: 220,
          totalTime: 1.0,
          timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
          tempos: [{ time: 0, qpm: this.qpm }],
          notes: [
            {
              pitch: root + chordNotes[0],
              startTime: 0.0,
              endTime: 0.5,
              velocity: 80,
            },
          ],
        };

        const qns = sequences.quantizeNoteSequence(seed, 4);
        try {
          const result = await this.rnn.continueSequence(qns, seqLength, temp);
          const unquantized = sequences.unquantizeSequence(result, this.qpm);

          const stepTime = 60 / this.qpm / 4;
          for (let i = 0; i < seqLength; i++) {
            const stepStart = i * stepTime;
            const note = unquantized.notes?.find(
              (n) =>
                (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart,
            );

            if (note && Math.random() < density) {
              rawPitches.push(note.pitch ?? root);
              rawGates.push(1);
            } else {
              rawPitches.push(root);
              rawGates.push(0);
            }
          }
        } catch (e) {
          console.error('[MusicEngine] Generation failed:', e);
          return null;
        }
      }

      // Pack the polyphonic array (melody + chord accompaniment)
      for (let i = 0; i < seqLength; i++) {
        pitches.push([
          rawPitches[i] + register,
          root + register + chordNotes[0] - 12,
          root + register + chordNotes[1],
          root + register + chordNotes[2],
        ]);

        let chordGate = rawGates[i];
        if (i % 4 === 0 && density > 0.3) chordGate = 1;

        gates.push([rawGates[i], chordGate, chordGate, chordGate]);
      }

      return { pitches, gates };
    }

    return null;
  }
}

export const musicEngine = MusicEngine.getInstance();
