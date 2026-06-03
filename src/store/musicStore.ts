import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Edge } from '@xyflow/react';

export type MusicModuleType = 'harmonic_array' | 'magenta_ai' | 'input' | 'output';

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
  position?: { x: number; y: number };
}

interface MusicState {
  modules: MusicModule[];
  edges: Edge[];
  addModule: (module: MusicModule) => void;
  updateModule: (id: string, updates: Partial<MusicModule>) => void;
  updateMultipleModules: (updates: {id: string, changes: Partial<MusicModule>}[]) => void;
  removeModule: (id: string) => void;
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set) => ({
      modules: [],
      edges: [],
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
        })),
      setEdges: (edgesOrUpdater) =>
        set((state) => ({
          edges: typeof edgesOrUpdater === 'function' ? edgesOrUpdater(state.edges) : edgesOrUpdater
        })),
    }),
    {
      name: 'umwelt-music-storage',
    }
  )
);
