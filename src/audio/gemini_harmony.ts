/**
 * gemini_harmony.ts
 *
 * Context-aware harmonic progression generation using the Gemini API.
 * Receives the currently-playing chord context plus a target mood keyword
 * and returns a smooth transitional ChordData[] array.
 *
 * Voice-leading constraints are baked into the prompt so the output never
 * jumps abruptly to an unrelated key.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { ChordData } from './chord_library';

// ─── pitch / quality lookup tables ──────────────────────────────────────────

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
  Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

const PITCH_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Semitone intervals from chord root for common chord qualities. */
const QUALITY_TO_NOTES: Record<string, number[]> = {
  '':      [0, 4, 7],
  'm':     [0, 3, 7],
  'maj7':  [0, 4, 7, 11],
  'm7':    [0, 3, 7, 10],
  '7':     [0, 4, 7, 10],
  'dim':   [0, 3, 6],
  'dim7':  [0, 3, 6, 9],
  'aug':   [0, 4, 8],
  'sus2':  [0, 2, 7],
  'sus4':  [0, 5, 7],
  'add9':  [0, 4, 7, 14],
  '9':     [0, 4, 7, 10, 14],
  'm9':    [0, 3, 7, 10, 14],
  'maj9':  [0, 4, 7, 11, 14],
  '6':     [0, 4, 7, 9],
  'm6':    [0, 3, 7, 9],
};

/** Diatonic intervals for each mode. */
const MODE_SCALES: Record<string, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  dorian:      [0, 2, 3, 5, 7, 9, 10],
  phrygian:    [0, 1, 3, 5, 7, 8, 10],
  lydian:      [0, 2, 4, 6, 7, 9, 11],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10],
  locrian:     [0, 1, 3, 5, 6, 8, 10],
};

/** True if the mode is "dark" (minor-leaning). */
const DARK_MODES = new Set(['minor', 'phrygian', 'locrian', 'dorian']);

// ─── chord name parser ───────────────────────────────────────────────────────

/**
 * Parse a chord name such as "Am7", "Bbmaj7", "F#dim" into
 * { rootSemitone, notes[] }.
 */
function parseChordName(name: string): { root: number; notes: number[] } {
  // Root: 1–2 characters (letter + optional b/#)
  const match = name.trim().match(/^([A-G][b#]?)(.*)/);
  if (!match) return { root: 0, notes: [0, 4, 7] };

  const root = NOTE_TO_SEMITONE[match[1]] ?? 0;
  const quality = match[2].trim();
  const notes = QUALITY_TO_NOTES[quality] ?? QUALITY_TO_NOTES[''];
  return { root, notes };
}

// ─── ChordData → human-readable string ──────────────────────────────────────

/**
 * Convert a ChordData array into a deduplicated chord-name string for the
 * Gemini context prompt (e.g. "Cmaj7 → Am7 → Fmaj7 → G7").
 */
export function chordsToReadable(chords: ChordData[]): string {
  const seen: string[] = [];
  let last = '';
  for (const chord of chords) {
    const rootAbs = ((chord.key ?? 0) + (chord.root ?? 0) + 120) % 12;
    const rootName = PITCH_NAMES[rootAbs];
    const t3 = (chord.notes[1] ?? 4) - (chord.notes[0] ?? 0);
    let quality = '';
    if (t3 === 3) quality = 'm';
    if (chord.notes.length >= 4) {
      const t7 = (chord.notes[3] ?? 11) - (chord.notes[0] ?? 0);
      if (t3 === 3 && t7 === 10) quality = 'm7';
      else if (t3 === 4 && t7 === 10) quality = '7';
      else if (t3 === 4 && t7 === 11) quality = 'maj7';
    }
    const label = `${rootName}${quality}`;
    if (label !== last) { seen.push(label); last = label; }
  }
  return seen.join(' → ') || 'C';
}

// ─── Gemini response schema ──────────────────────────────────────────────────

interface GeminiHarmonyResponse {
  chords: Array<{ name: string; mode: string }>;
  key_name: string;
  mode: string;
}

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    chords: {
      type: SchemaType.ARRAY,
      description: 'List of chords in the progression (4 chords)',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: {
            type: SchemaType.STRING,
            description: 'Chord name, e.g. Am7, Cmaj7, G7, Bbm, Fdim',
          },
          mode: {
            type: SchemaType.STRING,
            description: 'Scale mode for this chord: major, minor, dorian, phrygian, lydian, mixolydian, locrian',
          },
        },
        required: ['name', 'mode'],
      },
    },
    key_name: {
      type: SchemaType.STRING,
      description: 'The tonal centre of the progression (e.g. C, G, Bb)',
    },
    mode: {
      type: SchemaType.STRING,
      description: 'Overall mode of the progression: major, minor, dorian, phrygian, lydian, mixolydian, locrian',
    },
  },
  required: ['chords', 'key_name', 'mode'],
};

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Call Gemini to generate a contextually smooth chord progression that
 * transitions from `contextChordNames` toward `targetKeyword`.
 *
 * Returns null on any error so the caller can fall back to the deterministic
 * algorithm without interruption.
 */
export async function fetchGeminiHarmony(
  apiKey: string,
  /** Human-readable current progression, e.g. "Cmaj7 → Am7 → Fmaj7 → G7" */
  contextChordNames: string,
  /** Closest mood keyword, e.g. "melancholic" */
  targetKeyword: string,
  targetValence: number,
  targetArousal: number,
  /** Total number of steps (seqLength) the result must fill */
  seqLength: number,
  /** How many distinct chords to generate (default 4) */
  numChords = 4,
): Promise<ChordData[] | null> {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA as any,
        temperature: 0.7,
      },
    });

    const prompt = `You are a professional music composer and theorist.
Your task: generate a ${numChords}-chord harmonic progression.

═══ CURRENT CONTEXT (what is playing right now) ═══
${contextChordNames}

═══ TARGET MOOD ═══
Keyword  : "${targetKeyword}"
Valence  : ${targetValence.toFixed(2)}  (0 = very negative/dissonant → 1 = very positive/bright)
Arousal  : ${targetArousal.toFixed(2)}  (0 = very calm/sleepy → 1 = very energetic/tense)

═══ STRICT RULES ═══
1. The first chord MUST feel like a natural continuation of the current context —
   use a common tone or a smooth voice-leading step (≤2 semitones preferred).
2. Subsequent chords should gradually shift toward the target mood.
3. Root motion: prefer steps (M2/m2) or thirds; avoid tritone jumps.
4. High valence (>0.6) → lean toward major/lydian/mixolydian chords.
   Low valence (<0.4)  → lean toward minor/phrygian/dorian/locrian chords.
5. High arousal (>0.6) → add tension: 7ths, 9ths, chromatic approach chords.
   Low arousal  (<0.4) → keep it consonant: simple triads or calm extensions.
6. Use exactly ${numChords} chords. No repetition of the same chord back-to-back.
7. Do NOT output any text outside the JSON object.`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    const parsed: GeminiHarmonyResponse = JSON.parse(raw);

    if (!parsed.chords?.length) return null;

    // ── map response → ChordData[] ──────────────────────────────────────────
    const keyRoot = NOTE_TO_SEMITONE[parsed.key_name] ?? 0;
    const globalMode = parsed.mode in MODE_SCALES ? parsed.mode : 'major';
    const globalScale = MODE_SCALES[globalMode];
    const isDark = DARK_MODES.has(globalMode);

    const stepsPerChord = Math.max(1, Math.floor(seqLength / parsed.chords.length));
    const result2: ChordData[] = [];

    for (let step = 0; step < seqLength; step++) {
      const ci = Math.min(Math.floor(step / stepsPerChord), parsed.chords.length - 1);
      const c = parsed.chords[ci];
      const { root: rootAbs, notes } = parseChordName(c.name);
      const localMode = c.mode in MODE_SCALES ? c.mode : globalMode;
      const localScale = MODE_SCALES[localMode];

      result2.push({
        root: (rootAbs - keyRoot + 12) % 12,   // root relative to key
        notes,                                   // intervals from chord root
        key: keyRoot,
        mode: DARK_MODES.has(localMode) ? 'minor' : 'major',
        scaleIntervals: localScale ?? globalScale,
        degree: 0,
      });
    }

    return result2;
  } catch (err) {
    console.error('[GeminiHarmony] API error:', err);
    return null;
  }
}
