'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import PhoneBooth from './PhoneBooth';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import ControlPanel from './ControlPanel';

function InteriorCamera() {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 0, -0.4));
  
  useFrame(() => {
    const { mouseX, mouseY } = useSensorStore.getState();
    const lookX = (mouseX - 0.5) * 0.8;
    const lookY = (mouseY - 0.5) * 0.4;
    
    targetPos.current.lerp(new THREE.Vector3(lookX, lookY + 0.2, -0.4), 0.05);
    camera.position.lerp(new THREE.Vector3(0, 0.2, 0), 0.1);
    camera.lookAt(targetPos.current);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 90;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function AudioVisualBridge() {
  const lastTime = useRef(0);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    if (time - lastTime.current < 0.016) return;
    lastTime.current = time;
    
    const store = useSensorStore.getState();
    const bridge = getNoiseCraftBridge();
    
    if (store.autoMode) {
      const phase = store.autoPhase + 0.008;
      const ppg = 0.3 + 0.3 * Math.sin(phase * 0.7) + 0.15 * Math.sin(phase * 1.3);
      const emg = 0.2 + 0.2 * Math.sin(phase * 0.4 + 1.5) + 0.1 * Math.sin(phase * 2.1);
      const ecg = 0.4 + 0.25 * Math.sin(phase * 0.3 + 0.8) + 0.1 * Math.sin(phase * 0.9);
      
      store.setPPG(Math.max(0, Math.min(1, ppg)));
      store.setEMG(Math.max(0, Math.min(1, emg)));
      store.setECG(Math.max(0, Math.min(1, ecg)));
      store.setAutoPhase(phase);
    }
    
    if (bridge.running) {
      bridge.update(store.ppg, store.emg, store.ecg, store.mouseX, store.mouseY);
      const spectral = bridge.getSpectralData();
      store.setSpectralData(spectral.low, spectral.mid, spectral.high, spectral.bands);
    }
  });

  return null;
}

export default function CollectiveScene() {
  const cameraMode = useSensorStore((s) => s.cameraMode);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mounted && containerRef.current) {
      const bridge = getNoiseCraftBridge();
      bridge.createIframe(containerRef.current, false);
      setMounted(true);
    }
  }, [mounted]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    useSensorStore.getState().setMousePosition(x, y);
  }, []);

  return (
    <div 
      ref={containerRef}
      style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}
      onMouseMove={handleMouseMove}
    >
      <Canvas
        camera={{ position: [1.5, 1.2, 1.5], fov: 50 }}
        gl={{ 
          antialias: true, 
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        dpr={[1, 2]}
      >
        <PhoneBooth />
        <AudioVisualBridge />
        
        {cameraMode === 'interior' ? (
          <InteriorCamera />
        ) : (
          <OrbitControls 
            target={[0, 0, 0]} 
            minDistance={0.5}
            maxDistance={5}
            enableDamping
            dampingFactor={0.05}
          />
        )}
        
        <Environment preset="studio" />
      </Canvas>
      <ControlPanel />
    </div>
  );
}
