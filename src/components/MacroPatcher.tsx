'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeTypes,
  Handle,
  Position,
  type OnConnect,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  useAudioGraphStore,
  AudioNodeType,
  AudioGraphNode,
  DEFAULT_PARAMS,
  NODE_LABELS,
} from '@/store/audioGraphStore';
import styles from './MacroPatcher.module.css';

// ─── Node type icons ───
const NODE_ICONS: Record<AudioNodeType, string> = {
  noisecraft_source: '🎹',
  oscillator: '〰️',
  gain: '🔊',
  biquad_filter: '🎚️',
  delay: '⏱️',
  convolver_reverb: '🌊',
  hrtf_panner: '🎧',
  stereo_panner: '↔️',
  analyser: '📊',
  destination: '🔈',
};

const ACCENT_CLASSES: Record<AudioNodeType, string> = {
  noisecraft_source: styles.nodeAccent_noisecraft,
  oscillator: styles.nodeAccent_oscillator,
  gain: styles.nodeAccent_gain,
  biquad_filter: styles.nodeAccent_filter,
  delay: styles.nodeAccent_delay,
  convolver_reverb: styles.nodeAccent_reverb,
  hrtf_panner: styles.nodeAccent_panner,
  stereo_panner: styles.nodeAccent_panner,
  analyser: styles.nodeAccent_analyser,
  destination: styles.nodeAccent_destination,
};

// ─── Generic Audio Node Component ───
function AudioNodeComponent({ id, data, selected }: { id: string; data: any; selected?: boolean }) {
  const graphNode: AudioGraphNode = data.graphNode;
  const updateParams = useAudioGraphStore((s) => s.updateNodeParams);
  const removeNode = useAudioGraphStore((s) => s.removeNode);
  const rebuild = useAudioGraphStore((s) => s.rebuildAudioGraph);
  const nodeType = graphNode.type;

  const handleParamChange = (key: string, value: number | string) => {
    updateParams(id, { [key]: value });
    // Debounced rebuild
    clearTimeout((window as any).__macroPatcherRebuildTimer);
    (window as any).__macroPatcherRebuildTimer = setTimeout(() => rebuild(), 50);
  };

  const isDestination = nodeType === 'destination';

  return (
    <div
      className={`${styles.audioNode} ${ACCENT_CLASSES[nodeType] || ''} ${selected ? styles.selected : ''} ${
        isDestination ? styles.destinationNode : ''
      } ${nodeType === 'noisecraft_source' ? styles.noisecraftNode : ''}`}
    >
      {/* Input handle */}
      {nodeType !== 'noisecraft_source' && nodeType !== 'oscillator' && (
        <Handle type="target" position={Position.Left} id="in" className={styles.handleIn} />
      )}

      <div className={styles.nodeHeader}>
        <span className={styles.nodeIcon}>{NODE_ICONS[nodeType]}</span>
        <span className={styles.nodeTitle}>{graphNode.label}</span>
        {!isDestination && (
          <button className={styles.nodeDeleteBtn} onClick={() => { removeNode(id); rebuild(); }}>
            ×
          </button>
        )}
      </div>

      <div className={styles.nodeBody}>
        {/* ─── Per-type parameter controls ─── */}

        {nodeType === 'gain' && (
          <ParamSlider label="Gain" value={graphNode.params.gain as number} min={0} max={2} step={0.01} onChange={(v) => handleParamChange('gain', v)} nodeId={id} paramName="gain" />
        )}

        {nodeType === 'oscillator' && (
          <>
            <ParamSelect label="Wave" value={graphNode.params.type as string} options={['sine', 'square', 'sawtooth', 'triangle']} onChange={(v) => handleParamChange('type', v)} nodeId={id} paramName="type" />
            <ParamSlider label="Freq" value={graphNode.params.frequency as number} min={20} max={2000} step={1} onChange={(v) => handleParamChange('frequency', v)} nodeId={id} paramName="frequency" />
            <ParamSlider label="Gain" value={graphNode.params.gain as number} min={0} max={1} step={0.01} onChange={(v) => handleParamChange('gain', v)} nodeId={id} paramName="gain" />
          </>
        )}

        {nodeType === 'biquad_filter' && (
          <>
            <ParamSelect label="Type" value={graphNode.params.type as string} options={['lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'peaking', 'lowshelf', 'highshelf']} onChange={(v) => handleParamChange('type', v)} nodeId={id} paramName="type" />
            <ParamSlider label="Freq" value={graphNode.params.frequency as number} min={20} max={20000} step={1} onChange={(v) => handleParamChange('frequency', v)} nodeId={id} paramName="frequency" />
            <ParamSlider label="Q" value={graphNode.params.Q as number} min={0.1} max={30} step={0.1} onChange={(v) => handleParamChange('Q', v)} nodeId={id} paramName="Q" />
          </>
        )}

        {nodeType === 'delay' && (
          <>
            <ParamSlider label="Time" value={graphNode.params.delayTime as number} min={0.01} max={2} step={0.01} onChange={(v) => handleParamChange('delayTime', v)} nodeId={id} paramName="delayTime" />
            <ParamSlider label="Feedback" value={graphNode.params.feedback as number} min={0} max={0.95} step={0.01} onChange={(v) => handleParamChange('feedback', v)} nodeId={id} paramName="feedback" />
            <ParamSlider label="Wet" value={graphNode.params.wet as number} min={0} max={1} step={0.01} onChange={(v) => handleParamChange('wet', v)} nodeId={id} paramName="wet" />
          </>
        )}

        {nodeType === 'convolver_reverb' && (
          <>
            <ParamSlider label="Wet" value={graphNode.params.wet as number} min={0} max={1} step={0.01} onChange={(v) => handleParamChange('wet', v)} nodeId={id} paramName="wet" />
            <ParamSlider label="Dry" value={graphNode.params.dry as number} min={0} max={1} step={0.01} onChange={(v) => handleParamChange('dry', v)} nodeId={id} paramName="dry" />
          </>
        )}

        {nodeType === 'hrtf_panner' && (
          <>
            <ParamSlider label="X" value={graphNode.params.positionX as number} min={-10} max={10} step={0.1} onChange={(v) => handleParamChange('positionX', v)} nodeId={id} paramName="positionX" />
            <ParamSlider label="Y" value={graphNode.params.positionY as number} min={-10} max={10} step={0.1} onChange={(v) => handleParamChange('positionY', v)} nodeId={id} paramName="positionY" />
            <ParamSlider label="Z" value={graphNode.params.positionZ as number} min={-10} max={10} step={0.1} onChange={(v) => handleParamChange('positionZ', v)} nodeId={id} paramName="positionZ" />
          </>
        )}

        {nodeType === 'stereo_panner' && (
          <ParamSlider label="Pan" value={graphNode.params.pan as number} min={-1} max={1} step={0.01} onChange={(v) => handleParamChange('pan', v)} nodeId={id} paramName="pan" />
        )}

        {nodeType === 'noisecraft_source' && (
          <>
            <ParamSlider label="Gain" value={graphNode.params.gain as number} min={0} max={2} step={0.01} onChange={(v) => handleParamChange('gain', v)} nodeId={id} paramName="gain" />
            <ParamSelect
              label="Patch"
              value={String(graphNode.params.patchFile || 'nc_noise_patch.ncft')}
              options={(window as any).__ncftPatches || ['nc_noise_patch.ncft']}
              onChange={(v) => handleParamChange('patchFile', v)}
              nodeId={id} 
              paramName="patchFile"
            />
          </>
        )}

        {nodeType === 'destination' && (
          <div style={{ fontSize: '10px', color: 'rgba(78, 205, 196, 0.6)', textAlign: 'center', padding: '4px 0' }}>
            Audio Output
          </div>
        )}
      </div>

      {/* Output handle */}
      {nodeType !== 'destination' && (
        <Handle type="source" position={Position.Right} id="out" className={styles.handleOut} />
      )}
    </div>
  );
}

// ─── Reusable param components ───
function ParamSlider({ label, value, min, max, step, onChange, nodeId, paramName }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
  nodeId?: string; paramName?: string;
}) {
  const handleClick = () => {
    if (nodeId && paramName) {
      window.postMessage({ type: 'macroPatcher:paramClicked', nodeId: `${nodeId}.${paramName}` }, '*');
    }
  };
  return (
    <div className={`${styles.paramRow} nodrag`}>
      <span 
        className={styles.paramLabel} 
        onClick={handleClick} 
        style={nodeId ? {cursor: 'crosshair', color: '#4ecdc4', textDecoration: 'underline'} : {}}
        title={nodeId ? "Click to auto-fill mapping target" : undefined}
      >
        {label}
      </span>
      <input type="range" className={styles.paramSlider} min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <span className={styles.paramValue}>{typeof value === 'number' ? value.toFixed(2) : value}</span>
    </div>
  );
}

function ParamSelect({ label, value, options, onChange, nodeId, paramName }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
  nodeId?: string; paramName?: string;
}) {
  const handleClick = () => {
    if (nodeId && paramName) {
      window.postMessage({ type: 'macroPatcher:paramClicked', nodeId: `${nodeId}.${paramName}` }, '*');
    }
  };
  return (
    <div className={`${styles.paramRow} nodrag`}>
      <span 
        className={styles.paramLabel} 
        onClick={handleClick}
        style={nodeId ? {cursor: 'crosshair', color: '#4ecdc4', textDecoration: 'underline'} : {}}
        title={nodeId ? "Click to auto-fill mapping target" : undefined}
      >
        {label}
      </span>
      <select className={styles.paramSelect} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ─── Register node types ───
const nodeTypes: NodeTypes = {
  audioNode: AudioNodeComponent,
};

// ─── Context Menu entries ───
const NODE_MENU_ITEMS: { type: AudioNodeType; label: string; icon: string }[] = [
  { type: 'noisecraft_source', label: 'NoiseCraft Source', icon: '🎹' },
  { type: 'oscillator', label: 'Oscillator', icon: '〰️' },
  { type: 'gain', label: 'Gain', icon: '🔊' },
  { type: 'biquad_filter', label: 'Filter (Biquad)', icon: '🎚️' },
  { type: 'delay', label: 'Delay', icon: '⏱️' },
  { type: 'convolver_reverb', label: 'Reverb', icon: '🌊' },
  { type: 'hrtf_panner', label: 'HRTF Panner', icon: '🎧' },
  { type: 'stereo_panner', label: 'Stereo Pan', icon: '↔️' },
  { type: 'analyser', label: 'Analyser', icon: '📊' },
];

// ─── Main Component ───
export default function MacroPatcher() {
  const graphNodes = useAudioGraphStore((s) => s.nodes);
  const graphEdges = useAudioGraphStore((s) => s.edges);
  const addGraphNode = useAudioGraphStore((s) => s.addNode);
  const addGraphEdge = useAudioGraphStore((s) => s.addEdge);
  const removeGraphEdge = useAudioGraphStore((s) => s.removeEdge);
  const setGraphNodes = useAudioGraphStore((s) => s.setNodes);
  const setGraphEdges = useAudioGraphStore((s) => s.setEdges);
  const updatePosition = useAudioGraphStore((s) => s.updateNodePosition);
  const rebuild = useAudioGraphStore((s) => s.rebuildAudioGraph);
  const initCtx = useAudioGraphStore((s) => s.initAudioContext);

  // React Flow state
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    graphNodes.map(toRfNode)
  );
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(
    graphEdges.map(toRfEdge)
  );

  // Selection state for duplication
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
    setSelectedNodeIds(nodes.map(n => n.id));
  }, []);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<any>(null);

  // Fetch patches for the dropdowns
  useEffect(() => {
    fetch('/noisecraft/list-patches')
      .then(res => res.json())
      .then(data => {
        if (data.patches) {
          (window as any).__ncftPatches = data.patches.map((p: any) => p.filename);
        }
      })
      .catch(console.error);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        const state = useAudioGraphStore.getState();
        if (e.shiftKey) {
          if (state.redo) state.redo();
        } else {
          if (state.undo) state.undo();
        }
        setTimeout(() => rebuild(), 50);
        return;
      }
      
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        const state = useAudioGraphStore.getState();
        selectedNodeIds.forEach(id => {
          const node = state.nodes.find(n => n.id === id);
          if (node && node.type !== 'destination') { // Don't duplicate destination
            const newId = `${node.type}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            state.addNode({
              ...node,
              id: newId,
              label: `${node.label} (Copy)`,
              position: { x: node.position.x + 50, y: node.position.y + 50 },
            });
          }
        });
        setTimeout(() => rebuild(), 50);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeIds, rebuild]);

  // Sync from store → React Flow
  useEffect(() => {
    setRfNodes(graphNodes.map(toRfNode));
  }, [graphNodes, setRfNodes]);

  useEffect(() => {
    setRfEdges(graphEdges.map(toRfEdge));
  }, [graphEdges, setRfEdges]);

  // Handle connections
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const edgeId = `e-${connection.source}-${connection.target}-${Date.now()}`;
      addGraphEdge({
        id: edgeId,
        source: connection.source,
        sourceHandle: connection.sourceHandle || 'out',
        target: connection.target,
        targetHandle: connection.targetHandle || 'in',
      });
      initCtx();
      setTimeout(() => rebuild(), 50);
    },
    [addGraphEdge, rebuild, initCtx]
  );

  // Handle edge deletion
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      deleted.forEach((e) => removeGraphEdge(e.id));
      setTimeout(() => rebuild(), 50);
    },
    [removeGraphEdge, rebuild]
  );

  // Handle node position changes
  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      updatePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [updatePosition]
  );

  // Right-click context menu
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!reactFlowInstance.current) return;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;
      const flowPos = reactFlowInstance.current.screenToFlowPosition({
        x: (event as React.MouseEvent).clientX,
        y: (event as React.MouseEvent).clientY,
      });
      setContextMenu({
        x: (event as React.MouseEvent).clientX - bounds.left,
        y: (event as React.MouseEvent).clientY - bounds.top,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
    },
    []
  );

  const handleAddNode = useCallback(
    (type: AudioNodeType) => {
      if (!contextMenu) return;
      const newId = `${type}-${Date.now()}`;
      addGraphNode({
        id: newId,
        type,
        label: NODE_LABELS[type],
        params: { ...DEFAULT_PARAMS[type] },
        position: { x: contextMenu.flowX, y: contextMenu.flowY },
      });
      setContextMenu(null);
    },
    [contextMenu, addGraphNode]
  );

  // Close context menu on click elsewhere
  const onPaneClick = useCallback(() => setContextMenu(null), []);

  return (
    <div className={styles.macroPatcher} ref={reactFlowWrapper}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onSelectionDragStop={onNodeDragStop as any}
        onSelectionChange={onSelectionChange}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onInit={(instance: any) => { reactFlowInstance.current = instance; }}
        nodeTypes={nodeTypes}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        selectionKeyCode="Shift"
        multiSelectionKeyCode="Shift"
        selectionMode={"partial" as any}
        style={{ background: '#0a0a14' }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: 'rgba(78, 205, 196, 0.5)', strokeWidth: 2 },
          animated: true,
        }}
      >
        <Controls style={{ bottom: 10, left: 10 }} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(255,255,255,0.05)" />
      </ReactFlow>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <button
          className={styles.toolbarBtn}
          onClick={() => { initCtx(); rebuild(); }}
          title="Rebuild the audio graph (connect all nodes)"
        >
          ▶ Build Graph
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <h4>Add Node</h4>
          {NODE_MENU_ITEMS.map((item) => (
            <div
              key={item.type}
              className={styles.contextMenuItem}
              onClick={() => handleAddNode(item.type)}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </div>
      )}

      {/* Headless NoiseCraft instances for each source node */}
      <div style={{ display: 'none' }}>
        {graphNodes.filter(n => n.type === 'noisecraft_source').map(node => (
          <HeadlessNoiseCraft
            key={node.id}
            nodeId={node.id}
            patchFile={String(node.params.patchFile || 'nc_noise_patch.ncft')}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Headless NoiseCraft Component ───
function HeadlessNoiseCraft({ nodeId, patchFile }: { nodeId: string; patchFile: string }) {
  const registerStream = useAudioGraphStore((s) => s.registerNoisecraftStream);
  
  useEffect(() => {
    const iframe = document.createElement('iframe');
    iframe.src = `/noisecraft/public/embedded.html?src=/noisecraft/public/examples/${patchFile}&ui=minimal`;
    iframe.allow = 'autoplay; microphone';
    iframe.style.display = 'none';
    
    // Listen for stream ready
    const handleMessage = (e: MessageEvent) => {
      if (e.source === iframe.contentWindow) {
        if (e.data?.type === 'noiseCraft:audioStreamReady') {
          // The embedded.html should expose window.noiseCraftMediaStream
          const stream = (iframe.contentWindow as any)?.noiseCraftMediaStream;
          if (stream) {
            registerStream(nodeId, stream);
          }
          if (iframe.contentWindow) {
            useAudioGraphStore.getState().registerNoisecraftWindow(nodeId, iframe.contentWindow);
          }
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    document.body.appendChild(iframe);
    
    // Once iframe loads, wait a bit and tell it to play
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.postMessage({ type: 'noiseCraft:play' }, '*');
      }, 500);
    };
    
    return () => {
      window.removeEventListener('message', handleMessage);
      document.body.removeChild(iframe);
      // We don't unregister stream here immediately to avoid graph glitches, it will be cleaned up by the store when node is removed
    };
  }, [nodeId, patchFile, registerStream]);
  
  return null;
}

// ─── Helpers ───
function toRfNode(gNode: AudioGraphNode): Node {
  return {
    id: gNode.id,
    type: 'audioNode',
    position: gNode.position,
    data: { graphNode: gNode },
  };
}

function toRfEdge(gEdge: { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }): Edge {
  return {
    id: gEdge.id,
    source: gEdge.source,
    sourceHandle: gEdge.sourceHandle,
    target: gEdge.target,
    targetHandle: gEdge.targetHandle,
    type: 'smoothstep',
    animated: true,
    style: { stroke: 'rgba(78, 205, 196, 0.5)', strokeWidth: 2 },
  };
}
