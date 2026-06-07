'use client';

import React, { useState, useEffect } from 'react';
import styles from './GlobalDashboard.module.css';
import { useMusicStore } from '@/store/musicStore';
import { useAudioGraphStore } from '@/store/audioGraphStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import { musicEngine } from '@/audio/MusicEngine';

export default function GlobalDashboard() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'streams' | 'sequencer' | 'dsp'>('streams');

  // Stores
  const modules = useMusicStore(s => s.modules);
  const [isPlaying, setIsPlaying] = useState(false);

  const graphNodes = useAudioGraphStore(s => s.nodes);
  const updateGraphNodeParam = useAudioGraphStore(s => s.updateNodeParams);

  const virtualStreams = useAudioMapStore(s => s.streams) || [];

  // Live stream values for meters
  const [liveStreamValues, setLiveStreamValues] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen || activeTab !== 'streams') return;
    
    // Quick polling to show meters when the dock is open on the Streams tab
    const interval = setInterval(() => {
      // We don't have a direct global exposed sensorValues object easily available 
      // without modifying stores, but we can hook into an event or just read if we exposed it.
      // For now, let's just make the meters static placeholders or read from a global if we add one.
    }, 100);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  const handleGlobalPlay = () => {
    // Start Web Audio if suspended
    // Start Sequencer
    if (!isPlaying) {
      setIsPlaying(true);
      musicEngine.start();
      musicEngine.playTracks();
    }
    
    // Resume Audio Editor Context
    const ctx = useAudioGraphStore.getState().audioContext;
    if (ctx && ctx.state === 'suspended') ctx.resume();

    // Start NoiseCraft Bridges
    getNoiseCraftBridge().startAudio();
  };

  const handleGlobalStop = () => {
    if (isPlaying) {
      setIsPlaying(false);
      musicEngine.stop();
      musicEngine.stopTracks();
    }
    getNoiseCraftBridge().stopAudio();
  };

  return (
    <div className={`${styles.dashboardContainer} ${isOpen ? '' : styles.collapsed}`}>
      {/* Header Bar (Always visible) */}
      <div className={styles.header} onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.headerLeft}>
          <button className={styles.toggleBtn}>{isOpen ? '▼' : '▲'}</button>
          <h3>Global Inspector</h3>
        </div>
        <div className={styles.masterControls} onClick={e => e.stopPropagation()}>
          <button className={styles.playBtn} onClick={handleGlobalPlay}>Play All</button>
          <button className={styles.stopBtn} onClick={handleGlobalStop}>Stop</button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'streams' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('streams')}
        >
          Sensor Streams
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'sequencer' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('sequencer')}
        >
          Music Library
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'dsp' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('dsp')}
        >
          Orchestrator (DSP)
        </button>
      </div>

      {/* Content Area */}
      <div className={styles.content}>
        {activeTab === 'streams' && (
          <div className={styles.grid}>
            {virtualStreams.filter(vs => vs.type === 'out').map(vs => (
              <div key={vs.id} className={styles.card}>
                <h4>{vs.name}</h4>
                <div className={styles.meterContainer}>
                  <div className={styles.meterFill} style={{ width: `50%` }} /> {/* Placeholder */}
                </div>
                <div className={styles.paramRow}>
                  <span className={styles.paramLabel}>Type</span>
                  <span>{vs.type}</span>
                </div>
                <div className={styles.paramRow}>
                  <span className={styles.paramLabel}>Source</span>
                  <span>{vs.sensor || vs.op || 'const'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'sequencer' && (
          <div className={styles.grid}>
            {modules.filter(m => m.type.includes('gen')).map(mod => (
              <div key={mod.id} className={styles.card}>
                <h4>{mod.name} ({mod.type})</h4>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'dsp' && (
          <div className={styles.grid}>
            {graphNodes.filter(n => n.type !== 'destination' && n.type !== 'analyser').map(node => (
              <div key={node.id} className={styles.card}>
                <h4>{node.label || node.type}</h4>
                {node.params && Object.keys(node.params).filter(k => typeof node.params[k] === 'number').map(paramKey => {
                  let min = 0, max = 1, step = 0.01;
                  if (paramKey === 'frequency') { min = 20; max = 20000; step = 1; }
                  else if (paramKey === 'gain') { max = 2; }
                  else if (paramKey === 'Q') { max = 50; }
                  else if (paramKey === 'pan') { min = -1; max = 1; }
                  
                  return (
                    <div key={paramKey} className={styles.paramRow}>
                      <span className={styles.paramLabel}>{paramKey}</span>
                      <input 
                        type="range" 
                        className={styles.paramSlider}
                        min={min} max={max} step={step} 
                        value={node.params[paramKey] as number}
                        onChange={e => {
                          updateGraphNodeParam(node.id, { [paramKey]: parseFloat(e.target.value) });
                          useAudioGraphStore.getState().rebuildAudioGraph();
                        }}
                      />
                      <span className={styles.paramValue}>{(node.params[paramKey] as number).toFixed(step === 1 ? 0 : 2)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
