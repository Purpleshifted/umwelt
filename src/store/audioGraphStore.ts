import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Audio Node Type Registry ───
export type AudioNodeType =
  | 'noisecraft_source'
  | 'gain'
  | 'biquad_filter'
  | 'delay'
  | 'convolver_reverb'
  | 'hrtf_panner'
  | 'stereo_panner'
  | 'analyser'
  | 'virtual_instrument'
  | 'vst_instrument'
  | 'score_in'
  | 'track_in'
  | 'destination';

export interface AudioGraphNode {
  id: string;
  type: AudioNodeType;
  label: string;
  // Per-type parameters
  params: Record<string, number | string | boolean>;
  // React Flow position
  position: { x: number; y: number };
}

export interface AudioGraphEdge {
  id: string;
  source: string;       // source node id
  sourceHandle: string;  // output handle id
  target: string;        // target node id
  targetHandle: string;  // input handle id
}

interface AudioGraphState {
  nodes: AudioGraphNode[];
  edges: AudioGraphEdge[];
  // The shared AudioContext
  audioContext: AudioContext | null;
  // Map from graph node id → real Web Audio node(s)
  liveNodes: Map<string, AudioNode>;
  // Map from noisecraft source node id → MediaStream
  noisecraftStreams: Map<string, MediaStream>;
  noisecraftWindows: Map<string, Window>;

  // Actions
  initAudioContext: () => AudioContext;
  addNode: (node: AudioGraphNode) => void;
  updateNodeParams: (id: string, params: Record<string, number | string | boolean>) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: AudioGraphEdge) => void;
  removeEdge: (id: string) => void;
  setNodes: (nodes: AudioGraphNode[]) => void;
  setEdges: (edges: AudioGraphEdge[]) => void;
  registerNoisecraftStream: (nodeId: string, stream: MediaStream) => void;
  registerNoisecraftWindow: (nodeId: string, contentWindow: Window) => void;
  
  // Audio graph rebuild
  rebuildAudioGraph: () => void;
  
  history: { nodes: AudioGraphNode[]; edges: AudioGraphEdge[] }[];
  historyIndex: number;
  undo: () => void;
  redo: () => void;
  saveState: () => void;
}

export const trackBuses = new Map<string, GainNode>();

export const getTrackBus = (ctx: AudioContext, trackName: string) => {
  if (!trackBuses.has(trackName)) {
    const bus = ctx.createGain();
    bus.gain.value = 1.0;
    trackBuses.set(trackName, bus);
  }
  return trackBuses.get(trackName)!;
};

// Default parameters per node type
export const DEFAULT_PARAMS: Record<AudioNodeType, Record<string, number | string | boolean>> = {
  noisecraft_source: { patchFile: 'nc_noise_patch.ncft', gain: 1.0 },
  score_in: { channel: 'A' },
  track_in: { channel: 'A' },
  gain: { gain: 1.0 },
  biquad_filter: { type: 'lowpass', frequency: 1000, Q: 1, gain: 0 },
  delay: { delayTime: 0.3, feedback: 0.4, wet: 0.5 },
  convolver_reverb: { wet: 0.5, dry: 0.5 },
  hrtf_panner: { positionX: 0, positionY: 0, positionZ: -1, refDistance: 1, rolloff: 1 },
  stereo_panner: { pan: 0 },
  analyser: { fftSize: 256, smoothing: 0.8 },
  virtual_instrument: { channel: 'A', instrument: 'synth', gain: 0.5 },
  vst_instrument: { instrument: 'synth', gain: 0.5 },
  destination: {},
};

export const NODE_LABELS: Record<AudioNodeType, string> = {
  noisecraft_source: 'NoiseCraft',
  gain: 'Gain',
  biquad_filter: 'Filter',
  delay: 'Delay',
  convolver_reverb: 'Reverb',
  hrtf_panner: 'HRTF Panner',
  stereo_panner: 'Stereo Pan',
  analyser: 'Analyser',
  virtual_instrument: 'Virtual Instrument (Legacy)',
  vst_instrument: 'VST Instrument',
  score_in: 'Score In',
  track_in: 'Track In',
  destination: 'Speaker Out',
};

import defaultAudioEditorState from '@/constants/audio_editor_state.json';

const DEFAULT_NODES: AudioGraphNode[] = defaultAudioEditorState.state.nodes as AudioGraphNode[];
const DEFAULT_EDGES = defaultAudioEditorState.state.edges as any[];

export const useAudioGraphStore = create<AudioGraphState>()(
  persist(
    (set, get) => ({
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
  audioContext: null,
  liveNodes: new Map(),
  noisecraftStreams: new Map(),
  noisecraftWindows: new Map(),

  history: [{ nodes: DEFAULT_NODES, edges: DEFAULT_EDGES }],
  historyIndex: 0,

  saveState: () => set((state) => {
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push({
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges))
    });
    // Keep last 50 states
    if (newHistory.length > 50) newHistory.shift();
    return {
      history: newHistory,
      historyIndex: newHistory.length - 1
    };
  }),

  undo: () => set((state) => {
    if (state.historyIndex > 0) {
      const newIndex = state.historyIndex - 1;
      const pastState = state.history[newIndex];
      return {
        nodes: JSON.parse(JSON.stringify(pastState.nodes)),
        edges: JSON.parse(JSON.stringify(pastState.edges)),
        historyIndex: newIndex
      };
    }
    return state;
  }),

  redo: () => set((state) => {
    if (state.historyIndex < state.history.length - 1) {
      const newIndex = state.historyIndex + 1;
      const futureState = state.history[newIndex];
      return {
        nodes: JSON.parse(JSON.stringify(futureState.nodes)),
        edges: JSON.parse(JSON.stringify(futureState.edges)),
        historyIndex: newIndex
      };
    }
    return state;
  }),

  initAudioContext: () => {
    let ctx = get().audioContext;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext();
      set({ audioContext: ctx });
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  },

  addNode: (node) => {
    set((s) => ({ nodes: [...s.nodes, node] }));
    get().saveState();
  },

  updateNodeParams: (id, params) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, params: { ...n.params, ...params } as Record<string, number | string | boolean> } : n
      ),
    })),

  updateNodePosition: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
    })),

  removeNode: (id) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    get().saveState();
  },

  addEdge: (edge) => {
    set((s) => ({ edges: [...s.edges, edge] }));
    get().saveState();
  },

  removeEdge: (id) => {
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) }));
    get().saveState();
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  registerNoisecraftStream: (nodeId, stream) => {
    set((s) => {
      const newMap = new Map(s.noisecraftStreams);
      newMap.set(nodeId, stream);
      return { noisecraftStreams: newMap };
    });
    // Trigger rebuild so the new stream gets wired up
    get().rebuildAudioGraph();
  },

  registerNoisecraftWindow: (nodeId, contentWindow) => {
    set((s) => {
      const newMap = new Map(s.noisecraftWindows);
      newMap.set(nodeId, contentWindow);
      return { noisecraftWindows: newMap };
    });
  },

  rebuildAudioGraph: () => {
    const { audioContext, nodes, edges, liveNodes, noisecraftStreams } = get();
    if (!audioContext) return;

    // 1. Disconnect all existing live nodes
    liveNodes.forEach((node) => {
      try { node.disconnect(); } catch { /* ignore */ }
    });
    const newLiveNodes = new Map<string, AudioNode>();

    // 2. Create Web Audio nodes for each graph node
    for (const gNode of nodes) {
      let audioNode: AudioNode | null = null;

      switch (gNode.type) {
        case 'noisecraft_source': {
          const stream = noisecraftStreams.get(gNode.id);
          if (stream) {
            const srcNode = audioContext.createMediaStreamSource(stream);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = (gNode.params.gain as number) ?? 1.0;
            srcNode.connect(gainNode);
            audioNode = gainNode;
            // Also store the srcNode so we can disconnect it later
            newLiveNodes.set(gNode.id + '_src', srcNode);
          }
          break;
        }

        case 'virtual_instrument': {
          const gain = audioContext.createGain();
          gain.gain.value = (gNode.params.gain as number) ?? 0.5;
          audioNode = gain;
          break;
        }
        case 'vst_instrument': {
          const gain = audioContext.createGain();
          gain.gain.value = (gNode.params.gain as number) ?? 0.5;
          audioNode = gain;
          
          // Setup Tone.js Synth globally so MusicEngine can use it
          if (typeof window !== 'undefined') {
            import('tone').then((Tone) => {
              Tone.setContext(audioContext);
              const w = window as any;
              if (!w.__toneSynths) w.__toneSynths = new Map();
              
              // Cleanup old synth if exists
              if (w.__toneSynths.has(gNode.id)) {
                w.__toneSynths.get(gNode.id).dispose();
              }
              
              let synth: any;
              const instr = gNode.params.instrument || 'synth';
              if (instr === 'piano') {
                synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' } });
              } else if (instr === 'marimba') {
                synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { decay: 0.5, sustain: 0, release: 0.1 } });
              } else {
                synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' } });
              }
              
              synth.connect(audioContext.destination); // Fallback
              // Since Tone.js uses its own AudioContext wrapper, connecting it directly to a Web Audio native GainNode is possible by connecting to its native node
              Tone.connect(synth, gain);
              
              w.__toneSynths.set(gNode.id, synth);
            });
          }
          break;
        }
        case 'track_in': {
          // Receives audio from MusicLibrary track_out nodes via global track buses
          const trackName = (gNode.params.channel as string) || 'Track 1';
          const bus = getTrackBus(audioContext, trackName);
          
          const gain = audioContext.createGain();
          gain.gain.value = (gNode.params.gain as number) ?? 1.0;
          
          bus.connect(gain);
          
          audioNode = gain;
          newLiveNodes.set(gNode.id + '_trackin', gain);
          break;
        }
        case 'gain': {
          const gain = audioContext.createGain();
          gain.gain.value = (gNode.params.gain as number) ?? 1.0;
          audioNode = gain;
          break;
        }
        case 'biquad_filter': {
          const filter = audioContext.createBiquadFilter();
          filter.type = (gNode.params.type as BiquadFilterType) || 'lowpass';
          filter.frequency.value = (gNode.params.frequency as number) || 1000;
          filter.Q.value = (gNode.params.Q as number) || 1;
          filter.gain.value = (gNode.params.gain as number) || 0;
          audioNode = filter;
          break;
        }
        case 'delay': {
          // Delay with feedback loop: input → delay → feedbackGain → delay, delay → wetGain → output
          const delayNode = audioContext.createDelay(5.0);
          delayNode.delayTime.value = (gNode.params.delayTime as number) || 0.3;
          const feedbackGain = audioContext.createGain();
          feedbackGain.gain.value = (gNode.params.feedback as number) || 0.4;
          const wetGain = audioContext.createGain();
          wetGain.gain.value = (gNode.params.wet as number) || 0.5;
          const dryGain = audioContext.createGain();
          dryGain.gain.value = 1.0 - ((gNode.params.wet as number) || 0.5);
          // Feedback loop
          delayNode.connect(feedbackGain);
          feedbackGain.connect(delayNode);
          delayNode.connect(wetGain);
          // The merger node to combine dry+wet
          const merger = audioContext.createGain();
          merger.gain.value = 1.0;
          wetGain.connect(merger);
          dryGain.connect(merger);
          // We use dryGain as the "input" and merger as the "output"
          // Store intermediate nodes
          newLiveNodes.set(gNode.id + '_delay', delayNode);
          newLiveNodes.set(gNode.id + '_fb', feedbackGain);
          newLiveNodes.set(gNode.id + '_wet', wetGain);
          newLiveNodes.set(gNode.id + '_dry', dryGain);
          // Input goes to both delayNode and dryGain
          // We'll use a splitter gain node as the actual input
          const inputSplitter = audioContext.createGain();
          inputSplitter.gain.value = 1.0;
          inputSplitter.connect(delayNode);
          inputSplitter.connect(dryGain);
          newLiveNodes.set(gNode.id + '_in', inputSplitter);
          audioNode = merger;
          // Override: for connection purposes, the "input" is the splitter
          newLiveNodes.set(gNode.id + '_input', inputSplitter);
          break;
        }
        case 'hrtf_panner': {
          const panner = audioContext.createPanner();
          panner.panningModel = 'HRTF';
          panner.distanceModel = 'inverse';
          panner.positionX.value = (gNode.params.positionX as number) || 0;
          panner.positionY.value = (gNode.params.positionY as number) || 0;
          panner.positionZ.value = (gNode.params.positionZ as number) || -1;
          panner.refDistance = (gNode.params.refDistance as number) || 1;
          panner.rolloffFactor = (gNode.params.rolloff as number) || 1;
          audioNode = panner;
          break;
        }
        case 'stereo_panner': {
          const panner = audioContext.createStereoPanner();
          panner.pan.value = (gNode.params.pan as number) || 0;
          audioNode = panner;
          break;
        }
        case 'analyser': {
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = (gNode.params.fftSize as number) || 256;
          analyser.smoothingTimeConstant = (gNode.params.smoothing as number) || 0.8;
          audioNode = analyser;
          break;
        }
        case 'convolver_reverb': {
          // Simple algorithmic reverb approximation using delay network
          const wetGain = audioContext.createGain();
          wetGain.gain.value = (gNode.params.wet as number) || 0.5;
          const dryGain = audioContext.createGain();
          dryGain.gain.value = (gNode.params.dry as number) || 0.5;
          const merger = audioContext.createGain();
          merger.gain.value = 1.0;
          // Create a few parallel delays for pseudo-reverb
          const delays = [0.029, 0.037, 0.041, 0.053];
          const inputSplitter = audioContext.createGain();
          inputSplitter.gain.value = 1.0;
          inputSplitter.connect(dryGain);
          dryGain.connect(merger);
          for (const dt of delays) {
            const d = audioContext.createDelay(1.0);
            d.delayTime.value = dt;
            const fb = audioContext.createGain();
            fb.gain.value = 0.6;
            inputSplitter.connect(d);
            d.connect(fb);
            fb.connect(d);
            d.connect(wetGain);
          }
          wetGain.connect(merger);
          newLiveNodes.set(gNode.id + '_input', inputSplitter);
          audioNode = merger;
          break;
        }
        case 'destination': {
          audioNode = audioContext.destination;
          break;
        }
      }

      if (audioNode) {
        newLiveNodes.set(gNode.id, audioNode);
      }
    }

    // 3. Wire up edges
    for (const edge of edges) {
      const sourceNode = newLiveNodes.get(edge.source);
      const targetNode = newLiveNodes.get(edge.target);
      // For delay/reverb, use the _input node as the target
      const targetInputNode = newLiveNodes.get(edge.target + '_input') || targetNode;

      if (sourceNode && targetInputNode && targetInputNode !== audioContext.destination) {
        try { sourceNode.connect(targetInputNode as AudioNode); } catch { /* ignore */ }
      } else if (sourceNode && targetNode) {
        try { sourceNode.connect(targetNode as AudioNode); } catch { /* ignore */ }
      }
    }

    set({ liveNodes: newLiveNodes });
  },
}), {
  name: 'umwelt-audiograph-storage',
  partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
}));
