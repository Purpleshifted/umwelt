'use client';

import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useMusicStore, MusicModule } from '@/store/musicStore';
import { useAudioGraphStore } from '@/store/audioGraphStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { useSensorStore } from '@/store/sensorStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import { musicEngine } from '@/audio/MusicEngine';
import { getNearestMoods } from '@/audio/mood_keywords';
import VirtualBiosignalSimulator from './VirtualBiosignalSimulator';

// ═══════════════════════════════════════════════════════════════════
// StreamMonitor — isolated component so its 100ms setState doesn't
// re-render the entire dashboard / layout tree
// ═══════════════════════════════════════════════════════════════════
const HISTORY_LEN = 60;

const StreamMonitor = memo(function StreamMonitor() {
  const [tick, setTick] = useState(0);
  const historyRef = useRef<Record<string, { val: number; hist: number[] }>>({});

  useEffect(() => {
    const id = setInterval(() => {
      const sensors = useSensorStore.getState();
      const sv: Record<string, number> = {
        ppg: sensors.ppg, emg: sensors.emg, ecg: sensors.ecg,
        gsr: sensors.gsr, mouseX: sensors.mouseX, mouseY: sensors.mouseY,
      };
      const streams = useAudioMapStore.getState().streams;
      const monitors = streams.filter(s => s.type === 'monitor');
      const cache = new Map<string, number>();
      for (const ms of monitors) {
        const v = ms.sourceA ? evaluateStreamValue(ms.sourceA, streams, sv, cache) : 0;
        if (!historyRef.current[ms.id]) historyRef.current[ms.id] = { val: 0, hist: [] };
        const entry = historyRef.current[ms.id];
        entry.val = v;
        entry.hist.push(v);
        if (entry.hist.length > HISTORY_LEN) entry.hist.shift();
      }
      setTick(t => t + 1); // trigger re-render of ONLY this component
    }, 100);
    return () => clearInterval(id);
  }, []);

  const streams = useAudioMapStore(s => s.streams);
  const monitors = streams.filter(s => s.type === 'monitor');

  return (
    <>
      <SectionHeader label="Stream Monitor" />
      <div style={{ padding: '0 14px 12px' }}>
        {monitors.length === 0 && (
          <div style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>No monitor streams</div>
        )}
        {monitors.map(vs => {
          const entry = historyRef.current[vs.id];
          const val = entry?.val ?? 0;
          const hist = entry?.hist ?? [];
          const W = 240, H = 48;
          const points = hist.map((v, i) => {
            const x = (i / (HISTORY_LEN - 1)) * W;
            const y = H - Math.max(0, Math.min(1, (v + 1) / 2)) * H;
            return `${x},${y}`;
          }).join(' ');
          return (
            <div key={vs.id} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: '#4ecdc4', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>{vs.name}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#4ecdc4' }}>{val.toFixed(3)}</span>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '48px', background: 'rgba(0,0,0,0.35)', borderRadius: '4px', display: 'block' }}>
                <line x1="0" y1={H/2} x2={W} y2={H/2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                {hist.length > 1 && (
                  <polyline points={points} fill="none" stroke="#4ecdc4" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                )}
              </svg>
            </div>
          );
        })}
      </div>
    </>
  );
});

// ═══════════════════════════════════════════════════════════════════
// GlobalDashboard — top-level sidebar. No fast-ticking state here.
// ═══════════════════════════════════════════════════════════════════
export default function GlobalDashboard() {
  const [isOpen, setIsOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const modules = useMusicStore(s => s.modules);
  const edges = useMusicStore(s => s.edges);
  const updateModule = useMusicStore(s => s.updateModule);

  // Find section boxes connected to Global UI Out (edge-based)
  const uiOutIds = new Set(modules.filter(m => m.type === 'global_ui_out').map(m => m.id));
  const exposedBoxIds = new Set(edges.filter(e => uiOutIds.has(e.target)).map(e => e.source));
  const exposedGroups = modules
    .filter(m => m.type === 'section_box' && exposedBoxIds.has(m.id))
    .map(box => ({
      box,
      children: modules.filter(m => m.parentId === box.id && m.type !== 'section_box'),
    }));

  const handleGlobalPlay = useCallback(() => {
    if (musicEngine.Tone) {
      musicEngine.Tone.start();
      try {
        const rawCtx = (musicEngine.Tone.context as any).rawContext || (musicEngine.Tone.context as any)._context;
        if (rawCtx?.state === 'suspended') rawCtx.resume();
      } catch(e) {}
    }
    const ctx = useAudioGraphStore.getState().audioContext;
    if (ctx && ctx.state === 'suspended') ctx.resume();
    const engineCtx = musicEngine.getAudioContext();
    if (engineCtx.state === 'suspended') engineCtx.resume();

    setTimeout(() => {
      if (musicEngine.Tone && musicEngine.Tone.Transport.state !== 'started') {
        musicEngine.Tone.Transport.start();
      }
      if (!isPlaying) {
        setIsPlaying(true);
        musicEngine.start();
        musicEngine.playTracks();
      }
      getNoiseCraftBridge().startAudio();
    }, 150);
  }, [isPlaying]);

  const handleGlobalStop = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      musicEngine.stop();
      musicEngine.stopTracks();
    }
    getNoiseCraftBridge().stopAudio();
  }, [isPlaying]);

  return (
    <>
    <VirtualBiosignalSimulator />
    {/* Toggle tab */}
    <div
      onClick={() => setIsOpen(!isOpen)}
      style={{
        position: 'fixed', left: isOpen ? 280 : 0, top: '50%', transform: 'translateY(-50%)',
        zIndex: 10000, background: 'rgba(15,15,18,0.95)', color: '#666',
        padding: '12px 5px', borderRadius: '0 6px 6px 0', cursor: 'pointer',
        fontSize: '9px', letterSpacing: '2px', writingMode: 'vertical-lr' as const,
        border: '1px solid rgba(255,255,255,0.08)', borderLeft: 'none',
        transition: 'left 0.25s ease',
      }}
    >
      {isOpen ? '◀' : '▶'} INSPECTOR
    </div>

    {/* Left sidebar */}
    <div style={{
      position: 'fixed', left: isOpen ? 0 : -280, top: 60, bottom: 0,
      width: 280, background: 'rgba(10,10,14,0.97)', backdropFilter: 'blur(12px)',
      borderRight: '1px solid rgba(255,255,255,0.08)', zIndex: 9999,
      display: 'flex', flexDirection: 'column', transition: 'left 0.25s ease',
      fontFamily: "'Inter', system-ui, sans-serif", color: '#ddd', fontSize: '12px',
    }}>
      {/* Play / Stop */}
      <div style={{ display: 'flex', gap: '6px', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button onClick={handleGlobalPlay} style={S.playBtn}>▶ PLAY</button>
        <button onClick={handleGlobalStop} style={S.stopBtn}>■ STOP</button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>

        {exposedGroups.map(({ box, children }) => (
          <div key={box.id}>
            <SectionHeader label={box.name || 'Section'} />
            <div style={{ padding: '0 14px 12px' }}>
              {children.map(mod => {
                if (mod.type === 'slider' && mod.sliderConfig) {
                  const cfg = mod.sliderConfig;
                  return (
                    <div key={mod.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                        <span style={{ color: '#aaa' }}>{mod.name}</span>
                        <span style={{ color: '#ddd', fontFamily: 'monospace' }}>{cfg.value.toFixed(2)}</span>
                      </div>
                      <input type="range" min={cfg.min} max={cfg.max} step={0.01}
                        value={cfg.value}
                        onChange={e => {
                          const newVal = parseFloat(e.target.value);
                          updateModule(mod.id, { sliderConfig: { ...cfg, value: newVal } });
                          const outEdges = edges.filter(ed => ed.source === mod.id);
                          for (const ed of outEdges) {
                            const targetMod = modules.find(m => m.id === ed.target);
                            if (targetMod?.type === 'harmonic_progressor' && targetMod.harmonicProgressorConfig) {
                              const handle = ed.targetHandle;
                              if (handle === 'valence' || handle === 'arousal') {
                                updateModule(targetMod.id, {
                                  harmonicProgressorConfig: { ...targetMod.harmonicProgressorConfig, [handle]: newVal }
                                });
                              }
                            }
                          }
                        }}
                        style={{ width: '100%', accentColor: '#4ecdc4' }}
                      />
                    </div>
                  );
                }

                if (mod.type === 'knob' && mod.knobConfig) {
                  const cfg = mod.knobConfig;
                  return (
                    <div key={mod.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '3px' }}>
                        <span style={{ color: '#aaa' }}>{mod.name}</span>
                        <span style={{ color: '#ddd', fontFamily: 'monospace' }}>{cfg.value.toFixed(2)}</span>
                      </div>
                      <input type="range" min={cfg.min} max={cfg.max} step={0.01}
                        value={cfg.value}
                        onChange={e => updateModule(mod.id, { knobConfig: { ...cfg, value: parseFloat(e.target.value) } })}
                        style={{ width: '100%', accentColor: '#4ecdc4' }}
                      />
                    </div>
                  );
                }

                if (mod.type === 'harmonic_progressor') {
                  return <HarmonicProgressorUI key={mod.id} mod={mod} updateModule={updateModule} />;
                }

                return <div key={mod.id} style={{ fontSize: '10px', color: '#555', padding: '2px 0' }}>{mod.name} ({mod.type})</div>;
              })}
            </div>
          </div>
        ))}

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
        <StreamMonitor />
      </div>
    </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// HarmonicProgressorUI — extracted to keep main render clean
// ═══════════════════════════════════════════════════════════════════
const HarmonicProgressorUI = memo(function HarmonicProgressorUI({ mod, updateModule }: { mod: MusicModule; updateModule: (id: string, patch: Partial<MusicModule>) => void }) {
  const hc = mod.harmonicProgressorConfig;
  const v = hc?.valence ?? 0.5;
  const a = hc?.arousal ?? 0.5;
  const nearestMoods = getNearestMoods(v, a, 3);
  const useAi = hc?.useAiHarmony ?? false;
  const aiStatus = hc?.aiHarmonyStatus ?? 'idle';
  const statusBadge: Record<string, { label: string; color: string; bg: string }> = {
    idle:    { label: 'AI Harmony',  color: '#888',    bg: 'rgba(255,255,255,0.06)' },
    loading: { label: '⟳ Generating…', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    active:  { label: '✦ AI Active',  color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
    error:   { label: '✕ Retry next', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  };
  const badge = statusBadge[aiStatus] ?? statusBadge.idle;

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px', justifyContent: 'center' }}>
        {nearestMoods.map((mood, i) => (
          <span key={mood.en} style={{
            fontSize: '10px', padding: '2px 7px', borderRadius: '10px',
            background: i === 0 ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)',
            border: i === 0 ? '1px solid rgba(245,158,11,0.6)' : '1px solid rgba(255,255,255,0.15)',
            color: i === 0 ? '#f59e0b' : '#aaa', fontWeight: i === 0 ? 600 : 400,
            letterSpacing: '0.02em', transition: 'all 0.2s',
          }}>
            {mood.en}<span style={{ marginLeft: '3px', opacity: 0.7, fontSize: '9px' }}>{mood.ko}</span>
          </span>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', color: '#f59e0b', fontWeight: 'bold', marginBottom: '10px' }}>
        {hc?.currentCategoryName || 'Neutral / Jazzy'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
        <button onClick={() => updateModule(mod.id, {
          harmonicProgressorConfig: { ...hc!, useAiHarmony: !useAi, aiHarmonyStatus: 'idle' }
        })} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '8px',
          border: useAi ? '1px solid rgba(52,211,153,0.5)' : '1px solid rgba(255,255,255,0.15)',
          background: useAi ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
          color: useAi ? '#34d399' : '#777', fontSize: '10px', fontWeight: 600, cursor: 'pointer',
          transition: 'all 0.2s', letterSpacing: '0.03em',
        }}>
          <span style={{
            display: 'inline-block', width: '22px', height: '12px', borderRadius: '6px',
            background: useAi ? '#34d399' : '#444', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
            <span style={{
              position: 'absolute', top: '2px', left: useAi ? '12px' : '2px',
              width: '8px', height: '8px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
            }} />
          </span>
          Gemini AI
        </button>
        {useAi && (
          <span style={{
            fontSize: '9px', padding: '2px 8px', borderRadius: '8px',
            background: badge.bg, color: badge.color, border: `1px solid ${badge.color}40`,
            letterSpacing: '0.04em', transition: 'all 0.3s',
          }}>{badge.label}</span>
        )}
      </div>
    </div>
  );
});

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '10px 14px 6px', fontSize: '10px', color: '#ec4899',
      textTransform: 'uppercase' as const, letterSpacing: '1.5px', fontWeight: 700,
    }}>
      {label}
    </div>
  );
}

const S = {
  playBtn: { flex: 1, background: 'rgba(78,205,196,0.1)', border: '1px solid rgba(78,205,196,0.3)', color: '#4ecdc4', padding: '6px 0', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, letterSpacing: '1px' } as React.CSSProperties,
  stopBtn: { flex: 1, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b', padding: '6px 0', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', fontWeight: 600, letterSpacing: '1px' } as React.CSSProperties,
};
