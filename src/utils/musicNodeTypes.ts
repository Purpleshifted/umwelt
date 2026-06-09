export type CableType = 'sequence' | 'audio' | 'control' | 'theory' | 'event' | 'any';

export function getHandleDataType(nodeType: string, handleId: string, isSource: boolean): CableType {
  // --- SOUND NODES (Outputs Audio) ---
  if (['oscillator', 'noise'].includes(nodeType)) {
    if (isSource) return 'audio';
    if (!isSource && (handleId === 'frequency' || handleId === 'volume')) return 'control';
  }

  // --- INSTRUMENT NODES (Outputs Audio, Takes Event) ---
  if (['polysynth', 'virtual_instrument'].includes(nodeType)) {
    if (isSource) return 'audio';
    if (!isSource) {
      if (handleId === 'trigger' || handleId === 'sequence') return 'event';
      if (handleId === 'volume' || handleId === 'gain_sine' || handleId === 'gain_saw' || handleId === 'gain_square' || handleId === 'gain_tri') return 'control';
    }
  }

  // --- AUDIO PROCESSORS (Takes Audio, Outputs Audio) ---
  if (['filter', 'reverb', 'mix_node', 'adsr_envelope'].includes(nodeType)) {
    if (isSource) return 'audio';
    if (!isSource) {
      if (handleId === 'frequency' || handleId === 'q' || handleId === 'volA' || handleId === 'volB' || handleId === 'decay' || handleId === 'wet' || handleId === 'rate') return 'control';
      if (handleId.includes('instrument') || handleId === 'audio_in' || handleId === 'sourceAId' || handleId === 'sourceBId') return 'audio'; 
    }
  }

  // --- EVENT & TRIGGER NODES ---
  if (nodeType === 'trigger_node') {
    if (isSource) return 'event';
    if (!isSource && handleId === 'stream_in') return 'control';
  }

  if (['chord_progression', 'harmonic_progressor'].includes(nodeType)) {
    if (isSource) return 'theory';
  }

  if (['melody_gen', 'chord_gen', 'sequence_adder', 'sequence_morpher', 'register_shifter', 'voice_splitter'].includes(nodeType)) {
    if (isSource) return 'event';
    if (!isSource) {
      if (handleId === 'chordData') return 'theory';
      if (handleId === 'rhythm' || handleId === 'voicing') return 'control';
      if (handleId === 'seqA' || handleId === 'seqB' || handleId.startsWith('in_') || handleId === 'sequence') return 'event';
    }
  }

  // --- PLAYER NODE ---
  if (nodeType === 'player_node' || nodeType === 'player_out') {
    if (isSource) return 'audio';
    if (!isSource) {
      if (handleId === 'sequence') return 'event';
      if (handleId === 'instrument') return 'audio';
    }
  }

  // --- OUT & BROADCAST NODES ---
  if (nodeType === 'out_node') {
    if (!isSource) {
      if (handleId === 'audio_in') return 'audio';
      if (handleId === 'trigger_in') return 'event';
    }
  }
  if (nodeType === 'broadcast_node' || nodeType === 'score_out' || nodeType === 'track_out') {
    if (!isSource) return 'audio';
  }

  // --- CONTROL / UTILS ---
  if (['slider', 'knob', 'virtual_stream', 'lfo'].includes(nodeType)) {
    if (isSource) return 'control';
    if (!isSource && handleId === 'rate') return 'control';
  }
  
  if (nodeType === 'seq_to_freq') {
    if (isSource) return 'control';
    if (!isSource) return 'event';
  }

  // --- PREVIEWS & GROUPS & UTILS ---
  if (['preview_util', 'universal_preview', 'null_node', 'section_box', 'global_ui_out'].includes(nodeType)) {
    return 'any';
  }

  return 'any'; // fallback
}

export function getCableColor(type: CableType): string {
  switch (type) {
    case 'audio': return '#10b981';    // Emerald/Green
    case 'control': return '#3b82f6';  // Blue
    case 'sequence':
    case 'event': return '#ec4899';    // Pink
    case 'theory': return '#fbbf24';   // Amber/Yellow
    default: return '#9ca3af';         // Gray
  }
}
