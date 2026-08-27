import {
  CHOICE_COUNT,
  buildChoices,
  pickChoiceMode,
} from '../src/core/choices';
import type { VocabularyEntry } from '../src/core/types';

function entry(
  id: number,
  translation: string,
  imageUri: string | null = null,
): VocabularyEntry {
  return {
    id,
    languageId: 1,
    categoryId: null,
    targetText: `word${id}`,
    translation,
    notes: null,
    difficulty: 1,
    audioUri: null,
    imageUri,
  };
}

describe('pickChoiceMode', () => {
  it('uses text mode when the word has no picture', () => {
    const pool = [
      entry(1, 'a'),
      entry(2, 'b', 'img2'),
      entry(3, 'c', 'img3'),
      entry(4, 'd', 'img4'),
    ];
    expect(pickChoiceMode(entry(1, 'a'), pool)).toBe('text');
  });

  it('uses image mode when the word and 3+ others have pictures', () => {
    const pool = [
      entry(1, 'a', 'img1'),
      entry(2, 'b', 'img2'),
      entry(3, 'c', 'img3'),
      entry(4, 'd', 'img4'),
    ];
    expect(pickChoiceMode(pool[0], pool)).toBe('image');
  });

  it('falls back to text mode with too few illustrated words', () => {
    const pool = [entry(1, 'a', 'img1'), entry(2, 'b', 'img2')];
    expect(pickChoiceMode(pool[0], pool)).toBe('text');
  });
});

describe('buildChoices (text mode)', () => {
  const pool = [
    entry(1, 'Hello'),
    entry(2, 'Water'),
    entry(3, 'Dog'),
    entry(4, 'Cat'),
    entry(5, 'Book'),
  ];

  it('includes exactly one correct choice', () => {
    for (let i = 0; i < 10; i++) {
      const choices = buildChoices(pool[0], pool, 'text');
      expect(choices.filter((c) => c.isCorrect)).toHaveLength(1);
      expect(choices.find((c) => c.isCorrect)!.entry.id).toBe(1);
    }
  });

  it('has no duplicate entries or duplicate translations', () => {
    const choices = buildChoices(pool[0], pool, 'text');
    const ids = new Set(choices.map((c) => c.entry.id));
    expect(ids.size).toBe(choices.length);
    const translations = new Set(choices.map((c) => c.entry.translation));
    expect(translations.size).toBe(choices.length);
  });

  it('builds CHOICE_COUNT options from a large pool', () => {
    expect(buildChoices(pool[0], pool, 'text')).toHaveLength(CHOICE_COUNT);
  });

  it('still works when the pool is smaller than CHOICE_COUNT', () => {
    const small = [entry(1, 'Hello'), entry(2, 'Water')];
    const choices = buildChoices(small[0], small, 'text');
    expect(choices.length).toBeGreaterThanOrEqual(1);
    expect(choices.some((c) => c.isCorrect)).toBe(true);
  });
});

describe('buildChoices (image mode)', () => {
  const pool = [
    entry(1, 'Hello', 'img1'),
    entry(2, 'Water', 'img2'),
    entry(3, 'Dog', 'img3'),
    entry(4, 'Cat', 'img4'),
    entry(5, 'Book'), // no picture — must not appear as an image choice
  ];

  it('only uses illustrated entries as options', () => {
    const choices = buildChoices(pool[0], pool, 'image');
    for (const c of choices) {
      expect(c.entry.imageUri).not.toBeNull();
    }
  });

  it('never includes the unpictured entry', () => {
    for (let i = 0; i < 10; i++) {
      const choices = buildChoices(pool[0], pool, 'image');
      expect(choices.some((c) => c.entry.id === 5)).toBe(false);
    }
  });

  it('includes exactly one correct choice with full count', () => {
    const choices = buildChoices(pool[0], pool, 'image');
    expect(choices).toHaveLength(CHOICE_COUNT);
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1);
  });
});
