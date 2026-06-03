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
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useMusicStore, MusicModuleType, MusicModule } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import MusicModuleNode from './MusicModuleNode';
import styles from './MusicLibraryScene.module.css';
import { musicEngine } from '@/audio/MusicEngine';

const nodeTypes = {
  musicModule: MusicModuleNode,
};

function Flow() {
  const { modules, addModule, updateMultipleModules, edges, setEdges } = useMusicStore();
  const { streams } = useAudioMapStore();
  
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
      const newEdge = { ...params, id: `e_${params.source}_${params.target}` };
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
        }
      });
      
      if (positionUpdates.length > 0) {
        updateMultipleModules(positionUpdates);
      }
    },
    [onNodesChangeBase, updateMultipleModules]
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
    const defaultX = window.innerWidth / 2 - 140;
    const defaultY = window.innerHeight / 2 - 100;
    
    addModule({
      id: `music_mod_${Date.now()}`,
      name: type === 'magenta_ai' ? 'Magenta Composer' : type === 'harmonic_array' ? 'Harmonic Array' : type.replace('_', ' ').toUpperCase(),
      type,
      inputStreamId: null,
      position: { x: x ?? defaultX, y: y ?? defaultY },
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
      noiseConfig: type === 'noise' ? { speed: 1.0 } : undefined
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
            <div style={{ padding: '4px 8px', fontSize: '11px', color: '#888', borderBottom: '1px solid #444', marginBottom: '4px' }}>Add Input</div>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('virtual_stream', contextMenu.x, contextMenu.y)}>Virtual Stream</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: '2px' }} onClick={() => handleAddModule('sine', contextMenu.x, contextMenu.y)}>Sine LFO</button>
            <button className={styles.btn} style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => handleAddModule('noise', contextMenu.x, contextMenu.y)}>Noise</button>
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
