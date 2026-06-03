'use client';

import { useState } from 'react';
import { useAudioMapStore } from '@/store/audioMapStore';
import SignalScope from './SignalScope';
import styles from './VirtualStreamPanel.module.css';

export default function ScopePanel() {
  const { streams } = useAudioMapStore();
  const [activeScopes, setActiveScopes] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // AudioEditor 에서는 최종 출력(Out) 노드들만 모니터링 후보로 띄웁니다.
  const getCandidateStreams = () => {
    return streams.filter(s => s.type === 'out');
  };

  const candidates = getCandidateStreams();

  const handleAddScope = (streamId: string) => {
    if (!activeScopes.includes(streamId)) {
      setActiveScopes([...activeScopes, streamId]);
    }
    setIsAdding(false);
  };

  const removeScope = (streamId: string) => {
    setActiveScopes(activeScopes.filter(id => id !== streamId));
  };

  return (
    <div className={styles.panel} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className={styles.header}>
        <h2>Output Scopes</h2>
        <div className={styles.actions}>
          <button onClick={() => setIsAdding(!isAdding)}>{isAdding ? 'Cancel' : '+ Add Scope'}</button>
        </div>
      </div>
      
      {isAdding && (
        <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <select 
            onChange={(e) => {
              if (e.target.value) handleAddScope(e.target.value);
            }}
            value=""
            style={{ width: '100%', padding: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #4ecdc4', outline: 'none' }}
          >
            <option value="">Select an Output Stream...</option>
            {candidates.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
        </div>
      )}
      
      <div className={styles.list} style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
        {activeScopes.length === 0 && !isAdding && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', textAlign: 'center', padding: '20px' }}>
            No scopes added yet.<br/>Click + Add Scope to monitor outputs.
          </div>
        )}
        
        {activeScopes.map(streamId => {
          const stream = streams.find(s => s.id === streamId);
          if (!stream) return null;
          
          return (
            <div key={streamId} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '4px', position: 'relative', height: '150px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <button 
                onClick={() => removeScope(streamId)}
                style={{ position: 'absolute', top: '4px', right: '4px', zIndex: 10, background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: '16px' }}
              >×</button>
              <SignalScope streamId={streamId} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
