import {
  DEFAULT_EASE,
  isDue,
  isMastered,
  MASTERY_INTERVAL_DAYS,
  MASTERY_MIN_REPETITIONS,
  newState,
  nextEase,
  qualityFromAnswer,
  schedule,
} from '../src/core/sm2';

const NOW = new Date('2026-08-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('qualityFromAnswer', () => {
  it('maps child buttons to SM-2 grades', () => {
    expect(qualityFromAnswer('again')).toBe(2);
    expect(qualityFromAnswer('good')).toBe(4);
    expect(qualityFromAnswer('easy')).toBe(5);
  });
});

describe('nextEase', () => {
  it('increases ease on perfect answers and decreases on failures', () => {
    expect(nextEase(DEFAULT_EASE, 5)).toBeGreaterThan(DEFAULT_EASE);
    expect(nextEase(DEFAULT_EASE, 4)).toBe(DEFAULT_EASE); // SM-2: EF unchanged at q=4? actually 0.0 delta
    expect(nextEase(DEFAULT_EASE, 2)).toBeLessThan(DEFAULT_EASE);
  });

  it('never drops below MIN_EASE', () => {
    let ease = DEFAULT_EASE;
    for (let i = 0; i < 20; i++) ease = nextEase(ease, 0);
    expect(ease).toBeGreaterThanOrEqual(1.3);
  });
});

describe('schedule', () => {
  it('new card answered correctly gets a 1-day interval', () => {
    const { state, dueDate } = schedule(
      { ease: DEFAULT_EASE, intervalDays: 0, repetitions: 0, lapses: 0 },
      4,
      NOW,
    );
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);
    expect(dueDate.getTime()).toBe(NOW.getTime() + DAY_MS);
  });

  it('second success gets the 6-day interval', () => {
    const { state, dueDate } = schedule(
      { ease: DEFAULT_EASE, intervalDays: 1, repetitions: 1, lapses: 0 },
      4,
      NOW,
    );
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
    expect(dueDate.getTime()).toBe(NOW.getTime() + 6 * DAY_MS);
  });

  it('third success scales the interval by ease', () => {
    const { state } = schedule(
      { ease: 2.5, intervalDays: 6, repetitions: 2, lapses: 0 },
      4,
      NOW,
    );
    expect(state.repetitions).toBe(3);
    expect(state.intervalDays).toBe(Math.round(6 * 2.5)); // 15
  });

  it('a failed card resets repetitions and is due immediately (relearn in-session)', () => {
    const { state, dueDate } = schedule(
      { ease: 2.5, intervalDays: 15, repetitions: 3, lapses: 0 },
      2,
      NOW,
    );
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(0);
    expect(state.lapses).toBe(1);
    expect(dueDate.getTime()).toBe(NOW.getTime());
  });

  it('ease keeps decreasing across many failures but stays >= 1.3', () => {
    let state = { ease: DEFAULT_EASE, intervalDays: 1, repetitions: 2, lapses: 0 };
    for (let i = 0; i < 10; i++) {
      state = schedule(state, 1, NOW).state;
      expect(state.ease).toBeGreaterThanOrEqual(1.3);
    }
  });
});

describe('mastery', () => {
  it('requires both interval and repetitions thresholds', () => {
    expect(isMastered({ repetitions: MASTERY_MIN_REPETITIONS, intervalDays: MASTERY_INTERVAL_DAYS })).toBe(true);
    expect(isMastered({ repetitions: 3, intervalDays: 20 })).toBe(false);
    expect(isMastered({ repetitions: 2, intervalDays: 30 })).toBe(false);
  });

  it('isDue compares against the due date', () => {
    expect(isDue({ dueDate: '2026-08-26T00:00:00.000Z' }, NOW)).toBe(true);
    expect(isDue({ dueDate: '2026-08-28T00:00:00.000Z' }, NOW)).toBe(false);
  });

  it('newState is immediately due and unmastered', () => {
    const s = newState(1);
    expect(isDue(s, NOW)).toBe(true);
    expect(isMastered(s)).toBe(false);
  });
});
