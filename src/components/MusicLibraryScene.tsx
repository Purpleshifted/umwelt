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

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean } | null>(null);

  const handleContextMenu = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
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
      magenta_ai: 'Magenta Composer',
      harmonic_array: 'Harmonic Array',
      chord_progression: 'Chord Progression',
      melody_gen: 'Melody Generator',
      chord_gen: 'Chord Generator',
      voice_splitter: 'Voice Splitter',
      register_shift: 'Register Shift',
      slider: 'SLIDER',
      knob: 'KNOB',
      module_output: 'MODULE_OUTPUT',
      virtual_stream: 'VIRTUAL_STREAM',
      audio_preview: 'Audio Preview',
    };
    
    addModule({
      id: `music_mod_${Date.now()}`,
      name: names[type] ?? type.replace('_', ' ').toUpperCase(),
      type,
      inputStreamId: null,
      position,
      harmonicConfig: type === 'harmonic_array' ? {
        scaleType: 'dorian',
        rootNote: 60,
        octaveRange: 2
      } : undefined,
      magentaConfig: type === 'magenta_ai' ? {
        temperatureMin: 0.1,
        temperatureMax: 1.5,
        density: 0.8
      } : undefined,
      sineConfig: type === 'sine' ? { frequency: 1.0 } : undefined,
      noiseConfig: type === 'noise' ? { speed: 1.0 } : undefined,
      chordProgressionConfig: type === 'chord_progression' ? { mode: 'major' } : undefined,
      melodyGenConfig: type === 'melody_gen' ? { register: 0 } : undefined,
      chordGenConfig: type === 'chord_gen' ? { register: 0, style: 'block' } : undefined,
      voiceSplitterConfig: type === 'voice_splitter' ? {} : undefined,
      registerShiftConfig: type === 'register_shift' ? { shift: 0 } : undefined,
      audioPreviewConfig: type === 'audio_preview' ? { isPlaying: false, waveType: 'sine' } : undefined,
    });
    closeContextMenu();
  };

  return (
    <div className={styles.flowWrapper} onClick={closeContextMenu}>
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
        
        <Panel position="top-left" className={styles.toolbar}>
          <div className={styles.title}>Generators</div>
          <button className={styles.btn} onClick={() => handleAddModule('chord_progression')}>
            + Chord Progression
          </button>
          <button className={styles.btn} onClick={() => handleAddModule('melody_gen')}>
            + Melody Generator
          </button>
          <button className={styles.btn} onClick={() => handleAddModule('chord_gen')}>
            + Chord Generator
          </button>
          <div className={styles.title} style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>Processing</div>
          <button className={styles.btn} onClick={() => handleAddModule('voice_splitter')}>
            + Voice Splitter
          </button>
          <button className={styles.btn} onClick={() => handleAddModule('register_shift')}>
            + Register Shift
          </button>
          <div className={styles.title} style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>Legacy</div>
          <button className={styles.btn} onClick={() => handleAddModule('harmonic_array')}>
            + Harmonic Array
          </button>
          <button className={styles.btn} onClick={() => handleAddModule('magenta_ai')}>
            + Magenta AI
          </button>
        </Panel>

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
              borderRadius: '4px',
              padding: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f59e0b', borderBottom: '1px solid #444', marginBottom: '4px' }}>Harmonic</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_progression', contextMenu.x, contextMenu.y)}>Chord Progression</button>

          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#34d399', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Generators</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('melody_gen', contextMenu.x, contextMenu.y)}>Melody Generator</button>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('chord_gen', contextMenu.x, contextMenu.y)}>Chord Generator</button>
          
          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f472b6', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Processing</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('voice_splitter', contextMenu.x, contextMenu.y)}>Voice Splitter</button>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('register_shift', contextMenu.x, contextMenu.y)}>Register Shift</button>
          
          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#888', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Inputs</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('slider', contextMenu.x, contextMenu.y)}>Slider Input</button>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('knob', contextMenu.x, contextMenu.y)}>Knob Input</button>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_stream', contextMenu.x, contextMenu.y)}>Virtual Stream</button>

          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#f472b6', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Preview</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('audio_preview', contextMenu.x, contextMenu.y)}>Audio Preview</button>

          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#ff6b6b', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Output</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => handleAddModule('module_output', contextMenu.x, contextMenu.y)}>Output Channel</button>
          
          <div style={{ padding: '4px 8px', fontSize: '11px', color: '#666', borderBottom: '1px solid #444', marginBottom: '4px', marginTop: '8px' }}>Legacy</div>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('magenta_ai', contextMenu.x, contextMenu.y)}>Magenta Composer</button>
          <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => handleAddModule('harmonic_array', contextMenu.x, contextMenu.y)}>Harmonic Array</button>
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
