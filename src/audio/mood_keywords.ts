/**
 * Mood Keyword Mapping based on Russell's Affective Circumplex (1980).
 * Each entry maps a keyword to its (valence, arousal) position in [0,1]².
 *
 * References:
 *  - Russell, J.A. (1980). A circumplex model of affect. JPSP, 39(6).
 *  - Warriner et al. (2013). Norms of valence, arousal, and dominance for 13,915 English lemmas.
 *  - Bucci, S. et al. (2018). Affective circumplex positions of common emotional words.
 *
 * Coordinate convention (matching this project's sliders):
 *   valence : 0 = most negative/unpleasant → 1 = most positive/pleasant
 *   arousal : 0 = most calm/sleepy        → 1 = most excited/activated
 */

export interface MoodKeyword {
  en: string;
  ko: string;
  valence: number;
  arousal: number;
}

// ---------------------------------------------------------------------------
// Keyword table — 60 entries covering all quadrants uniformly
// ---------------------------------------------------------------------------

export const MOOD_KEYWORDS: MoodKeyword[] = [
  // ── Q1: High Valence · High Arousal ──────────────────────────────────────
  { en: 'ecstatic',    ko: '황홀한',      valence: 0.95, arousal: 0.92 },
  { en: 'euphoric',    ko: '도취된',      valence: 0.90, arousal: 0.87 },
  { en: 'triumphant',  ko: '승리감',      valence: 0.85, arousal: 0.82 },
  { en: 'excited',     ko: '흥분된',      valence: 0.80, arousal: 0.90 },
  { en: 'energetic',   ko: '에너지 넘치는', valence: 0.72, arousal: 0.93 },
  { en: 'joyful',      ko: '기쁜',        valence: 0.88, arousal: 0.72 },
  { en: 'happy',       ko: '행복한',      valence: 0.85, arousal: 0.67 },
  { en: 'playful',     ko: '장난스러운',  valence: 0.78, arousal: 0.73 },
  { en: 'cheerful',    ko: '쾌활한',      valence: 0.82, arousal: 0.65 },
  { en: 'elated',      ko: '의기양양한',  valence: 0.88, arousal: 0.80 },
  { en: 'heroic',      ko: '영웅적인',    valence: 0.76, arousal: 0.80 },
  { en: 'epic',        ko: '서사적인',    valence: 0.72, arousal: 0.83 },

  // ── Q4: High Valence · Low Arousal ───────────────────────────────────────
  { en: 'serene',      ko: '고요한',      valence: 0.82, arousal: 0.14 },
  { en: 'peaceful',    ko: '평화로운',    valence: 0.78, arousal: 0.10 },
  { en: 'calm',        ko: '차분한',      valence: 0.72, arousal: 0.18 },
  { en: 'relaxed',     ko: '편안한',      valence: 0.73, arousal: 0.22 },
  { en: 'content',     ko: '만족스러운',  valence: 0.70, arousal: 0.30 },
  { en: 'tranquil',    ko: '평온한',      valence: 0.80, arousal: 0.08 },
  { en: 'tender',      ko: '부드러운',    valence: 0.75, arousal: 0.35 },
  { en: 'soothing',    ko: '위안이 되는', valence: 0.74, arousal: 0.20 },
  { en: 'gentle',      ko: '온화한',      valence: 0.70, arousal: 0.25 },
  { en: 'dreamy',      ko: '몽환적인',    valence: 0.65, arousal: 0.28 },
  { en: 'ethereal',    ko: '천상의',      valence: 0.70, arousal: 0.32 },
  { en: 'romantic',    ko: '로맨틱한',    valence: 0.74, arousal: 0.48 },

  // ── Q2: Low Valence · High Arousal ───────────────────────────────────────
  { en: 'furious',     ko: '격노한',      valence: 0.05, arousal: 0.95 },
  { en: 'angry',       ko: '화난',        valence: 0.10, arousal: 0.88 },
  { en: 'aggressive',  ko: '공격적인',    valence: 0.12, arousal: 0.92 },
  { en: 'tense',       ko: '긴장된',      valence: 0.18, arousal: 0.82 },
  { en: 'anxious',     ko: '불안한',      valence: 0.22, arousal: 0.80 },
  { en: 'scared',      ko: '두려운',      valence: 0.15, arousal: 0.85 },
  { en: 'stressed',    ko: '스트레스받은', valence: 0.20, arousal: 0.75 },
  { en: 'alarmed',     ko: '경계하는',    valence: 0.18, arousal: 0.88 },
  { en: 'intense',     ko: '강렬한',      valence: 0.32, arousal: 0.86 },
  { en: 'urgent',      ko: '긴박한',      valence: 0.25, arousal: 0.90 },
  { en: 'dramatic',    ko: '드라마틱한',  valence: 0.30, arousal: 0.78 },
  { en: 'desperate',   ko: '절박한',      valence: 0.12, arousal: 0.78 },

  // ── Q3: Low Valence · Low Arousal ────────────────────────────────────────
  { en: 'depressed',   ko: '우울한',      valence: 0.08, arousal: 0.12 },
  { en: 'sad',         ko: '슬픈',        valence: 0.15, arousal: 0.20 },
  { en: 'melancholic', ko: '우수에 젖은', valence: 0.22, arousal: 0.25 },
  { en: 'gloomy',      ko: '침울한',      valence: 0.12, arousal: 0.18 },
  { en: 'bored',       ko: '지루한',      valence: 0.35, arousal: 0.08 },
  { en: 'tired',       ko: '피곤한',      valence: 0.30, arousal: 0.10 },
  { en: 'somber',      ko: '어두운',      valence: 0.22, arousal: 0.20 },
  { en: 'hopeless',    ko: '희망 없는',   valence: 0.08, arousal: 0.14 },
  { en: 'lonely',      ko: '외로운',      valence: 0.18, arousal: 0.22 },
  { en: 'pensive',     ko: '상념에 잠긴', valence: 0.38, arousal: 0.28 },
  { en: 'grieving',    ko: '비통한',      valence: 0.08, arousal: 0.32 },

  // ── Cross-quadrant / centre ───────────────────────────────────────────────
  { en: 'nostalgic',   ko: '향수 어린',   valence: 0.50, arousal: 0.32 },
  { en: 'mysterious',  ko: '신비로운',    valence: 0.45, arousal: 0.55 },
  { en: 'hopeful',     ko: '희망찬',      valence: 0.68, arousal: 0.52 },
  { en: 'determined',  ko: '결연한',      valence: 0.60, arousal: 0.72 },
  { en: 'majestic',    ko: '장엄한',      valence: 0.72, arousal: 0.62 },
  { en: 'dark',        ko: '다크',        valence: 0.18, arousal: 0.45 },
  { en: 'haunting',    ko: '귀신같이 맴도는', valence: 0.32, arousal: 0.42 },
  { en: 'spiritual',   ko: '영적인',      valence: 0.68, arousal: 0.38 },
  { en: 'longing',     ko: '그리움',      valence: 0.42, arousal: 0.38 },
  { en: 'bittersweet', ko: '달콤 씁쓸한', valence: 0.48, arousal: 0.40 },
  { en: 'eerie',       ko: '기묘한',      valence: 0.25, arousal: 0.58 },
  { en: 'trance',      ko: '트랜스',      valence: 0.55, arousal: 0.65 },
  { en: 'groovy',      ko: '그루비한',    valence: 0.75, arousal: 0.70 },
  { en: 'sullen',      ko: '뚱한',        valence: 0.20, arousal: 0.38 },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Euclidean distance in the [0,1]² valence–arousal space. */
function dist(v1: number, a1: number, v2: number, a2: number): number {
  return Math.sqrt((v1 - v2) ** 2 + (a1 - a2) ** 2);
}

/**
 * Return the `count` keywords closest to the given (valence, arousal) point,
 * sorted by proximity (nearest first).
 */
export function getNearestMoods(
  valence: number,
  arousal: number,
  count = 3,
): MoodKeyword[] {
  return [...MOOD_KEYWORDS]
    .map((kw) => ({ kw, d: dist(valence, arousal, kw.valence, kw.arousal) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((item) => item.kw);
}
