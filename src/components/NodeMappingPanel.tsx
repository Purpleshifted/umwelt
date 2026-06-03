'use client';

import { useAudioMapStore } from '@/store/audioMapStore';
import { useRef, useState, useEffect } from 'react';
import styles from './NodeMappingPanel.module.css';

interface Props {
  activeContext?: string; // 'macro' or a patch filename like 'nc_noise_patch.ncft'
}

export default function NodeMappingPanel({ activeContext = 'macro' }: Props) {
  const { 
    streams, mappings, 
    addMapping, updateMapping, deleteMapping,
    loadFromJson, exportToJson, undo, redo 
  } = useAudioMapStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track which mapping's Node ID input is currently focused for auto-fill
  const [activeMappingId, setActiveMappingId] = useState<string | null>(null);

  // Filter mappings based on active context
  const filteredMappings = mappings.filter(m => {
    // If it has no targetSystem, it's an old mapping. Old mappings were for NoiseCraft.
    // If the activeContext is not 'macro' (i.e. it's a NoiseCraft patch), we might want to show them?
    // Actually, let's just say old mappings belong to the default patch 'nc_noise_patch.ncft'
    const sys = m.targetSystem || 'nc_noise_patch.ncft';
    return sys === activeContext;
  });

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Handle NoiseCraft auto-fill (when they click a knob in NoiseCraft)
      if (e.data && e.data.type === 'noiseCraft:nodeClicked' && e.data.nodeId !== undefined) {
        if (activeMappingId && activeContext !== 'macro') {
          updateMapping(activeMappingId, { nodeId: String(e.data.nodeId) });
        }
      }
      
      // Handle MacroPatcher auto-fill (custom event we'll dispatch)
      if (e.data && e.data.type === 'macroPatcher:paramClicked' && e.data.nodeId !== undefined) {
        if (activeMappingId && activeContext === 'macro') {
          updateMapping(activeMappingId, { nodeId: String(e.data.nodeId) });
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeMappingId, updateMapping, activeContext]);

  const handleAddMapping = () => {
    const newId = Date.now().toString();
    addMapping({
      id: newId,
      nodeId: '',
      streamId: streams[0]?.id || '',
      targetSystem: activeContext as 'macro' | 'noisecraft' // We cast it, but it holds string
    });
    setActiveMappingId(newId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        loadFromJson(ev.target.result as string);
      }
    };
    reader.readAsText(file);
  };

  const handleDownload = () => {
    const json = exportToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-mapping-${activeContext}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2>{activeContext === 'macro' ? 'Macro Patcher Mapping' : `Patch Mapping: ${activeContext}`}</h2>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
            {activeContext === 'macro' ? "Click a parameter label in the macro patcher to auto-fill" : "Click a knob in NoiseCraft to auto-fill"}
          </span>
        </div>
        <div className={styles.actions}>
          <button onClick={undo} title="Undo">↩</button>
          <button onClick={redo} title="Redo">↪</button>
          <button onClick={() => fileInputRef.current?.click()}>Load</button>
          <button onClick={handleDownload} className={styles.saveBtn}>Save</button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".json"
            style={{ display: 'none' }} 
          />
        </div>
      </div>
      
      <div className={styles.list}>
        {filteredMappings.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
            No mappings for this editor. Click + Add Mapping.
          </div>
        ) : null}
        {filteredMappings.map(m => (
          <div key={m.id} className={`${styles.mappingCard} ${activeMappingId === m.id ? styles.activeCard : ''}`}>
            <div className={styles.cardHeader}>
              <input 
                type="text" 
                placeholder={activeContext === 'macro' ? "e.g. gain-1.gain" : "Node ID"} 
                value={m.nodeId} 
                onChange={(e) => updateMapping(m.id, { nodeId: e.target.value })}
                onFocus={() => setActiveMappingId(m.id)}
                className={`${styles.nodeInput} ${activeMappingId === m.id ? styles.activeInput : ''}`}
              />
              <button onClick={() => deleteMapping(m.id)} className={styles.deleteBtn}>×</button>
            </div>
            
            <div className={styles.row}>
              <select 
                value={m.streamId} 
                onChange={(e) => updateMapping(m.id, { streamId: e.target.value })}
                className={styles.streamSelect}
              >
                <option value="">Select Stream...</option>
                {streams.filter(s => s.type === 'out').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <button onClick={handleAddMapping} className={styles.addBtn}>+ Add Mapping</button>
      </div>
    </div>
  );
}
