'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useControls } from 'leva';

function PointGrid() {
  const pointsRef = useRef<THREE.Points>(null);

  // Leva controls for the point grid exploration
  const { 
    gridSize, 
    spacing, 
    pointSize,
    colorA,
    colorB,
    animationSpeed
  } = useControls('Mirror Space (Infinite Grid)', {
    gridSize: { value: 10, min: 2, max: 20, step: 1 },
    spacing: { value: 1.0, min: 0.2, max: 3.0, step: 0.1 },
    pointSize: { value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
    colorA: '#a78bfa',
    colorB: '#4ecdc4',
    animationSpeed: { value: 1.0, min: 0, max: 5, step: 0.1 }
  });

  const { positions, colors } = useMemo(() => {
    // Total points = (gridSize * 2 + 1)^3
    const side = gridSize * 2 + 1;
    const count = side * side * side;
    
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    
    const cA = new THREE.Color(colorA);
    const cB = new THREE.Color(colorB);
    const tempColor = new THREE.Color();
    
    let i = 0;
    for (let x = -gridSize; x <= gridSize; x++) {
      for (let y = -gridSize; y <= gridSize; y++) {
        for (let z = -gridSize; z <= gridSize; z++) {
          pos[i * 3] = x * spacing;
          pos[i * 3 + 1] = y * spacing;
          pos[i * 3 + 2] = z * spacing;
          
          // Distance from center controls color mix
          const dist = Math.sqrt(x*x + y*y + z*z) / gridSize;
          tempColor.lerpColors(cA, cB, Math.min(1, dist));
          
          col[i * 3] = tempColor.r;
          col[i * 3 + 1] = tempColor.g;
          col[i * 3 + 2] = tempColor.b;
          
          i++;
        }
      }
    }
    
    return { positions: pos, colors: col };
  }, [gridSize, spacing, colorA, colorB]);

  useFrame((state) => {
    if (pointsRef.current) {
      const time = state.clock.elapsedTime * animationSpeed;
      // Gentle breathing scale and rotation
      const scale = 1.0 + Math.sin(time * 0.5) * 0.05;
      pointsRef.current.scale.set(scale, scale, scale);
      pointsRef.current.rotation.y = time * 0.05;
      pointsRef.current.rotation.z = Math.sin(time * 0.02) * 0.1;
      
      // Update material size if changed
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      if (mat.size !== pointSize) {
        mat.size = pointSize;
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={pointSize}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation={true}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export default function MirrorSpaceScene() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', paddingTop: '60px' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <color attach="background" args={['#020205']} />
        <PointGrid />
        <OrbitControls 
          enableDamping 
          dampingFactor={0.05} 
          makeDefault 
          autoRotate 
          autoRotateSpeed={0.2} 
        />
      </Canvas>
    </div>
  );
}
