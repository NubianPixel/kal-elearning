/**
 * Daily-goal progress math — pure and testable.
 * The daily goal is the number of new words introduced per review day.
 */

export const DAILY_GOAL_OPTIONS = [3, 5, 10] as const;

/** Clamp (done/goal) to a 0-100 percentage. A non-positive goal means no cap. */
export function dailyProgressPct(done: number, goal: number): number {
  if (goal <= 0) return done > 0 ? 100 : 0;
  return Math.min(100, Math.round((done / goal) * 100));
}

/** True once the child has hit today's target. */
export function isDailyGoalMet(done: number, goal: number): boolean {
  if (goal <= 0) return done > 0;
  return done >= goal;
}
