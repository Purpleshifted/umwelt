'use client';

import { useEffect, useRef } from 'react';
import { useSensorStore } from '@/store/sensorStore';
import { useAudioMapStore, evaluateStreamValue } from '@/store/audioMapStore';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
import { useAudioGraphStore } from '@/store/audioGraphStore';

export default function VirtualBiosignalSimulator() {
  const timeRef = useRef(0);
  const gsrBaseline = useRef(0.2);

  useEffect(() => {
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      
      const sensorState = useSensorStore.getState();
      
      // Only simulate if autoMode is enabled
      if (sensorState.autoMode) {
        timeRef.current += dt;
        const t = timeRef.current;
        
        // 1. Realistic PPG (Heart Rate ~70 BPM = 1.16 Hz)
        const hrFreq = 1.16;
        const phase = (t * Math.PI * 2 * hrFreq) % (Math.PI * 2);
        
        // Dicrotic notch approximation
        let ppgVal = 0.5 + 0.4 * Math.sin(phase) + 0.15 * Math.sin(phase * 2 + 1);
        // Normalize roughly to 0-1
        ppgVal = Math.max(0, Math.min(1, (ppgVal - 0.1) / 0.8));
        
        // 2. Realistic ECG (Sharp QRS complex synchronized with PPG)
        // QRS happens right before the PPG pulse peak
        let ecgVal = 0.5; // baseline
        const ecgPhase = (phase + Math.PI * 0.2) % (Math.PI * 2);
        if (ecgPhase < 0.1) {
          ecgVal = 0.4; // Q dip
        } else if (ecgPhase < 0.15) {
          ecgVal = 1.0; // R peak
        } else if (ecgPhase < 0.2) {
          ecgVal = 0.3; // S dip
        } else if (ecgPhase > 1.0 && ecgPhase < 1.4) {
          ecgVal = 0.55 + 0.05 * Math.sin((ecgPhase - 1.0) * Math.PI / 0.4); // T wave
        }
        
        // 3. Realistic EMG (Muscle tension - bursts of high frequency noise)
        // Burst probability based on a slow sine wave
        const muscleActive = Math.sin(t * 0.5) > 0.5;
        const emgNoise = Math.random();
        const emgVal = muscleActive ? 0.3 + emgNoise * 0.6 : 0.1 + emgNoise * 0.1;
        
        // 4. Realistic GSR/EDA (Slow wandering baseline)
        // Random walk towards a target
        const targetGsr = 0.5 + 0.4 * Math.sin(t * 0.1);
        gsrBaseline.current += (targetGsr - gsrBaseline.current) * 0.05 * dt;
        const gsrVal = Math.max(0, Math.min(1, gsrBaseline.current + (Math.random() * 0.02 - 0.01)));

        // Update Zustand store
        useSensorStore.setState({
          ppg: ppgVal,
          ecg: ecgVal,
          emg: emgVal,
          gsr: gsrVal
        });
      }

      // Evaluate mappings
      const currentSensorData = useSensorStore.getState();
      const { streams, mappings } = useAudioMapStore.getState();
      const { nodes: macroNodes, updateNodeParams, rebuildAudioGraph } = useAudioGraphStore.getState();
      
      const bridge = getNoiseCraftBridge();
      
      // We will partition mappings into NoiseCraft mappings and MacroPatcher mappings
      const ncMappings: any[] = [];
      const macroUpdates = new Map<string, Record<string, number>>();
      
      const cache = new Map<string, number>();
      
      for (const m of mappings) {
        if (!m.nodeId || !m.streamId) continue;
        
        // Compute the stream value
        const rawValue = evaluateStreamValue(m.streamId, streams, {
            ppg: currentSensorData.ppg,
            ecg: currentSensorData.ecg,
            emg: currentSensorData.emg,
            gsr: currentSensorData.gsr,
            mouseX: currentSensorData.mouseX,
            mouseY: currentSensorData.mouseY
          }, cache);
          
        const normalizedValue = Math.max(0, Math.min(1, rawValue));
        const outMin = m.outputMin ?? 0;
        const outMax = m.outputMax ?? 1;
        const scaledValue = outMin + normalizedValue * (outMax - outMin);
        
        // Is it a MacroPatcher node? (e.g., "gain-123.gain" or just "gain-123")
        let targetNodeId = m.nodeId;
        let targetParam = 'value';
        
        if (m.nodeId.includes('.')) {
          const parts = m.nodeId.split('.');
          targetNodeId = parts[0];
          targetParam = parts[1];
        }
        
        const isMacroNode = macroNodes.some(n => n.id === targetNodeId);
        
        if (isMacroNode) {
          if (!macroUpdates.has(targetNodeId)) macroUpdates.set(targetNodeId, {});
          macroUpdates.get(targetNodeId)![targetParam] = scaledValue;
        } else {
          ncMappings.push(m);
        }
      }
      
      // Apply MacroPatcher updates
      if (macroUpdates.size > 0) {
        let needsRebuild = false;
        macroUpdates.forEach((params, id) => {
          updateNodeParams(id, params);
          needsRebuild = true;
        });
        // We shouldn't rebuild constantly if possible, but AudioGraphStore might need it.
        // Actually, updateNodeParams doesn't auto-rebuild.
        // We'll use a debounced rebuild if necessary, or just rely on the audioContext params auto-updating.
        if (needsRebuild) {
           clearTimeout((window as any).__macroMapRebuildTimer);
           (window as any).__macroMapRebuildTimer = setTimeout(() => rebuildAudioGraph(), 100);
        }
      }
      
      // Send NoiseCraft mappings
      const { noisecraftWindows } = useAudioGraphStore.getState();
      
      // Group NoiseCraft mappings by their targetSystem (which is either 'macro' or a patch filename like 'nc_noise_patch.ncft')
      const ncMappingsBySystem = new Map<string, any[]>();
      ncMappings.forEach(m => {
        const sys = m.targetSystem || 'nc_noise_patch.ncft';
        if (!ncMappingsBySystem.has(sys)) ncMappingsBySystem.set(sys, []);
        ncMappingsBySystem.get(sys)!.push(m);
      });
      
      ncMappingsBySystem.forEach((sysMappings, sys) => {
        // 1. Check if the main bridge should receive it (if it's the currently open patch)
        // We don't have easy access to the active tab here, so we just send to bridge if it's connected
        // Bridge will only process it if it's running. BUT we only want to send to bridge if the bridge is currently editing THIS patch.
        // For simplicity, we can always send it to bridge, and bridge can ignore if not running.
        if (bridge.connected || bridge.running) {
          bridge.updateFromVirtualStreams(
            {
              ppg: currentSensorData.ppg,
              ecg: currentSensorData.ecg,
              emg: currentSensorData.emg,
              gsr: currentSensorData.gsr,
              mouseX: currentSensorData.mouseX,
              mouseY: currentSensorData.mouseY
            },
            streams,
            sysMappings
          );
        }
        
        // 2. Send to HeadlessNoiseCraft instances in MacroPatcher that are running this patch!
        macroNodes.forEach(node => {
          if (node.type === 'noisecraft_source' && node.params.patchFile === sys) {
            const contentWindow = noisecraftWindows.get(node.id);
            if (contentWindow) {
              // Construct params array
              const params: any[] = [];
              sysMappings.forEach(m => {
                const rawValue = evaluateStreamValue(m.streamId, streams, {
                  ppg: currentSensorData.ppg,
                  ecg: currentSensorData.ecg,
                  emg: currentSensorData.emg,
                  gsr: currentSensorData.gsr,
                  mouseX: currentSensorData.mouseX,
                  mouseY: currentSensorData.mouseY
                }, cache);
                
                params.push({
                  nodeId: m.nodeId,
                  paramName: 'value',
                  value: rawValue
                });
              });
              
              if (params.length > 0) {
                contentWindow.postMessage({
                  type: 'noiseCraft:setParams',
                  params,
                }, '*');
              }
            }
          }
        });
      });
    };

    const id = setInterval(tick, 33); // ~30fps, won't starve Three.js rAF
    return () => clearInterval(id);
  }, []);

  return null; // Invisible logical component
}
