import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Edge } from '@xyflow/react';

export type MusicModuleType = 'noise' | 'sine' | 'virtual_stream' | 'slider' | 'knob' | 'module_output' | 'chord_progression' | 'harmonic_progressor' | 'melody_gen' | 'chord_gen' | 'voice_splitter' | 'sequence_adder' | 'register_shifter' | 'sequence_morpher' | 'piano_genie' | 'coconet_harmonizer' | 'score_out' | 'ai_seq_out' | 'seq_out' | 'virtual_instrument' | 'track_out' | 'polysynth' | 'oscillator' | 'adsr_envelope' | 'filter' | 'reverb' | 'mix_node' | 'seq_to_freq' | 'preview_util';


export interface SineConfig {
  frequency: number;
}

export interface NoiseConfig {
  speed: number;
}

export interface PreviewUtilConfig {
  playing: boolean;
}

export interface SliderConfig {
  value: number;
  min: number;
  max: number;
}

export interface KnobConfig {
  value: number;
  min: number;
  max: number;
}

export interface ChordProgressionConfig {
  mode: 'major' | 'minor' | 'dorian' | 'mixolydian';
}

export interface HarmonicProgressorConfig {
  valence: number; // 0.0 to 1.0 (Negative to Positive)
  arousal: number; // 0.0 to 1.0 (Calm to Energetic)
  currentCategoryName?: string;
}

export interface MelodyGenConfig {
  register: number; // e.g., 0 for mid, -1 for bass, +1 for treble
  rhythmicComplexity: number; // 0.0 to 1.0
  swingAmount: number; // 0.0 to 1.0
  algorithm: 'procedural' | 'magenta';
}

export interface ChordGenConfig {
  register: number;
  style: 'block' | 'arpeggio' | 'broken';
}

export interface VoiceSplitterConfig {
  // no config needed, purely transformational
}

export interface SequenceAdderConfig {
  // no config needed, purely transformational
}

export interface RegisterShifterConfig {
  semitones: number; // -24 to +24
}

export interface AudioPreviewConfig {
  isPlaying: boolean;
  waveType: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

export interface SequenceMorpherConfig {
  morphAmount: number; // 0.0 to 1.0
}

export interface ScoreOutConfig {
  channel?: string; // 'A', 'B', 'C', etc.
  instrument?: 'synth' | 'piano' | 'marimba';
  isPlaying?: boolean;
}

export interface VirtualInstrumentConfig {
  instrument: string; // e.g. 'acoustic_grand_piano', 'synth_bass_1'
  volume: number; // 0.0 to 1.0
}

export interface SeqOutConfig {
  channel: string;
}

export interface AiSeqOutConfig {
  masterClockEnabled: boolean;
}

export interface TrackOutConfig {
  trackName: string;
}

export interface PolysynthConfig {
  volume?: number;
  oscillatorType: 'sine' | 'square' | 'triangle' | 'sawtooth';
  oscillatorCategory?: 'basic' | 'fat' | 'fm' | 'am';
  partialsCount?: number;
  fatCount?: number;
  fatSpread?: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface OscillatorConfig {
  volume?: number;
  type: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pinknoise' | 'whitenoise';
  oscillatorCategory?: 'basic' | 'fat' | 'fm' | 'am';
  partialsCount?: number;
  fatCount?: number;
  fatSpread?: number;
}

export interface AdsrEnvelopeConfig {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface FilterConfig {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
  frequency: number;
  Q: number;
}

export interface ReverbConfig {
  decay: number;
  preDelay: number;
  wet: number;
}

export interface MixNodeConfig {
  volA: number; // 0.0 to 1.0
  volB: number; // 0.0 to 1.0
}

export interface MusicModule {
  id: string;
  name: string;
  type: MusicModuleType;
  inputStreamId: string | null; // ID of the VirtualStream for 'virtual_stream' node type
  sineConfig?: SineConfig;
  noiseConfig?: NoiseConfig;
  sliderConfig?: SliderConfig;
  knobConfig?: KnobConfig;
  chordProgressionConfig?: ChordProgressionConfig;
  harmonicProgressorConfig?: HarmonicProgressorConfig;
  melodyGenConfig?: MelodyGenConfig;
  chordGenConfig?: ChordGenConfig;
  voiceSplitterConfig?: VoiceSplitterConfig;
  sequenceAdderConfig?: SequenceAdderConfig;
  registerShifterConfig?: RegisterShifterConfig;
  sequenceMorpherConfig?: SequenceMorpherConfig;
  seqOutConfig?: SeqOutConfig;
  audioPreviewConfig?: AudioPreviewConfig;
  scoreOutConfig?: ScoreOutConfig;
  aiSeqOutConfig?: AiSeqOutConfig;
  virtualInstrumentConfig?: VirtualInstrumentConfig;
  trackOutConfig?: TrackOutConfig;
  polysynthConfig?: PolysynthConfig;
  oscillatorConfig?: OscillatorConfig;
  adsrEnvelopeConfig?: AdsrEnvelopeConfig;
  filterConfig?: FilterConfig;
  reverbConfig?: ReverbConfig;
  previewUtilConfig?: PreviewUtilConfig;
  mixNodeConfig?: any;
  position: { x: number; y: number };
  pianoGenieConfig?: {};
  coconetHarmonizerConfig?: {};
  aiCacheKey?: string;
  aiCacheResult?: any;
}

interface MusicState {
  modules: MusicModule[];
  edges: Edge[];
  nodeOutputs: Record<string, any>; // Stores the latest evaluation results from MusicEngine
  addModule: (module: MusicModule) => void;
  updateModule: (id: string, updates: Partial<MusicModule>) => void;
  updateMultipleModules: (updates: {id: string, changes: Partial<MusicModule>}[]) => void;
  removeModule: (id: string) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setNodeOutputs: (outputs: Record<string, any>) => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set) => ({
      modules: [],
      edges: [],
      nodeOutputs: {},
      addModule: (module) =>
        set((state) => ({ modules: [...state.modules, module] })),
      updateModule: (id, updates) =>
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      updateMultipleModules: (updates) =>
        set((state) => {
          const updateMap = new Map(updates.map(u => [u.id, u.changes]));
          return {
            modules: state.modules.map(m => 
              updateMap.has(m.id) ? { ...m, ...updateMap.get(m.id) } : m
            )
          };
        }),
      removeModule: (id) =>
        set((state) => ({
          modules: state.modules.filter((m) => m.id !== id),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        })),
      setEdges: (edgesOrUpdater) =>
        set((state) => ({
          edges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.edges) : edgesOrUpdater
        })),
      setNodeOutputs: (outputs) => set({ nodeOutputs: outputs }),
    }),
    {
      name: 'umwelt-music-storage',
    }
  )
);
