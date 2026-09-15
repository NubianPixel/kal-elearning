/**
 * Runtime-generated checkpoint/review questions built from unit items:
 * listening (hear the audio, choose the English meaning) and recall
 * (English + hint -> type the Setswana). Authored grammar/reading
 * questions come straight from content/index.ts instead.
 */

import { items, type Item } from '../content';
import { shuffle } from './choices';
import { gradeTypedAnswer, type TypedVerdict } from './typing';
import { normalizeForMatch } from './pronunciation';

export const DEFAULT_LISTEN_OPTIONS = 4;

export interface ListeningQuestion {
  kind: 'listening';
  itemId: string;
  /** Shuffled English options; the item's audio (never its written form) is the prompt. */
  options: string[];
  answer: string;
}

export interface RecallQuestion {
  kind: 'recall';
  itemId: string;
  /** First English meaning + hint, e.g. "hello (to several people)". */
  prompt: string;
  answer: string;
  answerAlt: string[];
}

function firstEnglish(item: Item): string {
  return item.english[0] ?? '';
}

/**
 * How confusable `candidate` is as a listening distractor for `item`:
 * 0 = same unit, same pos, matching noun class (when item has one) — most
 * confusable; 1 = same unit and pos; 2 = same unit; 3 = anything else.
 */
function confusability(item: Item, candidate: Item): number {
  if (item.unit === candidate.unit && item.pos === candidate.pos) {
    if (item.nounClass != null && candidate.nounClass === item.nounClass) return 0;
    return 1;
  }
  if (item.unit === candidate.unit) return 2;
  return 3;
}

/**
 * Build a listening question for `item`. `pool` is every item introduced
 * so far (any unit) — never just today's due list. Distractors prefer the
 * most confusable items first, skip duplicate displayed English, and the
 * option count shrinks (down to a minimum of 2 total) rather than padding
 * with unrelated words; returns null when no distractor is available.
 */
export function buildListeningQuestion(
  item: Item,
  pool: Item[],
  optionCount: number = DEFAULT_LISTEN_OPTIONS,
): ListeningQuestion | null {
  const correctEnglish = firstEnglish(item);
  const candidates = shuffle(pool.filter((i) => i.id !== item.id))
    .sort((a, b) => confusability(item, a) - confusability(item, b));

  const seenEnglish = new Set([correctEnglish]);
  const distractors: string[] = [];
  for (const candidate of candidates) {
    if (distractors.length >= optionCount - 1) break;
    const english = firstEnglish(candidate);
    if (!english || seenEnglish.has(english)) continue;
    seenEnglish.add(english);
    distractors.push(english);
  }

  if (distractors.length < 1) return null;
  return {
    kind: 'listening',
    itemId: item.id,
    options: shuffle([correctEnglish, ...distractors]),
    answer: correctEnglish,
  };
}

/** Build a recall question: English + hint -> type the Setswana. */
export function buildRecallQuestion(item: Item): RecallQuestion {
  const prompt = item.hint ? `${firstEnglish(item)} (${item.hint})` : firstEnglish(item);
  return { kind: 'recall', itemId: item.id, prompt, answer: item.setswana, answerAlt: item.setswanaAlt };
}

/**
 * Grade a typed Setswana recall answer against the answer and its alts.
 * Reuses the typing grader, whose normalize step already strips ê/ô, so
 * "tsogile" matches "tsôgile" and small typos still earn credit.
 *
 * Guard: a typo-tolerant similarity match can accidentally accept a
 * *different* item's exact word as "close" (e.g. "Dumela" scores 0.75 for
 * "Dumelang", which defeats Unit 1's singular/plural point). If the typed
 * text is an exact normalized match for another item's setswana/alt — and
 * not this item's own answer/alts — it's graded wrong outright, before
 * similarity gets a chance to call it a typo.
 */
export function gradeRecallAnswer(
  question: RecallQuestion,
  typed: string,
  pool: readonly Item[] = items,
): TypedVerdict {
  const candidates = [question.answer, ...question.answerAlt];
  const got = normalizeForMatch(typed);
  const ownForms = new Set(candidates.map((c) => normalizeForMatch(c)));

  if (got && !ownForms.has(got)) {
    const matchesAnotherItem = pool.some(
      (other) =>
        other.id !== question.itemId &&
        (normalizeForMatch(other.setswana) === got || other.setswanaAlt.some((alt) => normalizeForMatch(alt) === got)),
    );
    if (matchesAnotherItem) return { grade: 'wrong', correct: false, score: 0 };
  }

  let best = gradeTypedAnswer(candidates[0], typed);
  for (const candidate of candidates.slice(1)) {
    const verdict = gradeTypedAnswer(candidate, typed);
    if (verdict.score > best.score) best = verdict;
  }
  return best;
}
