'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, Box } from '@react-three/drei';
import * as THREE from 'three';

// Phone booth dimensions (meters) - slightly exaggerated for dramatic effect
const BOOTH_W = 1.0;
const BOOTH_D = 1.0;
const BOOTH_H = 2.2;

/**
 * Clean, sensor-independent PhoneBooth component.
 * Features glassmorphism, infinite mirror reflections, and a static point light grid.
 */
export default function PhoneBooth() {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  // Standard mirror material for walls (highly performant, relies on Environment)
  const mirrorMaterial = useMemo(() => (
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 1.0,
      roughness: 0.05,
      envMapIntensity: 2.0,
    })
  ), []);

  // Material for the floor (slightly more matte, uses one MeshReflectorMaterial for grounded reflections)
  const floorMaterial = useMemo(() => (
    <MeshReflectorMaterial
      blur={[50, 50]}
      resolution={512}
      mixBlur={1}
      mixStrength={15}
      roughness={0.2}
      depthScale={1}
      minDepthThreshold={0.4}
      maxDepthThreshold={1.4}
      color="#050505"
      metalness={0.9}
      mirror={0.6}
    />
  ), []);

  // Frame structure material
  const frameMaterial = useMemo(() => (
    new THREE.MeshStandardMaterial({
      color: 0x050505,
      metalness: 1.0,
      roughness: 0.2,
    })
  ), []);

  const halfW = BOOTH_W / 2;
  const halfD = BOOTH_D / 2;
  const halfH = BOOTH_H / 2;

  // Simple static light grid animation
  useFrame((state, delta) => {
    timeRef.current += delta;
    if (groupRef.current) {
      // Very subtle floating/breathing effect for the whole booth
      groupRef.current.position.y = Math.sin(timeRef.current * 0.5) * 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Floor */}
      <mesh position={[0, -halfH, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOOTH_W, BOOTH_D]} />
        {floorMaterial}
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
          opacity={0.1}
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

      {/* Point Light inside the booth */}
      <pointLight 
        position={[0, halfH - 0.2, 0]} 
        intensity={2.0} 
        color="#a78bfa" 
        distance={3} 
        decay={2} 
      />
      
      <pointLight 
        position={[0, -halfH + 0.2, 0]} 
        intensity={1.0} 
        color="#4ecdc4" 
        distance={2} 
        decay={2} 
      />
    </group>
  );
}
