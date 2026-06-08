import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useMusicStore } from '@/store/musicStore';
import { MusicModule, MusicModuleType } from '@/store/musicStore';
import styles from './MusicModuleNode.module.css';
import { musicEngine } from '@/audio/MusicEngine';
import { getHandleDataType, getCableColor } from '@/utils/musicNodeTypes';
import { useAudioMapStore } from '@/store/audioMapStore';

// Custom TypedHandle wrapper to automatically apply color based on node type and handle id
function TypedHandle({ type, position, id, className, style, nodeType }: any) {
  const isSource = type === 'source';
  const dataType = getHandleDataType(nodeType, id, isSource);
  const color = getCableColor(dataType);
  
  return (
    <Handle 
      type={type} 
      position={position} 
      id={id} 
      className={className} 
      style={{ ...style, background: color, border: `2px solid ${color}` }} 
      title={`Type: ${dataType.toUpperCase()}`}
    />
  );
}

interface MusicModuleNodeProps {
  data: {
    module: MusicModule;
  };
  selected?: boolean;
}

const BORDER_COLORS: Record<string, string> = {
  chord_progression: '#f59e0b',
  melody_gen: '#34d399',
  chord_gen: '#818cf8',
  voice_splitter: '#f472b6',
  sequence_adder: '#34d399',
  register_shift: '#a78bfa',
};

function getBorderClass(type: string): string {
  return '';
}

function getBorderStyle(type: string): React.CSSProperties | undefined {
  const color = BORDER_COLORS[type];
  if (color) return { borderTop: `4px solid ${color}` };
  return undefined;
}

export default function MusicModuleNode({ data, selected }: MusicModuleNodeProps) {
  const { module } = data;
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
  } else if ((type === 'melody_gen' || type === 'register_shifter' || type === 'sequence_morpher' || type === 'piano_genie') && output.pitches) {
    const preview = output.pitches.slice(0, 4).map((p: number, i: number) => output.gates[i] ? getNoteName(p) : '-').join(' ');
    content = <div>Seq: {preview}...</div>;
  } else if ((type === 'chord_gen' || type === 'coconet_harmonizer') && output.pitches && output.pitches[0]) {
    const firstStep = Array.isArray(output.pitches[0]) ? output.pitches[0] : [output.pitches[0]];
    const preview = firstStep.map((p: number) => getNoteName(p)).join(',');
    content = <div>Chd: [{preview}]...</div>;
  } else if (type === 'voice_splitter' && output.pitches) {
    const preview = output.pitches.slice(0, 4).map((p: number, i: number) => output.gates[i] ? getNoteName(p) : '-').join(' ');
    content = <div>V0: {preview}...</div>;
  } else if (type === 'sequence_adder' && output.pitches) {
    const preview = output.pitches.slice(0, 4).map((p: number, i: number) => output.gates[i] ? getNoteName(p) : '-').join(' ');
    content = <div>Add: {preview}...</div>;
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
      <div className={styles.header}>
        <input 
          className={`${styles.title} nodrag`} 
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '2px 4px', width: '130px' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Output Name"
        />
        <button className={styles.deleteBtn} onClick={() => removeModule(module.id)} title="Delete Module">×</button>
      </div>

      <div className={styles.body}>
        {/* Driving Input Handle for Generators */}

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
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {module.type === 'preview_util' && (
          <div className={styles.configArea}>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '50%' }} />
            <div className={styles.field} style={{ textAlign: 'center', marginTop: '10px' }}>
              <button 
                style={{ 
                  background: module.previewUtilConfig?.playing ? '#ff4757' : '#4cd137', 
                  color: 'white', border: 'none', borderRadius: '4px', padding: '6px 16px', cursor: 'pointer', fontWeight: 'bold' 
                }}
                onClick={() => {
                  const isPlaying = module.previewUtilConfig?.playing;
                  updateModule(module.id, { previewUtilConfig: { playing: !isPlaying } });
                  musicEngine.togglePreviewUtil(module.id, !isPlaying);
                }}
              >
                {module.previewUtilConfig?.playing ? 'STOP' : 'PREVIEW'}
              </button>
            </div>
          </div>
        )}

        {module.type === 'seq_to_freq' && (
          <div className={styles.configArea}>
            <div className={styles.field} style={{ textAlign: 'center', margin: '8px 0' }}>
              <span style={{ fontSize: '11px', color: '#ccc' }}>Seq → Freq Convert</span>
            </div>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: '50%' }} />
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
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
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
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
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}



        {/* ── Harmonic Progressor Node ── */}
        {module.type === 'harmonic_progressor' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.paramHandleRow} style={{ marginTop: '4px', marginBottom: '4px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="valence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Valence (Neg-Pos)</span>
              </div>
              <div className={styles.field} style={{ marginBottom: '8px' }}>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={module.harmonicProgressorConfig?.valence ?? 0.5}
                  onChange={(e) => updateModule(module.id, {
                    harmonicProgressorConfig: { ...module.harmonicProgressorConfig!, valence: parseFloat(e.target.value), arousal: module.harmonicProgressorConfig?.arousal ?? 0.5 }
                  })}
                  style={{ width: '100%' }} className="nodrag"
                />
              </div>

              <div className={styles.paramHandleRow} style={{ marginBottom: '4px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="arousal" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Arousal (Calm-Exc)</span>
              </div>
              <div className={styles.field}>
                <input
                  type="range" min="0" max="1" step="0.01"
                  value={module.harmonicProgressorConfig?.arousal ?? 0.5}
                  onChange={(e) => updateModule(module.id, {
                    harmonicProgressorConfig: { ...module.harmonicProgressorConfig!, arousal: parseFloat(e.target.value), valence: module.harmonicProgressorConfig?.valence ?? 0.5 }
                  })}
                  style={{ width: '100%' }} className="nodrag"
                />
                <div style={{ textAlign: 'center', fontSize: '12px', marginTop: '8px', color: '#f59e0b', fontWeight: 'bold' }}>
                  {module.harmonicProgressorConfig?.currentCategoryName || 'Neutral / Jazzy'}
                </div>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Harmony Context</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#f59e0b' }} />
              </div>
            </div>
          </>
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
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="tension" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Tension (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="rate" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Rate (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="key" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Key (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Chord Data</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#f59e0b' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Melody Gen Node ── */}
        {module.type === 'melody_gen' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field} style={{ marginBottom: '10px' }}>
                <label>Algorithm</label>
                <select
                  className="nodrag"
                  value={module.melodyGenConfig?.algorithm ?? 'procedural'}
                  onChange={(e) => updateModule(module.id, {
                    melodyGenConfig: {
                      ...module.melodyGenConfig!,
                      algorithm: e.target.value as 'procedural' | 'magenta',
                    },
                  })}
                >
                  <option value="procedural">Procedural</option>
                  <option value="magenta">Magenta AI</option>
                </select>
              </div>
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
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Harmony Context</span>
              </div>
              
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="density" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Rhythmic Complexity (0-1)</span>
              </div>

              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="swingAmount" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Swing Amount (0-1)</span>
              </div>

              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="temperature" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Temperature (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#34d399' }} />
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
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="chordData" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Chord Data</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="rhythm" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Rhythm (0-1)</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="voicing" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Voicing (0-1)</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#818cf8' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Voice Splitter Node ── */}
        {module.type === 'voice_splitter' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.paramHandleRow}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence Input</span>
              </div>
            </div>
            <div className={styles.outputs}>
              {[0, 1, 2, 3].map((i) => (
                <div className={styles.outRow} key={`voice_${i}`}>
                  <span>Voice {i}</span>
                  <TypedHandle nodeType={module.type} type="source" position={Position.Right} id={`voice_${i}`} className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#f472b6' }} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Sequence Adder Node ── */}
        {module.type === 'sequence_adder' && (
          <>
            <div className={styles.configArea}>
              {[0, 1, 2].map((i) => (
                <div className={styles.paramHandleRow} key={`in_${i}`} style={{ marginBottom: '8px' }}>
                  <TypedHandle nodeType={module.type} type="target" position={Position.Left} id={`in_${i}`} className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                  <span style={{ fontSize: '10px' }}>Input {i}</span>
                </div>
              ))}
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#34d399' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Register Shifter Node ── */}
        {module.type === 'register_shifter' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.field} style={{ marginBottom: '10px' }}>
                <label>Shift (semitones)</label>
                <select
                  className="nodrag"
                  value={module.registerShifterConfig?.semitones ?? 0}
                  onChange={(e) => updateModule(module.id, {
                    registerShifterConfig: { semitones: parseInt(e.target.value) },
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
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence Input</span>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Sequence Output</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#a78bfa' }} />
              </div>
            </div>
          </>
        )}

        {/* ── Sequence Morpher Node ── */}
        {module.type === 'sequence_morpher' && (
          <>
            <div className={styles.configArea}>
              <div className={styles.paramHandleRow} style={{ marginBottom: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="seqA" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence A</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginBottom: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="seqB" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <span style={{ fontSize: '10px' }}>Sequence B</span>
              </div>
              <div className={styles.paramHandleRow} style={{ marginTop: '8px', marginBottom: '8px' }}>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="morphAmount" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                  <label style={{ fontSize: '10px' }}>Morph (A ↔ B)</label>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={module.sequenceMorpherConfig?.morphAmount ?? 0.5}
                    onChange={(e) => updateModule(module.id, {
                      sequenceMorpherConfig: { morphAmount: parseFloat(e.target.value) }
                    })}
                    style={{ width: '100%' }} className="nodrag"
                  />
                </div>
              </div>
            </div>
            <div className={styles.outputs}>
              <div className={styles.outRow}>
                <span>Morphed Sequence</span>
                <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', right: '-20px', background: '#fb7185' }} />
              </div>
            </div>
          </>
        )}



        {(module.type === 'chord_progression' || module.type === 'melody_gen' || module.type === 'chord_gen' || module.type === 'voice_splitter' || module.type === 'register_shifter' || module.type === 'sequence_morpher') && (
          <NodeVisualizer moduleId={module.id} type={module.type} />
        )}



        {/* ── Score Out Node ── */}
        {module.type === 'score_out' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <select
              className="nodrag"
              value={module.scoreOutConfig?.instrument ?? 'synth'}
              onChange={(e) => updateModule(module.id, {
                scoreOutConfig: { ...module.scoreOutConfig!, instrument: e.target.value as any }
              })}
              style={{ width: '100%', marginBottom: '4px' }}
            >
              <option value="synth">Synth</option>
              <option value="piano">Piano</option>
              <option value="marimba">Marimba</option>
            </select>
            <button
              className={styles.btn}
              style={{ background: module.scoreOutConfig?.isPlaying ? '#f43f5e' : '#10b981', color: 'white', width: '100%', padding: '6px' }}
              onClick={async () => {
                await musicEngine.resumeAudioContext();
                updateModule(module.id, {
                  scoreOutConfig: {
                    ...module.scoreOutConfig!,
                    isPlaying: !module.scoreOutConfig?.isPlaying
                  }
                });
              }}
            >
              {module.scoreOutConfig?.isPlaying ? 'STOP AUDIO' : 'PLAY AUDIO'}
            </button>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
          </div>
        )}

        {/* ── AI Seq Out Node ── */}
        {module.type === 'ai_seq_out' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input 
                type="checkbox" 
                checked={module.aiSeqOutConfig?.masterClockEnabled ?? true} 
                onChange={(e) => updateModule(module.id, {
                  aiSeqOutConfig: { ...module.aiSeqOutConfig!, masterClockEnabled: e.target.checked }
                })}
              />
              Enable Master Clock (Sync Noisecraft)
            </label>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
          </div>
        )}

        {/* ── Seq Out Node ── */}
        {module.type === 'seq_out' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <select
              className="nodrag"
              value={module.seqOutConfig?.channel ?? 'A'}
              onChange={(e) => updateModule(module.id, {
                seqOutConfig: { ...module.seqOutConfig!, channel: e.target.value }
              })}
              style={{ width: '100%', marginBottom: '4px' }}
            >
              <option value="A">Channel A</option>
              <option value="B">Channel B</option>
              <option value="C">Channel C</option>
              <option value="D">Channel D</option>
            </select>
            <span style={{ fontSize: '10px', color: '#888' }}>Broadcasts to Audio Editor</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
          </div>
        )}

        {/* ── Track Out Node ── */}
        {module.type === 'track_out' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <input 
              type="text" 
              className="nodrag"
              value={module.trackOutConfig?.trackName ?? 'Track 1'}
              onChange={(e) => updateModule(module.id, {
                trackOutConfig: { trackName: e.target.value }
              })}
              placeholder="Track Name"
              style={{ width: '100%', marginBottom: '4px' }}
            />
            <span style={{ fontSize: '10px', color: '#888' }}>Routes Audio to Track</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-40px', top: '45%' }}>Audio In</span>
          </div>
        )}

        {/* ── Player Out Node ── */}
        {module.type === 'player_out' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <input 
              type="text" 
              className="nodrag"
              value={module.playerOutConfig?.trackName ?? 'Track 1'}
              onChange={(e) => updateModule(module.id, {
                playerOutConfig: { ...module.playerOutConfig!, trackName: e.target.value }
              })}
              placeholder="Track Name"
              style={{ width: '100%', marginBottom: '4px' }}
            />
            <button 
              className="nodrag" 
              onClick={async () => {
                updateModule(module.id, { playerOutConfig: { ...module.playerOutConfig!, isPlaying: !module.playerOutConfig?.isPlaying } });
                const { musicEngine } = await import('@/audio/MusicEngine');
                setTimeout(() => musicEngine.playTracks(), 50);
              }}
              style={{ width: '100%', padding: '4px', background: module.playerOutConfig?.isPlaying ? '#4caf50' : '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              {module.playerOutConfig?.isPlaying ? 'Playing' : 'Stopped'}
            </button>
            <span style={{ fontSize: '10px', color: '#888' }}>Plays Seq on Track</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: '30%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-40px', top: '25%' }}>Seq In</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="instrument" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-40px', top: '65%' }}>Inst In</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', right: '-45px', top: '65%' }}>Inst Out</span>
          </div>
        )}

        {/* ── Virtual Instrument Node ── */}
        {module.type === 'virtual_instrument' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <select
              className="nodrag"
              value={module.virtualInstrumentConfig?.instrument ?? 'acoustic_grand_piano'}
              onChange={(e) => updateModule(module.id, {
                virtualInstrumentConfig: { ...module.virtualInstrumentConfig!, instrument: e.target.value, volume: module.virtualInstrumentConfig?.volume ?? 0.8 }
              })}
              style={{ width: '100%', marginBottom: '4px' }}
            >
              <option value="acoustic_grand_piano">Piano</option>
              <option value="marimba">Marimba</option>
              <option value="synth_bass_1">Synth Bass</option>
              <option value="electric_guitar_clean">Electric Guitar</option>
              <option value="violin">Violin</option>
              <option value="flute">Flute</option>
            </select>
            <input 
              type="range" className="nodrag" min="0" max="1" step="0.01" 
              value={module.virtualInstrumentConfig?.volume ?? 0.8}
              onChange={(e) => updateModule(module.id, {
                virtualInstrumentConfig: { ...module.virtualInstrumentConfig!, instrument: module.virtualInstrumentConfig?.instrument ?? 'acoustic_grand_piano', volume: parseFloat(e.target.value) }
              })}
            />
            <span style={{ fontSize: '10px', color: '#888' }}>Volume</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="volume" className={styles.handle} style={{ top: '80%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-40px', top: '75%' }}>Volume</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
          </div>
        )}

        {/* ── PolySynth Node ── */}
        {module.type === 'polysynth' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                className="nodrag"
                value={module.polysynthConfig?.oscillatorCategory ?? 'basic'}
                onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, oscillatorCategory: e.target.value as any } })}
                style={{ flex: 1 }}
              >
                <option value="basic">Basic</option>
                <option value="fat">Fat</option>
                <option value="fm">FM</option>
                <option value="am">AM</option>
              </select>
              <select
                className="nodrag"
                value={module.polysynthConfig?.oscillatorType ?? 'sine'}
                onChange={(e) => updateModule(module.id, {
                  polysynthConfig: { ...module.polysynthConfig!, oscillatorType: e.target.value as any }
                })}
                style={{ flex: 1 }}
              >
                <option value="sine">Sine</option>
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="triangle">Triangle</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
              <label>Partials (0=off):</label>
              <input type="number" className="nodrag" min="0" max="32" style={{ width: '35px' }} value={module.polysynthConfig?.partialsCount ?? 0} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, partialsCount: parseInt(e.target.value, 10) || 0 } })} />
            </div>
            {module.polysynthConfig?.oscillatorCategory === 'fat' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                <label>Count:</label>
                <input type="number" className="nodrag" min="1" max="8" style={{ width: '30px' }} value={module.polysynthConfig?.fatCount ?? 3} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, fatCount: parseInt(e.target.value, 10) || 3 } })} />
                <label>Spread:</label>
                <input type="number" className="nodrag" min="0" max="100" style={{ width: '40px' }} value={module.polysynthConfig?.fatSpread ?? 30} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, fatSpread: parseInt(e.target.value, 10) || 30 } })} />
              </div>
            )}
            <div style={{ display: 'flex', gap: '4px', fontSize: '9px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <input type="range" className="nodrag" min="0.01" max="2" step="0.01" style={{ width: '30px' }} value={module.polysynthConfig?.attack ?? 0.1} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, attack: parseFloat(e.target.value) } })} /> A
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="attack" className={styles.handle} style={{ left: '50%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <input type="range" className="nodrag" min="0.01" max="2" step="0.01" style={{ width: '30px' }} value={module.polysynthConfig?.decay ?? 0.2} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, decay: parseFloat(e.target.value) } })} /> D
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="decay" className={styles.handle} style={{ left: '50%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '30px' }} value={module.polysynthConfig?.sustain ?? 0.5} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, sustain: parseFloat(e.target.value) } })} /> S
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="sustain" className={styles.handle} style={{ left: '50%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <input type="range" className="nodrag" min="0.01" max="5" step="0.01" style={{ width: '30px' }} value={module.polysynthConfig?.release ?? 1.0} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, release: parseFloat(e.target.value) } })} /> R
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="release" className={styles.handle} style={{ left: '50%' }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', marginTop: '4px' }}>
              <label>Gain (Vol):</label>
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '100%' }} value={module.polysynthConfig?.volume ?? 0.8} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, volume: parseFloat(e.target.value) } })} />
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="volume" className={styles.handle} style={{ left: '50%' }} />
              </div>
            </div>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Oscillator Node ── */}
        {module.type === 'oscillator' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                className="nodrag"
                value={module.oscillatorConfig?.oscillatorCategory ?? 'basic'}
                onChange={(e) => updateModule(module.id, { oscillatorConfig: { ...module.oscillatorConfig!, oscillatorCategory: e.target.value as any } })}
                style={{ flex: 1 }}
              >
                <option value="basic">Basic</option>
                <option value="fat">Fat</option>
                <option value="fm">FM</option>
                <option value="am">AM</option>
              </select>
              <select
                className="nodrag"
                value={module.oscillatorConfig?.type ?? 'sine'}
                onChange={(e) => updateModule(module.id, {
                  oscillatorConfig: { ...module.oscillatorConfig!, type: e.target.value as any }
                })}
                style={{ flex: 1 }}
              >
                <option value="sine">Sine</option>
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
                <option value="triangle">Triangle</option>
                <option value="pinknoise">Pink Noise</option>
                <option value="whitenoise">White Noise</option>
              </select>
            </div>
            {module.oscillatorConfig?.type !== 'pinknoise' && module.oscillatorConfig?.type !== 'whitenoise' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                  <label>Partials (0=off):</label>
                  <input type="number" className="nodrag" min="0" max="32" style={{ width: '35px' }} value={module.oscillatorConfig?.partialsCount ?? 0} onChange={(e) => updateModule(module.id, { oscillatorConfig: { ...module.oscillatorConfig!, partialsCount: parseInt(e.target.value, 10) || 0 } })} />
                </div>
                {module.oscillatorConfig?.oscillatorCategory === 'fat' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                    <label>Count:</label>
                    <input type="number" className="nodrag" min="1" max="8" style={{ width: '30px' }} value={module.oscillatorConfig?.fatCount ?? 3} onChange={(e) => updateModule(module.id, { oscillatorConfig: { ...module.oscillatorConfig!, fatCount: parseInt(e.target.value, 10) || 3 } })} />
                    <label>Spread:</label>
                    <input type="number" className="nodrag" min="0" max="100" style={{ width: '40px' }} value={module.oscillatorConfig?.fatSpread ?? 30} onChange={(e) => updateModule(module.id, { oscillatorConfig: { ...module.oscillatorConfig!, fatSpread: parseInt(e.target.value, 10) || 30 } })} />
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', marginTop: '4px' }}>
              <label>Gain (Vol):</label>
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '100%' }} value={module.oscillatorConfig?.volume ?? 0.8} onChange={(e) => updateModule(module.id, { oscillatorConfig: { ...module.oscillatorConfig!, volume: parseFloat(e.target.value) } })} />
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="volume" className={styles.handle} style={{ left: '50%' }} />
              </div>
            </div>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── ADSR Envelope Node ── */}
        {module.type === 'adsr_envelope' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', fontSize: '9px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <input type="range" className="nodrag" min="0.01" max="2" step="0.01" style={{ width: '30px' }} value={module.adsrEnvelopeConfig?.attack ?? 0.1} onChange={(e) => updateModule(module.id, { adsrEnvelopeConfig: { ...module.adsrEnvelopeConfig!, attack: parseFloat(e.target.value) } })} /> A
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <input type="range" className="nodrag" min="0.01" max="2" step="0.01" style={{ width: '30px' }} value={module.adsrEnvelopeConfig?.decay ?? 0.2} onChange={(e) => updateModule(module.id, { adsrEnvelopeConfig: { ...module.adsrEnvelopeConfig!, decay: parseFloat(e.target.value) } })} /> D
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '30px' }} value={module.adsrEnvelopeConfig?.sustain ?? 0.5} onChange={(e) => updateModule(module.id, { adsrEnvelopeConfig: { ...module.adsrEnvelopeConfig!, sustain: parseFloat(e.target.value) } })} /> S
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <input type="range" className="nodrag" min="0.01" max="5" step="0.01" style={{ width: '30px' }} value={module.adsrEnvelopeConfig?.release ?? 1.0} onChange={(e) => updateModule(module.id, { adsrEnvelopeConfig: { ...module.adsrEnvelopeConfig!, release: parseFloat(e.target.value) } })} /> R
              </div>
            </div>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument" className={styles.handle} style={{ top: '50%' }} />
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Filter Node ── */}
        {module.type === 'filter' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <select
              className="nodrag"
              value={module.filterConfig?.type ?? 'lowpass'}
              onChange={(e) => updateModule(module.id, {
                filterConfig: { ...module.filterConfig!, type: e.target.value as any }
              })}
              style={{ width: '100%' }}
            >
              <option value="lowpass">Lowpass</option>
              <option value="highpass">Highpass</option>
              <option value="bandpass">Bandpass</option>
              <option value="notch">Notch</option>
            </select>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '9px' }}>Freq: {module.filterConfig?.frequency ?? 1000}Hz</label>
              <input type="range" className="nodrag" min="20" max="20000" step="1" style={{ width: '100%' }} value={module.filterConfig?.frequency ?? 1000} onChange={(e) => updateModule(module.id, { filterConfig: { ...module.filterConfig!, frequency: parseFloat(e.target.value) } })} />
              <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="frequency" className={styles.handle} style={{ left: '50%' }} />
            </div>
            <div style={{ position: 'relative' }}>
              <label style={{ fontSize: '9px' }}>Q: {module.filterConfig?.Q ?? 1}</label>
              <input type="range" className="nodrag" min="0.1" max="20" step="0.1" style={{ width: '100%' }} value={module.filterConfig?.Q ?? 1} onChange={(e) => updateModule(module.id, { filterConfig: { ...module.filterConfig!, Q: parseFloat(e.target.value) } })} />
              <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="q" className={styles.handle} style={{ left: '50%' }} />
            </div>
            
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument" className={styles.handle} style={{ top: '50%' }} />
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Reverb Node ── */}
        {module.type === 'reverb' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <label style={{ fontSize: '9px' }}>Decay: {module.reverbConfig?.decay ?? 1.5}s</label>
            <input type="range" className="nodrag" min="0.1" max="10" step="0.1" value={module.reverbConfig?.decay ?? 1.5} onChange={(e) => updateModule(module.id, { reverbConfig: { ...module.reverbConfig!, decay: parseFloat(e.target.value) } })} />
            <label style={{ fontSize: '9px' }}>Wet: {module.reverbConfig?.wet ?? 0.5}</label>
            <input type="range" className="nodrag" min="0" max="1" step="0.01" value={module.reverbConfig?.wet ?? 0.5} onChange={(e) => updateModule(module.id, { reverbConfig: { ...module.reverbConfig!, wet: parseFloat(e.target.value) } })} />
            
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument" className={styles.handle} style={{ top: '50%' }} />
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Mix Node ── */}
        {module.type === 'mix_node' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <label style={{ fontSize: '9px' }}>Vol A: {module.mixNodeConfig?.volA ?? 1.0}</label>
            <input type="range" className="nodrag" min="0" max="1" step="0.01" value={module.mixNodeConfig?.volA ?? 1.0} onChange={(e) => updateModule(module.id, { mixNodeConfig: { ...module.mixNodeConfig!, volA: parseFloat(e.target.value) } })} />
            <label style={{ fontSize: '9px' }}>Vol B: {module.mixNodeConfig?.volB ?? 1.0}</label>
            <input type="range" className="nodrag" min="0" max="1" step="0.01" value={module.mixNodeConfig?.volB ?? 1.0} onChange={(e) => updateModule(module.id, { mixNodeConfig: { ...module.mixNodeConfig!, volB: parseFloat(e.target.value) } })} />
            
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument_a" className={styles.handle} style={{ top: '30%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '25%' }}>A</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument_b" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '65%' }}>B</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Universal Preview Node ── */}
        {module.type === 'universal_preview' && (
          (() => {
            const edges = useMusicStore.getState().edges;
            const hasAudio = edges.some(e => e.target === module.id && e.targetHandle === 'audio_in');
            const hasSeq = edges.some(e => e.target === module.id && e.targetHandle === 'seq_in');
            const hasCtrl = edges.some(e => e.target === module.id && e.targetHandle === 'control_in');
            
            return (
              <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <div style={{ padding: '8px', background: '#222', borderRadius: '4px', textAlign: 'center', fontSize: '10px' }}>
                  {hasAudio && <span style={{ color: '#f43f5e' }}>[Audio Detected]</span>}
                  {hasSeq && !hasAudio && <span style={{ color: '#818cf8' }}>[Sequence Detected]</span>}
                  {hasCtrl && !hasAudio && !hasSeq && <span style={{ color: '#34d399' }}>[Control Detected]</span>}
                  {!hasAudio && !hasSeq && !hasCtrl && <span style={{ color: '#9ca3af' }}>[Awaiting Connection]</span>}
                </div>
                
                <button
                  className={styles.btn}
                  style={{
                    background: module.universalPreviewConfig?.playing ? '#ff6b6b' : '#333',
                    color: 'white'
                  }}
                  onClick={() => {
                    const isPlaying = !module.universalPreviewConfig?.playing;
                    updateModule(module.id, { universalPreviewConfig: { ...module.universalPreviewConfig!, playing: isPlaying } });
                    musicEngine.toggleUniversalPreview(module.id, isPlaying);
                  }}
                >
                  {module.universalPreviewConfig?.playing ? 'Stop Preview' : 'Play / Test'}
                </button>
                
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '30%' }} />
                <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '25%', color: '#f43f5e' }}>Aud</span>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="seq_in" className={styles.handle} style={{ top: '50%' }} />
                <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '45%', color: '#818cf8' }}>Seq</span>
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="control_in" className={styles.handle} style={{ top: '70%' }} />
                <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '65%', color: '#34d399' }}>Ctrl</span>
              </div>
            );
          })()
        )}

      </div>
    </div>
  );
}
