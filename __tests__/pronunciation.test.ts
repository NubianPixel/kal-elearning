import {
  judgePronunciation,
  normalizeForMatch,
  similarity,
} from '../src/core/pronunciation';

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

describe('judgePronunciation', () => {
  it('accepts the exact word', () => {
    expect(judgePronunciation('tsala', 'tsala').correct).toBe(true);
  });

  it('ignores case and punctuation', () => {
    expect(judgePronunciation('Tsala!', 'tsala').correct).toBe(true);
  });

  it('accepts the word spoken among other speech', () => {
    expect(judgePronunciation('ke a go tsala', 'tsala').correct).toBe(true);
  });

  it('accepts close attempts (child speech)', () => {
    expect(judgePronunciation('tsalaa', 'tsala').correct).toBe(true);
  });

  it('rejects a different word', () => {
    const v = judgePronunciation('metsi', 'tsala');
    expect(v.correct).toBe(false);
    expect(v.similarity).toBeLessThan(0.7);
  });

  it('rejects empty transcripts', () => {
    expect(judgePronunciation('', 'tsala').correct).toBe(false);
    expect(judgePronunciation('...', 'tsala').correct).toBe(false);
  });

  it('respects a stricter threshold', () => {
    // 'tsal' vs 'tsala' = 0.8 similarity
    expect(judgePronunciation('tsal', 'tsala', 0.9).correct).toBe(false);
    expect(judgePronunciation('tsal', 'tsala', 0.7).correct).toBe(true);
  });
});
