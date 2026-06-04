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
  private globalStepCount = 0;

  private CHORD_PROGRESSION = [
    { root: 0, notes: [0, 4, 7] }, // C Major
    { root: 7, notes: [7, 11, 14] }, // G Major
    { root: 9, notes: [9, 12, 16] }, // A Minor
    { root: 5, notes: [5, 9, 12] }, // F Major
  ];
  
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

  private sendSequenceToAI(targetId: string, seq: { pitches: any[]; gates: any[] }) {
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
      this.globalStepCount++;
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

  private async generateSequenceForModule(module: MusicModule, musicState: any, audioState: any): Promise<{ pitches: any[], gates: any[] } | null> {
    const seqLength = 16;
    const pitches: any[] = [];
    const gates: any[] = [];

    let density = this.getParamValue(module, 'density', 0.8, musicState, audioState);
    const effectiveDensity = density;

    // Determine current global chord
    const measureIndex = Math.floor(this.globalStepCount / seqLength);
    const chord = this.CHORD_PROGRESSION[measureIndex % this.CHORD_PROGRESSION.length];

    if (module.type === 'harmonic_array') {
      const config = module.harmonicConfig;
      let root = config?.rootNote ?? 60;
      let register = config?.register ?? 0;
      
      let octaveRange = this.getParamValue(module, 'octaveRange', config?.octaveRange ?? 2, musicState, audioState);
      
      for (let i = 0; i < seqLength; i++) {
        if (Math.random() < effectiveDensity) {
          // Voice 0: Random chord note (Melody)
          // Voice 1, 2, 3: The chord notes
          const o = Math.floor(Math.random() * octaveRange);
          const melodyNote = root + register + chord.notes[Math.floor(Math.random() * chord.notes.length)] + (o * 12);
          
          pitches.push([
            melodyNote, 
            root + register + chord.notes[0], 
            root + register + chord.notes[1], 
            root + register + chord.notes[2]
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

      // Generate melody sequence using RNN
      let rawPitches: number[] = [];
      let rawGates: number[] = [];

      if (!this.rnn || !this.initialized || effectiveDensity < 0.1) {
        // Fallback
        const scale = chord.notes.map(n => root + n);
        for (let i = 0; i < seqLength; i++) {
          if (Math.random() < effectiveDensity && effectiveDensity >= 0.1) {
            const leap = Math.random() < (temp - 0.5) ? Math.floor(Math.random() * 2) : 0;
            rawPitches.push(scale[Math.floor(Math.random() * scale.length)] + (leap * 12));
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
          notes: [ { pitch: root + chord.notes[0], startTime: 0.0, endTime: 0.5, velocity: 80 } ]
        };

        const qns = sequences.quantizeNoteSequence(seed, 4);
        try {
          const result = await this.rnn.continueSequence(qns, seqLength, temp);
          const unquantized = sequences.unquantizeSequence(result, this.qpm);
          
          const stepTime = (60 / this.qpm) / 4; 
          for (let i = 0; i < seqLength; i++) {
            const stepStart = i * stepTime;
            const note = unquantized.notes?.find(n => (n.startTime ?? 0) <= stepStart + 0.01 && (n.endTime ?? 0) > stepStart);
            
            if (note && Math.random() < effectiveDensity) {
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

      // Pack the Polyphonic Array
      for (let i = 0; i < seqLength; i++) {
        // Voice 0 is the AI generated melody, Voice 1,2,3 are the chord accompaniment
        pitches.push([
          rawPitches[i] + register,
          root + register + chord.notes[0] - 12, // Bass/Chord Root slightly lower
          root + register + chord.notes[1],
          root + register + chord.notes[2]
        ]);
        
        // If melody is resting, chords might still play on the downbeat or with density
        let chordGate = rawGates[i];
        if (i % 4 === 0 && effectiveDensity > 0.3) chordGate = 1; // Play chord on downbeat

        gates.push([
          rawGates[i],
          chordGate,
          chordGate,
          chordGate
        ]);
      }

      return { pitches, gates };
    }

    return null;
  }
}

export const musicEngine = MusicEngine.getInstance();

