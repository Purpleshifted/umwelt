'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { musicEngine } from '@/audio/MusicEngine';
import { useAudioGraphStore } from '@/store/audioGraphStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import { useMusicStore } from '@/store/musicStore';

// Hardcoded defaults (replaces leva controls)
const GRID_SIZE = 5;
const SPACING = 0.9;
const POINT_SIZE = 0.05;
const MAX_DISPLACEMENT = 0.3 * SPACING;

// Simple seeded pseudo-random for deterministic per-point noise
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function PointGrid() {
  const pointsRef = useRef<THREE.Points>(null);

  // Smoothed values via refs (lerped each frame) — NO React subscription
  const smoothedRef = useRef({ valence: 0.5, arousal: 0.5 });

  // Build the base grid positions (never changes)
  const side = GRID_SIZE * 2 + 1;
  const count = side * side * side;

  const { basePositions, perPointSeeds } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count); // random seed per point for Brownian
    const rng = mulberry32(42);

    let i = 0;
    for (let x = -GRID_SIZE; x <= GRID_SIZE; x++) {
      for (let y = -GRID_SIZE; y <= GRID_SIZE; y++) {
        for (let z = -GRID_SIZE; z <= GRID_SIZE; z++) {
          pos[i * 3] = x * SPACING;
          pos[i * 3 + 1] = y * SPACING;
          pos[i * 3 + 2] = z * SPACING;
          seeds[i] = rng() * 1000; // phase offset for each point
          i++;
        }
      }
    }

    return { basePositions: pos, perPointSeeds: seeds };
  }, [count]);

  // Mutable position buffer that gets updated every frame
  const livePositions = useMemo(() => new Float32Array(basePositions), [basePositions]);
  // Per-point Brownian offsets (accumulated)
  const offsets = useMemo(() => new Float32Array(count * 3), [count]);
  // Color buffer
  const colors = useMemo(() => new Float32Array(count * 3), [count]);

  // Temp color for HSL computation
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    // Read directly from store (no React re-render)
    const hc = useMusicStore.getState().modules.find(m => m.type === 'harmonic_progressor')?.harmonicProgressorConfig;
    const rawValence = hc?.valence ?? 0.5;
    const rawArousal = hc?.arousal ?? 0.5;

    const LERP = 0.02;
    const sm = smoothedRef.current;
    sm.valence = sm.valence + (rawValence - sm.valence) * LERP;
    sm.arousal = sm.arousal + (rawArousal - sm.arousal) * LERP;

    const valence = sm.valence;
    const arousal = sm.arousal;
    const time = state.clock.elapsedTime;
    const dt = state.clock.getDelta() || 1 / 60;

    // --- COLOR: driven by valence ---
    // valence > 0.5 → warm (hue 0-60°), valence < 0.5 → cool (hue 180-280°), valence=0.5 → white
    // Saturation diminishes near 0.5 for neutral white/silver
    const distFromNeutral = Math.abs(valence - 0.5) * 2; // 0..1
    const saturation = distFromNeutral * 0.85;
    const lightness = 0.55 + (1 - distFromNeutral) * 0.3; // brighter when neutral

    // --- MOTION parameters ---
    // arousal controls overall speed factor
    // arousal < 0.5 → slow/frozen, arousal > 0.5 → rhythmic/pulsing
    const speedFactor = Math.pow(arousal, 2) * 4; // 0 to ~4
    const brownianStrength = speedFactor * 0.008;

    // Pulsing factor: strong when arousal > 0.5
    const pulsePhase = time * (2 + arousal * 6); // faster pulse at high arousal
    const pulseAmplitude = Math.max(0, (arousal - 0.5) * 2) * 0.15; // 0 when arousal<=0.5, up to 0.15

    // Coherence: high valence + high arousal = synchronized; low valence + high arousal = chaotic
    const coherence = valence; // 0..1, higher = more synchronized

    for (let i = 0; i < count; i++) {
      const seed = perPointSeeds[i];
      const i3 = i * 3;

      // --- Per-point color ---
      let hue: number;
      if (valence >= 0.5) {
        // Warm: hue 0° to 60° (red to orange/yellow)
        const t = (valence - 0.5) * 2; // 0..1
        hue = 60 * (1 - t) / 360; // near 0.5 → 60°, near 1.0 → 0° (red)
      } else {
        // Cool: hue 180° to 280° (cyan to purple)
        const t = (0.5 - valence) * 2; // 0..1
        hue = (180 + t * 100) / 360; // near 0.5 → 180° (cyan), near 0 → 280° (purple)
      }
      // Add slight per-point hue variation for richness
      const hueVar = (Math.sin(seed * 1.7) * 0.03);
      tempColor.setHSL(hue + hueVar, saturation, lightness);

      colors[i3] = tempColor.r;
      colors[i3 + 1] = tempColor.g;
      colors[i3 + 2] = tempColor.b;

      // --- Per-point motion ---
      // Brownian drift: accumulate small random offsets
      // Use sin/cos of time*seed for pseudo-random continuous noise
      const noiseX = Math.sin(time * 0.7 + seed) * Math.cos(time * 1.3 + seed * 0.5);
      const noiseY = Math.sin(time * 0.9 + seed * 1.1) * Math.cos(time * 0.6 + seed * 0.8);
      const noiseZ = Math.sin(time * 1.1 + seed * 0.7) * Math.cos(time * 0.8 + seed * 1.3);

      // Brownian: accumulate with damping (spring back toward 0)
      const damping = 0.98;
      offsets[i3] = offsets[i3] * damping + noiseX * brownianStrength;
      offsets[i3 + 1] = offsets[i3 + 1] * damping + noiseY * brownianStrength;
      offsets[i3 + 2] = offsets[i3 + 2] * damping + noiseZ * brownianStrength;

      // Pulsing: radial push/pull synchronized by coherence
      // Synchronized pulse uses same phase for all points
      // Chaotic uses per-point phase
      const pointPhase = coherence * pulsePhase + (1 - coherence) * (pulsePhase + seed * 3.0);
      const pulse = Math.sin(pointPhase) * pulseAmplitude;

      // Pulse direction: radial from center
      const bx = basePositions[i3];
      const by = basePositions[i3 + 1];
      const bz = basePositions[i3 + 2];
      const dist = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
      const nx = bx / dist;
      const ny = by / dist;
      const nz = bz / dist;

      // Final position = base + clamped(brownian offset + radial pulse)
      const dx = offsets[i3] + nx * pulse;
      const dy = offsets[i3 + 1] + ny * pulse;
      const dz = offsets[i3 + 2] + nz * pulse;
      livePositions[i3] = bx + Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, dx));
      livePositions[i3 + 1] = by + Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, dy));
      livePositions[i3 + 2] = bz + Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, dz));
    }

    // Upload to GPU
    if (pointsRef.current) {
      const geom = pointsRef.current.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      posAttr.array = livePositions;
      posAttr.needsUpdate = true;

      const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;
      colAttr.array = colors;
      colAttr.needsUpdate = true;

      // Gentle global rotation
      pointsRef.current.rotation.y = time * 0.05;
      pointsRef.current.rotation.z = Math.sin(time * 0.02) * 0.1;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[livePositions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={POINT_SIZE}
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
  const [isPlaying, setIsPlaying] = useState(false);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Create a hidden NoiseCraft iframe so audio can play
    if (hiddenContainerRef.current) {
      const bridge = getNoiseCraftBridge();
      bridge.createIframe(hiddenContainerRef.current, false);
    }
  }, []);

  const handlePlayToggle = async () => {
    if (!isPlaying) {
      setIsPlaying(true);

      // Initialize and resume audio contexts
      await musicEngine.initialize();
      await musicEngine.resumeAudioContext();

      const ctx = useAudioGraphStore.getState().audioContext;
      if (ctx && ctx.state === 'suspended') await ctx.resume();

      musicEngine.start();
      await musicEngine.playTracks();

      getNoiseCraftBridge().startAudio();
    } else {
      setIsPlaying(false);
      musicEngine.stop();
      musicEngine.stopTracks();
      getNoiseCraftBridge().stopAudio();
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', paddingTop: '60px', position: 'relative' }}>
      <button 
        onClick={handlePlayToggle}
        style={{
          position: 'absolute',
          top: '80px',
          right: '20px',
          zIndex: 100,
          background: isPlaying ? 'rgba(255, 107, 107, 0.2)' : 'rgba(78, 205, 196, 0.2)',
          color: isPlaying ? '#ff6b6b' : '#4ecdc4',
          border: `1px solid ${isPlaying ? '#ff6b6b' : '#4ecdc4'}`,
          padding: '8px 16px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          fontWeight: 600,
          fontSize: '12px',
          letterSpacing: '1px',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s ease'
        }}
      >
        {isPlaying ? '■ STOP AUDIO' : '▶ PLAY AUDIO'}
      </button>
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
      {/* Hidden container for NoiseCraft audio iframe */}
      <div ref={hiddenContainerRef} style={{ display: 'none' }} />
    </div>
  );
}
