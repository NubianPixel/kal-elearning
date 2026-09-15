/**
 * Domain types shared by the SM-2 scheduler (core/sm2.ts) and its grading.
 */

/** SM-2 scheduling state for one vocabulary item, per device/profile. */
export interface CardState {
  vocabularyId: number;
  /** Ease factor; SM-2 default is 2.5, clamped to >= 1.3. */
  ease: number;
  /** Current inter-review interval in days (0 = new / due immediately). */
  intervalDays: number;
  /** Consecutive successful repetitions. */
  repetitions: number;
  /** Times the card was failed and reset. */
  lapses: number;
  /** ISO timestamp of the next due review. */
  dueDate: string;
  lastReviewedAt: string | null;
}

/** SM-2 answer quality (0-5). The child UI maps taps to these. */
export type AnswerQuality = 0 | 1 | 2 | 3 | 4 | 5;
