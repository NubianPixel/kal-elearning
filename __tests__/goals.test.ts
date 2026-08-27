import { DAILY_GOAL_OPTIONS, dailyProgressPct, isDailyGoalMet } from '../src/core/goals';

describe('dailyProgressPct', () => {
  it('scales done over goal to 0-100', () => {
    expect(dailyProgressPct(0, 5)).toBe(0);
    expect(dailyProgressPct(1, 5)).toBe(20);
    expect(dailyProgressPct(3, 5)).toBe(60);
    expect(dailyProgressPct(5, 5)).toBe(100);
  });

  it('caps at 100 when the goal is exceeded', () => {
    expect(dailyProgressPct(8, 5)).toBe(100);
  });

  it('treats a non-positive goal as no cap', () => {
    expect(dailyProgressPct(0, 0)).toBe(0);
    expect(dailyProgressPct(4, 0)).toBe(100);
  });
});

describe('isDailyGoalMet', () => {
  it('is met only when done reaches goal', () => {
    expect(isDailyGoalMet(4, 5)).toBe(false);
    expect(isDailyGoalMet(5, 5)).toBe(true);
    expect(isDailyGoalMet(6, 5)).toBe(true);
  });

  it('with no cap, any activity counts as met', () => {
    expect(isDailyGoalMet(0, 0)).toBe(false);
    expect(isDailyGoalMet(1, 0)).toBe(true);
  });
});

describe('DAILY_GOAL_OPTIONS', () => {
  it('contains positive, strictly increasing choices', () => {
    for (let i = 1; i < DAILY_GOAL_OPTIONS.length; i++) {
      expect(DAILY_GOAL_OPTIONS[i]).toBeGreaterThan(DAILY_GOAL_OPTIONS[i - 1]);
    }
  });
});
