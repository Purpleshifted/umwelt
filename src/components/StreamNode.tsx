import React from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { useAudioMapStore, VirtualStream, SensorType, MathOperation, UIElementType } from '@/store/audioMapStore';
import styles from './StreamNode.module.css';
import SignalScope from './SignalScope';

const UI_ELEMENTS: { value: UIElementType; label: string }[] = [
  { value: 'button', label: 'Button (Momentary)' },
  { value: 'toggle', label: 'Toggle (On/Off)' },
];

const SENSOR_TYPES: { value: SensorType; label: string }[] = [
  { value: 'ppg', label: 'PPG' },
  { value: 'emg', label: 'EMG' },
  { value: 'ecg', label: 'ECG' },
  { value: 'gsr', label: 'GSR' },
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

interface StreamNodeProps {
  id: string;
  data: {
    stream: VirtualStream;
  };
  selected?: boolean;
}

export default function StreamNode({ id, data, selected }: StreamNodeProps) {
  const updateStream = useAudioMapStore((state) => state.updateStream);
  const deleteStream = useAudioMapStore((state) => state.deleteStream);
  const stream = data.stream;

  const handleChange = (updates: Partial<VirtualStream>) => {
    updateStream(id, updates);
  };

  return (
    <>
      <NodeResizer minWidth={160} minHeight={100} isVisible={selected} lineClassName={styles.resizeLine} handleClassName={styles.resizeHandle} />
      <div className={`${styles.node} ${selected ? styles.selected : ''} ${stream.type === 'sectionBox' ? styles.sectionBoxNode : ''}`}>
        <div className={styles.header}>
          <input 
            className={styles.nameInput}
            value={stream.name}
            onChange={(e) => handleChange({ name: e.target.value })}
          />
          <button className={styles.deleteBtn} onClick={() => deleteStream(id)}>×</button>
        </div>

        <div className={styles.body}>
          {stream.type === 'sensor' && (
            <div className={styles.row}>
              <label>Sensor:</label>
              <select value={stream.sensor} onChange={(e) => handleChange({ sensor: e.target.value as SensorType })} className="nodrag">
                {SENSOR_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          )}

          {stream.type === 'constant' && (
            <div className={styles.row}>
              <label>Value:</label>
              <input 
                type="number" step="0.01" 
                value={stream.constantValue ?? 1} 
                onChange={(e) => handleChange({ constantValue: parseFloat(e.target.value) || 0 })}
                className="nodrag"
              />
            </div>
          )}

          {stream.type === 'math' && (
            <div className={styles.mathBody}>
              <select value={stream.op} onChange={(e) => handleChange({ op: e.target.value as MathOperation })} className="nodrag">
                {MATH_OPERATIONS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
              </select>
              
              <div className={styles.handlesRow}>
                <div className={styles.handleWrapper}>
                  <span className={styles.handleLabel}>In A</span>
                  <Handle type="target" position={Position.Left} id="sourceA" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
                </div>
                
                {!isUnaryOp(stream.op as MathOperation) && (
                  <div className={styles.handleWrapper}>
                    <span className={styles.handleLabel}>In B</span>
                    <Handle type="target" position={Position.Left} id="sourceB" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
                  </div>
                )}
              </div>

            {(stream.op === 'min' || stream.op === 'max') && !stream.sourceB && (
              <div className={styles.row} style={{ marginTop: '8px' }}>
                <label>B (Const):</label>
                <input type="number" step="any" value={stream.param1 ?? 0} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) || 0 })} className="nodrag" />
              </div>
            )}

            {stream.op === 'compare' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div className={styles.row}>
                  <select value={stream.param1 ?? 0} onChange={(e) => handleChange({ param1: parseInt(e.target.value) })} className="nodrag" style={{width: '100%'}}>
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
                    <input type="number" step="any" value={stream.param2 ?? 0} onChange={(e) => handleChange({ param2: parseFloat(e.target.value) || 0 })} className="nodrag" />
                  </div>
                )}
              </div>
            )}

            {stream.op === 'power' && (
              <div className={styles.row} style={{ marginTop: '8px' }}>
                <label>Exponent (n):</label>
                <input type="number" step="any" value={stream.param1 ?? 2} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v) ? 2 : v }); }} className="nodrag" style={{width: '60px'}} />
              </div>
            )}

            {stream.op === 'interpolate' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>In A (0)</span><span>Mix Ratio</span><span>In B (1)</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={stream.param1 ?? 0.5} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) })} className="nodrag" />
              </div>
            )}

            {stream.op === 'curve' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Log</span><span>Linear</span><span>Exp</span>
                </div>
                <input type="range" min="-1" max="1" step="0.01" value={stream.param1 ?? 0} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) })} className="nodrag" />
              </div>
            )}

            {stream.op === 'clamp' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Clip Range (Min ➔ Max):</div>
                <div className={styles.paramGrid}>
                  <input type="number" step="any" placeholder="Min" value={stream.param1 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v) ? 0 : v }); }} className="nodrag" />
                  <input type="number" step="any" placeholder="Max" value={stream.param2 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param2: isNaN(v) ? 1 : v }); }} className="nodrag" />
                </div>
              </div>
            )}

            {stream.op === 'step' && (
              <div className={styles.row} style={{ marginTop: '8px' }}>
                <label>Threshold:</label>
                <input type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v) ? 0.5 : v }); }} className="nodrag" style={{width: '60px'}} />
              </div>
            )}

            {stream.op === 'inRange' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Gate Range (Min ➔ Max):</div>
                <div className={styles.paramGrid}>
                  <input type="number" step="any" placeholder="Min" value={stream.param1 ?? 0.4} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v) ? 0.4 : v }); }} className="nodrag" />
                  <input type="number" step="any" placeholder="Max" value={stream.param2 ?? 0.6} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param2: isNaN(v) ? 0.6 : v }); }} className="nodrag" />
                </div>
              </div>
            )}

            {stream.op === 'normalize' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>From Range:</div>
                <div className={styles.paramGrid}>
                  <input type="number" step="any" placeholder="Min" value={stream.param1 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v) ? 0 : v }); }} className="nodrag" />
                  <input type="number" step="any" placeholder="Max" value={stream.param2 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param2: isNaN(v) ? 0 : v }); }} className="nodrag" />
                </div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>To Range:</div>
                <div className={styles.paramGrid}>
                  <input type="number" step="any" placeholder="Min" value={stream.param3 ?? 0} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param3: isNaN(v) ? 0 : v }); }} className="nodrag" />
                  <input type="number" step="any" placeholder="Max" value={stream.param4 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param4: isNaN(v) ? 0 : v }); }} className="nodrag" />
                </div>
              </div>
            )}
            
            {stream.op === 'smooth' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fast</span><span>Smooth Amt</span><span>Slow</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={stream.param1 ?? 0.5} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) })} className="nodrag" />
              </div>
            )}

            {stream.op === 'moving_average' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Fast (1)</span><span>Window Size</span><span>Slow (120)</span>
                </div>
                <input type="range" min="1" max="120" step="1" value={stream.param1 ?? 30} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) })} className="nodrag" />
              </div>
            )}

            {stream.op === 'envelope' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Slow Decay</span><span>Release</span><span>Fast Decay</span>
                </div>
                <input type="range" min="0.001" max="0.5" step="0.001" value={stream.param1 ?? 0.05} onChange={(e) => handleChange({ param1: parseFloat(e.target.value) })} className="nodrag" />
              </div>
            )}
            
            {stream.op === 'count' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div className={styles.row}>
                  <label title="Value that triggers the count">Threshold:</label>
                  <input type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v)?0.5:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
                <div className={styles.row}>
                  <label title="Maximum count before resetting (0 = no limit)">Limit (Mod):</label>
                  <input type="number" step="1" min="0" value={stream.param2 ?? 0} onChange={(e) => { const v = parseInt(e.target.value); handleChange({ param2: isNaN(v)?0:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
                <div className={styles.row}>
                  <label>Step Size:</label>
                  <input type="number" step="any" value={stream.param3 ?? 1} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param3: isNaN(v)?1:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
                <div className={styles.row}>
                  <label>Condition:</label>
                  <select value={stream.param4 ?? 0} onChange={(e) => handleChange({ param4: parseInt(e.target.value) })} className="nodrag">
                    <option value={0}>Off to On (↑)</option>
                    <option value={1}>On to Off (↓)</option>
                    <option value={2}>Both (↑↓)</option>
                  </select>
                </div>
                <div className={styles.row}>
                  <label title="0 means infinite counting. If > 0, counts occurrences in the last X milliseconds">Time Window (ms):</label>
                  <input type="number" step="100" min="0" value={stream.param5 ?? 0} onChange={(e) => { const v = parseInt(e.target.value); handleChange({ param5: isNaN(v)?0:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
              </div>
            )}
            
            {stream.op === 'bpm' && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                <div className={styles.row}>
                  <label title="Value that triggers the beat">Threshold:</label>
                  <input type="number" step="any" value={stream.param1 ?? 0.5} onChange={(e) => { const v = parseFloat(e.target.value); handleChange({ param1: isNaN(v)?0.5:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
                <div className={styles.row}>
                  <label>Trigger:</label>
                  <select value={stream.param2 ?? 0} onChange={(e) => handleChange({ param2: parseInt(e.target.value) })} className="nodrag">
                    <option value={0}>Off to On (↑)</option>
                    <option value={1}>On to Off (↓)</option>
                    <option value={2}>Both (↑↓)</option>
                  </select>
                </div>
                <div className={styles.row}>
                  <label title="Number of beats to average for smoothing">Smoothing (Beats):</label>
                  <input type="number" step="1" min="1" max="20" value={stream.param3 ?? 4} onChange={(e) => { const v = parseInt(e.target.value); handleChange({ param3: isNaN(v)?4:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
                <div className={styles.row}>
                  <label title="Time in ms before BPM drops to 0 if no beats are detected">Max Decay Time:</label>
                  <input type="number" step="100" min="1000" value={stream.param4 ?? 3000} onChange={(e) => { const v = parseInt(e.target.value); handleChange({ param4: isNaN(v)?3000:v }); }} className="nodrag" style={{width: '60px'}} />
                </div>
              </div>
            )}
          </div>
        )}

        {stream.type === 'out' && (
          <div className={styles.mathBody}>
            <div style={{ padding: '10px 0', textAlign: 'center', fontSize: '12px', color: '#a78bfa', fontWeight: 'bold' }}>
              OUTPUT STREAM
            </div>
            <div className={styles.handlesRow}>
              <div className={styles.handleWrapper}>
                <span className={styles.handleLabel}>In</span>
                <Handle type="target" position={Position.Left} id="sourceA" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
              </div>
            </div>
          </div>
        )}

        {stream.type === 'monitor' && (
          <div className={styles.mathBody}>
            <div style={{ padding: '6px 0', textAlign: 'center', fontSize: '10px', color: '#4ecdc4', fontWeight: 'bold', letterSpacing: '1px' }}>
              MONITOR OUT
            </div>
            <div className={styles.handlesRow}>
              <div className={styles.handleWrapper}>
                <span className={styles.handleLabel}>In</span>
                <Handle type="target" position={Position.Left} id="sourceA" className={styles.handle} style={{ top: 'auto', bottom: 'auto', position: 'relative', transform: 'none' }} />
              </div>
            </div>
          </div>
        )}

        {stream.type === 'ui' && (
          <div className={styles.mathBody}>
            <div className={styles.row}>
              <label>Element:</label>
              <select value={stream.uiElement ?? 'toggle'} onChange={(e) => handleChange({ uiElement: e.target.value as UIElementType })} className="nodrag">
                {UI_ELEMENTS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              {(stream.uiElement ?? 'toggle') === 'toggle' ? (
                <button
                  className="nodrag"
                  onClick={() => handleChange({ constantValue: stream.constantValue ? 0 : 1 })}
                  style={{
                    background: stream.constantValue ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: 'white',
                    padding: '6px 20px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    transition: 'background 0.15s',
                  }}
                >
                  {stream.constantValue ? 'ON' : 'OFF'}
                </button>
              ) : (
                <button
                  className="nodrag"
                  onMouseDown={() => handleChange({ constantValue: 1 })}
                  onMouseUp={() => handleChange({ constantValue: 0 })}
                  onMouseLeave={() => handleChange({ constantValue: 0 })}
                  style={{
                    background: stream.constantValue ? '#a78bfa' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '4px',
                    color: 'white',
                    padding: '6px 20px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    transition: 'background 0.05s',
                  }}
                >
                  PUSH
                </button>
              )}
            </div>
          </div>
        )}

        {stream.type === 'sectionBox' && (
          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            <input
              className="nodrag"
              value={stream.sectionLabel ?? ''}
              placeholder="Section label..."
              onChange={(e) => handleChange({ sectionLabel: e.target.value })}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '11px',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>
        )}

        {stream.type !== 'constant' && stream.type !== 'sectionBox' && stream.type !== 'ui' && (
          <div className={styles.scopeWrapper}>
            <SignalScope streamId={id} />
          </div>
        )}
      </div>

      {stream.type !== 'sectionBox' && (
        <div className={styles.outHandleWrapper}>
          <span className={styles.handleLabel}>Out</span>
          <Handle type="source" position={Position.Right} id="out" className={styles.handle} />
        </div>
      )}
    </div>
  </>
);
}
