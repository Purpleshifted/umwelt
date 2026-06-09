'use client';

import { useEffect, useRef, useState } from 'react';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import NodeMappingPanel from './NodeMappingPanel';
import VirtualBiosignalSimulator from './VirtualBiosignalSimulator';
import ScopePanel from './ScopePanel';
import MacroPatcher from './MacroPatcher';
import NoiseCraftPatchManager from './NoiseCraftPatchManager';
import styles from './AudioEditorScene.module.css';

import GlobalInspectorPanel from './GlobalInspectorPanel';

export default function AudioEditorScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [showNoiseCraft, setShowNoiseCraft] = useState(false);
  const [selectedPatch, setSelectedPatch] = useState<string | null>(null);

  useEffect(() => {
    // Start the global MusicEngine so sequence generation works
    import('@/audio/MusicEngine').then(({ musicEngine }) => {
      musicEngine.start();
    });

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
      <div className={styles.hideOnMobile} style={{ display: 'flex', height: '100%' }}>
        <VirtualBiosignalSimulator />
        <ScopePanel />
      </div>
      
      <div className={styles.centerPane}>
        <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
          <MacroPatcher />
        </div>
      </div>
      
      <div className={styles.hideOnMobile} style={{ display: 'flex', height: '100%' }}>
        <NodeMappingPanel activeContext="macro" />
        <GlobalInspectorPanel />
      </div>
    </div>
  );
}
