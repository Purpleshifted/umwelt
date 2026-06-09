import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Edge } from '@xyflow/react';

export type MusicModuleType = 'noise' | 'sine' | 'virtual_stream' | 'slider' | 'knob' | 'module_output' | 'chord_progression' | 'harmonic_progressor' | 'melody_gen' | 'chord_gen' | 'voice_splitter' | 'sequence_adder' | 'register_shifter' | 'sequence_morpher' | 'piano_genie' | 'coconet_harmonizer' | 'score_out' | 'ai_seq_out' | 'seq_out' | 'virtual_instrument' | 'track_out' | 'player_out' | 'polysynth' | 'oscillator' | 'adsr_envelope' | 'filter' | 'reverb' | 'mix_node' | 'seq_to_freq' | 'preview_util' | 'universal_preview' | 'lfo' | 'section_box' | 'trigger_node' | 'player_node' | 'out_node' | 'broadcast_node' | 'global_ui_out' | 'null_node' | 'pedal_fx' | 'math_node' | 'effect_chain';

export interface LFOConfig {
  rate: number; // Hz, e.g., 0.1 to 20
  waveform: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

export interface TriggerConfig {
  mode: 'pulse' | 'toggle' | 'broadcasted';
  pitch: number; // default 69 (A4 = 440Hz)
  isDown?: boolean; // For tracking the current state visually
  threshold?: number; // For broadcasted mode
}

export interface OutConfig {
  muted: boolean;
}

export interface BroadcastConfig {
  channel: string;
}

export interface SineConfig {
  frequency: number;
}

export interface NoiseConfig {
  speed: number;
}

export interface PreviewUtilConfig {
  playing: boolean;
}

export interface UniversalPreviewConfig {
  playing: boolean;
  activeType: 'audio' | 'sequence' | 'control' | null;
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
  useAiHarmony?: boolean;
  /** 'idle' | 'loading' | 'active' | 'error' */
  aiHarmonyStatus?: string;
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
  volume?: number;
}

export interface PlayerOutConfig {
  isPlaying: boolean;
  trackName: string;
  volume?: number;
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
  waveforms?: Array<{ type: string; gain: number }>;
}

export interface OscillatorConfig {
  volume?: number;
  type: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'pinknoise' | 'whitenoise';
  oscillatorCategory?: 'basic' | 'fat' | 'fm' | 'am';
  partialsCount?: number;
  fatCount?: number;
  fatSpread?: number;
  frequency?: number;
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

export interface PedalFxConfig {
  effectType: 'reverb' | 'delay' | 'distortion' | 'chorus';
  mix: number;
  param1: number; // e.g. decay for reverb, time for delay, distortion amount
  param2: number; // e.g. preDelay for reverb, feedback for delay
}

export interface EffectChainConfig {
  effects: Array<{
    id: string; // Unique ID for reordering tracking
    type: 'reverb' | 'delay' | 'distortion' | 'chorus';
    enabled?: boolean;
    mix: number;
    param1: number; // decay, time, distortion amount, freq
    param2: number; // preDelay, feedback, depth
  }>;
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
  playerOutConfig?: PlayerOutConfig;
  polysynthConfig?: PolysynthConfig;
  oscillatorConfig?: OscillatorConfig;
  adsrEnvelopeConfig?: AdsrEnvelopeConfig;
  filterConfig?: FilterConfig;
  reverbConfig?: ReverbConfig;
  pedalFxConfig?: PedalFxConfig;
  effectChainConfig?: EffectChainConfig;
  previewUtilConfig?: PreviewUtilConfig;
  universalPreviewConfig?: UniversalPreviewConfig;
  mixNodeConfig?: MixNodeConfig;
  lfoConfig?: LFOConfig;
  triggerConfig?: TriggerConfig;
  outConfig?: OutConfig;
  broadcastConfig?: BroadcastConfig;
  sectionBoxConfig?: { width: number; height: number };
  position: { x: number; y: number };
  parentId?: string;
  pianoGenieConfig?: {};
  coconetHarmonizerConfig?: {};
  aiCacheKey?: string;
  aiCacheResult?: any;
}

interface MusicState {
  modules: MusicModule[];
  edges: Edge[];
  bpm: number;
  nodeOutputs: Record<string, any>; // Stores the latest evaluation results from MusicEngine
  addModule: (module: MusicModule) => void;
  updateModule: (id: string, updates: Partial<MusicModule>) => void;
  updateMultipleModules: (updates: {id: string, changes: Partial<MusicModule>}[]) => void;
  removeModule: (id: string) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
  setNodeOutputs: (outputs: Record<string, any>) => void;
  setBpm: (bpm: number) => void;
  getExposedUINodes: () => { sectionName: string; sectionId: string; modules: MusicModule[] }[];
}

import defaultMusicLibraryState from '@/constants/music_library_state.json';

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      modules: defaultMusicLibraryState.state.modules as any[],
      edges: defaultMusicLibraryState.state.edges as any[],
      bpm: 120,
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
          modules: state.modules.filter((m) => m.id !== id).map(m => m.parentId === id ? { ...m, parentId: undefined } : m),
          edges: state.edges.filter((e) => e.source !== id && e.target !== id),
        })),
      setEdges: (edgesOrUpdater) =>
        set((state) => ({
          edges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.edges) : edgesOrUpdater
        })),
      setNodeOutputs: (outputs) => set({ nodeOutputs: outputs }),
      setBpm: (bpm) => set({ bpm }),
      getExposedUINodes: () => {
        const state = get();
        type Group = { sectionName: string; sectionId: string; modules: MusicModule[] };
        
        const configurableTypes = new Set(['slider', 'knob', 'melody_gen', 'chord_gen',
          'harmonic_progressor', 'register_shifter', 'voice_splitter', 'sequence_adder',
          'ai_seq_out', 'seq_out', 'score_out']);
        
        // All section boxes
        const allBoxes = state.modules.filter(m => m.type === 'section_box');
        const boxMap = new Map<string, MusicModule[]>();
        allBoxes.forEach(box => boxMap.set(box.id, []));
        
        const configModules = state.modules.filter(m => configurableTypes.has(m.type));
        const ungrouped: MusicModule[] = [];
        
        
        
        for (const mod of configModules) {
          if (mod.parentId && boxMap.has(mod.parentId)) {
            boxMap.get(mod.parentId)!.push(mod);
          } else {
            ungrouped.push(mod);
          }
        }
        
        const groups: Group[] = [];
        for (const box of allBoxes) {
          const kids = boxMap.get(box.id) || [];
          if (kids.length > 0) {
            groups.push({ sectionName: box.name || 'Section', sectionId: box.id, modules: kids });
          }
        }
        if (ungrouped.length > 0) {
          groups.push({ sectionName: 'Other', sectionId: '__ungrouped__', modules: ungrouped });
        }
        
        return groups;
      },
    }),
    {
      name: 'umwelt-music-storage',
      version: 2,
      partialize: (state) => Object.fromEntries(
        Object.entries(state).filter(([key]) => !['nodeOutputs'].includes(key))
      ),
    }
  )
);
