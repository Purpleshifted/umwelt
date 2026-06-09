import { VirtualStream, NodeMapping, evaluateStreamValue } from '@/store/audioMapStore';
import { useMusicStore } from '@/store/musicStore';

/**
 * Umwelt Audio Engine — NoiseCraft Bridge
 * 
 * Communicates with NoiseCraft running in a hidden iframe via postMessage.
 * Sensor values are mapped to NoiseCraft Knob parameters in real-time
 * using the noiseCraft:setParams batch message protocol.
 * 
 * Audio output is captured via MediaStream → AnalyserNode for spectral data → lighting.
 * 
 * IMPORTANT: The iframe is loaded through a Next.js reverse proxy (/noisecraft/...)
 * so that the iframe and parent share the same origin (localhost:3000).
 * This allows direct access to window.noiseCraftMediaStream for spectral analysis.
 */

export interface KnobMapping {
  nodeId: string;
  minVal: number;
  maxVal: number;
  label: string;
}

// Mappings for the indiv_audio_map_v2.ncft patch from the Intersection project.
// Node IDs come from the actual patch structure.
const DEFAULT_MAPPINGS: Record<string, KnobMapping> = {
  ppg:    { nodeId: '183', minVal: 0,   maxVal: 1,   label: 'Vol CHORDS' },
  emg:    { nodeId: '171', minVal: 0,   maxVal: 1,   label: 'Reverb Amt' },
  ecg:    { nodeId: '163', minVal: 0,   maxVal: 2,   label: 'Reverb Wet' },
  mouseX: { nodeId: '84',  minVal: 0,   maxVal: 1,   label: 'Delay Vol' },
  mouseY: { nodeId: '70',  minVal: 0,   maxVal: 0.5, label: 'Master Vol' },
};

export class NoiseCraftBridge {
  private iframe: HTMLIFrameElement | null = null;

  public getIframe(): HTMLIFrameElement | null {
    return this.iframe;
  }

  private analyser: AnalyserNode | null = null;
  private audioCtx: AudioContext | null = null;
  private frequencyData: Float32Array | null = null;
  private fftSize = 256;
  private _isConnected = false;
  private _isPlaying = false;
  private mappings: Record<string, KnobMapping> = { ...DEFAULT_MAPPINGS };
  private messageHandler: ((e: MessageEvent) => void) | null = null;
  private streamSourceNode: MediaStreamAudioSourceNode | null = null;
  private pannerNode: PannerNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private _editorVisible = false;
  
  public onClockPulse?: (nodeId: string, pulseTime: number, sendTime: number) => void;

  noisecraftUrl(filename = 'nc_noise_patch.ncft'): string {
    // Load from /public/examples/ so we load the autosaved version instead of the static public version
    return `/noisecraft/public/embedded.html?src=/noisecraft/public/examples/${encodeURIComponent(filename)}&ui=full`;
  }

  createIframe(container: HTMLElement, visible = false, filename?: string): HTMLIFrameElement {
    if (!this.iframe) {
      this.iframe = document.createElement('iframe');
      this.iframe.src = this.noisecraftUrl(filename);
      this.iframe.id = 'noisecraft-iframe';
      this.iframe.allow = 'autoplay; microphone';
      
      this.messageHandler = (e: MessageEvent) => this.handleMessage(e);
      window.addEventListener('message', this.messageHandler);
    } else if (filename) {
      const newUrl = this.noisecraftUrl(filename);
      if (!this.iframe.src.endsWith(newUrl) && this.iframe.src !== newUrl) {
        this.iframe.src = newUrl;
        this._isConnected = false;
        this._isPlaying = false;
      }
    }

    // Move to new container if needed (Note: this reloads the iframe in standard browsers)
    if (this.iframe.parentElement !== container) {
      container.appendChild(this.iframe);
    }
    
    this._editorVisible = visible;
    this.applyIframeStyles(visible);
    
    return this.iframe;
  }
    
  enableHRTF(): void {
    if (!this.audioCtx || !this.streamSourceNode) return;
    
    // Mute original iframe output to prevent doubling
    if (this.iframe?.contentWindow) {
      // Note: We can't easily mute the iframe's internal destination, 
      // but we can route our Panner to the parent ctx if we had one.
      // Since we use the iframe's ctx, we just intercept it.
    }
    
    if (!this.pannerNode) {
      this.pannerNode = this.audioCtx.createPanner();
      this.pannerNode.panningModel = 'HRTF';
      this.pannerNode.distanceModel = 'inverse';
      this.pannerNode.refDistance = 1;
      this.pannerNode.maxDistance = 10000;
      this.pannerNode.rolloffFactor = 1;
      this.pannerNode.coneInnerAngle = 360;
      this.pannerNode.coneOuterAngle = 0;
      this.pannerNode.coneOuterGain = 0;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 1.0;
      
      this.streamSourceNode.connect(this.pannerNode);
      this.pannerNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);
    }
  }

  setPannerPosition(x: number, y: number, z: number): void {
    if (this.pannerNode) {
      this.pannerNode.positionX.setTargetAtTime(x, this.audioCtx!.currentTime, 0.1);
      this.pannerNode.positionY.setTargetAtTime(y, this.audioCtx!.currentTime, 0.1);
      this.pannerNode.positionZ.setTargetAtTime(z, this.audioCtx!.currentTime, 0.1);
    }
  }

  private applyIframeStyles(visible: boolean): void {
    if (!this.iframe) return;
    
    if (!visible) {
      Object.assign(this.iframe.style, {
        position: 'fixed',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        border: 'none',
        opacity: '0',
        pointerEvents: 'none',
      });
    } else {
      Object.assign(this.iframe.style, {
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        width: '700px',
        height: '450px',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '8px',
        zIndex: '200',
        background: '#111',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        opacity: '1',
        pointerEvents: 'auto',
      });
    }
  }

  toggleEditorVisibility(): void {
    this._editorVisible = !this._editorVisible;
    this.applyIframeStyles(this._editorVisible);
  }

  private currentPatchFilename = 'nc_noise_patch.ncft';

  get editorVisible(): boolean {
    return this._editorVisible;
  }

  loadPatch(filename: string): void {
    if (this.currentPatchFilename === filename && this.iframe) return;
    this.currentPatchFilename = filename;
    if (this.iframe) {
      this.iframe.src = this.noisecraftUrl(filename);
      // Wait for the new load before trying to reconnect the analyser
      this._isConnected = false;
    }
  }

  private handleMessage(e: MessageEvent): void {
    if (!e.data || typeof e.data !== 'object') return;
    
    switch (e.data.type) {
      case 'noiseCraft:audioStreamReady':
        console.log('[NoiseCraft Bridge] Audio stream ready, connecting analyser...');
        this.tryConnectAnalyser();
        // Enable auto-save
        if (this.iframe?.contentWindow) {
          this.iframe.contentWindow.postMessage({
            type: "noiseCraft:enableAutoSave",
            enabled: true,
            filename: this.currentPatchFilename
          }, "*");
        }
        break;
        
      case 'noiseCraft:audioStreamStopped':
        console.log('[NoiseCraft Bridge] Audio stream stopped');
        this.disconnectAnalyser();
        this._isPlaying = false;
        break;

      case 'noiseCraft:audioState':
        if (e.data.status === 'playing') {
          this._isPlaying = true;
        } else {
          this._isPlaying = false;
        }
        break;

      case 'noiseCraft:clockPulse':
        if (this.onClockPulse) {
          this.onClockPulse(e.data.nodeId, e.data.pulseTime, e.data.sendTime);
        }
        break;

      case 'noiseCraft:projectLoaded': {
        // The iframe is now fully loaded, send it the modules so dropdowns populate
        const state = useMusicStore.getState();
        const outModules = state.modules
          .filter((m: any) => m.type === 'ai_seq_out' || m.type === 'seq_out')
          .map((m: any) => ({ 
            id: m.id, 
            name: m.type === 'seq_out' ? `Channel ${m.seqOutConfig?.channel || '?'}` : m.name 
          }));
        this.postMessage({ type: 'noiseCraft:updateModules', modules: outModules });
        
        // Broadcast the last known sequences from audioMapStore to the newly loaded iframe
        import('@/store/audioMapStore').then(({ useAudioMapStore }) => {
          const mapState = useAudioMapStore.getState();
          state.modules.forEach(mod => {
            if (mod.type === 'seq_out' && mod.seqOutConfig?.channel) {
              const seq = mapState.sequences[mod.seqOutConfig.channel];
              if (seq && seq.pitches) {
                // Send directly to the iframe that triggered projectLoaded
                if (e.source) {
                  (e.source as Window).postMessage({
                    type: 'noiseCraft:setSequence',
                    nodeId: mod.id,
                    pitches: seq.pitches,
                    gates: seq.gates
                  }, '*');
                }
              }
            } else if (mod.type === 'ai_seq_out') {
              // Wait, AI seq out sequences are not cached globally in audioMapStore.
              // They are sent dynamically. They will just wait for the next pulse.
            }
          });
        });
        break;
      }
    }
  }

  /**
   * Connect to the NoiseCraft audio output stream for spectral analysis.
   * Because the iframe is loaded through the same-origin proxy,
   * we can directly access iframe.contentWindow.noiseCraftMediaStream.
   */
  private tryConnectAnalyser(retryCount = 0): void {
    if (this.analyserRetryTimer) {
      clearTimeout(this.analyserRetryTimer);
      this.analyserRetryTimer = null;
    }

    if (!this.iframe?.contentWindow) {
      if (retryCount < 30) {
        this.analyserRetryTimer = setTimeout(() => this.tryConnectAnalyser(retryCount + 1), 300);
      }
      return;
    }
    
    try {
      const iframeWindow = this.iframe.contentWindow as Window & {
        noiseCraftMediaStream?: MediaStream;
        noiseCraftAudioContext?: AudioContext;
      };
      
      const stream = iframeWindow.noiseCraftMediaStream;
      const ncAudioCtx = iframeWindow.noiseCraftAudioContext;
      
      if (!stream || !ncAudioCtx) {
        if (retryCount < 30) {
          console.log(`[NoiseCraft Bridge] MediaStream not ready, retrying (${retryCount}/30)...`);
          this.analyserRetryTimer = setTimeout(() => this.tryConnectAnalyser(retryCount + 1), 500);
        }
        return;
      }
      
      // Use the NoiseCraft's own AudioContext
      this.audioCtx = ncAudioCtx;
      
      // Create analyser for spectral data → lighting
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.85;
      this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
      
      this.streamSourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.streamSourceNode.connect(this.analyser);
      
      // OPTIONAL HRTF SPATIALIZATION FOR EXPERIENCE PAGE:
      // If we want spatialization, we route it through a PannerNode
      // For now we just prepare the PannerNode, but leave it disconnected from destination 
      // unless specifically requested.
      
      this._isConnected = true;
      this._isPlaying = true;
      console.log('[NoiseCraft Bridge] ✓ Analyser connected to audio stream');
    } catch (err) {
      console.error('[NoiseCraft Bridge] Failed to connect analyser:', err);
      if (retryCount < 30) {
        this.analyserRetryTimer = setTimeout(() => this.tryConnectAnalyser(retryCount + 1), 500);
      }
    }
  }

  private disconnectAnalyser(): void {
    if (this.analyserRetryTimer) {
      clearTimeout(this.analyserRetryTimer);
      this.analyserRetryTimer = null;
    }
    try {
      this.streamSourceNode?.disconnect();
    } catch {
      // ignore
    }
    this.streamSourceNode = null;
    this.analyser = null;
    this._isConnected = false;
  }

  /**
   * Send a generic postMessage to all registered NoiseCraft iframes
   */
  postMessage(message: any): void {
    if (this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(message, '*');
    }
    // Broadcast to headless Audio Editor iframes
    import('@/store/audioGraphStore').then(({ useAudioGraphStore }) => {
      const windows = useAudioGraphStore.getState().noisecraftWindows;
      windows.forEach((win) => {
        try { win.postMessage(message, '*'); } catch (e) {}
      });
    });
  }

  /**
   * Start NoiseCraft audio playback via postMessage.
   */
  startAudio(): void {
    this.postMessage({ type: 'noiseCraft:play' });
    console.log('[NoiseCraft Bridge] Sent play command');
  }

  /**
   * Stop NoiseCraft audio playback.
   */
  stopAudio(): void {
    this.postMessage({ type: 'noiseCraft:stop' });
    this._isPlaying = false;
  }

  /**
   * Directly send parameter updates to specific nodes.
   */
  setParams(params: Array<{ nodeId: string; paramName: string; value: number }>): void {
    if (!this._isPlaying) return;
    this.postMessage({ type: 'noiseCraft:setParams', params });
  }

  /**
   * Send a sequence of pitches and gates to an AI_Seq node
   */
  setSequence(nodeId: string, pitches: any[], gates: any[]): void {
    this.postMessage({
      type: 'noiseCraft:setSequence',
      nodeId: nodeId,
      pitches: pitches,
      gates: gates
    });
  }

  /**
   * Update NoiseCraft knob parameters from sensor values.
   * Uses the noiseCraft:setParams batch protocol for efficiency.
   * All sensor inputs are 0-1 normalized.
   */
  update(ppg: number, emg: number, ecg: number, mouseX: number, mouseY: number): void {
    const sensorValues: Record<string, number> = { ppg, emg, ecg, mouseX, mouseY };
    const params: Array<{ nodeId: string; paramName: string; value: number }> = [];
    
    for (const [sensor, mapping] of Object.entries(this.mappings)) {
      const normalizedValue = sensorValues[sensor];
      if (normalizedValue === undefined) continue;
      
      // Scale from 0-1 to the knob's min-max range
      const scaledValue = mapping.minVal + normalizedValue * (mapping.maxVal - mapping.minVal);
      
      params.push({
        nodeId: mapping.nodeId,
        paramName: 'value',
        value: scaledValue,
      });
    }
    
    if (params.length > 0) {
      this.postMessage({
        type: 'noiseCraft:setParams',
        params,
      });
    }
  }

  /**
   * Update NoiseCraft parameters using the new Virtual Streams and Node Mapping logic.
   */
  updateFromVirtualStreams(sensorValues: Record<string, number>, streams: VirtualStream[], mappings: NodeMapping[]): void {
    // We use the centralized evaluateStreamValue which supports all 20+ operations, 
    // nested node paths, time-based CHOPs (like Envelope, Moving Average, Slope, Smooth), etc.
    const cache = new Map<string, number>();

    const params: Array<{ nodeId: string; paramName: string; value: number }> = [];

    // Map computed stream values to Node IDs
    for (const mapping of mappings) {
      if (!mapping.nodeId || !mapping.streamId) continue;
      
      // Compute the value of the mapped stream using the global engine
      const rawValue = evaluateStreamValue(mapping.streamId, streams, sensorValues, cache);
      
      params.push({
        nodeId: mapping.nodeId,
        paramName: 'value',
        value: rawValue
      });
    }

    if (params.length > 0) {
      this.postMessage({
        type: 'noiseCraft:setParams',
        params,
      });
    }
  }

  /**
   * Update the mapping configuration.
   */
  setMappings(mappings: Record<string, KnobMapping>): void {
    this.mappings = { ...mappings };
  }

  getMappings(): Record<string, KnobMapping> {
    return { ...this.mappings };
  }

  /**
   * Get spectral analysis data from the NoiseCraft audio output.
   */
  getSpectralData(): { low: number; mid: number; high: number; bands: Float32Array } {
    if (!this.analyser || !this.frequencyData) {
      return { low: 0, mid: 0, high: 0, bands: new Float32Array(0) };
    }
    
    this.analyser.getFloatFrequencyData(this.frequencyData as Float32Array<ArrayBuffer>);
    
    const binCount = this.frequencyData.length;
    const lowEnd = Math.floor(binCount * 0.15);
    const midEnd = Math.floor(binCount * 0.5);
    
    let lowSum = 0, midSum = 0, highSum = 0;
    
    for (let i = 0; i < binCount; i++) {
      const val = Math.max(0, Math.min(1, (this.frequencyData[i] + 100) / 100));
      if (i < lowEnd) lowSum += val;
      else if (i < midEnd) midSum += val;
      else highSum += val;
    }
    
    const low = lowEnd > 0 ? lowSum / lowEnd : 0;
    const mid = (midEnd - lowEnd) > 0 ? midSum / (midEnd - lowEnd) : 0;
    const high = (binCount - midEnd) > 0 ? highSum / (binCount - midEnd) : 0;
    
    return { low, mid, high, bands: this.frequencyData };
  }

  get running(): boolean {
    return this._isPlaying;
  }

  get connected(): boolean {
    return this._isConnected;
  }

  destroy(): void {
    this.disconnectAnalyser();
    this.stopAudio();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    this.iframe?.remove();
    this.iframe = null;
  }
}

// Singleton
let bridgeInstance: NoiseCraftBridge | null = null;

export function getNoiseCraftBridge(): NoiseCraftBridge {
  if (!bridgeInstance) {
    bridgeInstance = new NoiseCraftBridge();
  }
  return bridgeInstance;
}
