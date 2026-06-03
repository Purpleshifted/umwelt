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
  const { modules, addModule, updateMultipleModules } = useMusicStore();
  const { streams } = useAudioMapStore();
  
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

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

  // Sync store modules to React Flow nodes/edges
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

    // We can also draw logical edges from virtual streams if we want to represent them as nodes
    // but for now, virtual streams are just dropdowns inside the MusicModuleNode.
    setEdges([]);
  }, [modules, setNodes, setEdges]);

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

  const handleAddModule = (type: MusicModuleType) => {
    addModule({
      id: `music_mod_${Date.now()}`,
      name: type === 'magenta_ai' ? 'Magenta Composer' : 'Harmonic Array',
      type,
      inputStreamId: null,
      position: { x: window.innerWidth / 2 - 140, y: window.innerHeight / 2 - 100 },
      harmonicConfig: type === 'harmonic_array' ? {
        scaleType: 'dorian',
        rootNote: 60,
        octaveRange: 2
      } : undefined,
      magentaConfig: type === 'magenta_ai' ? {
        temperatureMin: 0.1,
        temperatureMax: 1.5,
        density: 0.8
      } : undefined
    });
  };

  return (
    <div className={styles.flowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
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
          <div className={styles.title}>Music Library Graph</div>
          <button className={styles.btn} onClick={() => handleAddModule('harmonic_array')}>
            + Harmonic Array
          </button>
          <button className={styles.btn} onClick={() => handleAddModule('magenta_ai')}>
            + Magenta AI
          </button>
        </Panel>
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
