import { create } from 'zustand';

export interface SensorState {
  // Biosensor proxy values (0-1 normalized)
  ppg: number;       // Photoplethysmography — heart rate / blood volume pulse
  emg: number;       // Electromyography — muscle tension
  ecg: number;       // Electrocardiography — heart rhythm variability
  gsr: number;       // Galvanic Skin Response (EDA) — arousal/sweat
  
  // Mouse-derived spatial input (0-1 normalized)
  mouseX: number;
  mouseY: number;

  // Auto-oscillation mode
  autoMode: boolean;
  autoPhase: number; // internal phase accumulator

  // Spectral data from audio analyser (derived)
  spectralLow: number;
  spectralMid: number;
  spectralHigh: number;
  spectralBands: Float32Array | null;

  // Camera mode
  cameraMode: 'interior' | 'exterior';

  // Actions
  setPPG: (v: number) => void;
  setEMG: (v: number) => void;
  setECG: (v: number) => void;
  setGSR: (v: number) => void;
  setMousePosition: (x: number, y: number) => void;
  setAutoMode: (v: boolean) => void;
  setAutoPhase: (v: number) => void;
  setSpectralData: (low: number, mid: number, high: number, bands: Float32Array | null) => void;
  setCameraMode: (mode: 'interior' | 'exterior') => void;
}

export const useSensorStore = create<SensorState>((set) => ({
  ppg: 0.5,
  emg: 0.3,
  ecg: 0.5,
  gsr: 0.2,
  mouseX: 0.5,
  mouseY: 0.5,
  autoMode: true,
  autoPhase: 0,
  spectralLow: 0,
  spectralMid: 0,
  spectralHigh: 0,
  spectralBands: null,
  cameraMode: 'interior',

  setPPG: (v) => set({ ppg: v }),
  setEMG: (v) => set({ emg: v }),
  setECG: (v) => set({ ecg: v }),
  setGSR: (v) => set({ gsr: v }),
  setMousePosition: (x, y) => set({ mouseX: x, mouseY: y }),
  setAutoMode: (v) => set({ autoMode: v }),
  setAutoPhase: (v) => set({ autoPhase: v }),
  setSpectralData: (low, mid, high, bands) => set({ spectralLow: low, spectralMid: mid, spectralHigh: high, spectralBands: bands }),
  setCameraMode: (mode) => set({ cameraMode: mode }),
}));
