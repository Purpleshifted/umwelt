import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Edge } from '@xyflow/react';

export type MusicModuleType = 'harmonic_array' | 'magenta_ai' | 'noise' | 'sine' | 'virtual_stream' | 'slider' | 'knob' | 'module_output' | 'chord_progression' | 'melody_gen' | 'chord_gen' | 'voice_splitter' | 'register_shift' | 'audio_preview';

export interface HarmonicArrayConfig {
  scaleType: 'major' | 'minor' | 'dorian' | 'altered';
  rootNote: number; // MIDI note number, e.g. 60 for C4
  octaveRange: number;
  register?: number; // 0 for default, -12 for Tenor, -24 for Bass, +12 for Soprano
}

export interface MagentaConfig {
  temperatureMin: number;
  temperatureMax: number;
  density: number; // 0 to 1
  register?: number;
}

export interface SineConfig {
  frequency: number;
}

export interface NoiseConfig {
  speed: number;
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

export interface MelodyGenConfig {
  register: number; // -24 to +12
}

export interface ChordGenConfig {
  register: number;
  style: 'block' | 'arpeggio' | 'broken';
}

export interface VoiceSplitterConfig {
  // no config needed, purely transformational
}

export interface RegisterShiftConfig {
  shift: number; // semitones, e.g. -12 for one octave down
}

export interface AudioPreviewConfig {
  isPlaying: boolean;
  waveType: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

export interface MusicModule {
  id: string;
  name: string;
  type: MusicModuleType;
  inputStreamId: string | null; // ID of the VirtualStream for 'virtual_stream' node type
  harmonicConfig?: HarmonicArrayConfig;
  magentaConfig?: MagentaConfig;
  sineConfig?: SineConfig;
  noiseConfig?: NoiseConfig;
  sliderConfig?: SliderConfig;
  knobConfig?: KnobConfig;
  chordProgressionConfig?: ChordProgressionConfig;
  melodyGenConfig?: MelodyGenConfig;
  chordGenConfig?: ChordGenConfig;
  voiceSplitterConfig?: VoiceSplitterConfig;
  registerShiftConfig?: RegisterShiftConfig;
  audioPreviewConfig?: AudioPreviewConfig;
  position?: { x: number; y: number };
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
