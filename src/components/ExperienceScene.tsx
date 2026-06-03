'use client';

import { useEffect, useRef, useState } from 'react';
import ControlPanel from '@/components/ControlPanel';
import MappingEditor from '@/components/MappingEditor';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import styles from './Experience.module.css';

export default function ExperienceScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted && containerRef.current) {
      const bridge = getNoiseCraftBridge();
      // Mount NoiseCraft iframe, initially hidden, toggled by ControlPanel
      bridge.createIframe(containerRef.current, false);
      setMounted(true);
    }
  }, [mounted]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.background}>
        <div className={styles.gradientSphere}></div>
      </div>
      
      <div className={styles.uiOverlay}>
        <h1 className={styles.title}>ACOUSTIC SCULPTURE</h1>
        <p className={styles.subtitle}>Somatic Audio Synthesis & Mapping</p>
      </div>

      <ControlPanel />
      <MappingEditor />
    </div>
  );
}
