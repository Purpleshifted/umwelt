import { MusicRNN } from '@magenta/music/es6/music_rnn';
import { sequences } from '@magenta/music/es6/core';
import { INoteSequence } from '@magenta/music/es6/protobuf';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from './NoiseCraftBridge';

interface ModulePlaybackState {
  cursor: number;
  seqLength: number;
  isGenerating: boolean;
}

class MusicEngine {
  private static instance: MusicEngine;
  private isRunning = false;
  private rnn: MusicRNN | null = null;
  private initialized = false;
  private qpm = 120; // Quarter notes per minute
  private updateTimer: NodeJS.Timeout | null = null;
  
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
      this.rnn = new MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
      await this.rnn.initialize();
      this.initialized = true;
      console.log('[MusicEngine] Magenta MusicRNN initialized!');
    } catch (e) {
      console.error('[MusicEngine] Failed to initialize Magenta:', e);
    }
  }

  private sendSequenceToAI(targetId: string, seq: { pitches: number[]; gates: number[] }) {
    const bridge = getNoiseCraftBridge();
    bridge.setSequence(targetId, seq.pitches, seq.gates);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const bridge = getNoiseCraftBridge();

    const syncModules = () => {
      const state = useMusicStore.getState();
      const outModules = state.modules
        .filter(m => m.type === 'module_output' || m.type === 'magenta_ai' || m.type === 'harmonic_array')
        .map(m => ({ id: m.id, name: m.name }));
      bridge.postMessage({ type: 'noiseCraft:updateModules', modules: outModules });
    };
    syncModules();
    useMusicStore.subscribe(syncModules);

    let lastTick = performance.now();
    let accumulatedPulses = 0;

    const tickPulses = () => {
      const state = useMusicStore.getState();
      const generators = state.modules.filter(m => m.type === 'magenta_ai' || m.type === 'harmonic_array');
      const audioState = useAudioMapStore.getState();

      for (const gen of generators) {
        let genState = this.moduleStates.get(gen.id);
        if (!genState) {
          genState = { cursor: 0, seqLength: 0, isGenerating: false };
          this.moduleStates.set(gen.id, genState);
        }

        genState.cursor++;

        const totalPulsesNeeded = genState.seqLength * 6; // 6 pulses per 16th note

        if (genState.cursor >= totalPulsesNeeded && !genState.isGenerating) {
          genState.isGenerating = true;
          
          this.generateSequenceForModule(gen, state, audioState).then(seq => {
            if (seq && seq.pitches.length > 0) {
              const targetId = this.getTargetOutputNodeId(gen, state);
              if (targetId) {
                this.sendSequenceToAI(targetId, seq);
              }
              genState.seqLength = seq.pitches.length;
              genState.cursor = 0;
            } else {
              genState.seqLength = 1; 
              genState.cursor = 0;
            }
            genState.isGenerating = false;
          });
        }
      }
    };

    // Run an internal tick timer to simulate 24 PPQ at 120 BPM if no ClockOut is present
    let wasBridgeRunning = false;
    
    this.updateTimer = setInterval(() => {
      if (!this.isRunning) return;
      
      const bridge = getNoiseCraftBridge();
      const isBridgeRunning = bridge.running;
      
      if (!isBridgeRunning) {
        if (wasBridgeRunning) {
          // Just stopped: clear sequences to silence the continuous AudioGraph
          const state = useMusicStore.getState();
          state.modules.forEach(m => {
            if (m.type === 'magenta_ai' || m.type === 'harmonic_array') {
              const targetId = this.getTargetOutputNodeId(m, state);
              if (targetId) bridge.setSequence(targetId, [], []);
            }
          });
          wasBridgeRunning = false;
        }
        lastTick = performance.now(); // keep time synced for when it starts again
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

  private getParamValue(module: MusicModule, paramName: string, defaultValue: number, musicState: any, audioState: any): number {
    const inputEdge = musicState.edges.find((e: any) => e.target === module.id && e.targetHandle === paramName);
    if (inputEdge) {
      const inputModule = musicState.modules.find((m: any) => m.id === inputEdge.source);
      if (inputModule) {
        if (inputModule.type === 'slider') return inputModule.sliderConfig?.value ?? defaultValue;
        if (inputModule.type === 'knob') return inputModule.knobConfig?.value ?? defaultValue;
        if (inputModule.type === 'virtual_stream' && inputModule.inputStreamId) {
          const sensors = useSensorStore.getState();
          const sensorValues = { ppg: sensors.ppg, emg: sensors.emg, ecg: sensors.ecg, gsr: sensors.gsr, mouseX: sensors.mouseX, mouseY: sensors.mouseY };
          return evaluateStreamValue(inputModule.inputStreamId, audioState.streams, sensorValues);
        }
      }
    }
    return defaultValue;
  }

  private getTargetOutputNodeId(module: MusicModule, musicState: any): string | null {
    const outputEdge = musicState.edges.find((e: any) => e.source === module.id && e.sourceHandle === 'sequence');
    if (outputEdge) {
      return outputEdge.target;
    }
    return module.id; // fallback
  }

  private async generateSequenceForModule(module: MusicModule, musicState: any, audioState: any): Promise<{ pitches: number[], gates: number[] } | null> {
    const seqLength = 16;
    const pitches: number[] = [];
    const gates: number[] = [];

    // Probability of a step having a note, based on density
    let density = this.getParamValue(module, 'density', 0.8, musicState, audioState);
    const effectiveDensity = density;

    if (module.type === 'harmonic_array') {
      // Arpeggiate through a scale
      const config = module.harmonicConfig;
      let root = config?.rootNote ?? 60;
      let scale = [0, 2, 4, 5, 7, 9, 11]; // Major
      if (config?.scaleType === 'minor') scale = [0, 2, 3, 5, 7, 8, 10];
      if (config?.scaleType === 'dorian') scale = [0, 2, 3, 5, 7, 9, 10];
      if (config?.scaleType === 'altered') scale = [0, 1, 3, 4, 6, 8, 10];

      let octaveRange = this.getParamValue(module, 'octaveRange', config?.octaveRange ?? 2, musicState, audioState);
      let scaleTypeParam = this.getParamValue(module, 'scaleType', 0, musicState, audioState);
      
      // If a parameter is hooked up for scaleType (0 to 1), use it to modulate root note dynamically
      if (scaleTypeParam > 0) {
          root += Math.floor(scaleTypeParam * 12);
      }
      
      const fullScale: number[] = [];
      for (let o = 0; o < octaveRange; o++) {
        for (const note of scale) {
          fullScale.push(root + note + (o * 12));
        }
      }

      for (let i = 0; i < seqLength; i++) {
        if (Math.random() < effectiveDensity) {
          const idx = Math.floor(Math.random() * fullScale.length);
          pitches.push(fullScale[idx]);
          gates.push(1);
        } else {
          // Rest
          pitches.push(root);
          gates.push(0);
        }
      }
      return { pitches, gates };
    } 

    if (module.type === 'magenta_ai') {
      const temp = this.getParamValue(module, 'temperature', 1.0, musicState, audioState);

      if (!this.rnn || !this.initialized) {
        // Fallback
        const scale = [60, 62, 64, 65, 67, 69, 71, 72];
        for (let i = 0; i < seqLength; i++) {
          if (Math.random() < effectiveDensity) {
            const leap = Math.random() < (temp - 0.5) ? Math.floor(Math.random() * 4) : 0;
            pitches.push(scale[Math.floor(Math.random() * scale.length)] + (leap * 12));
            gates.push(1);
          } else {
            pitches.push(60);
            gates.push(0);
          }
        }
        return { pitches, gates };
      }

      // If density is very low, maybe we just don't generate to save compute
      if (effectiveDensity < 0.1) {
        for (let i = 0; i < seqLength; i++) {
          pitches.push(60);
          gates.push(0);
        }
        return { pitches, gates };
      }

      const seed: INoteSequence = {
        ticksPerQuarter: 220,
        totalTime: 1.0,
        timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
        tempos: [{ time: 0, qpm: this.qpm }],
        notes: [ { pitch: 60, startTime: 0.0, endTime: 0.5, velocity: 80 } ]
      };

      const qns = sequences.quantizeNoteSequence(seed, 4);
      try {
        const result = await this.rnn.continueSequence(qns, seqLength, temp);
        const unquantized = sequences.unquantizeSequence(result, this.qpm);
        
        // Convert notes to discrete 16-step grid
        const stepTime = (60 / this.qpm) / 4; // 16th note duration
        for (let i = 0; i < seqLength; i++) {
          const stepStart = i * stepTime;
          // Find if any note plays during this step
          const note = unquantized.notes?.find(n => (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart);
          
          if (note && Math.random() < effectiveDensity) {
            pitches.push(note.pitch ?? 60);
            gates.push(1);
          } else {
            pitches.push(60);
            gates.push(0);
          }
        }
        return { pitches, gates };
      } catch (e) {
        console.error('[MusicEngine] Generation failed:', e);
        return null;
      }
    }

    return null;
  }
}

export const musicEngine = MusicEngine.getInstance();

