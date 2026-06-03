'use client';

import { useAudioMapStore, VirtualStream, SensorType, MathOperation } from '@/store/audioMapStore';
import { useState } from 'react';
import SignalScope from './SignalScope';
import styles from './VirtualStreamPanel.module.css';

const SENSOR_TYPES: { value: SensorType; label: string }[] = [
  { value: 'ppg', label: 'PPG (Heart Rate)' },
  { value: 'emg', label: 'EMG (Muscle)' },
  { value: 'ecg', label: 'ECG (Rhythm)' },
  { value: 'gsr', label: 'GSR (Sweat)' },
  { value: 'mouseX', label: 'Mouse X' },
  { value: 'mouseY', label: 'Mouse Y' },
];

const MATH_OPERATIONS: { value: MathOperation; label: string }[] = [
  { value: 'add', label: '+' },
  { value: 'subtract', label: '-' },
  { value: 'multiply', label: '×' },
  { value: 'divide', label: '÷' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
  { value: 'power', label: 'Power (x^n)' },
  { value: 'sqrt', label: 'Square Root' },
  { value: 'curve', label: 'Curve (Log/Exp)' },
  { value: 'abs', label: 'abs()' },
  { value: 'floor', label: 'Floor (Gauss)' },
  { value: 'clamp', label: 'Clamp (Clip)' },
  { value: 'step', label: 'Step (Threshold)' },
  { value: 'inRange', label: 'In Range (Gate)' },
  { value: 'compare', label: 'Compare (Logic)' },
  { value: 'interpolate', label: 'Interpolate (Mix)' },
  { value: 'normalize', label: 'Normalize' },
  { value: 'smooth', label: 'Smooth (Lag)' },
  { value: 'moving_average', label: 'Moving Average' },
  { value: 'envelope', label: 'Envelope (Peak)' },
  { value: 'slope', label: 'Slope (Deriv)' },
  { value: 'count', label: 'Count (Accumulator)' },
  { value: 'bpm', label: 'BPM (Heart Rate)' },
];

const isUnaryOp = (op: MathOperation) => ['log', 'exp', 'curve', 'abs', 'floor', 'clamp', 'step', 'inRange', 'normalize', 'smooth', 'moving_average', 'envelope', 'slope', 'power', 'sqrt', 'count', 'bpm'].includes(op);

export default function VirtualStreamPanel() {
  const { streams, addStream, updateStream, deleteStream } = useAudioMapStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleAddSensor = () => {
    addStream({
      id: Date.now().toString(),
      name: `Stream ${streams.length + 1}`,
      type: 'sensor',
      sensor: 'ppg'
    });
  };

  const handleAddMath = () => {
    addStream({
      id: Date.now().toString(),
      name: `Math ${streams.length + 1}`,
      type: 'math',
      op: 'add',
      sourceA: streams[0]?.id,
      sourceB: streams[1]?.id
    });
  };

  const handleAddConstant = () => {
    addStream({
      id: Date.now().toString(),
      name: `Const ${streams.length + 1}`,
      type: 'constant',
      constantValue: 1.0
    });
  };

  const getIcon = (type: string) => {
    if (type === 'sensor') return '📡';
    if (type === 'math') return '∑';
    return '#'; // constant
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2>Virtual Value Streams</h2>
        <div className={styles.actions}>
          <button onClick={handleAddSensor}>+ Sensor</button>
          <button onClick={handleAddMath}>+ Math</button>
          <button onClick={handleAddConstant}>+ Const</button>
        </div>
      </div>
      
      <div className={styles.list}>
        {streams.map(stream => (
          <div key={stream.id} className={`${styles.item} ${expandedId === stream.id ? styles.expanded : ''}`}>
            <div className={styles.itemHeader} onClick={() => setExpandedId(expandedId === stream.id ? null : stream.id)}>
              <span className={styles.typeIcon}>{getIcon(stream.type)}</span>
              <input 
                type="text" 
                value={stream.name} 
                onChange={(e) => updateStream(stream.id, { name: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className={styles.nameInput}
              />
              <button onClick={(e) => { e.stopPropagation(); deleteStream(stream.id); }} className={styles.deleteBtn}>×</button>
            </div>
            
            {expandedId === stream.id && (
              <div className={styles.details}>
                {stream.type === 'sensor' && (
                  <div className={styles.row}>
                    <label>Sensor Source:</label>
                    <select 
                      value={stream.sensor} 
                      onChange={(e) => updateStream(stream.id, { sensor: e.target.value as SensorType })}
                    >
                      {SENSOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                )}
                
                {stream.type === 'constant' && (
                  <div className={styles.row}>
                    <label>Value:</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={stream.constantValue ?? 1}
                      onChange={(e) => updateStream(stream.id, { constantValue: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}
                
                {stream.type === 'math' && (
                  <div className={styles.mathRow}>
                    <div style={{display: 'flex', gap: '4px', flexWrap: 'wrap'}}>
                      <select value={stream.sourceA || ''} onChange={(e) => updateStream(stream.id, { sourceA: e.target.value })}>
                        <option value="">Select Stream...</option>
                        {streams.filter(s => s.id !== stream.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      
                      <select className={styles.opSelect} value={stream.op} onChange={(e) => updateStream(stream.id, { op: e.target.value as MathOperation })}>
                        {MATH_OPERATIONS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                      </select>
                      
                      {!isUnaryOp(stream.op as MathOperation) && (
                        <select value={stream.sourceB || ''} onChange={(e) => updateStream(stream.id, { sourceB: e.target.value })}>
                          <option value="">Select Stream...</option>
                          {streams.filter(s => s.id !== stream.id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </div>

                    {(stream.op === 'min' || stream.op === 'max') && !stream.sourceB && (
                      <div className={styles.row} style={{ marginTop: '8px' }}>
                        <label>B (Const):</label>
                        <input type="number" step="any" value={stream.param1 ?? 0} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) || 0 })} />
                      </div>
                    )}

                    {stream.op === 'compare' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div className={styles.row}>
                          <select value={stream.param1 ?? 0} onChange={(e) => updateStream(stream.id, { param1: parseInt(e.target.value) })} style={{width: '100%'}}>
                            <option value={0}>A {'>'} B</option>
                            <option value={1}>A {'<'} B</option>
                            <option value={2}>A {'>='} B</option>
                            <option value={3}>A {'<='} B</option>
                            <option value={4}>A {'=='} B</option>
                          </select>
                        </div>
                        {!stream.sourceB && (
                          <div className={styles.row}>
                            <label>B (Const):</label>
                            <input type="number" step="any" value={stream.param2 ?? 0} onChange={(e) => updateStream(stream.id, { param2: parseFloat(e.target.value) || 0 })} />
                          </div>
                        )}
                      </div>
                    )}

                    {stream.op === 'power' && (
                      <div className={styles.row} style={{ marginTop: '8px' }}>
                        <label>Exponent (n):</label>
                        <input type="number" step="any" value={stream.param1 ?? 2} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v) ? 2 : v }); }} style={{width: '60px'}} />
                      </div>
                    )}

                    {stream.op === 'interpolate' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>In A (0)</span><span>Mix Ratio</span><span>In B (1)</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={stream.param1 ?? 0.5} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) })} style={{width: '100%'}} />
                      </div>
                    )}

                    {stream.op === 'curve' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Log</span><span>Linear</span><span>Exp</span>
                        </div>
                        <input type="range" min="-1" max="1" step="0.01" value={stream.param1 ?? 0} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) })} style={{width: '100%'}} />
                      </div>
                    )}

                    {stream.op === 'clamp' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Clip Range (Min ➔ Max):</div>
                        <div className={styles.row}>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <input className={styles.smallInput} type="number" step="any" placeholder="Min" value={stream.param1 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v) ? 0 : v }); }} />
                            <input className={styles.smallInput} type="number" step="any" placeholder="Max" value={stream.param2 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param2: isNaN(v) ? 1 : v }); }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {stream.op === 'step' && (
                      <div className={styles.row} style={{ marginTop: '8px' }}>
                        <label>Threshold:</label>
                        <input type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v) ? 0.5 : v }); }} style={{width: '80px'}} />
                      </div>
                    )}

                    {stream.op === 'inRange' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Gate Range (Min ➔ Max):</div>
                        <div className={styles.row}>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <input className={styles.smallInput} type="number" step="any" placeholder="Min" value={stream.param1 ?? 0.4} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v) ? 0.4 : v }); }} />
                            <input className={styles.smallInput} type="number" step="any" placeholder="Max" value={stream.param2 ?? 0.6} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param2: isNaN(v) ? 0.6 : v }); }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {stream.op === 'normalize' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div className={styles.row}>
                          <label>From Range (Min ➔ Max):</label>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <input className={styles.smallInput} type="number" step="any" value={stream.param1 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v)?0:v }); }} />
                            <input className={styles.smallInput} type="number" step="any" value={stream.param2 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param2: isNaN(v)?0:v }); }} />
                          </div>
                        </div>
                        <div className={styles.row}>
                          <label>To Range (Min ➔ Max):</label>
                          <div style={{display: 'flex', gap: '4px'}}>
                            <input className={styles.smallInput} type="number" step="any" value={stream.param3 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param3: isNaN(v)?0:v }); }} />
                            <input className={styles.smallInput} type="number" step="any" value={stream.param4 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param4: isNaN(v)?0:v }); }} />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {stream.op === 'smooth' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Fast</span><span>Smooth Amt</span><span>Slow</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={stream.param1 ?? 0.5} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) })} style={{width: '100%'}} />
                      </div>
                    )}

                    {stream.op === 'moving_average' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Fast (1)</span><span>Window Size</span><span>Slow (120)</span>
                        </div>
                        <input type="range" min="1" max="120" step="1" value={stream.param1 ?? 30} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) })} style={{width: '100%'}} />
                      </div>
                    )}

                    {stream.op === 'envelope' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Slow Decay</span><span>Release</span><span>Fast Decay</span>
                        </div>
                        <input type="range" min="0.001" max="0.5" step="0.001" value={stream.param1 ?? 0.05} onChange={(e) => updateStream(stream.id, { param1: parseFloat(e.target.value) })} style={{width: '100%'}} />
                      </div>
                    )}
                    
                    {stream.op === 'count' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div className={styles.row}>
                          <label title="Value that triggers the count">Threshold:</label>
                          <input className={styles.smallInput} type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v)?0.5:v }); }} style={{width: '60px'}} />
                        </div>
                        <div className={styles.row}>
                          <label title="Maximum count before resetting (0 = no limit)">Limit (Mod):</label>
                          <input className={styles.smallInput} type="number" step="1" min="0" value={stream.param2 ?? 0} onChange={(e) => { const v = parseInt(e.target.value); updateStream(stream.id, { param2: isNaN(v)?0:v }); }} style={{width: '60px'}} />
                        </div>
                        <div className={styles.row}>
                          <label>Step Size:</label>
                          <input className={styles.smallInput} type="number" step="any" value={stream.param3 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param3: isNaN(v)?1:v }); }} style={{width: '60px'}} />
                        </div>
                        <div className={styles.row}>
                          <label>Condition:</label>
                          <select className={styles.select} value={stream.param4 ?? 0} onChange={(e) => updateStream(stream.id, { param4: parseInt(e.target.value) })}>
                            <option value={0}>Off to On (↑)</option>
                            <option value={1}>On to Off (↓)</option>
                            <option value={2}>Both (↑↓)</option>
                          </select>
                        </div>
                        <div className={styles.row}>
                          <label title="0 means infinite counting. If > 0, counts occurrences in the last X milliseconds">Time Window (ms):</label>
                          <input className={styles.smallInput} type="number" step="100" min="0" value={stream.param5 ?? 0} onChange={(e) => { const v = parseInt(e.target.value); updateStream(stream.id, { param5: isNaN(v)?0:v }); }} style={{width: '60px'}} />
                        </div>
                      </div>
                    )}

                    {stream.op === 'bpm' && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                        <div className={styles.row}>
                          <label title="Value that triggers the beat">Threshold:</label>
                          <input className={styles.smallInput} type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); updateStream(stream.id, { param1: isNaN(v)?0.5:v }); }} style={{width: '60px'}} />
                        </div>
                        <div className={styles.row}>
                          <label>Trigger:</label>
                          <select className={styles.select} value={stream.param2 ?? 0} onChange={(e) => updateStream(stream.id, { param2: parseInt(e.target.value) })}>
                            <option value={0}>Off to On (↑)</option>
                            <option value={1}>On to Off (↓)</option>
                            <option value={2}>Both (↑↓)</option>
                          </select>
                        </div>
                        <div className={styles.row}>
                          <label title="Number of beats to average for smoothing">Smoothing (Beats):</label>
                          <input className={styles.smallInput} type="number" step="1" min="1" max="20" value={stream.param3 ?? 4} onChange={(e) => { const v = parseInt(e.target.value); updateStream(stream.id, { param3: isNaN(v)?4:v }); }} style={{width: '60px'}} />
                        </div>
                        <div className={styles.row}>
                          <label title="Time in ms before BPM drops to 0 if no beats are detected">Max Decay Time:</label>
                          <input className={styles.smallInput} type="number" step="100" min="1000" value={stream.param4 ?? 3000} onChange={(e) => { const v = parseInt(e.target.value); updateStream(stream.id, { param4: isNaN(v)?3000:v }); }} style={{width: '60px'}} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={styles.scopesSection}>
        <div className={styles.scopesHeader}>LIVE SIGNAL SCOPES</div>
        <div className={styles.scopesList}>
          {streams.filter(s => s.type !== 'constant').map(stream => (
            <SignalScope key={`scope-${stream.id}`} streamId={stream.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
