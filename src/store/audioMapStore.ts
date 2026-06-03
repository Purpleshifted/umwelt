import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SensorType = 'ppg' | 'emg' | 'ecg' | 'gsr' | 'mouseX' | 'mouseY';
export type MathOperation = 'add' | 'subtract' | 'multiply' | 'divide' | 'log' | 'exp' | 'abs' | 'normalize' | 'smooth' | 'slope' | 'curve' | 'floor' | 'clamp' | 'step' | 'inRange' | 'min' | 'max' | 'compare' | 'power' | 'sqrt' | 'interpolate' | 'moving_average' | 'envelope' | 'count' | 'bpm';
export type VirtualStreamType = 'sensor' | 'math' | 'constant' | 'out';

export interface VirtualStream {
  id: string;
  name: string;
  type: VirtualStreamType;
  
  // For 'sensor'
  sensor?: SensorType;
  
  // For 'math'
  op?: MathOperation;
  sourceA?: string;
  sourceB?: string; // Optional for unary operations like log, exp
  
  // Extra parameters for advanced CHOP-like ops
  param1?: number; // minIn, or smooth amount, or curve amount (-1 to 1)
  param2?: number; // maxIn
  param3?: number; // minOut
  param4?: number; // maxOut
  param5?: number; // extra parameter (e.g., time window for count)
  
  // For 'constant'
  constantValue?: number;

  // React Flow UI state
  position?: { x: number; y: number };
}

export interface NodeMapping {
  id: string;
  nodeId: string;
  streamId: string;
  targetSystem?: 'noisecraft' | 'macro';
  outputMin?: number;
  outputMax?: number;
}

interface AudioMapState {
  streams: VirtualStream[];
  mappings: NodeMapping[];
  history: { streams: VirtualStream[]; mappings: NodeMapping[] }[];
  historyIndex: number;
  
  // Actions
  addStream: (stream: VirtualStream) => void;
  updateStream: (id: string, updates: Partial<VirtualStream>, saveHistory?: boolean) => void;
  updateMultipleStreams: (updates: {id: string, changes: Partial<VirtualStream>}[], saveHistory?: boolean) => void;
  deleteStream: (id: string) => void;
  
  addMapping: (mapping: NodeMapping) => void;
  updateMapping: (id: string, updates: Partial<NodeMapping>) => void;
  deleteMapping: (id: string) => void;
  
  saveState: () => void;
  pushHistory: (newStreams: VirtualStream[], newMappings: NodeMapping[]) => void;
  undo: () => void;
  redo: () => void;
  loadFromJson: (jsonStr: string) => void;
  exportToJson: () => string;
}

export const useAudioMapStore = create<AudioMapState>()(
  persist(
    (set, get) => ({
      streams: [
        { id: '1', name: 'Raw PPG', type: 'sensor', sensor: 'ppg' as SensorType },
        { id: '2', name: 'Raw ECG', type: 'sensor', sensor: 'ecg' as SensorType }
  ],
  mappings: [],
  history: [{
    streams: [
      { id: '1', name: 'Raw PPG', type: 'sensor', sensor: 'ppg' as SensorType },
      { id: '2', name: 'Raw ECG', type: 'sensor', sensor: 'ecg' as SensorType }
    ],
    mappings: []
  }],
  historyIndex: 0,

  saveState: () => {}, // Deprecated, replaced by pushHistory internally

  pushHistory: (newStreams: VirtualStream[], newMappings: NodeMapping[]) => {
    const { history, historyIndex } = get();
    const currentState = { streams: JSON.parse(JSON.stringify(newStreams)), mappings: JSON.parse(JSON.stringify(newMappings)) };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(currentState);
    
    // Autosave to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('umwelt_autosave', JSON.stringify(currentState));
    }
    
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  addStream: (stream) => {
    const newStreams = [...get().streams, stream];
    set({ streams: newStreams });
    (get() as any).pushHistory(newStreams, get().mappings);
  },

  updateStream: (id, updates, saveHistory = true) => {
    const newStreams = get().streams.map(s => s.id === id ? { ...s, ...updates } : s);
    set({ streams: newStreams });
    if (saveHistory) {
      (get() as any).pushHistory(newStreams, get().mappings);
    }
  },

  updateMultipleStreams: (updates: {id: string, changes: Partial<VirtualStream>}[], saveHistory = true) => {
    const newStreams = [...get().streams];
    let changed = false;
    updates.forEach(u => {
      const idx = newStreams.findIndex(s => s.id === u.id);
      if (idx !== -1) {
        newStreams[idx] = { ...newStreams[idx], ...u.changes };
        changed = true;
      }
    });
    if (changed) {
      set({ streams: newStreams });
      if (saveHistory) {
        (get() as any).pushHistory(newStreams, get().mappings);
      }
    }
  },

  deleteStream: (id) => {
    const newStreams = get().streams.filter(s => s.id !== id);
    const newMappings = get().mappings.filter(m => m.streamId !== id);
    set({ streams: newStreams, mappings: newMappings });
    (get() as any).pushHistory(newStreams, newMappings);
  },

  addMapping: (mapping) => {
    const newMappings = [...get().mappings, mapping];
    set({ mappings: newMappings });
    (get() as any).pushHistory(get().streams, newMappings);
  },

  updateMapping: (id, updates) => {
    const newMappings = get().mappings.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ mappings: newMappings });
    (get() as any).pushHistory(get().streams, newMappings);
  },

  deleteMapping: (id) => {
    const newMappings = get().mappings.filter(m => m.id !== id);
    set({ mappings: newMappings });
    (get() as any).pushHistory(get().streams, newMappings);
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      set({ streams: JSON.parse(JSON.stringify(prev.streams)), mappings: JSON.parse(JSON.stringify(prev.mappings)), historyIndex: historyIndex - 1 });
      if (typeof window !== 'undefined') localStorage.setItem('umwelt_autosave', JSON.stringify(prev));
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      set({ streams: JSON.parse(JSON.stringify(next.streams)), mappings: JSON.parse(JSON.stringify(next.mappings)), historyIndex: historyIndex + 1 });
      if (typeof window !== 'undefined') localStorage.setItem('umwelt_autosave', JSON.stringify(next));
    }
  },

  loadFromJson: (jsonStr) => {
    try {
      const data = JSON.parse(jsonStr);
      set({ streams: data.streams || [], mappings: data.mappings || [] });
      (get() as any).pushHistory(data.streams || [], data.mappings || []);
    } catch (e) {
      console.error('Failed to load JSON', e);
    }
  },
  exportToJson: () => {
    const { streams, mappings } = get();
    return JSON.stringify({ streams, mappings }, null, 2);
  }
}), {
  name: 'umwelt-audio-map-storage',
  partialize: (state) => ({ streams: state.streams, mappings: state.mappings }),
}));

// Global persistent state for time-based operations (smooth, slope, envelope, moving_average, count)
const persistentStreamState = new Map<string, { lastVal: number; lastTime: number; history?: number[]; count?: number; triggerHistory?: { time: number; step: number }[] }>();

export function evaluateStreamValue(streamId: string, streams: VirtualStream[], sensorValues: Record<string, number>, cache = new Map<string, number>()): number {
  if (cache.has(streamId)) return cache.get(streamId)!;
  
  const stream = streams.find(s => s.id === streamId);
  if (!stream) return 0;
  
  if (stream.type === 'constant') {
    return stream.constantValue || 0;
  }
  
  if (stream.type === 'out') {
    if (!stream.sourceA) return 0;
    const val = evaluateStreamValue(stream.sourceA, streams, sensorValues, cache);
    cache.set(streamId, val);
    return val;
  }
  
  if (stream.type === 'sensor' && stream.sensor) {
    const val = sensorValues[stream.sensor] || 0;
    cache.set(streamId, val);
    return val;
  }
  
  if (stream.type === 'math' && stream.op && stream.sourceA) {
    const valA = evaluateStreamValue(stream.sourceA, streams, sensorValues, cache);
    
    // Unary operations
    if (stream.op === 'curve') {
      const slider = stream.param1 ?? 0; // -1 to 1
      const gamma = Math.pow(10, slider);
      const sign = valA < 0 ? -1 : 1;
      // Use absolute value to avoid NaN when base is negative, preserve sign
      const result = sign * Math.pow(Math.abs(valA), gamma);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'power') {
      const exponent = stream.param1 ?? 2;
      const result = (valA < 0 ? -1 : 1) * Math.pow(Math.abs(valA), exponent);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'sqrt') {
      const result = (valA < 0 ? -1 : 1) * Math.sqrt(Math.abs(valA));
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'log') {
      const result = valA > 0 ? Math.log(valA) : 0;
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'exp') {
      const result = Math.exp(valA);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'abs') {
      const result = Math.abs(valA);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'floor') {
      const result = Math.floor(valA);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'clamp') {
      const min = stream.param1 ?? 0;
      const max = stream.param2 ?? 1;
      const result = Math.max(min, Math.min(max, valA));
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'step') {
      const threshold = stream.param1 ?? 0.5;
      const result = valA > threshold ? 1 : 0;
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'inRange') {
      const min = stream.param1 ?? 0.4;
      const max = stream.param2 ?? 0.6;
      const result = (valA >= min && valA <= max) ? 1 : 0;
      cache.set(streamId, result);
      return result;
    }

    // Binary operations (can fallback to param values if B is missing for some ops)
    if (stream.op === 'interpolate') {
      const valB = stream.sourceB ? evaluateStreamValue(stream.sourceB, streams, sensorValues, cache) : 0;
      const mix = Math.max(0, Math.min(1, stream.param1 ?? 0.5));
      const result = valA * (1 - mix) + valB * mix;
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'min') {
      const valB = stream.sourceB ? evaluateStreamValue(stream.sourceB, streams, sensorValues, cache) : (stream.param1 ?? 0);
      const result = Math.min(valA, valB);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'max') {
      const valB = stream.sourceB ? evaluateStreamValue(stream.sourceB, streams, sensorValues, cache) : (stream.param1 ?? 0);
      const result = Math.max(valA, valB);
      cache.set(streamId, result);
      return result;
    }
    if (stream.op === 'compare') {
      const valB = stream.sourceB ? evaluateStreamValue(stream.sourceB, streams, sensorValues, cache) : (stream.param2 ?? 0);
      const compOp = stream.param1 ?? 0;
      let result = 0;
      if (compOp === 0) result = valA > valB ? 1 : 0;
      else if (compOp === 1) result = valA < valB ? 1 : 0;
      else if (compOp === 2) result = valA >= valB ? 1 : 0;
      else if (compOp === 3) result = valA <= valB ? 1 : 0;
      else if (compOp === 4) result = valA === valB ? 1 : 0;
      cache.set(streamId, result);
      return result;
    }
    
    // Normalize (Range Map)
    if (stream.op === 'normalize') {
      const minIn = stream.param1 ?? 0;
      const maxIn = stream.param2 ?? 1;
      const minOut = stream.param3 ?? 0;
      const maxOut = stream.param4 ?? 1;
      const t = (valA - minIn) / (maxIn - minIn || 1);
      const result = minOut + t * (maxOut - minOut);
      cache.set(streamId, result);
      return result;
    }
    
    // Time-based smoothing operations
    if (stream.op === 'moving_average') {
      const windowSize = Math.max(1, Math.min(300, stream.param1 ?? 30));
      const state = persistentStreamState.get(streamId) || { lastVal: valA, lastTime: performance.now(), history: [] };
      const history = state.history || [];
      history.push(valA);
      if (history.length > windowSize) {
        history.shift();
      }
      const sum = history.reduce((a, b) => a + b, 0);
      const avg = sum / history.length;
      persistentStreamState.set(streamId, { ...state, history, lastVal: avg });
      cache.set(streamId, avg);
      return avg;
    }
    
    if (stream.op === 'envelope') {
      const decay = stream.param1 ?? 0.05; // 0 to 1
      const state = persistentStreamState.get(streamId) || { lastVal: Math.abs(valA), lastTime: performance.now() };
      
      const absVal = Math.abs(valA);
      let newEnvelope = state.lastVal;
      if (absVal >= state.lastVal) {
        newEnvelope = absVal; // instant attack
      } else {
        newEnvelope = state.lastVal - (state.lastVal - absVal) * decay;
      }
      persistentStreamState.set(streamId, { ...state, lastVal: newEnvelope });
      cache.set(streamId, newEnvelope);
      return newEnvelope;
    }

    if (stream.op === 'smooth') {
      const slider = Math.max(0, Math.min(1, stream.param1 ?? 0.5)); // 0 to 1
      // Non-linear mapping: slider 0 = amt 0 (fast), slider 1 = amt 0.999 (slow)
      const amount = 1 - Math.pow(10, -(slider * 3));
      const state = persistentStreamState.get(streamId) || { lastVal: valA, lastTime: performance.now() };
      
      const smoothed = state.lastVal * amount + valA * (1 - amount);
      persistentStreamState.set(streamId, { ...state, lastVal: smoothed });
      cache.set(streamId, smoothed);
      return smoothed;
    }
    
    // Slope (Derivative)
    if (stream.op === 'slope') {
      const state = persistentStreamState.get(streamId);
      const now = performance.now();
      let slope = 0;
      if (state) {
        const dt = Math.max(0.001, (now - state.lastTime) / 1000); // seconds
        slope = (valA - state.lastVal) / dt;
      }
      persistentStreamState.set(streamId, { lastVal: valA, lastTime: now });
      cache.set(streamId, slope);
      return slope;
    }
    
    // Count
    if (stream.op === 'count') {
      const threshold = stream.param1 ?? 0.5;
      const limit = stream.param2 ?? 0; // 0 means no limit
      const step = stream.param3 ?? 1;
      const condition = stream.param4 ?? 0; // 0 = Off to On (Cross Up), 1 = On to Off (Cross Down), 2 = Both
      const timeWindow = stream.param5 ?? 0; // 0 means infinite, otherwise window in ms

      const now = performance.now();
      const state = persistentStreamState.get(streamId) || { lastVal: valA, lastTime: now, count: 0, triggerHistory: [] };
      let currentCount = state.count ?? 0;
      let triggerHistory = state.triggerHistory || [];

      let triggered = false;
      if (condition === 0 || condition === 2) {
        if (state.lastVal <= threshold && valA > threshold) triggered = true;
      }
      if (condition === 1 || condition === 2) {
        if (state.lastVal >= threshold && valA < threshold) triggered = true;
      }

      if (triggered) {
        if (timeWindow > 0) {
          triggerHistory.push({ time: now, step });
        } else {
          currentCount += step;
          if (limit > 0 && currentCount >= limit) {
            currentCount = 0; // Reset or wrap around
          }
        }
      }

      if (timeWindow > 0) {
        // Filter history to only include events within the time window
        triggerHistory = triggerHistory.filter(t => now - t.time <= timeWindow);
        // Calculate count from history
        currentCount = triggerHistory.reduce((sum, t) => sum + t.step, 0);
        if (limit > 0 && currentCount >= limit) {
          currentCount = currentCount % limit; // Basic modulo for time-based count limit if requested
        }
      }

      persistentStreamState.set(streamId, { ...state, lastVal: valA, count: currentCount, triggerHistory });
      cache.set(streamId, currentCount);
      return currentCount;
    }

    // BPM (Beats Per Minute) Calculation
    if (stream.op === 'bpm') {
      const threshold = stream.param1 ?? 0.5;
      const condition = stream.param2 ?? 0; // 0 = Off to On, 1 = On to Off, 2 = Both
      const windowSize = Math.max(1, Math.min(20, stream.param3 ?? 4)); // How many beats to average
      const maxDecayTime = stream.param4 ?? 3000; // ms before BPM decays to 0

      const now = performance.now();
      const state = persistentStreamState.get(streamId) || { lastVal: valA, lastTime: now, count: 0, history: [] };
      let bpm = state.count ?? 0; // we reuse 'count' to store the last valid BPM
      let beatHistory = state.history || []; // we reuse 'history' to store delta times

      let triggered = false;
      if (condition === 0 || condition === 2) {
        if (state.lastVal <= threshold && valA > threshold) triggered = true;
      }
      if (condition === 1 || condition === 2) {
        if (state.lastVal >= threshold && valA < threshold) triggered = true;
      }

      if (triggered) {
        const dt = now - state.lastTime;
        // Ignore physically impossible heart rates (e.g. over 300 BPM = < 200ms)
        if (dt > 200) {
          const currentBPM = 60000 / dt;
          beatHistory.push(currentBPM);
          if (beatHistory.length > windowSize) {
            beatHistory.shift();
          }
          bpm = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;
          persistentStreamState.set(streamId, { ...state, lastVal: valA, lastTime: now, count: bpm, history: beatHistory });
        } else {
          // Just update lastVal but don't count as a beat
          persistentStreamState.set(streamId, { ...state, lastVal: valA });
        }
      } else {
        // Decay to 0 if no beat is detected for maxDecayTime
        const timeSinceLastBeat = now - state.lastTime;
        if (timeSinceLastBeat > maxDecayTime) {
          bpm = 0;
          beatHistory = [];
        } else if (timeSinceLastBeat > 2000) {
          // Soft decay starts after 2 seconds
          bpm = bpm * 0.99;
        }
        persistentStreamState.set(streamId, { ...state, lastVal: valA, count: bpm, history: beatHistory });
      }

      cache.set(streamId, bpm);
      return bpm;
    }
    
    // Binary operations
    if (stream.sourceB) {
      const valB = evaluateStreamValue(stream.sourceB, streams, sensorValues, cache);
      let result = 0;
      switch(stream.op) {
        case 'add': result = valA + valB; break;
        case 'subtract': result = valA - valB; break;
        case 'multiply': result = valA * valB; break;
        case 'divide': result = valB !== 0 ? valA / valB : 0; break;
      }
      cache.set(streamId, result);
      return result;
    }
  }
  
  return 0;
}
