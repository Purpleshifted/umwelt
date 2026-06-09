'use client';

import React, { useCallback, useState, useRef } from 'react';
import { getNoiseCraftBridge } from '@/audio/NoiseCraftBridge';
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
import { SliderInputNode, KnobInputNode, ModuleOutputNode, SectionBoxNode, GlobalUiOutNode, NullNode, TriggerNode } from './InputNodes';
import styles from './MusicLibraryScene.module.css';
import { musicEngine } from '@/audio/MusicEngine';

import { getHandleDataType, getCableColor } from '@/utils/musicNodeTypes';

// Custom edge type to allow dynamic styling based on source handle type
const edgeTypes = {
  // We can just use the default edge but pass a style, 
  // or we can define a custom edge if we want more complex things.
  // For now, we will just apply a style in onConnect or defaultEdgeOptions.
};

const nodeTypes = {
  musicModule: (props: any) => {
    const { module } = props.data;
    if (module.type === 'slider') return <SliderInputNode {...props} />;
    if (module.type === 'knob') return <KnobInputNode {...props} />;
    if (module.type === 'module_output') return <ModuleOutputNode {...props} />;
    if (module.type === 'section_box') return <SectionBoxNode {...props} />;
    if (module.type === 'global_ui_out') return <GlobalUiOutNode {...props} />;
    if (module.type === 'trigger_node') return <TriggerNode {...props} />;
    if (module.type === 'null_node') return <NullNode {...props} />;
    
    // Fallback for all other generators/modules
    return <MusicModuleNode {...props} />;
  }
};

function Flow() {
  const { modules, addModule, updateModule, updateMultipleModules, removeModule, edges, setEdges } = useMusicStore();
  const { streams } = useAudioMapStore();
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cleanup stale edges that cause React Flow warnings
  React.useEffect(() => {
    const staleHandles = ['attack', 'decay', 'sustain', 'release'];
    const hasStale = edges.some(e => 
      (e.sourceHandle && staleHandles.includes(e.sourceHandle)) || 
      (e.targetHandle && staleHandles.includes(e.targetHandle))
    );
    if (hasStale) {
      setEdges(edges.filter(e => 
        !(e.sourceHandle && staleHandles.includes(e.sourceHandle)) && 
        !(e.targetHandle && staleHandles.includes(e.targetHandle))
      ));
    }
  }, [edges, setEdges]);

  // Initialize MusicEngine (but do NOT start Transport — wait for user gesture)
  React.useEffect(() => {
    musicEngine.initialize().then(() => {
      musicEngine.initialize();
    }).catch(err => {
      console.warn('[MusicEngine] Initialization error caught in UI:', err);
      musicEngine.initialize();
    });
    return () => {
      musicEngine.stopTracks();
    };
  }, []);

  // ── Transport Controls ──
  const handlePlay = () => {
    // Resume AudioContext SYNCHRONOUSLY in the user gesture (click)
    if (musicEngine.Tone) {
      musicEngine.Tone.start(); // fire-and-forget
      try {
        const rawCtx = (musicEngine.Tone.context as any).rawContext
                     || (musicEngine.Tone.context as any)._context;
        if (rawCtx?.state === 'suspended') rawCtx.resume();
      } catch(e) {}
    }
    const engineCtx = musicEngine.getAudioContext();
    if (engineCtx.state === 'suspended') engineCtx.resume();

    // Brief delay for context to actually resume, then run full pipeline
    setTimeout(async () => {
      musicEngine.start();
      // playTracks does everything: evaluateDAG + create nodes + create Parts + start Transport
      await musicEngine.playTracks();
      getNoiseCraftBridge().startAudio();
    }, 100);

    setIsPlaying(true);
  };

  const handleStop = () => {
    musicEngine.stop();
    musicEngine.stopTracks();
    if (musicEngine.Tone) {
      musicEngine.Tone.Transport.stop();
    }
    getNoiseCraftBridge().stopAudio();
    setIsPlaying(false);
  };

  // Sync store modules to React Flow nodes
  React.useEffect(() => {
    setNodes((nds) => {
      // React Flow v11 requires parents to appear before children in the nodes array
      // Otherwise clampPositionToParent will throw "Cannot read properties of undefined (reading 'measured')"
      const sortedModules = [...modules].sort((a, b) => {
        if (a.id === b.parentId) return -1; // a is parent of b, a goes first
        if (b.id === a.parentId) return 1;  // b is parent of a, b goes first
        if (a.type === 'section_box' && b.type !== 'section_box') return -1; // all section_boxes first
        if (b.type === 'section_box' && a.type !== 'section_box') return 1;
        return 0;
      });

      const validParentIds = new Set(modules.map(m => m.id));

      return sortedModules.map((mod, i) => {
        const existing = nds.find(n => n.id === mod.id);
        const hasValidParent = mod.parentId && validParentIds.has(mod.parentId);
        
        if (existing) {
          // IMPORTANT: Spread existing to preserve internal React Flow state (like measured, dragging)
          const rfNode = {
            ...existing,
            position: existing.position, // Keep dragging smooth
            data: { module: mod, selected: existing.selected },
          };
          if (hasValidParent) {
            rfNode.parentId = mod.parentId;
            rfNode.extent = 'parent';
          } else {
            delete rfNode.parentId;
            delete rfNode.extent;
          }
          if (mod.type === 'section_box') {
            rfNode.zIndex = -1;
          }
          return rfNode;
        }

        // New node
        const rfNode: any = {
          id: mod.id,
          type: 'musicModule',
          position: mod.position || { x: 200 + (i % 3) * 320, y: 150 + Math.floor(i / 3) * 200 },
          selected: false,
          data: { module: mod, selected: false },
        };
        
        if (hasValidParent) {
          rfNode.parentId = mod.parentId;
          rfNode.extent = 'parent';
        }

        if (mod.type === 'section_box') {
          rfNode.zIndex = -1;
        }

        return rfNode;
      });
    });
  }, [modules, setNodes]);

  const onConnect = useCallback((params: any) => {
    setEdges((eds) => {
      const newEdge = { 
        ...params, 
        id: `e_${params.source}_${params.sourceHandle}_${params.target}_${params.targetHandle}_${Date.now()}`,
        animated: true
      };
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

  const { getIntersectingNodes, getNodes } = useReactFlow();

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    // Check if we dropped on a section_box
    const modType = (node.data as any)?.module?.type;
    if (node.type === 'musicModule' && modType !== 'section_box') {
      const intersections = getIntersectingNodes(node);
      const sectionBoxes = intersections.filter(n => (n.data as any)?.module?.type === 'section_box');

      
      const mod = node.data.module as MusicModule;
      if (sectionBoxes.length > 0) {
        // Find the first section box and attach to it
        const targetBox = sectionBoxes[0];
        if (mod.parentId !== targetBox.id) {
          const newPos = {
            x: Math.max(10, node.position.x - targetBox.position.x),
            y: Math.max(30, node.position.y - targetBox.position.y)
          };
          updateModule(mod.id, { 
            parentId: targetBox.id,
            position: newPos
          });
          setNodes(nds => nds.map(n => n.id === mod.id ? { ...n, parentId: targetBox.id, position: newPos, extent: 'parent' } : n));
        }
      } else {
        // If it was dropped outside of any section_box, but it currently has a parentId, detach it
        if (mod.parentId) {
          const parentNode = getNodes().find(n => n.id === mod.parentId);
          const newPos = parentNode ? {
            x: parentNode.position.x + node.position.x,
            y: parentNode.position.y + node.position.y
          } : node.position;
          updateModule(mod.id, { 
            parentId: undefined,
            position: newPos
          });
          setNodes(nds => nds.map(n => n.id === mod.id ? { ...n, parentId: undefined, position: newPos, extent: undefined } : n));
        }
      }
    }
  }, [getIntersectingNodes, updateModule, getNodes, setNodes]);

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
            selected: false,
            animated: true
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
      player_out: 'Player Out (Seq + Audio)',
      ai_seq_out: 'AI Seq Out (Noisecraft)',
      virtual_instrument: 'Virtual Instrument (Sampler)',
      polysynth: 'PolySynth (Tone.js)',
      oscillator: 'Oscillator',
      adsr_envelope: 'ADSR Envelope',
      filter: 'Filter',
      reverb: 'Reverb',
      mix_node: 'Mix Node',
      universal_preview: 'Universal Preview',
      section_box: 'Section Box',
      global_ui_out: 'Global UI Out',
      trigger_node: 'Trigger',
      player_node: 'Player',
      out_node: 'Audio Out',
      broadcast_node: 'Broadcast',
      null_node: 'Null'
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
      playerOutConfig: type === 'player_out' ? { trackName: 'Track 1', isPlaying: true } : undefined,
      polysynthConfig: type === 'polysynth' ? { oscillatorType: 'sine', attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 } : undefined,
      oscillatorConfig: type === 'oscillator' ? { type: 'sine' } : undefined,
      adsrEnvelopeConfig: type === 'adsr_envelope' ? { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1 } : undefined,
      filterConfig: type === 'filter' ? { type: 'lowpass', frequency: 1000, Q: 1 } : undefined,
      reverbConfig: type === 'reverb' ? { decay: 1.5, preDelay: 0.01, wet: 0.5 } : undefined,
      pedalFxConfig: type === 'pedal_fx' ? { effectType: 'reverb', mix: 0.5, param1: 0.5, param2: 0.5 } : undefined,
      effectChainConfig: type === 'effect_chain' ? { effects: [] } : undefined,
      mixNodeConfig: type === 'mix_node' ? { volA: 1.0, volB: 1.0 } : undefined,
      previewUtilConfig: type === 'preview_util' ? { playing: false } : undefined,
      universalPreviewConfig: type === 'universal_preview' ? { playing: false, activeType: null } : undefined,
      lfoConfig: type === 'lfo' ? { rate: 1.0, waveform: 'sine' } : undefined,
      triggerConfig: type === 'trigger_node' ? { mode: 'pulse', pitch: 69, isDown: false } : undefined,
      outConfig: type === 'out_node' ? { muted: false } : undefined,
      broadcastConfig: type === 'broadcast_node' ? { channel: 'A' } : undefined
    });
    closeContextMenu();
  };

  const handleBackToManager = () => {
    // We don't have a manager view yet in this prototype, just placeholder
  };

  const coloredEdges = React.useMemo(() => {
    return edges.map(edge => {
      let color = '#9ca3af'; // default gray
      let sourceNode = modules.find(m => m.id === edge.source);
      
      if (sourceNode) {
        // Resolve through null_nodes
        const visited = new Set<string>();
        let currentSource = sourceNode;
        let currentSourceHandle = edge.sourceHandle || '';
        while (currentSource && currentSource.type === 'null_node' && !visited.has(currentSource.id)) {
          visited.add(currentSource.id);
          const inEdge = edges.find(e => e.target === currentSource!.id);
          if (inEdge) {
            currentSource = modules.find(m => m.id === inEdge.source) || currentSource;
            currentSourceHandle = inEdge.sourceHandle || '';
          } else {
            break;
          }
        }
        
        const dataType = getHandleDataType(currentSource.type, currentSourceHandle, true);
        color = getCableColor(dataType);
      }
      
      return {
        ...edge,
        style: { ...edge.style, stroke: color, strokeWidth: 3 }
      };
    });
  }, [edges, modules]);

  return (
    <div className={styles.flowWrapper} onClick={closeContextMenu} style={{ position: 'relative' }}>
      {/* ── Transport Bar (fixed overlay above canvas) ── */}
      <div style={{
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 14px',
        background: 'rgba(15,15,15,0.92)',
        borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
      }}>
        {!isPlaying ? (
          <button
            onClick={(e) => { e.stopPropagation(); handlePlay(); }}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 18px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.5px'
            }}
          >
            ▶ PLAY
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); handleStop(); }}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '7px 18px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.5px'
            }}
          >
            ■ STOP
          </button>
        )}
        <span style={{ fontSize: '10px', color: isPlaying ? '#10b981' : '#666', fontWeight: 600, userSelect: 'none' }}>
          {isPlaying ? '● RUNNING' : '○ STOPPED'}
        </span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={coloredEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgeDoubleClick={(e, edge) => {
          setEdges(eds => eds.filter(x => x.id !== edge.id));
        }}
        isValidConnection={(connection) => {
          const sourceNode = nodes.find(n => n.id === connection.source);
          const targetNode = nodes.find(n => n.id === connection.target);
          if (!sourceNode || !targetNode) return false;
          
          const sourceType = getHandleDataType(sourceNode.type as string, connection.sourceHandle || '', true);
          const targetType = getHandleDataType(targetNode.type as string, connection.targetHandle || '', false);
          
          if (sourceType === 'any' || targetType === 'any') return true;
          return sourceType === targetType;
        }}
        onPaneContextMenu={handleContextMenu}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={[16, 16]}
        selectionMode={"partial" as any}
        panOnScroll={true}
        className="dark-theme-flow"
      >
        <Controls />
        <Background color="#111" gap={16} />

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
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f59e0b', borderBottom: '1px solid #444', marginBottom: '4px' }}>Generators (GEN)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('harmonic_progressor', contextMenu.x, contextMenu.y)}>Harmonic Progressor</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_progression', contextMenu.x, contextMenu.y)}>Chord Progression (Legacy)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('melody_gen', contextMenu.x, contextMenu.y)}>Melody Generator</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_gen', contextMenu.x, contextMenu.y)}>Chord Generator</button>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f472b6', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Modifiers (MOD)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('voice_splitter', contextMenu.x, contextMenu.y)}>Voice Splitter</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('sequence_adder', contextMenu.x, contextMenu.y)}>Sequence Adder</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('sequence_morpher', contextMenu.x, contextMenu.y)}>Sequence Morpher</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('register_shifter', contextMenu.x, contextMenu.y)}>Register Shifter</button>

            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#3b82f6', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Signals (CHOP)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('slider', contextMenu.x, contextMenu.y)}>Slider Input</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('knob', contextMenu.x, contextMenu.y)}>Knob Input</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_stream', contextMenu.x, contextMenu.y)}>Virtual Stream</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('lfo', contextMenu.x, contextMenu.y)}>LFO</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('trigger_node', contextMenu.x, contextMenu.y)}>Trigger (Event)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('seq_to_freq', contextMenu.x, contextMenu.y)}>Seq → Freq Convert</button>
          </div>

          <div style={{ width: '200px' }}>
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#10b981', borderBottom: '1px solid #444', marginBottom: '4px' }}>Audio Source (AGEN)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('oscillator', contextMenu.x, contextMenu.y)}>Oscillator</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('polysynth', contextMenu.x, contextMenu.y)}>PolySynth (Tone.js)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_instrument', contextMenu.x, contextMenu.y)}>Virtual Instrument (Sampler)</button>
            
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#10b981', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Audio FX (AFX)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('adsr_envelope', contextMenu.x, contextMenu.y)}>ADSR Envelope</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('filter', contextMenu.x, contextMenu.y)}>Filter</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('reverb', contextMenu.x, contextMenu.y)}>Reverb</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('effect_chain', contextMenu.x, contextMenu.y)}>Effect Chain (Multi FX)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('pedal_fx', contextMenu.x, contextMenu.y)}>Pedal Node (Legacy)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('mix_node', contextMenu.x, contextMenu.y)}>Mix Node</button>

            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#9ca3af', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Outputs (OUT)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('out_node', contextMenu.x, contextMenu.y)}>Audio Out</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('player_node', contextMenu.x, contextMenu.y)}>Player Node (Audio)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('broadcast_node', contextMenu.x, contextMenu.y)}>Broadcast (Audio)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('ai_seq_out', contextMenu.x, contextMenu.y)}>AI Seq Out (Noisecraft)</button>

            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#9ca3af', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Utilities (UTIL)</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('null_node', contextMenu.x, contextMenu.y)}>Null (Pass-through)</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('section_box', contextMenu.x, contextMenu.y)}>Section Box</button>
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
