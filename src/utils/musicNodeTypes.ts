export type CableType = 'sequence' | 'audio' | 'control' | 'theory' | 'any';

export function getHandleDataType(nodeType: string, handleId: string, isSource: boolean): CableType {
  // --- GENERATORS / SEQUENCERS (Outputs Sequence) ---
  if (nodeType === 'chord_progression' || nodeType === 'harmonic_progressor') {
    if (isSource) return 'theory'; // outputs chordData
  }
  if (['melody_gen', 'chord_gen', 'sequence_adder', 'sequence_morpher', 'register_shifter', 'voice_splitter'].includes(nodeType)) {
    if (isSource) return 'sequence';
    if (!isSource) {
      if (handleId === 'chordData') return 'theory';
      if (handleId === 'rhythm' || handleId === 'voicing') return 'control';
      if (handleId === 'seqA' || handleId === 'seqB' || handleId.startsWith('in_') || handleId === 'sequence') return 'sequence';
    }
  }

  // --- AUDIO SYNTHS & INSTRUMENTS (Outputs Audio) ---
  if (['polysynth', 'oscillator', 'noise', 'virtual_instrument'].includes(nodeType)) {
    if (isSource) return 'audio'; // outputs instrument trigger/audio chain
    if (!isSource && handleId === 'sequence') return 'sequence';
  }

  // --- AUDIO EFFECTS (Takes Audio, Outputs Audio) ---
  if (['filter', 'reverb', 'mix_node', 'adsr_envelope'].includes(nodeType)) {
    if (isSource) return 'audio';
    if (!isSource) {
      if (handleId === 'frequency' || handleId === 'q' || handleId === 'volA' || handleId === 'volB') return 'control';
      if (handleId.includes('instrument')) return 'audio'; // in_instrument, in_instrument_a, etc.
    }
  }

  // --- CONTROL / UTILS (Outputs Control) ---
  if (['slider', 'knob', 'virtual_stream'].includes(nodeType)) {
    if (isSource) return 'control';
  }
  if (nodeType === 'seq_to_freq') {
    if (isSource) return 'control'; // converts sequence to frequency control array
    if (!isSource) return 'sequence';
  }

  // --- OUTPUTS (Consumers) ---
  if (nodeType === 'player_out') {
    if (!isSource) {
      if (handleId === 'sequence') return 'sequence';
      if (handleId === 'instrument') return 'audio';
    }
  }
  if (nodeType === 'track_out') {
    if (!isSource) return 'audio';
  }
  if (nodeType === 'score_out' || nodeType === 'ai_seq_out' || nodeType === 'seq_out') {
    if (!isSource) return 'sequence';
  }
  if (nodeType === 'module_output') {
    if (!isSource) return 'control'; // Usually takes numbers to send over network
  }

  // --- PREVIEWS ---
  if (nodeType === 'preview_util') {
    if (!isSource) return 'any';
  }
  if (nodeType === 'universal_preview') {
    if (!isSource) {
      if (handleId === 'seq_in') return 'sequence';
      if (handleId === 'audio_in') return 'audio';
      if (handleId === 'control_in') return 'control';
    }
  }

  return 'any'; // fallback
}

export function getCableColor(type: CableType): string {
  switch (type) {
    case 'sequence': return '#818cf8'; // Indigo/Blue
    case 'audio': return '#f43f5e';    // Rose/Red
    case 'control': return '#34d399';  // Emerald/Green
    case 'theory': return '#fbbf24';   // Amber/Yellow
    default: return '#9ca3af';         // Gray
  }
}
