import { buildReviewQuestion } from '../src/core/reviewQuestion';
import { items, itemById } from '../src/content';

const WORD_ID = 'a1-u01-w001'; // Dumela
const DRILL_ID = 'a1-u01-q001'; // authored grammar drill question

describe('buildReviewQuestion', () => {
  it('builds a listening question from a pool with distractors', () => {
    const result = buildReviewQuestion('listen', WORD_ID, items);
    expect(result?.cardType).toBe('listen');
    if (result?.cardType === 'listen') {
      expect(result.item.id).toBe(WORD_ID);
      expect(result.listening).not.toBeNull();
      expect(result.listening?.options).toContain('hello');
    }
  });

  it('returns a null listening question when the pool has no distractors', () => {
    const result = buildReviewQuestion('listen', WORD_ID, [itemById(WORD_ID)!]);
    expect(result?.cardType).toBe('listen');
    if (result?.cardType === 'listen') {
      expect(result.listening).toBeNull();
    }
  });

  it('builds a recall question', () => {
    const result = buildReviewQuestion('recall', WORD_ID, items);
    expect(result?.cardType).toBe('recall');
    if (result?.cardType === 'recall') {
      expect(result.recall.answer).toBe('Dumela');
    }
  });

  it('builds a drill question from the authored question id', () => {
    const result = buildReviewQuestion('drill', DRILL_ID, items);
    expect(result?.cardType).toBe('drill');
    if (result?.cardType === 'drill') {
      expect(result.question.id).toBe(DRILL_ID);
    }
  });

  it('returns null for an unknown id', () => {
    expect(buildReviewQuestion('recall', 'nope', items)).toBeNull();
    expect(buildReviewQuestion('drill', 'nope', items)).toBeNull();
  });
});
