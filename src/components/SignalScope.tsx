'use client';

import { useEffect, useRef } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import styles from './SignalScope.module.css';

interface SignalScopeProps {
  streamId: string;
  width?: number;
  height?: number;
}

const MAX_HISTORY = 100; // Number of points to show

export default function SignalScope({ streamId }: { streamId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stream = useAudioMapStore(state => state.streams.find(s => s.id === streamId));
  
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const history: number[] = new Array(MAX_HISTORY).fill(0);
    let animationId: number;

    const draw = () => {
      // Auto-resize canvas to match container
      const width = container.clientWidth;
      const height = container.clientHeight || 60; // default if 0
      
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      // 1. Get current value
      const sensorState = useSensorStore.getState();
      const audioMapState = useAudioMapStore.getState();
      
      const currentVal = evaluateStreamValue(streamId, audioMapState.streams, {
        ppg: sensorState.ppg,
        ecg: sensorState.ecg,
        emg: sensorState.emg,
        gsr: sensorState.gsr,
        mouseX: sensorState.mouseX,
        mouseY: sensorState.mouseY
      });

      // 2. Update history
      history.push(currentVal);
      history.shift(); // Keep size constant

      // 3. Clear canvas
      ctx.clearRect(0, 0, width, height);
      
      // 4. Draw grid/background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // 5. Draw wave
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      
      let localMin = Math.min(...history);
      let localMax = Math.max(...history);
      
      // Add a tiny padding so a flat line doesn't crash or fill the whole screen
      if (localMax - localMin < 0.001) {
        localMin -= 0.1;
        localMax += 0.1;
      } else {
        const padding = (localMax - localMin) * 0.1;
        localMin -= padding;
        localMax += padding;
      }
      
      for (let i = 0; i < history.length; i++) {
        const x = (i / (MAX_HISTORY - 1)) * width;
        const normalized = (history[i] - localMin) / (localMax - localMin);
        const y = height - (normalized * height * 0.8 + height * 0.1);
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // 6. Draw current value text
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(currentVal.toFixed(3), width - 30, 12);

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [streamId]);

  if (!stream) return null;

  return (
    <div ref={containerRef} className={styles.scopeContainer} style={{ width: '100%', height: '100%', minHeight: '40px' }}>
      <div className={styles.header}>
        <span className={styles.name}>{stream.name}</span>
        <span className={styles.type}>{stream.type === 'sensor' ? stream.sensor?.toUpperCase() : 'MATH'}</span>
      </div>
      <canvas 
        ref={canvasRef} 
        className={styles.canvas}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
