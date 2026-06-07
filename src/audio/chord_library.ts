export interface ChordData {
  root: number;
  notes: number[];
  key: number;
  mode: string;
  scaleIntervals: number[]; // Full 7-note scale intervals (e.g. [0, 2, 4, 5, 7, 9, 11] for Ionian)
  degree: number; // 0-6
}

export interface MoodProgressionState {
  currentDegree: number;
}

const MODES = [
  { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], base: 'minor' },
  { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], base: 'minor' },
  { name: 'Aeolian', intervals: [0, 2, 3, 5, 7, 8, 10], base: 'minor' },
  { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], base: 'minor' },
  { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], base: 'major' },
  { name: 'Ionian', intervals: [0, 2, 4, 5, 7, 9, 11], base: 'major' },
  { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], base: 'major' }
];

function getMode(valence: number) {
  if (valence < 0.15) return MODES[0]; // Locrian
  if (valence < 0.35) return MODES[1]; // Phrygian
  if (valence < 0.50) return MODES[2]; // Aeolian
  if (valence < 0.65) return MODES[3]; // Dorian
  if (valence < 0.80) return MODES[4]; // Mixolydian
  if (valence < 0.90) return MODES[5]; // Ionian
  return MODES[6]; // Lydian
}

function getChordComplexity(arousal: number): number {
  if (arousal < 0.3) return 3; // Triads
  if (arousal < 0.6) return 4; // 7ths
  if (arousal < 0.8) return 5; // 9ths
  return 6; // 11ths
}

function getChordsPerBar(arousal: number): number {
  if (arousal < 0.3) return 1; // 1 chord per bar
  if (arousal < 0.7) return 2; // 2 chords per bar
  return 4; // 4 chords per bar
}

const MAJOR_MARKOV = [
  [3, 4, 5, 1], // 0 (I) -> IV, V, vi, ii
  [4, 6, 0],    // 1 (ii) -> V, vii, I
  [5, 3, 0],    // 2 (iii) -> vi, IV, I
  [0, 4, 1],    // 3 (IV) -> I, V, ii
  [0, 5, 2],    // 4 (V) -> I, vi, iii
  [1, 3, 0],    // 5 (vi) -> ii, IV, I
  [0, 2]        // 6 (vii) -> I, iii
];

const MINOR_MARKOV = [
  [3, 4, 5, 2], // 0 (i) -> iv, v, VI, III
  [4, 6, 0],    // 1 (ii) -> v, VII, i
  [5, 3, 0],    // 2 (III) -> VI, iv, i
  [0, 4, 6],    // 3 (iv) -> i, v, VII
  [0, 5, 2],    // 4 (v) -> i, VI, III
  [1, 3, 6],    // 5 (VI) -> ii, iv, VII
  [2, 0, 4]     // 6 (VII) -> III, i, v
];

function getNextDegree(currentDegree: number, isMajor: boolean, arousal: number): number {
  const matrix = isMajor ? MAJOR_MARKOV : MINOR_MARKOV;
  const transitions = matrix[currentDegree];
  
  // Chaos factor: high arousal increases chance to jump to a random degree outside the typical Markov chain
  if (arousal > 0.8 && Math.random() < 0.3) {
    return Math.floor(Math.random() * 7);
  }
  
  const nextIdx = Math.floor(Math.random() * transitions.length);
  return transitions[nextIdx];
}

function buildDiatonicChord(rootDegree: number, intervals: number[], complexity: number): number[] {
  const chord: number[] = [];
  for (let i = 0; i < complexity; i++) {
    // 0=root, 1=3rd, 2=5th, 3=7th, 4=9th, 5=11th
    const degreeIndex = (rootDegree + (i * 2)) % 7;
    const octaveShift = Math.floor((rootDegree + (i * 2)) / 7) * 12;
    chord.push(intervals[degreeIndex] + octaveShift);
  }
  return chord;
}

export function getMoodProgression(
  valence: number, 
  arousal: number,
  seqLength: number, 
  state?: MoodProgressionState
): { chords: ChordData[], newState: MoodProgressionState, categoryName: string } {
  
  const v = Math.max(0.0, Math.min(1.0, valence));
  const a = Math.max(0.0, Math.min(1.0, arousal));

  const mode = getMode(v);
  const complexity = getChordComplexity(a);
  const chordsPerBar = getChordsPerBar(a);
  
  let currentDegree = state?.currentDegree ?? 0; // Default to tonic (0)
  
  const generatedChords: ChordData[] = [];
  const stepsPerChord = Math.floor(seqLength / chordsPerBar);
  
  let currentDegreeForCycle = currentDegree;
  const progressionDegrees: number[] = [];
  
  // Generate the progression for this bar
  for (let c = 0; c < chordsPerBar; c++) {
    // Determine next degree
    if (c === 0 && !state) {
      // First time ever, keep it Tonic
    } else {
      currentDegreeForCycle = getNextDegree(currentDegreeForCycle, mode.base === 'major', a);
    }
    progressionDegrees.push(currentDegreeForCycle);
  }

  // Map to steps
  for (let i = 0; i < seqLength; i++) {
    const chordIndex = Math.min(Math.floor(i / stepsPerChord), chordsPerBar - 1);
    const degree = progressionDegrees[chordIndex];
    
    // Build diatonic chord relative to C (0)
    const rawChordNotes = buildDiatonicChord(degree, mode.intervals, complexity);
    
    // In Locrian/Phrygian, pitch it down an octave if it gets too high, or just normalize
    const normalizedNotes = rawChordNotes.map(n => n - mode.intervals[degree]);
    const rootRelative = mode.intervals[degree];
    const absoluteNotes = normalizedNotes.map(n => n + rootRelative);

    generatedChords.push({
      root: 0,
      notes: absoluteNotes,
      key: 0,
      mode: mode.base,
      scaleIntervals: mode.intervals,
      degree: degree
    });
  }

  const newState: MoodProgressionState = {
    currentDegree: currentDegreeForCycle
  };

  const complexityName = complexity === 3 ? 'Triads' : complexity === 4 ? '7ths' : complexity === 5 ? '9ths' : '11ths';
  const categoryName = `${mode.name} ${complexityName}`;

  return { chords: generatedChords, newState, categoryName };
}
