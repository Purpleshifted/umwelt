'use client';

import React, { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  Node,
  Edge,
  NodeChange,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Panel,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useMusicStore, MusicModuleType, MusicModule } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import MusicModuleNode from './MusicModuleNode';
import { SliderInputNode, KnobInputNode, ModuleOutputNode } from './InputNodes';
import styles from './MusicLibraryScene.module.css';
import { musicEngine } from '@/audio/MusicEngine';

const nodeTypes = {
  musicModule: (props: any) => {
    const { module } = props.data;
    if (module.type === 'slider') return <SliderInputNode {...props} />;
    if (module.type === 'knob') return <KnobInputNode {...props} />;
    if (module.type === 'module_output') return <ModuleOutputNode {...props} />;
    
    // Fallback for all other generators/modules
    return <MusicModuleNode {...props} />;
  }
};

function Flow() {
  const { modules, addModule, updateMultipleModules, removeModule, edges, setEdges } = useMusicStore();
  const { streams } = useAudioMapStore();
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);

  // Initialize and start MusicEngine
  React.useEffect(() => {
    musicEngine.initialize().then(() => {
      musicEngine.start();
    }).catch(err => {
      console.warn('[MusicEngine] Initialization error caught in UI:', err);
      musicEngine.start(); // Start anyway to use the fallback generator
    });
    return () => {
      musicEngine.stop();
    };
  }, []);

  // Sync store modules to React Flow nodes
  React.useEffect(() => {
    setNodes((nds) => {
      return modules.map((mod, i) => {
        const existing = nds.find(n => n.id === mod.id);
        return {
          id: mod.id,
          type: 'musicModule',
          position: existing ? existing.position : (mod.position || { x: 200 + (i % 3) * 320, y: 150 + Math.floor(i / 3) * 200 }),
          selected: existing ? existing.selected : false,
          data: { module: mod, selected: existing ? existing.selected : false },
        };
      });
    });
  }, [modules, setNodes]);

  const onConnect = useCallback((params: any) => {
    setEdges((eds) => {
      const newEdge = { ...params, id: `e_${params.source}_${params.sourceHandle}_${params.target}_${params.targetHandle}_${Date.now()}` };
      return [...eds, newEdge];
    });
  }, [setEdges]);

  const onEdgesChange = useCallback((changes: any[]) => {
    setEdges((eds) => {
      const remainingEdges = eds.filter((e) => {
        const removeChange = changes.find((c) => c.type === 'remove' && c.id === e.id);
        return !removeChange;
      });
      return remainingEdges;
    });
  }, [setEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChangeBase(changes);
      
      const positionUpdates: {id: string, changes: Partial<MusicModule>}[] = [];
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          positionUpdates.push({ id: change.id, changes: { position: change.position } });
        } else if (change.type === 'remove') {
          removeModule(change.id);
        }
      });
      if (positionUpdates.length > 0) {
        updateMultipleModules(positionUpdates);
      }
    },
    [onNodesChangeBase, updateMultipleModules, removeModule]
  );

  const { getNodes } = useReactFlow();
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        const selectedNodes = getNodes().filter(n => n.selected);
        if (selectedNodes.length === 0) return;
        
        const idMap = new Map<string, string>();
        
        selectedNodes.forEach(node => {
          const mod = node.data.module as MusicModule;
          const newId = `music_mod_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          idMap.set(mod.id, newId);
          
          addModule({
            ...mod,
            id: newId,
            position: { x: (mod.position?.x || node.position.x) + 50, y: (mod.position?.y || node.position.y) + 50 },
            name: `${mod.name} (copy)`
          });
        });
        
        const selectedEdges = edges.filter(e => idMap.has(e.source) && idMap.has(e.target));
        selectedEdges.forEach(e => {
          setEdges(eds => [...eds, {
            ...e,
            id: `e_${idMap.get(e.source)}_${e.sourceHandle}_${idMap.get(e.target)}_${e.targetHandle}_${Date.now()}`,
            source: idMap.get(e.source)!,
            target: idMap.get(e.target)!,
            selected: false
          }]);
        });
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [getNodes, edges, setEdges, addModule]);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean } | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    const menuHeight = 750; // Estimated height of the full menu
    let y = e.clientY;
    let x = e.clientX;
    
    // If clicking too close to the bottom, shift the menu up so it doesn't get squished too much
    if (y > window.innerHeight - 300) {
      y = Math.max(20, window.innerHeight - 300);
    }
    
    setContextMenu({ x, y, show: true });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAddModule = (type: MusicModuleType, x?: number, y?: number) => {
    let position = { x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 100 };
    if (x !== undefined && y !== undefined) {
      position = screenToFlowPosition({ x, y });
    }
    
    const names: Record<string, string> = {
      chord_progression: 'Chord Progression',
      harmonic_progressor: 'Harmonic Progressor',
      melody_gen: 'Melody Generator',
      chord_gen: 'Chord Generator',
      piano_genie: 'Piano Genie',
      coconet_harmonizer: 'Coconet Harmonizer',
      voice_splitter: 'Voice Splitter',
      sequence_adder: 'Sequence Adder',
      sequence_morpher: 'Sequence Morpher',
      register_shifter: 'Register Shifter',
      slider: 'SLIDER',
      knob: 'KNOB',
      module_output: 'MODULE_OUTPUT',
      virtual_stream: 'VIRTUAL_STREAM',
      score_out: 'Score Out (Audio)',
      track_out: 'Track Out (Audio)',
      ai_seq_out: 'AI Seq Out (Noisecraft)',
      virtual_instrument: 'Virtual Instrument (Sampler)',
      polysynth: 'PolySynth (Tone.js)',
      oscillator: 'Oscillator',
      adsr_envelope: 'ADSR Envelope',
      filter: 'Filter',
      reverb: 'Reverb',
      mix_node: 'Mix Node'
    };
    
    addModule({
      id: `music_mod_${Date.now()}`,
      name: names[type] ?? type.replace('_', ' ').toUpperCase(),
      type,
      inputStreamId: null,
      position,
      sineConfig: type === 'sine' ? { frequency: 1.0 } : undefined,
      noiseConfig: type === 'noise' ? { speed: 1.0 } : undefined,
      chordProgressionConfig: type === 'chord_progression' ? { mode: 'major' } : undefined,
      harmonicProgressorConfig: type === 'harmonic_progressor' ? { valence: 0.5, arousal: 0.5 } : undefined,
      melodyGenConfig: type === 'melody_gen' ? { register: 0, rhythmicComplexity: 0.5, swingAmount: 0.0, algorithm: 'procedural' } : undefined,
      chordGenConfig: type === 'chord_gen' ? { register: 0, style: 'block' } : undefined,
      voiceSplitterConfig: type === 'voice_splitter' ? {} : undefined,
      sequenceAdderConfig: type === 'sequence_adder' ? {} : undefined,
      registerShifterConfig: type === 'register_shifter' ? { semitones: 0 } : undefined,
      sequenceMorpherConfig: type === 'sequence_morpher' ? { morphAmount: 0.5 } : undefined,
      pianoGenieConfig: type === 'piano_genie' ? {} : undefined,
      coconetHarmonizerConfig: type === 'coconet_harmonizer' ? {} : undefined,
      scoreOutConfig: type === 'score_out' ? { channel: 'A', instrument: 'synth', isPlaying: true } : undefined,
      aiSeqOutConfig: type === 'ai_seq_out' ? { masterClockEnabled: true } : undefined,
      virtualInstrumentConfig: type === 'virtual_instrument' ? { instrument: 'acoustic_grand_piano', volume: 0.8 } : undefined,
      trackOutConfig: type === 'track_out' ? { trackName: 'Track 1' } : undefined,
      polysynthConfig: type === 'polysynth' ? { oscillatorType: 'sine', attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 } : undefined,
      oscillatorConfig: type === 'oscillator' ? { type: 'sine' } : undefined,
      adsrEnvelopeConfig: type === 'adsr_envelope' ? { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 } : undefined,
      filterConfig: type === 'filter' ? { type: 'lowpass', frequency: 1000, Q: 1 } : undefined,
      reverbConfig: type === 'reverb' ? { decay: 1.5, preDelay: 0.01, wet: 0.5 } : undefined,
      mixNodeConfig: type === 'mix_node' ? { volA: 1.0, volB: 1.0 } : undefined,
      previewUtilConfig: type === 'preview_util' ? { playing: false } : undefined
    });
    closeContextMenu();
  };

  return (
    <div className={styles.flowWrapper} onClick={closeContextMenu}>
      <div style={{ position: 'absolute', bottom: 30, left: 30, zIndex: 10, display: 'flex', gap: '8px' }}>
        <button className={styles.btn} onClick={() => {
          musicEngine.playTracks();
        }}>▶ Play Tracks</button>
        <button className={styles.btn} onClick={() => {
          musicEngine.stopTracks();
        }}>⏹ Stop Tracks</button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneContextMenu={handleContextMenu}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
        className={styles.reactFlow}
      >
        <Background color="#333" gap={16} />
        <Controls />
        <MiniMap 
          nodeColor={(n) => {
            if (n.type === 'musicModule') return '#666';
            return '#fff';
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ backgroundColor: '#111' }}
        />


        {contextMenu?.show && (
          <div 
            className={styles.contextMenu} 
            style={{ 
              position: 'absolute', 
              top: contextMenu.y, 
              left: contextMenu.x, 
              zIndex: 1000, 
              background: '#222', 
              border: '1px solid #444', 
              borderRadius: '6px',
              padding: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              flexWrap: 'wrap',
              maxHeight: `calc(100vh - ${contextMenu.y}px - 20px)`,
              alignContent: 'flex-start',
              gap: '0 16px'
            }}
          >
          <div style={{ width: '200px' }}>
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f59e0b', borderBottom: '1px solid #444', marginBottom: '4px' }}>Harmonic</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('harmonic_progressor', contextMenu.x, contextMenu.y)}>Harmonic Progressor</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_progression', contextMenu.x, contextMenu.y)}>Chord Progression (Legacy)</button>

            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#34d399', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Generators</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('melody_gen', contextMenu.x, contextMenu.y)}>Melody Generator</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_gen', contextMenu.x, contextMenu.y)}>Chord Generator</button>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f472b6', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Processing</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('voice_splitter', contextMenu.x, contextMenu.y)}>Voice Splitter</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('sequence_adder', contextMenu.x, contextMenu.y)}>Sequence Adder</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('sequence_morpher', contextMenu.x, contextMenu.y)}>Sequence Morpher</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('register_shifter', contextMenu.x, contextMenu.y)}>Register Shifter</button>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#888', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Inputs</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('slider', contextMenu.x, contextMenu.y)}>Slider Input</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('knob', contextMenu.x, contextMenu.y)}>Knob Input</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_stream', contextMenu.x, contextMenu.y)}>Virtual Stream</button>
          </div>

          <div style={{ width: '200px' }}>
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ff6b6b', borderBottom: '1px solid #444', marginBottom: '4px' }}>Instrument & Synthesis</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_instrument', contextMenu.x, contextMenu.y)}>Virtual Instrument (Sampler)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('polysynth', contextMenu.x, contextMenu.y)}>PolySynth (Tone.js)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('oscillator', contextMenu.x, contextMenu.y)}>Oscillator</button>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ff6b6b', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Effects & Utility</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('adsr_envelope', contextMenu.x, contextMenu.y)}>ADSR Envelope</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('filter', contextMenu.x, contextMenu.y)}>Filter</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('reverb', contextMenu.x, contextMenu.y)}>Reverb</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('mix_node', contextMenu.x, contextMenu.y)}>Mix Node</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('seq_to_freq', contextMenu.x, contextMenu.y)}>Seq → Freq Convert</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('preview_util', contextMenu.x, contextMenu.y)}>Preview Utility</button>

            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ff6b6b', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Output</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('track_out', contextMenu.x, contextMenu.y)}>Track Out (Audio)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('ai_seq_out', contextMenu.x, contextMenu.y)}>AI Seq Out (Noisecraft)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => handleAddModule('module_output', contextMenu.x, contextMenu.y)}>Network Output</button>
          </div>
        </div>
        )}
      </ReactFlow>
    </div>
  );
}

export default function MusicLibraryScene() {
  return (
    <div className={styles.container}>
      <ReactFlowProvider>
        <Flow />
      </ReactFlowProvider>
    </div>
  );
}
