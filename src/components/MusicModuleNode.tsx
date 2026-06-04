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

export default function MusicModuleNode({ data }: MusicModuleNodeProps) {
  const { module, selected } = data;
  const { updateModule, removeModule } = useMusicStore();
  const { streams } = useAudioMapStore();

  const handleInputStreamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateModule(module.id, { inputStreamId: e.target.value || null });
  };

  return (
    <div className={`${styles.node} ${selected ? styles.selected : ''} ${module.type === 'magenta_ai' ? styles.magenta : styles.harmonic}`}>
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
      </div>
    </div>
  );
}
