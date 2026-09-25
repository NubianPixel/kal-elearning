/**
 * String-matching primitives shared by the typing grader (core/typing.ts)
 * and the recall/typed-answer graders (core/questions.ts): normalize text
 * for comparison and score edit-similarity, tolerating punctuation, case,
 * diacritics and small typos.
 */

/** Lowercase, strip diacritics/punctuation, collapse whitespace. Memoized:
 *  the same short strings (answers, alternatives, typed input) are normalized
 *  over and over by the graders; content is immutable so a bounded cache is
 *  safe and turns per-submit work into a Map lookup after the first call. */
const normalizeCache = new Map<string, string>();
const NORMALIZE_CACHE_MAX = 2000;

export function normalizeForMatch(s: string): string {
  const cached = normalizeCache.get(s);
  if (cached !== undefined) return cached;
  const out = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (normalizeCache.size >= NORMALIZE_CACHE_MAX) normalizeCache.clear();
  normalizeCache.set(s, out);
  return out;
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
