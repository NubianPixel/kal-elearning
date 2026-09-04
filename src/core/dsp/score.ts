/**
 * Pronunciation scoring: banded-DTW distance -> 0-100 accuracy, with a
 * duration penalty that catches dragged or swallowed Setswana vowels.
 * Pure functions, no I/O.
 */

import { dtwDistance } from './dtw';

/** DTW distances above this are treated as maximally wrong. Tuned empirically for 13-dim MFCCs. */
const DISTANCE_CEILING = 60;
/** Duration ratio outside this band (user >40% longer/shorter than reference) incurs a penalty. */
const DURATION_TOLERANCE = 0.4;

export interface PronunciationResult {
  /** 0-100 accuracy score. */
  accuracy: number;
  /** Path-normalized DTW distance (for the DB record — never any audio). */
  dtwDistance: number;
  /** Multiplier applied for speaking much faster/slower than the reference. */
  durationPenalty: number;
}

/**
 * Score a user attempt against the reference.
 * @param refMfcc   reference MFCC frames (raw PCM already destroyed by the caller)
 * @param userMfcc  user MFCC frames (raw PCM already destroyed by the caller)
 * @param refDurationMs reference clip duration
 * @param userDurationMs user attempt duration
 */
export function scorePronunciation(
  refMfcc: Float64Array[] | number[][],
  userMfcc: Float64Array[] | number[][],
  refDurationMs: number,
  userDurationMs: number,
): PronunciationResult {
  const { distance } = dtwDistance(refMfcc, userMfcc);

  // Map the normalized DTW distance onto 0-100: low distance -> 100.
  // Piecewise-linear between 0 (perfect) and DISTANCE_CEILING (floor of 0).
  const base = distance >= DISTANCE_CEILING
    ? 0
    : Math.max(0, Math.min(100, 100 * (1 - distance / DISTANCE_CEILING)));

  // Duration penalty: only outside the ±40% tolerance, scaling up to -50%.
  const ratio = refDurationMs > 0 ? userDurationMs / refDurationMs : 1;
  const overshoot = Math.max(0, Math.abs(ratio - 1) - DURATION_TOLERANCE);
  const durationPenalty = Math.max(0.5, 1 - overshoot);

  return {
    accuracy: Math.round(base * durationPenalty),
    dtwDistance: Number.isFinite(distance) ? Math.round(distance * 1000) / 1000 : Number.MAX_SAFE_INTEGER,
    durationPenalty: Math.round(durationPenalty * 100) / 100,
  };
}
