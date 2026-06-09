import React from 'react';
import { Handle, Position, useEdges } from '@xyflow/react';
import { useMusicStore } from '@/store/musicStore';
import { MusicModule, MusicModuleType } from '@/store/musicStore';
import styles from './MusicModuleNode.module.css';
import { musicEngine } from '@/audio/MusicEngine';
import { getHandleDataType, getCableColor } from '@/utils/musicNodeTypes';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { useSensorStore } from '@/store/sensorStore';
import { getNearestMoods } from '@/audio/mood_keywords';

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

const InteractiveADSR = ({ cfg, onChange }: { cfg: any, onChange: (c: any) => void }) => {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = React.useState<'A' | 'D' | 'S' | 'R' | null>(null);
  const [localCfg, setLocalCfg] = React.useState(cfg);

  // Sync local state if external cfg changes (and not dragging)
  React.useEffect(() => {
    if (!dragging) setLocalCfg(cfg);
  }, [cfg, dragging]);

  const W = 200;
  const H = 80;
  const MAX_TIME = 9.0;
  const pxPerSec = W / MAX_TIME;
  
  const aX = localCfg.attack * pxPerSec;
  const dX = aX + localCfg.decay * pxPerSec;
  const sY = H - (localCfg.sustain * H);
  const sustainWidth = 2 * pxPerSec;
  const sX = dX + sustainWidth;
  const rX = Math.min(W, sX + localCfg.release * pxPerSec);

  const handlePointerDown = (e: React.PointerEvent, pt: 'A' | 'D' | 'S' | 'R') => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(pt);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let newCfg = { ...localCfg };
    if (dragging === 'A') {
      newCfg.attack = Math.max(0.01, Math.min(x / pxPerSec, 2.0));
    } else if (dragging === 'D') {
      newCfg.decay = Math.max(0.01, Math.min((x - aX) / pxPerSec, 2.0));
      newCfg.sustain = Math.max(0, Math.min(1.0 - (y / H), 1.0));
    } else if (dragging === 'S') {
      newCfg.sustain = Math.max(0, Math.min(1.0 - (y / H), 1.0));
    } else if (dragging === 'R') {
      newCfg.release = Math.max(0.01, Math.min((x - sX) / pxPerSec, 5.0));
    }
    setLocalCfg(newCfg);
    onChange(newCfg);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(null);
    onChange(localCfg);
  };

  return (
    <svg 
      ref={svgRef}
      width="100%" 
      height={H} 
      viewBox={`0 0 ${W} ${H}`}
      className="nodrag"
      style={{ background: 'linear-gradient(180deg, #1a1a1a 0%, #2a2a2a 100%)', borderRadius: '6px', cursor: dragging ? 'grabbing' : 'crosshair', touchAction: 'none', border: '1px solid #333' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <linearGradient id="adsrGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      
      {/* Filled Area */}
      <polygon 
        points={`0,${H} ${aX},0 ${dX},${sY} ${sX},${sY} ${rX},${H}`}
        fill="url(#adsrGrad)"
      />
      {/* Line */}
      <polyline 
        points={`0,${H} ${aX},0 ${dX},${sY} ${sX},${sY} ${rX},${H}`}
        fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      />
      
      {/* Interactive Points - Invisible large hit areas + elegant small dots */}
      <g style={{ cursor: dragging === 'A' ? 'grabbing' : 'grab' }} onPointerDown={(e) => handlePointerDown(e, 'A')}>
        <circle cx={aX} cy={0} r={16} fill="transparent" />
        <circle cx={aX} cy={0} r={4} fill="#fff" stroke="#ec4899" strokeWidth="2" />
      </g>

      <g style={{ cursor: dragging === 'D' ? 'grabbing' : 'grab' }} onPointerDown={(e) => handlePointerDown(e, 'D')}>
        <circle cx={dX} cy={sY} r={16} fill="transparent" />
        <circle cx={dX} cy={sY} r={4} fill="#fff" stroke="#f59e0b" strokeWidth="2" />
      </g>

      <g style={{ cursor: dragging === 'S' ? 'ns-resize' : 'ns-resize' }} onPointerDown={(e) => handlePointerDown(e, 'S')}>
        <circle cx={sX} cy={sY} r={16} fill="transparent" />
        <circle cx={sX} cy={sY} r={4} fill="#fff" stroke="#10b981" strokeWidth="2" />
      </g>

      <g style={{ cursor: dragging === 'R' ? 'grabbing' : 'grab' }} onPointerDown={(e) => handlePointerDown(e, 'R')}>
        <circle cx={rX} cy={H} r={16} fill="transparent" />
        <circle cx={rX} cy={H} r={4} fill="#fff" stroke="#3b82f6" strokeWidth="2" />
      </g>
    </svg>
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
  trigger_node: '#ec4899', // Pink
  player_node: '#10b981', // Green
  out_node: '#10b981', // Green
  broadcast_node: '#10b981', // Green
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
  const [selectedFxId, setSelectedFxId] = React.useState<string | null>(null);

  const freqRef = React.useRef<HTMLSpanElement>(null);
  const qRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (module.type !== 'filter') return;
    
    let req: number;
    const loop = () => {
      const state = useMusicStore.getState();
      const streamsState = useAudioMapStore.getState().streams;
      const sensors = useSensorStore.getState();
      const sensorValues = { ppg: sensors.ppg, emg: sensors.emg, ecg: sensors.ecg, gsr: sensors.gsr, mouseX: sensors.mouseX, mouseY: sensors.mouseY };

      // Evaluate Freq
      const freqEdge = state.edges.find(e => e.target === module.id && e.targetHandle === 'frequency');
      if (freqEdge && freqRef.current) {
        const srcMod = state.modules.find(m => m.id === freqEdge.source);
        let rawVal = 0.5; // default center
        if (srcMod) {
          if (srcMod.type === 'slider') rawVal = srcMod.sliderConfig?.value ?? 0.5;
          else if (srcMod.type === 'virtual_stream' && srcMod.inputStreamId) rawVal = evaluateStreamValue(srcMod.inputStreamId, streamsState, sensorValues);
        }
        const normalized = Math.max(0, Math.min(1, rawVal));
        const hz = 20 * Math.pow(1000, normalized);
        freqRef.current.innerText = `${hz.toFixed(1)}Hz`;
      } else if (freqRef.current) {
        freqRef.current.innerText = '1000.0Hz';
      }

      // Evaluate Q
      const qEdge = state.edges.find(e => e.target === module.id && e.targetHandle === 'q');
      if (qEdge && qRef.current) {
        const srcMod = state.modules.find(m => m.id === qEdge.source);
        let rawVal = 0.5; // default center
        if (srcMod) {
          if (srcMod.type === 'slider') rawVal = srcMod.sliderConfig?.value ?? 0.5;
          else if (srcMod.type === 'virtual_stream' && srcMod.inputStreamId) rawVal = evaluateStreamValue(srcMod.inputStreamId, streamsState, sensorValues);
        }
        const normalized = Math.max(0, Math.min(1, rawVal));
        const qVal = 0.1 + normalized * (20 - 0.1);
        qRef.current.innerText = qVal.toFixed(2);
      } else if (qRef.current) {
        qRef.current.innerText = '1.00';
      }

      req = requestAnimationFrame(loop);
    };
    req = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(req);
  }, [module.id, module.type]);

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

        {module.type === 'lfo' && (
          <div className={styles.configArea}>
            <div className={styles.paramHandleRow} style={{ marginBottom: '4px' }}>
              <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="rate" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              <span style={{ fontSize: '10px' }}>Rate In (Hz)</span>
            </div>
            <div className={styles.field} style={{ marginBottom: '8px' }}>
              <label style={{ fontSize: '10px' }}>Rate (Hz): {module.lfoConfig?.rate?.toFixed(2) ?? '1.00'}</label>
              <input 
                type="range" min="0.1" max="20.0" step="0.1"
                className="nodrag"
                value={module.lfoConfig?.rate ?? 1.0}
                onChange={(e) => updateModule(module.id, { 
                  lfoConfig: { ...module.lfoConfig!, rate: parseFloat(e.target.value), waveform: module.lfoConfig?.waveform ?? 'sine' } 
                })}
              />
            </div>
            <div className={styles.field}>
              <select
                className="nodrag"
                value={module.lfoConfig?.waveform ?? 'sine'}
                onChange={(e) => updateModule(module.id, {
                  lfoConfig: { ...module.lfoConfig!, waveform: e.target.value as any, rate: module.lfoConfig?.rate ?? 1.0 }
                })}
                style={{ width: '100%', fontSize: '10px' }}
              >
                <option value="sine">Sine</option>
                <option value="triangle">Triangle</option>
                <option value="square">Square</option>
                <option value="sawtooth">Sawtooth</option>
              </select>
            </div>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="val" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Harmonic Progressor Node ── */}
        {module.type === 'harmonic_progressor' && (() => {
          const v = module.harmonicProgressorConfig?.valence ?? 0.5;
          const a = module.harmonicProgressorConfig?.arousal ?? 0.5;
          const nearestMoods = getNearestMoods(v, a, 3);
          const useAi = module.harmonicProgressorConfig?.useAiHarmony ?? false;
          const aiStatus = module.harmonicProgressorConfig?.aiHarmonyStatus ?? 'idle';

          // Detect external connections to valence / arousal handles
          const edges = useEdges();
          const valenceLinked = edges.some(
            (e) => e.target === module.id && e.targetHandle === 'valence'
          );
          const arousalLinked = edges.some(
            (e) => e.target === module.id && e.targetHandle === 'arousal'
          );

          // Status badge config
          const statusBadge: Record<string, { label: string; color: string; bg: string }> = {
            idle:    { label: 'AI Harmony',  color: '#888',    bg: 'rgba(255,255,255,0.06)' },
            loading: { label: '⟳ Generating…', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
            active:  { label: '✦ AI Active',  color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
            error:   { label: '✕ Retry next', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
          };
          const badge = statusBadge[aiStatus] ?? statusBadge.idle;

          return (
            <>
              <div className={styles.configArea}>
                <div className={styles.paramHandleRow} style={{ marginTop: '4px', marginBottom: '4px' }}>
                  <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="valence" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                  <span style={{ fontSize: '10px' }}>Valence (Neg-Pos)</span>
                  {valenceLinked && (
                    <span style={{ fontSize: '9px', marginLeft: '4px', color: '#60a5fa', opacity: 0.8 }}>linked</span>
                  )}
                </div>
                <div className={styles.field} style={{ marginBottom: '8px' }}>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={v}
                    disabled={valenceLinked}
                    onChange={(e) => updateModule(module.id, {
                      harmonicProgressorConfig: { ...module.harmonicProgressorConfig!, valence: parseFloat(e.target.value), arousal: a }
                    })}
                    style={{ width: '100%', opacity: valenceLinked ? 0.35 : 1, cursor: valenceLinked ? 'not-allowed' : 'pointer' }} className="nodrag"
                  />
                </div>

                <div className={styles.paramHandleRow} style={{ marginBottom: '4px' }}>
                  <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="arousal" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
                  <span style={{ fontSize: '10px' }}>Arousal (Calm-Exc)</span>
                  {arousalLinked && (
                    <span style={{ fontSize: '9px', marginLeft: '4px', color: '#60a5fa', opacity: 0.8 }}>linked</span>
                  )}
                </div>
                <div className={styles.field}>
                  <input
                    type="range" min="0" max="1" step="0.01"
                    value={a}
                    disabled={arousalLinked}
                    onChange={(e) => updateModule(module.id, {
                      harmonicProgressorConfig: { ...module.harmonicProgressorConfig!, arousal: parseFloat(e.target.value), valence: v }
                    })}
                    style={{ width: '100%', opacity: arousalLinked ? 0.35 : 1, cursor: arousalLinked ? 'not-allowed' : 'pointer' }} className="nodrag"
                  />

                  {/* ── Mood keyword tags (auto from valence/arousal) ── */}
                  <div style={{
                    display: 'flex', gap: '4px', flexWrap: 'wrap',
                    marginTop: '8px', justifyContent: 'center'
                  }}>
                    {nearestMoods.map((mood, i) => (
                      <span key={mood.en} style={{
                        fontSize: '10px',
                        padding: '2px 7px',
                        borderRadius: '10px',
                        background: i === 0
                          ? 'rgba(245,158,11,0.25)'
                          : 'rgba(255,255,255,0.08)',
                        border: i === 0
                          ? '1px solid rgba(245,158,11,0.6)'
                          : '1px solid rgba(255,255,255,0.15)',
                        color: i === 0 ? '#f59e0b' : '#aaa',
                        fontWeight: i === 0 ? 600 : 400,
                        letterSpacing: '0.02em',
                        transition: 'all 0.2s',
                      }}>
                        {mood.en}
                        <span style={{ marginLeft: '3px', opacity: 0.7, fontSize: '9px' }}>
                          {mood.ko}
                        </span>
                      </span>
                    ))}
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '11px', marginTop: '6px', color: '#f59e0b', fontWeight: 'bold' }}>
                    {module.harmonicProgressorConfig?.currentCategoryName || 'Neutral / Jazzy'}
                  </div>

                  {/* ── AI Harmony toggle ── */}
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
                    {/* Toggle button */}
                    <button
                      className="nodrag"
                      onClick={() => updateModule(module.id, {
                        harmonicProgressorConfig: {
                          ...module.harmonicProgressorConfig!,
                          useAiHarmony: !useAi,
                          aiHarmonyStatus: 'idle',
                        }
                      })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: useAi
                          ? '1px solid rgba(52,211,153,0.5)'
                          : '1px solid rgba(255,255,255,0.15)',
                        background: useAi
                          ? 'rgba(52,211,153,0.12)'
                          : 'rgba(255,255,255,0.05)',
                        color: useAi ? '#34d399' : '#777',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {/* Toggle pill */}
                      <span style={{
                        display: 'inline-block',
                        width: '22px', height: '12px',
                        borderRadius: '6px',
                        background: useAi ? '#34d399' : '#444',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}>
                        <span style={{
                          position: 'absolute',
                          top: '2px',
                          left: useAi ? '12px' : '2px',
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                        }} />
                      </span>
                      Gemini AI
                    </button>

                    {/* Status badge — only visible when AI is on */}
                    {useAi && (
                      <span style={{
                        fontSize: '9px',
                        padding: '2px 8px',
                        borderRadius: '8px',
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.color}40`,
                        letterSpacing: '0.04em',
                        transition: 'all 0.3s',
                      }}>
                        {badge.label}
                      </span>
                    )}
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
          );
        })()}



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
            <TypedHandle nodeType={module.type} type="target" position={Position.Top} id="sequence" className={styles.handle} style={{ left: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', top: '-15px', left: '45%', color: '#ec4899' }}>Seq</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="fx_in" className={styles.handle} style={{ left: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', bottom: '-15px', left: '38%', color: '#3b82f6' }}>Effect In</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="audio_out" className={styles.handle} style={{ top: '50%' }} />
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
            <button
              className="nodrag"
              onMouseDown={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, true, 60)}
              onMouseUp={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, false, 60)}
              onMouseLeave={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, false, 60)}
              style={{ fontSize: '9px', padding: '2px 4px', background: '#333', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer', marginTop: '4px', textAlign: 'center', width: '100%' }}
            >
              ▶ Preview
            </button>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
            <span style={{ fontSize: '9px', position: 'absolute', right: '-15px', top: '50%', color: '#10b981' }}>Inst</span>
          </div>
        )}

        {/* ── PolySynth Node ── */}
        {module.type === 'polysynth' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <TypedHandle nodeType={module.type} type="target" position={Position.Top} id="sequence" className={styles.handle} style={{ left: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', top: '-15px', left: '45%', color: '#ec4899' }}>Seq</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="fx_in" className={styles.handle} style={{ left: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', bottom: '-15px', left: '38%', color: '#3b82f6' }}>Effect In</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="audio_out" className={styles.handle} style={{ top: '50%' }} />
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
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="envelope" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-18px', top: '70%', transform: 'translateY(-50%)', color: '#a78bfa', fontWeight: 'bold' }}>Env</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', marginTop: '4px' }}>
              <label>Gain (Vol):</label>
              <div style={{ position: 'relative', flex: 1 }}>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '100%' }} value={module.polysynthConfig?.volume ?? 0.8} onChange={(e) => updateModule(module.id, { polysynthConfig: { ...module.polysynthConfig!, volume: parseFloat(e.target.value) } })} />
                <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="volume" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none', left: '-20px' }} />
              </div>
            </div>
            <button
              className="nodrag"
              onMouseDown={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, true, 60)}
              onMouseUp={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, false, 60)}
              onMouseLeave={() => (window as any).umweltMusicEngine?.previewInstrument(module.id, false, 60)}
              style={{ fontSize: '9px', padding: '2px 4px', background: '#333', border: '1px solid #555', color: '#ccc', borderRadius: '4px', cursor: 'pointer', marginTop: '4px', textAlign: 'center' }}
            >
              ▶ Preview
            </button>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', right: '-15px', top: '45%', color: '#10b981' }}>Inst</span>
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
        {module.type === 'adsr_envelope' && (() => {
          const cfg = module.adsrEnvelopeConfig || { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1.0 };
          
          return (
            <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              
              {/* Interactive SVG Visualizer */}
              <InteractiveADSR 
                cfg={cfg} 
                onChange={(newCfg: any) => updateModule(module.id, { adsrEnvelopeConfig: newCfg })} 
              />

              <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="envelope" className={styles.handle} style={{ top: '50%' }} />
              <div className="nodrag" style={{ position: 'absolute', right: '-18px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#a78bfa', fontWeight: 'bold' }}>Env</div>
            </div>
          );
        })()}

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
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <label style={{ fontSize: '9px' }}>Freq:</label>
              <span ref={freqRef} style={{ fontSize: '9px', fontWeight: 'bold' }}>1000.0Hz</span>
              <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="frequency" className={styles.handle} style={{ left: '50%' }} />
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <label style={{ fontSize: '9px' }}>Q:</label>
              <span ref={qRef} style={{ fontSize: '9px', fontWeight: 'bold' }}>1.00</span>
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
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '10px', justifyContent: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                Vol A
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="volA" className={styles.handle} style={{ left: '50%' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                Vol B
                <TypedHandle nodeType={module.type} type="target" position={Position.Bottom} id="volB" className={styles.handle} style={{ left: '50%' }} />
              </div>
            </div>
            
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument_a" className={styles.handle} style={{ top: '30%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '25%' }}>A</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_instrument_b" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '65%' }}>B</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="instrument" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}


        {module.type === 'player_node' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>Combines Sequence & Instrument</div>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="sequence" className={styles.handle} style={{ top: '30%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '25%', color: '#ec4899' }}>Seq</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="instrument" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '65%', color: '#10b981' }}>Inst</span>
            <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="audio_out" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {module.type === 'out_node' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <button 
              className="nodrag"
              onClick={() => {
                const isMuted = !module.outConfig?.muted;
                updateModule(module.id, { outConfig: { ...module.outConfig!, muted: isMuted } });
                // We'll handle muting in Tone.js via MusicEngine
              }}
              style={{
                background: module.outConfig?.muted ? '#333' : '#10b981',
                color: 'white',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #10b981',
                cursor: 'pointer'
              }}
            >
              {module.outConfig?.muted ? 'MUTED' : 'SPEAKER ON'}
            </button>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '30%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '25%', color: '#10b981' }}>Aud</span>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="trigger_in" className={styles.handle} style={{ top: '70%' }} />
            <span style={{ fontSize: '9px', position: 'absolute', left: '-15px', top: '65%', color: '#ec4899' }}>Gate</span>
          </div>
        )}

        {module.type === 'broadcast_node' && (
          <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
              <label>Channel:</label>
              <input 
                type="text" className="nodrag" style={{ width: '40px' }} 
                value={module.broadcastConfig?.channel ?? 'A'} 
                onChange={(e) => updateModule(module.id, { broadcastConfig: { ...module.broadcastConfig!, channel: e.target.value } })} 
              />
            </div>
            <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '50%' }} />
          </div>
        )}

        {/* ── Effect Chain Node ── */}
        {module.type === 'effect_chain' && (() => {
          const cfg = module.effectChainConfig || { effects: [] };
          const effects = cfg.effects;
          
          const addEffect = (type: 'chorus'|'distortion'|'delay'|'reverb') => {
             const newFx = { id: Math.random().toString(36).substr(2,9), type, mix: 0.5, param1: 0.5, param2: 0.5, enabled: true };
             updateModule(module.id, { effectChainConfig: { ...cfg, effects: [...effects, newFx] } });
          };
          const updateEffect = (id: string, updates: any) => {
             const newEffects = effects.map(fx => fx.id === id ? { ...fx, ...updates } : fx);
             updateModule(module.id, { effectChainConfig: { ...cfg, effects: newEffects } });
          };
          const removeEffect = (id: string) => {
             const newEffects = effects.filter(fx => fx.id !== id);
             updateModule(module.id, { effectChainConfig: { ...cfg, effects: newEffects } });
             if (selectedFxId === id) setSelectedFxId(null);
          };
          const moveEffect = (idx: number, dir: -1 | 1) => {
             if (idx + dir < 0 || idx + dir >= effects.length) return;
             const newEffects = [...effects];
             const temp = newEffects[idx];
             newEffects[idx] = newEffects[idx + dir];
             newEffects[idx + dir] = temp;
             updateModule(module.id, { effectChainConfig: { ...cfg, effects: newEffects } });
          };

          return (
            <div 
              className={styles.outRow} 
              style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', minWidth: '150px' }}
              onClick={() => setSelectedFxId(null)}
            >
              <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginBottom: '4px' }}>
                <span style={{ color: '#10b981' }}>Top: Last</span> / <span style={{ color: '#ec4899' }}>Bottom: First</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {effects.map((fx, idx) => {
                  const isSelected = selectedFxId === fx.id;
                  const isEnabled = fx.enabled !== false;
                  
                  let p1Label = 'P1';
                  let p2Label = 'P2';
                  if (fx.type === 'chorus') { p1Label = 'Rate'; p2Label = 'Depth'; }
                  if (fx.type === 'distortion') { p1Label = 'Amount'; p2Label = 'Tone'; }
                  if (fx.type === 'delay') { p1Label = 'Time'; p2Label = 'Feedback'; }
                  if (fx.type === 'reverb') { p1Label = 'Decay'; p2Label = 'PreDelay'; }

                  return (
                    <div 
                      key={fx.id}
                      onClick={(e) => { e.stopPropagation(); setSelectedFxId(fx.id); }}
                      style={{ 
                        background: isSelected ? '#2a2a2a' : '#1a1a1a', 
                        border: `1px solid ${isSelected ? '#3b82f6' : '#333'}`, 
                        borderRadius: '4px', 
                        padding: '6px',
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '4px',
                        opacity: isEnabled ? 1 : 0.5,
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                           <button 
                             className="nodrag" 
                             onClick={(e) => { e.stopPropagation(); updateEffect(fx.id, { enabled: !isEnabled }); }} 
                             style={{ 
                               background: isEnabled ? '#10b981' : '#4b5563', 
                               border: 'none', borderRadius: '50%', width: '12px', height: '12px', cursor: 'pointer' 
                             }} 
                             title={isEnabled ? "Disable" : "Enable"}
                           />
                           <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'capitalize', color: isEnabled ? '#fff' : '#888' }}>{fx.type}</span>
                         </div>
                         <div style={{ display: 'flex', gap: '4px' }}>
                           {isSelected && (
                             <>
                               <button className="nodrag" onClick={(e) => { e.stopPropagation(); moveEffect(idx, -1); }} disabled={idx === 0} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '2px', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '9px', padding: '0 4px' }}>▲</button>
                               <button className="nodrag" onClick={(e) => { e.stopPropagation(); moveEffect(idx, 1); }} disabled={idx === effects.length - 1} style={{ background: '#444', color: 'white', border: 'none', borderRadius: '2px', cursor: idx === effects.length - 1 ? 'not-allowed' : 'pointer', fontSize: '9px', padding: '0 4px' }}>▼</button>
                             </>
                           )}
                           <button className="nodrag" onClick={(e) => { e.stopPropagation(); removeEffect(fx.id); }} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                         </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8px' }}>
                        <label style={{ width: '35px' }}>Mix</label>
                        <input type="range" className="nodrag" min="0" max="1" step="0.01" value={fx.mix} onChange={(e) => updateEffect(fx.id, { mix: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8px' }}>
                        <label style={{ width: '35px' }}>{p1Label}</label>
                        <input type="range" className="nodrag" min="0" max="1" step="0.01" value={fx.param1} onChange={(e) => updateEffect(fx.id, { param1: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                      </div>
                      {fx.type !== 'distortion' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '8px' }}>
                          <label style={{ width: '35px' }}>{p2Label}</label>
                          <input type="range" className="nodrag" min="0" max="1" step="0.01" value={fx.param2} onChange={(e) => updateEffect(fx.id, { param2: parseFloat(e.target.value) })} style={{ flex: 1 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                <select id={`add-fx-${module.id}`} className="nodrag" style={{ flex: 1, fontSize: '10px', padding: '2px' }}>
                  <option value="chorus">Chorus</option>
                  <option value="distortion">Distort</option>
                  <option value="delay">Delay</option>
                  <option value="reverb">Reverb</option>
                </select>
                <button 
                  className="nodrag" 
                  onClick={(e) => {
                    e.stopPropagation();
                    const sel = document.getElementById(`add-fx-${module.id}`) as HTMLSelectElement;
                    if (sel) addEffect(sel.value as any);
                  }}
                  style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '10px' }}
                >
                  + Add
                </button>
              </div>

              <TypedHandle nodeType={module.type} type="source" position={Position.Top} id="fx_out" className={styles.handle} style={{ left: '50%' }} />
              <span style={{ fontSize: '9px', position: 'absolute', top: '-15px', left: '42%', color: '#3b82f6' }}>To FX In</span>
            </div>
          );
        })()}

        {module.type === 'pedal_fx' && (() => {
          const fxType = module.pedalFxConfig?.effectType ?? 'reverb';
          let param1Label = 'Param 1';
          let param2Label = 'Param 2';
          
          if (fxType === 'reverb') { param1Label = 'Decay'; param2Label = 'Pre-Delay'; }
          else if (fxType === 'delay') { param1Label = 'Time'; param2Label = 'Feedback'; }
          else if (fxType === 'distortion') { param1Label = 'Amount'; param2Label = 'Tone'; }
          else if (fxType === 'chorus') { param1Label = 'Rate'; param2Label = 'Depth'; }

          return (
            <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="audio_in" className={styles.handle} style={{ top: '50%' }} />
              <div style={{ display: 'flex', gap: '4px' }}>
                <select
                  className="nodrag"
                  value={fxType}
                  onChange={(e) => updateModule(module.id, { pedalFxConfig: { ...module.pedalFxConfig!, effectType: e.target.value as any } })}
                  style={{ flex: 1 }}
                >
                  <option value="reverb">Reverb</option>
                  <option value="delay">Delay</option>
                  <option value="distortion">Distort</option>
                  <option value="chorus">Chorus</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                <label>Mix (Wet):</label>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ flex: 1 }} value={module.pedalFxConfig?.mix ?? 0.5} onChange={(e) => updateModule(module.id, { pedalFxConfig: { ...module.pedalFxConfig!, mix: parseFloat(e.target.value) } })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                <label>{param1Label}:</label>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ flex: 1 }} value={module.pedalFxConfig?.param1 ?? 0.5} onChange={(e) => updateModule(module.id, { pedalFxConfig: { ...module.pedalFxConfig!, param1: parseFloat(e.target.value) } })} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px' }}>
                <label>{param2Label}:</label>
                <input type="range" className="nodrag" min="0" max="1" step="0.01" style={{ flex: 1 }} value={module.pedalFxConfig?.param2 ?? 0.5} onChange={(e) => updateModule(module.id, { pedalFxConfig: { ...module.pedalFxConfig!, param2: parseFloat(e.target.value) } })} />
              </div>
              <TypedHandle nodeType={module.type} type="source" position={Position.Right} id="audio_out" className={styles.handle} style={{ top: '50%' }} />
              <span style={{ fontSize: '9px', position: 'absolute', top: '40%', right: '-35px', color: '#10b981' }}>Out</span>
            </div>
          );
        })()}

        {/* ── Math / VCA Node ── */}
        {module.type === 'math_node' && (() => {
          const cfg = (module as any).mathConfig || { opType: 'multiply' };
          return (
            <div className={styles.outRow} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', minWidth: '100px', alignItems: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ec4899', margin: '4px 0' }}>
                {cfg.opType === 'multiply' ? '×' : '+'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '10px' }}>
                <div style={{ position: 'relative', width: '30px', textAlign: 'center' }}>
                  IN 1
                  <TypedHandle nodeType={module.type} type="target" position={Position.Left} id="in_1" className={styles.handle} style={{ top: '100%' }} />
                </div>
                <div style={{ position: 'relative', width: '30px', textAlign: 'center' }}>
                  IN 2
                  <TypedHandle nodeType={module.type} type="target" position={Position.Right} id="in_2" className={styles.handle} style={{ top: '100%' }} />
                </div>
              </div>
              <div style={{ position: 'relative', marginTop: '12px', textAlign: 'center', fontSize: '10px', color: '#10b981' }}>
                OUT
                <TypedHandle nodeType={module.type} type="source" position={Position.Bottom} id="out" className={styles.handle} style={{ left: '50%' }} />
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
