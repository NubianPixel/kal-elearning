/**
 * Tests for the on-device DSP pipeline (MFCC -> banded DTW -> score) and the
 * ephemeral-buffer privacy contract of the Pronunciation module.
 */
import { SAMPLE_RATE, extractMfcc } from '../src/core/dsp/mfcc';
import { dtwDistance } from '../src/core/dsp/dtw';
import { scorePronunciation } from '../src/core/dsp/score';
import { zeroAndRelease, pcm16ToFloat32, parseWavToPcm, pcmDurationMs } from '../src/core/dsp/ephemeral';
import { PronunciationSession, type EphemeralPcmRecorder } from '../src/services/pronunciationEngine';

/** Synthesize a tone at `hz` for `ms` at the module sample rate. */
function tone(hz: number, ms: number, amp = 0.5): Float32Array {
  const n = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE);
  return out;
}

describe('MFCC extraction', () => {
  it('produces 13 coefficients per frame at the spec frame/hop sizes', () => {
    // 400 ms of audio: (400 - 25) / 10 hop = 38 full frames expected.
    const pcm = tone(220, 400);
    const frames = extractMfcc(pcm);
    expect(frames.length).toBe(38);
    for (const f of frames) expect(f.length).toBe(13);
  });

  it('is deterministic for identical input', () => {
    const pcm = tone(440, 200);
    const a = extractMfcc(pcm);
    const b = extractMfcc(pcm);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      for (let k = 0; k < 13; k++) expect(a[i][k]).toBeCloseTo(b[i][k], 10);
    }
  });

  it('returns no frames for audio shorter than one frame', () => {
    expect(extractMfcc(tone(300, 10)).length).toBe(0);
    expect(extractMfcc(new Float32Array(0)).length).toBe(0);
  });

  it('distinguishes different vowels (formant-like tones)', () => {
    // Two different sustained tones should yield clearly different cepstra.
    const a = extractMfcc(tone(300, 300));
    const b = extractMfcc(tone(900, 300));
    const d = a[Math.floor(a.length / 2)].reduce(
      (s, v, k) => s + Math.abs(v - b[Math.floor(b.length / 2)][k]),
      0,
    );
    expect(d).toBeGreaterThan(1);
  });
});

describe('banded DTW', () => {
  it('gives zero distance for identical sequences', () => {
    const seq = [1, 2, 3, 4].map((v) => [v, v * 2]);
    const { distance } = dtwDistance(seq, seq);
    expect(distance).toBeCloseTo(0, 10);
  });

  it('handles slight time stretching via the Sakoe-Chiba band', () => {
    const a = [1, 2, 3, 4, 5].map((v) => [v]);
    const stretched = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5].map((v) => [v]);
    const { distance } = dtwDistance(a, stretched);
    expect(distance).toBeLessThan(0.5);
  });

  it('returns a larger distance for unrelated sequences', () => {
    const a = [1, 2, 3].map((v) => [v]);
    const b = [9, 8, 7].map((v) => [v]);
    const { distance } = dtwDistance(a, b);
    expect(distance).toBeGreaterThan(1);
  });

  it('rejects empty input', () => {
    const { distance } = dtwDistance([], [[1]]);
    expect(distance).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('scoring', () => {
  it('scores identical pronunciations near 100', () => {
    const mfcc = extractMfcc(tone(400, 500));
    const r = scorePronunciation(mfcc, mfcc, 500, 500);
    expect(r.accuracy).toBeGreaterThan(90);
    expect(r.durationPenalty).toBe(1);
  });

  it('scores very different pronunciations low', () => {
    const ref = extractMfcc(tone(300, 500));
    const user = extractMfcc(tone(1200, 500, 0.9));
    const r = scorePronunciation(ref, user, 500, 500);
    expect(r.accuracy).toBeLessThan(60);
  });

  it('penalises audio 40%+ shorter/longer than the reference', () => {
    const mfcc = extractMfcc(tone(400, 300));
    const ok = scorePronunciation(mfcc, mfcc, 1000, 1100); // within tolerance
    const dragged = scorePronunciation(mfcc, mfcc, 1000, 2000); // 100% longer
    const swallowed = scorePronunciation(mfcc, mfcc, 1000, 400); // 60% shorter
    expect(ok.durationPenalty).toBe(1);
    expect(dragged.durationPenalty).toBeLessThan(1);
    expect(swallowed.durationPenalty).toBeLessThan(1);
    expect(dragged.accuracy).toBeLessThan(ok.accuracy);
  });

  it('never returns accuracy above 100 or below 0', () => {
    const mfcc = extractMfcc(tone(400, 200));
    for (const dur of [50, 200, 1000, 5000]) {
      const r = scorePronunciation(mfcc, mfcc, 200, dur);
      expect(r.accuracy).toBeGreaterThanOrEqual(0);
      expect(r.accuracy).toBeLessThanOrEqual(100);
    }
  });
});

describe('ephemeral buffers (privacy contract)', () => {
  it('zeroAndRelease overwrites every sample in place', () => {
    const buf = new Float32Array([0.1, -0.2, 0.3]);
    zeroAndRelease(buf);
    for (const v of buf) expect(v).toBe(0);
    expect(() => zeroAndRelease(null)).not.toThrow();
  });

  it('pcm16ToFloat32 decodes little-endian 16-bit samples', () => {
    const bytes = new Uint8Array([0x00, 0x40, 0x00, 0xc0]); // 16384, -16384
    const pcm = pcm16ToFloat32(bytes);
    expect(pcm.length).toBe(2);
    expect(pcm[0]).toBeCloseTo(0.5, 5);
    expect(pcm[1]).toBeCloseTo(-0.5, 5);
  });

  it('parseWavToPcm extracts the data chunk', () => {
    // Minimal 1-sample PCM16 WAV.
    const wav = new Uint8Array(46);
    const dv = new DataView(wav.buffer);
    dv.setUint32(0, 0x52494646); // 'RIFF'
    dv.setUint32(8, 0x45564157); // 'WAVE'
    dv.setUint32(12, 0x64617461); // 'data'
    dv.setUint32(16, 2, true); // data size
    dv.setInt16(20, 16384, true); // one sample
    const pcm = parseWavToPcm(wav);
    expect(pcm.length).toBe(1);
    expect(pcm[0]).toBeCloseTo(0.5, 5);
  });

  it('pcmDurationMs matches sample count at 16 kHz', () => {
    expect(pcmDurationMs(new Float32Array(16000))).toBe(1000);
    expect(pcmDurationMs(new Float32Array(8000))).toBe(500);
  });
});

describe('PronunciationSession (engine privacy lifecycle)', () => {
  /** In-memory fake recorder — models what an in-memory PCM stream provides. */
  function fakeRecorder(pcm: Float32Array): EphemeralPcmRecorder {
    return {
      async start() {},
      async stop() {
        return pcm;
      },
      abort() {
        pcm.fill(0);
      },
    };
  }

  it('destroys the user PCM buffer after scoring', async () => {
    const pcm = tone(400, 300);
    const ref = extractMfcc(pcm);
    const session = new PronunciationSession(ref, 300);
    await session.begin(fakeRecorder(pcm));
    const result = await session.finish();
    expect(result.accuracy).toBeGreaterThan(90);
    // PRIVACY: the raw voice buffer must be zeroed the moment scoring ends.
    for (const v of pcm) expect(v).toBe(0);
  });

  it('destroy() zeroes live buffers even mid-attempt', async () => {
    const pcm = tone(400, 300);
    const ref = extractMfcc(tone(400, 300));
    const session = new PronunciationSession(ref, 300);
    await session.begin(fakeRecorder(pcm));
    session.destroy();
    expect(session.isDestroyed).toBe(true);
    for (const v of pcm) expect(v).toBe(0);
    await expect(session.finish()).rejects.toThrow();
  });

  it('only score metadata is returned — never audio', async () => {
    const pcm = tone(400, 200);
    const ref = extractMfcc(tone(400, 200));
    const session = new PronunciationSession(ref, 200);
    await session.begin(fakeRecorder(pcm));
    const result = await session.finish();
    expect(Object.keys(result).sort()).toEqual(['accuracy', 'dtwDistance', 'durationMs']);
  });
});