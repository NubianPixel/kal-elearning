/**
 * Builds the runtime question for one due review card. Pure — no I/O.
 * listen/recall cards look up their word/phrase item and build a runtime
 * question via core/questions.ts; drill cards look up the authored
 * question directly (a drill card's item_id IS the question id).
 */

import { itemById, questions as allQuestions, type Item, type Question } from '../content';
import {
  buildListeningQuestion,
  buildRecallQuestion,
  type ListeningQuestion,
  type RecallQuestion,
} from './questions';
import type { CardType } from './srs';

export type ReviewQuestion =
  | { cardType: 'listen'; item: Item; listening: ListeningQuestion | null }
  | { cardType: 'recall'; item: Item; recall: RecallQuestion }
  | { cardType: 'drill'; question: Question };

const questionsById = new Map(allQuestions.map((q) => [q.id, q]));

/**
 * `itemId` is the item id for listen/recall cards, or the authored drill
 * question's id for drill cards. `pool` is every introduced item (any
 * unit) — used as the listening distractor pool. Returns null when the id
 * doesn't resolve to known content (should not happen for a real card, but
 * content edits could orphan a card row).
 */
export function buildReviewQuestion(
  cardType: CardType,
  itemId: string,
  pool: Item[],
): ReviewQuestion | null {
  if (cardType === 'drill') {
    const question = questionsById.get(itemId);
    return question ? { cardType: 'drill', question } : null;
  }
  const item = itemById(itemId);
  if (!item) return null;
  if (cardType === 'listen') {
    return { cardType: 'listen', item, listening: buildListeningQuestion(item, pool) };
  }
  return { cardType: 'recall', item, recall: buildRecallQuestion(item) };
}
