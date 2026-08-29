/**
 * Gamification — XP, leagues and rewards. Pure, testable math.
 *
 * Motivation design (not shallow points-for-points):
 * - XP is the immediate progress feedback for every good answer.
 * - Leagues give a gentle, achievable sense of climbing.
 * - Rewards unlock at XP milestones (a dopamine loop) and sit alongside
 *   the mastery medals already tracked from the review schedule.
 *
 * Everything is stored locally on-device; nothing is sent anywhere.
 */

/**
 * Position on an ascending-threshold ladder (leagues, milestones, reward
 * tiers all share this shape): the tier already reached, and the next
 * one still ahead (null once at the top). `tiers` must be sorted
 * ascending by `key`.
 */
export function ladderPosition<T>(
  tiers: readonly T[],
  value: number,
  key: (t: T) => number,
): { current: T; next: T | null } {
  let current = tiers[0];
  let next: T | null = null;
  for (const t of tiers) {
    if (value >= key(t)) current = t;
    else {
      next = t;
      break;
    }
  }
  return { current, next };
}

export const XP_FIRST_TRY = 10;
export const XP_RETRY = 5;
export const XP_STREAK_BONUS = 4; // extra when answering on a 3+ day streak
export const XP_WRONG = 0;

export interface League {
  key: string;
  name: string;
  minXp: number;
  /** Ionicons glyph. */
  icon: string;
  /** Expo `color`-like accent for badge accents. */
  color: string;
}

/** Ordered low -> high. `leagueForXp` walks these ascending. */
export const LEAGUES: readonly League[] = [
  { key: 'sprout', name: 'Sprout', minXp: 0, icon: 'leaf-outline', color: '#3D7A5F' },
  { key: 'explorer', name: 'Explorer', minXp: 120, icon: 'compass-outline', color: '#2E8A67' },
  { key: 'star', name: 'Star', minXp: 300, icon: 'star-outline', color: '#4D6787' },
  { key: 'hero', name: 'Hero', minXp: 650, icon: 'shield-checkmark-outline', color: '#8F5B50' },
  { key: 'legend', name: 'Legend', minXp: 1200, icon: 'flame-outline', color: '#EC5B38' },
];

/** The league the child is currently in for a given XP total. */
export function leagueForXp(xp: number): League {
  return ladderPosition(LEAGUES, xp, (l) => l.minXp).current;
}

/** Progress (0-1) toward the next league, or 1 when at the top. */
export function leagueProgress(xp: number): { pct: number; next: League | null; nextGap: number } {
  const { current, next } = ladderPosition(LEAGUES, xp, (l) => l.minXp);
  if (!next) return { pct: 1, next: null, nextGap: 0 };
  return {
    pct: Math.min(1, (xp - current.minXp) / (next.minXp - current.minXp)),
    next,
    nextGap: next.minXp - xp,
  };
}

/** Reward badges unlocked purely by XP (“Rewards” row). */
export interface RewardDef {
  key: string;
  label: string;
  /** Ionicons glyph. */
  icon: string;
  xp: number;
}

export const REWARDS: readonly RewardDef[] = [
  { key: 'spark', label: 'First sparks', icon: 'sparkles-outline', xp: 30 },
  { key: 'learner', label: 'Star learner', icon: 'star', xp: 150 },
  { key: 'ace', label: 'Answer ace', icon: 'ribbon-outline', xp: 400 },
  { key: 'champ', label: 'Word champion', icon: 'trophy', xp: 800 },
  { key: 'master', label: 'Language master', icon: 'medal', xp: 1500 },
];

/** All rewards the child has already unlocked. */
export function unlockedRewards(xp: number): RewardDef[] {
  return REWARDS.filter((r) => xp >= r.xp);
}

/** The next reward not yet reached, if any. */
export function nextReward(xp: number): RewardDef | null {
  return ladderPosition(REWARDS, xp, (r) => r.xp).next;
}

/**
 * XP awarded for answering a card. `firstTry` is true for a first-attempt
 * correct; `streakDays` (from progress) adds a small bonus for consistency.
 */
export function xpForAnswer(firstTry: boolean, streakDays: number): number {
  if (!firstTry) return XP_RETRY;
  return XP_FIRST_TRY + (streakDays >= 3 ? XP_STREAK_BONUS : 0);
}
