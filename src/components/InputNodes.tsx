'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { getCableColor, getHandleDataType } from '@/utils/musicNodeTypes';

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
      <Handle type="source" position={Position.Right} id="out" style={{ background: getCableColor(getHandleDataType('slider', 'out', true)), width: 10, height: 10 }} />
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
      <Handle type="source" position={Position.Right} id="out" style={{ background: getCableColor(getHandleDataType('knob', 'out', true)), width: 10, height: 10 }} />
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
      <Handle type="target" position={Position.Left} id="in" style={{ background: getCableColor(getHandleDataType('null_node', 'in', false)), width: 10, height: 10 }} />
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

export function NullNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const { module } = data;
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  
  return (
    <div style={{ 
      width: '100px', 
      background: '#1e1e1e', 
      border: '1px solid #aaa', 
      borderRadius: '6px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#aaa',
      display: 'flex',
      alignItems: 'center',
      transition: 'all 0.2s'
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: getCableColor(getHandleDataType('virtual_stream', 'in', false)), width: 10, height: 10, left: -6 }} />
      <div style={{ flex: 1, padding: '4px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: '#aaa', width: '70px', fontSize: '11px', fontWeight: 'bold' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Null"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '12px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: getCableColor(getHandleDataType('virtual_stream', 'out', true)), width: 10, height: 10, right: -6 }} />
    </div>
  );
}

export function GlobalUiOutNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  return (
    <div style={{ 
      width: '160px', 
      background: 'rgba(236, 72, 153, 0.1)', 
      border: '2px dashed #ec4899', 
      borderRadius: '8px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#ec4899',
      color: '#fff',
      padding: '12px',
      textAlign: 'center',
      transition: 'all 0.2s'
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ background: getCableColor(getHandleDataType('trigger_node', 'in', false)), width: 14, height: 14, borderRadius: '4px', left: -8 }} />
      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ec4899', marginBottom: '8px' }}>Global UI Out</div>
      <div style={{ fontSize: '10px', color: '#aaa' }}>Connect a Section Box here to expose its UI to the Global Inspector.</div>
    </div>
  );
}

import { NodeResizer } from '@xyflow/react';

export function SectionBoxNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const { module } = data;
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  
  // Section Box is technically a Group, so it should be large enough to contain other nodes.
  const config = module.sectionBoxConfig || { width: 400, height: 300 };

  const onResize = (_: any, params: any) => {
    updateModule(module.id, { sectionBoxConfig: { width: params.width, height: params.height } });
  };

  return (
    <>
      <NodeResizer 
        color="#ec4899" 
        isVisible={selected} 
        minWidth={200} 
        minHeight={150} 
        onResize={onResize} 
      />
      <div style={{ 
        width: config.width + 'px', 
        height: config.height + 'px', 
        background: 'rgba(255, 255, 255, 0.03)', 
      border: '2px dashed #666', 
      borderRadius: '12px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.5)' : 'none',
      borderColor: selected ? '#fff' : '#666',
      transition: 'all 0.2s',
      position: 'relative'
    }}>
      <div style={{ 
        position: 'absolute', top: 0, left: 0, right: 0, 
        padding: '8px 12px', background: 'rgba(0,0,0,0.5)', 
        borderTopLeftRadius: '10px', borderTopRightRadius: '10px', 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
      }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: '#ccc', width: '200px', fontSize: '14px', fontWeight: 'bold' }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Section Box"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>
      <Handle type="source" position={Position.Right} id="out" style={{ background: getCableColor(getHandleDataType('trigger_node', 'out', true)), width: 14, height: 14, borderRadius: '4px', right: -8, top: 20 }} />
      </div>
    </>
  );
}

export function TriggerNode({ data, selected }: { data: { module: MusicModule }, selected?: boolean }) {
  const { module } = data;
  const updateModule = useMusicStore(s => s.updateModule);
  const removeModule = useMusicStore(s => s.removeModule);
  
  // Use React.useEffect or dynamic import for MusicEngine if needed, but here we can just import it
  const [engine, setEngine] = React.useState<any>(null);
  React.useEffect(() => {
    import('@/audio/MusicEngine').then(({ musicEngine }) => {
      setEngine(musicEngine);
    });
  }, []);

  return (
    <div style={{ 
      width: '140px', 
      background: '#1e1e1e', 
      border: '2px solid #ec4899', 
      borderRadius: '8px', 
      boxShadow: selected ? '0 0 0 3px rgba(255, 255, 255, 0.8), 0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.5)',
      borderColor: selected ? '#fff' : '#ec4899',
      color: '#fff',
      transition: 'all 0.2s',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '6px 10px', background: 'rgba(236, 72, 153, 0.2)', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '6px', borderTopRightRadius: '6px' }}>
        <input 
          className="nodrag" 
          style={{ background: 'transparent', border: 'none', color: 'white', width: '80px', fontSize: '11px', fontWeight: 'bold', pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}
          value={module.name}
          onChange={(e) => updateModule(module.id, { name: e.target.value })}
          placeholder="Trigger"
        />
        <button 
          onClick={() => removeModule(module.id)} 
          style={{ background: 'transparent', border: 'none', color: '#ec4899', cursor: 'pointer', fontSize: '14px', padding: 0, lineHeight: 1 }}
        >×</button>
      </div>

      <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <select
          className="nodrag"
          value={module.triggerConfig?.mode ?? 'pulse'}
          onChange={(e) => updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, mode: e.target.value as any } })}
          style={{ width: '100%', fontSize: '10px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', padding: '2px' }}
        >
          <option value="pulse">Pulse</option>
          <option value="toggle">Toggle</option>
          <option value="broadcasted">CV Threshold</option>
        </select>

        {module.triggerConfig?.mode === 'pulse' && (
          <button 
            className="nodrag"
            onMouseDown={() => {
              updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, isDown: true } });
              if (engine) engine.fireTrigger(module.id, true);
            }}
            onMouseUp={() => {
              updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, isDown: false } });
              if (engine) engine.fireTrigger(module.id, false);
            }}
            onMouseLeave={() => {
              if (module.triggerConfig?.isDown) {
                updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, isDown: false } });
                if (engine) engine.fireTrigger(module.id, false);
              }
            }}
            style={{
              background: module.triggerConfig?.isDown ? '#ec4899' : '#444',
              color: 'white',
              padding: '12px 8px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              boxShadow: module.triggerConfig?.isDown ? 'inset 0 3px 5px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
              transform: module.triggerConfig?.isDown ? 'translateY(1px)' : 'none'
            }}
          >
            FIRE
          </button>
        )}

        {module.triggerConfig?.mode === 'toggle' && (
          <button 
            className="nodrag"
            onClick={() => {
              const isDown = !module.triggerConfig?.isDown;
              updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, isDown } });
              if (engine) engine.fireTrigger(module.id, isDown);
            }}
            style={{
              background: module.triggerConfig?.isDown ? '#ec4899' : '#444',
              color: 'white',
              padding: '8px',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '11px',
              boxShadow: module.triggerConfig?.isDown ? 'inset 0 3px 5px rgba(0,0,0,0.5)' : '0 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            {module.triggerConfig?.isDown ? 'ON' : 'OFF'}
          </button>
        )}

        {module.triggerConfig?.mode === 'broadcasted' && (
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '9px', color: '#ccc' }}>Thresh: {module.triggerConfig?.threshold ?? 0.5}</label>
            <input 
              type="range" className="nodrag" min="0" max="1" step="0.01" style={{ width: '100%' }} 
              value={module.triggerConfig?.threshold ?? 0.5} 
              onChange={(e) => updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, threshold: parseFloat(e.target.value) } })} 
            />
            <Handle type="target" position={Position.Left} id="stream_in" style={{ background: getCableColor(getHandleDataType('trigger_node', 'stream_in', false)), width: 10, height: 10, left: -16 }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: '#ccc' }}>
          <label>Pitch:</label>
          <input 
            type="number" className="nodrag" min="0" max="127" 
            style={{ width: '40px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', textAlign: 'center' }} 
            value={module.triggerConfig?.pitch ?? 69} 
            onChange={(e) => updateModule(module.id, { triggerConfig: { ...module.triggerConfig!, pitch: parseInt(e.target.value, 10) || 69 } })} 
          />
        </div>

        <Handle type="source" position={Position.Right} id="trigger" style={{ background: getCableColor(getHandleDataType('trigger_node', 'trigger', true)), width: 12, height: 12, right: -7, top: 'auto', bottom: 20 }} />
      </div>
    </div>
  );
}

