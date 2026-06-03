'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import PurePhoneBooth from './PurePhoneBooth';
import { Leva } from 'leva';

export default function PureVisualScene() {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#000' }}>
      <Canvas
        camera={{ position: [1.5, 1.2, 1.5], fov: 50 }}
        gl={{ 
          antialias: true, 
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        dpr={[1, 2]}
      >
        <PurePhoneBooth />
        
        <OrbitControls 
          target={[0, 0, 0]} 
          minDistance={0.5}
          maxDistance={5}
          enableDamping
          dampingFactor={0.05}
          autoRotate
          autoRotateSpeed={0.5}
        />
        
        <Environment preset="studio" />
      </Canvas>
      
      {/* Visual Controls */}
      <Leva theme={{ 
        colors: { 
          highlight1: '#a78bfa', 
          highlight2: '#a78bfa', 
          accent2: '#4ecdc4', 
          elevation1: 'rgba(15, 15, 20, 0.95)', 
          elevation2: 'rgba(255, 255, 255, 0.05)', 
          elevation3: 'rgba(255, 255, 255, 0.1)' 
        } 
      }} />
    </div>
  );
}
