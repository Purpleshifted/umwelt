'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import styles from './MusicLibraryScene.module.css';

export function SliderInputNode({ data }: { data: { module: MusicModule; selected: boolean } }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module, selected } = data;
  const config = module.sliderConfig || { value: 0.5, min: 0, max: 1 };

  return (
    <div className={`${styles.musicModule} ${selected ? styles.selected : ''}`} style={{ width: '150px' }}>
      <div className={styles.moduleHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '100px', fontSize: '12px', fontWeight: 'bold' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Slider"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px' }}
        >×</button>
      </div>
      <div className={styles.moduleBody}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <input 
            type="range" 
            min={config.min} 
            max={config.max} 
            step={(config.max - config.min) / 100}
            value={config.value}
            onChange={(e) => updateModule(module.id, { sliderConfig: { ...config, value: parseFloat(e.target.value) } })}
            style={{ width: '100%' }}
            className="nodrag"
          />
          <span style={{ fontSize: '12px', textAlign: 'right' }}>{config.value.toFixed(2)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#4ecdc4', width: 10, height: 10 }} />
    </div>
  );
}

export function KnobInputNode({ data }: { data: { module: MusicModule; selected: boolean } }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module, selected } = data;
  const config = module.knobConfig || { value: 0.5, min: 0, max: 1 };

  return (
    <div className={`${styles.musicModule} ${selected ? styles.selected : ''}`} style={{ width: '120px' }}>
      <div className={styles.moduleHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '70px', fontSize: '12px', fontWeight: 'bold' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Knob"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px' }}
        >×</button>
      </div>
      <div className={styles.moduleBody} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#333', border: '2px solid #4ecdc4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '10px', color: 'white' }}>{config.value.toFixed(2)}</span>
        </div>
        <input 
            type="range" 
            min={config.min} 
            max={config.max} 
            step={(config.max - config.min) / 100}
            value={config.value}
            onChange={(e) => updateModule(module.id, { knobConfig: { ...config, value: parseFloat(e.target.value) } })}
            style={{ width: '100%', marginTop: '8px' }}
            className="nodrag"
        />
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#4ecdc4', width: 10, height: 10 }} />
    </div>
  );
}

export function ModuleOutputNode({ data }: { data: { module: MusicModule; selected: boolean } }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module, selected } = data;

  return (
    <div className={`${styles.musicModule} ${selected ? styles.selected : ''}`} style={{ width: '150px', border: '2px solid #ff6b6b' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: '#ff6b6b', width: 10, height: 10 }} />
      <div className={styles.moduleHeader} style={{ background: 'rgba(255, 107, 107, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '100px', fontSize: '12px', fontWeight: 'bold' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Output"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '14px' }}
        >×</button>
      </div>
      <div className={styles.moduleBody}>
        <div style={{ fontSize: '10px', textAlign: 'center', color: '#999', marginTop: '4px' }}>
          (Available in NoiseCraft)
        </div>
      </div>
    </div>
  );
}
