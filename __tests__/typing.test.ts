import { gradeTypedAnswer } from '../src/core/typing';

describe('gradeTypedAnswer', () => {
  it('accepts the exact answer regardless of case', () => {
    expect(gradeTypedAnswer('Hello', 'hello').correct).toBe(true);
    expect(gradeTypedAnswer('Hello', 'HELLO').grade).toBe('exact');
  });

  it('ignores punctuation, extra spaces and capitals', () => {
    expect(gradeTypedAnswer('Goodbye', '  Goodbye! ').grade).toBe('exact');
    expect(gradeTypedAnswer('they eat food together', 'They eat food together.').grade).toBe('exact');
  });

  it('accepts the answer embedded in a longer sentence', () => {
    expect(gradeTypedAnswer('hello', 'it means hello').grade).toBe('exact');
    expect(gradeTypedAnswer('the dog and the cat are pets', 'the dog and the cat are pets yes').grade).toBe('exact');
  });

  it('accepts a single-word answer inside a phrase', () => {
    expect(gradeTypedAnswer('water', 'some water please').grade).toBe('exact');
  });

  it('grades a small typo as close but still correct', () => {
    const v = gradeTypedAnswer('thank you', 'than you');
    expect(v.correct).toBe(true);
    expect(v.grade).toBe('close');
  });

  it('gives credit for a one-letter typo', () => {
    // 'hello' vs 'helllo' — one extra letter over 6 chars.
    const v = gradeTypedAnswer('hello', 'helllo');
    expect(v.correct).toBe(true);
    expect(v.grade).toBe('close');
  });

  it('marks a different word as wrong', () => {
    const v = gradeTypedAnswer('hello', 'goodbye');
    expect(v.correct).toBe(false);
    expect(v.grade).toBe('wrong');
  });

  it('marks empty or punctuation-only input as wrong', () => {
    expect(gradeTypedAnswer('hello', '').correct).toBe(false);
    expect(gradeTypedAnswer('hello', '...').correct).toBe(false);
    expect(gradeTypedAnswer('hello', '   ').correct).toBe(false);
  });

  it('reports a 0..1 similarity score', () => {
    expect(gradeTypedAnswer('hello', 'hello').score).toBe(1);
    expect(gradeTypedAnswer('hello', 'cold').score).toBeLessThan(0.72);
  });
});