'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import styles from './ControlPanel.module.css';

function Slider({ 
  label, 
  value, 
  onChange, 
  color,
  subtitle 
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void; 
  color: string;
  subtitle: string;
}) {
  return (
    <div className={styles.sliderGroup}>
      <div className={styles.sliderHeader}>
        <span className={styles.sliderLabel}>{label}</span>
        <span className={styles.sliderValue} style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className={styles.sliderSubtitle}>{subtitle}</div>
      <div className={styles.sliderTrack}>
        <div 
          className={styles.sliderFill} 
          style={{ width: `${value * 100}%`, background: color }}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className={styles.sliderInput}
        />
      </div>
    </div>
  );
}

function SpectralVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const draw = () => {
      const { spectralLow, spectralMid, spectralHigh, ecg } = useSensorStore.getState();
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, width, height);
      
      const barWidth = width / 3 - 4;
      const bands = [
        { val: spectralLow, label: 'LOW', color: `hsl(${10 + ecg * 200}, 80%, ${40 + spectralLow * 40}%)` },
        { val: spectralMid, label: 'MID', color: `hsl(${60 + ecg * 200}, 80%, ${40 + spectralMid * 40}%)` },
        { val: spectralHigh, label: 'HIGH', color: `hsl(${120 + ecg * 200}, 80%, ${40 + spectralHigh * 40}%)` },
      ];
      
      bands.forEach((band, i) => {
        const x = i * (barWidth + 4) + 2;
        const barHeight = band.val * height * 0.8;
        
        const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
        gradient.addColorStop(0, band.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(band.label, x + barWidth / 2, height - 4);
      });
      
      animRef.current = requestAnimationFrame(draw);
    };
    
    draw();
    return () => { cancelAnimationFrame(animRef.current); };
  }, []);
  
  return (
    <canvas 
      ref={canvasRef} 
      width={180} 
      height={60}
      className={styles.spectralCanvas}
    />
  );
}

export default function ControlPanel() {
  const ppg = useSensorStore((s) => s.ppg);
  const emg = useSensorStore((s) => s.emg);
  const ecg = useSensorStore((s) => s.ecg);
  const autoMode = useSensorStore((s) => s.autoMode);
  const cameraMode = useSensorStore((s) => s.cameraMode);
  
  const [audioStarted, setAudioStarted] = useState(false);
  const [ncConnected, setNcConnected] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);

  // Poll NoiseCraft connection status
  useEffect(() => {
    const interval = setInterval(() => {
      const bridge = getNoiseCraftBridge();
      setNcConnected(bridge.connected);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const startAudio = useCallback(async () => {
    const bridge = getNoiseCraftBridge();
    bridge.startAudio();
    setAudioStarted(true);
  }, []);

  const stopAudio = useCallback(() => {
    const bridge = getNoiseCraftBridge();
    bridge.stopAudio();
    setAudioStarted(false);
  }, []);

  const toggleAutoMode = useCallback(() => {
    useSensorStore.getState().setAutoMode(!autoMode);
  }, [autoMode]);

  const toggleCamera = useCallback(() => {
    const current = useSensorStore.getState().cameraMode;
    useSensorStore.getState().setCameraMode(current === 'interior' ? 'exterior' : 'interior');
  }, []);

  const toggleEditor = useCallback(() => {
    const bridge = getNoiseCraftBridge();
    bridge.toggleEditorVisibility();
    setEditorVisible(bridge.editorVisible);
    window.dispatchEvent(new Event('umwelt:toggleMapping'));
  }, []);

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <div className={styles.headerLeft}>
          <div className={styles.title}>UMWELT</div>
          <div className={styles.subtitle}>Somatic Interface</div>
        </div>
        <button className={styles.collapseBtn}>
          {collapsed ? '◀' : '▶'}
        </button>
      </div>
      
      {!collapsed && (
        <div className={styles.content}>
          {/* NoiseCraft Audio Control */}
          {!audioStarted ? (
            <button onClick={startAudio} className={styles.startBtn}>
              <span className={styles.startIcon}>◉</span>
              Start NoiseCraft Audio
            </button>
          ) : (
            <div className={styles.audioActive}>
              <span className={styles.activeDot} />
              NoiseCraft {ncConnected ? '(Stream Connected)' : '(Waiting...)'}
              <button onClick={stopAudio} className={styles.stopBtn}>■</button>
            </div>
          )}

          {/* Mode Controls */}
          <div className={styles.modeRow}>
            <button 
              onClick={toggleAutoMode} 
              className={`${styles.modeBtn} ${autoMode ? styles.active : ''}`}
            >
              {autoMode ? '⟳ Auto' : '✋ Manual'}
            </button>
            <button 
              onClick={toggleCamera} 
              className={styles.modeBtn}
            >
              {cameraMode === 'interior' ? '👁 Interior' : '🔭 Exterior'}
            </button>
            <button 
              onClick={toggleEditor} 
              className={`${styles.modeBtn} ${editorVisible ? styles.active : ''}`}
              title="Show/Hide NoiseCraft patch editor"
            >
              🎛 Patch
            </button>
          </div>

          {/* Sensor Sliders */}
          <div className={styles.sensorSection}>
            <div className={styles.sectionLabel}>BIOSENSOR PROXY</div>
            
            <Slider
              label="PPG"
              subtitle="Heart Rate · Blood Volume"
              value={ppg}
              onChange={(v) => {
                useSensorStore.getState().setAutoMode(false);
                useSensorStore.getState().setPPG(v);
              }}
              color="#ff6b6b"
            />
            
            <Slider
              label="EMG"
              subtitle="Muscle Tension"
              value={emg}
              onChange={(v) => {
                useSensorStore.getState().setAutoMode(false);
                useSensorStore.getState().setEMG(v);
              }}
              color="#4ecdc4"
            />
            
            <Slider
              label="ECG"
              subtitle="Heart Rhythm Variability"
              value={ecg}
              onChange={(v) => {
                useSensorStore.getState().setAutoMode(false);
                useSensorStore.getState().setECG(v);
              }}
              color="#a78bfa"
            />
          </div>

          {/* Spectral Display */}
          <div className={styles.sensorSection}>
            <div className={styles.sectionLabel}>SPECTRAL ANALYSIS</div>
            <SpectralVisualizer />
          </div>

          {/* Mapping Info */}
          <div className={styles.mappingInfo}>
            <div className={styles.sectionLabel}>NOISECRAFT MAPPING</div>
            <div className={styles.mappingRow}>
              <span style={{ color: '#ff6b6b' }}>PPG</span>
              <span>→ #183 Vol CHORDS</span>
            </div>
            <div className={styles.mappingRow}>
              <span style={{ color: '#4ecdc4' }}>EMG</span>
              <span>→ #171 Reverb Amt</span>
            </div>
            <div className={styles.mappingRow}>
              <span style={{ color: '#a78bfa' }}>ECG</span>
              <span>→ #163 Reverb Wet</span>
            </div>
            <div className={styles.mappingRow}>
              <span style={{ color: '#888' }}>Mouse</span>
              <span>→ #84 Delay · #70 Master Vol</span>
            </div>
            <div className={styles.mappingHint}>
              Patch: indiv_audio_map_v2.ncft — Open 🎛 to edit
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
