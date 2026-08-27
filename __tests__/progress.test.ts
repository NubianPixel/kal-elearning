import { computeStreak, daysBetween, MILESTONES, nextMilestone } from '../src/core/progress';

const TODAY = new Date(2026, 7, 27, 12, 0, 0); // local noon, 27 Aug 2026

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween(new Date(2026, 7, 26), new Date(2026, 7, 27))).toBe(1);
    expect(daysBetween(new Date(2026, 7, 20), new Date(2026, 7, 27))).toBe(7);
    expect(daysBetween(new Date(2026, 7, 27), new Date(2026, 7, 27))).toBe(0);
  });
});

describe('computeStreak', () => {
  it('returns 0 with no reviews', () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    const dates = [
      '2026-08-25T10:00:00.000Z',
      '2026-08-26T10:00:00.000Z',
      '2026-08-27T08:00:00.000Z',
    ];
    expect(computeStreak(dates, TODAY)).toBe(3);
  });

  it('counts a streak ending yesterday (child has not reviewed yet today)', () => {
    const dates = ['2026-08-25T10:00:00.000Z', '2026-08-26T10:00:00.000Z'];
    expect(computeStreak(dates, TODAY)).toBe(2);
  });

  it('breaks the streak when a day is skipped', () => {
    const dates = ['2026-08-24T10:00:00.000Z', '2026-08-26T10:00:00.000Z'];
    expect(computeStreak(dates, TODAY)).toBe(1);
  });

  it('ignores multiple reviews per day', () => {
    const dates = [
      '2026-08-26T08:00:00.000Z',
      '2026-08-26T15:00:00.000Z',
      '2026-08-27T09:00:00.000Z',
    ];
    expect(computeStreak(dates, TODAY)).toBe(2);
  });
});

describe('milestones', () => {
  it('returns the first unmet milestone', () => {
    expect(nextMilestone(0)?.target).toBe(5);
    expect(nextMilestone(7)?.target).toBe(10);
    expect(nextMilestone(60)?.target).toBe(100);
  });

  it('returns null when everything is achieved', () => {
    expect(nextMilestone(100)).toBeNull();
    expect(nextMilestone(500)).toBeNull();
  });

  it('milestones are strictly increasing', () => {
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i].target).toBeGreaterThan(MILESTONES[i - 1].target);
    }
  });
});
