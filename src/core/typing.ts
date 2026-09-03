/**
 * Typing practice — pure string logic for the "type the English meaning"
 * game. Kids type what a Setswana word means and get graded fairly:
 * case/punctuation/spacing never count against them, a small typo still
 * gets credit ("close"), and the answer is marked wrong only when the
 * meaning really isn't there.
 */

import { normalizeForMatch, similarity } from './pronunciation';

export type TypedGrade = 'exact' | 'close' | 'wrong';

export interface TypedVerdict {
  grade: TypedGrade;
  /** True when the answer earns credit (exact or close). */
  correct: boolean;
  /** 0..1 edit-similarity between the normalized answer and target. */
  score: number;
}

/** Above this similarity the answer counts as exact even with a typo. */
const EXACT_THRESHOLD = 0.9;
/** Above this similarity the answer is "close" and earns partial credit. */
const CLOSE_THRESHOLD = 0.72;

/**
 * Grade a typed English answer against the expected translation.
 *
 * - Normalizes both sides (case, punctuation, spaces, diacritics).
 * - Accepts the answer embedded in a longer sentence ("it means hello").
 * - Accepts a near-perfect typo as exact, a small typo as close.
 * - Anything else is wrong.
 */
export function gradeTypedAnswer(correct: string, typed: string): TypedVerdict {
  const want = normalizeForMatch(correct);
  const got = normalizeForMatch(typed);
  if (!want || !got) return { grade: 'wrong', correct: false, score: 0 };

  if (want === got) return { grade: 'exact', correct: true, score: 1 };

  // The whole answer appears inside what they typed ("Hello there").
  if (got.includes(want)) return { grade: 'exact', correct: true, score: 1 };

  // The single-word answer appears as one whole word in the sentence.
  const wantWords = want.split(' ');
  if (wantWords.length === 1 && got.split(' ').includes(want)) {
    return { grade: 'exact', correct: true, score: 1 };
  }

  const score = similarity(got, want);
  if (score >= EXACT_THRESHOLD) return { grade: 'exact', correct: true, score };
  if (score >= CLOSE_THRESHOLD) return { grade: 'close', correct: true, score };
  return { grade: 'wrong', correct: false, score };
}