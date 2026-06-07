'use client';

import { useRef, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import PhoneBooth from './PhoneBooth';
import { useSensorStore } from '@/store/sensorStore';

function InteriorCamera() {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(0, 0, -0.4));
  
  useFrame(() => {
    // We just set a fixed internal view for the phone booth
    camera.position.lerp(new THREE.Vector3(0, 0, 0.4), 0.05);
    camera.lookAt(0, 0, -1);
    if (camera instanceof THREE.PerspectiveCamera) {
      // eslint-disable-next-line
      camera.fov = 90;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

export default function Scene() {
  const cameraMode = useSensorStore((s) => s.cameraMode);
  
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
        dpr={[1, 2]} // Support retina displays
      >
        <PhoneBooth />
        
        {cameraMode === 'interior' ? (
          <InteriorCamera />
        ) : (
          <OrbitControls 
            target={[0, 0, 0]} 
            minDistance={0.5}
            maxDistance={5}
            enableDamping
            dampingFactor={0.05}
            autoRotate
            autoRotateSpeed={0.5}
          />
        )}
        
        {/* Soft ambient environment to catch reflections */}
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
