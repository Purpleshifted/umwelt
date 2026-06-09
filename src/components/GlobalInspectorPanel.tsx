import React from 'react';
import { useMusicStore } from '@/store/musicStore';

export default function GlobalInspectorPanel() {
  const getExposedUINodes = useMusicStore(s => s.getExposedUINodes);
  const updateModule = useMusicStore(s => s.updateModule);
  // We need to trigger re-renders when the store changes.
  // But we only care about changes to exposed UI nodes.
  const modules = useMusicStore(s => s.modules);
  
  // Re-calculate on render
  const exposedNodes = getExposedUINodes();

  if (exposedNodes.length === 0) {
    return (
      <div style={{ padding: '20px', color: '#666', fontSize: '12px', textAlign: 'center', background: '#1e1e1e', height: '100%', borderLeft: '1px solid #333', width: '250px' }}>
        No Global UI exposed.
        <div style={{ marginTop: '10px', fontSize: '10px' }}>
          Connect a Slider/Knob to a Section Box, then connect the Section Box to a Global UI Out node in the Music Library to see it here.
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '250px', 
      background: '#1e1e1e', 
      borderLeft: '1px solid #333', 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column' 
    }}>
      <div style={{ padding: '12px 15px', background: '#252525', borderBottom: '1px solid #333', fontSize: '12px', fontWeight: 'bold', color: '#ccc', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Global Inspector
      </div>
      
      <div style={{ padding: '15px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {exposedNodes.map(mod => {
          if (mod.type === 'slider' && mod.sliderConfig) {
            return (
              <div key={mod.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>{mod.name || 'Slider'}</span>
                  <span style={{ fontSize: '10px', color: '#4ecdc4', background: 'rgba(78, 205, 196, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    {mod.sliderConfig.value.toFixed(2)}
                  </span>
                </div>
                <input 
                  type="range" 
                  min={mod.sliderConfig.min} 
                  max={mod.sliderConfig.max} 
                  step={(mod.sliderConfig.max - mod.sliderConfig.min) / 100}
                  value={mod.sliderConfig.value}
                  onChange={(e) => updateModule(mod.id, { sliderConfig: { ...mod.sliderConfig!, value: parseFloat(e.target.value) } })}
                  style={{ width: '100%' }}
                />
              </div>
            );
          }
          
          if (mod.type === 'knob' && mod.knobConfig) {
            return (
              <div key={mod.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>{mod.name || 'Knob'}</span>
                  <span style={{ fontSize: '10px', color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                    {mod.knobConfig.value.toFixed(2)}
                  </span>
                </div>
                <input 
                  type="range" 
                  min={mod.knobConfig.min} 
                  max={mod.knobConfig.max} 
                  step={(mod.knobConfig.max - mod.knobConfig.min) / 100}
                  value={mod.knobConfig.value}
                  onChange={(e) => updateModule(mod.id, { knobConfig: { ...mod.knobConfig!, value: parseFloat(e.target.value) } })}
                  style={{ width: '100%' }}
                />
              </div>
            );
          }
          
          return null;
        })}
      </div>
    </div>
  );
}
