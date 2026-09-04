/**
 * MFCC extraction for the Pronunciation module.
 *
 * Spec: 16 kHz / 16-bit mono PCM in; 25 ms frames (400 samples) with a
 * 10 ms hop (160 samples), pre-emphasis at 0.97, Hamming window, 26 Mel
 * filters over 0-8 kHz, 13 output coefficients per frame (DCT-II).
 *
 * Pure functions only — no I/O anywhere in this file. Raw PCM buffers are
 * consumed and MUST be zeroed by the caller (see ephemeral.ts) right after
 * extraction completes.
 */

export const SAMPLE_RATE = 16000;
const FRAME_LEN = 400; // 25 ms
const HOP_LEN = 160; // 10 ms
const N_MELS = 26;
const N_COEFFS = 13;
const FFT_SIZE = 512; // next power of two >= FRAME_LEN (zero-padded)
const PRE_EMPHASIS = 0.97;
const LOG_FLOOR = 1e-10;

/** In-place iterative radix-2 FFT on split real/imag arrays. Length must be a power of two. */
function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  // Butterfly passes
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const hzToMel = (hz: number): number => 2595 * Math.log10(1 + hz / 700);
const melToHz = (mel: number): number => 700 * (10 ** (mel / 2595) - 1);

interface MelFilter {
  start: number; // first FFT bin of the triangle
  weights: Float64Array;
}

let melBankCache: MelFilter[] | null = null;

/** 26 triangular Mel filters spanning 0-8 kHz over the FFT_SIZE power spectrum. */
function melFilterbank(): MelFilter[] {
  if (melBankCache) return melBankCache;
  const nBins = FFT_SIZE / 2 + 1;
  const melLow = hzToMel(0);
  const melHigh = hzToMel(SAMPLE_RATE / 2);
  // N_MELS + 2 mel points create N_MELS triangles
  const points: number[] = [];
  for (let i = 0; i < N_MELS + 2; i++) {
    const hz = melToHz(melLow + ((melHigh - melLow) * i) / (N_MELS + 1));
    points.push((hz / SAMPLE_RATE) * FFT_SIZE);
  }
  const filters: MelFilter[] = [];
  for (let m = 0; m < N_MELS; m++) {
    const left = points[m];
    const center = points[m + 1];
    const right = points[m + 2];
    const start = Math.max(0, Math.floor(left));
    const end = Math.min(nBins - 1, Math.ceil(right));
    const weights = new Float64Array(Math.max(1, end - start + 1));
    for (let b = start; b <= end; b++) {
      let w = 0;
      if (b >= left && b <= center) w = center === left ? 1 : (b - left) / (center - left);
      else if (b > center && b <= right) w = right === center ? 1 : (right - b) / (right - center);
      weights[b - start] = w;
    }
    filters.push({ start, weights });
  }
  melBankCache = filters;
  return filters;
}

// Precomputed Hamming window for the 25 ms frame.
const HAMMING = (() => {
  const w = new Float64Array(FRAME_LEN);
  for (let i = 0; i < FRAME_LEN; i++) w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (FRAME_LEN - 1));
  return w;
})();

/**
 * Extract the MFCC matrix from mono PCM samples in [-1, 1].
 * Returns N frames x 13 coefficients. PRIVACY: the caller must zero the
 * input buffer immediately after this returns — this function copies
 * nothing it needs past the end of the call.
 */
export function extractMfcc(pcm: Float32Array): Float64Array[] {
  const frames: Float64Array[] = [];
  if (pcm.length < FRAME_LEN) return frames;

  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const bank = melFilterbank();
  const melEnergies = new Float64Array(N_MELS);

  // Pre-emphasis filter y[n] = x[n] - a * x[n-1], computed in place on a
  // scratch view (we never mutate the caller's buffer).
  const emphasized = new Float32Array(pcm.length); // PRIVACY: ephemeral buffer — never persisted to disk
  emphasized[0] = pcm[0];
  for (let i = 1; i < pcm.length; i++) emphasized[i] = pcm[i] - PRE_EMPHASIS * pcm[i - 1];

  for (let offset = 0; offset + FRAME_LEN <= emphasized.length; offset += HOP_LEN) {
    // Window the frame into the FFT scratch (zero-padded to FFT_SIZE).
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < FRAME_LEN; i++) re[i] = emphasized[offset + i] * HAMMING[i];
    fftInPlace(re, im);

    // Power spectrum
    for (let b = 0; b < FFT_SIZE / 2 + 1; b++) re[b] = re[b] * re[b] + im[b] * im[b];

    // Mel filter energies
    for (let m = 0; m < N_MELS; m++) {
      const f = bank[m];
      let sum = 0;
      for (let k = 0; k < f.weights.length; k++) sum += f.weights[k] * re[f.start + k];
      melEnergies[m] = Math.log(Math.max(sum, LOG_FLOOR));
    }

    // DCT-II -> first 13 cepstral coefficients
    const coeffs = new Float64Array(N_COEFFS);
    for (let k = 0; k < N_COEFFS; k++) {
      let sum = 0;
      for (let m = 0; m < N_MELS; m++) sum += melEnergies[m] * Math.cos((Math.PI * k * (m + 0.5)) / N_MELS);
      coeffs[k] = k === 0 ? sum * Math.sqrt(1 / N_MELS) : sum * Math.sqrt(2 / N_MELS);
    }
    frames.push(coeffs);
  }

  // PRIVACY: ephemeral buffer — never persisted to disk. Destroy scratch PCM.
  emphasized.fill(0);

  return frames;
}
