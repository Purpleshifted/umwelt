import { MusicRNN } from '@magenta/music/es6/music_rnn';
import { sequences } from '@magenta/music/es6/core';
import { INoteSequence } from '@magenta/music/es6/protobuf';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import { getNoiseCraftBridge } from './NoiseCraftBridge';

class MusicEngine {
  private static instance: MusicEngine;
  private isRunning = false;
  private rnn: MusicRNN | null = null;
  private initialized = false;
  private currentSequence: INoteSequence | null = null;
  private playCursor = 0; // index in currentSequence.notes
  private lastNoteTime = 0;
  private qpm = 120; // Quarter notes per minute

  private constructor() {
    // Private constructor
  }

  static getInstance(): MusicEngine {
    if (!MusicEngine.instance) {
      MusicEngine.instance = new MusicEngine();
    }
    return MusicEngine.instance;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      // Use the standard basic_rnn checkpoint hosted by Google
      this.rnn = new MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
      await this.rnn.initialize();
      this.initialized = true;
      console.log('[MusicEngine] Magenta MusicRNN initialized!');
    } catch (e) {
      console.error('[MusicEngine] Failed to initialize Magenta:', e);
    }
  }

  private sendSequenceToAI(module: MusicModule, seq: { pitches: number[]; gates: number[] }) {
    const bridge = getNoiseCraftBridge();
    const state = useMusicStore.getState();
    
    // Find outputs connected to this module
    const connectedOutputs = state.edges
      .filter(e => e.source === module.id)
      .map(e => state.modules.find(m => m.id === e.target))
      .filter(m => m && m.type === 'output');
      
    // Broadcast the sequence to the NoiseCraft iframe, using the output module's ID
    if (connectedOutputs.length > 0) {
      connectedOutputs.forEach(outMod => {
        if (outMod) {
          bridge.setSequence(outMod.id, seq.pitches, seq.gates);
        }
      });
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Bind to NoiseCraft clock pulses
    const bridge = getNoiseCraftBridge();

    // Send available modules to NoiseCraft immediately and subscribe to updates
    const syncModules = () => {
      const state = useMusicStore.getState();
      const outModules = state.modules.filter(m => m.type === 'output').map(m => ({ id: m.id, name: m.name }));
      bridge.postMessage({ type: 'noiseCraft:updateModules', modules: outModules });
    };
    syncModules();
    useMusicStore.subscribe(syncModules);

    bridge.onClockPulse = (nodeId: string, pulseTime: number, sendTime: number) => {
      if (!this.isRunning) return;
      const musicState = useMusicStore.getState();
      const activeMagenta = musicState.modules.find(m => m.type === 'magenta_ai');
      if (activeMagenta) {
        // If we have a stored sequence, ensure it's sent to AI nodes once
        if ((activeMagenta as any).sequenceData) {
          const { pitches, gates } = (activeMagenta as any).sequenceData;
          this.sendSequenceToAI(activeMagenta, { pitches, gates });
          // Clear after sending to avoid repeated sending
          delete (activeMagenta as any).sequenceData;
        }
        this.processMagentaPlayback(activeMagenta);
      }
    };
  }

  stop() {
    this.isRunning = false;
    const bridge = getNoiseCraftBridge();
    if (bridge.onClockPulse) {
      bridge.onClockPulse = undefined;
    }
  }

  private processMagentaPlayback(module: MusicModule) {
    const now = performance.now();

    // If we have no sequence, or we finished the current one, generate a new one
    if (!this.currentSequence || this.playCursor >= (this.currentSequence.notes?.length || 0)) {
      // Prevent spamming generate if it's already generating (we could add a lock)
      if (!this.currentSequence) {
        this.currentSequence = { notes: [] }; // lock
        this.generateNextSequence(module);
      } else if (this.playCursor >= (this.currentSequence.notes?.length || 0) && this.currentSequence.notes!.length > 0) {
        this.currentSequence = { notes: [] }; // lock
        this.generateNextSequence(module);
      }
      return;
    }

    const notes = this.currentSequence.notes!;
    const currentNote = notes[this.playCursor];
    
    if (!currentNote) return;

    // Play note immediately! (We are now driven perfectly by the external NoiseCraft clock pulse)
    const hz = this.midiToHz(currentNote.pitch);
    const bridge = getNoiseCraftBridge();
    
    // Send Pitch and Gate ON
    bridge.setParams([
      { nodeId: 'AI_Pitch', paramName: 'value', value: hz },
      { nodeId: 'AI_Gate', paramName: 'value', value: 1 } 
    ]);

    // Turn off gate rapidly (like a short modular trigger)
    // In a real modular setup, the clock pulse width or a separate envelope would control this.
    // For now, we simulate a 50ms trigger pulse.
    setTimeout(() => {
      bridge.setParams([
        { nodeId: 'AI_Gate', paramName: 'value', value: 0 } 
      ]);
    }, 50);

    this.playCursor++;
  }

  private async generateNextSequence(module: MusicModule) {
    const temp = module.magentaConfig?.temperatureMax ?? 1.0;

    if (!this.rnn || !this.initialized) {
      // FALLBACK: If Magenta failed to load (CORS/Network), use a mock generative algorithm
      const scale = [60, 62, 64, 65, 67, 69, 71, 72]; // C major
      const mockNotes = [];
      let currentTime = 0;
      
      for (let i = 0; i < 16; i++) {
        // Temperature determines randomness and leaps
        const leap = Math.random() < (temp - 0.5) ? Math.floor(Math.random() * 4) : 0;
        const pitch = scale[Math.floor(Math.random() * scale.length)] + (leap * 12);
        const duration = Math.random() > 0.5 ? 0.25 : 0.5; // 16th or 8th notes
        
        mockNotes.push({ pitch, startTime: currentTime, endTime: currentTime + duration, velocity: 80 });
        currentTime += duration;
      }
      
      this.currentSequence = { notes: mockNotes };
      this.playCursor = 0;
      this.lastNoteTime = performance.now();
      return;
    }

    const seed: INoteSequence = {
      ticksPerQuarter: 220,
      totalTime: 1.0,
      timeSignatures: [{ time: 0, numerator: 4, denominator: 4 }],
      tempos: [{ time: 0, qpm: this.qpm }],
      notes: [
        { pitch: 60, startTime: 0.0, endTime: 0.5, velocity: 80 }
      ]
    };

    const qns = sequences.quantizeNoteSequence(seed, 4);
    
    try {
      const result = await this.rnn.continueSequence(qns, 16, temp);
      this.currentSequence = sequences.unquantizeSequence(result, this.qpm);
      this.playCursor = 0;
      this.lastNoteTime = performance.now();
    } catch (e) {
      console.error('[MusicEngine] Generation failed:', e);
    }
  }

  private midiToHz(midi: number) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}

export const musicEngine = MusicEngine.getInstance();
