/**
 * SM-2 spaced-repetition scheduler (Piotr Woźniak's algorithm).
 *
 * Pure and deterministic — no I/O, no ML infra. Chosen over adaptive ML
 * because it is zero-cost, explainable, and predictable for a parent
 * managing a single child's learning.
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

import type { AnswerQuality, CardState } from './types';

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

/** An item counts as "mastered" once it survives this interval... */
export const MASTERY_INTERVAL_DAYS = 21;
/** ...and this many consecutive successful repetitions. */
export const MASTERY_MIN_REPETITIONS = 3;

export interface Sm2State {
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface ScheduleResult {
  state: Sm2State;
  dueDate: Date;
}

/**
 * Maps what the child did on a card to an SM-2 quality grade.
 * The child UI only has three big buttons:
 *   'again'  -> wrong answer (quality 2)
 *   'good'   -> correct answer (quality 4)
 *   'easy'   -> correct answer given instantly (quality 5)
 */
export function qualityFromAnswer(answer: 'again' | 'good' | 'easy'): AnswerQuality {
  switch (answer) {
    case 'again':
      return 2;
    case 'good':
      return 4;
    case 'easy':
      return 5;
  }
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, Math.min(ease, 5));
}

/** Standard SM-2 ease-factor update, applied for every grade. */
export function nextEase(ease: number, quality: AnswerQuality): number {
  const q = quality;
  return clampEase(ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
}

/**
 * Compute the next scheduling state for a card.
 *
 * - quality >= 3 (correct): grow the interval (1d -> 6d -> interval*ease).
 * - quality < 3 (failed):   reset repetitions, requeue immediately
 *                           (interval 0 => due now, so it reappears in the
 *                           same review session).
 *
 * `now` is injectable for testability.
 */
export function schedule(
  prev: Sm2State,
  quality: AnswerQuality,
  now: Date = new Date(),
): ScheduleResult {
  const ease = nextEase(prev.ease, quality);
  let intervalDays: number;
  let repetitions: number;
  let lapses = prev.lapses;

  if (quality >= 3) {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) {
      intervalDays = 1;
    } else if (repetitions === 2) {
      intervalDays = 6;
    } else {
      // Round to whole days; keep at least the previous interval + 1.
      intervalDays = Math.max(1, Math.round(prev.intervalDays * ease));
    }
  } else {
    repetitions = 0;
    intervalDays = 0;
    lapses = prev.lapses + 1;
  }

  const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return { state: { ease, intervalDays, repetitions, lapses }, dueDate };
}

export function newState(vocabularyId: number): CardState {
  return {
    vocabularyId,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    repetitions: 0,
    lapses: 0,
    dueDate: new Date(0).toISOString(),
    lastReviewedAt: null,
  };
}

export function isMastered(state: Pick<CardState, 'repetitions' | 'intervalDays'>): boolean {
  return (
    state.repetitions >= MASTERY_MIN_REPETITIONS &&
    state.intervalDays >= MASTERY_INTERVAL_DAYS
  );
}

export function isDue(state: Pick<CardState, 'dueDate'>, now: Date = new Date()): boolean {
  return new Date(state.dueDate).getTime() <= now.getTime();
}
