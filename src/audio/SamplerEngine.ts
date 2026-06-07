import { Soundfont } from 'smplr';

export class SamplerEngine {
  private static instance: SamplerEngine;
  private instruments: Map<string, Soundfont> = new Map();
  private audioContext: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): SamplerEngine {
    if (!SamplerEngine.instance) {
      SamplerEngine.instance = new SamplerEngine();
    }
    return SamplerEngine.instance;
  }

  public setAudioContext(ctx: AudioContext) {
    this.audioContext = ctx;
  }

  public async getInstrument(instrumentName: string, outputNode?: AudioNode): Promise<Soundfont | null> {
    if (!this.audioContext) return null;

    // Use a unique key if outputNode is provided so we can have multiple routings
    const key = outputNode ? `${instrumentName}_routed` : instrumentName;

    if (this.instruments.has(key)) {
      return this.instruments.get(key)!;
    }

    try {
      const options: any = { instrument: instrumentName as any };
      if (outputNode) {
        // smplr supports outputTo to route to a specific Web Audio node
        options.outputTo = outputNode;
      }
      const instr = new Soundfont(this.audioContext, options);
      await instr.load;
      this.instruments.set(key, instr);
      return instr;
    } catch (err) {
      console.error(`Failed to load smplr instrument: ${instrumentName}`, err);
      return null;
    }
  }

  public playNote(
    instrumentName: string,
    pitch: number,
    time: number,
    duration: number,
    velocity: number = 80,
    outputNode?: AudioNode
  ) {
    if (!this.audioContext) return;
    
    const key = outputNode ? `${instrumentName}_routed` : instrumentName;
    const instr = this.instruments.get(key);
    if (!instr) {
      // Load lazy if not loaded, but for synchronous play we might skip this note
      this.getInstrument(instrumentName, outputNode);
      return;
    }

    instr.start({
      note: pitch,
      time: time,
      duration: duration,
      velocity: velocity
    });
  }
}

export const getSamplerEngine = () => SamplerEngine.getInstance();
