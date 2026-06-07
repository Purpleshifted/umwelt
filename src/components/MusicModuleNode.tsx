import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { MusicModule, useMusicStore } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import styles from './MusicModuleNode.module.css';

interface MusicModuleNodeProps {
  data: {
    module: MusicModule;
    selected?: boolean;
  };
}

const BORDER_COLORS: Record<string, string> = {
  magenta_ai: '#fca5a5',
  harmonic_array: '#93c5fd',
  chord_progression: '#f59e0b',
  melody_gen: '#34d399',
  chord_gen: '#818cf8',
  voice_splitter: '#f472b6',
  register_shift: '#a78bfa',
};

function getBorderClass(type: string): string {
  if (type === 'magenta_ai') return styles.magenta;
  if (type === 'harmonic_array') return styles.harmonic;
  return '';
}

function getBorderStyle(type: string): React.CSSProperties | undefined {
  const color = BORDER_COLORS[type];
  // For the original two types, CSS classes handle the border
  if (type === 'magenta_ai' || type === 'harmonic_array') return undefined;
  if (color) return { borderTop: `4px solid ${color}` };
  return undefined;
}

export default function MusicModuleNode({ data }: MusicModuleNodeProps) {
  const { module, selected } = data;
  const { updateModule, removeModule } = useMusicStore();
  const { streams } = useAudioMapStore();

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteName(midiPitch: number) {
  if (midiPitch === 0 || !midiPitch) return '-';
  const name = PITCH_NAMES[midiPitch % 12];
  const octave = Math.floor(midiPitch / 12) - 1;
  return `${name}${octave}`;
}

function NodeVisualizer({ moduleId, type }: { moduleId: string; type: string }) {
  const output = useMusicStore((s) => s.nodeOutputs[moduleId]);

  if (!output) {
    return <div style={{ fontSize: '10px', color: '#666', padding: '4px', textAlign: 'center', borderTop: '1px solid #333' }}>Waiting for data...</div>;
  }

  let content = null;

  if (type === 'chord_progression' && Array.isArray(output) && output.length > 0) {
    const chord = output[0];
    if (chord && typeof chord.root === 'number') {
      const rootName = getNoteName(48 + chord.key + chord.root).replace(/\d/, '');
      content = <div>Current: {rootName} {chord.mode}</div>;
    }
  } else if ((type === 'melody_gen' || type === 'register_shift') && output.pitches) {
    const preview = output.pitches.slice(0, 4).map((p: number, i: number) => output.gates[i] ? getNoteName(p) : '-').join(' ');
    content = <div>Seq: {preview}...</div>;
  } else if (type === 'chord_gen' && output.pitches && output.pitches[0]) {
    const preview = output.pitches[0].map((p: number) => getNoteName(p)).join(',');
    content = <div>Chd: [{preview}]...</div>;
  } else if (type === 'voice_splitter' && output.pitches) {
    const preview = output.pitches.slice(0, 4).map((p: number, i: number) => output.gates[i] ? getNoteName(p) : '-').join(' ');
    content = <div>V0: {preview}...</div>;
  }

  return (
    <div style={{ fontSize: '10px', color: '#aaa', padding: '4px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid #333', textAlign: 'center', marginTop: '8px' }}>
      {content || 'Active'}
    </div>
  );
}

  const handleInputStreamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateModule(module.id, { inputStreamId: e.target.value || null });
  };

  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''} ${getBorderClass(module.type)}`}
      style={getBorderStyle(module.type)}
    >
      {/* Target handle for incoming virtual stream data (visual only, logical binding is via ID) */}
      <Handle type="target" position={Position.Left} id="in" className={styles.handle} />

      <div className={styles.header}>
        <input 
          className={`${styles.title} nodrag`} 
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '2px 4px', width: '150px' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Output Name"
        />
        <button className={styles.deleteBtn} onClick={() => removeModule(module.id)} title="Delete Module">×</button>
      </div>

      <div className={styles.body}>
        {/* Driving Input Handle for Generators */}
        {(module.type === 'harmonic_array' || module.type === 'magenta_ai') && (
          <Handle type="target" position={Position.Left} id="in" className={styles.handle} style={{ top: '30px' }} />
        )}

        {module.type === 'virtual_stream' && (
          <div className={styles.configArea}>
            <div className={styles.field}>
              <label>Select Stream (OUT)</label>
              <select 
                className="nodrag"
                value={module.inputStreamId || ''}
                onChange={handleInputStreamChange}
              >
                <option value="">-- No Stream --</option>
                {streams.filter(vs => vs.type === 'out').map(vs => (
                  <option key={vs.id} value={vs.id}>{vs.name}</option>
                ))}
              </select>
            </div>
            <Handle type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {module.type === 'noise' && module.noiseConfig && (
          <div className={styles.configArea}>
            <div className={styles.field}>
              <label>Speed: {module.noiseConfig.speed.toFixed(2)}</label>
              <input 
                type="range" min="0.1" max="5.0" step="0.1"
                className="nodrag"
                value={module.noiseConfig.speed}
                onChange={(e) => updateModule(module.id, { 
                  noiseConfig: { ...module.noiseConfig!, speed: parseFloat(e.target.value) } 
                })}
              />
            </div>
            <Handle type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {module.type === 'sine' && module.sineConfig && (
          <div className={styles.configArea}>
            <div className={styles.field}>
              <label>Freq (Hz): {module.sineConfig.frequency.toFixed(2)}</label>
              <input 
                type="range" min="0.1" max="10.0" step="0.1"
                className="nodrag"
                value={module.sineConfig.frequency}
                onChange={(e) => updateModule(module.id, { 
                  sineConfig: { ...module.sineConfig!, frequency: parseFloat(e.target.value) } 
                })}
              />
            </div>
            <Handle type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {module.type === 'harmonic_array' && (
          <div className={styles.configArea}>
            <div className={styles.field} style={{ marginBottom: '10px' }}>
              <label>Register</label>
              <select 
                className="nodrag"
                value={module.harmonicConfig?.register ?? 0}
                onChange={(e) => updateModule(module.id, { 
                  harmonicConfig: { ...module.harmonicConfig!, register: parseInt(e.target.value) } 
                })}
              >
                <option value={12}>Soprano (+1 Oct)</option>
                <option value={0}>Alto (Default)</option>
                <option value={-12}>Tenor (-1 Oct)</option>
                <option value={-24}>Bass (-2 Oct)</option>
              </select>
            </div>
            <div className={styles.paramHandleRow}>
              <Handle type="target" position={Position.Left} id="scaleType" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              <span style={{ fontSize: '10px' }}>Scale Type (0-1)</span>
            </div>
            <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
              <Handle type="target" position={Position.Left} id="octaveRange" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              <span style={{ fontSize: '10px' }}>Octave Range (0-1)</span>
            </div>
          </div>
        )}

        {module.type === 'magenta_ai' && (
          <div className={styles.configArea}>
            <div className={styles.field} style={{ marginBottom: '10px' }}>
              <label>Register</label>
              <select 
                className="nodrag"
                value={module.magentaConfig?.register ?? 0}
                onChange={(e) => updateModule(module.id, { 
                  magentaConfig: { ...module.magentaConfig!, register: parseInt(e.target.value) } 
                })}
              >
                <option value={12}>Soprano (+1 Oct)</option>
                <option value={0}>Alto (Default)</option>
                <option value={-12}>Tenor (-1 Oct)</option>
                <option value={-24}>Bass (-2 Oct)</option>
              </select>
            </div>
            <div className={styles.paramHandleRow}>
              <Handle type="target" position={Position.Left} id="temperature" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              <span style={{ fontSize: '10px' }}>Temperature (0-1)</span>
            </div>
            <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
              <Handle type="target" position={Position.Left} id="density" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              <span style={{ fontSize: '10px' }}>Density (0-1)</span>
            </div>
          </div>
        )}

        {(module.type === 'harmonic_array' || module.type === 'magenta_ai') && (
          <div className={styles.outputs}>
            <div className={styles.outRow}>
              <span>Sequence Output</span>
              <Handle type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#ff6b6b' }} />
            </div>
          </div>
        )}

        {/* ── Chord Progression Node ── */}
        {module.type === 'chord_progression' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field}>
                <label>Mode</label>
                <select
                  className="nodrag"
                  value={module.chordProgressionConfig?.mode ?? 'major'}
                  onChange={(e) => updateModule(module.id, {
                    chordProgressionConfig: {
                      ...module.chordProgressionConfig!,
                      mode: e.target.value as 'major' | 'minor' | 'dorian' | 'mixolydian',
                    },
                  })}
                >
                  <option value="major">Major</option>
                  <option value="minor">Minor</option>
                  <option value="dorian">Dorian</option>
                  <option value="mixolydian">Mixolydian</option>
                </select>
              </div>
              <div className={styles.paramHandleRow}>
                <Handle type="target" position={Position.Left} id="tension" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Tension (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="rate" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Rate (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="key" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Key (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Chord Data</span>
                <Handle type="source" position={Position.Right} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#f59e0b' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Melody Gen Node ── */}
        {module.type === 'melody_gen' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field} style={{ marginBottom: '10px' }}>
                <label>Register</label>
                <select
                  className="nodrag"
                  value={module.melodyGenConfig?.register ?? 0}
                  onChange={(e) => updateModule(module.id, {
                    melodyGenConfig: {
                      ...module.melodyGenConfig!,
                      register: parseInt(e.target.value),
                    },
                  })}
                >
                  <option value={12}>Soprano (+1 Oct)</option>
                  <option value={0}>Alto (Default)</option>
                  <option value={-12}>Tenor (-1 Oct)</option>
                  <option value={-24}>Bass (-2 Oct)</option>
                </select>
              </div>
              <div className={styles.paramHandleRow}>
                <Handle type="target" position={Position.Left} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Chord Data</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="temperature" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Temperature (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="density" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Density (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <Handle type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#34d399' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Chord Gen Node ── */}
        {module.type === 'chord_gen' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field} style={{ marginBottom: '10px' }}>
                <label>Register</label>
                <select
                  className="nodrag"
                  value={module.chordGenConfig?.register ?? 0}
                  onChange={(e) => updateModule(module.id, {
                    chordGenConfig: {
                      ...module.chordGenConfig!,
                      register: parseInt(e.target.value),
                      style: module.chordGenConfig?.style ?? 'block',
                    },
                  })}
                >
                  <option value={12}>Soprano (+1 Oct)</option>
                  <option value={0}>Alto (Default)</option>
                  <option value={-12}>Tenor (-1 Oct)</option>
                  <option value={-24}>Bass (-2 Oct)</option>
                </select>
              </div>
              <div className={styles.field}>
                <label>Style</label>
                <select
                  className="nodrag"
                  value={module.chordGenConfig?.style ?? 'block'}
                  onChange={(e) => updateModule(module.id, {
                    chordGenConfig: {
                      ...module.chordGenConfig!,
                      register: module.chordGenConfig?.register ?? 0,
                      style: e.target.value as 'block' | 'arpeggio' | 'broken',
                    },
                  })}
                >
                  <option value="block">Block</option>
                  <option value="arpeggio">Arpeggio</option>
                  <option value="broken">Broken</option>
                </select>
              </div>
              <div className={styles.paramHandleRow}>
                <Handle type="target" position={Position.Left} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Chord Data</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="rhythm" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Rhythm (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <Handle type="target" position={Position.Left} id="voicing" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Voicing (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <Handle type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#818cf8' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Voice Splitter Node ── */}
        {module.type === 'voice_splitter' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.paramHandleRow}>
                <Handle type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence Input</span>
              </div>
            </div>
            <div className={styles.outputs}>
              {[0, 1, 2, 3].map((i) => (
                <div className={styles.outRow} key={`voice_${i}`}>
                  <span>Voice {i}</span>
                  <Handle type="source" position={Position.Right} id={`voice_${i}`} className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#f472b6' }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Register Shift Node ── */}
        {module.type === 'register_shift' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field} style={{ marginBottom: '10px' }}>
                <label>Shift (semitones)</label>
                <select
                  className="nodrag"
                  value={module.registerShiftConfig?.shift ?? 0}
                  onChange={(e) => updateModule(module.id, {
                    registerShiftConfig: { shift: parseInt(e.target.value) },
                  })}
                >
                  <option value={-24}>-24 (-2 Oct)</option>
                  <option value={-12}>-12 (-1 Oct)</option>
                  <option value={0}>0 (No shift)</option>
                  <option value={12}>+12 (+1 Oct)</option>
                  <option value={24}>+24 (+2 Oct)</option>
                </select>
              </div>
              <div className={styles.paramHandleRow}>
                <Handle type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence Input</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <Handle type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#a78bfa' }} />
              </div>
            </div>
          </>
        )}

        {(module.type === 'chord_progression' || module.type === 'melody_gen' || module.type === 'chord_gen' || module.type === 'voice_splitter' || module.type === 'register_shift') && (
          <NodeVisualizer moduleId={module.id} type={module.type} />
        )}

        {module.type === 'audio_preview' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <button
              className={styles.btn}
              style={{ background: module.audioPreviewConfig?.isPlaying ? '#f43f5e' : '#10b981', color: 'white', width: '100%', padding: '6px' }}
              onClick={() => {
                // Resume audio context from user interaction
                import('@/audio/MusicEngine').then(m => m.musicEngine.resumeAudioContext());
                updateModule(module.id, {
                  audioPreviewConfig: {
                    ...(module.audioPreviewConfig || { waveType: 'sine' }),
                    isPlaying: !module.audioPreviewConfig?.isPlaying
                  }
                });
              }}
            >
              {module.audioPreviewConfig?.isPlaying ? 'STOP' : 'PLAY'}
            </button>
            <select
              className={styles.select}
              value={module.audioPreviewConfig?.waveType || 'sine'}
              onChange={(e) => updateModule(module.id, {
                audioPreviewConfig: {
                  ...(module.audioPreviewConfig || { isPlaying: false }),
                  waveType: e.target.value as any
                }
              })}
            >
              <option value="sine">Sine</option>
              <option value="square">Square</option>
              <option value="sawtooth">Sawtooth</option>
              <option value="triangle">Triangle</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
