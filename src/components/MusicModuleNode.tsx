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
        <div className={styles.title}>{module.name}</div>
        <button className={styles.deleteBtn} onClick={() => removeModule(module.id)} title="Delete Module">×</button>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label>Driving Stream (Input)</label>
          <select 
            className="nodrag"
            value={module.inputStreamId || ''}
            onChange={handleInputStreamChange}
          >
            <option value="">-- No Stream --</option>
            {streams.map(vs => (
              <option key={vs.id} value={vs.id}>{vs.name}</option>
            ))}
          </select>
        </div>

        {module.type === 'harmonic_array' && module.harmonicConfig && (
          <div className={styles.configArea}>
            <div className={styles.field}>
              <label>Scale Type</label>
              <select 
                className="nodrag"
                value={module.harmonicConfig.scaleType}
                onChange={(e) => updateModule(module.id, { 
                  harmonicConfig: { ...module.harmonicConfig!, scaleType: e.target.value as any } 
                })}
              >
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="dorian">Dorian</option>
                <option value="altered">Altered</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Octave Range: {module.harmonicConfig.octaveRange}</label>
              <input 
                type="range" min="1" max="4" 
                className="nodrag"
                value={module.harmonicConfig.octaveRange}
                onChange={(e) => updateModule(module.id, { 
                  harmonicConfig: { ...module.harmonicConfig!, octaveRange: parseInt(e.target.value) } 
                })}
              />
            </div>
          </div>
        )}

        {module.type === 'magenta_ai' && module.magentaConfig && (
          <div className={styles.configArea}>
            <div className={styles.field}>
              <label>Max Temperature: {module.magentaConfig.temperatureMax}</label>
              <input 
                type="range" min="0.5" max="2.0" step="0.1"
                className="nodrag"
                value={module.magentaConfig.temperatureMax}
                onChange={(e) => updateModule(module.id, { 
                  magentaConfig: { ...module.magentaConfig!, temperatureMax: parseFloat(e.target.value) } 
                })}
              />
            </div>
            <div className={styles.field}>
              <label>Density: {module.magentaConfig.density}</label>
              <input 
                type="range" min="0.1" max="1.0" step="0.1"
                className="nodrag"
                value={module.magentaConfig.density}
                onChange={(e) => updateModule(module.id, { 
                  magentaConfig: { ...module.magentaConfig!, density: parseFloat(e.target.value) } 
                })}
              />
            </div>
            <div className={styles.field}>
              <label>Target AI_Seq Node ID</label>
              <input 
                type="text"
                className="nodrag"
                placeholder="e.g. n12 (Click node in patch)"
                value={module.magentaConfig.targetNodeId || ''}
                onFocus={() => {
                  // Temporary hack: when this is focused, listen for noiseCraft:nodeClicked
                  const listener = (e: MessageEvent) => {
                    if (e.data?.type === 'noiseCraft:nodeClicked' && e.data.nodeId !== undefined) {
                      updateModule(module.id, {
                        magentaConfig: { ...module.magentaConfig!, targetNodeId: String(e.data.nodeId) }
                      });
                      window.removeEventListener('message', listener);
                    }
                  };
                  window.addEventListener('message', listener);
                  // Clean up after 10 seconds if no click
                  setTimeout(() => window.removeEventListener('message', listener), 10000);
                }}
                onChange={(e) => updateModule(module.id, { 
                  magentaConfig: { ...module.magentaConfig!, targetNodeId: e.target.value } 
                })}
              />
            </div>
          </div>
        )}

        <div className={styles.outputs}>
          <div className={styles.outRow}>
            <span>Pitch (Hz)</span>
            <div className={styles.dot} />
          </div>
          <div className={styles.outRow}>
            <span>Gate (0/1)</span>
            <div className={styles.dot} />
          </div>
        </div>
      </div>

      {/* Source handles for pitch and gate */}
      <Handle type="source" position={Position.Right} id="pitch" style={{ top: 'auto', bottom: '30px' }} className={styles.handle} />
      <Handle type="source" position={Position.Right} id="gate" style={{ top: 'auto', bottom: '15px' }} className={styles.handle} />
    </div>
  );
}
