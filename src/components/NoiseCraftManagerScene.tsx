'use client';

import { useEffect, useRef, useState } from 'react';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import NoiseCraftPatchManager from './NoiseCraftPatchManager';
import styles from './AudioEditorScene.module.css';

export default function NoiseCraftManagerScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
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
    if (mounted) {
      setTimeout(() => {
        const iframe = document.getElementById('noisecraft-iframe') as HTMLIFrameElement;
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({ type: 'noiseCraft:redraw' }, '*');
        }
      }, 200);
    }
  }, [mounted]);

  const handleSelectPatch = (filename: string) => {
    setSelectedPatch(filename);
  };

  const handleBackToManager = () => {
    setSelectedPatch(null);
  };

  return (
    <div className={styles.container} style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {selectedPatch ? (
          <>
            <div style={{ background: '#1a1a2e', padding: '8px 16px', display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={handleBackToManager} style={{ background: 'none', border: 'none', color: '#4ecdc4', cursor: 'pointer', fontSize: '12px', marginRight: '16px' }}>
                ← Back to Patches
              </button>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>Editing: <strong>{selectedPatch}</strong></span>
            </div>
            <div ref={containerRef} className={styles.iframeContainer} style={{ flex: 1, position: 'relative' }} />
          </>
        ) : (
          <NoiseCraftPatchManager onSelectPatch={handleSelectPatch} />
        )}
      </div>
    </div>
  );
}
