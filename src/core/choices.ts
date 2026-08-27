/**
 * Answer-choice construction for the review session — pure and testable.
 *
 * Two modes:
 * - 'text': the child picks the matching English meaning (word text shown).
 * - 'image': the child picks the matching picture (audio/word shown) —
 *   ideal for pre-readers, available once enough words have pictures.
 */

import type { VocabularyEntry } from './types';

export interface Choice {
  entry: VocabularyEntry;
  isCorrect: boolean;
}

export type ChoiceMode = 'text' | 'image';

/** Number of answer options shown to the child. */
export const CHOICE_COUNT = 4;

/**
 * Image mode needs the correct word plus at least this many other
 * illustrated words to build a full grid of choices.
 */
export const IMAGE_MODE_MIN_DISTRACTORS = CHOICE_COUNT - 1;

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Image mode when the word has a picture AND the pool has enough other
 * illustrated words for distractors; otherwise text mode.
 */
export function pickChoiceMode(
  entry: Pick<VocabularyEntry, 'id' | 'imageUri'>,
  pool: VocabularyEntry[],
): ChoiceMode {
  if (!entry.imageUri) return 'text';
  const illustratedOthers = pool.filter((e) => e.id !== entry.id && e.imageUri);
  return illustratedOthers.length >= IMAGE_MODE_MIN_DISTRACTORS ? 'image' : 'text';
}

/**
 * Build CHOICE_COUNT shuffled options including exactly one correct one.
 * Text mode prefers distractors with distinct translations (no trivially
 * duplicated answers); image mode only uses illustrated entries.
 */
export function buildChoices(
  entry: VocabularyEntry,
  pool: VocabularyEntry[],
  mode: ChoiceMode,
): Choice[] {
  const candidates = pool.filter((e) => e.id !== entry.id);
  const correct: Choice = { entry, isCorrect: true };

  if (mode === 'image') {
    const distractors = shuffle(candidates.filter((e) => e.imageUri))
      .slice(0, IMAGE_MODE_MIN_DISTRACTORS)
      .map((e): Choice => ({ entry: e, isCorrect: false }));
    return shuffle([correct, ...distractors]);
  }

  const seen = new Set([entry.translation]);
  const distractors: Choice[] = [];
  for (const e of shuffle(candidates)) {
    if (distractors.length >= IMAGE_MODE_MIN_DISTRACTORS) break;
    if (seen.has(e.translation)) continue;
    seen.add(e.translation);
    distractors.push({ entry: e, isCorrect: false });
  }
  if (distractors.length < IMAGE_MODE_MIN_DISTRACTORS) {
    for (const e of shuffle(candidates)) {
      if (distractors.length >= IMAGE_MODE_MIN_DISTRACTORS) break;
      if (distractors.some((d) => d.entry.id === e.id)) continue;
      distractors.push({ entry: e, isCorrect: false });
    }
  }
  return shuffle([correct, ...distractors]);
}
