/**
 * SRS grading and mastery rules for the A1 engine. Thin wrapper over
 * sm2.ts: the A1 spec fixes grading to three outcomes (no self-report,
 * unlike the legacy again/good/easy buttons) and needs two independent
 * card types per item (listen + recall) both mastered for a word to count
 * as mastered.
 */

import { isMastered, schedule, type Sm2State, type ScheduleResult } from './sm2';
import type { AnswerQuality } from './types';

export type CardType = 'listen' | 'recall' | 'drill';

/** Answers slower than this still count correct, but only earn quality 3. */
export const SLOW_ANSWER_MS = 8000;

/** Wrong = 2, correct = 4, correct but slow (> SLOW_ANSWER_MS) = 3. */
export function gradeAnswer(correct: boolean, ms: number): AnswerQuality {
  if (!correct) return 2;
  return ms > SLOW_ANSWER_MS ? 3 : 4;
}

export { schedule, isMastered };
export type { Sm2State, ScheduleResult };

type MasteryLike = Pick<Sm2State, 'repetitions' | 'intervalDays'>;

/** A word/phrase is mastered only once both its listen and recall cards are. */
export function isItemMastered(
  listenState: MasteryLike | undefined,
  recallState: MasteryLike | undefined,
): boolean {
  return !!listenState && !!recallState && isMastered(listenState) && isMastered(recallState);
}
