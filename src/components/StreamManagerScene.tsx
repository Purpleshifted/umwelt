'use client';

import React, { useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  Connection,
  Edge,
  Node,
  applyNodeChanges,
  NodeChange,
  ReactFlowProvider,
  useReactFlow,
  useOnSelectionChange,
  useNodesState,
  useEdgesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAudioMapStore, VirtualStream } from '@/store/audioMapStore';
import StreamNode from './StreamNode';
import VirtualBiosignalSimulator from './VirtualBiosignalSimulator';
import styles from './StreamManagerScene.module.css';

const nodeTypes = {
  streamNode: StreamNode,
};

function Flow() {
  const { streams, addStream, updateStream, updateMultipleStreams, deleteStream } = useAudioMapStore();
  const { screenToFlowPosition } = useReactFlow();
  const flowWrapper = useRef<HTMLDivElement>(null);
  
  const [menu, setMenu] = useState<{ top: number; left: number; x: number; y: number } | null>(null);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);

  // Sync store streams to React Flow nodes/edges
  React.useEffect(() => {
    setNodes((nds) => {
      return streams.map((stream, i) => {
        const existing = nds.find(n => n.id === stream.id);
        return {
          id: stream.id,
          type: 'streamNode',
          position: existing ? existing.position : (stream.position || { x: 100 + (i % 3) * 250, y: 100 + Math.floor(i / 3) * 200 }),
          selected: existing ? existing.selected : false,
          measured: existing ? existing.measured : undefined,
          width: existing ? existing.width : undefined,
          height: existing ? existing.height : undefined,
          dragging: existing ? existing.dragging : false,
          data: { stream, selected: existing ? existing.selected : false },
        };
      });
    });

    setEdges((eds) => {
      const newEdges: Edge[] = [];
      streams.forEach(stream => {
        if (stream.sourceA) {
          newEdges.push({ id: `e-${stream.sourceA}-${stream.id}-A`, source: stream.sourceA, target: stream.id, targetHandle: 'sourceA', animated: true, style: { stroke: '#a78bfa', strokeWidth: 2 } });
        }
        if (stream.sourceB) {
          newEdges.push({ id: `e-${stream.sourceB}-${stream.id}-B`, source: stream.sourceB, target: stream.id, targetHandle: 'sourceB', animated: true, style: { stroke: '#4ecdc4', strokeWidth: 2 } });
        }
      });
      return newEdges;
    });
  }, [streams, setNodes, setEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChangeBase(changes);
      
      const positionUpdates: {id: string, changes: Partial<VirtualStream>}[] = [];
      changes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          positionUpdates.push({ id: change.id, changes: { position: change.position } });
        }
      });
      
      if (positionUpdates.length > 0) {
        updateMultipleStreams(positionUpdates, false); // false = don't spam history
      }
    },
    [onNodesChangeBase, updateMultipleStreams]
  );

  const handleDragStop = useCallback(() => {
    const state = useAudioMapStore.getState();
    state.pushHistory(state.streams, state.mappings);
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.targetHandle === 'sourceA') {
        updateStream(connection.target, { sourceA: connection.source });
      } else if (connection.targetHandle === 'sourceB') {
        updateStream(connection.target, { sourceB: connection.source });
      }
    },
    [updateStream]
  );

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach((edge) => {
        if (edge.targetHandle === 'sourceA') {
          updateStream(edge.target, { sourceA: undefined });
        } else if (edge.targetHandle === 'sourceB') {
          updateStream(edge.target, { sourceB: undefined });
        }
      });
    },
    [updateStream]
  );

  const onNodesDelete = useCallback(
    (nodesToDelete: Node[]) => {
      nodesToDelete.forEach((node) => {
        deleteStream(node.id);
      });
    },
    [deleteStream]
  );

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      setMenu({
        top: event.clientY,
        left: event.clientX,
        x: position.x,
        y: position.y
      });
    },
    [screenToFlowPosition]
  );

  const onPaneClick = useCallback(() => {
    setMenu(null);
  }, []);

  const handleAddSensor = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Sensor ${streams.length + 1}`, type: 'sensor', sensor: 'ppg', position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddMath = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Math ${streams.length + 1}`, type: 'math', op: 'add', position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddConstant = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Const ${streams.length + 1}`, type: 'constant', constantValue: 1.0, position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddOut = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Out ${streams.length + 1}`, type: 'out', position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddMonitor = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Monitor ${streams.length + 1}`, type: 'monitor', position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddUI = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `UI ${streams.length + 1}`, type: 'ui', uiElement: 'toggle', constantValue: 0, position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const handleAddSectionBox = () => {
    if (!menu) return;
    addStream({ id: Date.now().toString(), name: `Section ${streams.length + 1}`, type: 'sectionBox', sectionLabel: '', position: { x: menu.x, y: menu.y } });
    setMenu(null);
  };

  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  
  useOnSelectionChange({
    onChange: ({ nodes }) => {
      setSelectedNodeIds(nodes.map(n => n.id));
    },
  });

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        const state = useAudioMapStore.getState();
        if (e.shiftKey) {
          if (typeof state.redo === 'function') state.redo();
        } else {
          if (typeof state.undo === 'function') state.undo();
        }
        return;
      }
      
      // Cmd/Ctrl + D to Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        
        const state = useAudioMapStore.getState();
        selectedNodeIds.forEach(id => {
          const stream = state.streams.find(s => s.id === id);
          if (stream) {
            const newId = Date.now().toString() + Math.floor(Math.random() * 1000);
            state.addStream({
              ...stream,
              id: newId,
              name: `${stream.name} (Copy)`,
              position: { x: (stream.position?.x || 0) + 50, y: (stream.position?.y || 0) + 50 },
              sourceA: undefined, // Don't copy connections automatically to avoid chaos
              sourceB: undefined
            });
          }
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds]);

  return (
    <div className={styles.container}>
      <VirtualBiosignalSimulator />
      
      <div className={styles.canvasWrapper} ref={flowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodesDelete={onNodesDelete}
          onNodeDragStop={handleDragStop}
          onSelectionDragStop={handleDragStop}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          selectionKeyCode="Shift"
          multiSelectionKeyCode="Shift"
          selectionMode={"partial" as any}
          panOnScroll={true}
          fitView
          className="dark-theme-flow"
        >
          <Controls />
          <Background color="#333" gap={16} />
        </ReactFlow>

        {menu && (
          <div className={styles.contextMenu} style={{ top: menu.top, left: menu.left }} onMouseLeave={() => setMenu(null)}>
            <div className={styles.menuHeader}>ADD NODE</div>
            <button onClick={handleAddSensor}>📡 Sensor (PPG, ECG...)</button>
            <button onClick={handleAddConstant}># Constant</button>
            <button onClick={handleAddMath}>∑ Math / Filter</button>
            <button onClick={handleAddOut}>➡️ Stream Out</button>
            <button onClick={handleAddMonitor}>👁 Monitor Out</button>
            <div className={styles.menuHeader}>UI / LAYOUT</div>
            <button onClick={handleAddUI}>🎛 UI Element</button>
            <button onClick={handleAddSectionBox}>▢ Section Box</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StreamManagerScene() {
  return (
    <ReactFlowProvider>
      <Flow />
    </ReactFlowProvider>
  );
}
