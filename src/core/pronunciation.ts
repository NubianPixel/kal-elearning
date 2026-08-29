/**
 * Pronunciation matching — pure string logic for the Learn tab's
 * "say the word" game. Compares what the speech recognizer heard against
 * the target word, tolerating punctuation, case, diacritics and small
 * typos (young voices are imprecise).
 */

const DEFAULT_THRESHOLD = 0.7;

/** Per-word difficulty nudges the match threshold: harder words demand a closer match. */
export function thresholdForDifficulty(difficulty: 1 | 2 | 3): number {
  return difficulty === 1 ? 0.6 : difficulty === 3 ? 0.8 : DEFAULT_THRESHOLD;
}

/** Lowercase, strip diacritics/punctuation, collapse whitespace. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Classic edit distance (iterative, two rows). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity between two free-form strings. */
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const distance = levenshtein(na, nb);
  return 1 - distance / Math.max(na.length, nb.length);
}

export interface PronunciationVerdict {
  correct: boolean;
  similarity: number;
}

/**
 * Judge a spoken attempt against the target word. Correct when:
 * - the recognizer heard the word (possibly among other speech), or
 * - the transcript is close enough to the target (edit similarity).
 */
export function judgePronunciation(
  transcript: string,
  target: string,
  threshold: number = DEFAULT_THRESHOLD,
): PronunciationVerdict {
  const said = normalizeForMatch(transcript);
  const want = normalizeForMatch(target);
  if (!said || !want) return { correct: false, similarity: 0 };
  const words = said.split(' ');
  if (words.includes(want) || (want.length >= 3 && said.includes(want))) {
    return { correct: true, similarity: 1 };
  }
  const score = similarity(said, want);
  return { correct: score >= threshold, similarity: score };
}
