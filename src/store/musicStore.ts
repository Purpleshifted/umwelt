import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type MusicModuleType = 'harmonic_array' | 'magenta_ai';

export interface HarmonicArrayConfig {
  scaleType: 'major' | 'minor' | 'dorian' | 'altered';
  rootNote: number; // MIDI note number, e.g. 60 for C4
  octaveRange: number;
}

export interface MagentaConfig {
  temperatureMin: number;
  temperatureMax: number;
  density: number; // 0 to 1
}

export interface MusicModule {
  id: string;
  name: string;
  type: MusicModuleType;
  inputStreamId: string | null; // ID of the VirtualStream driving this module (e.g. Engagement)
  harmonicConfig?: HarmonicArrayConfig;
  magentaConfig?: MagentaConfig;
}

interface MusicState {
  modules: MusicModule[];
  addModule: (module: MusicModule) => void;
  updateModule: (id: string, updates: Partial<MusicModule>) => void;
  removeModule: (id: string) => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set) => ({
      modules: [],
      addModule: (module) =>
        set((state) => ({ modules: [...state.modules, module] })),
      updateModule: (id, updates) =>
        set((state) => ({
          modules: state.modules.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        })),
      removeModule: (id) =>
        set((state) => ({
          modules: state.modules.filter((m) => m.id !== id),
        })),
    }),
    {
      name: 'umwelt-music-storage',
    }
  )
);
