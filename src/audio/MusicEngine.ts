import { MusicRNN } from '@magenta/music/es6/music_rnn';
import { sequences } from '@magenta/music/es6/core';
import { INoteSequence } from '@magenta/music/es6/protobuf';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import { NoiseCraftBridge } from './NoiseCraftBridge';

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

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
  }

  private loop = () => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.loop);

    const musicState = useMusicStore.getState();
    const activeMagenta = musicState.modules.find(m => m.type === 'magenta_ai');

    if (activeMagenta) {
      this.processMagentaPlayback(activeMagenta);
    }
  };

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

    // In a real scheduler, we would use AudioContext.currentTime.
    // For this prototype, we'll use performance.now() and a simple elapsed check.
    const noteDurationMs = (currentNote.endTime - currentNote.startTime) * 1000;
    
    if (now - this.lastNoteTime >= noteDurationMs) {
      // Play note!
      const hz = this.midiToHz(currentNote.pitch);
      
      // Send to NoiseCraft!
      const bridge = NoiseCraftBridge.getInstance();
      
      // We assume the user has mapped these node names in their NoiseCraft patch:
      // - A Knob named "AI_Pitch"
      // - A Knob named "AI_Gate"
      bridge.setParams([
        { nodeId: 'AI_Pitch', paramName: 'value', value: hz },
        { nodeId: 'AI_Gate', paramName: 'value', value: 1 } // Note ON
      ]);

      // Turn off gate after a short time (simulate trigger)
      setTimeout(() => {
        bridge.setParams([
          { nodeId: 'AI_Gate', paramName: 'value', value: 0 } // Note OFF
        ]);
      }, noteDurationMs * 0.8);

      this.playCursor++;
      this.lastNoteTime = now;
    }
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
