import {
  LEAGUES,
  leagueForXp,
  leagueProgress,
  unlockedRewards,
  nextReward,
  xpForAnswer,
  XP_FIRST_TRY,
  XP_RETRY,
  REWARDS,
} from '../src/core/gamification';

describe('leagues', () => {
  it('starts everyone in the first league', () => {
    expect(leagueForXp(0).key).toBe(LEAGUES[0].key);
    expect(leagueForXp(50).key).toBe(LEAGUES[0].key);
  });

  it('promotes at each threshold', () => {
    expect(leagueForXp(119).key).toBe('sprout');
    expect(leagueForXp(120).key).toBe('explorer');
    expect(leagueForXp(300).key).toBe('star');
    expect(leagueForXp(1200).key).toBe('legend');
  });

  it('caps at the top league', () => {
    expect(leagueForXp(99999).key).toBe('legend');
  });
});

describe('leagueProgress', () => {
  it('reports zero progress at the start of a league', () => {
    const p = leagueProgress(120);
    expect(p.next?.key).toBe('star');
    expect(p.pct).toBe(0);
  });

  it('reports full progress at the top league', () => {
    const p = leagueProgress(99999);
    expect(p.pct).toBe(1);
    expect(p.next).toBeNull();
  });

  it('counts the exact gap to the next league', () => {
    const p = leagueProgress(250);
    expect(p.nextGap).toBe(50);
    expect(p.pct).toBeGreaterThan(0);
    expect(p.pct).toBeLessThan(1);
  });
});

describe('rewards', () => {
  it('unlocks as XP grows and never re-locks', () => {
    expect(unlockedRewards(0)).toHaveLength(0);
    expect(unlockedRewards(100)).toHaveLength(1);
    expect(unlockedRewards(99999)).toHaveLength(REWARDS.length);
    expect(nextReward(20)?.key).toBe('spark');
    expect(nextReward(99999)).toBeNull();
  });
});

describe('xpForAnswer', () => {
  it('gives the standard first-try reward', () => {
    expect(xpForAnswer(true, 0)).toBe(XP_FIRST_TRY);
  });

  it('gives less for retries on the same card', () => {
    expect(xpForAnswer(false, 5)).toBe(XP_RETRY);
  });

  it('adds a streak bonus after a real habit forms', () => {
    expect(xpForAnswer(true, 3)).toBeGreaterThan(XP_FIRST_TRY);
  });
});