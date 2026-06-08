'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useMusicStore, MusicModule } from '@/store/musicStore';

export function SliderInputNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module } = data;
  const config = module.sliderConfig || { value: 0.5, min: 0, max: 1 };

  return (
    <div style={{ 
      width: '150px', 
      background: '#1e1e1e', 
      border: '1px solid #333', 
      borderRadius: '8px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#333',
      color: '#fff',
      transition: 'all 0.2s'
    }}>
      <div style={{ padding: '10px 15px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '100px', fontSize: '12px', fontWeight: 'bold', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Slider"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>
      <div style={{ padding: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}>
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

export function KnobInputNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module } = data;
  const config = module.knobConfig || { value: 0.5, min: 0, max: 1 };

  return (
    <div style={{ 
      width: '120px', 
      background: '#1e1e1e', 
      border: '1px solid #333', 
      borderRadius: '8px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#333',
      color: '#fff',
      transition: 'all 0.2s'
    }}>
      <div style={{ padding: '10px 15px', background: 'rgba(0,0,0,0.2)', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '70px', fontSize: '12px', fontWeight: 'bold', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Knob"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>
      <div style={{ padding: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
            style={{ width: '100%', marginTop: '8px', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}
            className="nodrag"
        />
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: '#4ecdc4', width: 10, height: 10 }} />
    </div>
  );
}

export function ModuleOutputNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  const { module } = data;

  return (
    <div style={{ 
      width: '150px', 
      background: '#1e1e1e', 
      border: '2px solid #ff6b6b', 
      borderRadius: '8px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#ff6b6b',
      color: '#fff',
      transition: 'all 0.2s'
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: '#ff6b6b', width: 10, height: 10 }} />
      <div style={{ padding: '10px 15px', background: 'rgba(255, 107, 107, 0.2)', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '100px', fontSize: '12px', fontWeight: 'bold', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Output"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>
      <div style={{ padding: '15px' }}>
        <div style={{ fontSize: '10px', textAlign: 'center', color: '#999', marginTop: '4px' }}>
          (Available in NoiseCraft)
        </div>
      </div>
    </div>
  );
}
