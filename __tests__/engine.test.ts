import { gradeAnswer, isItemMastered, SLOW_ANSWER_MS } from '../src/core/srs';
import { buildListeningQuestion, buildRecallQuestion, gradeRecallAnswer } from '../src/core/questions';
import { buildCheckpoint, scoreCheckpoint, type CheckpointResult } from '../src/core/checkpoint';
import { buildReviewQueue, isGoalMet, newItemsAllowed } from '../src/core/daily';
import { firstIncompleteStep, nextAction, unitStatus, wordsStepComplete, type UnitProgress } from '../src/core/path';
import { itemById, type Item } from '../src/content';

const MASTERED = { repetitions: 3, intervalDays: 21 };
const UNMASTERED = { repetitions: 1, intervalDays: 3 };

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    unit: 1,
    order: 1,
    kind: 'word',
    setswana: overrides.id,
    setswanaAlt: [],
    english: ['x'],
    hint: null,
    pos: 'noun',
    nounClass: null,
    plural: [],
    image: null,
    note: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// srs.ts
// ---------------------------------------------------------------------------

describe('gradeAnswer', () => {
  it('grades wrong answers as quality 2 regardless of time', () => {
    expect(gradeAnswer(false, 500)).toBe(2);
    expect(gradeAnswer(false, 20000)).toBe(2);
  });

  it('grades a fast correct answer as quality 4', () => {
    expect(gradeAnswer(true, 1000)).toBe(4);
    expect(gradeAnswer(true, SLOW_ANSWER_MS)).toBe(4); // boundary: not slow
  });

  it('grades a slow correct answer as quality 3', () => {
    expect(gradeAnswer(true, SLOW_ANSWER_MS + 1)).toBe(3);
    expect(gradeAnswer(true, 30000)).toBe(3);
  });
});

describe('isItemMastered', () => {
  it('requires both listen and recall cards to be mastered', () => {
    expect(isItemMastered(MASTERED, MASTERED)).toBe(true);
    expect(isItemMastered(MASTERED, UNMASTERED)).toBe(false);
    expect(isItemMastered(UNMASTERED, MASTERED)).toBe(false);
    expect(isItemMastered(undefined, MASTERED)).toBe(false);
    expect(isItemMastered(undefined, undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// questions.ts
// ---------------------------------------------------------------------------

describe('buildListeningQuestion', () => {
  const target = item({ id: 'a1-u01-w001', unit: 1, pos: 'verb', english: ['hello'] });

  it('prefers same-unit same-pos distractors over other units', () => {
    const pool: Item[] = [
      target,
      item({ id: 'same-unit-same-pos', unit: 1, pos: 'verb', english: ['goodbye'] }),
      item({ id: 'other-unit', unit: 2, pos: 'verb', english: ['water'] }),
    ];
    // Run several times since candidate order is shuffled before ranking.
    for (let i = 0; i < 20; i++) {
      const q = buildListeningQuestion(target, pool, 2);
      expect(q).not.toBeNull();
      expect(q!.options).toContain('goodbye');
    }
  });

  it('never offers two options with the same displayed English', () => {
    const pool: Item[] = [
      target,
      item({ id: 'dup-1', unit: 1, pos: 'verb', english: ['hi there', 'goodbye'] }),
      item({ id: 'dup-2', unit: 1, pos: 'verb', english: ['goodbye'] }),
      item({ id: 'dup-3', unit: 1, pos: 'verb', english: ['thanks'] }),
    ];
    const q = buildListeningQuestion(target, pool, 4);
    expect(q).not.toBeNull();
    const uniqueOptions = new Set(q!.options);
    expect(uniqueOptions.size).toBe(q!.options.length);
  });

  it('shrinks the option count rather than padding, and returns null with no distractor', () => {
    const onlyOneOther: Item[] = [target, item({ id: 'only-other', english: ['bye'] })];
    const q = buildListeningQuestion(target, onlyOneOther, 6);
    expect(q).not.toBeNull();
    expect(q!.options.length).toBe(2);

    const noOthers: Item[] = [target];
    expect(buildListeningQuestion(target, noOthers, 4)).toBeNull();
  });

  it('the returned options always include the correct English meaning', () => {
    const pool: Item[] = [target, item({ id: 'other', english: ['other'] })];
    const q = buildListeningQuestion(target, pool, 2);
    expect(q!.options).toContain('hello');
    expect(q!.answer).toBe('hello');
  });
});

describe('recall grading', () => {
  const q = buildRecallQuestion(
    item({ id: 'a1-u01-w007', setswana: 'O tsôgile jang?', setswanaAlt: ['O tsogetse jang'], english: ['how are you'] }),
  );

  it('accepts input without ê/ô diacritics', () => {
    expect(gradeRecallAnswer(q, 'O tsogile jang?').correct).toBe(true);
  });

  it('accepts an alternative spelling', () => {
    expect(gradeRecallAnswer(q, 'O tsogetse jang').correct).toBe(true);
  });

  it('rejects an unrelated answer', () => {
    expect(gradeRecallAnswer(q, 'Sala sentle').correct).toBe(false);
  });
});

describe('gradeRecallAnswer cross-item collision guard', () => {
  // Unit 1's grammar point is singular vs plural address: Dumela (one
  // person) vs Dumelang (several) must not be interchangeable, even though
  // they're a one-letter typo apart.
  const dumelang = buildRecallQuestion(itemById('a1-u01-w002')!); // "Dumelang"

  it('does not accept a different, existing item\'s word as a "close" typo', () => {
    // Bug: similarity("dumela", "dumelang") ~= 0.75 >= the 0.72 close
    // threshold, so "Dumela" used to be marked correct for "Dumelang".
    const v = gradeRecallAnswer(dumelang, 'Dumela');
    expect(v.correct).toBe(false);
    expect(v.grade).toBe('wrong');
  });

  it('still grades a genuine typo of the target as correct', () => {
    const v = gradeRecallAnswer(dumelang, 'Dumelnag');
    expect(v.correct).toBe(true);
  });

  it('the exact target itself is still accepted (not shadowed by the guard)', () => {
    expect(gradeRecallAnswer(dumelang, 'Dumelang').correct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkpoint.ts
// ---------------------------------------------------------------------------

describe('buildCheckpoint', () => {
  it('builds a checkpoint for unit 1 from real content with all four skills present', () => {
    const cp = buildCheckpoint(1, { perSkill: 3 });
    const skills = new Set(cp.questions.map((q) => q.skill));
    expect(skills.has('listening')).toBe(true);
    expect(skills.has('recall')).toBe(true);
    expect(skills.has('grammar')).toBe(true);
    expect(skills.has('reading')).toBe(true);
  });

  it('is deterministic given an injected rng', () => {
    function lcg() {
      let seed = 1;
      return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
    }
    const recallIds = (cp: ReturnType<typeof buildCheckpoint>) =>
      cp.questions
        .filter((q): q is Extract<typeof q, { skill: 'recall' }> => q.skill === 'recall')
        .map((q) => q.question.itemId);
    const a = buildCheckpoint(1, { perSkill: 3, rng: lcg() });
    const b = buildCheckpoint(1, { perSkill: 3, rng: lcg() });
    expect(recallIds(a)).toEqual(recallIds(b));
    expect(recallIds(a).length).toBe(3);
  });
});

describe('scoreCheckpoint', () => {
  function results(skillPct: Record<string, [number, number]>) {
    const out: CheckpointResult[] = [];
    for (const [skill, [correct, total]] of Object.entries(skillPct)) {
      for (let i = 0; i < total; i++) {
        out.push({ skill: skill as CheckpointResult['skill'], refId: `${skill}-${i}`, correct: i < correct });
      }
    }
    return out;
  }

  it('passes at exactly 80% overall and 60% in every skill', () => {
    const r = results({ listening: [3, 5], recall: [5, 5] }); // 8/10 = 80% overall, 60%/100%
    const score = scoreCheckpoint(r);
    expect(score.overallPct).toBe(80);
    expect(score.perSkillPct.listening).toBe(60);
    expect(score.passed).toBe(true);
  });

  it('fails when overall is just under 80%', () => {
    const r = results({ listening: [4, 5], recall: [3, 5] }); // 7/10 = 70%
    const score = scoreCheckpoint(r);
    expect(score.overallPct).toBe(70);
    expect(score.passed).toBe(false);
  });

  it('fails when overall passes but one skill is under 60%', () => {
    const strongOverall = results({ listening: [2, 5], recall: [5, 5], grammar: [5, 5] }); // 12/15 = 80% overall, listening 40%
    const score = scoreCheckpoint(strongOverall);
    expect(score.overallPct).toBe(80);
    expect(score.perSkillPct.listening).toBe(40);
    expect(score.passed).toBe(false);
  });

  it('ignores a skill with no questions (ungated by the 60% rule)', () => {
    const r = results({ listening: [4, 5] }); // 80% overall, only skill present
    const score = scoreCheckpoint(r);
    expect(score.perSkillPct.grammar).toBeUndefined();
    expect(score.passed).toBe(true);
  });

  it('reports missed items for the review-before-retry screen', () => {
    const r = results({ listening: [1, 3] });
    const score = scoreCheckpoint(r);
    expect(score.missed.length).toBe(2);
    expect(score.missed.every((m) => !m.correct)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// daily.ts
// ---------------------------------------------------------------------------

describe('buildReviewQueue', () => {
  const now = new Date('2026-09-16T10:00:00.000Z');
  it('returns only due cards, most overdue first, capped', () => {
    const cards = [
      { id: 'a', dueDate: '2026-09-15T00:00:00.000Z' },
      { id: 'b', dueDate: '2026-09-10T00:00:00.000Z' },
      { id: 'c', dueDate: '2026-09-20T00:00:00.000Z' }, // not due yet
      { id: 'd', dueDate: '2026-09-01T00:00:00.000Z' },
    ];
    const queue = buildReviewQueue(cards, now, 2);
    expect(queue.map((c) => c.id)).toEqual(['d', 'b']);
  });
});

describe('newItemsAllowed', () => {
  it('is zero while the backlog exceeds the cap', () => {
    expect(newItemsAllowed({ dueCount: 61, cap: 60, introducedToday: 0, dailyN: 10 })).toBe(0);
  });

  it('allows up to dailyN minus what was already introduced today, within cap', () => {
    expect(newItemsAllowed({ dueCount: 10, cap: 60, introducedToday: 4, dailyN: 10 })).toBe(6);
    expect(newItemsAllowed({ dueCount: 10, cap: 60, introducedToday: 10, dailyN: 10 })).toBe(0);
    expect(newItemsAllowed({ dueCount: 10, cap: 60, introducedToday: 99, dailyN: 10 })).toBe(0);
  });
});

describe('isGoalMet', () => {
  it('is false when reviews remain and new items are still owed', () => {
    expect(
      isGoalMet({ dueRemaining: 5, reviewedToday: 0, cap: 60, introducedToday: 0, dailyN: 10, newAvailable: 20 }),
    ).toBe(false);
  });

  it('is true once due queue is cleared and daily N introduced', () => {
    expect(
      isGoalMet({ dueRemaining: 0, reviewedToday: 12, cap: 60, introducedToday: 10, dailyN: 10, newAvailable: 20 }),
    ).toBe(true);
  });

  it('counts reaching the review cap as reviews-done even with backlog left', () => {
    expect(
      isGoalMet({ dueRemaining: 40, reviewedToday: 60, cap: 60, introducedToday: 10, dailyN: 10, newAvailable: 5 }),
    ).toBe(true);
  });

  it('counts new-items-done when none are available, even short of dailyN', () => {
    expect(
      isGoalMet({ dueRemaining: 0, reviewedToday: 3, cap: 60, introducedToday: 2, dailyN: 10, newAvailable: 0 }),
    ).toBe(true);
  });

  it('counts new-items-done when backlog pauses them, even short of dailyN', () => {
    expect(
      isGoalMet({ dueRemaining: 61, reviewedToday: 61, cap: 60, introducedToday: 0, dailyN: 10, newAvailable: 20 }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// path.ts
// ---------------------------------------------------------------------------

describe('unitStatus', () => {
  it('unit 1 is always unlocked', () => {
    expect(unitStatus(1, new Set())).toBe('unlocked');
  });

  it('a unit beyond highestPassed+1 is locked', () => {
    expect(unitStatus(3, new Set([1]))).toBe('locked');
  });

  it('the unit right after the highest passed one is unlocked', () => {
    expect(unitStatus(2, new Set([1]))).toBe('unlocked');
  });

  it('test-out: passing a later unit directly unlocks (not auto-passes) the units below it', () => {
    // Unit 5 passed directly via test-out, without 2-4 ever being passed.
    expect(unitStatus(5, new Set([1, 5]))).toBe('passed');
    expect(unitStatus(3, new Set([1, 5]))).toBe('unlocked'); // accessible, not marked passed
    expect(unitStatus(6, new Set([1, 5]))).toBe('unlocked'); // highestPassed+1
    expect(unitStatus(7, new Set([1, 5]))).toBe('locked');
  });
});

describe('wordsStepComplete / firstIncompleteStep', () => {
  function progress(overrides: Partial<UnitProgress>): UnitProgress {
    return {
      unit: 1,
      introducedItemIds: new Set(),
      totalItemIds: ['a', 'b'],
      grammarDone: false,
      useitDone: false,
      checkpointPassed: false,
      ...overrides,
    };
  }

  it('words is complete only once every item is introduced', () => {
    expect(wordsStepComplete(progress({ introducedItemIds: new Set(['a']) }))).toBe(false);
    expect(wordsStepComplete(progress({ introducedItemIds: new Set(['a', 'b']) }))).toBe(true);
  });

  it('steps are checked in fixed order', () => {
    expect(firstIncompleteStep(progress({}))).toBe('words');
    expect(firstIncompleteStep(progress({ introducedItemIds: new Set(['a', 'b']) }))).toBe('grammar');
    expect(firstIncompleteStep(progress({ introducedItemIds: new Set(['a', 'b']), grammarDone: true }))).toBe('useit');
    expect(
      firstIncompleteStep(progress({ introducedItemIds: new Set(['a', 'b']), grammarDone: true, useitDone: true })),
    ).toBe('checkpoint');
    expect(
      firstIncompleteStep(
        progress({ introducedItemIds: new Set(['a', 'b']), grammarDone: true, useitDone: true, checkpointPassed: true }),
      ),
    ).toBeNull();
  });
});

describe('nextAction', () => {
  const doneUnit: UnitProgress = {
    unit: 1,
    introducedItemIds: new Set(['a', 'b']),
    totalItemIds: ['a', 'b'],
    grammarDone: true,
    useitDone: true,
    checkpointPassed: true,
  };
  const wordsPending: UnitProgress = { ...doneUnit, introducedItemIds: new Set(), checkpointPassed: false, grammarDone: false, useitDone: false };

  it('reviews take priority over unit steps', () => {
    expect(
      nextAction({
        dueCount: 5,
        reviewCap: 60,
        reviewedToday: 0,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: wordsPending,
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'review', count: 5 });
  });

  it('falls to the current unit step when nothing is due', () => {
    expect(
      nextAction({
        dueCount: 0,
        reviewCap: 60,
        reviewedToday: 0,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: { ...wordsPending, introducedItemIds: new Set(['a']), totalItemIds: ['a', 'b'] },
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'step', unit: 1, step: 'words' });
  });

  it('rests instead of Words when new items are paused today', () => {
    expect(
      nextAction({
        dueCount: 0,
        reviewCap: 60,
        reviewedToday: 0,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: wordsPending,
        newItemsAllowedToday: 0,
        goalMetToday: true,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'rest', reason: 'goal-met' });
  });

  it('offers the exit test once the last unit is passed', () => {
    expect(
      nextAction({
        dueCount: 0,
        reviewCap: 60,
        reviewedToday: 0,
        totalUnits: 10,
        passedUnits: new Set([10]),
        currentUnit: null,
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'exit-test' });
  });

  it('is done once the exit test is passed', () => {
    expect(
      nextAction({
        dueCount: 0,
        reviewCap: 60,
        reviewedToday: 0,
        totalUnits: 10,
        passedUnits: new Set([10]),
        currentUnit: null,
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: true,
      }),
    ).toEqual({ kind: 'done' });
  });

  it('stops routing to review once reviewedToday reaches the cap, even with cards still due', () => {
    // Bug: dueCount > 0 alone used to always win, so the review cap was never enforced.
    expect(
      nextAction({
        dueCount: 25,
        reviewCap: 60,
        reviewedToday: 60,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: { ...wordsPending, introducedItemIds: new Set(['a']), totalItemIds: ['a', 'b'] },
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'step', unit: 1, step: 'words' });
  });

  it('still gates the fallback step behind newItemsAllowed after the review cap is hit', () => {
    expect(
      nextAction({
        dueCount: 25,
        reviewCap: 60,
        reviewedToday: 60,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: wordsPending,
        newItemsAllowedToday: 0,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'rest', reason: 'backlog' });
  });

  it('caps the review count to what remains of the cap, not the full due count', () => {
    expect(
      nextAction({
        dueCount: 25,
        reviewCap: 60,
        reviewedToday: 55,
        totalUnits: 10,
        passedUnits: new Set(),
        currentUnit: wordsPending,
        newItemsAllowedToday: 10,
        goalMetToday: false,
        exitTestPassed: false,
      }),
    ).toEqual({ kind: 'review', count: 5 });
  });
});
