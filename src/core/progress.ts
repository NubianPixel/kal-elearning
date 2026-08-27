/**
 * Progress / milestone helpers — pure functions over review-log dates.
 */

/** Days between two UTC calendar dates. */
export function daysBetween(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (24 * 60 * 60 * 1000));
}

/**
 * Longest run of consecutive calendar days ending today or yesterday.
 * Accepts ISO timestamps; duplicates (many reviews per day) are fine.
 */
export function computeStreak(isoDates: string[], today: Date = new Date()): number {
  const uniqueDays = new Set(
    isoDates.map((iso) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );
  if (uniqueDays.size === 0) return 0;

  const hasDay = (offsetDays: number): boolean => {
    const d = new Date(today.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    return uniqueDays.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  };

  // A streak survives as long as the child reviewed today OR yesterday.
  let offset = hasDay(0) ? 0 : hasDay(1) ? 1 : -1;
  if (offset === -1) return 0;

  let streak = 0;
  while (hasDay(offset)) {
    streak += 1;
    offset += 1;
  }
  return streak;
}

export interface Milestone {
  label: string;
  emoji: string;
  target: number;
}

export const MILESTONES: Milestone[] = [
  { label: 'First steps', emoji: '🌱', target: 5 },
  { label: 'Word explorer', emoji: '🎈', target: 10 },
  { label: 'Rising star', emoji: '⭐', target: 25 },
  { label: 'Word champion', emoji: '🏆', target: 50 },
  { label: 'Setswana hero', emoji: '🦁', target: 100 },
];

/** The next milestone the child has not yet reached, if any. */
export function nextMilestone(masteredCount: number): Milestone | null {
  return MILESTONES.find((m) => masteredCount < m.target) ?? null;
}
