'use client';

import { useState, useEffect } from 'react';
import styles from './MappingEditor.module.css';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';

interface NoiseCraftNode {
  id: string;
  name: string;
  type: string;
}

// Available signal sources from the frontend
const SIGNAL_SOURCES = [
  { id: 'ppg', label: 'PPG (Heart Rate)' },
  { id: 'emg', label: 'EMG (Muscle Tension)' },
  { id: 'ecg', label: 'ECG (Heart Rhythm)' },
  { id: 'mouseX', label: 'Mouse X (Pan)' },
  { id: 'mouseY', label: 'Mouse Y (Depth)' },
  // Leva visual parameters could also be added here
];

const OPERATIONS = ['none', 'add', 'multiply'];
const INTERPOLATIONS = ['linear', 'exponential', 'logarithmic'];

export default function MappingEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [nodes, setNodes] = useState<NoiseCraftNode[]>([]);
  
  // The current mappings matching the JSON format
  const [mappings, setMappings] = useState<any[]>([]);

  // Open/Close via event from ControlPanel
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener('umwelt:toggleMapping', handleToggle);
    return () => window.removeEventListener('umwelt:toggleMapping', handleToggle);
  }, []);

  // Fetch nodes from the iframe or hardcode based on the patch
  useEffect(() => {
    // For now, we populate it with the known nodes from glb_audio_map.ncft
    setNodes([
      { id: '183', name: 'Vol CHORDS', type: 'Knob' },
      { id: '171', name: 'Reverb Amt', type: 'Knob' },
      { id: '163', name: 'Reverb Wet', type: 'Knob' },
      { id: '84', name: 'Delay Vol', type: 'Knob' },
      { id: '70', name: 'Master Vol', type: 'Knob' },
      { id: '22', name: 'BPM', type: 'Knob' },
    ]);

    // Load initial mappings
    const bridge = getNoiseCraftBridge();
    const currentMappings = bridge.getMappings();
    
    const initialJsonMappings = Object.entries(currentMappings).map(([sensor, mapping]) => ({
      id: Date.now().toString() + Math.random().toString().slice(2, 6),
      nodeId: mapping.nodeId,
      paramName: 'value',
      operation: 'none',
      enabled: true,
      streams: [
        {
          stream: sensor,
          interpolation: 'linear',
          inputMin: 0,
          inputMax: 1,
          outputMin: mapping.minVal,
          outputMax: mapping.maxVal
        }
      ]
    }));
    
    setMappings(initialJsonMappings);
  }, []);

  const addMapping = () => {
    setMappings([
      ...mappings,
      {
        id: Date.now().toString(),
        nodeId: nodes[0]?.id || '0',
        paramName: 'value',
        operation: 'none',
        enabled: true,
        streams: [
          {
            stream: 'ppg',
            interpolation: 'linear',
            inputMin: 0,
            inputMax: 1,
            outputMin: 0,
            outputMax: 1
          }
        ]
      }
    ]);
  };

  const updateMapping = (id: string, field: string, value: any, streamIndex = -1, streamField = '') => {
    setMappings(mappings.map(m => {
      if (m.id !== id) return m;
      
      const newM = { ...m };
      if (streamIndex >= 0) {
        newM.streams = [...newM.streams];
        newM.streams[streamIndex] = { ...newM.streams[streamIndex], [streamField]: value };
      } else {
        (newM as any)[field] = value;
      }
      return newM;
    }));
  };

  const removeMapping = (id: string) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  const saveMappings = () => {
    const jsonStr = JSON.stringify(mappings, null, 2);
    // Create a blob and trigger download
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `noisecraft-mappings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Also update the active bridge mappings (simplified version for now)
    const newBridgeMappings: Record<string, any> = {};
    mappings.forEach(m => {
      if (m.enabled && m.streams.length > 0) {
        const stream = m.streams[0];
        newBridgeMappings[stream.stream] = {
          nodeId: m.nodeId,
          minVal: stream.outputMin,
          maxVal: stream.outputMax,
          label: nodes.find(n => n.id === m.nodeId)?.name || m.nodeId
        };
      }
    });
    
    getNoiseCraftBridge().setMappings(newBridgeMappings);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>Audio/Visual Node Mapping</h3>
        <button onClick={() => setIsOpen(false)} className={styles.closeBtn}>×</button>
      </div>
      
      <div className={styles.content}>
        {mappings.map((m) => (
          <div key={m.id} className={`${styles.mappingCard} ${!m.enabled ? styles.disabled : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.nodeSelectGroup}>
                <input 
                  type="checkbox" 
                  checked={m.enabled} 
                  onChange={(e) => updateMapping(m.id, 'enabled', e.target.checked)} 
                />
                <select 
                  value={m.nodeId} 
                  onChange={(e) => updateMapping(m.id, 'nodeId', e.target.value)}
                  className={styles.select}
                >
                  {nodes.map(n => <option key={n.id} value={n.id}>Node {n.id}: {n.name}</option>)}
                </select>
              </div>
              <button onClick={() => removeMapping(m.id)} className={styles.removeBtn}>Del</button>
            </div>
            
            <div className={styles.streamEditor}>
              {m.streams.map((stream: any, i: number) => (
                <div key={i} className={styles.streamRow}>
                  <select 
                    value={stream.stream} 
                    onChange={(e) => updateMapping(m.id, 'streams', e.target.value, i, 'stream')}
                    className={styles.select}
                  >
                    {SIGNAL_SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  
                  <span className={styles.arrow}>→</span>
                  
                  <div className={styles.rangeInputs}>
                    <label>Output Range:</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={stream.outputMin} 
                      onChange={(e) => updateMapping(m.id, 'streams', parseFloat(e.target.value), i, 'outputMin')}
                      className={styles.numberInput}
                    />
                    <span>to</span>
                    <input 
                      type="number" 
                      step="0.01" 
                      value={stream.outputMax} 
                      onChange={(e) => updateMapping(m.id, 'streams', parseFloat(e.target.value), i, 'outputMax')}
                      className={styles.numberInput}
                    />
                  </div>
                </div>
              ))}
            </div>
            
            <div className={styles.operationRow}>
              <label>Operation:</label>
              <select 
                value={m.operation} 
                onChange={(e) => updateMapping(m.id, 'operation', e.target.value)}
                className={styles.select}
              >
                {OPERATIONS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      
      <div className={styles.footer}>
        <button onClick={addMapping} className={styles.addBtn}>+ Add Mapping</button>
        <button onClick={saveMappings} className={styles.saveBtn}>Save JSON</button>
      </div>
    </div>
  );
}
