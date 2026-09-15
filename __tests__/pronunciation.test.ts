import { normalizeForMatch, similarity } from '../src/core/pronunciation';

describe('normalizeForMatch', () => {
  it('lowercases, strips punctuation and collapses spaces', () => {
    expect(normalizeForMatch('  Dumela,  Rra! ')).toBe('dumela rra');
  });

  it('returns empty for punctuation-only input', () => {
    expect(normalizeForMatch('!!! ...')).toBe('');
  });
});

describe('similarity', () => {
  it('is 1 for identical words', () => {
    expect(similarity('tsala', 'tsala')).toBe(1);
  });

  it('is 0 when one side is empty', () => {
    expect(similarity('', 'tsala')).toBe(0);
    expect(similarity('tsala', '')).toBe(0);
  });

  it('drops for typos but stays high for one edit', () => {
    const s = similarity('tsal', 'tsala'); // one deletion over 5 chars
    expect(s).toBeCloseTo(0.8, 5);
  });
});
