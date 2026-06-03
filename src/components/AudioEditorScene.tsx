'use client';

import { useEffect, useRef, useState } from 'react';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import NodeMappingPanel from './NodeMappingPanel';
import VirtualBiosignalSimulator from './VirtualBiosignalSimulator';
import ScopePanel from './ScopePanel';
import MacroPatcher from './MacroPatcher';
import NoiseCraftPatchManager from './NoiseCraftPatchManager';
import styles from './AudioEditorScene.module.css';

export default function AudioEditorScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showNoiseCraft, setShowNoiseCraft] = useState(false);
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);

  useEffect(() => {
    if (containerRef.current && selectedPatch) {
      const bridge = getNoiseCraftBridge();
      const iframe = bridge.createIframe(containerRef.current, true, selectedPatch);
      
      Object.assign(iframe.style, {
        position: 'relative',
        top: '0',
        left: '0',
        bottom: '0',
        right: '0',
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '0',
        boxShadow: 'none',
        zIndex: '1',
      });
      
      setMounted(true);

      return () => {
        // Cleanup when unmounting or changing patch
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      };
    } else {
      setMounted(false);
    }
  }, [selectedPatch]);

  useEffect(() => {
    // Force a resize event in the iframe to fix SVG connection lines rendering
    // since it may have been measured while display: none
    if (showNoiseCraft && mounted) {
      setTimeout(() => {
        const iframe = document.getElementById('noisecraft-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'noiseCraft:redraw' }, '*');
        }
      }, 200); // Wait enough time for display: flex to apply bounds
    }
  }, [showNoiseCraft, mounted]);

  const handleSelectPatch = (filename: string) => {
    setSelectedPatch(filename);
  };

  const handleBackToManager = () => {
    setSelectedPatch(null);
  };

  return (
    <div className={styles.container}>
      <VirtualBiosignalSimulator />
      <ScopePanel />
      
      <div className={styles.centerPane}>
        {/* Tabs: Macro Patcher vs NoiseCraft Editor */}
        <div className={styles.editorTabs}>
          <button
            className={`${styles.editorTab} ${!showNoiseCraft ? styles.activeTab : ''}`}
            onClick={() => setShowNoiseCraft(false)}
          >
            🎛️ Macro Patcher
          </button>
          <button
            className={`${styles.editorTab} ${showNoiseCraft ? styles.activeTab : ''}`}
            onClick={() => setShowNoiseCraft(true)}
          >
            🎹 NoiseCraft Editor
          </button>
        </div>

        {/* Macro Patcher (main view) */}
        <div style={{ flex: 1, display: showNoiseCraft ? 'none' : 'flex', position: 'relative' }}>
          <MacroPatcher />
        </div>

        {/* NoiseCraft Workspace (Patch Manager + iframe) */}
        <div style={{ flex: 1, display: showNoiseCraft ? 'flex' : 'none', flexDirection: 'column', position: 'relative' }}>
          {selectedPatch ? (
            <>
              <div style={{ background: '#1a1a2e', padding: '8px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button onClick={handleBackToManager} style={{ background: 'none', border: 'none', color: '#4ecdc4', cursor: 'pointer', fontSize: '12px', marginRight: '16px' }}>
                  ← Back to Patches
                </button>
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Editing: <strong>{selectedPatch}</strong></span>
              </div>
              <div ref={containerRef} className={styles.iframeContainer} />
            </>
          ) : (
            <NoiseCraftPatchManager onSelectPatch={handleSelectPatch} />
          )}
        </div>
      </div>
      
      <NodeMappingPanel activeContext={showNoiseCraft ? (selectedPatch || 'nc_noise_patch.ncft') : 'macro'} />
    </div>
  );
}
