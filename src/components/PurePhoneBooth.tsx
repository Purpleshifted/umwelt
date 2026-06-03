'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Box } from '@react-three/drei';
import * as THREE from 'three';
import { useControls } from 'leva';

// Phone booth dimensions
const BOOTH_W = 1.0;
const BOOTH_D = 1.0;
const BOOTH_H = 2.2;

const halfW = BOOTH_W / 2;
const halfD = BOOTH_D / 2;
const halfH = BOOTH_H / 2;

export default function PurePhoneBooth() {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  // Leva controls for pure visual manipulation
  const { 
    floorRoughness, 
    glassOpacity,
    lightColor1,
    lightColor2,
    breathingSpeed
  } = useControls('Booth Aesthetics', {
    floorRoughness: { value: 0.15, min: 0, max: 1, step: 0.01 },
    glassOpacity: { value: 0.1, min: 0, max: 1, step: 0.01 },
    lightColor1: '#a78bfa',
    lightColor2: '#4ecdc4',
    breathingSpeed: { value: 0.5, min: 0, max: 3, step: 0.1 }
  });

  // Highly performant standard mirror for walls (relies on Environment map)
  const mirrorMaterial = useMemo(() => (
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 1.0,
      roughness: 0.02,
      envMapIntensity: 2.0,
    })
  ), []);

  // Frame structure material
  const frameMaterial = useMemo(() => (
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      metalness: 0.8,
      roughness: 0.2,
    })
  ), []);

  useFrame((state, delta) => {
    timeRef.current += delta;
    if (groupRef.current) {
      // Very subtle floating/breathing effect
      groupRef.current.position.y = Math.sin(timeRef.current * breathingSpeed) * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Floor - Using the only MeshReflectorMaterial for grounded reflections */}
      <mesh position={[0, -halfH, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOTH_W, BOOTH_D]} />
        <MeshReflectorMaterial
          blur={[100, 100]}
          resolution={512}
          mixBlur={1}
          mixStrength={20}
          roughness={floorRoughness}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.4}
          color="#050505"
          metalness={0.9}
          mirror={0.8}
        />
      </mesh>

      {/* Ceiling */}
      <mesh position={[0, halfH, 0]} rotation={[Math.PI / 2, 0, 0]} material={mirrorMaterial}>
        <planeGeometry args={[BOOTH_W, BOOTH_D]} />
      </mesh>

      {/* Back Wall */}
      <mesh position={[0, 0, halfD]} rotation={[0, Math.PI, 0]} material={mirrorMaterial}>
        <planeGeometry args={[BOOTH_W, BOOTH_H]} />
      </mesh>
      
      {/* Front Wall (Glass door) */}
      <mesh position={[0, 0, -halfD]} rotation={[0, 0, 0]}>
        <planeGeometry args={[BOOTH_W, BOOTH_H]} />
        <meshPhysicalMaterial 
          color="#000000"
          transparent
          opacity={glassOpacity}
          metalness={0.1}
          roughness={0}
          transmission={0.9}
          ior={1.5}
          thickness={0.05}
        />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-halfW, 0, 0]} rotation={[0, Math.PI / 2, 0]} material={mirrorMaterial}>
        <planeGeometry args={[BOOTH_D, BOOTH_H]} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[halfW, 0, 0]} rotation={[0, -Math.PI / 2, 0]} material={mirrorMaterial}>
        <planeGeometry args={[BOOTH_D, BOOTH_H]} />
      </mesh>

      {/* Structural Frames (Pillars) */}
      <Box args={[0.05, BOOTH_H, 0.05]} position={[-halfW, 0, -halfD]} material={frameMaterial} />
      <Box args={[0.05, BOOTH_H, 0.05]} position={[halfW, 0, -halfD]} material={frameMaterial} />
      <Box args={[0.05, BOOTH_H, 0.05]} position={[-halfW, 0, halfD]} material={frameMaterial} />
      <Box args={[0.05, BOOTH_H, 0.05]} position={[halfW, 0, halfD]} material={frameMaterial} />

      {/* Top and Bottom Frames */}
      <Box args={[BOOTH_W, 0.05, 0.05]} position={[0, halfH, -halfD]} material={frameMaterial} />
      <Box args={[BOOTH_W, 0.05, 0.05]} position={[0, halfH, halfD]} material={frameMaterial} />
      <Box args={[0.05, 0.05, BOOTH_D]} position={[-halfW, halfH, 0]} material={frameMaterial} />
      <Box args={[0.05, 0.05, BOOTH_D]} position={[halfW, halfH, 0]} material={frameMaterial} />
      
      <Box args={[BOOTH_W, 0.05, 0.05]} position={[0, -halfH, -halfD]} material={frameMaterial} />
      <Box args={[BOOTH_W, 0.05, 0.05]} position={[0, -halfH, halfD]} material={frameMaterial} />
      <Box args={[0.05, 0.05, BOOTH_D]} position={[-halfW, -halfH, 0]} material={frameMaterial} />
      <Box args={[0.05, 0.05, BOOTH_D]} position={[halfW, -halfH, 0]} material={frameMaterial} />

      {/* Internal Lighting */}
      <pointLight 
        position={[0, halfH - 0.2, 0]} 
        intensity={2.0} 
        color={lightColor1} 
        distance={3} 
        decay={2} 
      />
      
      <pointLight 
        position={[0, -halfH + 0.2, 0]} 
        intensity={1.0} 
        color={lightColor2} 
        distance={2} 
        decay={2} 
      />
    </group>
  );
}
