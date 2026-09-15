/**
 * Daily review/goal math: the capped due queue, new-item pacing (backlog
 * pauses new items), and whether today's goal was met. Streak reuses
 * progress.ts' computeStreak over the calendar days the goal was met.
 */

export { computeStreak as goalStreak } from './progress';

export interface DueCard {
  dueDate: string; // ISO
}

/** Due cards, most overdue first, capped at `cap` (default 60). */
export function buildReviewQueue<T extends DueCard>(cards: T[], now: Date = new Date(), cap = 60): T[] {
  const nowMs = now.getTime();
  return cards
    .filter((c) => new Date(c.dueDate).getTime() <= nowMs)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, cap);
}

export interface NewItemsAllowedInput {
  /** Size of today's (uncapped) due queue. */
  dueCount: number;
  cap: number;
  introducedToday: number;
  dailyN: number;
}

/** New items may be introduced only while the backlog is within cap, and
 *  only up to today's daily target. Backlog over cap pauses new items entirely. */
export function newItemsAllowed(input: NewItemsAllowedInput): number {
  if (input.dueCount > input.cap) return 0;
  return Math.max(0, input.dailyN - input.introducedToday);
}

export interface GoalMetInput {
  dueRemaining: number;
  reviewedToday: number;
  cap: number;
  introducedToday: number;
  dailyN: number;
  /** How many new items exist to introduce today, ignoring pacing (0 = none left in the unit). */
  newAvailable: number;
}

/** Met when today's reviews are cleared (or capped) AND today's new-item
 *  target is hit or no more new items could be introduced anyway. */
export function isGoalMet(input: GoalMetInput): boolean {
  const reviewsDone = input.dueRemaining === 0 || input.reviewedToday >= input.cap;
  const noNewLeft =
    input.newAvailable <= 0 ||
    newItemsAllowed({
      dueCount: input.dueRemaining,
      cap: input.cap,
      introducedToday: input.introducedToday,
      dailyN: input.dailyN,
    }) <= 0;
  const newDone = input.introducedToday >= input.dailyN || noNewLeft;
  return reviewsDone && newDone;
}
